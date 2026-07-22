# Paraná Seguros — Site + CRM

Sistema completo do escritório Paraná Seguros (indenizações DPVAT e benefícios
do INSS): site institucional, área do cliente e CRM interno da equipe.

## Módulos

| Rota | O que é |
| --- | --- |
| `/` (`app/(site)`) | Site institucional: landing, blog, FAQ, equipe, contato (GA/Pixel/RD Station só aqui) |
| `/area-do-cliente`, `/status` (`app/(cliente)`) | Área do cliente: acompanhamento do processo por CPF |
| `/login` + `/login/recuperar-senha` | Login (CPF+senha) e recuperação de senha via código SMS/WhatsApp |
| `/nova-dash` (`app/nova-dash`) | CRM da equipe: kanban de leads, automações, inbox WhatsApp, chat interno, dashboard estratégico, tickets |

Código compartilhado em `app/_shared` (libs, hooks, UI shadcn), server actions
em `app/_actions`, rotas de API em `app/api`, schema Prisma em `prisma/`.

## Dependências externas

- **PostgreSQL (Neon)** — banco principal (`DATABASE_URL`).
- **AWS S3** — documentos, avatares e mídia do WhatsApp (URLs pré-assinadas).
- **WhatsApp Cloud API (Meta)** — inbox de atendimento + avisos automáticos; webhook em `/api/whatsapp/webhook` (HMAC).
- **Chatbot WhatsApp** — projeto separado em `D:\Chatbot_whatsapp` (qualificação de leads por IA); tem restart próprio.
- **docx-converter** — microserviço separado em `D:\docx-converter` (roteiros com IA e DOCX→PDF); não roda dentro do Next.
- **Chat relay (Railway)** — SSE do chat interno/inbox (`CHAT_RELAY_*`); sem ele o chat cai para polling.
- **Vercel Pro** — deploy + crons (`vercel.json`): `/api/whatsapp/cron` (15 min) e `/api/afastamentos/check` (30 min), autenticados por `CRON_SECRET`.
- **Discord** — notificações internas e alertas de erro crítico (`app/_shared/lib/report-error.ts`).
- **Twilio (opcional)** — SMS do "esqueci minha senha"; sem credenciais o código vai por WhatsApp.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha as variáveis (ver comentários no arquivo)
npx prisma generate
npm run dev            # http://localhost:3000
```

Migrations: `npx prisma migrate dev --name <nome>` (aplica direto no banco da
`DATABASE_URL` — cuidado com produção).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest) |
| `npx tsc --noEmit` | Type-check |

CI (GitHub Actions, `.github/workflows/ci.yml`): type-check + lint + testes em
todo push/PR.

## Permissões da equipe

Três cargos: `ADMIN` < `ADMIN+` < `ADMIN++` (Super Admin). O ADMIN++ gerencia
cargos e permissões individuais pela tela **Equipe** do CRM (o que cada um pode
ver/fazer: Arquivados, arquivar/excluir cards, Tickets, Automações, Visão do
Gestor). Fonte única: `app/_shared/lib/permissions.ts`; validação no servidor
via `requirePermission()` (`permissions-server.ts`).
