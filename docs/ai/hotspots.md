# Hotspots — os 12 maiores arquivos de `app/`
> Medido em 2026-09-23 com `find app -name '*.ts' -o -name '*.tsx' | xargs wc -l` (sem `node_modules`/`.next`).
> **As faixas de linhas apodrecem** a cada commit nesses arquivos. São aproximadas (±20 linhas): confirme com `Grep -n "<símbolo>"` antes de um `Read offset/limit`. Rode `/mapa-atualizar hotspots` para regenerar este arquivo quando algum deles mudar >15% de tamanho ou entrar/sair do top 12.

Como usar: ache o arquivo, escolha a seção pelo nome do componente/função e leia só aquela faixa (`Read(file, offset=<início>, limit=<fim-início>)`). Para o contexto de domínio (regras, fluxos, armadilhas), leia antes o mapa correspondente em `docs/ai/`.

| # | Arquivo | Linhas | Mapa de domínio |
|---|---|---|---|
| 1 | `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | 3368 | whatsapp-bot |
| 2 | `app/nova-dash/KanbanBoard.tsx` | 2407 | kanban-cards |
| 3 | `app/_shared/lib/signature/core.ts` | 1908 | assinatura |
| 4 | `app/nova-dash/AutomationsPanel.tsx` | 1587 | kanban-cards |
| 5 | `app/_shared/lib/whatsapp/bot.ts` | 1970 | whatsapp-bot |
| 6 | `app/nova-dash/KanbanFlowPanel.tsx` | 1263 | analytics-custos |
| 7 | `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | 1266 | whatsapp-bot |
| 8 | `app/_shared/lib/whatsapp/cron-tasks.ts` | 1475 | whatsapp-bot |
| 9 | `app/nova-dash/card-dialog/ScriptTab.tsx` | 893 | documentos-ia |
| 10 | `app/nova-dash/mentions/MentionsInbox.tsx` | 878 | workspace-equipe |
| 11 | `app/nova-dash/card-dialog/FilesTab.tsx` | 874 | kanban-cards / documentos-ia |
| 12 | `app/_shared/lib/signature/pdf.ts` | 857 | assinatura |

---

## 1. `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` — 3368 linhas
Inbox multi-número do WhatsApp: rail de pastas + lista filtrável, thread com envio otimista/mídia/reações, coluna Copiloto e CardDialog do cliente.

