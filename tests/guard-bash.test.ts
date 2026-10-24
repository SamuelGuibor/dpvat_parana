import { describe, it, expect } from "vitest";
// Módulo .mjs do harness (allowJs infere os tipos pelo JSDoc).
import { checkCommand } from "../.claude/hooks/bash-rules.mjs";

const check = (cmd: string, files: Record<string, string> = {}) =>
  checkCommand(cmd, { readFile: (p: string) => files[p] ?? null }) as string | null;

describe("guard-bash: banco", () => {
  it("bloqueia migrate dev/reset e db push destrutivo", () => {
    expect(check("npx prisma migrate dev --name x")).toMatch(/migrate dev/);
    expect(check("npx prisma migrate reset")).toMatch(/migrate dev\/reset/);
    expect(check("npx prisma db push --accept-data-loss")).toMatch(/perda de dados/);
  });

  it("libera o fluxo da skill /migration", () => {
    expect(check("npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script")).toBeNull();
    expect(check("npx prisma db execute --file prisma/migrations/20261024170000_op_tables/migration.sql --schema prisma/schema.prisma")).toBeNull();
    expect(check("npx prisma migrate resolve --applied 20261024170000_op_tables")).toBeNull();
  });

  it("bloqueia db execute fora de prisma/migrations, psql e studio", () => {
    expect(check("npx prisma db execute --stdin")).toMatch(/fora de uma migration/);
    expect(check("npx prisma db execute --file /tmp/x.sql")).toMatch(/fora de uma migration/);
    expect(check('psql "$URL" -c "update"')).toMatch(/SQL direto/);
    expect(check("npx prisma studio")).toMatch(/Studio/);
  });

  it("bloqueia node -e com Prisma, libera node -e comum", () => {
    expect(check(`node -e "const {PrismaClient}=require('@prisma/client'); new PrismaClient().user.update()"`)).toMatch(/inline/);
    expect(check(`node -e "console.log(1+1)"`)).toBeNull();
  });

  it("arquivo com Prisma fora de scripts/ é bloqueado; scripts/ e o MCP passam", () => {
    const prismaSrc = "import { PrismaClient } from '@prisma/client'";
    expect(check("node /tmp/fix.mjs", { "/tmp/fix.mjs": prismaSrc })).toMatch(/fora de scripts/);
    expect(check("npx tsx tmp/fix.ts", { "tmp/fix.ts": "import { db } from '@/app/_shared/lib/prisma'" })).toMatch(/fora de scripts/);
    expect(check("node -r dotenv/config scripts/reparar-midias-renomeadas.mjs --contact=x", { "scripts/reparar-midias-renomeadas.mjs": prismaSrc })).toBeNull();
    expect(check("node tools/crm-mcp/index.mjs")).toBeNull();
    expect(check("node /tmp/ok.mjs", { "/tmp/ok.mjs": "console.log(1)" })).toBeNull();
  });
});

describe("guard-bash: segredos", () => {
  it("bloqueia ler o .env de qualquer jeito", () => {
    for (const c of ["cat .env", "type .env", "Get-Content .env", "head -5 ./.env.local", "grep DATABASE .env", "cp .env /tmp/x"]) {
      expect(check(c)).toMatch(/arquivo \.env/);
    }
  });

  it(".env.example e dotenv/config continuam livres", () => {
    expect(check("cat .env.example")).toBeNull();
    expect(check("node -r dotenv/config scripts/x.mjs")).toBeNull();
  });

  it("bloqueia imprimir segredo e listar o ambiente", () => {
    expect(check("echo $DATABASE_URL")).toMatch(/imprime/);
    expect(check("Write-Output $env:CRM_OP_TOKEN")).toMatch(/imprime/);
    expect(check(`node -e "console.log(process.env.CLAUDE_API_KEY)"`)).toMatch(/segredo/);
    expect(check("printenv")).toMatch(/lista/);
    expect(check("env | sort")).toMatch(/lista/);
    expect(check("Get-ChildItem env:")).toMatch(/lista/);
  });

  it("buscar o NOME da variável no código é permitido", () => {
    expect(check('grep -rn "CRON_SECRET" app')).toBeNull();
    expect(check("git status")).toBeNull();
  });
});

describe("guard-bash: git", () => {
  it("bloqueia force-push na main", () => {
    expect(check("git push --force origin main")).toMatch(/force-push/);
    expect(check("git push origin main")).toBeNull();
  });
});
