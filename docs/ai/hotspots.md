# Hotspots — os 12 maiores arquivos de `app/`
> Medido em 2026-09-23 com `find app -name '*.ts' -o -name '*.tsx' | xargs wc -l` (sem `node_modules`/`.next`).
> **As faixas de linhas apodrecem** a cada commit nesses arquivos. São aproximadas (±20 linhas): confirme com `Grep -n "<símbolo>"` antes de um `Read offset/limit`. Rode `/mapa-atualizar hotspots` para regenerar este arquivo quando algum deles mudar >15% de tamanho ou entrar/sair do top 12.

Como usar: ache o arquivo, escolha a seção pelo nome do componente/função e leia só aquela faixa (`Read(file, offset=<início>, limit=<fim-início>)`). Para o contexto de domínio (regras, fluxos, armadilhas), leia antes o mapa correspondente em `docs/ai/`.

| # | Arquivo | Linhas | Mapa de domínio |
|---|---|---|---|
| 1 | `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | 3316 | whatsapp-bot |
| 2 | `app/nova-dash/KanbanBoard.tsx` | 2407 | kanban-cards |
| 3 | `app/_shared/lib/signature/core.ts` | 1908 | assinatura |
| 4 | `app/nova-dash/AutomationsPanel.tsx` | 1587 | kanban-cards |
| 5 | `app/_shared/lib/whatsapp/bot.ts` | 1704 | whatsapp-bot |
| 6 | `app/nova-dash/KanbanFlowPanel.tsx` | 1263 | analytics-custos |
| 7 | `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | 1253 | whatsapp-bot |
| 8 | `app/_shared/lib/whatsapp/cron-tasks.ts` | 1450 | whatsapp-bot |
| 9 | `app/nova-dash/card-dialog/ScriptTab.tsx` | 893 | documentos-ia |
| 10 | `app/nova-dash/mentions/MentionsInbox.tsx` | 878 | workspace-equipe |
| 11 | `app/nova-dash/card-dialog/FilesTab.tsx` | 874 | kanban-cards / documentos-ia |
| 12 | `app/_shared/lib/signature/pdf.ts` | 857 | assinatura |

---

## 1. `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` — 3316 linhas
Inbox multi-número do WhatsApp: rail de pastas + lista filtrável, thread com envio otimista/mídia/reações, coluna Copiloto e CardDialog do cliente.

