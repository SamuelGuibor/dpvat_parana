# Kanban, Cards e Automações — mapa para IA
> Verificado em 2026-09-23 · Escopo: `app/nova-dash/{KanbanBoard,CardDialog,ArchivedCards,AutomationsPanel,KanbanFlowPanel,minikanban,box,FolderReport,CalendarTab,page,layout}.tsx`, `app/nova-dash/card-dialog/**`, `app/nova-dash/contratos/**`, `app/_actions/{cards,comments,labels,process,contacts,users}/**`, `app/api/{kanban,board-state,card-tags,card-counts,automations,comments,labels,afastamentos,admin-checklist,hospitals}/**`, `app/_shared/lib/{automation-conditions,automation-executor,admin-checklist,archive-catalog}.ts`, `app/_shared/lib/db/**`

## TL;DR
- O board da aba Kanban (`/nova-dash`) mostra **cards**, que são linhas de `User` (cliente) ou de `Process`. A **coluna é um `Label`**. O card pertence à coluna pelo `labelId`; `role` guarda uma **cópia do nome** da coluna, e `statusStartedAt` é o timer da coluna.
- O board sincroniza por polling de 7 s em `/api/board-state`, com cheque de versão md5 (`?v=` → `{unchanged:true}`). A UI é otimista e segura o polling com o contador `pendingMutationsRef`.
- Mover card = `updateKanbanStatus`: grava coluna + log `move`, depois `runAutomations` (sem await). Automação = JSON (condições + ações) em `automations`. Ela dispara quando o card entra na coluna ou pelo cron de tempo (`runTimeBasedAutomations`).
- Arquivar = `archiveStatus` (12 destinos). O card sai do board mas mantém o `labelId`, e desarquivar devolve ele à mesma coluna.
- O que mais quebra: (1) nome de coluna é contrato em vários lugares, e renomear não atualiza `role`; (2) automação por tempo: o cron `time-check` está fora da allowlist do `middleware.ts` e a ação `comment` usa um `authorId` sintético; (3) mexer no payload do board sem atualizar `computeBoardVersion` e o comparador do `DraggableCard`.

