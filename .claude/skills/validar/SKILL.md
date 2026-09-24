---
name: validar
description: Valida as mudanças atuais do CRM (tsc, eslint só nos arquivos alterados, vitest relacionado e checagem das regras invioláveis). Use antes de dizer que algo está pronto, antes de commit, ou quando o usuário pedir "valida", "testa", "confere".
---

# /validar — portão de qualidade antes de "pronto"

Rode na ordem e **reporte o resultado real** (com saída de erro, se houver). Nunca diga "passou" sem ter rodado.

1. **Escopo da mudança**
   ```bash
   git status --short && git diff --stat HEAD
   ```
2. **Tipos** (linha de base da main = 0 erros; qualquer erro é seu):
   ```bash
   npx tsc --noEmit
   ```
3. **Lint só no que mudou** (eslint leva ~40s por invocação — passe todos os arquivos numa chamada só):
   ```bash
   git diff --name-only HEAD --diff-filter=ACMR -- '*.ts' '*.tsx' | xargs -r npx eslint
   ```
   Inclua também os arquivos novos não rastreados (`git ls-files --others --exclude-standard -- '*.ts' '*.tsx'`).
4. **Testes**: se existir teste em `tests/` do domínio tocado, rode-o (`npx vitest run tests/<arquivo>`). Se mexeu em utilitário compartilhado (`app/_shared/utils`, `lib/permissions*`, `automation-conditions`, `costs`, `whatsapp/template-text`), rode `npm test` inteiro. Testes `*.smoke.test.ts` de assinatura precisam de banco/env — rode só se o domínio for assinatura e avise se falhar por ambiente.
5. **Prisma** (se `prisma/schema.prisma` mudou): `npx prisma validate` e confirme que existe migration SQL correspondente criada via `/migration`.
6. **Revisão de regras**: delegue ao subagente `revisor-regras` com o diff (`git diff HEAD`). Ele confere as regras invioláveis do `CLAUDE.md` e dos mapas de `docs/ai/`.
7. **Preview** (se a mudança é visível no navegador): suba o preview `dev` do `.claude/launch.json`, exercite a tela afetada e confira o console.
8. **Mapas**: `npm run docs:check`. Se falhar, a mudança quebrou um mapa de `docs/ai/` → rode `/mapa-atualizar`.

## Saída
Tabela `etapa | resultado | observação`, e no fim: **PRONTO** ou **BLOQUEADO: <motivo>**.
