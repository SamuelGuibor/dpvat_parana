# AI-First — Etapa 1: plano de execução (só leitura)

> Pré-requisito: ler `docs/ai-first/00-diagnostico-etapa-zero.md` (diagnóstico v2 + 16 decisões do dono). Este arquivo é o roteiro de implementação para uma sessão nova. Regras do repo valem integralmente (`CLAUDE.md` raiz, `docs/ai/*.md`, skills `/plano` `/migration` `/validar` `/mapa-atualizar`). Banco = produção. Teste manual sempre com card de teste.

## Objetivo da etapa
O operador, dentro do Claude Code neste repositório, pergunta em português sobre clientes/processos/pendências/parados e recebe respostas vindas **só** de dados reais, por ferramentas tipadas que respeitam as permissões do banco. Nenhuma escrita no CRM nesta etapa. Cada prompt e cada ferramenta ficam registrados em tabelas `op_*`.

## Ordem de execução

### 0. Mapas (aprovado pelo dono)
`/mapa-atualizar auth-permissoes`, `/mapa-atualizar kanban-cards`, `/mapa-atualizar documentos-ia` com os pontos do Anexo A do diagnóstico (30 permissões, `assertCanWrite`/`requireTeamWrite`/`readOnlyBlock`, `PEDIDO_HOSPITALAR.docx`, `/api/procuracao` com `readOnlyBlock`, `sendEmailAws` sem anexo, `gemini-3.6-flash` fora de `MODEL_PRICING`, protótipo `app/api/chat/modules`).

### 1. Schema (via `/migration op_tables`)
Tabelas aditivas em `prisma/schema.prisma` (snake_case com `@@map`, ids cuid, `createdAt`):
- `OperatorToken` (`operator_tokens`): `userId` (FK User, cascade), `tokenHash` (sha256, `@unique`), `label`, `lastUsedAt?`, `revokedAt?`, `createdById`. Índice `[userId]`.
- `OpSession` (`op_sessions`): `operatorId` (FK User), `clientSessionId` (id da sessão do Claude Code, `@unique`), `cwd?`, `startedAt`, `lastSeenAt`.
- `OpRequest` (`op_requests`): `sessionId` (FK OpSession), `operatorId`, `text` (prompt completo — decisão 7), `skill?`, `state Json?` (reservado à Etapa 6), `createdAt`. Índices `[operatorId, createdAt]`, `[sessionId]`.
- `OpToolCall` (`op_tool_calls`): `requestId?` (FK OpRequest, SetNull), `sessionId`, `operatorId`, `tool`, `level` (1..5), `args Json` (já sem PII sensível), `ok Boolean`, `code?`, `summary` (≤ 300 chars), `cardIds String[]`, `durationMs Int`, `createdAt`. Índices `[operatorId, createdAt]`, `[tool, createdAt]`.
Seguir o fluxo `migrate diff → ler SQL (remover DROP TABLE "discord") → db execute → migrate resolve → generate → tsc`.

### 2. Permissões
`app/_shared/lib/permissions.ts`: novas chaves em `PERMISSION_DEFS` (categoria "WhatsApp e IA" ou nova categoria "Operação por IA") e nas 3 entradas de `ROLE_DEFAULTS`:
- `op_use` (ADMIN/ADMIN+/ADMIN++ = true) — usar as ferramentas de leitura/preparo.
- `op_write` (só ADMIN++ por padrão) — Etapa 3.
- `op_approve` (só ADMIN++ por padrão) — Etapa 5.
- `manage_knowledge` (só ADMIN++) — Etapa 2.
Atualizar `tests/permissions.test.ts`.

### 3. Autenticação por token (`app/_shared/lib/op/auth.ts`)
- `issueOperatorToken(userId, label, createdById)` → gera 32 bytes aleatórios (`crypto.randomBytes`), devolve o token em claro **uma vez**, grava só o hash.
- `resolveOperator(req)`: lê `Authorization: Bearer <token>`, hash, busca `operator_tokens` ativo, carrega o `User`, exige `isTeamRole(role)`, monta `SessionPermissions` com `resolvePermissions(role, permissions)` (mesma lógica de `getSessionPermissions`, sem e-mail e **sem trava de IP** — decisão 3). Atualiza `lastUsedAt` por `runAfterResponse`.
- `requireOpPermission(ctx, key)` lança `AccessError` → a rota responde 403 `{ok:false, code:"sem_permissao"}`.
- Rate limit por token (`rateLimit(tokenHash, 120, 60_000)`).
- Tela Equipe (`app/nova-dash/_components/team_dash.tsx`) ganha "Token do app" por membro: gerar (mostra uma vez), revogar. Actions em `app/_actions/team/operator-tokens.ts` com `requirePermission("manage_team")`; o próprio membro pode gerar o seu com `requireTeam()` **[confirmar com o dono se cada um gera o próprio]**.

