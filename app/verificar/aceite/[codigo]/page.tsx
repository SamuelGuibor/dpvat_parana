import type { Metadata } from "next";
import Image from "next/image";
import { db } from "@/app/_shared/lib/prisma";
import { brDateTimeLabel, maskCpf, maskName, maskPhone, normalizeVerificationCode } from "@/app/_shared/utils/terms";

// Página PÚBLICA de verificação do COMPROVANTE DE ACEITE DE TERMOS (T-B40K0):
// destino do QR/URL impresso no PDF gerado quando o cliente aceita os termos
// pelo formulário do WhatsApp. Mostra o mínimo para conferir — nome parcial,
// CPF e telefone mascarados, data/hora, versão dos termos e os hashes — e não
// oferece o arquivo (quem tem o PDF confere o SHA-256 dele aqui).
// Pública pelo prefixo "/verificar" em PUBLIC_PAGE_PREFIXES (middleware.ts);
// sem server action.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificar comprovante de aceite",
  robots: { index: false, follow: false },
};

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <dt className="text-sm text-slate-500">{rotulo}</dt>
      <dd className={`break-all text-base text-slate-900 ${mono ? "font-mono text-sm" : ""}`}>{valor}</dd>
    </div>
  );
}

export default async function VerificarAceitePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const code = normalizeVerificationCode(decodeURIComponent(codigo));
  const row = code
    ? await db.termsAcceptance.findUnique({
      where: { code },
      select: {
        id: true, code: true, phone: true, termsVersion: true, nameGiven: true, cpfGiven: true,
        acceptedAt: true, recordHash: true, pdfSha256: true, waMessageId: true,
      },
    })
    : null;

  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="mx-auto w-full max-w-lg space-y-6 px-5 py-10">
        <p className="text-center">
          <Image src="/logo-brasil-beneficios.png" width={200} height={64} alt="Brasil Benefícios e Indenizações" className="mx-auto w-auto" />
        </p>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {!row ? (
            <div className="py-6 text-center">
              <div className="mb-3 text-5xl" aria-hidden>🔍</div>
              <h1 className="text-xl font-bold text-slate-900">Comprovante não encontrado</h1>
              <p className="mt-2 text-slate-600">O código de verificação não corresponde a nenhum aceite registrado por nós.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 pb-5 text-center">
                <div className="mb-2 text-5xl" aria-hidden>✅</div>
                <h1 className="text-xl font-bold text-slate-900">Aceite de termos registrado</h1>
                <p className="mt-1 text-sm text-slate-500">
                  O cliente aceitou os termos dentro do WhatsApp, no formulário enviado pela empresa.
                </p>
              </div>
              <dl className="mt-2">
                <Linha rotulo="Código de verificação" valor={row.code} mono />
                <Linha rotulo="Nome informado" valor={maskName(row.nameGiven)} />
                <Linha rotulo="CPF informado" valor={maskCpf(row.cpfGiven)} />
                <Linha rotulo="WhatsApp que aceitou" valor={maskPhone(row.phone)} />
                <Linha rotulo="Aceito em" valor={`${brDateTimeLabel(row.acceptedAt)} (horário de Brasília)`} />
                <Linha rotulo="Versão dos termos" valor={row.termsVersion} />
                <Linha rotulo="Identificador do documento" valor={row.id} mono />
                <Linha rotulo="Hash do registro (SHA-256)" valor={row.recordHash} mono />
                <Linha rotulo="Hash do arquivo PDF (SHA-256)" valor={row.pdfSha256 ?? "—"} mono />
              </dl>
            </>
          )}
        </div>

        <p className="text-center text-xs leading-relaxed text-slate-400">
          Para conferir um PDF, calcule o SHA-256 do arquivo e compare com o hash acima. Este aceite não substitui a
          assinatura do contrato e da procuração. Para obter uma cópia, fale com o escritório.
        </p>
      </div>
    </main>
  );
}