- **L1-82** imports (DTO da lista por `import type` de `app/_shared/lib/whatsapp/inbox-types.ts`; `fileNameFromKey` vem de `app/_shared/utils/s3-keys.ts`; URL de mídia de `media-url-cache.ts`; `withTag`/`patchConversationList`/`readPatch`/`manualUnreadPatch`/`assumePatch`/`returnToBotPatch`/`closePatch`/`sentMessagePatch`/`inboxListState` de `app/_shared/utils/whatsapp-inbox.ts`; `toThreadMessage` de `app/_shared/utils/thread-window.ts`; `decideThreadScroll`/`tailAdvanced`/`countNewBelow` de `app/_shared/utils/thread-scroll.ts`; `restoreInboxView`/`saveInboxViewState`/`pruneTagFilter` de `app/_shared/utils/inbox-view-state.ts`; `closedFolderOf` de `app/_shared/utils/inbox-folders.ts`; `useWaNumberOptions`/`fetchInboxSearch`/`fetchInboxConversation` de `use-whatsapp.ts`; `useCopilot` de `use-copilot.ts`; `flushSync` de `react-dom`).
- **L83-192** helpers de módulo: `WINDOW_24H_MS`, `INBOX_SUPPORT_SWR` (opções SWR de tags/total da agenda), `INBOX_VIEW_SAVE_DEBOUNCE_MS`, `NO_WA_NUMBERS`, `CLOSE_MENU_META`, `initials`/`timeShort`/`dayLabel`/`formatPhone`, `STATUS_LABEL`/`STATUS_CHIP`, classes `chipCls`/`pillCls`, `NumberBadgeContext`, `RecoveryCapContext`, `attendantBadgeColor`.
- **L195-2366 `WhatsAppInbox()`** (componente principal):
  - L195-378 estado + filtros (`me` = id/nome dos patches locais): `loaded`/`isLoading`/`error`/`syncError`/`retrySync` da lista, tags por SWR `wa-tags` (`allTags` undefined = carregando, `tagsFailed`, `reloadTags` = `mutateTags`, `pruneTagFilter`), busca no servidor por GET (`fetchInboxSearch` + `searchSeq`), data de entrada (`applyDatePreset`, `applyCustomRange`), leitura/fila (`changeReadFilter`), número (`useWaNumberOptions`, restauração do `wa-number-filter`, `changeNumberFilter`, `numberBadges`, `recoveryCapOf`), `closeMenuOptions`.
  - L379-471 larguras redimensionáveis (`startResize`), pastas do rail (`RailFolder`, `ACTIVE_FOLDERS`, `CLOSED_FOLDERS` com `satisfies`, inclusive Churn; `FOLDER_TITLE`, `FOLDER_ACCENT`), pasta Contatos (total por SWR `wa-directory-total`).
  - L469-660 conversa aberta: `jumpToMessage`, restauração da navegação + notificação→abre conversa (`viewRestoredRef`, `restoredContactIdRef`, `viewReady`), gravação com debounce + flush no unmount (`pendingViewRef`), `listActive`/`active` (hidratação sob demanda por GET, `fetchInboxConversation`; conversa restaurada que sumiu é solta; `openingActive` = "Abrindo conversa…"), ficha + documentos por GET (`useCopilot`, a mesma key do Copiloto; `reloadCopilot` no `onUpdate` do CardDialog), `cardStub`, SSE `onStream`, `displayMessages`.
  - L661-799 rolagem da thread: refs `scrollSessionRef`/`distanceRef`/`followRef`/`tailRef`/`prependRef`, chip `newBelow`, `useLayoutEffect` com `decideThreadScroll` (jump/restore/smooth/chip), reancorar no fim quando foto/vídeo carrega, `handleThreadScroll`, `stopFollowingThread`, `scrollThreadToEnd`, `handleLoadOlder`.
  - L806-955 derivação da lista: `inDateRange`, `searchUniverse`, `filtered`, contadores (`dateCount`, `readCounts`, `numberCounts`), `kanbanColumns`, `groups` (encerradas por `closedFolderOf`, com `outros`), `humanFilter`, `ativasItems`/`todosItems`, `teamLoad`, `FOLDER_ITEMS`, `visibleItems`, `listState` (esqueleto/erro/vazia), `windowExpired`.
  - L956-1320 handlers: `runAction` (`opts.base` + otimista, patch devolvido pela action por cima via `confirmedPatch`, rollback e `errorMsg` próprio, sem recarga), `patchConversation` (patch local na lista + busca + `fetchedActive`), leitura ao abrir (`readKeyRef` + `readPatch`, um `markConversationRead` por inbound novo, sem recarga), tag otimista (`pendingTags` por conversa, `handleSetTag`), envio otimista (`makePending`, `patchPending`, `removePending`, `commitSent` = upsert no cache da thread + tira o pending no mesmo render, `handleSendText`, `handleSendMedia` com `sentMessagePatch` na lista, `handleSentOutside` para fluxo/template, `retryPending`), `handleEditSubmit`, `handleAttachMedia` (lista nova no cache do Copiloto pela key do contato da mensagem, `setCopilotDocuments`), `handleDelete`, `handleReact`, `handleBlockContact`, `handleDeleteContact`.
  - L1321-1891 JSX da **lista**: rail (L1334), busca + novo contato (L1384), pills de leitura (L1409), data de entrada (L1449), número (L1502), coluna do Kanban (L1543), tags (L1590), equipe (L1633), aviso "Lista sem atualizar" (L1719: `syncError` + `describeFetchError`, a lista fica), área rolável (L1736: agenda com abertura imediata / esqueleto / erro com o motivo e "Tentar novamente" / "Nenhuma conversa ainda" / seções por pasta + "Outros desfechos" com busca/tag), alça de resize (L1885).
  - L1892-2308 JSX da **thread**: "Abrindo conversa…" ou vazio, cabeçalho (L1894: voltar, atalho "Card #N" L1931, menu de tags L1946 com spinner por item, Assumir/Devolver otimistas, Encerrar/Alterar desfecho L2011, Reabrir, toggle Copiloto, mais ações L2080 com lida/não lida otimistas), aviso de falha do poll da thread (L2157: `messagesError` + `describeFetchError`, mensagens antigas ficam, "Tentar de novo"), área rolável com `onScroll` (L2176) + carregar histórico + spinner da 1ª carga (L2183), chip "Nova mensagem ↓" (L2245), composer (`onRefreshThread`/`onSent`) / número desativado somente leitura (L2266).
  - L2309-2366 coluna Copiloto (`<CopilotPanel>`, que lê a ficha e os documentos pelo próprio `useCopilot`) + CardDialog do cliente vinculado.
