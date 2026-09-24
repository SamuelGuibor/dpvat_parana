# Espaço de trabalho da equipe (chat, menções, setores, ponto, tickets) — mapa para IA
> Verificado em 2026-09-23 · Escopo: `app/nova-dash/workspace/{Workspace,WorkspaceSidebar,SectorDashboard}.tsx`, `app/nova-dash/workspace/chat/**`, `app/nova-dash/{mentions,tickets,_components}/**`, `app/nova-dash/{MySpace,TeamPresence,UserMenu,ProfileDialog}.tsx`, `app/_actions/{chat,mentions,sectors,events,dev-tickets}/**`, `app/_actions/dev-alerts.ts`, `app/api/{chat,presence,work-session,ponto-adjustments,notification,onboarding,avatar,dev-tickets}/**`, `app/_shared/lib/{chat-relay,chat-access,mention-inbox,sector-tasks,sector-admin,ponto,ponto-access,dev-activity,log,report-error}.ts`, `app/_shared/hooks/**`, `railway/chat-relay.md`

## TL;DR
- A aba de topo `meu-espaco` ("Espaço de Trabalho") renderiza `Workspace` (sidebar de seções: Meu Espaço, Dashboard, Gestor, Custos, Números, Segurança, Revisão da IA). As abas-irmãs do header são deste domínio também: **Menções e Tarefas** (`MentionsInbox`), **Tickets Dev** (`TicketsBoard`), **Controle de Ponto** (`WorkSessionPanel`), além dos widgets do cabeçalho (Eventos, presença, sino, menu do usuário/alertas do dev, tour).
- **Chat da equipe está DESATIVADO** desde 14/09/2026 (`CHAT_ENABLED = false` em `WorkspaceSidebar.tsx`). Código, rotas e tabelas continuam vivos; o badge ainda faz polling.
- Toda @menção vira **duas** coisas: `Notification` (sino, volátil) + linha em `mentions` (caixa com PENDING→ACK→DONE). Tarefas automáticas (bot/BotConversa) entram pela mesma caixa via `recordSectorTask`, roteadas por setor.
- O ponto é cálculo de folha: regra pura em `app/_shared/lib/ponto.ts` (compartilhada client/server, coberta por teste) + API `app/api/work-session/route.ts`.
- O que mais quebra: (1) nova origem de @menção sem `recordMentions` → some da caixa; (2) navegação entre abas só por `CustomEvent` sem gravar `sessionStorage` antes → o clique "não faz nada"; (3) fuso (Vercel = UTC) em ponto/eventos; (4) guarda de acesso heterogênea — o middleware só exige sessão, e cliente também tem sessão.