- **L1-80** imports (`fileNameFromKey` vem de `app/_shared/utils/s3-keys.ts`; URL de mídia de `media-url-cache.ts`; `withTag`/`patchConversationList`/`readPatch`/`manualUnreadPatch`/`assumePatch`/`returnToBotPatch`/`closePatch`/`sentMessagePatch`/`inboxListState` de `app/_shared/utils/whatsapp-inbox.ts`; `toThreadMessage` de `app/_shared/utils/thread-window.ts`; `decideThreadScroll`/`tailAdvanced`/`countNewBelow` de `app/_shared/utils/thread-scroll.ts`; `restoreInboxView`/`saveInboxViewState`/`pruneTagFilter` de `app/_shared/utils/inbox-view-state.ts`; `useWaNumberOptions` de `use-whatsapp.ts`; `flushSync` de `react-dom`).
- **L81-190** helpers de módulo: `WINDOW_24H_MS`, `INBOX_SUPPORT_SWR` (opções SWR de tags/total da agenda), `INBOX_VIEW_SAVE_DEBOUNCE_MS`, `NO_WA_NUMBERS`, `CLOSE_MENU_META`, `initials`/`timeShort`/`dayLabel`/`formatPhone`, `STATUS_LABEL`/`STATUS_CHIP`, classes `chipCls`/`pillCls`, `NumberBadgeContext`, `RecoveryCapContext`, `attendantBadgeColor`.
- **L191-2310 `WhatsAppInbox()`** (componente principal):
  - L191-370 estado + filtros (`me` = id/nome dos patches locais): `loaded`/`isLoading`/`error` da lista, tags por SWR `wa-tags` (`allTags` undefined = carregando, `tagsFailed`, `reloadTags` = `mutateTags`, `pruneTagFilter`), busca no servidor (`searchSeq`), data de entrada (`applyDatePreset`, `applyCustomRange`), leitura/fila (`changeReadFilter`), número (`useWaNumberOptions`, restauração do `wa-number-filter`, `changeNumberFilter`, `numberBadges`, `recoveryCapOf`), `closeMenuOptions`.
  - L371-460 larguras redimensionáveis (`startResize`), pastas do rail (`RailFolder`, `ACTIVE_FOLDERS`, `CLOSED_FOLDERS` com `satisfies`, `FOLDER_TITLE`, `FOLDER_ACCENT`), pasta Contatos (total por SWR `wa-directory-total`).
  - L461-659 conversa aberta: `jumpToMessage`, restauração da navegação + notificação→abre conversa (`viewRestoredRef`, `restoredContactIdRef`, `viewReady`), gravação com debounce + flush no unmount (`pendingViewRef`), `listActive`/`active` (hidratação sob demanda; conversa restaurada que sumiu é solta; `openingActive` = "Abrindo conversa…"), ficha por SWR (`getClientInfo`; `justLinked`/`migratedDrafts` disparam `wa-docs-changed`), `cardStub`, SSE `onStream`, `displayMessages`.
  - L660-798 rolagem da thread: refs `scrollSessionRef`/`distanceRef`/`followRef`/`tailRef`/`prependRef`, chip `newBelow`, `useLayoutEffect` com `decideThreadScroll` (jump/restore/smooth/chip), reancorar no fim quando foto/vídeo carrega, `handleThreadScroll`, `stopFollowingThread`, `scrollThreadToEnd`, `handleLoadOlder`.
  - L799-949 derivação da lista: `inDateRange`, `searchUniverse`, `filtered`, contadores (`dateCount`, `readCounts`, `numberCounts`), `kanbanColumns`, `groups`, `humanFilter`, `ativasItems`/`todosItems`, `teamLoad`, `FOLDER_ITEMS`, `visibleItems`, `listState` (esqueleto/erro/vazia), `windowExpired`.
  - L950-1312 handlers: `runAction` (`opts.base` + otimista, patch devolvido pela action por cima via `confirmedPatch`, rollback e `errorMsg` próprio, sem recarga), `patchConversation` (patch local na lista + busca + `fetchedActive`), leitura ao abrir (`readKeyRef` + `readPatch`, um `markConversationRead` por inbound novo, sem recarga), tag otimista (`pendingTags` por conversa, `handleSetTag`), envio otimista (`makePending`, `patchPending`, `removePending`, `commitSent` = upsert no cache da thread + tira o pending no mesmo render, `handleSendText`, `handleSendMedia` com `sentMessagePatch` na lista, `handleSentOutside` para fluxo/template, `retryPending`), `handleEditSubmit`, `handleAttachMedia`, `handleDelete`, `handleReact`, `handleBlockContact`, `handleDeleteContact`.
  - L1313-1856 JSX da **lista**: rail (L1326), busca + novo contato (L1381), pills de leitura (L1406), data de entrada (L1446), número (L1499), coluna do Kanban (L1540), tags (L1587), equipe (L1630), área rolável (L1710: agenda com abertura imediata / esqueleto / erro com "Tentar novamente" / "Nenhuma conversa ainda" / seções por pasta), alça de resize (L1849).
  - L1857-2253 JSX da **thread**: "Abrindo conversa…" ou vazio, cabeçalho (L1873: voltar, atalho "Card #N" L1910, menu de tags L1925 com spinner por item, Assumir/Devolver otimistas, Encerrar/Alterar desfecho L1990, Reabrir, toggle Copiloto, mais ações L2059 com lida/não lida otimistas), área rolável com `onScroll` (L2122) + carregar histórico + spinner da 1ª carga (L2132), chip "Nova mensagem ↓" (L2194), composer (`onRefreshThread`/`onSent`) / número desativado somente leitura (L2204).
  - L2254-2310 coluna Copiloto (`<CopilotPanel>`) + CardDialog do cliente vinculado.
