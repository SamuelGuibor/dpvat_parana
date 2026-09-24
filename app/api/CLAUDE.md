# app/api — rotas HTTP (crons da Vercel, webhooks, pontes para microserviços, APIs do CRM)

Mapa completo: docs/ai/infra-integracoes.md

## Regras ao editar aqui
- **Rota chamada por máquina** (cron, webhook, microserviço) precisa entrar em `PUBLIC_API_PREFIXES` do `middleware.ts`. Sem isso, o middleware devolve 401 antes de a rota rodar. Hoje `automations/cron`, `costs/sync` e `maintenance/retention` estão fora dessa lista.
- **Rota de cron:**
  - GET com `export const dynamic = 'force-dynamic'`.
  - Autentique com `isCronAuthorized` de `app/api/whatsapp/cron/auth.ts`; não copie a função.
  - Seja idempotente e declare `maxDuration` ≤ 300.
  - Registre a rota em `vercel.json`. O agendamento é em UTC.
- **Nunca recoloque `/api/whatsapp/cron` (agregadora) no `vercel.json`.** As fases sla, nudge e recovery já têm cron próprio.
- **Nunca hardcode segredo ou URL de serviço.** Use `process.env.*` e registre o nome no `.env.example`.
- **Rota nova de equipe chama `requireTeam()` ou `requirePermission(key)`** (`app/_shared/lib/permissions-server.ts`, aplica a trava de IP). Elas lançam erro: try/catch e 403. O middleware só garante que existe sessão, e cliente também tem sessão. Hoje nenhuma rota daqui usa: não copie o padrão das vizinhas.
- **Webhook externo usa `verifyWebhookSecret(req, '<ENV>')`.** Ele fica ABERTO se a env não existir.
- **No webhook da Meta:**
  - Leia `req.text()` cru antes do JSON (HMAC).
  - Responda 500 só em falha de ingestão, que a Meta reenvia.
  - Não coloque rate limit de WAF nessa rota.
  - Tudo roda em linha (debounce de 8s do bot + cérebro + ficha IA) com `maxDuration` 120: não some trabalho síncrono.
- **Body > 4,5 MB não chega à função.** Arquivo vai por URL presign do S3; a rota recebe só a `key`.
- **Arquivo lido do disco com nome dinâmico** precisa entrar em `outputFileTracingIncludes` (`next.config.mjs`).
- **Datas e cortes por dia** passam por `app/_shared/utils/date-br.ts`. A Vercel roda em UTC.
- **Chamada nova de IA grava `metadata.usage`** no `Log`; sem isso some do painel de custos.
- **`whatsapp/brain-prompt` não pode ter nada volátil** no campo `rendered` (cache de prompt da Anthropic).
- **Nunca crie `PrismaClient`:** use `db` de `app/_shared/lib/prisma.ts`. S3 não tem cliente central (há ~32 `new S3Client`); reaproveite o do módulo vizinho em vez de criar outro.

## Validação
- `npx tsc --noEmit && npm run lint && npm test`. Não use `next build` local: ele morre por OOM, e o build fica para a Vercel.
- **Cron:** `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/<rota>` **sem cookie**. Se vier `{"error":"Não autenticado"}`, o middleware barrou.
- **Webhook Meta:** `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123` tem que devolver `123`.
- **Schema:** nunca `prisma migrate dev`. Siga o fluxo diff → `db execute` → `migrate resolve` do mapa.