## Onde fica
| Arquivo | Responsabilidade | Símbolos-chave |
|---|---|---|
| `app/nova-dash/page.tsx` | Shell de abas; listeners globais de navegação; badges (chat, menções, WhatsApp, eventos) | default `Page` (`PageInner` interno) |
| `app/nova-dash/workspace/Workspace.tsx` | Seções do Espaço de Trabalho + guarda de seção por permissão | `Workspace` |
| `app/nova-dash/workspace/WorkspaceSidebar.tsx` | Sidebar desktop / barra mobile; liga/desliga o chat | `WorkspaceSidebar`, `WorkspaceSection`, `CHAT_ENABLED` (const local) |
| `app/nova-dash/MySpace.tsx` | "Meu Espaço": atividade pessoal (Logs) + perfil + setor | `MySpace` (usa `getMyActivity`, `getMyProfile`) |
| `app/nova-dash/ProfileDialog.tsx` | Editar perfil/senha/foto; propaga pro JWT via `updateSession` | `ProfileDialog` |
| `app/nova-dash/UserMenu.tsx` | Menu do avatar; pop-up e criação de alertas do dev | `UserMenu` (internos `DevAlertPopup`, `CreateAlertDialog`, `isDevSector`) |
| `app/nova-dash/TeamPresence.tsx` | Avatares online/offline no header | `TeamPresence` |
| `app/nova-dash/workspace/chat/*` | UI do chat (canais, DMs, reply, reações, anexos, "digitando") | `Chat`, `MessageComposer`, `ChannelInfoDialog`, `NewChannelDialog`, `renderMentionSuggestion` |
| `app/nova-dash/workspace/SectorDashboard.tsx` | Dashboard/gestão de setores (aba da Visão do Gestor) | `SectorDashboard` (renderizado por `workspace/manager/ManagerDashboard.tsx`) |
| `app/nova-dash/mentions/MentionsInbox.tsx` | Caixa de Menções e Tarefas (minha / da equipe) | `MentionsInbox` |
| `app/nova-dash/tickets/*` | Kanban de tickets de desenvolvimento | `TicketsBoard`, `TicketCard`, `CreateTicketDialog`, `TICKET_STATUS_FLOW`, `STATUS_META`, `TYPE_META`, `NEXT_STATUS`, `ticketImages` |
| `app/nova-dash/_components/ponto/*` | Aba Controle de Ponto | `WorkSessionPanel` (index.tsx), `MyPonto`, `MyHistory`, `TeamPonto`, `BankPanel`, `EditSessionDialog`, `ScheduleDialog`, `DayTimeline`, `MonthPicker` |
| `app/nova-dash/_components/{DarkModeToggle,create-newcard,dropzone}.tsx` | Toggle do Dark Reader; criar card e dropzone (usados pelo Kanban/FilesTab) | `DarkModeToggle`, `useDarkMode`, `CreateNewCard`, `Dropzone` |
| `app/nova-dash/_components/EventsDialog.tsx` | Agenda de eventos (modal + botão com badge 24h) | `EventsDialog`, `EventsButton` |
| `app/nova-dash/_components/DashboardTour.tsx` | Tour de onboarding da nova-dash | `DashboardTour`, `START_DASH_TOUR_EVENT` |
| `app/nova-dash/_components/PermissionsProvider.tsx` | Mapa de permissões no client (só esconde UI) | `PermissionsProvider`, `usePermissions` |
| `app/nova-dash/_components/GlobalSearch.tsx` | Ctrl+K (cards + navegação de abas) | `GlobalSearch` |
| `app/nova-dash/_components/team_dash.tsx` | Dialog Equipe/Permissões (domínio auth) | default `TeamDialog` |
| `app/_actions/chat/*.ts` | Server actions do chat | `sendMessage`, `createChannel`, `listMyChannels`, `renameChannel`, `setAnnounceOnly`, `deleteChannel`, `editMessage`, `deleteMessage`, `toggleReaction`, `getChatUploadUrl` |
| `app/api/chat/{messages,read,token,typing}/route.ts` | Histórico (poll), não-lidas, token SSE, "digitando" | `GET`/`POST` |
| `app/api/chat/route.ts` + `modules/*` | Assistente Gemini + Windmill (`handleChat`, `runWindmillJob`, `getToolsForRole`) — **nenhum caller em `app/`** | `POST` |
| `app/_shared/lib/chat-relay.ts` | Integração com o relay SSE (Railway) | `isRelayConfigured`, `signRelayToken`, `broadcastToRelay` |
| `app/_shared/lib/chat-access.ts` + `app/_shared/utils/chat.ts` | Acesso a canal / ids de canal | `canAccessChannel`, `canSendToChannel`, `channelRecipients`, `userChannelIds`, `GENERAL_CHANNEL`, `dmChannelId`, `isDmChannel`, `dmParticipants` |
| `app/_shared/lib/mention-inbox.ts` | Grava itens da caixa | `recordMentions`, `cleanExcerpt` |
| `app/_shared/lib/sector-tasks.ts` | Roteia tarefas automáticas para um setor | `recordSectorTask`, `SectorTaskKind`, `SECTOR_TASK_ROUTES` (local) |
| `app/_actions/mentions/mention-actions.ts` | Listar/mudar status/limpar menções | `listMyMentions`, `listTeamMentions`, `countPendingMentions`, `setMentionStatus`, `setManyMentionsStatus`, `clearDoneMentions`, `MentionDTO` |
| `app/_actions/sectors/*.ts` + `app/_shared/lib/sector-admin.ts` | CRUD de setores, atribuição, analytics | `listSectors`, `getSectorAdminContext`, `listAssignableUsers`, `createSector`, `updateSector`, `deleteSector`, `assignUserSector`, `getSectorAnalytics`, `isSectorAdmin`, `requireSectorAdmin` |
| `app/_actions/events/event-actions.ts` | Agenda de eventos | `listUpcomingEvents`, `listPastEvents`, `countEventsSoon`, `createEvent`, `updateEvent`, `deleteEvent` |
| `app/_actions/dev-tickets/ticket-actions.ts` + `app/api/dev-tickets/route.ts` | Tickets dev (escrita por action, leitura por rota) | `getTicketImageUploadUrl`, `createDevTicket`, `addDevTicketImages`, `removeDevTicketImage`, `assumeDevTicket`, `setDevTicketStatus`, `deleteDevTicket` |
| `app/_actions/dev-alerts.ts` | Pop-up/notificação do setor de dev para a equipe | `createDevAlert`, `getActiveDevAlerts` |
| `app/api/work-session/route.ts` | Batidas (POST), leitura (GET), correção/escala (PATCH), exclusão (DELETE), CSV | `GET`, `POST`, `PATCH`, `DELETE` (internos `derived`, `closeStale`, `csvResponse`) |
| `app/api/ponto-adjustments/route.ts` | Compensação/abono do banco de horas | `GET`, `POST`, `DELETE` |
| `app/_shared/lib/ponto.ts` / `ponto-access.ts` | Regra pura do ponto / quem gerencia | `parseBreaks`, `workedMinutes`, `breakMinutes`, `statusOf`, `parseSchedule`, `targetMinutes`, `monthSummary`, `bankSummary`, `dayStartMs`, `dayEndMs`, `clockToIso`, `DEFAULT_SCHEDULE` / `canManagePonto` |
| `app/api/{presence,notification,onboarding}/route.ts` | Heartbeat de presença; sino; progresso do tour | `GET`/`POST`/`PATCH`/`DELETE` |
| `app/api/avatar/[userId]/route.ts` + `app/_actions/users/avatar.ts` | Foto de perfil da equipe (S3 `avatars/<userId>`) | `GET`, `getAvatarUploadUrl`, `confirmMyAvatar`, `removeMyAvatar` |
| `app/_shared/lib/log.ts` | Tabela `Log` (histórico/atividade) | `createLog`, `logWhatsAppEvent`, `diffFields`, `buildUpdateMessage`, `CARD_FIELD_LABELS`, `LogAction`, `FieldChange` |
| `app/_shared/lib/dev-activity.ts` | Peso de `dev_commit` por nº de arquivos | `DEV_COMMIT_ACTION`, `devCommitFiles`, `devFilesDelta`, `devFilesTotal` |
| `app/_shared/lib/report-error.ts` | Erro crítico (hoje só `console.error`) | `reportCriticalError` |
| `app/_shared/hooks/*` | Polling/SSE no client | `useChannelMessages`, `useUnread`, `useMyChannels`, `useChatStream`, `markChannelRead`, `sendTyping`, `isTypingEvent`, `isReactionEvent`, `usePendingMentions`, `notifyMentionsChanged`, `MENTIONS_CHANGED_EVENT`, `OPEN_MENTIONS_TAB_EVENT`, `useNotifications`, `usePresence` (`use-whatsapp.ts` é do domínio WhatsApp) |
| `railway/chat-relay.md` | Contrato + implementação de referência do relay SSE | — |

