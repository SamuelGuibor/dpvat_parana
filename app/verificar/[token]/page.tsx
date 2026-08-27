import type { Metadata } from "next";
import { db } from "@/app/_shared/lib/prisma";
import Image from "next/image";

// Página PÚBLICA de verificação — é o destino do QR code impresso no manifesto
// do PDF. Quem receber o documento (INSS, juiz, a própria parte) confere aqui
// que ele existe, quem assinou, quando e com qual impressão digital.
//
// Ela mostra o MÍNIMO necessário para conferir: nome parcial, CPF mascarado,
// datas e hashes — nunca o endereço do cliente.
//
// 27/08/2026: quando o ciclo JÁ ESTÁ assinado, a página também libera o
// download do PDF assinado, igual à tela de pós-assinatura. O QR carrega o
// MESMO token do link de assinatura (verifyUrlFor/signUrlFor), então quem
// escaneia já podia baixar o arquivo por /api/signature/pdf/<token> — o botão
// só deixa de esconder o caminho. Enquanto NÃO está assinado, nada é
// oferecido: a versão em branco do contrato não é assunto de quem verifica.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificar documento — Paraná Seguros",
  robots: { index: false, follow: false },
};

function mascararCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "—";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

function mascararNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length <= 1) return nome;
  return `${partes[0]} ${partes.slice(1).map((p) => (p.length > 2 ? `${p[0]}.` : p)).join(" ")}`;
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <dt className="text-sm text-slate-500">{rotulo}</dt>
      <dd className={`text-base text-slate-900 break-all ${mono ? "font-mono text-sm" : ""}`}>{valor}</dd>
    </div>
  );
}

export default async function VerificarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const request = await db.signatureRequest.findUnique({
    where: { token },
    include: { contact: { select: { name: true } } },
  });

  const assinado = request && ["assinado", "validado"].includes(request.status);
  const fields = (request?.extracted ?? {}) as Record<string, { value?: string }>;

  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="mx-auto w-full max-w-lg px-5 py-10 space-y-6">

        <p className="text-center text-sm font-bold tracking-wide text-emerald-700 uppercase">
          <Image src="/paranaseguros.png" width={200} height={64} alt="Paraná Seguros" className="mx-auto w-auto" />
        </p>


        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          {!request ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-3" aria-hidden>🔍</div>
              <h1 className="text-xl font-bold text-slate-900">Documento não encontrado</h1>
              <p className="mt-2 text-slate-600">
                O código de verificação não corresponde a nenhum documento nosso.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center pb-5 border-b border-slate-100">
                <div className="text-5xl mb-2" aria-hidden>{assinado ? "✅" : "⏳"}</div>
                <h1 className="text-xl font-bold text-slate-900">
                  {assinado ? "Documento assinado" : "Documento ainda não assinado"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {assinado
                    ? "A assinatura eletrônica abaixo foi registrada pelo nosso sistema."
                    : `Situação atual: ${request.status}.`}
                </p>
              </div>

              <dl className="mt-2">
                <Linha rotulo="Signatário" valor={mascararNome(fields.name?.value || request.contact.name || "—")} />
                <Linha rotulo="CPF" valor={mascararCpf(fields.cpf?.value ?? "")} />
                <Linha
                  rotulo="Documentos"
                  valor="Procuração ad judicia, contrato de prestação de serviços advocatícios e declaração de hipossuficiência"
                />
                <Linha
                  rotulo="Assinado em"
                  valor={
                    request.signedAt
                      ? `${request.signedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília)`
                      : "—"
                  }
                />
                <Linha
                  rotulo="Forma da assinatura"
                  valor={
                    request.signatureMode === "desenho"
                      ? "Desenhada na tela + código enviado ao WhatsApp do signatário"
                      : request.signatureMode === "digitado"
                        ? "Nome digitado pelo signatário + código enviado ao seu WhatsApp"
                        : "—"
                  }
                />
                <Linha rotulo="Impressão digital do documento (SHA-256)" valor={request.documentHash ?? "—"} mono />
                <Linha rotulo="Impressão digital do documento assinado" valor={request.signedHash ?? "—"} mono />
              </dl>

              {assinado && (
                <div className="mt-6 space-y-3">
                  <a
                    href={`/api/signature/pdf/${token}?download=1`}
                    className="w-full h-14 rounded-2xl bg-emerald-600 text-white text-base font-bold flex items-center justify-center"
                  >
                    ⬇ Baixar os documentos assinados
                  </a>
                  <a
                    href={`/api/signature/pdf/${token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-12 rounded-2xl border-2 border-slate-300 text-slate-700 text-base font-semibold flex items-center justify-center"
                  >
                    Abrir no navegador
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 leading-relaxed">
          Assinatura eletrônica nos termos da MP 2.200-2/2001, art. 10, §2º e da Lei 14.063/2020.
          {assinado
            ? " O arquivo baixado aqui é o mesmo PDF assinado, com o manifesto de assinatura."
            : " Para obter uma cópia do documento, fale com o escritório."}
        </p>
      </div>
    </main>
  );
}
