# Modelo de dados (Prisma/Neon) — mapa para IA
> Verificado em 2026-09-23 · Escopo: `prisma/schema.prisma`, `prisma/migrations/**`, `app/_shared/lib/prisma.ts`, `app/_shared/lib/db/*`

## TL;DR
- Postgres no **Neon** via Prisma 6, schema único (56 models, conferido com `grep -c "^model "`; sem enums Prisma: tudo é `String` com valores mágicos). Cliente único `db` em `app/_shared/lib/prisma.ts`. O `.env` local aponta para o **Neon de produção** — não existe banco de dev/staging.
- **Card do kanban é uma linha de `User`** (ou `Process`) e **a equipe também é `User`**: `role` tem duplo sentido (ADMIN/ADMIN+/ADMIN++ = equipe; qualquer outro valor = nome da coluna do card; `GHOST` = hospital-fantasma).
- O histórico de migrations está em dia (`migrate status` ok), mas o banco tem **drift** (tabela órfã `discord`): `prisma migrate dev`/`reset` propõem **resetar produção**. Fluxo seguro: `migrate diff` → ler/limpar SQL → `db execute` → `migrate resolve` → `generate` (skill `/migration`).
- Multi-número WhatsApp: `numberId` nullable em contato/conversa/mensagem/template/rule event; `phone` e `name` de template **não são unique sozinhos** → nada de `upsert` por eles.
- O que mais quebra: (1) rodar `migrate dev`; (2) confundir card × equipe em queries de `User`; (3) ler `closedAt`/`closeCategory`/`qualified` sem `status: "closed"`; (4) SQL cru com nome de tabela errado (PascalCase × snake_case).

## Onde fica
| Caminho | Responsabilidade | Símbolos-chave |
|---|---|---|
| `prisma/schema.prisma` | Todos os models; `url`=pooled (`DATABASE_URL`), `directUrl`=CLI (`DIRECT_URL`) | models abaixo |
| `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` | Histórico SQL (107 pastas); backfills vão no próprio SQL | `migration_lock.toml` (postgresql) |
| `app/_shared/lib/prisma.ts` | Singleton do PrismaClient (cache em `global.cachedPrisma` fora de produção) | `db` |
| `app/_shared/lib/db/users.ts` · `processes.ts` · `labels.ts` | Selects padrão dos cards e colunas do board | `fetchUsers`, `fetchUserById`, `fetchProcesses`, `fetchLabels` (unstable_cache, tag `labels`) |
| `app/_shared/lib/db/automations.ts` · `botconversa.ts` | CRUD de automações; contagens da tabela `Botconversa` | `fetchAutomations`, `fetchTimeConditionAutomations`, `fetchEventsCount` |
| `app/api/board-state/route.ts` | Estado do board numa chamada + hash de versão calculado no Postgres | `computeBoardVersion` (interna) |
| `app/_actions/maintenance/retention.ts` | Retenção de `Notification` e `logs` (cron `/api/maintenance/retention`) | `runRetention`, `purgeOldLogs`, `PURGEABLE_LOG_ACTIONS` |
| `app/_actions/documents/trash.ts` | Lixeira de `Document` (30 dias; cron `/api/documents/trash/purge`) | `restoreDoc`, `purgeDoc`, `purgeExpiredTrash` |
| `app/_shared/lib/whatsapp/numbers.ts` · `crypto.ts` | Resolução de credenciais por número; token cifrado AES-256-GCM | `getCreds`, `activeNumberConversationWhere`, `ensureDefaultNumber`, `encryptSecret` |
| `app/_shared/lib/whatsapp/close-categories.ts` | Fonte dos valores de `closeCategory` e do mapa para `qualified` | `CLOSE_CATEGORY_LABELS`, `QUALIFIED_BY_CATEGORY`, `NON_QUALIFIED_CATEGORIES` |
| `app/_shared/lib/document-categories.ts` | Ids válidos de `Document.category` e inferência pelo nome | `DOCUMENT_CATEGORIES`, `inferCategory` |
| `app/nova-dash/card-dialog/constants.ts` | Valores de `User.status` por `service` | `getStatusOrderByService`, `DPVAT_STATUS_ORDER`, `INSS_STATUS_ORDER` |
| `app/_actions/cards/archive-card.ts` · `app/_shared/lib/archive-catalog.ts` | Valores de `archiveStatus` | `ArchiveStatus`, `setArchiveStatus`, `ARCHIVE_LABELS` |
| `app/_shared/lib/log.ts` | Valores de `Log.action` e snapshot de setor no metadata | `LogAction`, `createLog`, `diffFields` |
| `scripts/*.mjs`, `scripts/seed-hospitals.ts` | Manutenção one-off com `new PrismaClient()` próprio | `hash-passwords.mjs`, `backfill-mentions.mjs`, `bootstrap-permissions.mjs` |
| `.claude/skills/migration/SKILL.md` · `.claude/hooks/guard-bash.mjs` | Fluxo seguro de migration; hook bloqueia `migrate dev/reset`, `DROP TABLE`, `TRUNCATE` | — |