## Fluxo principal
**A. @menção → Caixa de Menções**
1. Origem monta texto com markup `@[Nome](id)` (`react-mentions` no `MessageComposer`; ids especiais `everyone` e `sector:<id>`).
2. Server: `extractMentions` (`app/_shared/utils/mentions.ts`) → expande `sector:`/`everyone` (só `sendMessage` expande os dois; `sendWhatsAppInternalNote` expande ambos mas a UI só oferece `everyone`; `createComment` **não expande nada**) → remove o autor → `db.notification.create` (sino) **e** `recordMentions(...)` (tabela `mentions`). Origens atuais: `sendMessage` (chat, source `chat`), `createComment` em `app/_actions/comments/comment-actions.ts` (`comment`), `sendWhatsAppInternalNote` em `app/_actions/whatsapp/send-message.ts` (`whatsapp`, `channelId`=contactId), `runAiAudit` em `app/_shared/lib/ai-audit.ts` (`comment`, autor null).
3. Tarefas automáticas: `createCardTaskForTeam` (`app/_shared/lib/whatsapp/bot.ts`) e `app/api/botconversa/contratado/route.ts` → `recordSectorTask({kind})` → acha `Sector` pelo slug de `SECTOR_TASK_ROUTES` → uma cópia por membro com o mesmo `groupId` (fallback: todos ADMIN*).
4. Client: `usePendingMentions` chama `countPendingMentions` a cada 30s (pula aba oculta) → badge da aba `mencoes` + toast; `MentionsInbox` carrega `listMyMentions` (ou `listTeamMentions` com `view_all_mentions`).
5. Status: `setMentionStatus`/`setManyMentionsStatus` (por `groupId` quando existe) → `notifyMentionsChanged()` atualiza o badge.
6. Abrir origem: grava `sessionStorage` (`kanban-open-card` | `wa-open-contact` | `chat-open-channel`) e dispara `CustomEvent` (`open-kanban-card` | `open-whatsapp-conversation` | `open-chat-channel`) → `page.tsx` troca a aba → `KanbanBoard`/`WhatsAppInbox`/`Chat` consomem o `sessionStorage` ao montar. Vindo de **outra aba do navegador** (link do CardDialog) o contato chega por `?wa=<contactId>`: `page.tsx` grava o `sessionStorage` da aba nova, dispara o evento e limpa a query.

