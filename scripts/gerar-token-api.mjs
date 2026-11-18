// Tokens da API externa (/api/external/*, T-WOJYR): gerar, listar e revogar.
// No banco (api_tokens) fica só o sha256; o token em claro aparece UMA vez.
// Prefixo e hash precisam bater com app/_shared/lib/api-token.ts.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/gerar-token-api.mjs --listar
//   node -r dotenv/config scripts/gerar-token-api.mjs --gerar --label="Sistema X" --autor=<e-mail ou nome> [--saida=<arquivo>] [--apply]
//   node -r dotenv/config scripts/gerar-token-api.mjs --revogar=<id> [--apply]
//   node -r dotenv/config scripts/gerar-token-api.mjs --conferir=<arquivo com o token>   (deu 401? diz se o token bate)
//   (sem --apply = dry-run: só mostra o que faria)
//
// --saida grava o token em claro num arquivo em vez de imprimir (para não
// ficar no histórico do terminal). Entregue ao sistema de fora por canal
// seguro e apague o arquivo. Nunca commite o token.
import { createHash, randomBytes } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const API_TOKEN_PREFIX = "crmapi_";

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const APPLY = !!flags.apply;
const fmt = (d) =>
  d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d) : "—";

const db = new PrismaClient();
try {
  if (flags.listar) {
    const rows = await db.apiToken.findMany({ orderBy: { createdAt: "desc" } });
    if (!rows.length) console.log("Nenhum token de API.");
    for (const t of rows) {
      console.log(
        `${t.id}  ${t.revokedAt ? "REVOGADO" : "ativo   "}  "${t.label}"  criado=${fmt(t.createdAt)}  último uso=${fmt(t.lastUsedAt)}${t.revokedAt ? `  revogado=${fmt(t.revokedAt)}` : ""}`,
      );
    }
  } else if (flags.gerar) {
    const label = typeof flags.label === "string" ? flags.label.trim().slice(0, 80) : "";
    if (!label) throw new Error('--label="<qual sistema usa o token>" é obrigatório');
    if (typeof flags.autor !== "string") throw new Error("--autor=<e-mail ou nome do membro da equipe> é obrigatório");
    const autor = await db.user.findMany({
      where: {
        OR: [{ email: flags.autor }, { name: { startsWith: flags.autor, mode: "insensitive" } }],
        role: { in: ["ADMIN", "ADMIN+", "ADMIN++"] },
      },
      select: { id: true, name: true },
      take: 2,
    }).then((r) => (r.length === 1 ? r[0] : null));
    if (!autor) throw new Error("Autor não encontrado (ou mais de um) na equipe: use o e-mail ou o nome completo");

    console.log(`Gerar token "${label}" por ${autor.name}${APPLY ? "" : " [dry-run]"}`);
    if (APPLY) {
      const token = API_TOKEN_PREFIX + randomBytes(32).toString("base64url");
      const row = await db.apiToken.create({
        data: { label, tokenHash: createHash("sha256").update(token).digest("hex"), createdById: autor.id },
        select: { id: true },
      });
      console.log(`id=${row.id}`);
      if (typeof flags.saida === "string") {
        writeFileSync(flags.saida, token, { encoding: "utf8", mode: 0o600 });
        console.log(`Token gravado em ${flags.saida} (aparece só agora; apague o arquivo depois de entregar).`);
      } else {
        console.log(`TOKEN (aparece só agora): ${token}`);
      }
    }
  } else if (typeof flags.conferir === "string") {
    // Suporte ao "dá 401 com token novo": confere se o token do arquivo (um
    // por linha) bate com algum da tabela, sem imprimir o valor.
    const linhas = readFileSync(flags.conferir, "utf8").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const [i, raw] of linhas.entries()) {
      const token = raw.replace(/^Bearer\s+/i, "");
      if (!token.startsWith(API_TOKEN_PREFIX)) { console.log(`linha ${i + 1}: não começa com ${API_TOKEN_PREFIX}`); continue; }
      const t = await db.apiToken.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
      console.log(`linha ${i + 1}: ${t ? `bate com "${t.label}" (${t.id}) — ${t.revokedAt ? "REVOGADO" : "ativo"}` : "não bate com nenhum token"} [${token.length} caracteres]`);
    }
  } else if (typeof flags.revogar === "string") {
    const t = await db.apiToken.findUnique({ where: { id: flags.revogar } });
    if (!t) throw new Error(`Token ${flags.revogar} não encontrado`);
    if (t.revokedAt) { console.log(`"${t.label}" já está revogado (${fmt(t.revokedAt)})`); }
    else {
      console.log(`Revogar "${t.label}" (${t.id})${APPLY ? "" : " [dry-run]"}`);
      if (APPLY) await db.apiToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } });
    }
  } else {
    console.log("Use --listar, --gerar --label=... --autor=... ou --revogar=<id> (com --apply para gravar).");
  }
} finally {
  await db.$disconnect();
}