- **L2312-2379** `GROUP_ACCENT`, `windowPill`, `mediaKindIcon`, `SourceBadge`.
- **L2380-2553** diálogos: `CloseReasonsModal` (motivos de não qualificada), `AddContactDialog`, `RailButton`.
- **L2554-2603** estados de carga: `ConversationListSkeleton` (8 linhas `animate-pulse`), `TagMenuStatus` (carregando / erro com "Tentar novamente" / nenhuma tag, nos dois menus de tag).
- **L2604-2776** `ConversationGroup` (item/seção da lista).
- **L2777-2982** bolha de mensagem: `StatusTicks`, `parseReactionBody`, `WA_REACTION_EMOJIS`, `ThreadMessageRow`.
- **L2983-3292** mídia: `WaMediaBubble` (`useMediaUrl` com a `mediaUrl` da rota; `onError` → "Arquivo indisponível"), `fmtAudioTime`, `WaAudioBubble` (`onMediaError`).
- **L3293-3316** `MsgAction`, `HeaderButton`.

## 2. `app/nova-dash/KanbanBoard.tsx` — 2407 linhas
Board Kanban da nova-dash: colunas = labels, cards arrastáveis, polling com versão, CRUD de etiquetas, arquivar/mover/excluir.

- **L1-66** imports, `dynamic`, `KANBAN_POLL_MS`, `COLLAPSED_STORAGE_KEY`, `hexToRgba`.
- **L75-258** tipos exportados/internos: `KanbanCard`, `CardTagInfo`, `Comment`, `Attachment`, `ChecklistItem`, `Column`, `Label`, `LabelInput`, `Item`; `services` (cores hardcoded de fallback), `serviceStyles`.
- **L259-308** badges: `renderTimerBadge`, `calendarDaysUntil`, `renderAfastamentoBadge`.
- **L309-433** `LabelDialog` (criar/editar etiqueta).
- **L434-631** `CreateLabelButton`, `CreatePerson` (novo cliente/card).
- **L632-1051** `DraggableCardBase` (card: drop-alvo p/ inserir acima, permissões `archive_cards`/`delete_cards`, menu "Mover para", tags, badges) + `DraggableCard = React.memo(...)` com comparador (L1023).
- **L1052-1365** `DroppableColumn`: auto-scroll no drag (`cacheDragRect`, `handleDragOverAutoScroll`), cor da coluna, editar/excluir coluna (`handleConfirmDelete`), render (L1228).
- **L1366-1378** `ColumnDropZone` (persiste ordem das colunas ao soltar).
- **L1382-2407 `KanbanBoard`** (principal):
  - L1382-1540 estado, `filteredItems` (useMemo), tags dos cards, medida de altura, navegação horizontal (`updateScrollButtons`, `scrollBoardBy`), abertura pedida por busca global/Menções via sessionStorage.
  - L1540-1640 busca: `searchMatches`, busca em arquivados, `openCardFromItem`, `openArchivedCard`.
  - L1639-1815 sincronização: contador de mutações em voo, assinaturas por fonte, versão `?v=`, erros; `fetchData` (L1663) e polling (L1744).
  - L1816-1872 CRUD de etiquetas: `createLabel`, `updateLabel`, `deleteLabel`.
  - L1873-2115 ações de card/coluna: `moveCard` (L1876, persiste `boardOrder`), `handleDrop`, `handleMoveTo`, `moveTargets`, `handleCardDrop`, `handleQuickAction`, `handleCardUpdate`, `handleDeleteCard`, `performArchive` (com Desfazer), `handleArchiveCard`, colapsar colunas (`toggleCollapse`, `toggleAllColumns`), `handleColumnReorder`, `persistColumnOrder`.
  - L2116-2407 JSX: barra de busca/filtros + ações (L2234-2260), colunas dentro de `ColumnDropZone` (L2323), `CardDialog` (L2352), `AutomationsPanel` (L2370), confirmação de arquivamento definitivo (L2376).

## 3. `app/_shared/lib/signature/core.ts` — 1908 linhas
Orquestração da assinatura eletrônica própria: extração do KIT por IA, validação (CPF/CEP/rua), coleta/confirmação pelo bot, emissão do link, pós-assinatura e lembretes.

