# Site público, área do cliente e integrações de entrada — mapa para IA
> Verificado em 2026-09-23 · Escopo: `app/(site)/**`, `app/(cliente)/**`, `app/store/**`, `app/layout.tsx`, `app/{sitemap,robots}.ts`, `public/` (estrutura), `app/api/{process-status,zapier,botconversa,migrate-hospitals}/**`, `app/_actions/botconversa.ts`, `app/_shared/lib/aws-messaging.ts` (+ satélites lidos: `app/_shared/lib/db/botconversa.ts`, `app/_actions/contacts/*`, `app/_actions/users/{user-stats,get-status-user}.ts`, `app/_actions/process/get-status-process.ts`, `app/_components/landing_page/*`)

## TL;DR
- **Site institucional** (grupo `(site)`): home, blog com 4 posts estáticos, FAQ, equipe e páginas legais. Todo o conteúdo está escrito direto no TSX (sem CMS). A única escrita no banco é o formulário de contato (`ContactUsers` → tabela `Contact`).
- **Área do cliente** (grupo `(cliente)`): o cliente entra com CPF e senha (mesma tabela `User` da equipe) e vê cartões "Acidente N" com uma linha do tempo de etapas lida de `User.status` (`/status`) ou de `Process.status` (`/status/[processId]`). **Nunca mostra documentos.**
- **Integrações de entrada**: webhook do BotConversa `/api/botconversa/contratado` (cria card, tarefa de setor e linha em `Botconversa`), rotas legadas do MiniKanban, proxy Zapier sem chamador, migração de hospitais **destrutiva** e `aws-messaging.ts` (SMS SNS / e-mail SES da recuperação de senha).
- Quebra mais: (1) as allowlists do `middleware.ts`: página, action ou API pública que não entra lá vai para o login ou leva 401. A home `/` **não** está em `PUBLIC_ACTION_PAGES`; (2) as etapas de status estão copiadas em 3 lugares e o portal usa semântica deslocada em uma etapa; (3) actions e rotas do cliente confiam em ids enviados pelo navegador (IDOR).