**B. Chat (quando ligado)**: `MessageComposer` → `sendMessage` (valida `canAccessChannel` + `canSendToChannel`, anexo com key `chat/<userId>/`) → `ChatMessage` no Prisma → menções (A) → `broadcastToRelay({channelId, recipients, message})` → relay Railway → `EventSource` de `useChatStream` (token de `GET /api/chat/token`) → `mutate()` do SWR. Sem relay: `useChannelMessages` faz poll de `/api/chat/messages` (15s), `useUnread` de `/api/chat/read` (20s), `useMyChannels` (20s).

**C. Ponto**: `WorkSessionPanel` → `GET /api/work-session?month=` (fecha turnos velhos com `closeStale`) → `MyPonto` → `POST {action: start|pause|resume|finish|reopen|note}` → `WorkSession` do dia BR. Gestor (`canManagePonto`): `GET ?all=true` (todas as sessões + `PontoAdjustment` → `bankSummary`), `PATCH` (correção ou `schedule`), `DELETE ?id=`, `?format=csv`; `BankPanel` → `/api/ponto-adjustments`.

**D. Outros**: `EventsDialog` → `event-actions.ts` → `Event`; `TicketsBoard` (SWR 10s em `/api/dev-tickets`) + actions → `DevTicket` (fotos via presign S3 `dev-tickets/`); `UserMenu` faz poll de `getActiveDevAlerts` a cada 30s; `usePresence` faz `POST /api/presence` a cada 2 min (grava `User.lastSeenAt`; "online" = visto nos últimos 5 min); `useNotifications` (sino) faz poll de `/api/notification` a cada 60s; `page.tsx` reconta `countEventsSoon` a cada 5 min. Menções/sino/presença/dev-alerts pulam a aba oculta à mão; os hooks SWR (chat, tickets) pausam pelo padrão do SWR (`refreshWhenHidden: false`); só a contagem de eventos roda sempre.