## Fluxo principal
Leitura/escrita em runtime:
1. UI (`app/nova-dash/**`, área do cliente) → server action (`app/_actions/**`) ou rota (`app/api/**`).
2. A action checa sessão/permissão (`requirePermission`/`requireTeam` em `app/_shared/lib/permissions-server.ts`) e chama `db.<model>` importado de `app/_shared/lib/prisma.ts`.
3. Prisma → Neon pelo endpoint **pooled** (pgbouncer). SQL cru só em pontos de performance: `computeBoardVersion`, `loadConversations` (LATERAL por contato), `findLinkedCard` (últimos 8 dígitos do telefone), `nextval('card_number_seq')`.
4. Crons (`vercel.json`) fazem manutenção: retenção, purga da lixeira, SLA/recuperação do WhatsApp.

Mudança de schema (produção):
1. Editar `prisma/schema.prisma` (aditivo: coluna nullable ou com `@default`, tabela nova, índice).
2. `npx prisma validate` e `npx prisma format`.
3. `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (só lê o banco).
4. **Ler o SQL.** Hoje ele sempre traz a remoção da tabela órfã `discord` — apagar essa linha. Qualquer `DROP`/`ALTER ... TYPE` inesperado = parar e perguntar.
5. Salvar em `prisma/migrations/<14 dígitos>_<nome_snake>/migration.sql` (+ backfill `UPDATE` se precisar).
6. Com OK do usuário: `npx prisma db execute --file <pasta>/migration.sql --schema prisma/schema.prisma` → `npx prisma migrate resolve --applied <pasta>` → `npx prisma generate`.
7. `npx tsc --noEmit`; conferir `npx prisma migrate status` = "Database schema is up to date".

## Dados
Tabela real entre parênteses quando há `@@map`; sem `@@map` a tabela é o nome do model em PascalCase entre aspas.

| Domínio | Model (tabela) | Para quê · pegadinha |
|---|---|---|
| Cards | `User` | Card de cliente **e** membro da equipe **e** GHOST. Ficha inteira em colunas snake (`estado_civil`, `nome_mae`…); `data_nasc`/`data_acidente` são **String**. `permissions` Json = overrides; `onboarding`/`workSchedule` Json |
| Cards | `Process` | Segundo tipo de card (FK obrigatória `userId`, cascade). Código trata os dois com `isProcess`; em produção a tabela `Process` está **vazia** (0 linhas em 23/09/2026) — todo card real é `User`, mas o caminho `isProcess` continua no código |
| Cards | `Label` | Coluna do kanban (`order`, `timeLimitDays` = limite para alerta de card estourado) |
| Cards | `CardTag` (`card_tags`) | Tag livre do card; m2m implícito `_UserCardTags`/`_ProcessCardTags` (não mexe em `updatedAt`) |
| Cards | `Comment` | Duas FKs pra User: `userId` = card (cascade), `authorId` = autor (SetNull). `processId` para card Process |
| Cards | `Document` | Anexo S3 (`key`). `userId` obrigatório mesmo em doc de Process. `category` null = inferida na leitura. `deletedAt` = lixeira |
| Cards | `AdminChecklistItem` (`admin_checklist_items`) | Checklist previdenciário; `userId`/`processId` **sem FK** (órfão se card sumir) |
| Cards | `Log` (`logs`) | Histórico/métricas. `userId`/`processId` FK cascade; `authorId` **sem FK** (sobrevive à demissão). `metadata.usage` = consumo de IA |
| Cards | `Automation` (`automations`) · `AutomationFire` (`automation_fires`) | `conditions`/`actions` Json; `cardType` both/user/process; `cycleKey` ("due:AAAA-MM-DD"/"col:…") evita repetir disparo |
| Cards | `StatusMessageConfig` (`status_message_configs`) · `Event` (`events`) | Texto da msg de progresso por (`serviceKey`,`status`); agenda da equipe (`userId`/`processId` soltos) |
| Equipe | `Sector` (`sectors`) · `Mention` (`mentions`) · `Notification` | Setor ≠ role. `Mention` PENDING/ACK/DONE, `groupId` compartilha estado da tarefa de setor. `Notification` = sino volátil (retenção 30/90 d) |
| Equipe | `WorkSession` · `PontoAdjustment` (`ponto_adjustments`) | Ponto. `discordId` é legado e **guarda o userId do app**; `date` "AAAA-MM-DD" Brasília; `breaks` Json é a verdade (pausedAt/resumedAt = espelho) |
| Equipe | `Goal` (`goals`) · `DevTicket` (`dev_tickets`) · `DevAlert` (`dev_alerts`) · `AppSetting` (`app_settings`) | `Goal.month` "AAAA-MM". `AppSetting` = chave→valor string (ex.: chaves `DASHBOARD_ALLOWED_IPS_KEY`, `SIGNATURE_AUTO_PAUSE_KEY`, `cost_*`) |
| Auth | `Account` · `Session` · `VerificationToken` · `PasswordResetCode` (`password_reset_codes`) | Tabelas do PrismaAdapter (sessão é JWT); código de reset com hash e expiração |
| Chat interno | `ChatMessage` · `ChatReaction` · `ChatRead` · `ChatChannel` · `ChatChannelMember` (`chat_*`) | Canais `general`/`dm:*` **não têm linha** em `chat_channels`; `deletedAt` = "mensagem apagada" |
| WhatsApp | `WhatsAppNumber` (`whatsapp_numbers`) | Um por linha da empresa. `accessTokenEnc` cifrado; `active=false` = somente leitura; `templatesPaused`; `isDefault` |
| WhatsApp | `WhatsAppContact` (`whatsapp_contacts`) | `@@unique([numberId, phone])` — mesmo telefone pode existir 2× (uma por linha). `userId`/`processId` **sem FK**. Opt-in/opt-out, atribuição de anúncio (first touch), `clientDraft`/`draftDocuments` Json |
| WhatsApp | `WhatsAppConversation` (`whatsapp_conversations`) | 1:1 com contato. `status` bot/queued/human/standby/closed; `closeCategory`, `qualified`, `closedAt`; ciclo `recovery*`; `botMemory`/`botState`; `urgent` **morto** |
| WhatsApp | `WhatsAppMessage` (`whatsapp_messages`) | `direction` in/out; `status` sent/delivered/read/failed; `sentByBot`+`systemSource` (recovery/automation/progress/signature_*) = mensagem automática; `internal` = nota; `waMessageId` unique (dedupe de webhook) |
| WhatsApp | `WhatsAppTag` · `WhatsAppConversationTag` · `WhatsAppCloseReason` · `WhatsAppQuickReply` · `WhatsAppFlow` · `WhatsAppTemplate` · `WhatsAppConversationRead` | Tag da conversa (≠ `CardTag` ≠ `Label`); `ConversationTag.createdAt` = quando a tag foi aplicada (métrica mensal). `CloseReason.key` sempre `nq_*`. Template `@@unique([numberId, name])`, catálogo é por WABA |
| Cérebro IA | `WhatsAppReview` · `WhatsAppPlaybook` · `WhatsAppInstructions` · `WhatsAppRuleEvent` | Review = índice de snapshot imutável no S3 (`s3Key`). Playbook/Instruções versionados (rascunho/publicado/descartado); **instruções vivas estão no banco**. RuleEvent `kind` rule/followup/recovery/code |
| Assinatura | `SignatureRequest` (`signature_requests`) · `DocTemplate` (`doc_templates`) | `token` público, `otpHash` bcrypt, `audit`/`parts`/`extracted` Json. `DocTemplate.kind` procuracao/assinatura sobrepõe `templates/` do repo |
| Custos | `CostSnapshot` (`cost_snapshots`) · `ProjectCost` (`project_costs`) | Dinheiro em **centavos Int**. Snapshot: 1 linha por (`service`,`day` Brasília), `amountCents` na moeda de `currency` (default **USD**), `source` api/logs/estimate — não tem coluna em real. `ProjectCost` (lançamento manual): `amountBrlCents` é o que soma |
| Legado | `Botconversa` · `Contact` · `SavedPrompt` · `Instruction`/`InstructionFile` · `Message`/`SubMessage` | `Botconversa.marcado` = lead tratado. `Message`/`SubMessage` sem uso em `app/` |

Strings mágicas (fonte da verdade no código, não no schema):
- `User.role`: `TEAM_ROLES`/`isTeamRole` em `app/_shared/lib/permissions.ts`; senão nome de `Label` ou `"GHOST"`. Default do schema: `"Filtro de Cartões"`.
- `User.service`: `SERVICE_OPTIONS` (DPVAT, INSS, SPVAT, RCF, Seguro de Vida, TRABALHISTA); `User.status` = `DPVAT_S1..S7`, `INSS_S*`, ou `GENERIC_STATUS_ORDER` (`INICIADO`…) para os demais — `card-dialog/constants.ts`.
- `archiveStatus`: `ArchiveStatus` (null = card ativo). `Document.category`: `DOCUMENT_CATEGORIES` (`OUTROS` default).
- `closeCategory`: `CLOSE_CATEGORY_LABELS` + chaves dinâmicas `nq_*` de `WhatsAppCloseReason`. Prefixo `nq_` ⇒ `qualified=false`.
- `Mention.source` comment/chat/whatsapp/botconversa; `Mention.status` PENDING/ACK/DONE.
- `SignatureRequest.status`/`origin`, `WhatsAppTemplate.status`/`category`, `WhatsAppPlaybook.status`: listados em comentário no schema.

## Regras invioláveis e armadilhas
- **Nunca** `prisma migrate dev`, `migrate reset`, `db push --accept-data-loss/--force-reset` — com o drift, o Prisma propõe apagar o schema `public` de produção (hook e `deny` em `.claude/settings.json` bloqueiam).
- **Remova `DROP TABLE "discord"` de todo SQL gerado por `migrate diff`** — é a órfã conhecida; derrubá-la é decisão do usuário, não efeito colateral de outra migration. O hook `guard-bash.mjs` só olha o texto do comando: um `DROP` **dentro** do `.sql` passado a `db execute` passa sem aviso — a revisão do arquivo é sua.
- **Nunca edite migration já aplicada**; crie outra. Nome com 14 dígitos: a ordem é lexicográfica (a pasta `20260922_…` é exceção e ordena depois de `20260922HHMMSS_…`).
- **Migrations aditivas**: coluna nova nullable ou com default; índices com `CREATE INDEX IF NOT EXISTS` e nome no padrão Prisma (`<tabela>_<colunas>_idx`) para o próximo diff não recriar.
- **Um PrismaClient só**: importe `db` de `app/_shared/lib/prisma.ts`. `new PrismaClient()` só em `scripts/` (cada instância abre um pool próprio de conexões no pgbouncer do Neon). `app/_bot/ponto.js` (bot Discord legado, sem import) tem client próprio — não imite.
- **Não use `distinct` do Prisma com `orderBy` em tabela grande** (`whatsapp_messages`, `logs`): ele não vira `DISTINCT ON`, puxa tudo e deduplica em JS — foi a maior fonte de egress do Neon. Use `db.$queryRaw` com `LATERAL … LIMIT 1` (ver `loadConversations`).
- **SQL cru**: tabelas sem `@@map` são `"User"`, `"Process"`, `"Label"`, `"Comment"`, `"Document"`, `"Notification"`, `"WorkSession"`, `"Botconversa"`, `"Contact"`, `"SavedPrompt"`, `"Message"`, `"SubMessage"`, `"Account"`, `"Session"`, `"VerificationToken"`; as demais são snake_case (`whatsapp_messages`, `logs`, `mentions`…). Colunas camelCase exigem aspas (`"contactId"`). Use template tag/`Prisma.sql`; `$queryRawUnsafe` só com string constante.
- **`cardNumber` sai de `nextval('card_number_seq')`** (sequência criada em SQL na migration `20260617000000_add_senha_inss_and_card_number`, invisível no schema). Nunca `max()+1`. Seis pontos criam card e chamam a sequência por conta própria: `create-user.ts`, `process/create-process.ts`, `whatsapp/client-info.ts`, `signature/core.ts`, `api/botconversa/contratado`, `api/migrate-hospitals` — regra nova de criação precisa entrar em todos.
- **Apagadores de GHOST**: `scripts/seed-hospitals.ts` e a rota `app/api/migrate-hospitals/route.ts` fazem `deleteMany({ role: 'GHOST' })` (cascade leva docs/logs deles) e a rota ainda zera `User.hospital` de todos os clientes. Nunca rode/chame sem ordem explícita.
- **Card ativo** = `role ≠ 'GHOST'`, `role` não começa com `ADMIN`, `archiveStatus` null (`fetchUsers`). Equipe = `isTeamRole(role)`. Query de `User` sem esse filtro mistura clientes, equipe e hospitais-fantasma.
- **A coluna do card é `labelId`**; `role` é só o nome da coluna copiado no move (`updateKanbanStatus`). Renomear `Label` **não** atualiza o `role` dos cards → lógica por coluna deve ler `label.name` via `labelId`. Arquivar preserva `labelId` (desarquivar volta à coluna).
- **Fuso**: `DateTime` é UTC; corte de dia/mês só via `app/_shared/utils/date-br.ts`. Campos String de data (`WorkSession.date`, `PontoAdjustment.date`, `CostSnapshot.day`, `Goal.month`) já são chaves de Brasília — gere com `brDayKey`.
- **Datas do card são String livre** (`data_nasc`, `data_acidente`; "DD/MM/AAAA", "05/1999", "1999"…), não `DateTime`. Não servem de prazo de automação (o `toDate` de `automation-conditions.ts` não entende DD/MM/AAAA); prazo = `DateTime` (padrão `afastadoAte`). A ficha do WhatsApp grava texto direto no `User` com o **mesmo nome de coluna**: `CLIENT_FIELDS` (`app/_actions/whatsapp/client-info.ts`, espalhado no `data` de `saveClientInfo`/`addClientFromConversation`) e `AI_FIELDS` (`app/_shared/lib/whatsapp/ficha-ai.ts`, `autoFillClientInfo`). Campo novo da ficha = coluna `String?` no `User` com exatamente esse nome.
- **`closedAt`/`closeCategory`/`qualified` só valem com `status = "closed"`**: reabrir a conversa não limpa. Todo novo ponto de encerramento precisa setar `closedAt: new Date()`; KPI de funil nasce da coorte (`loadCohort` em `app/_actions/analytics/bot-funnel.ts`).
- **Multi-número**: sem `upsert` por `phone`/`name` — find-or-create manual (`findOrCreateContactByPhone` em `app/_shared/lib/whatsapp/outbound.ts`); filtros de linha ativa usam `OR [{numberId: null}, {numberId: {notIn}}]` (`notIn` sozinho derruba legado); `getCreds` de número inativo devolve `null` de propósito.
- **Token de número só via `encryptSecret`/`decryptSecret`**; trocar `WHATSAPP_CRED_KEY` (fallback `NEXT_AUTH_SECRET`) invalida os tokens salvos.
- **Soft delete**: toda listagem de `Document` filtra `deletedAt: null`; `purgeDoc`/`purgeExpiredTrash` só apagam o objeto S3 se nenhuma **outra** linha (ativa ou ainda na lixeira) usar a mesma `key`. `WhatsAppMessage.deletedAt`/`ChatMessage.deletedAt` são exclusão só local.
- **Cascades de `User`**: apagar um card leva `Document` (linhas; objeto S3 fica), `Comment` do card, `Log` do card, `Process` do dono; apagar alguém da equipe leva `ChatMessage`, `Mention`/`Notification` recebidas. Referências soltas (`WhatsAppContact.userId`, `Mention.userId`, `Event.userId`, `AdminChecklistItem`, `Log.authorId`) ficam órfãs → trate `findUnique` nulo.
- **Logs de ciclo de vida são eternos**: `move`, `archive`, `status_change`, `create`, `update` (o relatório de pastas `buildFolderReport` lê `move` sem limite de data). Só as ações em `PURGEABLE_LOG_ACTIONS` somem após 180 dias.
- **Toda chamada de IA grava `metadata.usage`** no `Log` (`{model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}`) — o Canto da IA filtra por `jsonb_exists(metadata,'usage')`.
- **Json columns não têm validação**: o shape está no comentário do schema; leia defensivamente (ex.: `parseOverrides` para `User.permissions`).
- **Colunas mortas não voltam a ser usadas**: `WhatsAppConversation.urgent` (urgência saiu do bot/inbox; coluna ficou), `Message`/`SubMessage`. `WhatsAppConversation.lastReadAt` é legado mas **ainda lido** como fallback junto de `WhatsAppConversationRead` — não remova.
- **Dinheiro em centavos `Int`** (Float erra soma; Decimal não atravessa server action).
- **Smoke tests de assinatura que importam `db` (`sign:seed`, `sign:flow`, `sign:templates`) gravam no Neon de produção** (contato/fluxo/template de teste) — rode só quando o domínio for assinatura.
- **Windows**: `npx prisma generate` dá EPERM com `npm run dev` rodando (DLL do engine travada) — pare o dev server antes.

## Receitas
- **Nova coluna/tabela** → `prisma/schema.prisma` + passos do Fluxo (skill `/migration`) · cuidado com o `DROP TABLE "discord"` no SQL e com coluna `NOT NULL` sem default · valide com `npx prisma migrate status` e `npx tsc --noEmit`.
- **Backfill de dados junto da coluna** → `UPDATE` no mesmo `migration.sql` (padrão de `20260903140000_conversation_closed_at` e `20260827130000_document_category_inss_kit`) · cuidado: roda direto em produção, escreva o `WHERE` idempotente (`WHERE "col" IS NULL`) · valide contando linhas antes/depois via script.
- **Índice para query lenta** → `@@index([...])` no model + `CREATE INDEX IF NOT EXISTS "<tabela>_<cols>_idx"` (padrão de `20260914150000_inbox_indexes`) · cuidado com índice `DESC` (`lastMessageAt(sort: Desc)`) · valide com `migrate diff` vazio (fora a linha da `discord`).
- **Novo valor de status/categoria** (closeCategory, archiveStatus, Document.category, LogAction, status de card) → só código: `close-categories.ts` (+`QUALIFIED_BY_CATEGORY`), `ArchiveStatus`+`archive-catalog.ts`, `DOCUMENT_CATEGORIES`, `LogAction` em `log.ts`, `card-dialog/constants.ts` · cuidado: não há enum no banco, typo vira dado sujo · valide com `npx tsc --noEmit`.
- **Configuração global simples** → `AppSetting` com chave em constante exportada (padrão `DASHBOARD_ALLOWED_IPS_KEY` em `app/_shared/lib/ip-access.ts`) · cuidado: valor é String, cacheie leitura quente · sem migration.
- **Novo model ligado a card** → `userId String?` + `processId String?` (padrão `Event`/`Mention`) ou FK com `onDelete: Cascade` (padrão `Document`) · decida explicitamente se o dado deve morrer com o card · valide o `isProcess` em todas as actions.
- **Dado novo por linha de WhatsApp** → `numberId String?` + `@@index([numberId, createdAt])`, e inclua a tabela na adoção de legado de `ensureDefaultNumber` · cuidado com unique composto e `null` (Postgres não compara nulls em unique) · valide com dois números cadastrados.
- **"Último X por grupo" / lista paginada pesada** → `db.$queryRaw` com `unnest(${ids}::text[])` + `LEFT JOIN LATERAL` (ver `loadConversations` em `app/_actions/whatsapp/conversations.ts`) · cuidado com nomes de tabela/coluna entre aspas · valide o tamanho do payload.
- **Criar card por código** → reuse `createUser` (`app/_actions/users/create-user.ts`): `nextval('card_number_seq')`, CPF só dígitos, e-mail placeholder (email é `@unique` obrigatório), `service`/`status`/`statusStartedAt` iniciais · cuidado: há **dois padrões** de placeholder, `<cpf>@inserir-email.com` (`createUser`) e `inserir_email-<telefone>@gmail.com` (ficha do WhatsApp em `app/_actions/whatsapp/client-info.ts`, `signature/core.ts`, `app/api/botconversa/contratado/route.ts`). Filtro só por "inserir-email" não pega os cards da ficha; use os dois, como `isRealEmail` (`app/_actions/auth/password-reset.ts`).
- **Script de manutenção one-off** → `scripts/<nome>.mjs` com `new PrismaClient()` e dry-run por padrão, gravando só com `--apply` (padrão `scripts/hash-passwords.mjs`) · cuidado: é produção · valide rodando sem `--apply` primeiro.
- **Diagnóstico read-only do banco** → `npx prisma migrate status` (histórico) e `npx prisma migrate diff … --script` (drift; hoje só a `discord`) · nunca `db execute` para "só olhar".

## Testes e validação
- Não há teste unitário do schema. `tests/*.test.ts` (vitest, `vitest.config.mts`) cobrem utilitários puros — relevante aqui: `tests/date-br.test.ts` (chaves de dia Brasília usadas em campos String) e `tests/costs.test.ts` (centavos).
- `tests/signature-seed.smoke.test.ts`, `tests/signature-flow-seed.smoke.test.ts`, `tests/signature-templates.smoke.test.ts` importam `db` e **tocam o banco real**; só rodam via `npm run sign:seed|sign:flow|sign:templates`.
- Checklist ao mexer no schema: `npx prisma validate` → `npx prisma format` → `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (esperado após aplicar: só a linha da `discord`) → `npx prisma migrate status` ("Database schema is up to date") → `npx prisma generate` → `npx tsc --noEmit` → `npm test`.
- Deploy: `package.json` tem `"prepare": "prisma generate"` — a Vercel gera o client no install; o schema do banco já precisa estar aplicado **antes** do deploy do código que usa a coluna.

## Fronteiras
- **kanban-cards**: `app/_actions/cards/*` (`updateKanbanStatus`, `setArchiveStatus`, `deleteCard`), `app/api/board-state/route.ts`, `app/_shared/lib/db/users.ts`/`processes.ts`/`labels.ts`.
- **whatsapp-bot**: ingest em `app/_shared/lib/whatsapp/service.ts` (adoção de contato legado, reabertura, `isSilencedCloseCategory`), `numbers.ts`, `outbound.ts`, `app/_actions/whatsapp/conversations.ts` (`closeConversation`), `bot.ts` (`findLinkedCard`, liga contato ↔ card sem FK).
- **auth-permissoes**: `app/_shared/lib/permissions.ts` (`isTeamRole`, `resolvePermissions` sobre `User.permissions`), `app/_shared/lib/password.ts` (bcrypt em `User.password`), `app/_shared/lib/ip-access.ts` (`AppSetting`).
- **assinatura**: `app/_shared/lib/signature/core.ts` (`SignatureRequest`, cria card com `card_number_seq`), `app/_shared/lib/doc-templates.ts` (`DocTemplate`).
- **analytics-custos**: `app/_actions/analytics/bot-funnel.ts` (coorte, `closedAt`), `app/_actions/analytics/get-ai-corner.ts` (`Log.metadata.usage`), `app/_shared/lib/cost-sync.ts` (`CostSnapshot`, `AppSetting`).
- **workspace-equipe**: `app/_shared/lib/mention-inbox.ts` (`recordMentions`), `app/_shared/lib/sector-tasks.ts` (`recordSectorTask`), `app/api/work-session/route.ts` (`WorkSession`).
- **documentos-ia**: `app/_shared/lib/document-categories.ts`, `app/_actions/documents/trash.ts`, `app/_shared/lib/admin-checklist.ts` (`markPersonalDocChecklistItem`).
- **infra**: `vercel.json` (crons de retenção/purga), `app/api/maintenance/retention/route.ts`, `app/api/documents/trash/purge/route.ts`.
