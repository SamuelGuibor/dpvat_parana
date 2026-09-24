# Infra, deploy, crons, CI e integrações externas — mapa para IA
> Verificado em 2026-09-23 · Escopo: `package.json`, `next.config.mjs`, `vercel.json`, `vercel/pro-checklist.md`, `railway/chat-relay.md`, `.github/workflows/ci.yml`, `vitest.config.mts`, `tests/**`, `scripts/**`, `knip.json`, `.eslintrc.json`, `tsconfig.json`, `.env.example`, `whatsapp-cron.cmd`, `middleware.ts` (allowlists de API), `app/api/**` (convenções), clientes externos em `app/_shared/lib/**`

## TL;DR
- Next 14.2 (App Router) na **Vercel Pro**. Banco Postgres no **Neon** via Prisma 6. Três serviços satélites no **Railway**, cada um com deploy próprio: o cérebro do bot (`CHATBOT_URL`, repo `D:\Chatbot_whatsapp`), o `docx-converter` (`DOCX_CONVERTER_URL`, `D:\docx-converter`) e o relay SSE do chat (`CHAT_RELAY_URL`, `D:\chat_site`).
- 8 crons no `vercel.json` (horário **UTC**). Todos são GET e se autenticam por `CRON_SECRET`, via `Authorization: Bearer` ou `?secret=`.
- **Quebra nº 1 (ativa):** o `middleware.ts` só deixa passar sem sessão as rotas em `PUBLIC_API_PREFIXES`. `/api/automations/cron/time-check`, `/api/costs/sync` e `/api/maintenance/retention` **não estão na lista**. O Vercel Cron recebe 401 ("Não autenticado") antes de a rota rodar. Isso bate com a memória "cost sync parado desde 14/09".
- **Quebra nº 2:** o body de uma função da Vercel tem limite de **4,5 MB** em qualquer plano. Arquivo vai por URL pré-assinada do S3, nunca pelo body.
- **Quebra nº 3:** o banco Neon tem drift de migrations, e `prisma migrate dev` propõe **resetar produção**. Use o fluxo diff → execute → resolve (ver Receitas).