## Onde fica
| Arquivo/pasta | Responsabilidade | Símbolos-chave |
|---|---|---|
| `app/layout.tsx` | Layout raiz: metadata global (template `%s \| Paraná Seguros`, OG, `metadataBase`, canonical `/`), fonte, `AuthProvider` (SessionProvider) envolvendo `NotificationsProvider`, `Toaster` | `metadata`, `RootLayout` |
| `app/store/provider.tsx` | Contexto de notificações em memória. **Montado no layout raiz, mas sem consumidor** (o sino real usa `app/_shared/hooks/use-notifications.ts`); apagar exige tirar o import do `app/layout.tsx` | `NotificationsProvider`, `useNotifications`, `Notification` |
| `app/sitemap.ts` / `app/robots.ts` | `/sitemap.xml` (lista fixa de 10 URLs) / `/robots.txt` (bloqueia `/nova-dash`, `/api/`, `/area-do-cliente`, `/status`, `/login`) | `sitemap`, `robots` |
| `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` | Páginas de erro com a marca | — |
| `app/(site)/layout.tsx` | **Único** lugar com GA4, Meta Pixel, RD Station e JSON-LD `LegalService` | `SiteLayout` |
| `app/(site)/page.tsx` + `section/stats.tsx` | Home `/`: monta as seções de `app/_components/landing_page/*` | `App`, `metadata`, `viewport`, `Stats` |
| `app/_components/landing_page/*.tsx` | Seções da home: `Header` (link para a nova-dash se ADMIN*), `Hero` (CTA → `/area-do-cliente` se logado, senão `/login`), `Contact` (formulário), `BlogSection` (lista **própria** de posts), `video` (next-video) | `Header`, `Hero`, `Contact`, `BlogSection`, `Footer` |
| `app/(site)/blog-seguros-parana/**` | Índice client (`blogPosts` fixo + busca) e 4 posts; metadata no `layout.tsx` de cada pasta | `BlogPage`, `BlogArticle`, `PostLayout` |
| `app/(site)/faq/page.tsx` + `faq/section/feature.tsx` | FAQ em dados, com busca; reusa a `Sidebar` do cliente | `Feature`, `CATEGORIES`, `WHATSAPP_URL` |
| `app/(site)/nossa-equipe/page.tsx` | Página da equipe (cards que viram, fotos em `public/`) | `TeamPage` |
| `app/(site)/{politica-de-privacidade,politica-privacidade,termos-de-uso,exclusao-de-dados}/page.tsx` | Páginas legais. **Existem duas de privacidade**: o Footer aponta para a antiga, o sitemap para a nova | `PrivacyPolicyPage`, `PrivacyPolicy`, `TermsOfUse`, `DataDeletionPage` |
| `app/(site)/documents/page.tsx` | Só faz `redirect("/area-do-cliente")` (a listagem de documentos foi removida) | `Documents` |
| `app/(site)/documents/ponto-preview/page.tsx` | Página **temporária** com dados falsos do ponto. Fica pública por herdar o prefixo `/documents` | `PontoPreview` |
| `app/(cliente)/layout.tsx` | `noindex` e título | `ClienteLayout` |
| `app/(cliente)/area-do-cliente/page.tsx` + `section/demo.tsx` | Painel "Meus Processos" (cartões Acidente N) e acesso rápido | `AreaCliente`, `BentoDemo` |
| `app/(cliente)/area-do-cliente/section/{sidebar,sidebar-button}.tsx` | Menu (Início, Área do cliente, FAQ), gaveta no mobile | `Sidebar`, `SidebarButton` |
| `app/(cliente)/area-do-cliente/section/client-tour.tsx` | Tour de onboarding do cliente | `ClientTour`, `START_CLIENT_TOUR_EVENT` |
| `app/(cliente)/status/page.tsx` + `status-progress.tsx` | Linha do tempo do card do próprio usuário ("Acidente 1") | `StatusPage`, `ProgressTimeline` (default), `getStepsByService`, `getCompletedSteps` |
| `app/(cliente)/status/[processId]/{page,status-progress}.tsx` | Mesma linha do tempo para um `Process`. **Cópia quase idêntica** do componente acima | idem |
| `app/api/process-status/route.ts` + `app/_actions/users/user-stats.ts` | GET (anônimo: está em `PUBLIC_GET_APIS`) devolve `status/role/service/type` do Process; POST troca o status (módulo sem `"use server"`) | `GET`, `POST`, `getProcessStatus`, `updateProcessStatus` |
| `app/api/user-status/route.ts` + `app/_actions/users/user-status.ts` | Status do User da sessão, buscado por e-mail (fora do escopo; ver auth) | `getUserStatus`, `updateUserStatus` |
| `app/_actions/process/get-status-process.ts`, `app/_actions/users/get-status-user.ts` | Actions do painel, que **recebem o id do navegador** | `getStatusProcess`, `getStatus` |
| `app/_actions/contacts/{create,get,delete}-contact.ts` | Formulário do site (honeypot `company`, recusa URL no texto) e sua leitura/exclusão na dash | `ContactUsers`, `getContacts`, `DeleteContact` |
| `app/api/botconversa/contratado/route.ts` | Webhook do BotConversa | `POST`, `nextCardNumber` |
| `app/api/botconversa/{counts,monthly,get-kanban}/route.ts`, `changes/[id]/route.ts` | Leitura e edição da tabela `Botconversa` (MiniKanban legado). `counts` e `monthly` não têm chamador no app | `GET`, `PUT`, `DELETE` |
| `app/_shared/lib/db/botconversa.ts` | Consultas e classificação dos eventos | `EVENT_MAP`, `fetchEventsCount`, `fetchEventsByMonth`, `fetchBotconversaAll`, `DateRange` |
| `app/_actions/botconversa.ts` | Insights do Meta Ads e leads/dia do BotConversa, protegido por `requireTeam()`. **Sem chamador hoje** (o bloco BotConversa da Origem dos leads foi removido do dashboard) | `getBotconversaAdsData`, `BotconversaAdsData`, `CampaignInsight`, `isIaCampaignId` (interno) |
| `app/api/zapier/route.ts` | Repassa o POST para um hook Zapier fixo no código; sem chamador | `POST` |
| `app/api/migrate-hospitals/route.ts` | Migração única, só ADMIN++: catálogo `HOSPITALS` → Users `GHOST` | `POST`, `HOSPITALS`, `slugify` |
| `app/_shared/lib/aws-messaging.ts` | SMS (SNS) e e-mail (SES) transacionais; **nunca lançam** | `sendSmsAws`, `sendEmailAws`, `isAwsSmsConfigured`, `isAwsEmailConfigured`, `SendResult` |
| `public/` | Imagens do site e da equipe, `paranaseguros.png` (logo/OG), `fonts/`, `assinatura/` (vídeos da assinatura), `pdfjs/` (worker), `encoderWorker.min.js` (gravador de áudio do inbox), `llms.txt`/`llms-full.txt`. O vídeo da home fica em `videos/` (next-video, provider Mux) | — |

