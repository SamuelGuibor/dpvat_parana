import type { Metadata } from "next";
import { loadByToken } from "@/app/_shared/lib/signature/tokens";
import { SignFlow } from "./SignFlow";

// Página PÚBLICA de assinatura. Sem login, sem app, sem cadastro: o token do
// link é a credencial. Tudo o que o cliente precisa fazer cabe em 5 telas, uma
// decisão por vez — muita gente aqui não lê bem, então a abertura traz um
// tutorial (sempre) com vídeo, cada passo tem botão de áudio e nenhuma decisão
// depende de ler um parágrafo.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // carimbar o PDF leva alguns segundos

export const metadata: Metadata = {
  title: "Assinar documentos — Paraná Seguros",
  robots: { index: false, follow: false },
};

function Aviso({
  emoji,
  titulo,
  texto,
}: {
  emoji: string;
  titulo: string;
  texto: string;
}) {
  return (
    <main className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="text-6xl mb-4" aria-hidden>{emoji}</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">{titulo}</h1>
        <p className="text-lg text-slate-600 leading-relaxed">{texto}</p>
        <a
          href="https://wa.me/5541997862323"
          className="mt-8 inline-flex items-center justify-center w-full h-14 rounded-2xl bg-emerald-600 text-white text-lg font-semibold active:scale-[0.98] transition"
        >
          Falar no WhatsApp
        </a>
      </div>
    </main>
  );
}

export default async function AssinarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await loadByToken(token);

  if (!found.ok) {
    if (found.reason === "expirado") {
      return (
        <Aviso
          emoji="⏰"
          titulo="Esse link venceu"
          texto="Por segurança, o link de assinatura vale por 7 dias. Fale com a gente no WhatsApp que a gente te manda um novo agora mesmo."
        />
      );
    }
    if (found.reason === "cancelado") {
      return (
        <Aviso
          emoji="📄"
          titulo="Esse documento foi cancelado"
          texto="Chame a gente no WhatsApp para entender o que aconteceu e receber o documento certo."
        />
      );
    }
    return (
      <Aviso
        emoji="🔍"
        titulo="Não encontramos esse documento"
        texto="Confira se o link veio completo. Se preferir, chame a gente no WhatsApp que a gente reenvia."
      />
    );
  }

  const { request } = found;
  const fields = (request.extracted ?? {}) as Record<string, { value?: string }>;
  const jaAssinado = ["assinado", "validado"].includes(request.status);

  return (
    <SignFlow
      token={token}
      jaAssinado={jaAssinado}
      assinadoEm={request.signedAt?.toISOString() ?? null}
      cliente={{
        nome: fields.name?.value || request.contact.name || "",
        cpf: fields.cpf?.value || "",
        endereco: [
          fields.rua?.value,
          fields.numero?.value && `nº ${fields.numero.value}`,
          fields.bairro?.value,
          fields.cidade?.value,
        ]
          .filter(Boolean)
          .join(", "),
      }}
    />
  );
}