## Onde fica
| Arquivo/pasta | Responsabilidade | Símbolos-chave |
|---|---|---|
| `app/nova-dash/page.tsx` | Casca do CRM: abas, header, gate `isTeamRole` no cliente, ouvinte `open-kanban-card` que troca pra aba Kanban | `Page`, `CONTRACTS_TAB_ENABLED` (=false) |
| `app/nova-dash/layout.tsx` | Gate server-side da trava de IP | default `NovaDashLayout` → `checkDashboardIpAccess` |
| `app/nova-dash/KanbanBoard.tsx` | Board: polling, DnD (react-dnd), busca (ativos + arquivados), CRUD de coluna, criar card, menu do card, arquivar | `KanbanBoard`, `KanbanCard`, `CardTagInfo`, `KANBAN_POLL_MS`, `fetchData`, `moveCard`, `performArchive`, `DraggableCard` (memo), `CreatePerson`, `COLLAPSED_STORAGE_KEY` |
| `app/nova-dash/CardDialog.tsx` | Modal do card (7 abas), salvar, rascunho no localStorage, excluir, arquivar. Também montado em `ArchivedCards`, `FolderReport`, `ContractsPanel` e no inbox (`workspace/whatsapp/WhatsAppInbox.tsx`) | `CardDialog`, `EDITABLE_FIELDS` |
| `app/nova-dash/card-dialog/` | Abas e peças do modal | `DetailsTab`, `ChecklistTab`(+`StatusMessagesManager`), `FilesTab`(+`AdminChecklist`), `CommentsTab`, `RoteirosTab` (ScriptTab.tsx), `IntegrationsTab`, `LogsTab`, `CardTagsBar`, `ArchiveBar`, `HospitalCombobox`, `TemplateManagerDialog` |
| `app/nova-dash/card-dialog/constants.ts` | Etapas do checklist por serviço e opções de formulário | `INSS_STATUS_ORDER`, `DPVAT_STATUS_ORDER`, `GENERIC_STATUS_ORDER`, `getStatusOrderByService`, `getStatusLabel`, `SERVICE_OPTIONS` |
| `app/nova-dash/card-dialog/types.ts` | Tipo do card no modal | `ExtendedKanbanCard` |
| `app/nova-dash/ArchivedCards.tsx` | Aba Arquivados (paginada no servidor) + planilhas Caique/UNI | `ArchivedCards`, `STATUS_CONFIG` |
| `app/nova-dash/FolderReport.tsx` | Planilha de "pastas enviadas" | `FolderReport`, `FolderKind` |
| `app/nova-dash/AutomationsPanel.tsx` | Editor de automações (Sheet + Dialog) com validação | `AutomationsPanel`, `CARD_FIELDS`, `OPERATORS`, `TAG_OPERATORS`, `TIME_FIELDS`, `VARIABLE_CHIPS` |
| `app/nova-dash/KanbanFlowPanel.tsx` | Aba "Fluxo do Kanban" da Gestão Estratégica. Recebe `data` pronto; a comparação chama a action sob demanda | `KanbanFlowPanel` (usa `getKanbanFlowAnalytics`) |
| `app/nova-dash/minikanban.tsx` | Kanban de **leads do bot** (BotConversa + WhatsApp), **não** é o board | `MiniKanban` |
| `app/nova-dash/CalendarTab.tsx` | Calendário que só vive no localStorage (`dpvat_calendar_events`) | `CalendarTab` |
| `app/nova-dash/box.tsx` | Sino; abre card/conversa via sessionStorage + evento | `NotificationDropdown` |
| `app/nova-dash/contratos/ContractsPanel.tsx` | Aba Contratos (assinatura), **desligada** | `ContractsPanel` |
| `app/_actions/cards/` | Mover, reordenar, arquivar, buscar arquivados, excluir, planilhas (`view_pagos_caique`/`view_pagos_uni`) | `updateKanbanStatus`, `reorderCards`, `setArchiveStatus`, `getArchivedCards`, `getArchivedCardById`, `ArchiveStatus`, `searchArchivedCards`, `deleteCard`, `getCaiqueFolders`, `getUniFolders` |
| `app/_actions/users/` | CRUD do card-User (e de membro da equipe) | `createUser`, `updateUser`, `getUsers`, `findDuplicateClient`, `deleteAdmin`, `getClientAccessPassword`, `setClientAccessPassword` |
| `app/_actions/process/` | CRUD do card-Process | `createProcess`, `updateProcess`, `getProcess` |
| `app/_actions/comments/` | Comentários + @menções | `createComment`, `updateComment`, `deleteComment` |
| `app/_actions/labels/get-labels.ts` | Colunas (cache) | `getLabels` |
| `app/_actions/contacts/` | Leads do **formulário do site** (model `Contact`), não contato do WhatsApp | `ContactUsers`, `getContacts`, `DeleteContact` |
| `app/api/board-state/route.ts` | Estado inteiro do board numa só chamada | `GET`, `computeBoardVersion`, `mapBasic` |
| `app/api/labels/**` | CRUD e reordenação de colunas (`create_columns`/`edit_columns`/`delete_columns`) + `revalidateTag('labels')` | `POST`, `PUT`, `DELETE` |
| `app/api/automations/**` | CRUD, upload de .docx (`automation-templates/`), cron `cron/time-check` | `GET`, `POST`, `PUT`, `DELETE` |
| `app/api/card-tags/**` | CRUD de tags, `assign` (connect/disconnect), `lookup` | `GET`, `POST`, `PUT`, `DELETE` |
| `app/api/comments/route.ts` | Lista comentários do card (`take: 300`) | `GET` |
| `app/api/admin-checklist/**` | Checklist previdenciário (seed lazy + dedupe no GET) | `GET`, `POST`, `DELETE`; `[id]`: `PATCH`, `DELETE` |
| `app/api/hospitals/route.ts` | Lista de hospitais = distinct dos cards; `DELETE` zera o campo | `GET`, `DELETE` |
| `app/api/afastamentos/check/route.ts` | Cron 30 min: `afastadoAte` vencido → Notification pra ADMIN* | `GET` (CRON_SECRET), `POST` (sessão) |
| `app/api/kanban/update-status`, `app/api/card-counts` | **Órfãs** (nenhum caller no app) | — |
| `app/_shared/lib/automation-conditions.ts` | Regras puras (testáveis) | `evalConditions`, `daysUntilDue`, `fireCycleKey`, `getVars`, `CardData` |
| `app/_shared/lib/automation-executor.ts` | Execução das ações e cron de tempo | `runAutomations`, `runTimeBasedAutomations`, `MAX_MOVE_DEPTH` (=3) |
| `app/_shared/lib/db/automations.ts` | Tipos do JSON + CRUD | `AutomationCondition`, `AutomationAction`, `fetchAutomationsByLabel`, `fetchTimeConditionAutomations`, `createAutomation`, `updateAutomation` |
| `app/_shared/lib/db/{users,processes,labels}.ts` | Selects do board | `fetchUsers`, `fetchUserById`, `fetchProcesses`, `fetchProcessById`, `fetchLabels` (`unstable_cache`, tag `labels`) |
| `app/_shared/lib/archive-catalog.ts` | Rótulos, grupos e confirmação dos destinos de arquivo | `ARCHIVE_LABELS`, `DESTRUCTIVE_ARCHIVE`, `ARCHIVE_GROUPS`, `ARCHIVE_CHIP_CLASS` |
| `app/_shared/lib/admin-checklist.ts` | Itens padrão + marcação pela auditoria IA | `DEFAULT_CHECKLIST_ITEMS`, `markPersonalDocChecklistItem` |
| `app/_shared/lib/folder-report.ts` | Núcleo das planilhas Caique/UNI (logs `move` + `archiveStatus`) | `buildFolderReport` |