## Onde fica
| Arquivo/pasta | Responsabilidade | Símbolos-chave |
|---|---|---|
| `vercel.json` | Agenda dos crons (UTC) | `crons[]` |
| `next.config.mjs` | Headers de segurança, tracing de arquivos lidos em runtime, pdfjs externo, next-video | `securityHeaders`, `experimental.outputFileTracingIncludes`, `serverComponentsExternalPackages`, `withNextVideo` |
| `middleware.ts` | Gate global de sessão NextAuth e allowlists públicas | `PUBLIC_API_PREFIXES`, `PUBLIC_GET_APIS`, `PUBLIC_GET_API_PREFIXES`, `PUBLIC_PAGE_PREFIXES`, `PUBLIC_ACTION_PAGES`, `config.matcher` |
| `app/api/whatsapp/cron/auth.ts` | Auth compartilhada dos crons | `isCronAuthorized` |
| `app/api/whatsapp/cron/{sla,nudge,recovery}/route.ts` | 3 fases do WhatsApp (cron próprio cada) | → `runSlaPhase`, `runNudgePhase`, `runRecoveryPhase` |
| `app/api/whatsapp/cron/route.ts` | Agregadora (roda as 3 fases). Só manual ou dev, **fora** do `vercel.json` | `PHASE_BUDGET_MS`, `mergeResults` |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | Lógica das fases, marcapasso de envio | `createPacer`, `RUN_BUDGET_MS`, `SIGNATURE_CRON_ENABLED`, `CronResults` |
| `app/api/afastamentos/check/route.ts` | Notifica afastamentos vencidos (GET cron, POST sessão) | `runCheck` |
| `app/api/automations/cron/time-check/route.ts` | Automações por tempo | → `runTimeBasedAutomations` (`app/_shared/lib/automation-executor.ts`) |
| `app/api/documents/trash/purge/route.ts` | Purga a lixeira de documentos (30 dias) | → `purgeExpiredTrash` (`app/_actions/documents/trash.ts`) |
| `app/api/costs/sync/route.ts` | Sincroniza custos (`?days=` de 1 a 62, padrão 3) | → `runCostSync` (`app/_shared/lib/cost-sync.ts`) |
| `app/api/maintenance/retention/route.ts` | Retenção de `Notification` e logs `wa_*` | → `runRetention` (`app/_actions/maintenance/retention.ts`) |
| `app/api/whatsapp/webhook/route.ts` | Webhook da Meta (GET handshake, POST com HMAC), `maxDuration` 120 | `GET`, `POST`, `verifySignature` |
| `app/api/whatsapp/brain-prompt/route.ts` | Serve instruções, playbook e exemplos ao microserviço do bot (`x-bot-secret`) | `renderInstructions`, `getBrainExamples` |
| `app/api/botconversa/contratado/route.ts` + `app/_shared/lib/webhook-auth.ts` | Webhook do BotConversa (shared secret) | `verifyWebhookSecret` |
| `app/_shared/lib/prisma.ts` | PrismaClient (singleton global em dev) | `db` |
| `app/_shared/lib/whatsapp/{client,numbers,crypto}.ts` | Graph API da Meta, multi-número, token cifrado AES-GCM | `sendText`, `sendTemplate`, `downloadMediaToS3`, `getCreds`, `getCredsByPhoneNumberId`, `activeNumberConversationWhere`, `invalidateNumberCache`, `encryptSecret`, `decryptSecret` |
| `app/_shared/lib/chat-relay.ts` + `app/api/chat/token/route.ts` | Relay SSE (token HMAC de 60s, broadcast best-effort) | `isRelayConfigured`, `signRelayToken`, `broadcastToRelay` |
| `app/_shared/lib/{cost-sync,cost-providers,costs}.ts` | Painel de custos: fetch por provedor e snapshot diário | `runCostSync`, `fetchAllProviders`, `fetchUsdBrl`, `COST_SERVICES`, `COST_PROVIDER_INFO` |
| `app/_shared/lib/report-error.ts` | Sink único de erro crítico (hoje **só `console.error`**) | `reportCriticalError` |
| `app/_shared/lib/rate-limit.ts` | Rate limit em memória, **por instância** | `rateLimit` |
| `app/_shared/lib/ip-access.ts` | Trava de IP da dashboard (lida por `requireTeam`) | `checkDashboardIpAccess`, `DASHBOARD_ALLOWED_IPS_KEY` |
| `.github/workflows/ci.yml` | CI em push na `main` e em PR: `npm ci`, prisma generate, tsc, lint, vitest (Node 20) | — |
| `vitest.config.mts` | `tests/**/*.test.ts`, env `node`, alias `@` → raiz | — |
| `railway/chat-relay.md` | Contrato e implementação de referência do relay (`/events`, `/broadcast`, `/health`) | — |
| `vercel/pro-checklist.md` | Pendências de painel (Fluid Compute, Skew Protection, Spend, WAF, Log Drains) | — |
| `whatsapp-cron.cmd` | Dispara a rota agregadora em localhost (lê `CRON_SECRET` do ambiente) | — |
| `knip.json` / `.eslintrc.json` / `tsconfig.json` | Dead code (`npx knip`, sem script npm), lint (`no-unused-vars` base desligada em TS) e TS strict com alias `@/*` | — |

