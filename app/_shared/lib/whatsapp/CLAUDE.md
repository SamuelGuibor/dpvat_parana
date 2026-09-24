# app/_shared/lib/whatsapp — núcleo do WhatsApp Cloud API + bot de IA (ingestão, cérebro, envio, crons)

Mapa completo: docs/ai/whatsapp-bot.md

## Regras para quem edita aqui
- O prompt vivo do bot está no BANCO (`WhatsAppInstructions`, publicado pela aba Instruções). O `STATIC_SYSTEM_PROMPT` de `D:\Chatbot_whatsapp\bot.js` é só fallback.
- State, closeCategory ou action novo mexe em 3 lugares: instruções (banco), `STATES`/`responseSchema` no `bot.js` e `BotDecision`/`switch` no `bot.ts`. Campo novo no payload também entra no destructuring do `/reply` em `index.js`.
- Contrato mudou → deploy do micro (Railway) ANTES do CRM (Vercel).
- `flattenRules` (rule-events.ts) e `getRuleMetrics` (`app/_actions/whatsapp/rule-metrics.ts`) numeram R1..Rn igual ao `renderPlaybook` (bot.js). Mudou um, mude os três.
- `sanitizeDecision`/`looksLikeReasoning`/`SCRIPT_STATES` do bot.ts espelham o bot.js: mude nos dois.
- Não crie trava de negócio no código (qualificar, transferir, resolver). Mande o fato no payload e deixe o cérebro decidir; o código só tem rede de segurança.
- Nenhuma falha pode virar mensagem de erro ao cliente: use `handoffToQueue` com o motivo real.
- Chame `captureConversation` ANTES de qualquer update que encerre a conversa, passando `outcome`.
- Não ponha nada volátil (timestamp, ordem instável) em `renderInstructions`, `getBrainExamples` ou `/api/whatsapp/brain-prompt`: isso quebra o cache de prompt.
- Todo envio usa o `numberId` do contato. Número inativo → `getCreds` devolve null; nunca caia no default. Crons filtram com `activeNumberConversationWhere()`.
- O bot roda dentro do webhook (`maxDuration` 120). Debounce + 3 tentativas de 45s já passam disso: não aumente timeout nem tentativas sem rever o teto.
- `runFlowForContact` e `sendText` direto não checam opt-out nem janela de 24h. `sendBotReply` descarta sem erro texto repetido em 10min.
- Upsert por `phone` (contato) ou `name` (template) precisa de find-or-create manual: as uniques são `[numberId, phone]` e `[numberId, name]`.
- Mensagem proativa nova vai por `sendSystemWhatsApp` (opt-out, cooldown, janela 24h, opt-in, template APPROVED da WABA certa) com `systemSource` novo registrado em `SYSTEM_SOURCE_LABELS` (bot.ts). O campo de entrada é `source`; ele vira `WhatsAppMessage.systemSource`.
- Template só sai por `sendTemplate` (onde vale `templatesPaused`). Exija `status === "APPROVED"`.
- Opt-out só por regex (`opt-out.ts`). A IA nunca marca `optedOut`. Mantenha o "de" obrigatório em "para de ...".
- Não use `distinct` do Prisma com `orderBy` em `whatsapp_messages`; use SQL `LATERAL`/`DISTINCT ON`.
- Cortes de dia/mês vêm de `app/_shared/utils/date-br.ts` (servidor em UTC).
- Toda chamada de IA nova grava `metadata.usage` no log.
- Mudou teto/cadência da recuperação → `recovery-caps.ts` (o inbox lê o mesmo mapa). Não afrouxe cooldown, tetos nem marcapasso sem pedido: as duas WABAs já levaram aviso de spam da Meta.
- Schema Prisma: nunca `prisma migrate dev`; use `migrate diff` + `db execute` + `migrate resolve`.
- Campo novo na ficha: `AI_FIELDS`/`FIELD_LABELS` (ficha-ai.ts), `CLIENT_FIELDS` (`app/_actions/whatsapp/client-info.ts`) e `FichaTab` (CopilotPanel) mudam juntos. A ficha grava no `User` com o mesmo nome de coluna: coluna `String?` (nunca data/número; `currentFields` faz `.trim()`) e migration ANTES do deploy. Receita no mapa.
- `autoFillClientInfo` só pula a IA com TODOS os `AI_FIELDS` cheios, inclusive os opcionais: na prática roda a cada inbound novo. Campo novo ali custa IA.
- O cérebro não recebe a ficha (`dados_cadastro` devolve só o nome): campo de ficha não exige deploy do micro. Edição pelo Copiloto (`saveClientInfo`) não gera log no card.

## Validação
- `npx tsc --noEmit` · `npm run lint` · `npm test` (o `next build` local morre por OOM; o build fica com a Vercel).
- Testes do domínio: `tests/whatsapp-template-text.test.ts`, `tests/whatsapp-wa-format.test.ts`. Não rode `npm run sign:templates` à toa: ele cria templates reais na Meta.
- Bot ponta a ponta: número em `WHATSAPP_TEST_NUMBERS` → cérebro de `CHATBOT_URL_STAGING`; confira o log `wa_bot` (`outcome`, `leaked`, `usage`).
- Cron manual: `GET /api/whatsapp/cron` com `CRON_SECRET` (`whatsapp-cron.cmd`); veja `[WHATSAPP CRON]` nos logs.
