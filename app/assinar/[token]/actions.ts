"use server";

import { headers } from "next/headers";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { rateLimit } from "@/app/_shared/lib/rate-limit";
import { loadByToken } from "@/app/_shared/lib/signature/tokens";
import { sendOtp, verifyOtp } from "@/app/_shared/lib/signature/otp";
import { stampSignedPdf, sha256, assertSignaturePng } from "@/app/_shared/lib/signature/pdf";
import { finalizeSignature, markViewed, requestHumanHelp } from "@/app/_shared/lib/signature/core";

// Ações da página pública de assinatura. O TOKEN é a credencial — não há
// sessão aqui. Por isso: rate limit por token+IP em tudo, nenhuma ação aceita
// id de banco vindo do cliente, e a trilha de auditoria é escrita no servidor
// (o navegador não decide o que fica registrado).

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface AuditEvent {
  at: string;
  passo: string;
  detalhe?: string;
  ip?: string;
  ua?: string;
}

async function requestInfo(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconhecido";
  return { ip, ua: h.get("user-agent") ?? "desconhecido" };
}

/** Acrescenta um evento na trilha, sem nunca sobrescrever o que já existe. */
async function pushAudit(requestId: string, evento: Omit<AuditEvent, "at">): Promise<void> {
  const atual = await db.signatureRequest.findUnique({
    where: { id: requestId },
    select: { audit: true },
  });
  const trilha = Array.isArray(atual?.audit) ? (atual!.audit as unknown as AuditEvent[]) : [];
  trilha.push({ at: new Date().toISOString(), ...evento });
  await db.signatureRequest.update({
    where: { id: requestId },
    data: { audit: trilha.slice(-60) as unknown as Prisma.InputJsonValue },
  });
}

async function guard(token: string, acao: string, max = 20) {
  const { ip, ua } = await requestInfo();
  if (!rateLimit(`sign:${acao}:${token}:${ip}`, max, 10 * 60_000)) {
    return { erro: "Muitas tentativas seguidas. Espere um minutinho e tente de novo." as const };
  }
  const found = await loadByToken(token);
  if (!found.ok) {
    return {
      erro:
        found.reason === "expirado"
          ? ("Esse link venceu. Já avisamos a equipe — alguém vai te chamar no WhatsApp." as const)
          : ("Link inválido. Chame a gente no WhatsApp que a gente resolve." as const),
    };
  }
  return { request: found.request, ip, ua };
}

// ---------------------------------------------------------------------------

/** Passo 1: registra a abertura do link (e marca "visualizado" no ciclo). */
export async function registrarAbertura(token: string, tela: { largura: number; altura: number }) {
  const g = await guard(token, "abertura", 40);
  if ("erro" in g) return { ok: false as const, erro: g.erro };

  await markViewed(g.request.id);
  await pushAudit(g.request.id, {
    passo: "abriu_o_link",
    detalhe: `tela ${tela.largura}x${tela.altura}`,
    ip: g.ip,
    ua: g.ua,
  });
  return { ok: true as const };
}

/** Passos intermediários (leu o documento, escolheu o modo de assinar...). */
export async function registrarPasso(token: string, passo: string, detalhe?: string) {
  const g = await guard(token, "passo", 60);
  if ("erro" in g) return { ok: false as const, erro: g.erro };
  await pushAudit(g.request.id, { passo, detalhe, ip: g.ip });
  return { ok: true as const };
}

/** Passo 5: manda o código de 6 dígitos no WhatsApp do cliente. */
export async function enviarCodigo(token: string) {
  const g = await guard(token, "otp", 8);
  if ("erro" in g) return { ok: false as const, erro: g.erro };

  const res = await sendOtp(g.request.id);
  if (!res.ok) return { ok: false as const, erro: res.error };

  await pushAudit(g.request.id, { passo: "codigo_enviado", ip: g.ip });
  return { ok: true as const, devCode: res.devCode };
}

/** Cliente não consegue assinar → atendente assume, sem tratar como erro. */
export async function pedirAjuda(token: string, motivo: string) {
  const g = await guard(token, "ajuda", 5);
  if ("erro" in g) return { ok: false as const, erro: g.erro };

  await pushAudit(g.request.id, { passo: "pediu_ajuda", detalhe: motivo.slice(0, 120), ip: g.ip });
  await requestHumanHelp(g.request.id, motivo.slice(0, 120));
  return { ok: true as const };
}

interface AssinarInput {
  codigo: string;
  /** PNG em base64 (data URL sem o prefixo) vindo do canvas. */
  assinaturaPng: string;
  modo: "desenho" | "digitado";
  aceite: string;
}