**Serviços externos → onde está o cliente**
| Serviço | Cliente no código | Envs |
|---|---|---|
| Neon (Postgres) | `app/_shared/lib/prisma.ts` · consumo em `cost-providers.ts` `neonCosts` | `DATABASE_URL` (pooled), `DIRECT_URL` (CLI), `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PRICE_*` |
| Vercel | hosting e crons · custo manual em `vercelCosts` | `CRON_SECRET` |
| Railway: cérebro do bot | `whatsapp/bot.ts` `callBrainOnce` (`/reply`), `whatsapp/assist.ts`, `whatsapp/distill.ts`, `whatsapp/cron-tasks.ts`, `signature/core.ts` | `CHATBOT_URL`, `CHATBOT_URL_STAGING`, `CHATBOT_SECRET` |
| Railway: docx-converter | `app/api/roteiro/route.ts`, `app/api/roteiro/download-docx/route.ts`, `app/api/procuracao/route.ts`, `app/api/doc-ia/convert/route.ts`, `signature/pdf.ts` | `DOCX_CONVERTER_URL`, `CONVERTER_API_KEY` (header `x-api-key`) |
| Railway: relay SSE | `chat-relay.ts` · consumo em `railwayCosts` | `CHAT_RELAY_URL`, `CHAT_RELAY_SECRET`, `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_PRICE_*` |
| AWS S3 | cerca de 30 `new S3Client` espalhados, **sem cliente central** · presign em `app/_actions/documents/upload-s3.ts` (`getPresignedUrls`, `getRoteiroUploadUrls`) e `app/api/instructions/_s3.ts` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` |
| AWS SNS / SES | `app/_shared/lib/aws-messaging.ts` (`sendSmsAws`, `sendEmailAws`) | `SNS_SMS_SENDER_ID`, `SES_FROM_EMAIL`, `SES_REGION` |
| AWS Cost Explorer | `cost-providers.ts` `awsCosts` | mesmas `AWS_*` |
| Meta WhatsApp Cloud API | `whatsapp/client.ts`, `app/_actions/whatsapp/numbers.ts`, webhook | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`, `WHATSAPP_CRED_KEY`, `WHATSAPP_STATUS_TEMPLATE`, `WHATSAPP_SYSTEM_COOLDOWN_HOURS`, `WHATSAPP_TEST_NUMBERS` |
| Meta Conversions API | `app/_shared/lib/meta-conversions.ts` (`sendMetaCrmEvent`, `reportLeadStageToMeta`) | `META_DATASET_ID`, `META_CONVERSIONS_TOKEN`, `META_TEST_EVENT_CODE` |
| Meta Marketing/Ads | `whatsapp/meta-ad-names.ts` `fetchAdNames`, `app/_actions/botconversa.ts`, `metaAdsCosts` | `META_ADS_TOKEN` (cai em `META_CONVERSIONS_TOKEN`), `META_ADS_TOKEN_BOTCONVERSA`, `META_ADS_ACCOUNT_ID`, `META_ADS_ACCOUNT_BOTCONVERSA` |
| Anthropic (direto do Next) | `app/_shared/lib/ai-audit.ts`, `whatsapp/ficha-ai.ts` · custo em `anthropicCosts` | `CLAUDE_API_KEY`, `ANTHROPIC_ADMIN_KEY`, `ANTHROPIC_COST_UNIT` |
| Google Gemini | `app/api/chat/modules/chat.service.ts` (assistente interno), `app/api/doc-ia/route.ts`, `app/api/upload-file/route.ts`, `scripts/gerar-vozes.mjs` | `GOOGLE_API_KEY` |
| Google OAuth / Sheets | `app/_shared/lib/auth.ts` (`GoogleProvider`) · `app/_shared/lib/google-sheets.ts` `appendSheetRow` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY` |
| Twilio (SMS, opcional) | `app/_shared/lib/sms.ts` `sendSms` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID` |
| Windmill | `app/api/chat/modules/windmill.controller.ts` `runWindmillJob` | `WINDMILL_TOKEN` |
| Zapier | `app/api/zapier/route.ts` (URL do hook **hardcoded**) | — |
| BotConversa (entrada) | `app/api/botconversa/contratado/route.ts` | `BOTCONVERSA_WEBHOOK_SECRET` |
| Câmbio (awesomeapi) | `cost-providers.ts` `fetchUsdBrl` | `COST_USD_BRL` (se preenchida, **fixa** o câmbio e a API nem é chamada) |
| Sem serviço (allowlists e NextAuth) | `managers.ts`, `chatbot-access.ts`, `ai-review-access.ts`, `auth.ts` | `MANAGER_EMAILS`, `CHATBOT_DASHBOARD_EMAILS`, `AI_REVIEW_EMAILS`, `NEXTAUTH_SECRET`/`NEXT_AUTH_SECRET`, `NEXTAUTH_URL` |