- **L1-24** imports.
- **L25-140** config e travas: `PROTOCOLO_HOSPITAL_LABEL`, env do micro, constantes de lembrete, `SIGN_NAG_ALLOWED_COLUMNS`, `normalizeColumnName`, `contactCardColumn`, `isSignatureNagAllowed`, S3, `isAutoSignatureEnabled`, `SIGNATURE_AUTO_PAUSE_KEY`, `isAutoSignatureActive`.
- **L141-301** campos do KIT e validação: `CONTRACT_FIELD_KEYS`, `FIELD_LABELS`, `MIN_CONFIDENCE`, `ExtractedField(s)`, `isValidCPF`, `MissingField`, `UF_NAMES`, CEP (`lookupCep` com cache, `formatCep`, `checkAndEnrichCep`).
- **L302-415** segunda validação do endereço (rua × CEP): `normStreet`, `sameStreet`, `CepMismatch`, `CEP_CHOICE_MARK`, `detectCepMismatch`, `validateExtraction`.
- **L416-487** suporte: `collectDocumentMedia`, `notifyTeam`, `logSignature`.
- **L488-541** extração via micro: `httpErrorDetail`, `callExtract`.
- **L542-873** geração do documento e do link: `buildDados`, `summaryMessage`, `cepQuestionMessage`, `sendSummaryOrCepQuestion`, `DeliveryMode`, `ensureCardForContact`, `moveCardToLabelByName`, `issueSignature` (L718), `failToHuman`, `activeCycle`.
- **L874-967** Porta 1 (automática na qualificação): `maybeStartSignatureFlow`.
- **L968-1106** coleta LEGADA (status "coletando"): `COLLECT_MAX_ROUNDS`, `askMissingMessage`, `handleCollectionReply`.
- **L1107-1384** resposta à confirmação: `parseCepChoice`, `handleCepChoiceReply`, `handleConfirmationReply` (L1235), roteador `handleSignatureClientReply` (L1375).
- **L1385-1546** Porta 2 (manual, card/inbox): `ManualSignatureResult`, `fieldsFromRecord`, `createSignatureFromCard`, `createSignatureFromContact`, `createSignatureForContact`.
- **L1547-1718** pós-assinatura: `markViewed`, `attachSignedPdf`, `finalizeSignature` (L1613), `requestHumanHelp`.
- **L1719-1908** lembretes + faxina (cron): `nextBusinessSlot`, `REMINDER_TEXTS`, `ReminderResults`, `runSignatureReminders`.

## 4. `app/nova-dash/AutomationsPanel.tsx` — 1587 linhas
Painel/editor das automações do Kanban: gatilho, condições (campo/tag/tempo/prazo) e ações (comentário, .docx, WhatsApp, auditoria IA, planilha, tag, mover).

- **L1-60** imports, `MentionableUser`, `fetcher`.
- **L61-127** tipos: `Condition`, `Action`, `CardTagOption`, `WaTemplateOption`, `WaNumberOption`, `AutomationData`, `Label`, `AutomationsPanelProps`.
- **L128-218** mapa de campos/operadores: `__TIME_IN_COLUMN__`, `__DUE_DATE__`, `DUE_DATE_FIELDS`, `TIME_IN_COLUMN_OPERATORS`, `DUE_DATE_OPERATORS`, `CARD_FIELDS`, `OPERATORS`, `TAG_OPERATORS`, `VARIABLE_CHIPS`, `DEFAULT_CATEGORIES`.
- **L219-248** helpers: `emptyCondition`, `emptyAction`, `labelForField`, `labelForOp`, `HOSPITAL_FIELDS`.
- **L249-446** `ConditionRow`.
- **L447-933** `ActionRow`: `insertVar`, template WA × número (`templateNumberMismatch`), `handleFileChange`; blocos por tipo — `comment` L570, `file` L614, `whatsapp` L664, `ai_audit` L782, `sheets` L816, `add_tag` L858, `move` L894.
- **L934-1211** `AutomationEditor` (dialog): `handleSave` L986; seções nome/categoria L1039, gatilho/tipo de card L1063, condições L1102, ações L1165.
- **L1212-1393** `AutomationCard` (resumo de uma automação na lista).
- **L1394-1587** `AutomationsPanel` (export): categorias/filtro, `loadAutomations`, `handleSave`, `handleToggle`, `handleDelete`, render L1472.

## 5. `app/_shared/lib/whatsapp/bot.ts` — 1704 linhas
Ponte CRM ↔ cérebro do bot: monta o payload da conversa, chama o microserviço, sanitiza a decisão e executa (responder, qualificar, fila, encerrar).

