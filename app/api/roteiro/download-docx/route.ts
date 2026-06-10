/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { gerarDocumento } from "@/app/_utils/gerarDocumento";
import { db } from "@/app/_lib/prisma";

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

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

    // Fetch DB data (fast)
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

    // Extract fields via microservice (no timeout limit)
    try {
      const extractRes = await fetch(`${CONVERTER_URL}/ai/extract-fields`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
        },
        body: JSON.stringify({ content }),
      });

      if (extractRes.ok) {
        const extracted = await extractRes.json();
        // Merge: AI fills anything the DB didn't provide or left empty
        for (const [key, value] of Object.entries(extracted)) {
          const aiVal = String(value || "").trim();
          const dbVal = (dados[key] || "").trim();
          // AI preenche se: DB não tem o campo, ou DB tem mas está vazio
          if (aiVal && !dbVal) {
            dados[key] = aiVal;
          }
        }
      }
    } catch (extractErr) {
      console.warn("[DOCX] AI extraction failed, continuing with DB data only:", extractErr);
    }

    // Garantir que NENHUM campo do template fique undefined
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