## Fluxo principal
1. **Carga/polling**: `KanbanBoard.fetchData` → `GET /api/board-state?v=<hash>`. A rota exige `role` ADMIN*. Se o hash bater, devolve `{unchanged:true}`. Senão devolve `fetchLabels` + `fetchUsers` + `fetchProcesses` (já sem ADMIN*/GHOST/arquivados), a contagem de comentários/anexos (`groupBy`) e as tags. No cliente, `lastSigRef` só faz `setState` do que mudou. O tick é pulado com mutação em voo (`pendingMutationsRef > 0`), modal aberto ou aba oculta.
2. **Colunas**: `labels` (ordem por `Label.order`) × cards filtrados por `labelId`, ordenados por `boardOrder` (null vai pro fim).
3. **Mover (arrastar, menu "Mover para" ou salvar o modal com coluna nova)**: `moveCard` (otimista, só clona as colunas de origem/destino) → `updateKanbanStatus({id,labelId,isProcess})` → grava `labelId`, `role=label.name` e `statusStartedAt=now` → `createLog("move", metadata {from,to,cardName,service})` se `role` ≠ nome da coluna (compara nome, não `labelId`) → `runAutomations(...)` sem await (erro vai pra `reportCriticalError`). Depois `reorderCards` reindexa a coluna de destino inteira (`boardOrder` = índice).
4. **Automação no movimento**: `runAutomations` → `fetchAutomationsByLabel(newLabelId)` (ativas, ordem de criação) → filtra por `cardType` → `evalConditions` (busca tags só se alguma condição usa `tags`) → `executeAction` para cada ação: `comment` | `whatsapp` (`sendSystemWhatsApp`; falha vira log `wa_text` no card) | `sheets` (`appendSheetRow`) | `ai_audit` (`runAiAudit`, com await) | `add_tag` | `file` (docxtemplater `[[campo]]` → S3 `uploads/...` → `Document`) | `move` (**terminal**: grava a coluna, loga, chama `runAutomations` com `depth+1` e para tudo).
5. **Automação por tempo**: Vercel Cron `*/30` → `GET /api/automations/cron/time-check` (`isCronAuthorized`) → `runTimeBasedAutomations`. Para cada automação com `__time_in_column__`/`__due_date__`, varre os cards da coluna-gatilho (sem arquivados nem GHOST). Com condição ok, cria `AutomationFire(automationId, cardId, cycleKey)` **antes** de executar; se já existe, pula.
6. **Modal**: `CardDialog` carrega `getUsers('full', id)`/`getProcess`. Salvar faz duas coisas: coluna mudou → `updateKanbanStatus`; campos diferentes → `updateUser`/`updateProcess`. Essas actions normalizam CPF/telefone/CEP (`updateUser` também propaga o nome pro `WhatsAppContact`) e, com `status` do checklist mudando, disparam `notifyStatusProgress` (WhatsApp ao cliente) + log `status_change`. O resto vai num log `update` com diff de/para.
7. **Arquivar**: menu do card ou `ArchiveBar` → `setArchiveStatus` (`archive_cards`) → log `archive`. O toast traz "Desfazer" (status null). A aba Arquivados usa `getArchivedCards` (`view_archived`, 60 por página, filtro/busca no Postgres).
8. **Abrir card de fora do board**: grava `sessionStorage['kanban-open-card']` e dispara `open-kanban-card`. `page.tsx` troca de aba e o board abre quando os items chegam; se o card não está no quadro, abre via `getArchivedCardById`.

## Dados
- **`User`** (card de cliente **e** membro da equipe): `role` é duplo. Na equipe vale `ADMIN`/`ADMIN+`/`ADMIN++`; no cliente é o nome da coluna; `GHOST` = card-fantasma interno, nunca cliente. Distinga com `isTeamRole`. O default do schema é `"Filtro de Cartões"`.
- **Campos de card** (User e Process têm o mesmo shape):
  - `labelId`: a coluna de verdade.
  - `statusStartedAt`: entrada na coluna; timer e `__time_in_column__`.
  - `status`: **etapa do checklist** (`INSS_S1..S8`, `DPVAT_S1..S7`, genéricos). Não é a coluna.
  - `service`: valores em `SERVICE_OPTIONS`; card novo nasce com `INSS`/`INSS_S1`.
  - `cardNumber`: `nextval('card_number_seq')`, único.
  - `boardOrder`, `archiveStatus` / `archivedAt`.
  - `afastadoAte`: gravado à meia-noite UTC. Trocar a data zera `afastadoNotificado`.
  - `hospital` / `outro_hospital`; `obs` (User) ↔ `observacao` (Process).
- **`Process`**: igual + `userId` (dono) e `type`. Pela memória de 14/09 (não reconferido no banco), a tabela está **vazia em produção** e os cards reais são `User`. O código segue dual (`isProcess`) em tudo. `ownerId` do card = `id` (User) ou `userId` (Process); `Document.userId` é sempre o dono.
- **`Label`**: `name` único, `color`, `order` (a coluna `order: 0` é a entrada), `timeLimitDays` (badge de atraso no card + alerta do cron `runSlaPhase` com `authorId 'kanban-overdue'`). `Automation.triggerLabel` tem `onDelete: Cascade`.
- **`Automation`**:
  - `triggerLabelId`, `cardType` (`user`|`process`|`both`), `conditionLogic` (`AND`|`OR`), `category` livre, `isActive`.
  - `conditions`/`actions` são JSON tipados só em TS (`AutomationCondition`/`AutomationAction`).
  - Campos especiais: `tags` (value = **nome** da tag), `__time_in_column__` (`moreThanDays`/`lessThanDays`) e `__due_date__` (`dateField`, padrão e única opção do editor `afastadoAte`; `beforeDueDate` = **dia exato**, `afterDueDate` = venceu há ≥ N).
  - Variáveis `[[campo]]` = qualquer coluna do card + `dia`/`mes`/`mes_numerico`/`ano` (`brDateVars`).
