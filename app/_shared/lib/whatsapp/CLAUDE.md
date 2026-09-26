# app/_shared/lib/whatsapp — núcleo do WhatsApp Cloud API + bot de IA (ingestão, cérebro, envio, crons)

Mapa completo: docs/ai/whatsapp-bot.md

## Regras para quem edita aqui
- O prompt vivo do bot está no BANCO (`WhatsAppInstructions`, publicado pela aba Instruções). O `STATIC_SYSTEM_PROMPT` de `D:\Chatbot_whatsapp\bot.js` é só fallback.
- State, closeCategory ou action novo mexe em 3 lugares: instruções (banco), `STATES`/`responseSchema` no `bot.js` e `BotDecision`/`switch` no `bot.ts`. Campo novo no payload também entra no destructuring do `/reply` em `index.js`.
- Contrato mudou → deploy do micro (Railway) ANTES do CRM (Vercel).
- `flattenRules` (rule-events.ts) e `getRuleMetrics` (`app/_actions/whatsapp/rule-metrics.ts`) numeram R1..Rn igual ao `renderPlaybook` (bot.js). Mudou um, mude os três.
- `sanitizeDecision`/`looksLikeReasoning`/`SCRIPT_STATES` do bot.ts espelham o bot.js: mude nos dois.
- Não crie trava de negócio no código (qualificar, transferir, resolver). Mande o fato no payload e deixe o cérebro decidir; o código só tem rede de segurança.
- Nenhuma falha pode virar mensagem de erro ao cliente: use `handoffToQueue` com o motivo real. Dentro do fluxo do bot, `handoffToQueue`/`qualifyToQueue` vão sempre com `{ onlyIfStatus: "bot" }` e o envio de blocos passa por `shouldAbortSend`: sem isso o bot rouba ou atropela a conversa que o atendente assumiu. Erro engolido vai por `reportCriticalError(contexto, err, { contactId })`.
- Chame `captureConversation` ANTES de qualquer update que encerre a conversa, passando `outcome`, e `syncCloseTag` (`close-tags.ts`) DEPOIS dele: todo encerramento leva a tag do desfecho, e só desqualificação tira a "Qualificada".
- Encerramento/standby pelo cron só por `finalizeClose`/`enterStandby` (UPDATE com guard de status + `botNudge30At`): mensagem nova do cliente derruba o encerramento. Órfã = pergunta do cliente sem log `wa_bot` depois (`isBotDecisionLog`), nunca "o bot ficou calado"; turno novo do bot que termina sem gravar `wa_bot` vira órfã na Fila.
- Dono pegajoso (`ownership.ts`, env `WA_HUMAN_HOLD_DAYS`): devolver, reabrir e ir à fila guardam o último atendente, mas a conversa reabre em `bot` e quem decide é o cérebro. Última fala humana: o cron segura com `botNudge30At` NO FUTURO e, passada a janela, encerra sem standby (nada de template MARKETING a contato frio).
- Não ponha nada volátil (timestamp, ordem instável) em `renderInstructions`, `getBrainExamples` ou `/api/whatsapp/brain-prompt`: isso quebra o cache de prompt.
- Todo envio usa o `numberId` do contato. Número inativo → `getCreds` devolve null; nunca caia no default. Crons filtram com `activeNumberConversationWhere()`.
- O bot roda dentro do webhook (`maxDuration` 120). Debounce + 3 tentativas de 45s já passam disso: não aumente timeout nem tentativas sem rever o teto.
- `runFlowForContact` e `sendText` direto não checam opt-out nem janela de 24h. `sendBotReply` descarta sem erro texto repetido em 10min.
- Upsert por `phone` (contato) ou `name` (template) precisa de find-or-create manual: as uniques são `[numberId, phone]` e `[numberId, name]`.
- Mensagem proativa nova vai por `sendSystemWhatsApp` (opt-out, cooldown, janela 24h, opt-in, template APPROVED da WABA certa) com `systemSource` novo registrado em `SYSTEM_SOURCE_LABELS` (bot.ts). O campo de entrada é `source`; ele vira `WhatsAppMessage.systemSource`.
- Template só sai por `sendTemplate` (onde vale `templatesPaused`). Exija `status === "APPROVED"`.
- Opt-out só por regex (`opt-out.ts`). A IA nunca marca `optedOut`. Mantenha o "de" obrigatório em "para de ...".
- Não use `distinct` do Prisma com `orderBy` em `whatsapp_messages`; use SQL `LATERAL`/`DISTINCT ON`.
- Cortes de dia/mês/hora vêm de `app/_shared/utils/date-br.ts` (servidor em UTC), inclusive o horário comercial dos crons (7h–21h BRT: `isBrBusinessHour`/`nextBrBusinessSlot`). Mensagem proativa nova de cron respeita essa janela.
- Toda chamada de IA nova grava `metadata.usage` no log. Resposta do cérebro descartada vai em `wa_bot_discarded` (nunca `wa_bot`); usage do Gemini (transcrição) nunca soma no do Claude.
- Evento novo no canal `whatsapp:<contactId>` sai por `broadcastWhatsAppEvent` (relay depois da resposta), não por `await broadcastToRelay`. Log `wa_*` sem IA pode ir por `runAfterResponse` com `at`; log de IA fica com await (só vai para depois da resposta junto com a chamada de IA inteira, como o resumo de vínculo).
- Aviso novo no sino (Notification do `whatsapp-bot`) vai para `waAlertRecipients` com audiência (dono → setor da Fila → equipe → gestores; política em `alert-policy.ts`), nunca `whatsappRecipients()` direto: a equipe toda em todo aviso eram ~1.890/dia e afogavam o LEAD QUALIFICADO (`WA_QUALIFIED_MARK`).
- Mudou teto/cadência da recuperação → `recovery-caps.ts` (o inbox lê o mesmo mapa). Não afrouxe cooldown, tetos nem marcapasso sem pedido: as duas WABAs já levaram aviso de spam da Meta.
- Schema Prisma: nunca `prisma migrate dev`; use `migrate diff` + `db execute` + `migrate resolve`.
- Campo novo na ficha: `AI_FIELDS`/`FIELD_LABELS` (ficha-ai.ts), `CLIENT_FIELDS` (`app/_actions/whatsapp/client-info.ts`) e `FichaTab` (CopilotPanel) mudam juntos. A ficha grava no `User` com o mesmo nome de coluna: coluna `String?` (nunca data/número; `currentFields` faz `.trim()`) e migration ANTES do deploy. Receita no mapa.
- `autoFillClientInfo` só pula a IA com TODOS os `AI_FIELDS` cheios, inclusive os opcionais: na prática roda a cada rajada (`afterMessage` + debounce no webhook). Campo novo ali custa IA. Toda chamada à IA grava o log com usage, inclusive a que não achou nada (`noop`).
- O cérebro não recebe a ficha (`dados_cadastro` devolve só o nome): campo de ficha não exige deploy do micro. Edição pelo Copiloto (`saveClientInfo`) não gera log no card.

## Validação
- `npx tsc --noEmit` · `npm run lint` · `npm test` (o `next build` local morre por OOM; o build fica com a Vercel).
- Testes do domínio: `tests/whatsapp-template-text.test.ts`, `tests/whatsapp-wa-format.test.ts`, `tests/whatsapp-media-download.test.ts`, `tests/bot-timing.test.ts`, `tests/bot-telemetry.test.ts`, `tests/critical-error.test.ts`, `tests/wa-silence.test.ts`, `tests/ownership.test.ts`, `tests/alert-policy.test.ts`, `tests/close-tag-plan.test.ts`. Não rode `npm run sign:templates` à toa: ele cria templates reais na Meta.
- Bot ponta a ponta: número em `WHATSAPP_TEST_NUMBERS` → cérebro de `CHATBOT_URL_STAGING`; confira o log `wa_bot` (`outcome`, `leaked`, `usage`, `effective`, `botLatencyMs`).
- Cron manual: de preferência a fase isolada (`GET /api/whatsapp/cron/nudge` etc.) com `CRON_SECRET`, logo depois de uma rodada agendada concluída (roda para todos os clientes); veja `[WHATSAPP CRON]` nos logs.