- **L1-61** imports (`shouldAbortSend`/`isTerminalBotAction` de `bot-timing.ts`, `reportCriticalError`, `findConversationOwner` de `ownership.ts`), env (`CHATBOT_URL`, staging `CHATBOT_URL_STAGING`, `TEST_NUMBERS`).
- **L62-229** histórico e tipos: `historyText`, `historyRole`, `SYSTEM_SOURCE_LABELS`, `brainUrlFor`, constantes (`BURST_DEBOUNCE_MS`, `BOT_TIMEOUT_MS`, `BOT_MAX_ATTEMPTS`), S3, `ProcessInfo`, `LinkedCard`, `BotUsage`, `BotDecision`, `sumUsage`, `isBotConfigured`.
- **L230-349** filtros de sanidade: `SCHEMA_TOKENS`, `isJsonSkeleton`, `looksLikeJsonFragment`, `REASONING_PATTERNS`, `looksLikeReasoning`, `SCRIPT_STATES`, `sanitizeDecision`, `sleep`, `humanDelay`.
- **L350-381** `businessHours`.
- **L382-467** vínculo com o card: `findLinkedCard`; consultas da IA: `runLookup`.
- **L468-814** fila, qualificação e encerramento: `postInternalNote`, `QueueOpts`, `handoffToQueue` e `qualifyToQueue` (exportadas, `updateMany` condicional com `onlyIfStatus`, devolvem se moveram, gravam o dono pegajoso e notificam só ele), `queueOwner`, `ownerSuffix` ("— volta para <nome>" na nota), `tagAsQualified`, `createCardTaskForTeam`, `disqualifyAndClose`, `resolveAndClose`, `sendMutedFallback`, `handoffNotifyOnly` (`onlyTo` = dono).
- **L815-892** envio: `sendBotReply` (relay por `broadcastWhatsAppEvent`, depois da resposta).
- **L893-960** chamada ao micro: `callBrainOnce`, `callBrain` (retry).
- **L961-1704 `handleIncomingWhatsApp`** (entrada do webhook): `ONLY_IF_BOT`, `findNewerInbound` e `isStillBot` declarados antes do `try`; em blocos `// ---- X`: debounce de rajada L1008 (checagem dentro do `try`) → lote L1034 → mídia L1059 → mensagem cruzada L1103 → assinatura eletrônica L1124 → contexto/payload L1176 (`docsReceived` por `docsReceivedSince` + `clientDocumentMediaWhere`) → IA + lookup L1264 → retry de resposta vazia L1281 → transcrições L1315 → corrida pós-cérebro + releitura de status L1335 → contador "não entendi" L1354 → opt-out L1363 → memória/estado (`persistMemory`, só no 1º envio) L1412 → laço de blocos com `shouldAbortSend` + releitura antes da ação L1431 → `switch (decision.action)` L1484-1590 (`send_flow`, `qualify`, `disqualify`, `handoff`, `resolve`; `queueSkipped`) → auditoria/métricas L1592 (`wa_bot` com `facts`, `blocksSkipped`, `handoffSkipped`) → telemetria do playbook L1645 → `catch` L1656 (inbound mais nova = só loga; senão handoff condicional; falha do handoff = `reportCriticalError`).

## 6. `app/nova-dash/KanbanFlowPanel.tsx` — 1263 linhas
Dashboard "Fluxo do Kanban": 7 visões (tempo, destino, retrabalho, descarte, ciclo, throughput, hospital) com gráficos SVG próprios, comparação de período, drill-down e export.

- **L1-102** imports, constantes/helpers: `COLORS`, `ChartType`, `ViewKey`, `VIEWS`, `PeriodMode`, `periodRange`, `previousRange`, `fmtDays`, `num`, `ChartRow`, `TrendSeries`.
- **L103-294** gráficos SVG: `ColumnsChart`, `PieChart`, `FunnelChart`, `LineChart`.
- **L295-372** peças de UI: `KpiCard`, `Insight`, `SegControl`, `SeriesFilter`.
- **L373-426** exportação: `downloadBlob`, `exportCsv`, `exportJpeg`.
- **L427-446** layout persistido: `PanelLayout`, `LAYOUT_KEY`, `loadLayout`.
- **L447-485** `DrillModal`.
- **L486-742 `KanbanFlowPanel`** (export): período próprio/comparação (L511-541), `persistLayout`, `movePanel`, `toggleWide`, `toggleSeries`, `setType`; JSX cabeçalho L596, abas L685.
- **L743-892** `PanelCard` (uma visão: cabeçalho, seletor de origem, busca de hospital, KPIs, insight, gráfico, tabelas).
- **L893-1208** `buildView` (analytics → dados do painel): `tempo` L929, `destino` L969, `retrabalho` L998, `descarte` L1046, `ciclo` L1083, `throughput` L1131, `hospital` L1162; `deltaSub` L911.
- **L1209-1263** `HospitalTable`.