- **`AutomationFire`**: único por (`automationId`,`cardId`,`cycleKey`). `cycleKey` = `due:YYYY-MM-DD` / `col:YYYY-MM-DD` (ordenados, `|`); `""` = disparo antigo (antes de 27/08). `cardId` não tem FK.
- **`CardTag`**: many-to-many implícito (`_UserCardTags`/`_ProcessCardTags`). Diferente de `Label` (coluna) e de `WhatsAppTag` (conversa).
- **`Comment`**: `userId`/`processId`; `authorId` com **FK para User** (nullable, SetNull); `authorName`/`targetName` desnormalizados. Marcadores na 1ª linha: `[[AI_AUDIT|tipo|status]]`, `[[AI_AUDIT_PENDING|tipo]]`, `[[AI_AUDIT_FEEDBACK|commentId|rating]]` (parseados em `CommentsTab`).
- **`Log`**: `authorId` **sem FK**. `move.metadata = {from,to,cardName,service[,automationId,automationName]}` com **nomes** de coluna. Outras ações: `create`, `update` (`changes` de/para), `status_change`, `archive`, `comment_add`, `tag_add` (só da automação), `sheets_export`, `wa_text` (skip de automação). Lista em `LogAction` (`app/_shared/lib/log.ts`).
- **`AdminChecklistItem`**: `userId`/`processId` sem FK; `section` `COMERCIAL`/`ADM`/`MÉDICO`. Seed lazy dos `DEFAULT_CHECKLIST_ITEMS` no 1º GET.
- **`archiveStatus`**: `pagos_ccs`, `pagos_uni` (rótulo "APTOS …"), `enviados_{taynara,evelyn,joinville}`, `pastas_negadas_{ccs,uni}`, `perdeu_contato_definitivo`, `nao_assinaram_procuracao`, `descartados_analise_interna`, `desistiram_expressamente`, `voltar_um_dia`. Os três de `DESTRUCTIVE_ARCHIVE` pedem confirmação.
- **Strings mágicas no cliente**: evento `open-kanban-card` / `card-tags-changed`; sessionStorage `kanban-open-card`; localStorage `dpvat-kanban-collapsed`, `dpvat-card-draft:{u|p}:{id}`, `kanban-flow-layout-v1`. `authorId` sintéticos: `system` (cron de tempo), `whatsapp-bot` (assinatura), `kanban-overdue`.

## Regras invioláveis e armadilhas
- **Toda escrita de coluna grava `labelId` + `role` + `statusStartedAt`, cria log `move` e chama `runAutomations`.** Porquê: o board agrupa por `labelId`; bot, métricas e condições leem `role`/nome. São 3 implementações, e **não são iguais**:
  - `updateKanbanStatus` (`app/_actions/cards/update-kanban.ts`) não lê o `labelId` de origem e **não é idempotente**: sempre regrava `statusStartedAt` (zera o timer) e roda `runAutomations`, mesmo se o destino for a coluna atual. A origem do log vem de `role` e é comparada **pelo nome**, então coluna renomeada (`role` velho ≠ `label.name`) gera log `move` falso. Hoje os callers filtram antes (`moveCard` só chama com `columnChanged`; o `handleSave` do `CardDialog`, com `labelChanged`). Caller novo tem que filtrar também.
  - `moveCardToLabelByName` (`app/_shared/lib/signature/core.ts`) e o branch `move` de `executeAction` são idempotentes por `labelId` (`current.labelId === targetLabel.id` / `moveLabelId === currentLabelId` → retorna sem gravar, logar nem disparar). `moveCardToLabelByName` está sem chamador ativo: a chamada está comentada no fim da assinatura.
  - `/api/kanban/update-status` viola o contrato (sem `labelId`/log/automação); não use.
- **Não existe gancho de "saída de coluna".** `runAutomations` só recebe `newLabelId` e sai cedo (`if (!automations.length) return`) quando o destino não tem automação. Lógica de saída (tirar tag, avisar etc.) precisa rodar **antes** dessa checagem, ou no caller (que conhece a origem), nos 3 caminhos acima.
- **Log `move` é histórico permanente.** Porquê: `buildFolderReport` lê sem corte de data e o funil/Fluxo (`app/_actions/analytics/get-funnel-analytics.ts`) também usa esse log. `PURGEABLE_LOG_ACTIONS` o exclui de propósito.
- **Nome de coluna é contrato.** `PUT /api/labels/[id]` não atualiza `User.role`/`Process.role` dos cards, que ficam com o nome velho até o próximo movimento. Também quebram em silêncio:
  - `DONE_COLUMN_RE`, `EXPECTED_FLOWS` e `DISCARD_COLUMN_RE` (`/nikolas/i`) em `get-funnel-analytics.ts`;
  - `SIGN_NAG_ALLOWED_COLUMNS` em `app/_shared/lib/signature/core.ts`;
  - o keyword `CAIQUE`/`UNI` das planilhas (contains no nome);
  - condições de automação no campo `role`.
