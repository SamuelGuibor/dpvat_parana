/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { gerarDocumento } from "@/app/_utils/gerarDocumento";
import { db } from "@/app/_lib/prisma";

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

/**
 * Parse the chat response directly using regex.
 * Handles formats like:
 *   1 - <<name>>: VALUE
 *   1 - <<name>> VALUE
 *   <<name>>: VALUE
 *   <<name>> VALUE
 * Also handles multi-line values (e.g. quais_sequelas, outros_afastamentos)
 */
function parseFieldsFromChat(content: string): Record<string, string> {
  const fields: Record<string, string> = {};

  // Match all <<field>> patterns and capture their values
  // Regex: optional number prefix, then <<field_name>>, then optional colon/space, then value
  const lines = content.split("\n");
  let currentField: string | null = null;
  let currentValue: string[] = [];

  for (const line of lines) {
    // Check if this line starts a new field: "N - <<field>>: value" or "<<field>>: value"
    const fieldMatch = line.match(/^[\d.]*\s*-?\s*<<(\w+)>>[\s:]*(.*)$/);

    if (fieldMatch) {
      // Save previous field if any
      if (currentField) {
        fields[currentField] = currentValue.join("\n").trim();
      }
      currentField = fieldMatch[1];
      currentValue = [fieldMatch[2].trim()];
    } else if (currentField) {
      // Check if this is a continuation line (not a new numbered item)
      const newItemMatch = line.match(/^\d+[\d.]*\s*-\s/);
      if (newItemMatch && !line.includes("<<")) {
        // This is a new numbered item without a field tag — probably just text
        // Save current and reset
        fields[currentField] = currentValue.join("\n").trim();
        currentField = null;
        currentValue = [];
      } else if (line.trim()) {
        // Continuation of multi-line value
        currentValue.push(line.trim());
      }
    }
  }

  // Save last field
  if (currentField) {
    fields[currentField] = currentValue.join("\n").trim();
  }

  // Special: capture "28 - Outros afastamentos:" which has no <<>> tag
  const outrosMatch = content.match(/28\s*-\s*(?:Outros afastamentos|<<outros_afastamentos>>)[\s:]*\n([\s\S]*?)(?=\n\d+\s*-\s|\n*$)/i);
  if (outrosMatch && outrosMatch[1].trim()) {
    const val = outrosMatch[1].trim();
    // Only override if the regex parser didn't get a real value
    if (!fields.outros_afastamentos || fields.outros_afastamentos === "Nao apurado" || fields.outros_afastamentos === "Não apurado") {
      fields.outros_afastamentos = val;
    }
  }

  return fields;
}

function isEmptyValue(v: string | undefined | null): boolean {
  const t = (v || "").trim();
  return !t || t === "Nao apurado" || t === "Não apurado";
}

/**
 * Safety net: ask the AI microservice to extract fields as structured JSON.
 * The regex parser (parseFieldsFromChat) is fast but literal — it misses
 * fields when the chat response drifts from the expected format. This fills
 * those gaps. Returns {} on any failure so the regex result is never lost.
 */