**Scripts avulsos** (`node scripts/<x>`; `backfill-mentions` e `migrate-templates-to-db` pedem `node -r dotenv/config`). Eles usam o `DATABASE_URL` do `.env`, que em geral é **produção**:
- `add-signature-anchors.mjs`: gera as variantes `*_ASSINATURA.docx` com a âncora `<<assinatura_cliente>>`.
- `backfill-mentions.mjs`: popula a Caixa de Menções a partir das notificações antigas.
- `bootstrap-permissions.mjs`: bootstrap único do sistema de permissões.
- `gerar-vozes.mjs` (`npm run sign:voz`): narração do tutorial de assinatura via Gemini TTS.
- `hash-passwords.mjs`: migra senhas legadas para bcrypt. É dry-run por padrão; `--apply` grava.
- `log-dev-commits.mjs`: grava commits do git como `Log` de ação `dev_commit` (dry-run sem `--apply`).
- `migrate-templates-to-db.mjs`: move os modelos `.docx` do disco para `doc_templates` + S3.
- `normalize-docs.mjs`: normalização única de CPF/telefone/CEP para só dígitos.
- `prank-isadora.mjs`: pegadinha que insere logs falsos marcados com `metadata.prank`. **Não rodar.**
- `seed-hospitals.ts`: seed da lista de hospitais.

## Fluxo principal
**Tabela de crons** (a coluna "passa no middleware?" diz se o prefixo está em `PUBLIC_API_PREFIXES`)
| Path | Cron (UTC) | Horário BRT | maxDuration | Passa no middleware? | Faz |
|---|---|---|---|---|---|
| `/api/whatsapp/cron/sla` | `*/15 * * * *` | — | 120 | sim | fila, SLA humano, entrega travada, cards estourados (sem IA) |
| `/api/whatsapp/cron/nudge` | `*/15 * * * *` | — | 300 | sim | aviso de 30 min + encerramento por inatividade (IA) |
| `/api/whatsapp/cron/recovery` | `*/15 * * * *` | — | 300 | sim | ciclo de recuperação do standby |
| `/api/afastamentos/check` | `*/30 * * * *` | — | padrão | sim | `Notification` para admins |
| `/api/automations/cron/time-check` | `*/30 * * * *` | — | 120 | **NÃO** | automações por tempo e prazo |
| `/api/documents/trash/purge` | `0 6 * * *` | 03:00 | 300 | sim | apaga no S3 e no banco o que tem mais de 30 dias |
| `/api/costs/sync` | `30 3 * * *` | 00:30 | 120 | **NÃO** | grava `cost_snapshots` |
| `/api/maintenance/retention` | `0 5 * * *` | 02:00 | 300 | **NÃO** | purga `Notification` e logs `wa_*` |

1. **Cron:** o Vercel Cron faz GET com `Authorization: Bearer $CRON_SECRET`. Em `middleware.ts`, se o path casa com `PUBLIC_API_PREFIXES`, a requisição passa. Senão, `getToken` tenta decodificar o Bearer como JWT, falha e devolve 401. Passando, a rota checa `isCronAuthorized(req)`, chama a função de domínio (Prisma, Meta ou S3) e responde JSON.
2. **Webhook da Meta:** o POST lê `req.text()` cru e confere o HMAC (`x-hub-signature-256` com `WHATSAPP_APP_SECRET`). Depois faz `JSON.parse` e percorre cada `entry.changes`:
   - `field` diferente de `messages`: vai para `handleAccountEvent` (política, qualidade, status de template).
   - `metadata.phone_number_id` é resolvido por `getCredsByPhoneNumberId`. Número desconhecido: ignora e chama `reportCriticalError`.
   - Mensagens: `ingestIncomingMessage` (todas) → `handleIncomingWhatsApp` (1 vez por contato em `bot`) → `autoFillClientInfo` → `applyStatusUpdate`.
   - Resposta **500 só se a ingestão falhou** (a Meta reenvia; o dedup é por `waMessageId`). Nos outros casos, 200.
3. **Next → Railway:** fetch com `x-bot-secret` (chatbot), `x-api-key` (converter) ou `x-relay-secret` (relay). No sentido inverso, o microserviço busca `GET /api/whatsapp/brain-prompt` com `x-bot-secret`.
4. **Upload:** o browser pede uma URL presign (server action em `app/_actions/documents/upload-s3.ts`), faz PUT direto no S3 e a rota ou action recebe só a `key`.