- **A coluna `order: 0` é a entrada.** `client-info.ts`, o webhook BotConversa e a assinatura criam o card nela com `role: 'Filtro de Cartões'` fixo; `createUser` usa a de menor `order`; `createProcess` procura pelo nome "Filtro de Cartões". Reordenar a 1ª coluna muda onde o card nasce e deixa `role` ≠ coluna.
- **Excluir coluna apaga as automações dela (cascade).** Os cards ficam com `labelId` null e **somem do board**. `DELETE /api/labels/[id]` não renumera `order`: excluir a 1ª coluna deixa ninguém com `order: 0`, e bot/inbox/assinatura (`findFirst({order:0})`) passam a criar card **sem `labelId`** (invisível) até alguém reordenar as colunas.
- **Nada de `revalidatePath` em `updateKanbanStatus`/`setArchiveStatus`.** Porquê: a página é 100% client com polling, e revalidar re-renderizava a rota a cada drop.
- **Reordenar = uma query por tabela** (`unnest` via `$executeRaw` em `reorderCards`), nunca um UPDATE por card. Porquê: o Neon é remoto, então N round-trips deixam o drop lento. Efeito colateral: SQL cru não mexe no `@updatedAt`, então reordenar **dentro** da mesma coluna não muda `computeBoardVersion` e as outras abas só veem a ordem nova quando algo mais mudar (lido no código, não reproduzido).
- **`pendingMutationsRef` é contador.** Faça ++/-- em `try/finally` em toda mutação otimista. Porquê: drops sobrepostos liberariam o polling cedo e o card voltaria pro lugar antigo (snap-back).
- **Mudou o que o board mostra → atualize `computeBoardVersion`** (hash no Postgres), senão o polling responde `unchanged` e ninguém vê a mudança. Connect/disconnect de tag não toca `updatedAt` (por isso as tabelas de junção entram no hash). Campo novo exibido no card também precisa entrar no comparador de `React.memo` do `DraggableCard`.
- **`status` é sobrecarregado.** No `KanbanCard` do board é o nome da coluna; no banco (e no modal, depois do load) é a etapa do checklist. Mudar a etapa **manda WhatsApp ao cliente** (`notifyStatusProgress`).
- **Ação `move` é terminal**, com encadeamento limitado a `MAX_MOVE_DEPTH = 3`. Mover pra própria coluna é barrado **na execução** (`executeAction` retorna se `moveLabelId === currentLabelId`) e ao salvar (`moveToSelf` no `handleSave` do editor). Só as **validações ao salvar** são exclusivas da UI: a API `/api/automations` aceita qualquer JSON e não checa `manage_automations`.
- **Condição de tag compara o NOME** (lowercase). Renomear a tag em `PUT /api/card-tags` quebra a condição em silêncio. A ação `add_tag` guarda `tagId` e não sofre com isso.
- **Não dá pra saber quem pôs a tag.** A ação `add_tag` grava log `tag_add` mesmo se o card já tinha a tag (o `connect` é idempotente, o log não). A atribuição manual (`CardTagsBar` → `POST /api/card-tags/assign`, connect/disconnect) não gera log nenhum.
- **Datas do card são texto livre.** `data_nasc`/`data_acidente` são `String` ("DD/MM/AAAA", "05/1999", "1999"; ver `DateFlexField` em `DetailsTab.tsx`). O `toDate` de `automation-conditions.ts` faz `new Date(valor)`, que não entende DD/MM/AAAA: dia > 12 vira data inválida (condição falsa) e dia ≤ 12 é lido como MM/DD. Por isso campo de data em texto não serve de prazo. `DUE_DATE_FIELDS` no `AutomationsPanel` só tem `afastadoAte` (`DateTime`); prazo novo = coluna `DateTime` + entrada nessa lista.
- **Prazo é por dia de calendário.** O vencimento é a meia-noite UTC do dia digitado e "hoje" é o dia de Brasília (`brDayKey`). Nunca compare instantes. (Exceção atual: `__time_in_column__` conta blocos de 24 h desde `statusStartedAt`, e `lessThanDays` é verdadeiro logo no drop.) Regressão coberta em `tests/automation-conditions.test.ts`. Se o cron ficar ~24 h fora, aquele degrau de "faltam X dias" se perde.
- **`AutomationFire` é criado antes de executar.** Porquê: evita disparo duplo em corrida entre execuções. Efeito: ação que falhou não roda de novo no mesmo ciclo.
- **`runAutomations` (no movimento) também avalia automações com condição de tempo** e **não** grava `AutomationFire`. Elas podem disparar no drop e de novo no cron (código atual).
- **`/api/automations/cron/time-check` não está em `PUBLIC_API_PREFIXES` do `middleware.ts`.** O Vercel Cron chega sem cookie e deve tomar 401 antes do `isCronAuthorized` (não verificado nos logs da Vercel). `afastamentos/check` está liberado.
- **A ação `comment` grava `Comment.authorId` = autor do disparo (FK para User).** No cron de tempo é `"system"` e na assinatura é `"whatsapp-bot"`. Sem User com esse id, o create falha e a exceção aborta o resto: a coluna no movimento, a varredura inteira no cron (não verificado no banco). Padrão seguro: `authorId` null + `authorName`, como faz `ai-audit.ts`.
- **Ação nova não pode lançar exceção.** Envolva o branch em `try/catch` e registre a falha como log do card (modelo: `logSkip` do WhatsApp). Porquê: o erro de uma ação derruba as seguintes.
- **Ação `whatsapp` é multi-número.** `waNumberId` vazio = `resolveNumberForTemplate(waTemplateName)` em `sendSystemWhatsApp`; template é por WABA (nome existe numa linha e não na outra). Opt-out e intervalo mínimo viram skip. O `logSkip` grava action `wa_text`, que está em `PURGEABLE_LOG_ACTIONS`: o motivo some após 180 dias.
- **`getVars` expõe a linha inteira do card** (`findUnique` sem `select`), inclusive `password` (hash) e `senha_inss`. `[[senha_inss]]` num comentário ou WhatsApp vaza a senha; não sugira essas variáveis.
- **Upload do `.docx` de automação passa pelo corpo da função** (`formData` em `/api/automations/upload-template`): arquivo acima do limite de ~4,5 MB da Vercel falha antes da rota.
- **Auth das actions.** `updateKanbanStatus`, `reorderCards`, `updateUser`, `updateProcess`, `createProcess`, `createComment`, `getUsers` e `getProcess` só checam `getServerSession`, então cliente logado passa. `createUser` (card de cliente), `getContacts` e `DeleteContact` não checam nada. `/api/card-tags`, `/api/automations`, `/api/hospitals` (inclusive o `DELETE`), `/api/admin-checklist` e `/api/comments` só contam com o middleware. Nada disso (nem `/api/board-state`) passa pela trava de IP, que vive em `layout.tsx` e em `requireTeam`. Em código novo use `requireTeam()`/`requirePermission(key)`; permissão nova também vai em `PERMISSION_DEFS` + `ROLE_DEFAULTS`.
- **`ARCHIVE_LABELS` tem 4 cópias**: `archive-card.ts` (arquivo "use server" não exporta constante), `archive-catalog.ts`, `DIVISION_LABELS` em `search-archived.ts` e `folder-report.ts`. O menu do card em `KanbanBoard.tsx` e `STATUS_CONFIG` em `ArchivedCards.tsx` também são listas à mão.
- **`userFullSelect`/`processFullSelect` não selecionam `archiveStatus`/`boardOrder`.** `getUsers('full')` devolve `archiveStatus: null` e o merge do `CardDialog` sobrescreve o stub. Resultado: card arquivado aberto no modal mostra `ArchiveBar` como ativo (lido no código, não reproduzido).
- **CPF/telefone/CEP no banco só com dígitos** (`stripFormat` em `updateUser`/`updateProcess`, strip em `createUser`); a UI formata. `User.email` é único e card sem e-mail ganha placeholder em **dois padrões**: `${cpf}@inserir-email.com` (`createUser`, CRM) e `inserir_email-${phone}@gmail.com` (ficha do WhatsApp em `addClientFromConversation`, assinatura em `signature/core.ts` e `app/api/botconversa/contratado/route.ts`). Filtro de "sem e-mail" precisa pegar os dois (modelo: `isRealEmail` em `app/_actions/auth/password-reset.ts`). "Criar mesmo assim" com CPF repetido e sem e-mail estoura a constraint.
- **Hospitais não têm tabela.** `DELETE /api/hospitals` zera `hospital` em **todos** os cards com aquele nome. Criar hospital novo é gated por `create_hospitals` no `HospitalCombobox`.
- **A contagem de anexos do board não filtra `deletedAt`**: arquivo na lixeira continua contando. Excluir card (`deleteCard`, `delete_cards`) apaga em cascata Comment/Document (só a linha; o S3 fica)/Log. Em card-Process o `Comment` não tem cascade e fica com `processId` null. Ficam órfãos `AdminChecklistItem`, `AutomationFire` e o `userId` solto em `WhatsAppContact`/`Mention`/`Notification`.
- **Novos itens em `DEFAULT_CHECKLIST_ITEMS` só valem pra card sem checklist.** `markPersonalDocChecklistItem` acha o item pelo texto: "DOCUMENTO PESSOAL" **e** "ATUALIZADO".
- **Dia/mês/hora sempre via `app/_shared/utils/date-br.ts`**, porque a Vercel roda em UTC. **Dark mode é Dark Reader**: classes `dark:` são inertes, não "conserte" por elas.
- **Schema**: nunca rode `prisma migrate dev`, porque o Neon tem drift e ele propõe resetar produção. Use `migrate diff` → ler o SQL → `db execute` → `migrate resolve --applied`. `prisma generate` falha (EPERM) com `npm run dev` rodando.