## Dados
- `Mention` (`@@map("mentions")`): `source` string `comment|chat|whatsapp|botconversa`; `status` string `PENDING|ACK|DONE` (+ `ackAt`/`doneAt`); `groupId` = tarefa de setor compartilhada; `sectorId`/`sectorName` = snapshot; `authorId` null = bot/IA; `channelId` = canal do chat **ou** contactId do WhatsApp; `userId`/`processId` = card (lead=User, processo=Process); `excerpt` já limpo por `cleanExcerpt`.
- `Notification`: sino; `recipientId` com FK para User; `contactId` abre conversa do WhatsApp. `GET /api/notification` devolve só as 50 últimas. Retenção em `app/_actions/maintenance/retention.ts`: lidas >30d e todas >90d são apagadas (cron `/api/maintenance/retention`).
- `ChatMessage` (`chat_messages`): `channelId` é string solta (`general` | `dm:<idA>__<idB>` ordenado | id de `ChatChannel`) **sem FK**; `deletedAt` = soft-delete (body e anexo zerados); `replyTo*` = snapshot do pai (200 chars); `attachmentKey` prefixo `chat/`. `ChatRead` (PK userId+channelId, `lastReadAt`) também sem FK. `ChatChannel.announceOnly` = só o dono (`createdById`) escreve. `ChatChannelMember` cascateia do canal. `ChatReaction` unique (messageId, userId, emoji).
- `Sector` (`sectors`): `slug` é o que se digita no @ e a chave de roteamento de `sector-tasks.ts`; `User.sectorId` com `onDelete: SetNull`.
- `WorkSession`: `date` = chave "YYYY-MM-DD" de Brasília; `discordId` é legado mas é **a coluna de busca** (hoje = userId do app), `@@unique([discordId, date])`; `breaks` Json `[{start,end|null,kind:"almoco"|"pausa"}]` é a fonte de verdade; `pausedAt`/`resumedAt` espelham só a 1ª pausa; `autoClosed` = fechado na virada do dia; `editedById`/`editedAt` = correção manual.
- `PontoAdjustment` (`ponto_adjustments`): `minutes` com sinal (`compensation` < 0, `credit` > 0), `date` chave BR.
- `User.workSchedule` Json → `WorkSchedule` (`dailyMinutes`, `days` 0=domingo, `startTime`/`endTime`/`breakMinutes`, `bankStartKey` = início do ciclo do banco). `User.onboarding` Json `{dash:{step,done}, client:{step,done}}`. `User.lastSeenAt` = presença. `User.image` da equipe = `/api/avatar/<id>?v=<ts>`.
- `Event` (`events`): `startsAt` obrigatório, `endsAt` opcional; `userId`/`processId` existem, mas a UI atual só preenche `clientName`.
- `DevTicket` (`dev_tickets`): `type` `BUG|ALTERACAO|MELHORIA|OUTRO`; `status` `EM_DISTRIBUICAO→EM_ANALISE→EM_DESENVOLVIMENTO→CONCLUIDO`; `images` Json `[{key,name}]` + legado `imageKey`/`imageName` (espelha a 1ª foto). `DevAlert` (`dev_alerts`): pop-up com `expiresAt` (TTL 2h).
- `Log` (`logs`): `action` = `LogAction`; `authorId` **sem FK** (autor demitido continua no histórico); `metadata` recebe `authorSectorId/Name/Slug` (snapshot) em `createLog`/`logWhatsAppEvent`; logs de WhatsApp levam `metadata.channel = "whatsapp"`.