## Dados
- `AppSetting` (`app_settings`), mapa chave/valor em string:
  - `cost_fx_usd_brl` (`COST_FX_KEY`) e `cost_sync_status` (`COST_SYNC_STATUS_KEY`, status por provedor).
  - `cost_credit_<service>` (em `app/_actions/costs/overview.ts`).
  - `dashboard_allowed_ips` (`DASHBOARD_ALLOWED_IPS_KEY`). Sem essa linha, cai na env `DASHBOARD_ALLOWED_IPS`.
- `CostSnapshot` (`cost_snapshots`): `@@unique([service, day])`. `day` é `YYYY-MM-DD` **de Brasília**. `amountCents` fica em centavos **da moeda do provedor**: `currency` é `USD` ou `BRL`, `source` é `api`, `logs` ou `estimate`. `ProjectCost` (`project_costs`) guarda as faturas manuais.
- `WhatsAppNumber` (`whatsapp_numbers`):
  - `accessTokenEnc` usa o formato `v1:<iv>:<tag>:<cipher>` (AES-256-GCM, chave derivada de `WHATSAPP_CRED_KEY`).
  - `active=false` deixa o número **somente leitura**: `getCreds(numberId)` devolve null e os crons o filtram via `activeNumberConversationWhere`.
  - `templatesPaused` bloqueia só `sendTemplate`. `isDefault` marca o fallback de envio sem `numberId`. `apiVersion` tem padrão `v21.0`.
  - `appSecretEnc` **existe, mas o webhook não lê**.
- `Notification` e `Log` (`logs`) são alvos da retenção:
  - Notificação lida some em 30 dias; qualquer uma some em 90.
  - Logs entram na purga só se a ação estiver em `PURGEABLE_LOG_ACTIONS` (os `wa_*`) e tiverem mais de 180 dias. `move` e o histórico do card nunca são apagados.
- A retenção apaga logs `wa_*` que carregam `metadata.usage` (ex.: `wa_bot`, `wa_ficha_ai`, `wa_suggest`): o Canto da IA não enxerga consumo com mais de 180 dias; `cost_snapshots` já gravados ficam.
- `Document.deletedAt` marca a lixeira; `TRASH_RETENTION_DAYS = 30`. `User`/`Process.afastadoAte` + `afastadoNotificado` garantem notificação única por vencimento.
- **Envs usadas no código mas ausentes do `.env.example`:** `CLAUDE_API_KEY`, `BOTCONVERSA_WEBHOOK_SECRET`, `META_ADS_TOKEN`, `META_ADS_TOKEN_BOTCONVERSA`, `META_ADS_ACCOUNT_BOTCONVERSA`, `SIGNATURE_AUTO_ENABLED`, `SIGNATURE_BASE_URL`, `SIGNATURE_OTP_DEV`, `WA_RECOVERY_DAILY_CAP`, `WA_SEND_GAP_MIN_S`, `WA_SEND_GAP_MAX_S`, `AI_REVIEW_EMAILS`, `DASHBOARD_ALLOWED_IPS`, `ANTHROPIC_COST_UNIT`, `NEON_PRICE_*`, `RAILWAY_PRICE_*`, `NEXT_AUTH_SECRET`.
- **No `.env.example` mas sem leitura no Next:** `BOT_WEBHOOK_URL`, `BOT_WEBHOOK_SECRET`, `TRELLO_KEY`, `TRELLO_TOKEN`. `ALLOWED_ORIGIN` só vale no relay do Railway.
- **Segredo do NextAuth:** `authOptions.secret` lê `NEXT_AUTH_SECRET` (se vazio, o NextAuth cai sozinho em `NEXTAUTH_SECRET`). O middleware usa `NEXT_AUTH_SECRET ?? NEXTAUTH_SECRET`. `whatsapp/crypto.ts` e o login legado `app/api/auth/route.ts` leem **só** `NEXT_AUTH_SECRET`. O `.env.example` diz "prefira `NEXTAUTH_SECRET`": com só ela definida, o login legado e a cifra de tokens (sem `WHATSAPP_CRED_KEY`) quebram.