## Receitas
- **Campo novo no card** → decida primeiro se ele aparece só no modal ou também no card do quadro.
  - **(a) Só no modal**:
    - `prisma/schema.prisma` (User **e** Process) + migration pelo fluxo seguro;
    - selects completos `userFullSelect` (`app/_shared/lib/db/users.ts`) e `processFullSelect` (`app/_shared/lib/db/processes.ts`);
    - mapeamento campo a campo em `mapUser`/`UserData` (`app/_actions/users/get-user.ts`) e `mapProcess`/`ProcessGet` (`app/_actions/process/get-process.ts`); campo fora do map não chega ao modal;
    - update campo a campo em `updateUser`/`UpdateUserData` (`app/_actions/users/update-users.ts`) e `updateProcess`/`UpdateProcessData` (`app/_actions/process/update-process.ts`), inclusive no objeto de retorno. **Não copie o `|| undefined`** de `data_nasc`/`data_acidente`: string vazia vira `undefined` e o valor nunca é apagado. Use `x !== undefined ? (x.trim() || null) : undefined`;
    - `ExtendedKanbanCard` (`card-dialog/types.ts`), `EDITABLE_FIELDS` (`CardDialog.tsx`), o input em `DetailsTab.tsx` e o rótulo em `CARD_FIELD_LABELS` (`app/_shared/lib/log.ts`);
    - opcional: `CARD_FIELDS` do `AutomationsPanel` (condição) e `CLIENT_FIELDS`/`AI_FIELDS` se a ficha do WhatsApp deve preencher.
  - **(b) Também no card do quadro**: tudo de (a) + `userBasicSelect`/`processBasicSelect`, `mapBasic` (board-state), `KanbanCard` e `Item` + os mapeamentos `Item` → `KanbanCard` dentro de `KanbanBoard.tsx` (há mais de um; busque `afastadoAte: item.afastadoAte`) e o comparador do `DraggableCard`. `computeBoardVersion` só muda se o dado vier de outra tabela (coluna de User/Process já mexe em `updatedAt`). Aumenta o payload do polling de 7 s em todas as abas: só se necessário.

  Cuidado: `getVars` expõe tudo como `[[campo]]`. Valide com `npx tsc --noEmit`: edite, salve, reabra, **apague o valor** e confira a aba Logs.
