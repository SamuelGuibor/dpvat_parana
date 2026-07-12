import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Gate global de autenticação.
//
// Antes deste middleware, ~40 rotas de /api (kanban, labels, prompts, logs,
// uploads, automations…) aceitavam requisições anônimas. Agora TUDO exige
// sessão NextAuth, exceto o que está explicitamente listado abaixo:
//
//  - Páginas públicas: site institucional, blog, área do cliente e login.
//  - APIs com autenticação própria: webhook da Meta (HMAC), cron (CRON_SECRET),
//    webhooks externos BotConversa/Trello (shared secret validado na rota).
//  - GETs públicos usados pela área do cliente (status por processo/CPF).
//
// Server actions: o POST de uma action chega na URL da própria página com o
// header "next-action". Em páginas públicas só as páginas do fluxo do cliente
// podem invocar actions sem sessão — em qualquer outro caminho exige login.

const NEXTAUTH_SECRET = process.env.NEXT_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

/** Páginas do site institucional + área do cliente (acesso anônimo). */
const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/blog-seguros-parana",
  "/documents",
  "/exclusao-de-dados",
  "/faq",
  "/nossa-equipe",
  "/politica-de-privacidade",
  "/politica-privacidade",
  "/termos-de-uso",
  "/area-do-cliente",
  "/status",
];

/** APIs com mecanismo de autenticação próprio (secret/HMAC na própria rota). */
const PUBLIC_API_PREFIXES = [
  "/api/auth", // NextAuth + login legado (rate-limited na rota)
  "/api/whatsapp/webhook", // assinatura HMAC da Meta
  "/api/whatsapp/cron", // CRON_SECRET
  "/api/botconversa/contratado", // shared secret (validado na rota)
  "/api/discord/trello", // shared secret (validado na rota)
];

/** GETs consumidos pela área do cliente sem login (consulta de status). */
const PUBLIC_GET_APIS = ["/api/process-status", "/api/user-status", "/api/documents"];

/** Páginas públicas cujo fluxo legítimo usa server actions anônimas. */
const PUBLIC_ACTION_PAGES = ["/area-do-cliente", "/status", "/documents"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isServerAction = req.headers.has("next-action");

  if (isApi) {
    if (matchesPrefix(pathname, PUBLIC_API_PREFIXES)) return NextResponse.next();
    if (req.method === "GET" && PUBLIC_GET_APIS.includes(pathname)) return NextResponse.next();
  } else {
    const isPublicPage = pathname === "/" || matchesPrefix(pathname, PUBLIC_PAGE_PREFIXES);
    if (isPublicPage && (!isServerAction || matchesPrefix(pathname, PUBLIC_ACTION_PAGES))) {
      return NextResponse.next();
    }
  }

  const token = await getToken({ req, secret: NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  if (isApi || isServerAction) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Ignora estáticos do Next e qualquer arquivo com extensão (public/, vídeos…).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