## Regras invioláveis e armadilhas
- **Rota chamada por máquina (cron, webhook, microserviço) tem que entrar em `PUBLIC_API_PREFIXES`** no `middleware.ts`. Motivo: sem cookie o middleware dá 401 antes da rota. Hoje 3 crons estão barrados (ver tabela).
- **Rota de cron segue um padrão:** GET, `export const dynamic = 'force-dynamic'`, `isCronAuthorized` de `app/api/whatsapp/cron/auth.ts`, idempotente e com `maxDuration` ≤ 300 (teto adotado no projeto; o `RUN_BUDGET_MS` de 240s supõe isso). Motivo: a Vercel pode repetir ou pular rodada. Hoje há 4 cópias locais de `isCronAuthorized`; não crie a quinta.
- **Nunca hardcode `CRON_SECRET`.** Sem a env, todo cron responde 401. Motivo: um valor antigo já vazou no git via `whatsapp-cron.cmd`.
- **Cron é UTC e o Node da Vercel também.** Corte por dia, mês ou hora só via `app/_shared/utils/date-br.ts`. Motivo: das 21h em diante em Brasília, o UTC já está no dia seguinte.
- **Fase de cron que manda mensagem ao cliente roda uma conversa por vez** com `createPacer` (intervalo `WA_SEND_GAP_MIN_S`/`WA_SEND_GAP_MAX_S`, padrão 7–15s) e orçamento `RUN_BUDGET_MS` = 240s. Motivo: rajada paralela é lida como spam pela Meta e estoura os 300s.
- **Não recoloque `/api/whatsapp/cron` (agregadora) no `vercel.json`.** Motivo: as fases rodariam em dobro. README e `vercel/pro-checklist.md` ainda citam essa rota e estão desatualizados.
- **No webhook da Meta:** leia o corpo cru antes do JSON (HMAC), responda 500 só em falha de ingestão e não coloque rate limit de WAF nessa rota. Motivo: a Meta reenvia em rajada, e a assinatura já protege.
- **O HMAC do webhook usa só o `WHATSAPP_APP_SECRET` global.** Motivo: `appSecretEnc` não é lido, então todo número novo precisa ser do mesmo App da Meta.
- **Número inativo ou desconhecido nunca cai no default.** `getCreds(id)` devolve null e o webhook ignora o lote. Motivo: senão a resposta sai pela linha errada. Exceção: se o número desativado for o mesmo de `WHATSAPP_PHONE_NUMBER_ID`, `getCredsByPhoneNumberId` devolve as creds da env (`numberId` null) e o lote entra como legado.
- **O webhook da Meta faz tudo em linha antes de responder:** ingestão, debounce do bot (`sleep` de 8s + checagem no banco por mensagem mais nova), chamada ao cérebro (timeout 45s) e ficha por IA. Motivo: por isso o `maxDuration` é 120; não empilhe trabalho síncrono novo ali.
- **Trocar `WHATSAPP_CRED_KEY` (ou `NEXT_AUTH_SECRET` sem ela) invalida os tokens salvos.** A chave precisa ser igual entre local e Vercel. Motivo: token indecifrável faz o sistema cair na env ou ficar sem envio.
- **Body de função ≤ 4,5 MB** em qualquer plano. Motivo: a Vercel rejeita antes do código, e o Pro não muda isso. Use presigned S3.
- **Arquivo lido do disco com nome dinâmico entra em `outputFileTracingIncludes`.** Motivo: o tracing não enxerga essa leitura e dá ENOENT só em produção (já aconteceu com `templates/*.docx` e `pdf.worker.mjs`).
- **Nunca rode `prisma migrate dev` nem `migrate reset` contra o Neon.** Motivo: o drift faz o Prisma propor reset do schema `public`. O README sugere `migrate dev`: ignore.
- **Não valide com `next build` local.** Motivo: ele morre por OOM ou em silêncio. Valide com `tsc`, `lint` e `test`; o build fica para a Vercel.
- **O middleware só garante que existe sessão, e cliente da área do cliente também tem sessão.** Rota nova de equipe usa `requireTeam()` ou `requirePermission()` (`app/_shared/lib/permissions-server.ts`, que aplica a trava de IP). Elas **lançam** erro: envolva em try/catch e devolva 403. `getSessionPermissions()` sozinho não aplica a trava. Hoje **nenhuma** rota de `app/api` usa `requireTeam`/`requirePermission` (só server actions): ~36 das 74 rotas não checam nada além do middleware e 6 usam `getSessionPermissions` (sem trava de IP).
- **`verifyWebhookSecret` fica aberto se a env não existir.** Motivo: compatibilidade. Defina a env antes de confiar.
- **`rateLimit`, o cache de credenciais WhatsApp (60s) e o cache de permissões (30s) vivem em memória por instância.** Motivo: nada é compartilhado entre lambdas; o limite real é maior e `invalidateNumberCache`/troca de permissão só valem na instância que a executou.
- **`reportCriticalError` só faz `console.error`** (o Discord foi removido). Motivo: o log da Vercel é efêmero, não espere alerta.
- **Toda chamada nova de IA grava `metadata.usage`** (`{model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}`) no `Log`. Motivo: o custo é somado por `jsonb_exists(metadata,'usage')` e sem isso a chamada some do painel.
- **`/api/whatsapp/brain-prompt` não pode ter nada volátil em `rendered`.** Motivo: o cache de prompt da Anthropic é por prefixo byte a byte.
- **Microserviço fora do ar degrada, não quebra:** o relay cai para polling e o bot joga a conversa na fila humana. Mudança de comportamento neles exige deploy no Railway; mexer só no Next não basta.