### 4. API de operação (`app/api/op/`)
- `middleware.ts`: adicionar `/api/op/` a `PUBLIC_API_PREFIXES` (a rota valida o token; padrão cron/webhook).
- `app/api/op/tools/[tool]/route.ts` (POST, `maxDuration` 60): `resolveOperator` → procura a ferramenta no registry → valida `args` com zod → checa `level ≤ 2` nesta etapa e a permissão da ferramenta → executa → grava `op_tool_calls` (com `await`) → responde `noStoreJson({ok, data, state?})` ou `{ok:false, code, message}`. Nunca lança; erro inesperado → `reportCriticalError` + 500 genérico.
- `app/api/op/tools/route.ts` (GET): lista o catálogo (nome, descrição, JSON Schema gerado do zod, nível, permissão) para o MCP montar as ferramentas.
- `app/api/op/events/route.ts` (POST): `{type:"prompt"|"tool_denied"|"session_start", clientSessionId, text?, cwd?, tool?}` → upsert `op_sessions` + insert `op_requests`/`op_tool_calls`. Usado pelos hooks.

### 5. Registry e ferramentas (`app/_shared/lib/op/`)
- `registry.ts`: `defineTool({name, description, level, permission, schema: z.object, run(ctx, args)})`; `listTools()`, `getTool(name)`; `toJsonSchema` via `zod-to-json-schema` (adicionar dependência) ou conversor próprio.
- `policy.ts` (puro, testado): `canRun(level, perms)`, `canonicalHash(tool, args)` (Etapa 5, já deixar pronto), `maskCpf`, `stripSensitive(card)` (remove `password`, `senha_inss`, hashes).
- `resolve.ts` (puro, testado): `parseCardRef("processo 2342" | "#2342" | cuid | CPF)`, `normalizeColumnName` (sem acento/caixa/hífen) + `matchColumn(names, query)` devolvendo `{exact|candidates}`.
- `tools/` (uma por arquivo, todas L1, permissão `op_use`):
  1. `buscar_cliente` — `db.user.findMany` com filtro de card (`role` não ADMIN*/GHOST), `OR` por `cardNumber`, `cpf` (dígitos), `telefone` (últimos 8 dígitos), `name contains`; inclui arquivados com flag; `take 20`; CPF mascarado.
  2. `obter_card` — `fetchUserById`/`fetchProcessById` + `stripSensitive`; devolve coluna (`label.name` via `labelId`), dias na coluna (`statusStartedAt`, `date-br`), etapa (`status` + rótulo de `card-dialog/constants.ts`), tags, hospital, `afastadoAte`, `archiveStatus`.
  3. `listar_historico` — `db.log` (`userId`/`processId`, `take ≤ 50`) + `db.comment` (`take ≤ 50`), ordenados, com `authorName` e `metadata` resumido.
  4. `listar_documentos` — `db.document` `deletedAt: null`, por pasta (`DOCUMENT_CATEGORIES`), URL via `trySignGetUrl` (90 min).
  5. `listar_colunas` — `fetchLabels` (nome, ordem, `timeLimitDays`, contagem de cards ativos).
  6. `listar_tags` — `db.cardTag`.
  7. `listar_cards_parados` — cards ativos com `statusStartedAt` ≤ hoje − N dias (padrão N = `timeLimitDays` da coluna ou 7), agrupados por coluna, `take 50` + `total`.
  8. `listar_cards_coluna` — por nome de coluna (via `matchColumn`; ambíguo → devolve candidatas), filtros simples (tag, hospital, service), `take 50`.
  9. `verificar_pendencias` — pastas vazias de `DOCUMENT_CATEGORIES`, itens de `AdminChecklistItem` não marcados (seed lazy como a rota), campos vazios exigidos pela procuração (lista de `gerarProcuracaoById`), tags de pendência (FALTA SENHA, FALTA COMPROVANTE, FALTA KIT, PENDÊNCIA*). Deixar claro na resposta que a lista oficial por serviço (INSS) ainda não existe.
  10. `consultar_conversa` — permissão `view_whatsapp`; `WhatsAppContact` por `userId` ou telefone (`findLinkedCard` inverso), status da conversa, últimas 20 mensagens não internas (texto truncado), sem mídia.
  Todas: `select` mínimo, sem `distinct`+`orderBy` em tabela grande, `cardIds` no registro da chamada.