## Fluxo principal
**A) Visitante → lead do site**
1. `/` renderiza as seções no servidor; `app/(site)/layout.tsx` injeta GA, Pixel (só `PageView`), RD Station e JSON-LD.
2. `Contact` → `useFormState(ContactUsers)` → server action com POST em `/` → `middleware` → `db.contact.create` → a equipe vê em `app/nova-dash/form-leads.tsx` (`LeadsTable` via `getContacts`).
   - Pela lógica atual do middleware, `/` é página pública, mas **não** está em `PUBLIC_ACTION_PAGES`, então a action anônima recebe 401. Confirmado lendo o código; não foi testado em produção.
3. Os links de telefone e WhatsApp (JSON-LD, `Header`, `Contact`, `WHATSAPP_URL` do FAQ) estão fixos no código e apontam para a linha 2323.

**B) Cliente → etapa do processo**
1. `/login` (CPF + senha) → `role.startsWith("ADMIN") ? "/nova-dash" : "/area-do-cliente"`.
2. `BentoDemo` lê `useSession()` e chama em paralelo:
   - `getStatus(session.user.id)`: o próprio User vira "Acidente 1" → `/status`;
   - `getStatusProcess(userId)` (`fetchProcessesByUserId`): cada Process vira "Acidente 2, 3…" → `/status/<id>`.
   - Sem sessão, a página abre do mesmo jeito e mostra "Nenhum processo ativo" (não redireciona).
3. `/status` → `ProgressTimeline` faz `fetch('/api/user-status')` → `getUserStatus()` → `{status, service}`. Em `/status/[processId]` o fetch vai para `/api/process-status?processId=` → `getProcessStatus`. O polling roda a cada 30s e pula quando a aba está oculta (`document.hidden`).
4. `getStepsByService(service)` escolhe a grade DPVAT, INSS ou genérica. `getCompletedSteps(status, order)` marca como **concluídas todas as etapas até o índice do status, inclusive**; a seguinte aparece como "Em andamento".
5. `ClientTour` → `fetchOnboarding()` (`/api/onboarding`). Abre sozinho enquanto `client.done` for falso. Sem sessão a chamada leva 401 e o tour não aparece.