## 7. `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` — 1253 linhas
Coluna direita do inbox: abas Copiloto (resumo/sugestão IA, checklist), Ficha (dados do cliente editáveis + IA), Notas internas com @menção e Arquivos da ficha.

- **L1-80** imports (`fileNameFromKey` de `s3-keys.ts`; `useMediaUrl`/`seedMediaUrl`/`getMediaUrl` de `media-url-cache.ts`), `CopilotTab`, `mediaIcon`, `previewKind`, `timeStamp`, `Props`.
- **L81-563 `CopilotPanel`** (export): documentos da ficha, `handleSummarize`, `handleSuggest`, `useSuggestionInComposer`, `handoffNote`, `handleFillFichaAI`, checklist, notas + `handleSaveNote`, `mediaMessages`, `handleAttach`; JSX por aba — copiloto L293, ficha L484, notas L497, arquivos L549.
- **L564-829** `FichaTab`: `handleUploadDocs`, `setField`, selo IA (`byAi`), `handleCepChange` (ViaCEP), validação de CPF, `handleSave`, `handleCreateCard`, render L682.
- **L830-977** `ArquivosTab`: `handlePreview` (URL assinada da lista, action só sem ela), `handleDownload`, `handleRename`, `handleDelete`.
- **L978-1122** `DocRow`, `AudioDocRow` (URL de `doc.url` via `useMediaUrl`; `onError` → "Arquivo indisponível").
- **L1123-1253** peças de UI: `CopilotCard`, `InfoRow`, `FichaSection`, `partialDate`, `AiTag`, `FField`, `FSelect`, `FTextArea`.

## 8. `app/_shared/lib/whatsapp/cron-tasks.ts` — 1450 linhas
Crons do WhatsApp em 3 fases: nudge/encerramento por silêncio, recuperação standby e SLA (fila, humano, entrega travada, cards estourados, assinatura).

- **L1-30** imports (`classifyLastMessage`, `isClosingAck`, `isBotDecisionLog`, `orphanReason`, `isEnvSwitchOn` de `wa-silence.ts`; `humanLastVerdict`/`holdDaysLabel` de `app/_shared/utils/ownership.ts`; `HUMAN_HOLD_MS` de `app/_shared/lib/whatsapp/ownership.ts`).
- **L31-220** constantes e infraestrutura: nudge/close, alertas por degrau (`dueAlertStep`), `STUCK_SENT_*`, `OVERDUE_*`, recuperação (`recoveryMaxAttempts`, `RECOVERY_*`, `RECOVERY_DAILY_CAP`, `NON_RECOVERABLE_CATEGORIES`), marcapasso (`createPacer`, `SEND_GAP_*`, `RUN_BUDGET_MS`), `inSequence`, `timed`, `CronResults` (com `orphans`), `emptyResults`.
- **L221-285** `standbyBlockReason`.
- **L286-358** órfã e corrida da fase nudge: `ORPHAN_TO_QUEUE` (env `WA_ORPHAN_TO_QUEUE`), `inboundSince`, `botDecidedSince` (log `wa_bot` depois da mensagem), `sendOrphanToQueue`, `markSilenceSeen`.
- **L359-718** helpers de decisão: `pendingFromState`, `buildFarewell`, `looksLikeFarewell`, `decideFollowup`, `CloseGuard`/`guardWhere` (L495), `finalizeClose` (L514), `silentCloseCategory`, `enterStandby` (L563), última fala humana `settleHumanLast` (L590-648: segura com `botNudge30At` no futuro ou encerra sem standby), `buildRecoveryMessage`. O horário comercial (7h–21h BRT) vem de `date-br.ts`: `isBrBusinessHour`, `nextBrBusinessSlot`, `brBusinessMinutesBetween`.
- **L719-944** `runNudgePhase`: sai fora do horário comercial (L732), 1. silêncio de 30min (L740), 2. encerramento por inatividade (L842; `human_last` → `settleHumanLast` antes da despedida), log-resumo `[WHATSAPP CRON] nudge:` no fim (com `parada(s) com o atendente`).
- **L945-1140** `runRecoveryPhase`: teto diário, seleção `dueRecovery` (L964), loop de provocações (L974).
- **L1141-1443** `runSlaPhase`: 3. SLA da fila (L1151), 3b. SLA humano (L1202), 4. entrega travada (L1276), 5. cards estourados (L1320), 7. assinatura (L1422, `runSignatureReminders`).
- **L1444-1450** `mergeResults`.

