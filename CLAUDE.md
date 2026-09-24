# CRM Seguros Paraná — guia para IA

CRM jurídico (DPVAT/INSS) da Seguros Paraná: kanban de cards de clientes, inbox WhatsApp multi-número com bot de triagem por IA, assinatura eletrônica própria, documentos/IA, dashboards de gestão, site público e área do cliente. **O `.env` local aponta para o banco de PRODUÇÃO (Neon).**

## Stack
Next.js 14 (App Router, server actions) · TypeScript · Prisma 6 + Neon Postgres · NextAuth v4 (JWT) · Tailwind + shadcn/Radix · AWS S3/SES/SNS · Meta WhatsApp Cloud API · Anthropic + Gemini · Vercel Pro (deploy da `main`) · Railway (microserviços).

Microserviços **fora deste repo** (deploy próprio, não mudam com deploy da Vercel):
- `D:\Chatbot_whatsapp` — cérebro do bot (`bot.js` decide, `index.js` expõe `/reply`). Busca o prompt vivo em `/api/whatsapp/brain-prompt`.
- `D:\docx-converter` — DOCX→PDF e IA do Roteiro.
- relay SSE do chat (ver `railway/chat-relay.md`).

## Comandos
```bash
npx tsc --noEmit        # tipos (main = 0 erros; ~30s incremental)
npm run lint            # eslint (lento: ~40s; em arquivos: npx eslint <arquivos>)
npm test                # vitest (tests/*.test.ts; *.smoke.test.ts precisam de banco)
npm run dev             # preview "dev" do .claude/launch.json
```
**Não rode `next build` local** — morre por OOM. Validação = tsc + lint + testes; o build de verdade é o da Vercel (e o CI em `.github/workflows/ci.yml`).

## Mapas por domínio (leia o mapa ANTES de abrir código)
| domínio | mapa | CLAUDE.md de pasta |
|---|---|---|
| WhatsApp, inbox, bot de IA, crons de SLA/nudge/recuperação, templates, multi-número | `docs/ai/whatsapp-bot.md` | `app/_shared/lib/whatsapp/` |
| Kanban, cards (User/Process), CardDialog, colunas (Label), automações, arquivados | `docs/ai/kanban-cards.md` | `app/nova-dash/` |
| Assinatura eletrônica (KIT, OTP, carimbo, /assinar, /verificar) — **desativada** | `docs/ai/assinatura.md` | `app/_shared/lib/signature/` |
| Documentos (S3, pastas, lixeira), modelos .docx, procuração, roteiro, Auditoria IA, Gerador IA | `docs/ai/documentos-ia.md` | — |
| Login, sessão, middleware, cargos/permissões, trava de IP, senhas | `docs/ai/auth-permissoes.md` | — |
| Menções/tarefas por setor, ponto, tickets dev, eventos, presença, chat da equipe | `docs/ai/workspace-equipe.md` | — |
| Dashboards, funil do bot, fluxo do kanban, Canto da IA, custos, retenção | `docs/ai/analytics-custos.md` | — |
| Site público, área do cliente, BotConversa, hospitais | `docs/ai/site-publico-cliente.md` | — |
| Schema Prisma (56 models por domínio), campos pegadinha, migrations | `docs/ai/data-model.md` | `prisma/` |
| Vercel/crons, Railway, CI, testes, scripts, env vars, serviços externos, convenções de rota | `docs/ai/infra-integracoes.md` | `app/api/` |
| Arquivos gigantes: sumário por seção com faixas de linhas | `docs/ai/hotspots.md` | — |

Cada mapa tem: TL;DR · Onde fica · Fluxo · Dados · Regras/armadilhas · **Receitas** ("para fazer X mexa em Y") · Testes · Fronteiras.

## Como trabalhar aqui
1. Tarefa com 3+ arquivos → `/plano <descrição>` (usa os mapas, lê o mínimo).
2. Varredura ampla → subagente `explorador-dominio` (devolve resumo, não arquivos).
3. Arquivo > 800 linhas (`WhatsAppInbox.tsx`, `KanbanBoard.tsx`, `signature/core.ts`, `whatsapp/bot.ts`, `AutomationsPanel.tsx`, `cron-tasks.ts`…) → leia só a seção indicada em `docs/ai/hotspots.md`.
4. Mudou `prisma/schema.prisma` → `/migration <nome>`.
5. Antes de dizer "pronto" → `/validar` (inclui o subagente `revisor-regras`).
6. Criou/moveu arquivo, mudou fluxo ou descobriu armadilha → `/mapa-atualizar <domínio>`.

Hooks ativos (`.claude/settings.json`): bloqueiam `prisma migrate dev/reset`, `db push` destrutivo, `DROP/TRUNCATE`, force-push na main e edição de `.env*`; no fim do turno rodam `tsc` se algum .ts/.tsx mudou.