**C) BotConversa → CRM**
1. POST `/api/botconversa/contratado` com `{nome, telefone, evento}`. A rota é pública no middleware e a validação acontece dentro dela: `verifyWebhookSecret(req, 'BOTCONVERSA_WEBHOOK_SECRET')` lê o header `x-webhook-secret` ou `?secret=`.
2. Se `evento === 'contratado'`:
   - `recordSectorTask({ kind: 'botconversa_contratado', source: 'botconversa', … })` cria a tarefa no setor `comercial` da Caixa de Menções;
   - se não existe `User` com o mesmo `telefone`, cria o card com role `Filtro de Cartões`, `Label` com `order: 0`, `cardNumber` via `nextval('card_number_seq')`, e-mail placeholder `inserir_email-<telefone>@…` e senha padrão fixa (hasheada). Sem `service`, `status` nem `statusStartedAt` (o `createUser` normal grava `INSS`/`INSS_S1`/timer), sem log e sem automação.
3. Faz um upsert manual em `Botconversa` pelo `telefone`: uma linha por telefone; `evento` só é regravado quando muda (e só então `updatedAt` anda).
4. Quem lê: `getStrategicDashboardData` (`fetchEventsCount`, `fetchEventsByMonth`, `fetchBotconversaAll`), `getBotFunnel` em `bot-funnel.ts` (conta `evento='contratado'` por `updatedAt`) e `MiniKanban` (recebe `data` do `StrategicDashboard`, recarrega por `/api/botconversa/get-kanban` e usa `PUT`/`DELETE` em `changes/[id]`).

**D) Recuperação de senha** (única consumidora de `aws-messaging.ts`): `app/_actions/auth/password-reset.ts` manda SMS pela ordem SNS → Twilio → WhatsApp `sendText`, e e-mail só por SES. Detalhes em `docs/ai/auth-permissoes.md`.

## Dados
- **`User`**: é ao mesmo tempo o card do cliente e a conta da equipe. Campos que importam aqui:
  - `status`: etapa. `DPVAT_S1..S7`, `INSS_S1..S8` ou os genéricos `INICIADO`, `AGUARDANDO_ASSINATURA`, `SOLICITAR_DOCUMENTOS`, `COLETA_DOCUMENTOS`, `ANALISE_DOCUMENTOS`, `PERICIAL`, `AGUARDANDO_PERICIAL`, `PAGAMENTO_HONORARIO`, `PROCESSO_ENCERRADO`.
  - `service`: só `'DPVAT'` e `'INSS'` exatos têm grade própria; SPVAT, RCF, Seguro de Vida e TRABALHISTA caem na genérica.
  - `role`: tem dois significados. `ADMIN*` é equipe; qualquer outro valor é o nome da coluna do kanban; `GHOST` é card-fantasma.
  - `onboarding` (Json): `{ dash: {step, done}, client: {step, done} }`.
  - `cpf`: não é único e pode estar gravado com máscara. `email`: `@unique`; placeholders com `inserir-email`/`inserir_email` significam "sem e-mail". `hospital`, `cardNumber` (sequence `card_number_seq`).
- **`Process`**: card extra do mesmo cliente (`userId`), com os mesmos campos `status/service/type/hospital`. `createProcess` grava `INSS_S1` se o serviço é INSS e `DPVAT_S1` em qualquer outro.
- **`Contact`** (`name`, `number`, `desc`): leads do formulário do site. `getContacts` traz no máximo 500.
- **`Botconversa`** (`nome`, `telefone`, `evento`, `createdAt`, `updatedAt`, `marcado*`):
  - `evento` ∈ `iniciado`, `em_conversa`, `aguardando`, `enviou_documentos`, `em_honorario`, `contratado`, `nao_contratado`, `nao_qualificado`.
  - `createdAt` é o primeiro evento; `updatedAt` é a última troca e funciona como "data do contratado" no funil.
  - `marcado/marcadoEm/marcadoPor` não são usados por nenhum código em `app/`.