- **L2368-2431** `GROUP_ACCENT`, `windowPill`, `mediaKindIcon`, `SourceBadge`.
- **L2432-2605** diálogos: `CloseReasonsModal` (motivos de não qualificada), `AddContactDialog`, `RailButton`.
- **L2606-2655** estados de carga: `ConversationListSkeleton` (8 linhas `animate-pulse`), `TagMenuStatus` (carregando / erro com "Tentar novamente" / nenhuma tag, nos dois menus de tag).
- **L2656-2828** `ConversationGroup` (item/seção da lista).
- **L2829-3034** bolha de mensagem: `StatusTicks`, `parseReactionBody`, `WA_REACTION_EMOJIS`, `ThreadMessageRow`.
- **L3035-3344** mídia: `WaMediaBubble` (`useMediaUrl` com a `mediaUrl` da rota; `onError` → "Arquivo indisponível"), `fmtAudioTime`, `WaAudioBubble` (`onMediaError`).
- **L3345-3368** `MsgAction`, `HeaderButton`.

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

## 5. `app/_shared/lib/whatsapp/bot.ts` — 1970 linhas
Ponte CRM ↔ cérebro do bot: monta o payload da conversa, chama o microserviço, sanitiza a decisão e executa (responder, qualificar, fila, encerrar).

