import { NextResponse } from "next/server";
import { requireTeam, type SessionPermissions } from "./permissions-server";
import { guardFailure, isSameOrigin } from "@/app/_shared/utils/route-guards";

// Guardas dos route handlers da EQUIPE (leituras do inbox e do cabeçalho que
// saíram da fila serial de server actions).
//
// O middleware.ts só garante que existe sessão (sem ela: 401 "Não
// autenticado" antes de a rota rodar) — e cliente logado por CPF também tem
// sessão. Por isso toda rota da equipe começa por `teamRoute()`, que lê o
// cargo do BANCO e aplica a trava de IP (`requireTeam`), nunca o
// `session.user.role` do JWT (congelado até o próximo login). Rota da equipe
// NÃO entra nas allowlists do middleware.
//
// Uso:
//   const auth = await teamRoute();
//   if ("res" in auth) return auth.res;
//   const { ctx } = auth;

/**
 * JSON sem cache em lugar nenhum (navegador, CDN): as respostas da equipe
 * trazem dado pessoal (telefone, CPF, RG) e mudam a cada poll.
 */
export function noStoreJson<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/**
 * Exige equipe (cargo do banco + trava de IP). Recusa de acesso → 403 com o
 * motivo; qualquer outra falha (banco, rede) → 500 com texto próprio e o erro
 * no log, para a UI não dizer "sem acesso" quando o problema é o Neon.
 */
export async function teamRoute(): Promise<{ ctx: SessionPermissions } | { res: NextResponse }> {
  try {
    return { ctx: await requireTeam() };
  } catch (err) {
    const failure = guardFailure(err);
    if (failure.status === 500) console.error("[teamRoute] falha ao conferir o acesso:", err);
    return { res: noStoreJson({ error: failure.error }, { status: failure.status }) };
  }
}

/**
 * Segunda barreira contra CSRF nos POST da equipe feitos por fetch (fora do
 * mecanismo das server actions, que já confere a origem): o cookie do
 * NextAuth é SameSite=Lax, e isto recusa o POST cujo Origin não é o próprio
 * site. `null` = pode seguir; senão devolva a resposta (403).
 */
export function sameOrigin(req: Request): NextResponse | null {
  const h = req.headers;
  if (isSameOrigin(h.get("origin"), h.get("x-forwarded-host"), h.get("host"))) return null;
  return noStoreJson({ error: "Origem da requisição não permitida." }, { status: 403 });
}
