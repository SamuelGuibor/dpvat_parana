/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { db } from "./prisma";
import { fetchAutomationsByLabel, AutomationCondition, AutomationAction } from "./db/automations";
import { sendSystemWhatsApp } from "./whatsapp/outbound";
import { createLog } from "./log";

// Limite de movimentos encadeados por ação "move" (coluna A move pra B, que
// move pra C...). Evita loop infinito entre automações que se apontam.
const MAX_MOVE_DEPTH = 3;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

type CardData = Record<string, string | boolean | null | undefined | Date>;

function getVars(card: CardData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(card)) {
    if (v === null || v === undefined) {
      out[k] = "";
    } else if (v instanceof Date) {
      out[k] = v.toLocaleDateString("pt-BR");
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

function evalConditions(
  conds: AutomationCondition[],
  logic: string,
  card: CardData,
  tagNames: string[]
): boolean {
  if (conds.length === 0) return true;
  const normalizedTags = tagNames.map((t) => t.toLowerCase().trim());
  const results = conds.map((c) => {
    const cv = c.value.toLowerCase().trim();
    // Campo especial "tags": compara contra a lista de tags do card.
    if (c.field === "tags") {
      switch (c.operator) {
        case "hasTag":
        case "equals":
        case "contains":    return normalizedTags.includes(cv);
        case "notHasTag":
        case "notEquals":   return !normalizedTags.includes(cv);
        case "isEmpty":     return normalizedTags.length === 0;
        case "isNotEmpty":  return normalizedTags.length > 0;
        default:            return false;
      }
    }
    const fv = String(card[c.field] ?? "").toLowerCase().trim();
    switch (c.operator) {
      case "equals":      return fv === cv;
      case "notEquals":   return fv !== cv;
      case "contains":    return fv.includes(cv);
      case "startsWith":  return fv.startsWith(cv);
      case "endsWith":    return fv.endsWith(cv);
      case "isEmpty":     return !fv;
      case "isNotEmpty":  return !!fv;
      default:            return false;
    }
  });
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\[\[(\w+)\]\]/g, (_, k) => vars[k] ?? "");
}

async function fetchS3Buffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function processDocx(templateKey: string, vars: Record<string, string>): Promise<Buffer> {
  const raw = await fetchS3Buffer(templateKey);
  const zip = new PizZip(raw);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
  });
  doc.render(vars);
  return doc.getZip().generate({ type: "nodebuffer" });
}

