/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { gerarDocumento } from "@/app/_utils/gerarDocumento";
import { db } from "@/app/_lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// All extractable fields from the roteiro template that aren't in the DB
const EXTRACTABLE_FIELDS = [
  "descricao_fatos",
  "como_acidente",
  "ficou_internado",
  "fez_cirurgia",
  "envolveu_veiculo",
  "tem_bo",
  "tem_sequelas",
  "quais_sequelas",
  "voltou_trabalhar",
  "ficou_afastado",
  "tempo_afastamento",
  "tem_cat",
  "pericia_adm",
  "disponibilidade_pericia",
  "service",
  "profissao",
  "profissao_epoca",
  "forma_contato",
  "redes_sociais",
  "telefone_secundario",
  "senha_inss",
];

async function extractFieldsFromContent(content: string): Promise<Record<string, string>> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `A partir do texto abaixo (análise de documentos de um cliente), extraia os valores para os campos listados.
Retorne APENAS um JSON válido com os campos como chaves e string como valor.
Se um campo não puder ser determinado a partir do texto, use string vazia "".
Responda SOMENTE o JSON puro, sem markdown, sem blocos de código, sem explicação.

CAMPOS PARA EXTRAIR:
${EXTRACTABLE_FIELDS.map((f) => `- ${f}`).join("\n")}

Descrições dos campos:
- descricao_fatos: resumo geral do caso/acidente em linguagem formal
- como_acidente: como ocorreu o acidente (narrativa)
- ficou_internado: sim/não — ficou internado no hospital
- fez_cirurgia: sim/não — realizou cirurgia
- envolveu_veiculo: sim/não e se era próprio ou de terceiros
- tem_bo: sim/não — possui Boletim de Ocorrência
- tem_sequelas: sim/não — possui sequelas
- quais_sequelas: descrição das sequelas
- voltou_trabalhar: sim/não — voltou a trabalhar
- ficou_afastado: sim/não — ficou afastado pelo INSS
- tempo_afastamento: quanto tempo ficou afastado
- tem_cat: sim/não — possui CAT (Comunicação de Acidente de Trabalho)
- pericia_adm: sim/não — necessário marcar perícia administrativa
- disponibilidade_pericia: disponibilidade para perícia na capital
- service: assunto/tipo de serviço (ex: DPVAT, INSS, Seguro Vida)
- profissao: profissão atual do cliente
- profissao_epoca: profissão na época do acidente
- forma_contato: melhor forma de contato
- redes_sociais: redes sociais do cliente
- telefone_secundario: telefone secundário
- senha_inss: senha de acesso ao INSS (se mencionado)

TEXTO DA CONVERSA/ANÁLISE:
${content}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const json = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(json);
  } catch (e) {
    console.error("[DOCX] Erro ao extrair campos via IA:", e);
    return {};
  }
}

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

    if (cardId) {
      let record: any = null;

      if (isProcess) {
        record = await db.process.findUnique({ where: { id: cardId } });
      } else {
        record = await db.user.findUnique({ where: { id: cardId } });
      }

      if (record) {
        dados.name = record.name || "";
        dados.cpf = record.cpf || "";
        dados.rg = record.rg || "";
        dados.email = record.email || "";
        dados.telefone = record.telefone || "";
        dados.nacionalidade = record.nacionalidade || "";
        dados.estado_civil = record.estado_civil || "";
        dados.profissao = record.profissao || "";
        dados.endereco = record.rua || "";
        dados.rua = record.rua || "";
        dados.bairro = record.bairro || "";
        dados.numero = record.numero || "";
        dados.cep = record.cep || "";
        dados.cidade = record.cidade || "";
        dados.estado = record.estado || "";
        dados.data_nascimento = record.data_nasc
          ? new Date(record.data_nasc).toLocaleDateString("pt-BR")
          : "";
        dados.data_acidente = record.data_acidente
          ? new Date(record.data_acidente).toLocaleDateString("pt-BR")
          : "";
        dados.lesoes = record.lesoes || "";
        dados.hospital = record.hospital || "";
        dados.nome_mae = record.nome_mae || "";
      }
    }

    // Extract template fields from AI conversation content in parallel with nothing else
    const extracted = await extractFieldsFromContent(content);

    // Merge: DB data takes priority, AI fills the rest
    for (const [key, value] of Object.entries(extracted)) {
      if (value && !dados[key]) {
        dados[key] = String(value);
      }
    }

    const buffer = await gerarDocumento({
      template,
      categoria: "roteiros",
      dados,
    });

    const safeFilename = filename
      ? filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".docx"
      : `roteiro_${Date.now()}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