## Receitas
- **Criar cron novo.** Mexa em: rota GET com `isCronAuthorized` importado de `app/api/whatsapp/cron/auth.ts`, entrada em `vercel.json` e prefixo em `PUBLIC_API_PREFIXES`. Cuidado com idempotência, UTC e `maxDuration`. Valide com `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/<path>` **sem cookie**. Se vier `{"error":"Não autenticado"}`, o middleware barrou.
- **Destravar os 3 crons barrados.** Mexa em `PUBLIC_API_PREFIXES` e adicione `/api/automations/cron`, `/api/costs/sync` e `/api/maintenance/retention`. Cuidado: as 3 rotas já validam o `CRON_SECRET` sozinhas. Valide pela aba Cron Jobs da Vercel e pela `app_settings.cost_sync_status`.
- **Webhook externo novo.** Mexa em `verifyWebhookSecret(req, '<ENV>')` (o chamador manda header `x-webhook-secret` ou `?secret=`), no prefixo do middleware e no nome no `.env.example`. Cuidado: sem a env, a rota fica aberta. Valide com uma chamada sem o secret, que deve dar 401.
- **Rota longa (IA, conversor, S3 em lote).** Use `export const maxDuration` (até 300). Upload maior que 4,5 MB vai por `getPresignedUrls` / `getRoteiroUploadUrls`. Valide com um arquivo grande em produção (erro `FUNCTION_PAYLOAD_TOO_LARGE` indica que passou pelo body).
- **Nova env.** Registre nome e comentário no `.env.example` e configure na Vercel em Production e Preview. Se for de custo, adicione também em `COST_PROVIDER_INFO[...].envVars`. Cuidado: env nova só vale no próximo deploy.
- **Novo provedor de custo.** Mexa em `COST_SERVICES` + `COST_PROVIDER_INFO` (`app/_shared/lib/costs.ts`) e crie o fetcher em `cost-providers.ts`, plugado em `fetchAllProviders`. Valide com `syncCostsNow` pelo painel ou `GET /api/costs/sync?days=3`.
- **Novo número de WhatsApp.** Cadastre pela tela Números (`createWaNumber` / `importEnvNumber` em `app/_actions/whatsapp/numbers.ts`). Cuidado: precisa ser do mesmo App da Meta (HMAC global), templates são por WABA e o cache de credenciais dura 60s (`invalidateNumberCache`).
- **Ler arquivo do repo em runtime.** Acrescente o glob em `experimental.outputFileTracingIncludes` (`next.config.mjs`). O erro só aparece no deploy.
- **Mudar o schema Prisma.** Rode `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_<nome>/migration.sql` e **leia o SQL** (só siga se for aditivo). Depois: `npx prisma db execute --file <sql> --schema prisma/schema.prisma`, `npx prisma migrate resolve --applied <ts>_<nome>` e `npx prisma generate`. No Windows, pare o `next dev` antes (EPERM na DLL).
- **Disparar cron à mão em dev.** Use `whatsapp-cron.cmd` (roda as 3 fases) com `CRON_SECRET` no ambiente, ou `curl "<url>?secret=..."` para as rotas que passam no middleware.
- **Rodar smoke de assinatura.** Use `npm run sign:pdf`, `sign:seed`, `sign:templates` ou `sign:flow`. Cuidado: eles tocam docx-converter, S3, Meta e banco **reais**, e `sign:templates` cria templates na Meta de verdade.
- **Caçar código morto.** Rode `npx knip`. `app/_bot/` é o bot legado do Discord (`discord.js` nem está nas dependências) e `app/api/migrate-hospitals/route.ts` foi uso único.