- **Ação nova de automação** → antes de criar, confira se ela já existe: o union `AutomationAction` (db/automations.ts) já tem `comment`, `file`, `whatsapp`, `move`, `ai_audit`, `sheets` e `add_tag`. Se não existe, mexa:
  - no union `AutomationAction` e num branch em `executeAction` com `try/catch` + log (+ `LogAction` se logar);
  - no `AutomationsPanel.tsx`: tipo local `Action` (duplica `AutomationAction`, não importa), union e objeto de reset do `onValueChange` do Select de tipo em `ActionRow` (lista os campos à mão), `SelectItem` do seletor de tipo, editor da ação em `ActionRow`, validação em `handleSave` e resumo em `AutomationCard`.

  Cuidado: `authorId` pode ser sintético, e `move` para o loop. Valide: automação numa coluna de teste, arraste um card de teste e veja Logs/Comentários.
- **Condição ou operador novo** → mexa no union de `operator`, em `evalConditions` (puro) e em `OPERATORS`/`TAG_OPERATORS` do painel. Se depender de tempo, também em `fetchTimeConditionAutomations` e `fireCycleKey`. Valide com um caso novo em `tests/automation-conditions.test.ts` + `npm test`.
- **Destino de arquivamento novo** → mexa em `ArchiveStatus` + as 4 cópias de rótulos + `ARCHIVE_GROUPS` + o menu do card em `KanbanBoard.tsx` + `STATUS_CONFIG`/abas em `ArchivedCards.tsx`. Se for pago/negado, também `PAID_STATUSES`/`DENIED_STATUSES` (folder-report.ts). Valide com `tsc`: os `Record<ArchiveStatus,…>` (`archive-catalog.ts`, `search-archived.ts`, `STATUS_CONFIG`) acusam falta, mas o de `folder-report.ts` é `Record<string,string>` e fica mudo.
- **Mover card por código (bot/cron/webhook)** → copie `moveCardToLabelByName` (signature/core.ts), não chame `updateKanbanStatus` (exige sessão e não é idempotente). Cuidado: idempotência (`current.labelId === targetLabel.id`) e busca da coluna por nome (case-insensitive). Valide pelo log `move` no card e pelo disparo das automações.
- **Criar card por código** → `nextval('card_number_seq')`, `labelId` da coluna de entrada, `role` = nome dela, `service:'INSS'`, `status:'INSS_S1'`, `statusStartedAt: new Date()`, e-mail placeholder único (`inserir_email-${phone}@gmail.com` vindo do WhatsApp; `${cpf}@inserir-email.com` no CRM), `createLog('create')`. Antes, cheque `findDuplicateClient`. Cuidado: sem `labelId` o card fica invisível.
- **Dado novo no payload do board** → `GET` de board-state + `computeBoardVersion` + `fetchData` (assinatura por fonte). Cuidado: ~1 MB por tick × abas abertas (custo de egress do Neon). Valide com 2 abas: mude numa e veja a outra em ≤7 s.
- **Renomear, reordenar ou excluir coluna em produção** → antes, `grep` pelo nome em `get-funnel-analytics.ts`, `signature/core.ts` e nas automações (`role`, `moveLabelId`). Avise que `role` dos cards fica velho. Valide na aba Fluxo do Kanban e nas planilhas Caique/UNI.
- **Abrir card a partir de outra aba/feature** → grave `sessionStorage['kanban-open-card']={id,isProcess}` **antes** de disparar `open-kanban-card` (o board pode estar desmontado). Modelo: `box.tsx`.
- **Nova permissão de card** → `PERMISSION_DEFS` + `ROLE_DEFAULTS` (permissions.ts), `requirePermission` na action, `usePermissions().perms.<key>` na UI. Valide com `tests/permissions.test.ts`.
- **Mexer no editor de automações** → `AutomationsPanel.tsx` é grande (1,5 k linhas). Leia por `Grep` dos símbolos acima; toda validação nova precisa existir também no servidor se for regra de segurança.