## Regras invioláveis e armadilhas
- **Nova origem de @menção** → gravar a `Notification` **e** chamar `recordMentions` (lista já expandida, sem o autor). Por quê: o sino é volátil (Limpar + retenção 30/90d); só a caixa guarda o rastro.
- **Ids especiais precisam ser expandidos no servidor antes de gravar.** `createComment` não expande `everyone`/`sector:<id>`: se a UI de comentário passar a sugeri-los, `notification.create` recebe `recipientId` inválido e quebra na FK. Por quê: `Notification.recipientId` e `Mention.recipientId` têm FK para `User`.
- **Tarefa automática nova** → adicionar em `SectorTaskKind` + `SECTOR_TASK_ROUTES` e chamar `recordSectorTask`. Por quê: é o único lugar que gera `groupId` e aplica o fallback ADMIN*.
- **Renomear um setor muda o slug** (`updateSector` recalcula `slug` a partir do nome). Por quê: o setor "comercial" é a rota de `wa_lead_qualificado`/`botconversa_contratado`; renomeá-lo desvia as tarefas pro fallback sem etiqueta.
- `setMentionStatus` só age a partir de uma cópia com `recipientId` = usuário logado; propagação só por `groupId`; `clearDoneMentions` é individual. Por quê: supervisão (`view_all_mentions`) é leitura; ninguém mexe na menção alheia.
- **Navegar entre abas** = gravar `sessionStorage` **antes** do `CustomEvent`. Por quê: board/inbox/chat ficam desmontados fora da própria aba e o evento se perde.
- Chat desativado: `open-chat-channel` leva só para `meu-espaco` (listener do `Workspace` é no-op). Menção antiga de chat "não abre nada" — esperado.
- `useUnread` continua em `page.tsx` e `Workspace.tsx` com poll de `/api/chat/read` a cada 20s mesmo com o chat desligado. Por quê importa: custo de banco (Neon) por aba aberta.
- `ChatMessage`/`ChatRead` não têm FK para `ChatChannel`: `deleteChannel` apaga os três em `$transaction`. Qualquer limpeza nova precisa fazer o mesmo.
- Anexo do chat só é aceito com key `chat/<userId>/` (gerada por `getChatUploadUrl`, 25MB); reação só nos 8 emojis de `ALLOWED` em `reactions.ts`; editar/apagar mensagem só o autor (`loadOwnedMessage`); renomear/excluir/`setAnnounceOnly` só o dono (`assertOwner`).
- Relay SSE é **best-effort**: sem `CHAT_RELAY_URL` + `CHAT_RELAY_SECRET`, `broadcastToRelay` vira no-op e tudo cai no polling. "Digitando" (`type:'typing'`) e reações (`type:'reaction'`) trafegam no mesmo stream; token HMAC de 60s vai na query (EventSource não aceita header). Relay em memória = **1 instância**.
- **Fuso**: tudo que é dia/hora usa `app/_shared/utils/date-br.ts` (`brDayKey`, `brLocalToDate`…) ou `ponto.ts` (`dayStartMs`, `clockToIso`, `fmtClock`). Por quê: a Vercel roda em UTC; ponto das 21h caía no dia seguinte e evento das 11h aparecia 8h.
- Toda escrita de `WorkSession` passa por `derived(breaks, finished)`. Por quê: mantém `breaks`, o par legado `pausedAt`/`resumedAt` e `isActive`/`isPaused` coerentes.
- Banco de horas (`bankSummary`): dia sem registro **não** gera débito; falta entra por compensação manual; alerta a partir de 5 meses de ciclo (CLT fecha em 6); "Reiniciar ciclo" = PATCH `schedule` com `bankStartKey` = hoje. Já `monthSummary` **cobra** dia útil sem registro como falta, a menos que `onlyRegistered=true` (é como `MyHistory`/`TeamPonto` chamam). Mudou a regra → `tests/ponto.test.ts`.
- **Upload nunca passa pelo body da função** (limite 4.5MB da Vercel): anexo do chat, foto de ticket e avatar vão por URL pré-assinada do S3 (chat 25MB, ticket 10MB, avatar 5MB JPEG/PNG em key fixa `avatars/<userId>`, por isso o `?v=` no `User.image`). Prefixo novo lido pelo app → incluir na allowlist de `download-s3.ts`.
- Colaborador sem `manage_ponto` recebe `restricted: true` e só `todaySession` (sem histórico do mês). `canManagePonto` = `manage_ponto` **ou** `LEGACY_PONTO_IDS` (só concede). `/api/work-session` e `/api/ponto-adjustments` usam `getSessionPermissions` (devolve `null` para quem não é equipe → 401), **não** `requireTeam` → não passam pela trava de IP. `GET /api/dev-tickets` idem, exigindo `view_tickets`.
- `getSessionPermissions` tem cache de 30s por e-mail. Já `session.user.role` (JWT) só atualiza no próximo login — e é o que `event-actions.ts`, `ticket-actions.ts` e `getSectorAdminContext`/`requireSectorAdmin` checam.
- **Guarda de acesso é por arquivo** (middleware só exige sessão; cliente tem sessão). Hoje só checam sessão: actions de chat, rotas `/api/chat/*`, `listSectors`/`listAssignableUsers`/`getSectorAnalytics`, `listMyMentions`/`setMentionStatus`, `/api/notification`, `getActiveDevAlerts`; `GET /api/presence` nem checa sessão na rota (só o middleware) e devolve a lista da equipe com cargo e `lastSeenAt`. As actions de tickets aceitam qualquer `role` começando com `ADMIN` (JWT) sem olhar `view_tickets`. Código novo deve usar `requireTeam()`/`requirePermission()` de `app/_shared/lib/permissions-server.ts`.
- Gestão de setores: env `SECTOR_ADMIN_IDS`; se vazia, fallback por cargo `["ADMIN","ADMIN++"]` em `sector-admin.ts` (o comentário fala só ADMIN++; **ADMIN+ fica de fora**).
- Alertas do dev: só usuário cujo setor tem nome/slug com "desenvolv" ou igual a "dev"/"ti" (`requireDevMember`); pop-up vale 2h; "já visto" fica em `localStorage['dev-alerts-seen']` (por navegador). O menu esconde o item olhando só `sector.name`.
- Eventos: input `"YYYY-MM-DDTHH:mm"` sempre interpretado como Brasília (`brLocalToDate`); editar/excluir só criador ou `ADMIN++`; "futuros" inclui o que começou há até 3h.
- Tickets: listas de tipo/status existem **duplicadas** em `ticket-actions.ts` (locais — `"use server"` só exporta funções async) e `app/nova-dash/tickets/constants.ts`. Mudou uma, mude a outra. Voltar para `EM_DISTRIBUICAO` limpa o responsável; avançar sem responsável auto-atribui.
- `createLog`/`logWhatsAppEvent`/`recordMentions`/`recordSectorTask`/`broadcastToRelay` **nunca lançam** (engolem e logam). Não conte com exceção deles para abortar fluxo.
- `diffFields` mascara `senha_inss`/`password` como "•••" e trunca em 180 chars. `dev_commit` conta por **arquivos** nas agregações (`dev-activity.ts`), não 1 por log.
- Retenção de logs purga só as ações `wa_*` de `PURGEABLE_LOG_ACTIONS` (180d). Nunca purgar `move` (o relatório de pastas lê sem limite de data).
- Nova permissão: `PERMISSION_DEFS` + `ROLE_DEFAULTS` em `app/_shared/lib/permissions.ts` (o `NO_PERMISSIONS` do provider é derivado sozinho). A UI só esconde; o servidor valida.
- Modo escuro é o Dark Reader: classes `dark:` do Tailwind estão inertes. Estilize o tema claro.
- Schema: **nunca** `prisma migrate dev` (o Neon tem drift e ele propõe reset). Use `migrate diff` → `db execute` → `migrate resolve --applied`.

