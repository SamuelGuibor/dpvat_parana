/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { db } from "./prisma";
import { inferCategory } from "./document-categories";
import {
  fetchAutomationsByLabel,
  fetchTimeConditionAutomations,
  AutomationCondition,
  AutomationAction,
} from "./db/automations";
import { sendSystemWhatsApp } from "./whatsapp/outbound";
import { createLog } from "./log";
import { runAiAudit } from "./ai-audit";
import { appendSheetRow } from "./google-sheets";
import { brDateVars } from "../utils/date-br";
import {
  type CardData, getVars, evalConditions, fireCycleKey,
} from "./automation-conditions";

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

type ActionCtx = {
  auto: { id: string; name: string };
  cardId: string;
  isProcess: boolean;
  authorId: string;
  authorName: string;
  cardData: CardData;
  vars: Record<string, string>;
  safeName: string;
  // Coluna em que o card está no momento (usada pra ação "move" não apontar
  // pra ela mesma, e pra saber a partir de onde encadear).
  currentLabelId: string;
  // Profundidade do encadeamento de ações "move" (interno).
  depth: number;
};

// Executa UMA ação de UMA automação para um card. Retorna "moved" quando a
// ação foi um "move" bem-sucedido — o chamador deve parar o loop de ações
// (e o de automações da coluna) nesse caso, pois o card já não está lá.
async function executeAction(action: AutomationAction, ctx: ActionCtx): Promise<"moved" | void> {
  const { auto, cardId, isProcess, authorId, authorName, cardData, vars, safeName, currentLabelId, depth } = ctx;

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
    // Falha de envio agora vira LOG DO CARD, não só console.warn: o motivo
    // ("sem opt-in", "template de outra linha", "intervalo mínimo") é a única
    // pista de por que o cliente não recebeu o aviso, e ninguém lê o console.
    const logSkip = (reason: string) =>
      createLog({
        action: "wa_text",
        message: `automação "${auto.name}": WhatsApp NÃO enviado — ${reason}`,
        authorId,
        authorName: `🤖 Bot (Automação)`,
        userId: isProcess ? null : cardId,
        processId: isProcess ? cardId : null,
        metadata: { automationId: auto.id, automationName: auto.name, skipped: true, reason },
      }).catch(() => { /* log nunca derruba a automação */ });

    if (!phone) {
      console.warn(`[AUTOMATION] Card ${cardId} sem telefone — ação de WhatsApp pulada (auto ${auto.id}).`);
      await logSkip("o card não tem telefone cadastrado");
    } else {
      const result = await sendSystemWhatsApp({
        phone,
        clientName: String(cardData.name ?? "") || null,
        text: fillTemplate(action.waText, vars),
        templateName: action.waTemplateName || null,
        templateVars: (action.waTemplateVars ?? []).map((v) => fillTemplate(v, vars)),
        numberId: action.waNumberId || null,
        authorId,
        authorName: `🤖 Bot (Automação: ${auto.name})`,
        source: "automation",
      });
      if (!result.sent) {
        console.warn(`[AUTOMATION] WhatsApp não enviado (auto ${auto.id}): ${result.reason}`);
        await logSkip(result.reason ?? "motivo não informado");
      }
    }
  }

  // Registro em planilha do Google Sheets (ex.: base externa do Caique).
  if (action.type === "sheets" && action.sheetsSpreadsheetId) {
    try {
      const columns = (action.sheetsColumns ?? []).filter((c) => typeof c === "string");
      // Sem colunas configuradas: linha padrão com os dados principais.
      const row = columns.length
        ? columns.map((c) => fillTemplate(c, vars))
        : [
            new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            vars.name ?? "",
            vars.cpf ?? "",
            vars.telefone ?? "",
            vars.service ?? "",
            String(cardData.role ?? ""),
          ];
      await appendSheetRow(action.sheetsSpreadsheetId, action.sheetsTab, row);
      await createLog({
        action: "sheets_export",
        message: `registrou o card na planilha do Google (automação: ${auto.name})`,
        authorId,
        authorName: `🤖 Bot (Automação)`,
        userId: isProcess ? null : cardId,
        processId: isProcess ? cardId : null,
        metadata: { automationId: auto.id, automationName: auto.name, tab: action.sheetsTab ?? null },
      });
    } catch (err) {
      console.error(`[AUTOMATION] Erro ao registrar na planilha (auto ${auto.id}):`, err);
    }
  }

  // Auditoria de documentos por IA (Claude). Roda inline (await) para
  // garantir execução antes do fim da request; nunca lança.
  if (action.type === "ai_audit" && action.auditType) {
    await runAiAudit({
      cardId,
      isProcess,
      auditType: action.auditType,
      authorId,
      authorName: `🤖 Bot (Automação: ${auto.name})`,
      trigger: "automation",
    });
  }

  // Adiciona uma tag ao card. O connect é idempotente (tag já presente
  // não duplica); tag apagada é ignorada com aviso.
  if (action.type === "add_tag" && action.tagId) {
    try {
      const tag = await db.cardTag.findUnique({ where: { id: action.tagId } });
      if (!tag) {
        console.warn(`[AUTOMATION] Tag não existe mais (auto ${auto.id}) — ação de tag ignorada.`);
      } else {
        const tagOp = { cardTags: { connect: { id: tag.id } } };
        if (isProcess) {
          await db.process.update({ where: { id: cardId }, data: tagOp });
        } else {
          await db.user.update({ where: { id: cardId }, data: tagOp });
        }
        await createLog({
          action: "tag_add",
          message: `adicionou a tag "${tag.name}" (automação: ${auto.name})`,
          authorId,
          authorName: `🤖 Bot (Automação)`,
          userId: isProcess ? null : cardId,
          processId: isProcess ? cardId : null,
          metadata: { automationId: auto.id, automationName: auto.name, tagId: tag.id, tagName: tag.name },
        });
      }
    } catch (err) {
      console.error(`[AUTOMATION] Erro ao adicionar tag (auto ${auto.id}):`, err);
    }
  }

  // Ação TERMINAL: move o card pra outra coluna e dispara as automações
  // dela. Nada mais roda depois (nem as demais ações desta automação,
  // nem outras automações da coluna antiga) — o card já não está aqui.
  if (action.type === "move" && action.moveLabelId) {
    if (depth >= MAX_MOVE_DEPTH) {
      console.warn(`[AUTOMATION] Limite de movimentos encadeados atingido (auto ${auto.id}) — ação de mover ignorada.`);
      return;
    }
    if (action.moveLabelId === currentLabelId) return; // já está na coluna de destino

    const targetLabel = await db.label.findUnique({ where: { id: action.moveLabelId } });
    if (!targetLabel) {
      console.warn(`[AUTOMATION] Coluna de destino não existe mais (auto ${auto.id}) — ação de mover ignorada.`);
      return;
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
    return "moved";
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
          userId: isProcess ? String((cardData as any).userId) : cardId,
          processId: isProcess ? cardId : null,
          key,
          name: outName,
          category: inferCategory(outName),
        },
      });
    } catch (err) {
      console.error(`[AUTOMATION] Erro ao processar arquivo (auto ${auto.id}):`, err);
    }
  }
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
    const vars = { ...getVars(cardData), ...brDateVars() };
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
      const ctx: ActionCtx = {
        auto, cardId, isProcess, authorId, authorName, cardData, vars, safeName,
        currentLabelId: newLabelId, depth,
      };

      for (const action of actions) {
        const result = await executeAction(action, ctx);
        if (result === "moved") return;
      }
    }
  } catch (err) {
    console.error("[AUTOMATION] Erro geral:", err);
  }
}