## Testes e validação
- `tests/automation-conditions.test.ts`: `daysUntilDue` (fuso/sinal), `evalConditions` de vencimento (dia exato, 10 × 5 dias, sem data), `fireCycleKey`. `tests/date-br.test.ts`: cortes de dia em UTC. `tests/permissions.test.ts`: `resolvePermissions`/`isTeamRole`. Não há teste de board, arquivamento nem executor (Prisma/S3).
- Comandos (os mesmos do CI em `.github/workflows/ci.yml`): `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`, `npm test`. O `next build` local não é confiável (OOM ou morre em silêncio); o build de verdade é o da Vercel.
- Manual (`npm run dev`, logado como ADMIN*, IP liberado):
  - arraste um card entre colunas e dentro da coluna, dê F5 e confira ordem e coluna;
  - na aba Logs do card, confira o `move` de/para;
  - com 2 abas abertas, a outra atualiza em ≤7 s;
  - arquive, clique em "Desfazer" e veja o card voltar;
  - crie uma automação `comment` numa coluna de teste e mova um card.
- Cron de tempo manual: `GET /api/automations/cron/time-check?secret=$CRON_SECRET` com sessão no navegador (sem sessão o middleware barra). Confira `automation_fires`.

## Fronteiras
- **Auth/permissões** (`docs/ai/auth-permissoes.md`): `requireTeam`/`requirePermission` (`app/_shared/lib/permissions-server.ts`), `usePermissions` (`app/nova-dash/_components/PermissionsProvider.tsx`), `middleware.ts`, trava de IP em `layout.tsx`.
- **WhatsApp/bot** (`docs/ai/whatsapp-bot.md`): `sendSystemWhatsApp` (`whatsapp/outbound.ts`) nas ações; `notifyStatusProgress` (`whatsapp/status-notify.ts`) no status; `findLinkedCard` (`whatsapp/bot.ts`) lê o card pelo telefone/`WhatsAppContact.userId`. Criação de card pelo inbox em `app/_actions/whatsapp/client-info.ts`; alerta de card estourado em `runSlaPhase` (`whatsapp/cron-tasks.ts`).
- **Documentos/IA** (`docs/ai/documentos-ia.md`): `runAiAudit` (`ai-audit.ts`), `inferCategory` (`document-categories.ts`), `FilesTab` → `app/_actions/documents/**`, roteiro via `/api/roteiro`, Gerador IA (`card-dialog/doc-ia/`, `canUseDocIa`).
- **Assinatura** (`docs/ai/assinatura.md`): `runAutomations` e `SIGN_NAG_ALLOWED_COLUMNS` em `app/_shared/lib/signature/core.ts`; `gerarContratoDoCard` no `IntegrationsTab` (bloco desligado por `CONTRACT_BLOCK_ENABLED`).
- **Analytics** (`docs/ai/analytics-custos.md`): `getKanbanFlowAnalytics`/`getFunnelAnalytics` (logs `move`), `getStrategicDashboardData` alimenta `KanbanFlowPanel` e o legado do `MiniKanban` (os leads do sistema vêm de `getBotKanbanLeads`); `CalendarTab` também é montado no `StrategicDashboard`.
- **Workspace/menções** (`docs/ai/workspace-equipe.md`): `recordMentions` (`mention-inbox.ts`) em `createComment`; sino em `box.tsx`.
- **Dados/infra** (`docs/ai/data-model.md`, `docs/ai/infra-integracoes.md`): `createLog`/`diffFields` (`app/_shared/lib/log.ts`), retenção (`app/_actions/maintenance/retention.ts`), crons em `vercel.json`, Google Sheets (`google-sheets.ts`), S3.