## Receitas
- **Ligar o chat de novo** → `CHAT_ENABLED` em `WorkspaceSidebar.tsx` + corpo do listener `open-chat-channel` em `Workspace.tsx` (hoje no-op) · cuidado: relay/env na Vercel, e colocar `requireTeam()` nas actions/rotas de chat antes · valide: DM entre duas contas, canal `announceOnly`, badge.
- **Desligar o poll de não-lidas do chat** → `useUnread` em `app/nova-dash/page.tsx` e `Workspace.tsx` (ou `refreshInterval` em `app/_shared/hooks/use-chat.ts`) · cuidado: o badge `workspaceUnread` depende dele · valide: Network sem `/api/chat/read`.
- **Nova origem de menção** → `extractMentions` + expansão `sector:`/`everyone` (copie de `sendMessage`) + `db.notification.create` + `recordMentions({source,...})`; se for source nova, estenda o union em `mention-inbox.ts`, o `MentionDTO.source`/`enrich` em `mention-actions.ts` e `handleOpen`/filtros em `MentionsInbox.tsx` · valide: item aparece e abre a origem.
- **Nova tarefa automática por setor** → `SectorTaskKind` + `SECTOR_TASK_ROUTES` em `sector-tasks.ts`, chamar `recordSectorTask` na origem · cuidado: slug precisa existir e ter membros · valide: concluir numa cópia conclui para o setor.
- **Novo destino de navegação a partir da caixa/sino** → `handleOpen` em `MentionsInbox.tsx` e o clique em `app/nova-dash/box.tsx`; listener em `page.tsx`; consumidor lê e remove a chave do `sessionStorage` no mount · valide com a aba destino fechada.
- **Mudar regra de horas/banco** → `ponto.ts` (`workedMinutes`, `monthSummary`, `bankSummary`), nunca duplicar na UI · valide: `npx vitest run tests/ponto.test.ts` + CSV do mês.
- **Nova ação de batida ou campo na correção** → `POST`/`PATCH` em `app/api/work-session/route.ts` usando `derived()`; UI em `MyPonto.tsx`/`EditSessionDialog.tsx` · cuidado: `closeStale` antes de ler; dia via `brDayKey`.
- **Novo campo de evento** → model `Event` (migration segura) + `EventInput`/`sanitizeInput`/`toDTO` em `event-actions.ts` + form em `EventsDialog.tsx` · cuidado: datas via `brLocalToDate`.
- **Novo tipo/fase de ticket** → `TICKET_TYPES`/`TICKET_STATUSES` em `ticket-actions.ts` **e** `TYPE_META`/`STATUS_META`/`TICKET_STATUS_FLOW`/`NEXT_STATUS` em `tickets/constants.ts`.
- **Nova seção no Espaço de Trabalho** → `WorkspaceSection` + item no grupo em `WorkspaceSidebar.tsx`, render e guarda `effective` em `Workspace.tsx`, permissão via `usePermissions()` + checagem no servidor.
- **Nova ação de log** → adicionar ao union `LogAction` em `log.ts` + meta de render em `app/_shared/utils/action-meta.tsx` · cuidado: se for operacional de WhatsApp e puder expirar, avaliar `PURGEABLE_LOG_ACTIONS`.