- **Duas classificações de evento que divergem**: `EVENT_MAP` (`db/botconversa.ts`) põe `em_honorario` e `enviou_documentos` em `emAndamento`, enquanto `QUALIFIED_EVENTS` (`_actions/botconversa.ts`) os conta como qualificados.
- **`PasswordResetCode`**: um por `userId`, com `codeHash`, `attempts`, `expiresAt`, `usedAt`. Pertence ao domínio de auth.
- **`Label.order = 0`**: primeira coluna do kanban, onde o webhook coloca o card novo.
- **Strings mágicas**: evento `start-tour-client`; atributos `data-tour="client-processos|client-links|client-menu|client-sidebar"`; kind `botconversa_contratado`; e-mail dos cards-fantasma `ghost_hosp_<slug>@hospital.internal` com nome `[HOSPITAL] <nome>`.
- **`Botconversa.nome` é obrigatório** no schema (`String`, não `String?`).
- **Env (só nomes)**: `BOTCONVERSA_WEBHOOK_SECRET`, `META_ADS_TOKEN_BOTCONVERSA`, `META_ADS_TOKEN`, `META_ADS_ACCOUNT_BOTCONVERSA` (nenhuma das quatro está no `.env.example`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SES_REGION`, `SES_FROM_EMAIL`, `SNS_SMS_SENDER_ID`.

## Regras invioláveis e armadilhas
- **GA, Pixel, RD Station e JSON-LD ficam só em `app/(site)/layout.tsx`.** No layout raiz eles disparariam dentro do CRM e da área do cliente e sujariam as métricas com o tráfego da equipe.
- **Toda rota pública nova precisa entrar nas allowlists do `middleware.ts`**, senão vai para `/login` ou leva 401:
  - página: `PUBLIC_PAGE_PREFIXES`;
  - server action anônima: `PUBLIC_ACTION_PAGES`;
  - GET público de API: `PUBLIC_GET_APIS` (igualdade exata).
- **O prefixo casa `p` e `p/…`.** Tudo que fica sob `/documents/` e `/status/` é público; é por isso que `ponto-preview` está exposto. Incluir `"/"` em `PUBLIC_ACTION_PAGES` libera só a home.
- **A área do cliente nunca mostra documentos.** `/documents` redireciona e o `GET /api/documents` exige role `ADMIN*`: anexos são material interno. O cérebro do bot segue a mesma regra ("portal mostra só etapa + FAQ").
- **As etapas de status existem em 3 cópias**: `app/nova-dash/card-dialog/constants.ts` (`*_STATUS_ORDER/LABELS/DESCRIPTIONS`) e as duas `status-progress.tsx`. Mexer em uma só faz portal, card e bot divergirem, e isso já acontece: `INSS_S5` é "Perícia realizada" no CRM e "Fase administrativa realizada" no portal.
- **O portal está deslocado em uma etapa.** Ele marca a etapa do status atual como "Concluído" e mostra a próxima como "Em andamento". Exemplo: com `DPVAT_S5`, o portal diz que a perícia terminou e o pagamento está em andamento, mas o bot (`whatsapp/bot.ts`, via `getStatusLabel`/`getStatusDescription` de `card-dialog/constants.ts`) diz "Perícia médica". Não corrija só um lado: é decisão de negócio.
- **Serviço fora de DPVAT/INSS começa sem progresso.** `createProcess` grava `DPVAT_S1` também em SPVAT/RCF, cujo portal usa a grade genérica. `indexOf` dá -1 e o progresso fica em 0% até a equipe escolher um status genérico.
- **IDOR nas rotas do cliente:**
  - `getStatus(id)` e `getStatusProcess(userId)` rodam sem sessão em `/area-do-cliente` e aceitam qualquer id;
  - `GET /api/process-status` é anônimo (`PUBLIC_GET_APIS`) e não confere o dono do processo.
  - `PUBLIC_ACTION_PAGES` libera a URL, não a action: toda action que uma página pública importa fica chamável sem login. A checagem de sessão tem de estar dentro da action.
  - Código novo deve tirar o usuário de `getServerSession`, nunca de um parâmetro.
- **Não use os POSTs de status.** `POST /api/process-status` exige só sessão e troca o status de **qualquer** Process; `POST /api/user-status` troca o do próprio usuário logado. Ambos pulam `notifyStatusProgress` e o log. Nenhum código os chama.
- **Rotas e actions "da equipe" neste domínio só exigem sessão, não papel `ADMIN*`**: `getContacts`, `DeleteContact` (delete físico), `/api/botconversa/*` (`get-kanban` devolve a tabela inteira com telefones; `PUT changes/[id]` repassa o body cru ao `update`; `DELETE` apaga) e `/api/zapier`. Um cliente logado alcança todas. Código novo: `requireTeam()`/`requirePermission()` de `app/_shared/lib/permissions-server.ts`.
- **`POST /api/migrate-hospitals` é destrutivo e não deve rodar de novo em produção.** Ele zera `hospital` de todos os Users não-GHOST e de todos os Processes, apaga todos os `GHOST` e os recria. O catálogo de `app/api/hospitals/route.ts` é justamente o `distinct` desses campos.
- **O webhook do BotConversa fica aberto se `BOTCONVERSA_WEBHOOK_SECRET` não estiver definida**: `verifyWebhookSecret` só registra um aviso.
- **O webhook não é idempotente nem transacional.** Cada POST `contratado` gera uma tarefa nova. A deduplicação do card compara `telefone` por igualdade exata, então o mesmo número em formato diferente (DDI, nono dígito) cria card duplicado. POST `contratado` sem `nome` e telefone novo cria tarefa e card e só então falha (500) ao gravar `Botconversa` (`nome` obrigatório); o reenvio duplica a tarefa.
- **Card vindo do webhook abre o portal em 0%**: sem `service` cai na grade genérica e sem `status` não marca etapa, até a equipe preencher.
- **Cards criados pelo webhook têm credenciais provisórias.** Recebem senha padrão fixa (hasheada; o ideal seria aleatória ou null) e e-mail placeholder. Limpe placeholders `inserir-email`/`inserir_email-` em exportações; `isRealEmail` (password-reset) já os trata como "sem e-mail".
- **CPF com máscara recupera a senha, mas não entra.** O login (`app/_shared/lib/auth.ts`) compara `cpf` por igualdade exata, com a UI mandando só dígitos. A recuperação compara só os dígitos (`regexp_replace`).
- **Página sem `metadata.alternates.canonical` herda o canonical `/` do layout raiz.** Hoje é o caso de `/termos-de-uso` (que está no sitemap) e de `/politica-privacidade`.
- **Título de página leva só o nome.** O template raiz já acrescenta "\| Paraná Seguros"; vários títulos atuais repetem a marca.
- **Não reduza o intervalo de polling do portal (30s, pausado com a aba oculta)**: cada tick é uma invocação na Vercel.
- **Datas agrupadas por dia ou mês passam por `app/_shared/utils/date-br.ts`** (`brDayKey`, `brMonthIndex`…): a Vercel roda em UTC. `fetchEventsByMonth` (agrupamento por `brMonthIndex`) e `getBotconversaAdsData` já seguem isso; os limites padrão do ano em `fetchEventsByMonth` (sem `range`) ainda são meia-noite UTC.
- **`sendSmsAws` e `sendEmailAws` nunca lançam: verifique sempre `.sent`.**
  - O telefone vai no formato `55DDDNUMERO`, sem `+` (use `normalizePhoneBR`).
  - SES exige `SES_FROM_EMAIL` verificado; SNS usa as mesmas credenciais AWS do S3.
  - `SES_REGION=""` (como no `.env.example`) **não** cai no `AWS_REGION`: o código usa `??`, que só troca `undefined`. Remova a variável em vez de deixá-la vazia.
- **Telefone e WhatsApp do site apontam para a linha 2323.** Segundo a memória de 18/09 (não conferido no banco), essa linha está inativa no CRM e voltou para o BotConversa, então quem fala por esses links não cai no inbox do CRM.
- **O Pixel do site ≠ dataset do CAPI.** O ID do Pixel está fixo em `(site)/layout.tsx` e é o dataset legado do BotConversa. Os eventos do CRM vão para `META_DATASET_ID` (`app/_shared/lib/meta-conversions.ts`). Não misture os dois.
- **`/api/zapier` tem a URL do hook fixa no código.** Trate como credencial: não copie nem registre em log.
- **Não confunda os dois `useNotifications`.** `app/store/provider.tsx` é código morto; o hook real é `app/_shared/hooks/use-notifications.ts`.

## Receitas
- **Página pública nova no site** → crie `app/(site)/<rota>/page.tsx`; se a page for client, a metadata vai num `layout.tsx` ao lado.
  - Registre o prefixo em `PUBLIC_PAGE_PREFIXES` (`middleware.ts`) e a URL em `app/sitemap.ts`.
  - Cuidado: `alternates.canonical` próprio e título sem a marca.
  - Valide: aba anônima + `/sitemap.xml`.
- **Post novo no blog** → crie a pasta `app/(site)/blog-seguros-parana/<slug>/` com `page.tsx` e `layout.tsx` (metadata).
  - Adicione o post em `blogPosts` de `blog-seguros-parana/page.tsx`, em `blogPosts` de `app/_components/landing_page/BlogSection.tsx` (se for aparecer na home) e em `sitemap.ts`.
  - Cuidado: imagem remota só de `images.unsplash.com` (`remotePatterns` em `next.config.mjs`); o resto vai em `public/`.
- **Server action anônima em página pública** → inclua a rota em `PUBLIC_ACTION_PAGES`.
  - Cuidado: a action precisa validar a entrada e não pode aceitar id de usuário vindo do navegador.
  - Valide: aba anônima com o Network aberto (não pode aparecer 401).
- **Etapa de status nova ou renomeada** → atualize juntos `app/nova-dash/card-dialog/constants.ts` (ORDER/LABELS/DESCRIPTIONS) e as duas `status-progress.tsx` (`*Steps` + `*StatusOrder`).
  - Veja também as mensagens automáticas de etapa (`StatusMessageConfig`, `app/_shared/lib/whatsapp/status-notify.ts`).
  - Valide: coloque um card de teste no status e abra `/status`.
- **Texto de etapa mostrado ao cliente** → as duas `status-progress.tsx` e `*_STATUS_DESCRIPTIONS`, que o bot também lê. Mantenha os textos iguais.
- **Evento novo do BotConversa** → atualize `EVENT_MAP` (`db/botconversa.ts`), `QUALIFIED_EVENTS`/`DISQUALIFIED_EVENTS` (`_actions/botconversa.ts`) e `STAGE_DEFS` do `MiniKanban` (`app/nova-dash/minikanban.tsx`; evento fora da lista cai em "Outros").
  - Valide: `curl` com o header `x-webhook-secret`, usando evento diferente de `contratado`.
- **Script de marketing, Pixel ou JSON-LD** → só em `app/(site)/layout.tsx`. Valide no view-source de `/` e de `/nova-dash`.
- **Pergunta nova no FAQ** → adicione em `CATEGORIES` (`faq/section/feature.tsx`) com `id` único e `searchText` em texto puro, que é o que a busca usa.
- **Trocar telefone ou WhatsApp do site** → JSON-LD de `(site)/layout.tsx`, `Header.tsx`, `Contact.tsx` e `WHATSAPP_URL` do FAQ. O link de `status/[processId]/status-progress.tsx` ainda é um placeholder.
- **SMS ou e-mail transacional novo** → reuse `sendSmsAws`/`sendEmailAws`, checando antes `isAws*Configured()`. Tenha fallback (veja a ordem em `password-reset.ts`).
- **Dado novo no painel do cliente** → crie uma action que tira o usuário de `getServerSession(authOptions)` e consuma em `section/demo.tsx`. Não receba `userId` como parâmetro.

## Testes e validação
- **Testes automáticos**: nenhum teste em `tests/` cobre este domínio diretamente. `tests/date-br.test.ts` cobre os helpers de fuso usados por `fetchEventsByMonth` e `getBotconversaAdsData`.
- **Gates do CI** (`.github/workflows/ci.yml`): `npx tsc --noEmit`, `npm run lint`, `npm test`. Nesta máquina o `next build` local para em silêncio (problema pré-existente); o build confiável é o da Vercel.
- **Validação manual** (`npm run dev`):
  1. Em aba anônima, `/`, `/blog-seguros-parana/dpvat`, `/faq`, `/termos-de-uso` e `/exclusao-de-dados` abrem sem login. `/nova-dash` redireciona para `/login`.
  2. `/sitemap.xml` e `/robots.txt` respondem.
  3. Envie o formulário de contato anônimo. Pelo código atual, espera-se falha 401.
  4. Faça login como cliente: deve cair em `/area-do-cliente`, com os cartões Acidente N. `/status` mostra a linha do tempo; no Network, o polling de 30s para quando a aba fica oculta.
  5. O tour abre na primeira visita e o botão "Ver tutorial" o reabre.
- **Webhook**: POST para `/api/botconversa/contratado` com corpo `{nome, telefone, evento}` e header `x-webhook-secret`. Use `contratado` só em ambiente de teste, porque cria card e tarefa.

## Fronteiras
- **Auth e permissões**: allowlists em `middleware.ts`, login por CPF em `app/_shared/lib/auth.ts`, `app/_actions/auth/password-reset.ts` (consome `aws-messaging.ts`) → `docs/ai/auth-permissoes.md`. A trava de IP (`app/nova-dash/layout.tsx` + `requireTeam`) não se aplica ao site nem à área do cliente.
- **Kanban e cards**:
  - status inicial vem de `createProcess` (`app/_actions/process/create-process.ts`);
  - mudanças de status passam por `updateUser` (`app/_actions/users/update-users.ts`) e `updateProcess` (`app/_actions/process/update-process.ts`), que chamam `notifyStatusProgress`;
  - rótulos e descrições das etapas ficam em `app/nova-dash/card-dialog/constants.ts` → `docs/ai/kanban-cards.md`.
- **WhatsApp e bot**: `app/_shared/lib/whatsapp/bot.ts` responde "em que etapa estou?" com `getStatusLabel`/`getStatusDescription`; `status-notify.ts` avisa o cliente quando a etapa muda → `docs/ai/whatsapp-bot.md`.
- **Menções e tarefas**: `recordSectorTask` em `app/_shared/lib/sector-tasks.ts` (rota `botconversa_contratado` → `comercial`).
- **Analytics**:
  - dashboard: `getStrategicDashboardData` (`app/_actions/analytics/get-strategic-dashboard.ts`);
  - funil: `getBotFunnel` (`app/_actions/analytics/bot-funnel.ts`);
  - `MiniKanban` (`app/nova-dash/minikanban.tsx`) e `LeadsTable` (`app/nova-dash/form-leads.tsx`);
  - `app/_shared/lib/cost-providers.ts` lê `META_ADS_ACCOUNT_BOTCONVERSA` → `docs/ai/analytics-custos.md`.
- **Onboarding**: `Tour` e `fetchOnboarding` em `app/_components/onboarding/Tour.tsx`, com a API em `app/api/onboarding/route.ts`.
- **Hospitais**: `app/api/hospitals/route.ts` monta o catálogo com o `distinct` de `hospital` em User e Process, incluindo os GHOST.
- **Assinatura**: páginas públicas `/assinar` e `/verificar`, vídeos em `public/assinatura/` → `docs/ai/assinatura.md`.
- **Meta CAPI**: `app/_shared/lib/meta-conversions.ts`, que é independente do Pixel do site.