async function extractFieldsViaAI(content: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${CONVERTER_URL}/ai/extract-fields`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === "object" ? data : {};
  } catch (err) {
    console.warn("[DOCX] extract-fields (rede de seguranca) falhou:", err);
    return {};
  }
}

// Campos onde a extração estruturada da IA costuma ser mais confiável que o
// regex (endereço dividido em partes e valores multi-linha). Nesses, a IA
// sobrescreve o regex mesmo quando o regex já trouxe algo.
const AI_PREFERRED_FIELDS = new Set([
  "rua", "numero", "bairro", "cidade", "estado", "cep",
  "quais_sequelas", "outros_afastamentos", "tempo_afastamento", "descricao_fatos",
]);

export async function POST(request: Request) {
  try {
    const { content, titulo, filename, template, cardId, isProcess } =
      await request.json();

    if (!content || !template) {
      return NextResponse.json(
        { error: "Conteúdo e template são obrigatórios" },
        { status: 400 }
      );
    }

    const dados: Record<string, string> = {
      conteudo: content,
      titulo: titulo || "Roteiro Processual",
      data: new Date().toLocaleDateString("pt-BR"),
    };

    // Step 1: Extract fields from chat response (regex, instant, no AI call)
    const chatFields = parseFieldsFromChat(content);
    console.log("[DOCX] Campos extraidos do chat:", Object.keys(chatFields).length, chatFields);

    // Step 2: Apply all chat fields first (these are the most complete)
    for (const [key, value] of Object.entries(chatFields)) {
      if (value) {
        dados[key] = value;
      }
    }

    // Step 2.5: Safety net — structured extraction via AI. Fills fields the
    // regex missed, and overrides the regex on fields where the AI is more
    // reliable (address parts, multi-line values).
    const aiFields = await extractFieldsViaAI(content);
    console.log("[DOCX] Campos extraidos pela IA (rede de seguranca):", Object.keys(aiFields).length);
    for (const [key, aiValue] of Object.entries(aiFields)) {
      if (isEmptyValue(aiValue)) continue;
      const v = aiValue.trim();
      if (isEmptyValue(dados[key])) {
        dados[key] = v; // fills a gap the regex left
      } else if (AI_PREFERRED_FIELDS.has(key)) {
        dados[key] = v; // AI wins on the fields the regex tends to get wrong
      }
    }


    if (cardId) {
      let record: any = null;

      if (isProcess) {
        record = await db.process.findUnique({ where: { id: cardId } });
      } else {
        record = await db.user.findUnique({ where: { id: cardId } });
      }

      if (record) {
        const dbMap: Record<string, string> = {
          name: record.name || "",
          cpf: record.cpf || "",
          rg: record.rg || "",
          email: record.email || "",
          telefone: record.telefone || "",
          nacionalidade: record.nacionalidade || "",
          estado_civil: record.estado_civil || "",
          profissao: record.profissao || "",
          endereco: record.rua || "",
          rua: record.rua || "",
          bairro: record.bairro || "",
          numero: record.numero || "",
          cep: record.cep || "",
          cidade: record.cidade || "",
          estado: record.estado || "",
          data_nascimento: record.data_nasc || "",
          data_acidente: record.data_acidente || "",
          lesoes: record.lesoes || "",
          hospital: record.hospital || "",
          nome_mae: record.nome_mae || "",
          status: record.service || "",
          senha_inss: record.senha_inss || "",
        };

        // Campos que o escritório tem com certeza no card → banco manda.
        const DB_AUTHORITATIVE = new Set([
          "name", "cpf", "rg", "email", "telefone",
          "endereco", "rua", "numero", "bairro", "cidade", "estado", "cep",
          "estado_civil", "nome_mae", "data_nascimento", "nacionalidade",
          "senha_inss", "profissao", "status", "data_acidente", "hospital",
        ]);

        for (const [key, dbVal] of Object.entries(dbMap)) {
          const v = dbVal.trim();
          if (!v) continue; // banco vazio → não afirma nada; mantém a extração
          if (DB_AUTHORITATIVE.has(key)) {
            dados[key] = v; // certeza do banco: sobrescreve a IA
          } else if (!(dados[key] || "").trim()) {
            dados[key] = v; // demais: banco só preenche lacuna
          }
        }
      }
    }

    // Step 4: Guarantee NO field is undefined/empty in the template
    const ALL_TEMPLATE_FIELDS = [
      "name", "cpf", "rg", "email", "telefone", "telefone_secundario",
      "estado_civil", "nome_mae", "data_nascimento", "nacionalidade",
      "forma_contato", "redes_sociais", "senha_inss", "status",
      "endereco", "rua", "bairro", "cidade", "estado", "numero", "cep",
      "profissao", "profissao_epoca", "service",
      "data_acidente", "como_acidente", "descricao_fatos",
      "ficou_internado", "fez_cirurgia", "envolveu_veiculo", "tem_bo",
      "lesoes", "hospital",
      "tem_sequelas", "quais_sequelas",
      "voltou_trabalhar", "ficou_afastado", "tempo_afastamento", "tem_cat",
      "pericia_adm", "disponibilidade_pericia",
      "outros_afastamentos",
    ];

    for (const field of ALL_TEMPLATE_FIELDS) {
      if (!dados[field] || dados[field].trim() === "") {
        dados[field] = "Não apurado";
      }
    }

    console.log("[DOCX] Dados finais para template:", JSON.stringify(dados, null, 2));

    const docxBuffer = await gerarDocumento({
      template,
      categoria: "roteiros",
      dados,
    });

    // Convert DOCX → PDF via microservice
    const convertRes = await fetch(`${CONVERTER_URL}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
      },
      body: Buffer.from(docxBuffer),
    });

    if (!convertRes.ok) {
      throw new Error("Erro ao converter DOCX para PDF");
    }

    const pdfBuffer = await convertRes.arrayBuffer();

    const safeFilename = filename
      ? filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf"
      : `roteiro_${Date.now()}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("[DOCX] Erro:", error);

    return NextResponse.json(
      { error: error.message || "Erro ao gerar DOCX" },
      { status: 500 }
    );
  }
}