// Cron de verificação periódica: automações com condições de tempo
// (__time_in_column__ / __due_date__) não nascem de um movimento de card,
// então precisam ser reavaliadas em intervalos — aqui a cada card que
// atualmente está na coluna-gatilho da automação. Dispara no máximo uma vez
// por card por automação (marcado em AutomationFire).
export async function runTimeBasedAutomations() {
  const summary = { checked: 0, fired: 0 };
  try {
    const automations = await fetchTimeConditionAutomations();
    if (!automations.length) return summary;

    for (const auto of automations) {
      const conds = (auto.conditions as unknown as AutomationCondition[]) ?? [];
      const actions = (auto.actions as unknown as AutomationAction[]) ?? [];
      if (!actions.length) continue;

      const wantsProcess = auto.cardType !== "user";
      const wantsUser = auto.cardType !== "process";

      // Card ARQUIVADO mantém o labelId (pra voltar à coluna certa quando for
      // desarquivado), então sem este filtro a varredura de prazo continuava
      // mandando aviso de perícia/benefício para cliente já pago, desistente
      // ou descartado. GHOST é o card-fantasma interno, nunca um cliente.
      const [processCards, userCards] = await Promise.all([
        wantsProcess
          ? db.process.findMany({ where: { labelId: auto.triggerLabelId, archiveStatus: null } })
          : Promise.resolve([]),
        wantsUser
          ? db.user.findMany({ where: { labelId: auto.triggerLabelId, archiveStatus: null, role: { not: "GHOST" } } })
          : Promise.resolve([]),
      ]);

      const usesTags = conds.some((c) => c.field === "tags");

      for (const [cards, isProcess] of [[processCards, true], [userCards, false]] as const) {
        for (const card of cards) {
          summary.checked++;
          const cardId = (card as any).id as string;
          const cardData = card as unknown as CardData;

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

          if (!evalConditions(conds, auto.conditionLogic, cardData, tagNames)) continue;

          // Já disparou pra este card nesta automação NESTE CICLO — não repete.
          // O ciclo é a data de vencimento considerada (ou a entrada na coluna):
          // prorrogou o benefício / remarcou a perícia → ciclo novo → avisa de novo.
          const cycleKey = fireCycleKey(conds, cardData);
          const already = await db.automationFire.findUnique({
            where: { automationId_cardId_cycleKey: { automationId: auto.id, cardId, cycleKey } },
          }).catch(() => null);
          if (already) continue;

          try {
            await db.automationFire.create({ data: { automationId: auto.id, cardId, cycleKey } });
          } catch {
            continue; // corrida entre execuções do cron — outra já marcou
          }

          const vars = { ...getVars(cardData), ...brDateVars() };
          const safeName = String(cardData.name ?? "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim()
            .replace(/ +/g, "_");
          const ctx: ActionCtx = {
            auto, cardId, isProcess,
            authorId: "system",
            authorName: "Sistema (verificação de prazo)",
            cardData, vars, safeName,
            currentLabelId: auto.triggerLabelId,
            depth: 0,
          };

          for (const action of actions) {
            const result = await executeAction(action, ctx);
            if (result === "moved") break;
          }
          summary.fired++;
        }
      }
    }
  } catch (err) {
    console.error("[AUTOMATION] Erro no cron de tempo:", err);
  }
  return summary;
}