## Testes e validação
- **Validar local** (é o mesmo que o CI faz): `npx prisma generate && npx tsc --noEmit && npm run lint && npm test`.
- **Inventário de `tests/`:**
  - `automation-conditions.test.ts`: prazo por dia de calendário (bug de sinal/fuso), cobre `time-check`.
  - `costs.test.ts`: `parseMoneyToCents`/`formatMoney` com vírgula ou ponto.
  - `date-br.test.ts`: cortes de dia em UTC vs. Brasília.
  - `doc-ia.smoke.test.ts`: tags `{{ }}` e `[[ ]]` do Gerador de Documento, sem rede.
  - `format.test.ts`: CPF e dígitos.
  - `permissions.test.ts`: `isTeamRole`, `resolvePermissions`, `parseOverrides`.
  - `ponto.test.ts`: cálculo do banco de horas.
  - `whatsapp-template-text.test.ts` e `whatsapp-wa-format.test.ts`: texto de template e markup.
  - `signature-{pdf,seed,templates,flow-seed}.smoke.test.ts`: `describe.skipIf`, rodam só via `npm run sign:*` ou env `SIGNATURE_*=1`.
- **Lacuna:** não há teste de `middleware.ts`, das rotas de cron, do webhook (HMAC) nem dos clientes externos. Valide à mão:
  - Cron: `curl` com Bearer e sem cookie (ver Receitas). Em produção, aba Cron Jobs da Vercel.
  - Webhook: `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123` tem que devolver `123`. POST sem assinatura válida tem que dar 401.
  - Relay: `GET /api/chat/token` logado devolve `{url,token}`, ou `{url:null}` quando o relay não está configurado.
  - Custos: `app_settings.cost_sync_status` e `cost_snapshots.fetchedAt`.

## Fronteiras
- **Auth e permissões** (`docs/ai/auth-permissoes.md`): `middleware.ts`, `requireTeam` / `requirePermission` / `getSessionPermissions`, `checkDashboardIpAccess`, `rateLimit`, `verifyWebhookSecret`.
- **Analytics e custos** (`docs/ai/analytics-custos.md`): `runCostSync` → `CostSnapshot`; `app/_actions/costs/overview.ts` (`getCostOverview`, `syncCostsNow`); `app/_actions/analytics/get-ai-corner.ts` lê `metadata.usage`.
- **WhatsApp e bot** (`docs/ai/whatsapp-bot.md`): as fases em `app/_shared/lib/whatsapp/cron-tasks.ts`; o webhook chama `service.ts` (`ingestIncomingMessage`, `applyStatusUpdate`), `bot.ts` (`handleIncomingWhatsApp`), `ficha-ai.ts` (`autoFillClientInfo`) e `account-events.ts` (`handleAccountEvent`). Os tetos de recuperação ficam em `recovery-caps.ts` (`recoveryCapForPhoneNumberId`).
- **Kanban e automações** (`docs/ai/kanban-cards.md`): `runTimeBasedAutomations` (`app/_shared/lib/automation-executor.ts`), cron `time-check`.
- **Documentos** (`docs/ai/documentos-ia.md`): `purgeExpiredTrash` (`app/_actions/documents/trash.ts`), presign em `app/_actions/documents/upload-s3.ts`.
- **Assinatura eletrônica** (`docs/ai/assinatura.md`): `runSignatureReminders` (`app/_shared/lib/signature/core.ts`, desligado por `SIGNATURE_CRON_ENABLED = false` em `cron-tasks.ts`). O PDF passa pelo docx-converter (`signature/pdf.ts`).
- **Chat da equipe** (`docs/ai/workspace-equipe.md`): `broadcastToRelay` / `signRelayToken` (`app/_shared/lib/chat-relay.ts`) e o relay externo em `D:\chat_site`.