/**
 * Passo final: confere o código, carimba o PDF, guarda tudo e devolve a
 * conversa pra equipe. Qualquer erro aqui é devolvido em português — a página
 * nunca mostra stack trace pro cliente.
 */
export async function assinar(token: string, input: AssinarInput) {
  const g = await guard(token, "assinar", 10);
  if ("erro" in g) return { ok: false as const, erro: g.erro };
  const request = g.request;

  if (["assinado", "validado"].includes(request.status)) {
    return { ok: true as const, jaAssinado: true };
  }
  if (!request.pdfKey || !request.documentHash) {
    return { ok: false as const, erro: "O documento ainda está sendo preparado. Tente de novo em instantes." };
  }

  const otp = await verifyOtp(request.id, input.codigo);
  if (!otp.ok) {
    if (otp.bloqueado) {
      await pushAudit(request.id, { passo: "codigo_bloqueado", ip: g.ip });
      await requestHumanHelp(request.id, "errou o código de verificação 5 vezes");
    }
    return { ok: false as const, erro: otp.error, bloqueado: otp.bloqueado };
  }

  try {
    const assinaturaPng = Buffer.from(input.assinaturaPng, "base64");
    assertSignaturePng(assinaturaPng);

    // PDF original do S3 (nunca confiamos em nada que venha do navegador).
    const obj = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: request.pdfKey,
    }));
    const original = Buffer.from(await obj.Body!.transformToByteArray());
    if (sha256(original) !== request.documentHash) {
      throw new Error("hash do documento não confere com o que foi apresentado");
    }

    const signedAt = new Date();
    const fields = (request.extracted ?? {}) as Record<string, { value?: string }>;
    const nome = fields.name?.value || request.contact.name || "Cliente";
    const cpf = fields.cpf?.value || "—";

    const trilha = Array.isArray(request.audit) ? (request.audit as unknown as AuditEvent[]) : [];
    const primeiro = trilha.find((e) => e.passo === "abriu_o_link");

    const assinaturaKey = `whatsapp/${request.contactId}/assinatura-${Date.now()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: assinaturaKey,
      Body: assinaturaPng,
      ContentType: "image/png",
    }));

    const assinado = await stampSignedPdf({
      pdf: original,
      signaturePng: assinaturaPng,
      signerName: nome,
      cpf,
      token: request.token,
      documentHash: request.documentHash,
      signedAt,
      auditLines: [
        { label: "Documento gerado em", value: request.sentAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—" },
        { label: "Link aberto em", value: primeiro ? new Date(primeiro.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—" },
        { label: "Assinado em", value: signedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " (Brasília)" },
        { label: "IP do signatário", value: g.ip },
        { label: "Dispositivo", value: g.ua.slice(0, 100) },
        { label: "Telefone verificado por código", value: `+${request.contact.phone}` },
        { label: "Forma da assinatura", value: input.modo === "desenho" ? "desenhada na tela" : "nome digitado pelo signatário" },
        { label: "Aceite registrado", value: input.aceite.slice(0, 160) },
        { label: "Identificador do ciclo", value: request.id },
      ],
    });

    const signedPdfKey = `whatsapp/${request.contactId}/contrato-assinado-${Date.now()}.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: signedPdfKey,
      Body: assinado,
      ContentType: "application/pdf",
    }));

    await db.signatureRequest.update({
      where: { id: request.id },
      data: {
        status: "assinado",
        signedAt,
        signedPdfKey,
        signedHash: sha256(assinado),
        signatureKey: assinaturaKey,
        signatureMode: input.modo,
        nextReminderAt: null,
      },
    });
    await pushAudit(request.id, { passo: "assinou", detalhe: input.modo, ip: g.ip, ua: g.ua });

    // Anexo no card, fila de validação, agradecimento — nada disso pode
    // derrubar a página nem PRENDER o cliente na tela de carregando: a
    // assinatura já está gravada. Se o WhatsApp estiver lento (ou o número for
    // inválido), soltamos a tela em 12s e o resto termina no servidor.
    try {
      await Promise.race([
        finalizeSignature(request.id),
        new Promise((resolve) => setTimeout(resolve, 12_000)),
      ]);
    } catch (err) {
      console.error("[SIGN] pós-assinatura falhou (assinatura preservada):", err);
    }

    return { ok: true as const };
  } catch (err) {
    console.error("[SIGN] Falha ao assinar:", request.id, err);
    await db.signatureRequest.update({
      where: { id: request.id },
      data: { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
    }).catch(() => {});
    await requestHumanHelp(request.id, "falha técnica ao concluir a assinatura").catch(() => {});
    return {
      ok: false as const,
      erro: "Deu um problema aqui do nosso lado ao finalizar. Já avisamos a equipe — alguém vai te chamar no WhatsApp em instantes.",
    };
  }
}