export async function runAutomations({
  cardId,
  isProcess,
  newLabelId,
  authorId,
  authorName,
  depth = 0,
}: {
  cardId: string;
  isProcess: boolean;
  newLabelId: string;
  authorId: string;
  authorName: string;
  // Profundidade do encadeamento de ações "move" (interno).
  depth?: number;
}) {
  try {
    const automations = await fetchAutomationsByLabel(newLabelId);
    if (!automations.length) return;

    const card = isProcess
      ? await db.process.findUnique({ where: { id: cardId } })
      : await db.user.findUnique({ where: { id: cardId } });

    if (!card) return;

    // Tags do card: buscadas uma vez, só se alguma automação da coluna as usa.
    const usesTags = automations.some((a) =>
      ((a.conditions as unknown as AutomationCondition[]) ?? []).some((c) => c.field === "tags")
    );
    const tagNames = usesTags
      ? (
          await db.cardTag.findMany({
            where: isProcess
              ? { processes: { some: { id: cardId } } }
              : { users: { some: { id: cardId } } },
            select: { name: true },
          })
        ).map((t) => t.name)
      : [];

    const cardData = card as unknown as CardData;
    const vars = getVars(cardData);
    const safeName = String(cardData.name ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/ +/g, "_");

    for (const auto of automations) {
      if (auto.cardType === "user" && isProcess) continue;
      if (auto.cardType === "process" && !isProcess) continue;

      const conds = (auto.conditions as unknown as AutomationCondition[]) ?? [];
      if (!evalConditions(conds, auto.conditionLogic, cardData, tagNames)) continue;

      const actions = (auto.actions as unknown as AutomationAction[]) ?? [];

      for (const action of actions) {
        if (action.type === "comment" && action.templateText) {
          await db.comment.create({
            data: {
              text: fillTemplate(action.templateText, vars),
              authorId,
              authorName: `🤖 Bot (Automação)`,
              targetName: String(cardData.name ?? ""),
              userId: isProcess ? null : cardId,
              processId: isProcess ? cardId : null,
            },
          });
        }

        if (action.type === "whatsapp" && action.waText) {
          const phone = String(cardData.telefone ?? cardData.telefone_secundario ?? "").trim();
          if (!phone) {
            console.warn(`[AUTOMATION] Card ${cardId} sem telefone — ação de WhatsApp pulada (auto ${auto.id}).`);
          } else {
            const result = await sendSystemWhatsApp({
              phone,
              clientName: String(cardData.name ?? "") || null,
              text: fillTemplate(action.waText, vars),
              templateName: action.waTemplateName || null,
              templateVars: (action.waTemplateVars ?? []).map((v) => fillTemplate(v, vars)),
              authorId,
              authorName: `🤖 Bot (Automação: ${auto.name})`,
              source: "automation",
            });
            if (!result.sent) {
              console.warn(`[AUTOMATION] WhatsApp não enviado (auto ${auto.id}): ${result.reason}`);
            }
          }
        }

        // Ação TERMINAL: move o card pra outra coluna e dispara as automações
        // dela. Nada mais roda depois (nem as demais ações desta automação,
        // nem outras automações da coluna antiga) — o card já não está aqui.
        if (action.type === "move" && action.moveLabelId) {
          if (depth >= MAX_MOVE_DEPTH) {
            console.warn(`[AUTOMATION] Limite de movimentos encadeados atingido (auto ${auto.id}) — ação de mover ignorada.`);
            continue;
          }
          if (action.moveLabelId === newLabelId) continue; // já está na coluna de destino

          const targetLabel = await db.label.findUnique({ where: { id: action.moveLabelId } });
          if (!targetLabel) {
            console.warn(`[AUTOMATION] Coluna de destino não existe mais (auto ${auto.id}) — ação de mover ignorada.`);
            continue;
          }

          const moveData = {
            labelId: targetLabel.id,
            role: targetLabel.name,
            statusStartedAt: new Date(),
          };
          if (isProcess) {
            await db.process.update({ where: { id: cardId }, data: moveData });
          } else {
            await db.user.update({ where: { id: cardId }, data: moveData });
          }

          await createLog({
            action: "move",
            message: `moveu de "${String(cardData.role ?? "?")}" para "${targetLabel.name}" (automação: ${auto.name})`,
            authorId,
            authorName: `🤖 Bot (Automação)`,
            userId: isProcess ? null : cardId,
            processId: isProcess ? cardId : null,
            metadata: {
              from: cardData.role ?? null,
              to: targetLabel.name,
              cardName: cardData.name ?? null,
              service: cardData.service ?? null,
              automationId: auto.id,
              automationName: auto.name,
            },
          });

          await runAutomations({
            cardId,
            isProcess,
            newLabelId: targetLabel.id,
            authorId,
            authorName,
            depth: depth + 1,
          });
          return;
        }

        if (action.type === "file" && action.templateFileKey) {
          try {
            const buf = await processDocx(action.templateFileKey, vars);
            const baseName = (action.templateFileName ?? "arquivo").replace(/\.docx$/i, "");
            const outName = `${baseName}_${safeName}.docx`;
            const key = `uploads/${isProcess ? "process" : "user"}_${cardId}/${Date.now()}-${outName}`;

            await s3.send(
              new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: key,
                Body: buf,
                ContentType:
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              })
            );

            await db.document.create({
              data: {
                userId: isProcess ? String((card as any).userId) : cardId,
                processId: isProcess ? cardId : null,
                key,
                name: outName,
              },
            });
          } catch (err) {
            console.error(`[AUTOMATION] Erro ao processar arquivo (auto ${auto.id}):`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error("[AUTOMATION] Erro geral:", err);
  }
}