## 9. `app/nova-dash/card-dialog/ScriptTab.tsx` — 893 linhas
Aba "Roteiros" do CardDialog (componente `RoteirosTab`): chat com IA que gera roteiros a partir de anexos (upload direto ao S3), biblioteca de prompts e download em .docx.

- **L1-90** imports, `LoadingPhase`, `PHASE_LABELS`, `ThinkingIndicator`.
- **L91-167** tipos (`Message`, `Template`, `StoredChat`, `SavedPrompt`) + persistência local do chat (`CHAT_TTL_MS`, `getChatKey`, `loadChat`, `saveChat`).
- **L168-577 `RoteirosTab`** (export): biblioteca de prompts (`/api/prompts`: `addPrompt`, `deletePrompt`, `startEditPrompt`, `saveEditPrompt`, `applyPrompt`), templates (L288), anexos (`handleFileSelect`, `removeFile`, `uploadFilesToS3` presigned), `sendMessage` (L355, POST `/api/roteiro`), `handleKeyPress`, formatadores, `downloadDOCX` (L538).
- **L578-893** JSX: painel da biblioteca L580, chat (cabeçalho L705, preview de arquivos L826, input L849).

## 10. `app/nova-dash/mentions/MentionsInbox.tsx` — 878 linhas
Caixa de Menções e Tarefas (aba `mencoes`): menções PENDING/ACK/DONE, filtros por status/origem/setor, visão de supervisão da equipe.

- **L1-73** imports, `WhatsAppIcon`, `initials`, `relativeTime`, `fullTime`, `dayLabel`, `Excerpt`.
- **L74-382** tipos e subcomponentes: `FilterKey`, `SourceKey`, `FILTERS`, `StatCard`, `ProgressRing`, `StatusPill`, `IconAction`, `RowActions`, `MentionRow` (L199), `SectorChip`, `OriginBadge`.
- **L383-601 `MentionsInbox`** (export): permissão `view_all_mentions`, `load`, visão da equipe sob demanda, `scoped`, `counts`, placar `people`, `sectors`, `visible`, `groups` (por dia), `handleStatus`, `handleBulkAck`, `handleClearDone`, `handleOpen`.
- **L602-878** JSX: hero L604, placar por pessoa L647, números L692, barra de ferramentas L704, filtro por setor L745, tabela L807.

## 11. `app/nova-dash/card-dialog/FilesTab.tsx` — 874 linhas
Aba Arquivos do CardDialog: pastas por categoria estilo Drive, upload, preview, zip por pasta, reordenação drag-and-drop, checklist previdenciário e lixeira de 30 dias.

- **L1-100** imports, `Props`, `Doc`, `AUTO_CATEGORY`, `getExt`, `IMAGE_EXTS`, `previewKind`, `SortableRow`, `UploadError`.
- **L101-452 `FilesTab`** (export): navegação por pasta, lixeira, preview; `docsByCategory`, `visibleDocs`, `loadTrash`, `loadDocs`, `handleDrop`, `uploadFiles`, `handleDownload`, `openPreview`, `handleDownloadAll` (zip), `saveName`, `sensors` + `handleDragEnd`, `moveDoc`, `confirmDeleteDoc`, `handleRestore`, `confirmPurgeDoc`.
- **L453-874** JSX: upload + tipo de documento (L462), checklist previdenciário (L495), pastas/zip (L544), lista ordenável (L628), lixeira (L771).

