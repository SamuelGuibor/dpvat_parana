# nova-dash/ — área logada da equipe

Esta pasta junta vários domínios. Abra o mapa do que você vai mexer:
| arquivos | mapa |
|---|---|
| `KanbanBoard`, `CardDialog`, `card-dialog/`, `ArchivedCards`, `AutomationsPanel`, `minikanban`, `contratos/` | `docs/ai/kanban-cards.md` |
| `workspace/whatsapp/`, `workspace/chatbot/`, `workspace/numbers/`, `instructions/` | `docs/ai/whatsapp-bot.md` |
| `StrategicDashboard`, `KanbanFlowPanel`, `form-leads`, `FolderReport`, `DateFilter`, `workspace/manager/`, `workspace/costs/` | `docs/ai/analytics-custos.md` |
| `mentions/`, `tickets/`, `workspace/chat/`, `MySpace`, `TeamPresence`, `UserMenu`, `_components/ponto` | `docs/ai/workspace-equipe.md` |
| `workspace/security/`, `_components/team_dash.tsx`, `_components/PermissionsProvider.tsx` | `docs/ai/auth-permissoes.md` |

UI compartilhada (shadcn): `app/_shared/ui/` (button, dialog, select, checkbox, tabs, table, sonner…). Não há `components/` na raiz.

## Regras gerais da pasta
- Server action nova: `requireTeam()`/`requirePermission(key)`, nunca só `getServerSession` (cliente logado passa e a trava de IP é pulada). Na UI, esconda com `usePermissions()` — mas a UI só esconde; o guard é o do servidor.
- Troca de aba: grave o `sessionStorage` (`kanban-open-card`, `wa-open-contact`, `chat-open-channel`) ANTES de disparar o `CustomEvent`; board e inbox ficam desmontados nas outras abas.
- Arquivo grande (`KanbanBoard`, `AutomationsPanel`, `KanbanFlowPanel`, `FilesTab`, `ScriptTab`, `workspace/whatsapp/*`): leia só a seção em `docs/ai/hotspots.md`.

## Kanban e cards
- Mudança de coluna: use `updateKanbanStatus` (grava `labelId` + `role` + `statusStartedAt`, log `move` por NOME, `runAutomations`); nunca `/api/kanban/update-status`.
- Sem `revalidatePath` ao mover/arquivar: página client com polling de 7 s (`/api/board-state`). Dado novo NO CARD DO QUADRO: `mapBasic` + `computeBoardVersion` + comparador do `DraggableCard`. Campo só no modal não precisa disso.
- Mutação otimista: `pendingMutationsRef.current++`/`--` em `try/finally`. Reordenar: uma query `unnest` por tabela (`reorderCards`); SQL cru não atualiza `@updatedAt`.
- Nome de coluna é contrato (`role`, `DONE_COLUMN_RE`/`EXPECTED_FLOWS`, `SIGN_NAG_ALLOWED_COLUMNS`, planilhas CAIQUE/UNI). Coluna `order: 0` recebe os cards automáticos.
- `status` do card = etapa do checklist (`INSS_S1`…); mudar manda WhatsApp ao cliente (`notifyStatusProgress`).
- Card é `User` OU `Process` (`isProcess`): mantenha os dois caminhos. Datas do card são String `DD/MM/AAAA`.
- Automação: branch em `executeAction` com `try/catch`, nunca lança; `move` é terminal; `authorId` sintético nunca em FK de User. Condição de tag compara o NOME. Prazo por dia de calendário (`daysUntilDue`, `brDayKey`). Validação ao salvar é só da UI.
- Variáveis `[[campo]]` de automação expõem a linha inteira do card (inclui senhas).

## Validação
- `npx tsc --noEmit` · `npx eslint <arquivos>` · `npm test` (automation-conditions, date-br, permissions). Condição de automação nova → caso em `tests/automation-conditions.test.ts`.
- Manual (`npm run dev`, ADMIN*): arrastar entre/dentro de colunas + F5; aba Logs mostra `move`; 2 abas sincronizam em ≤7 s. `.env` = produção: use card/coluna de teste.
- `prisma generate` dá EPERM com o dev server rodando: pare-o antes.