- **L1-66** imports (`buildAudioTranscriptNote` de `audio-note.ts`, `BURST_DEBOUNCE_MS`/`BOT_TURN_BUDGET_MS`/`brainAttemptTimeoutMs`/`microBudgetMs`/`isBrainTimeoutError`/`settleWithin`/`newerInboundWhere`/`shouldAbortSend`/`isTerminalBotAction` de `bot-timing.ts`, `transcribeInboundAudio` de `transcribe.ts`, `turnTimings`/`queueEffective`/`sumUsageByModel` de `bot-telemetry.ts`, `reportCriticalError`, `findConversationOwner` de `ownership.ts`, `waAlertRecipients` de `alert-recipients.ts`, `WA_QUALIFIED_MARK` de `close-categories.ts`), env (`CHATBOT_URL`, staging `CHATBOT_URL_STAGING`, `TEST_NUMBERS`).
- **L67-243** histórico e tipos: `historyText`, `historyRole`, `SYSTEM_SOURCE_LABELS`, `brainUrlFor`, constantes (`BOT_TIMEOUT_MS`, `BOT_MAX_ATTEMPTS`, `RECENT_ATTENDANT_MS`), S3, `ProcessInfo`, `LinkedCard`, `BotUsage`, `BotDecision` (com `transcribeUsage`), `sumUsage`, `isBotConfigured`.
- **L244-364** filtros de sanidade: `SCHEMA_TOKENS`, `isJsonSkeleton`, `looksLikeJsonFragment`, `REASONING_PATTERNS`, `looksLikeReasoning`, `SCRIPT_STATES`, `sanitizeDecision`, `sleep`, `humanDelay`.
- **L365-395** `businessHours`.
- **L396-478** vínculo com o card: `findLinkedCard`; consultas da IA: `runLookup`.
- **L479-859** fila, qualificação e encerramento: `postInternalNote`, `QueueOpts` (`onlyIfStatus` + `extraNote`, a transcrição que vai na MESMA nota da fila por `withExtraNote`), `handoffToQueue` e `qualifyToQueue` (exportadas, `updateMany` condicional com `onlyIfStatus`, devolvem se moveram, gravam o dono pegajoso; aviso por `waAlertRecipients`: transferência = dono ou setor da Fila, lead qualificado = dono + setor com `WA_QUALIFIED_MARK`), `queueOwner`, `ownerSuffix` ("— volta para <nome>" na nota), `tagAsQualified`, `createCardTaskForTeam`, `disqualifyAndClose` (devolve a categoria gravada) e `resolveAndClose` (tag do desfecho por `syncCloseTag` depois do update), `sendMutedFallback` (devolve se saiu), `handoffNotifyOnly` (`onlyTo` = destinatários já resolvidos).
- **L860-945** envio: `sendBotReply` (devolve se saiu; relay por `broadcastWhatsAppEvent`, depois da resposta).
- **L946-1045** chamada ao micro: `callBrainOnce` (header `x-bot-budget-ms`; 504 vira `brainTimeoutError`), `callBrain` (retry; cada tentativa cabe no prazo do turno via `brainAttemptTimeoutMs`).
- **L1046-1970 `handleIncomingWhatsApp`** (entrada do webhook): relógio do turno (`startedAt`, `markSent`, `timings`, `turnCost`), `ONLY_IF_BOT`, `brainUrl` e `turnDeadline`, transcrição antecipada L1092 (`transcribeInboundAudio` antes do sleep; `settleWithin` depois), `findNewerInbound` e `isStillBot` declarados antes do `try`; em blocos `// ---- X`: debounce de rajada L1117 (checagem dentro do `try`) → lote L1150 → mídia L1175 → mensagem cruzada L1219 → assinatura eletrônica L1240 → contexto/payload L1292 (`docsReceived` por `docsReceivedSince` + `clientDocumentMediaWhere`; `recentAttendant` = mensagem de atendente em `RECENT_ATTENDANT_MS`) → IA + lookup L1398 (wrapper `brain`: `brainMs`, usage do Claude, `transcribeUsage` e o `turnDeadline`) → retry de resposta vazia L1429 → transcrições L1465 (nota da fila `audioNote` por `buildAudioTranscriptNote` e `queueOpts`; log `wa_transcribe` com `bySystem`; helper `logDiscarded`) → corrida pós-cérebro + releitura de status L1542 (`wa_bot_discarded`) → contador "não entendi" L1563 → opt-out L1572 → memória/estado (`persistMemory`, só no 1º envio) L1627 → laço de blocos com `shouldAbortSend` + releitura antes da ação L1646 (parada total = `wa_bot_discarded` com `sentBlocks`) → `switch (decision.action)` L1717-1831 (`send_flow`, `qualify`, `disqualify`, `handoff`, `resolve`; fila com `queueOpts`; `queueSkipped` e `effective` via `toQueue`) → auditoria/métricas L1833 (`wa_bot` com `facts`, `effective`, tempos, `silent`, `conversationAgeMs`, `blocksSkipped`, `handoffSkipped`) → telemetria do playbook L1894 → `catch` L1905 (timeout por `isBrainTimeoutError`; inbound mais nova = só loga; senão handoff condicional; falha do handoff = `reportCriticalError`; o log do erro leva o usage ainda não gravado).

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

## 7. `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` — 1266 linhas
Coluna direita do inbox: abas Copiloto (resumo/sugestão IA, checklist), Ficha (dados do cliente editáveis + IA), Notas internas com @menção e Arquivos da ficha.