## 12. `app/_shared/lib/signature/pdf.ts` — 857 linhas
PDF da assinatura: gera o PDF a partir do .docx (via docx-converter), acha as âncoras, carimba assinatura/rodapé e anexa o manifesto estilo ZapSign.

- **L1-28** imports.
- **L29-174** templates e geração: `CONVERTER_URL`, `SignatureTemplateMeta`, `SIGNATURE_TEMPLATES`, `listSignatureTemplates`, `SignaturePart`, `EXPECTED_SIGNATURE_SPOTS`, paleta (`NAVY`…`BORDER`), `sha256`, `convertDocx`, `generateSignaturePdf`.
- **L175-282** âncoras: `AnchorSpot`, `findAnchors`.
- **L283-486** carimbo e desenho: `StampInput`, `brDateTime(Full)`, `loadLogo`, `drawArcText`, `drawTickRing`, `starSvgPath`, `drawLaurel`, `drawBrandSeal`, `drawFooter`.
- **L487-618** `stampSignedPdf`, `buildSignedParts`.
- **L619-839** `appendManifest`: cabeçalho L659, bloco do documento L687, cartão do signatário L704, trilha de auditoria L782, integridade L795, validade legal + QR L801.
- **L840-857** assinatura digitada: `assertSignaturePng`.

---

## Backlog de quebra (sugestões, não executadas)
| Arquivo | Como dividir |
|---|---|
| `WhatsAppInbox.tsx` | Extrair `ConversationList` (L972-1510 + filtros/derivações L572-721 como hook `useInboxFilters`), `ThreadPane` (L1511-1828 + envio otimista num hook `useOptimisticSend`) e mover bolhas/diálogos (L1885-2889) para `inbox/bubbles.tsx` e `inbox/dialogs.tsx`. |
| `KanbanBoard.tsx` | Mover tipos/`services` para `kanban/types.ts`, `DraggableCard` e `DroppableColumn` para arquivos próprios, e sincronização (`fetchData` + polling + versão) para um hook `useBoardSync`. |
| `signature/core.ts` | Separar por porta/etapa: `validation.ts` (campos, CPF, CEP, rua), `issue.ts` (gerar documento/link), `client-reply.ts` (coleta + confirmação), `manual.ts` (Porta 2), `post-sign.ts` + `reminders.ts`. |
| `AutomationsPanel.tsx` | Tirar `ActionRow` para `automations/ActionRow.tsx` com um subcomponente por tipo de ação, e constantes de campos/operadores para `automations/fields.ts`. |
| `whatsapp/bot.ts` | Extrair filtros de sanidade para `bot-sanitize.ts`, fila/qualificação/encerramento para `bot-outcomes.ts`, e partir `handleIncomingWhatsApp` em etapas nomeadas (`collectBurst`, `buildPayload`, `executeDecision`). |
| `KanbanFlowPanel.tsx` | Mover os gráficos SVG para `flow/charts.tsx` e `buildView` para `flow/build-view.ts` (uma função por visão). |
| `CopilotPanel.tsx` | Um arquivo por aba: `FichaTab.tsx`, `ArquivosTab.tsx` (+ `DocRow`/`AudioDocRow`), com os campos `F*` em `copilot/fields.tsx`. |
| `whatsapp/cron-tasks.ts` | Um arquivo por fase (`cron-nudge.ts`, `cron-recovery.ts`, `cron-sla.ts`) com o marcapasso em `cron-shared.ts` (o horário comercial já está em `date-br.ts`). |
| `ScriptTab.tsx` | Extrair a biblioteca de prompts (`PromptLibrary.tsx` + hook) e a lógica de envio/upload S3 para um hook `useRoteiroChat`; renomear o arquivo para bater com `RoteirosTab`. |
| `MentionsInbox.tsx` | Mover `MentionRow`/`RowActions`/badges para `mentions/MentionRow.tsx` e a derivação (filtros, placar, grupos por dia) para `useMentionsView`. |
| `FilesTab.tsx` | Separar `TrashPanel.tsx` (lixeira) e `FolderGrid.tsx`, e mover upload/zip/reordenação para um hook `useCardFiles`. |
| `signature/pdf.ts` | Separar `manifest.ts` (`appendManifest` + desenho do selo/rodapé) de `anchors.ts` (`findAnchors`), deixando em `pdf.ts` só geração e carimbo. |