### 6. MCP fino (`tools/crm-mcp/`)
- Node + `@modelcontextprotocol/sdk` (stdio). Na inicialização faz `GET /api/op/tools` e registra cada ferramenta com o JSON Schema recebido; cada chamada vira `POST /api/op/tools/<nome>`; devolve `data` como texto JSON e, em `ok:false`, a mensagem em português.
- Config: `CRM_OP_URL` (default `https://segurosparana.com.br`) e `CRM_OP_TOKEN` lidos de variáveis de ambiente do **usuário** (nunca do `.env` do repo). `.mcp.json` na raiz aponta para `node tools/crm-mcp/index.mjs`.
- Envia `X-Op-Session` (id da sessão do Claude Code, se disponível via env `CLAUDE_SESSION_ID`; senão um uuid por processo) para amarrar as chamadas à `op_sessions`.
- Sem dependência do Next; `package.json` próprio dentro da pasta.

### 7. Hooks (`.claude/settings.json` + `.claude/hooks/`)
- `UserPromptSubmit` → `op-prompt.mjs`: POST `/api/op/events {type:"prompt", clientSessionId, text, cwd}` com `CRM_OP_TOKEN`; timeout 5 s; **nunca** bloqueia (sai 0 mesmo em erro).
- `PostToolUse` (matcher `mcp__crm-op__*`) → `op-tool.mjs`: só registra recusa/erro local; sucesso já foi gravado pela rota.
- `PreToolUse` (`Read|Bash|PowerShell|Grep`) → `guard-secrets.mjs`: bloqueia leitura de `.env*`, `grep` por `DATABASE_URL|CRM_OP_TOKEN|CLAUDE_API_KEY`, e `node -e`/`npx prisma db execute`/`psql` fora de `scripts/*.mjs` (que seguem exigindo `--apply` para escrever). Estender `guard-bash.mjs` em vez de duplicar, se couber.
- Acrescentar `tools/crm-mcp/**` e `.claude/skills/op-*/**` às permissões de leitura da sessão se necessário.

### 8. Skills de operação (`.claude/skills/op-*/SKILL.md`, em português)
- `/cliente <cpf|nome|telefone|nº>`: `buscar_cliente` → se 1 resultado, `obter_card` + `listar_historico` (5) + `verificar_pendencias`; se vários, lista e pergunta. Termina com "Próximos passos sugeridos" (só sugestões; nesta etapa nenhuma execução).
- `/processo <nº>`: `obter_card` + histórico + documentos + pendências + conversa (se `view_whatsapp`).
- `/parados [coluna] [dias]`: `listar_cards_parados`, agrupado, com link `segurosparana.com.br/nova-dash` + instrução de abrir pelo nº.
- `/pendencias <nº|coluna>`: `verificar_pendencias` por card ou para todos os cards de uma coluna (`listar_cards_coluna`).
- Regras comuns escritas na skill: responder só com o que a ferramenta devolveu; se a ferramenta devolver `sem_permissao`, dizer isso e parar; nunca sugerir ler o banco direto; nunca mostrar `senha_inss`; coluna ambígua → perguntar.

### 9. Testes e validação
- `tests/op-policy.test.ts` (níveis, máscara, `stripSensitive`), `tests/op-resolve.test.ts` (parser de referência, normalização/match de coluna), `tests/op-registry.test.ts` (zod → JSON Schema das 10 ferramentas, nomes únicos, todas L1), `tests/op-auth.test.ts` (hash/token, revogado, cliente por CPF recusado) com Prisma mockado.
- `/validar` (tsc, eslint nos arquivos, vitest, `revisor-regras`).
- Manual: gerar token para o usuário de teste; `curl` sem token → 401; token revogado → 401; rodar `/cliente` no Claude Code com card de teste; conferir `op_requests`/`op_tool_calls` no banco; tentar `Read .env` e ver o bloqueio.
- Ao final: `/mapa-atualizar` (novo mapa `docs/ai/operacao-ia.md` + entrada na tabela do `CLAUDE.md` raiz), `docs/ai-first/01-resultado-etapa-1.md` com o que foi feito, riscos e o que ficou fora.

## Fora do escopo da Etapa 1
Qualquer ferramenta de escrita (L3+), vault (`docs/operacao/`), colunas `hospital_*`, e-mail, ZapSign, dashboard no site, `/meu-dia`, retomada de workflow.

## Decisões já tomadas que esta etapa respeita
Token por membro (2); bypass de IP por token + permissão do banco (3); prompt completo gravado, leitura só por gestores (7); sem DPVAT (10); sugestões de próximos passos em toda resposta (14); migrations aditivas (15).