## Regras invioláveis (valem para o projeto inteiro)
**Banco**
- Nunca `prisma migrate dev`/`reset`: há drift no Neon (o diff sempre traz `DROP TABLE "discord"` — apague essa linha). Fluxo: `migrate diff → db execute → migrate resolve` (`/migration`).
- Importe sempre `db` de `app/_shared/lib/prisma.ts`. Em tabela grande (`whatsapp_messages`, `logs`) nada de `distinct` do Prisma com `orderBy` — use `$queryRaw` com `DISTINCT ON`/`LATERAL`.
- `User` é ao mesmo tempo **card de cliente**, **membro da equipe** (`role` ADMIN/ADMIN+/ADMIN++) e **GHOST** (catálogo de hospitais). A coluna do card é `labelId`; `role` do card é só cópia do nome da coluna. Filtre equipe com `isTeamRole`.
- Multi-número: `phone` (contato) e `name` (template) só são únicos junto com `numberId` (nullable). Sem upsert: find-or-create manual.
- Toda query de `Document` filtra `deletedAt: null` (lixeira de 30 dias). Logs `move` e histórico do card nunca são purgados.

**Acesso e segurança**
- O `middleware.ts` só exige sessão — e cliente logado por CPF também tem sessão. Toda server action/rota da equipe começa com `requireTeam()`/`requirePermission()` de `app/_shared/lib/permissions-server.ts`. Decisão de acesso lê o banco (`getSessionPermissions`), não `session.user.role`.
- Rota chamada por máquina (cron, webhook, microserviço) ou página/action pública precisa entrar nas allowlists do `middleware.ts` (`PUBLIC_API_PREFIXES`, `PUBLIC_GET_APIS`, `PUBLIC_ACTION_PAGES`…) **e** validar o próprio segredo (`CRON_SECRET`, HMAC, token) dentro da rota. Sem isso: 401 silencioso.
- Rota/action do cliente tira o usuário de `getServerSession`, nunca de um id vindo do navegador.
- Permissão nova: `PERMISSION_DEFS` + `ROLE_DEFAULTS` (`permissions.ts`) + guard no servidor.
- Senha só via `hashPassword`/`verifyPassword`. Nunca hardcode segredo, token, IP ou dado pessoal.

**Tempo**
- A Vercel roda em UTC. Todo corte por dia/mês/hora (agrupamento, prazos, crons, ponto) passa por `app/_shared/utils/date-br.ts`. Nunca `toISOString().slice(0,10)`, `getDate()`, `getHours()` crus.

**WhatsApp / bot**
- O prompt vivo do bot está **no banco** (instruções + playbook publicados pela aba Instruções). Editar só o `bot.js` não muda produção. State/closeCategory/action novo = 3 lugares (instruções no banco, `STATES`/`responseSchema` no `bot.js`, `BotDecision`/switch no `bot.ts`); deploy do micro antes do CRM.
- Código não sobrescreve decisão do cérebro com texto fixo; falha do bot vai para `handoffToQueue` com motivo, nunca vira mensagem de erro ao cliente.
- Todo envio usa o `numberId` do contato (número inativo nunca cai no default); template só da WABA daquele número e `APPROVED`; mensagens proativas via `sendSystemWhatsApp` (opt-out, cooldown, opt-in). Opt-out só por regex (`opt-out.ts`).
- Não afrouxar cooldown, tetos de recuperação nem o marcapasso (`createPacer`): as duas WABAs já levaram aviso de spam da Meta.

**IA**
- Toda chamada de IA (Anthropic/Gemini) grava `metadata.usage` `{model,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}` no Log; preço só em `MODEL_PRICING` (`ai-pricing.ts`). Sem isso o gasto some do Canto da IA/custos.

**Vercel**
- Nada acima de 4,5MB pelo body de rota/action: upload/download por URL pré-assinada do S3, passando só a `key`. Arquivo lido do disco em runtime precisa estar em `outputFileTracingIncludes` (`next.config.mjs`).

**UI**
- Modo escuro é o Dark Reader (`darkreader`): classes `dark:` do Tailwind não têm efeito.
- O board e o inbox atualizam por polling com hash (sem `revalidatePath` ao mover/arquivar). Troca de aba da nova-dash: grave o `sessionStorage` antes de disparar o `CustomEvent`.

**Features desligadas de propósito** (não reative sem pedido): assinatura eletrônica (flags em código + `SIGNATURE_AUTO_ENABLED`), chat da equipe, envio de templates na linha pausada (`WhatsAppNumber.templatesPaused`).

## Convenções
- Código, UI, comentários e commits em **português**. Commits curtos no imperativo por área (`Bot WhatsApp: …`, `Kanban: …`).
- Server actions em `app/_actions/<domínio>/` (arquivo `"use server"` só exporta funções async — constantes/tipos compartilhados vão em outro arquivo), libs em `app/_shared/lib/`, utilitários puros e testáveis em `app/_shared/utils/`, componentes shadcn em `app/_shared/ui/`, UI da área logada em `app/nova-dash/`.
- Antes de criar algo "novo" (ação de automação, permissão, template, campo), confira no mapa se já existe — várias coisas já existem com outro nome.
- Teste manual roda contra PRODUÇÃO (`.env`): use card/contato/coluna de teste e apague ao final; erros de server action chegam mascarados em produção, então a UI precisa de mensagem própria.
- Siga a densidade de comentários do arquivo: comentários explicam o **porquê** (incidente, regra da Meta, limite da Vercel).
- Mapas descrevem o estado atual; histórico fica no git.