## Testes e validação
- `tests/ponto.test.ts` — `ponto.ts` (pausas múltiplas, turno aberto limitado à virada, legado `pausedAt`, escala, `monthSummary`, `bankSummary`, fuso). `tests/date-br.test.ts` — cortes de dia/mês em Brasília. `tests/permissions.test.ts` — `resolvePermissions`/`isTeamRole`.
- **Sem teste** para chat, menções, setores, eventos, tickets, dev-alerts, presença, rotas de API.
- Comandos: `npm test` (vitest), `npx tsc --noEmit`, `npx next lint`. `next build` local não é confiável (OOM/processo destacado) — deixe o build para a Vercel. `npx prisma generate` falha com EPERM no Windows se o `npm run dev` estiver rodando.
- Manual: logar como equipe em `/nova-dash`; conferir badge da aba Menções (menção em comentário de card → PENDING → ciente/concluir → clique abre o card); aba Controle de Ponto com usuário comum (só o dia) e com `manage_ponto` (Administrativo, CSV, banco); ícone de Eventos no header; Tickets Dev com `view_tickets`.

## Fronteiras
- **Kanban/cards**: `createComment` (`app/_actions/comments/comment-actions.ts`) grava menções; `KanbanBoard.tsx` consome `sessionStorage['kanban-open-card']`; `GlobalSearch` usa `/api/board-state` e `searchArchivedCards`.
- **WhatsApp**: `sendWhatsAppInternalNote` (menções de nota interna); `createCardTaskForTeam` em `app/_shared/lib/whatsapp/bot.ts` (tarefa de setor); `WhatsAppInbox.tsx` consome `wa-open-contact`; badge via `useWhatsAppUnread` (`use-whatsapp.ts`); `logWhatsAppEvent` em `log.ts`.
- **BotConversa**: `app/api/botconversa/contratado/route.ts` → `recordSectorTask('botconversa_contratado')`.
- **Auditoria IA**: `runAiAudit` (`app/_shared/lib/ai-audit.ts`) → `recordMentions` com autor null.
- **Auth/permissões**: `permissions.ts`, `permissions-server.ts` (`getSessionPermissions`, `requireTeam`, `requirePermission`), `getMyPermissions` (`app/_actions/team/permissions.ts`), `managers.ts` (`isManager`, env `MANAGER_EMAILS`). Mapa próprio: `docs/ai/auth-permissoes.md`.
- **Gestor/analytics**: `workspace/manager/ManagerDashboard.tsx` renderiza `SectorDashboard`; `get-team-analytics.ts`, `get-collaborator-detail.ts` (em `app/_actions/analytics/`) e `get-my-activity.ts` (em `app/_actions/users/`) usam `dev-activity.ts`; `scripts/log-dev-commits.mjs` grava `dev_commit`. Mapa: `docs/ai/analytics-custos.md`.
- **Manutenção**: `app/_actions/maintenance/retention.ts` (`purgeOldNotifications`, `purgeOldLogs`) via cron `/api/maintenance/retention`.
- **S3/documentos**: `downloadFileFromS3` (`app/_actions/documents/download-s3.ts`) — allowlist de prefixos inclui `chat/` e `dev-tickets/`.
- **Onboarding**: `app/_components/onboarding/Tour.tsx` (`Tour`, `fetchOnboarding`) ↔ `/api/onboarding`.
- **Render de texto**: `renderFormattedText` (`app/_shared/utils/render-message.tsx`) e `extractMentions` (`app/_shared/utils/mentions.ts`) são compartilhados com comentários e WhatsApp.
- **Relay externo**: serviço Express próprio no Railway (contrato em `railway/chat-relay.md`); o app só chama `POST /broadcast` e o browser abre `GET /events`.