- **L1-77** imports (tipos da ficha por `import type` de `copilot-types.ts`; `useCopilot` de `use-copilot.ts`; `fileNameFromKey` de `s3-keys.ts`; `useMediaUrl`/`seedMediaUrl`/`getMediaUrl` de `media-url-cache.ts`), `CopilotTab`, `mediaIcon`, `previewKind`, `timeStamp`, `Props`.
- **L78-558 `CopilotPanel`** (export): ficha + documentos por `useCopilot` (escrita por `setCopilotDocuments`/`setCopilotClientInfo` com o contactId explícito), `handleSummarize`, `handleSuggest`, `useSuggestionInComposer`, `handoffNote`, `handleFillFichaAI`, checklist, notas + `handleSaveNote`, `mediaMessages`, `handleAttach`; JSX por aba — copiloto L284, ficha L475, notas L492, arquivos L544.
- **L559-842** `FichaTab`: `handleUploadDocs`, `setField`, selo IA (`byAi`), `handleCepChange` (ViaCEP), validação de CPF, `handleSave`, `handleCreateCard`, render L680 ("Carregando ficha…" ou, com `loadError`, o motivo + "Tentar de novo").
- **L843-990** `ArquivosTab`: `handlePreview` (URL assinada da lista, action só sem ela), `handleDownload`, `handleRename`, `handleDelete`.
- **L991-1135** `DocRow`, `AudioDocRow` (URL de `doc.url` via `useMediaUrl`; `onError` → "Arquivo indisponível").
- **L1136-1266** peças de UI: `CopilotCard`, `InfoRow`, `FichaSection`, `partialDate`, `AiTag`, `FField`, `FSelect`, `FTextArea`.

## 8. `app/_shared/lib/whatsapp/cron-tasks.ts` — 1475 linhas
Crons do WhatsApp em 3 fases: nudge/encerramento por silêncio, recuperação standby e SLA (fila, humano, entrega travada, cards estourados, assinatura).

- **L1-32** imports (`classifyLastMessage`, `isClosingAck`, `isBotDecisionLog`, `orphanReason`, `isEnvSwitchOn` de `wa-silence.ts`; `humanLastVerdict`/`holdDaysLabel` de `app/_shared/utils/ownership.ts`; `HUMAN_HOLD_MS` de `app/_shared/lib/whatsapp/ownership.ts`; `QUEUE_ALERT_STEPS_MS`/`queueAlertAudience`/`queueWaitLabel` de `alert-policy.ts`; `waAlertRecipients`).
- **L33-223** constantes e infraestrutura: nudge/close, alertas por degrau (`dueAlertStep`; os degraus da fila vêm de `alert-policy.ts`), `STUCK_SENT_*`, `OVERDUE_*`, recuperação (`recoveryMaxAttempts`, `RECOVERY_*`, `RECOVERY_DAILY_CAP`, `NON_RECOVERABLE_CATEGORIES`), marcapasso (`createPacer`, `SEND_GAP_*`, `RUN_BUDGET_MS`), `inSequence`, `timed`, `CronResults` (com `orphans`), `emptyResults`.
- **L224-288** `standbyBlockReason`.
- **L289-361** órfã e corrida da fase nudge: `ORPHAN_TO_QUEUE` (env `WA_ORPHAN_TO_QUEUE`), `inboundSince`, `botDecidedSince` (log `wa_bot` depois da mensagem), `sendOrphanToQueue`, `markSilenceSeen`.
- **L362-721** helpers de decisão: `pendingFromState`, `buildFarewell`, `looksLikeFarewell`, `decideFollowup`, `CloseGuard`/`guardWhere` (L499), `finalizeClose` (L518; aplica a tag do desfecho quando fechou), `silentCloseCategory`, `enterStandby` (L566), última fala humana `settleHumanLast` (L593-651: segura com `botNudge30At` no futuro ou encerra sem standby), `buildRecoveryMessage`. O horário comercial (7h–21h BRT) vem de `date-br.ts`: `isBrBusinessHour`, `nextBrBusinessSlot`, `brBusinessMinutesBetween`.
- **L722-947** `runNudgePhase`: sai fora do horário comercial (L735), 1. silêncio de 30min (L743), 2. encerramento por inatividade (L845; `human_last` → `settleHumanLast` antes da despedida), log-resumo `[WHATSAPP CRON] nudge:` no fim (com `parada(s) com o atendente`).
- **L948-1143** `runRecoveryPhase`: teto diário, seleção `dueRecovery` (L967), loop de provocações (L977).
- **L1144-1460** `runSlaPhase`: 3. SLA da fila (L1154; audiência por degrau em `queueAlertAudience`, destinatários por conversa em `waAlertRecipients`), 3b. SLA humano (L1219), 4. entrega travada (L1293), 5. cards estourados (L1337), 7. assinatura (L1439, `runSignatureReminders`).
- **L1461-1467** `mergeResults`.

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
