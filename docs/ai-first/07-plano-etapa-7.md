# AI-First — Etapa 7: plano de execução (dashboard "Operação por IA" por operador, `/auditoria-operacao`, `gerar_relatorio`, `/varredura`)

> **Comece aqui num chat novo.** Leia, nesta ordem: este arquivo → `docs/ai-first/06-resultado-etapa-6.md` (o que existe, decisões provisórias, perguntas abertas) → `docs/ai/operacao-ia.md` (tabelas `op_*`, contratos L1–L4, progresso dos fluxos, armadilhas) → `docs/ai/analytics-custos.md` (padrão dos dashboards, carga única, períodos) e `docs/ai/workspace-equipe.md` (Espaço de Trabalho; **tem mudanças locais do dono — não edite sem perguntar**) → `app/nova-dash/workspace/operacao/OpSwitchesPanel.tsx` + `app/_actions/op/switches.ts` (a seção "IA de operação" que já existe) → `scripts/op-relatorio.mjs` (as agregações que o dashboard repete, hoje em script) → `docs/ai/data-model.md` (`OpSession`, `OpRequest`, `OpToolCall`, `OpApproval`). Contexto de negócio: `docs/ai-first/00-diagnostico-etapa-zero.md` §6.5, §8 linha 7, §10 decisões **5** (o dono quer ver no site o rendimento de cada pessoa, as dúvidas, o que pode melhorar e uma auditoria posterior, a partir de `op_*`) e **7** (prompt completo gravado; **só `manager_dashboard` lê**). Regras do repo valem integralmente (`CLAUDE.md` raiz; skills `/plano` `/migration` `/validar` `/mapa-atualizar`). **Banco = produção.** Escrito em 25/10/2026 por uma sessão autônoma (o dono estava fora): decisões **(provisória)** foram tomadas pelo lado conservador e estão em "Perguntas para o dono" — siga-as, não bloqueie.

## Ponto de partida (25/10/2026)
- Etapas 3–6 commitadas localmente (**sem push**; o dono publica). Etapa 6 sem migration; o interruptor de `salvar_progresso` nasce desligado — até o dono ligar, `op_requests.state` fica todo nulo.
- Dados que já existem para o dashboard:
  - `op_sessions` (uma por conversa: operador, início, último sinal) · `op_requests` (prompt completo, `skill` deduzida, `state` do fluxo) · `op_tool_calls` (ferramenta, nível, `ok`, `code`, `summary`, `cardIds[]`, `durationMs`, `requestId`; falha de transporte do MCP entra como `ok=false` pelo evento `tool_error`) · `op_approvals` (status pendente/enviando/executada/falhou/expirada/cancelada, canal, card, `approvedRequestId`) · `logs` com `metadata.source = "op"` (ação no card feita pela IA, autor "<nome> (via IA)") e `op_send` (envio).
  - Hoje só há o painel de interruptores (com chamadas/ok em 7 dias por ferramenta de escrita) e o `scripts/op-relatorio.mjs` (READ ONLY, contagens + `--prompts`).
- Medido em 25/10 (30 dias): 1 token (o do dono), 16 sessões, 118 prompts — **106 sem skill, quase todos de desenvolvimento** neste repositório (o hook registra todo prompt do dono quando o `CRM_OP_TOKEN` está no ambiente). O dashboard tem que separar "operação" de "desenvolvimento", senão o número de "dúvidas" é lixo.
- Lições das etapas anteriores que viram regra aqui: (1) `/api/op/*` está em `PUBLIC_API_PREFIXES` e só tem `opAuth` (token do app) — **a tela do site NÃO pode ler por uma rota em `/api/op`**: vai por server action/rota de equipe (`requirePermission`/`teamRoute`); (2) prompt e `op_approvals.args` têm dado pessoal: texto do prompt só para `manager_dashboard` e nunca no `gerar_relatorio`; (3) agregação em tabela que cresce: `groupBy`/`$queryRaw` com corte de data, nada de `distinct`+`orderBy`; (4) corte por dia em Brasília (`brDayRangeToInstants`, `brDayKey`).

## Objetivo da etapa
O gestor abre **Espaço de Trabalho → IA de operação** e vê, por período e por operador: quantos pedidos fez, quais dúvidas (pedidos sem skill / só leitura), que ferramentas usou, aprovações (preparadas × executadas × expiradas), cards que conduziu (link abre o card), falhas (por `code`), fluxos parados/concluídos e por que pararam (bloqueios), tempo (sessões e latência). E no Claude Code: *"/auditoria-operacao semana passada"* → relatório com evidências (ids, cards, códigos) e sugestões de melhoria; *"/varredura"* → lista de cards com problema (parados, inconsistências, duplicados), cada item citando card/log/regra, **sem alterar nada**.

**Fora desta etapa**: abrir autonomia (Etapa 8), purga/retenção de `op_requests`/`op_approvals` (pergunta), custo do app (decisão 8: fica fora), qualquer escrita nova no card, editar regra oficial ou nota do vault a partir da varredura.

## Decisões
| origem | decisão | efeito |
|---|---|---|
| decisão 5 | dashboard por operador sobre `op_*` (não sobre o vault) | lib de métricas única em `app/_shared/lib/op/metrics.ts`, usada pela tela, pelo `gerar_relatorio` e pela `/auditoria-operacao` |
| decisão 7 | texto do prompt só com `manager_dashboard` | a seção continua visível para `manage_team` (interruptores), mas o bloco "pedidos/dúvidas com texto" exige `manager_dashboard` **no servidor** (a action confere; a UI só esconde) |
| 25/10 **(provisória)** | leitura pela tela via **server action** (`app/_actions/op/metrics.ts`, `requirePermission("manager_dashboard")`), carregada ao abrir e no botão "Atualizar" — **sem poll** | sem rota nova em `/api/op` (seria pública); sem fila de actions em poll |
| 25/10 **(provisória)** | "desenvolvimento" × "operação": sessão cujo `cwd` não é o repositório do CRM ou prompt sem skill e sem nenhuma ferramenta `crm-op` = **conversa**; pedido = prompt que chamou ≥ 1 ferramenta `crm-op` ou começou com skill de operação. Filtro "mostrar conversas" desligado por padrão | "dúvidas" = pedido que só chamou L1; "ação" = pedido com L3/L4 |
| 25/10 **(provisória)** | "cards conduzidos" = `op_tool_calls.cardIds` (L3/L4 ok) ∪ `logs` com `metadata.source = "op"` do operador; "tocados" (só leitura) aparecem à parte | bate com o "responsável = quem conduz a IA" (decisão 12) e com o `/meu-dia` |
| 25/10 **(provisória)** | `gerar_relatorio` = L1, permissão `manager_dashboard`, tipos fechados (`operacao`, `fluxos`, `falhas`, `aprovacoes`), período em dias de Brasília (≤ 90), **nunca devolve texto de prompt nem `args` de aprovação** (só contagens, ids, `cardNumber`, `code`, `skill`) | a auditoria pelo Claude Code não espalha PII do prompt; o texto fica só na tela do gestor |
| 25/10 **(provisória)** | `/auditoria-operacao` = skill só leitura sobre `gerar_relatorio` + `listar_historico`/`obter_card` para as evidências; toda conclusão cita id (`op_tool_calls`/`op_requests`/aprovação), card e código; "o que melhorar" vem dos padrões (falha repetida por `code`, bloqueio repetido por `campos`/`codigo`, aprovação expirada, ferramenta desligada pedida) | relatório reprodutível; nenhuma sugestão muda regra/nota sozinha (vira sugestão para `/conhecimento` ou ticket) |
| 25/10 **(provisória)** | `/varredura` usa ferramentas que já existem (`listar_cards_parados`, `verificar_pendencias`, `fluxos_abertos`) + **uma L1 nova** `varrer_inconsistencias` (`op_use`) com checagens fixas e baratas: CPF repetido entre cards ativos, telefone repetido entre ativos, card ativo sem hospital nas colunas de prontuário, fluxo da IA bloqueado há > 3 dias; `take` baixo, corte por coluna | cada item: card, regra violada, evidência (campo/log); a skill oferece ação L3 só com prévia + "sim" (nada em lote) |
| 25/10 **(provisória)** | índice parcial `op_requests (operatorId, createdAt DESC) WHERE state IS NOT NULL` **só se** o passo 0 medir a listagem de fluxos > 300 ms | migration aditiva pelo `/migration`, senão nada |

## Ordem de execução
### 0. Refinar o plano lendo o código (antes de tudo)
- Ler `scripts/op-relatorio.mjs`, `app/_actions/op/switches.ts`, `app/nova-dash/workspace/Workspace.tsx` (gate `canViewOpSwitches`, seção `ia-operacao`), um dashboard com período já pronto (`docs/ai/analytics-custos.md` → carga única + `DateFilter`), `app/api/op/events/route.ts` (o que vira `tool_error`), `app/_shared/lib/op/workflow.ts` (`openFlows`).
- Medir (READ ONLY, `node -r dotenv/config scripts/op-relatorio.mjs --dias=30` e um `EXPLAIN` por script READ ONLY em `scripts/`): linhas de `op_requests`/`op_tool_calls` por operador; custo do `groupBy` por dia; custo do filtro `state->>'status'`. Conferir se o `cwd` das sessões separa dev de operação. Registrar em "Ajustes do passo 0" no fim deste arquivo.

### 1. Lib de métricas (`app/_shared/lib/op/metrics.ts`) + puros (`app/_shared/utils/op-metrics.ts`)
- Puros: classificação do prompt (conversa/dúvida/ação), agregação por operador/dia (Brasília), taxa de falha por `code`, tempo de sessão (`startedAt`→`lastSeenAt`, corte em pausas > 30 min), resumo dos fluxos (`parseWorkflowState`: concluído/abandonado/bloqueado por `codigo`/`campos`).
- Lib: `getOpMetrics({ desde, ate, operatorId? })` com `groupBy` em `op_tool_calls`/`op_approvals`, `findMany` com `select` mínimo e corte de data em `op_requests` (sem `text`), logs `source: "op"` por `$queryRaw` com corte de data. `getOpPrompts({ ... })` separado (texto, só para a action com `manager_dashboard`, ≤ 200 linhas, paginado).

### 2. Tela (`app/nova-dash/workspace/operacao/`)
- `OpMetricsPanel.tsx` acima dos interruptores: período (padrão 7 dias), operador (todos/um), cartões por operador (pedidos, dúvidas, ações, cards conduzidos, aprovações executadas/expiradas, falhas, tempo), tabela de falhas por `code`, fluxos parados com o bloqueio, lista de cards conduzidos (clique abre o card: `sessionStorage` `kanban-open-card` **antes** do `CustomEvent`). Bloco "Pedidos" (texto) só com `manager_dashboard`.
- `app/_actions/op/metrics.ts`: `requirePermission("manager_dashboard")`; erro com mensagem própria na UI (produção mascara).

### 3. Ferramentas (`app/_shared/lib/op/tools/`)
| ferramenta | nível | permissão | args | devolve |
|---|---|---|---|---|
| `gerar_relatorio` | L1 | `manager_dashboard` | `tipo` (`operacao`/`fluxos`/`falhas`/`aprovacoes`), `dias` (≤ 90) ou `de`/`ate` (dia BR), `operador?` | contagens + ids/cardNumber/code, sem texto de prompt nem `args` |
| `varrer_inconsistencias` | L1 | `op_use` | `coluna?`, `checagens?` (lista fechada), `limite` (≤ 50) | itens `{card, regra, evidencia}` |
- `tests/op-registry.test.ts`: lista `ETAPA_7_L1`; nenhuma grava. `.claude/settings.json`: decisão do dono (como na Etapa 6).

### 4. Skills
- `/auditoria-operacao` (nova): período → `gerar_relatorio` (`operacao`, `falhas`, `fluxos`, `aprovacoes`) → relatório: **Rendimento por pessoa** · **Dúvidas frequentes** (skills/ferramentas de leitura mais chamadas) · **Falhas** (por `code`, com 2–3 ids de exemplo) · **Fluxos parados** (bloqueio mais comum) · **O que melhorar** (cada item com evidência e quem faria: nota do vault → `/conhecimento sugerir`, campo do cadastro → equipe, ferramenta desligada pedida → dono). Sem texto de prompt.
- `/varredura` (nova): `varrer_inconsistencias` + `listar_cards_parados` + `fluxos_abertos` → por coluna, cada item com card e evidência → "Próximos passos sugeridos" oferecendo UMA ação L3 por vez (prévia → "sim").

### 5. Testes, validação, documentação
- vitest: puros (classificação, Brasília na virada do dia, tempo de sessão), lib com Prisma mockado (corte de data sempre presente, sem `text` no select de métricas), action recusa sem `manager_dashboard`, `gerar_relatorio` sem texto/args, `varrer_inconsistencias` (CPF repetido, sem hospital, limite).
- Fumaça só leitura pelo `scripts/op-testar-ferramenta.mjs` (`gerar_relatorio`, `varrer_inconsistencias`); tela no preview `dev` (banco de produção: só leitura).
- `/validar` + `revisor-regras` (permissão no servidor, PII, Brasília, custo das queries) · `/mapa-atualizar operacao-ia analytics-custos` (o `workspace-equipe.md` tem mudanças do dono: só com OK) · `docs/ai-first/07-resultado-etapa-7.md` + plano da Etapa 8.

## Critérios de aceite
1. Gestor vê, por operador e período (dias de Brasília), pedidos, dúvidas, ferramentas, aprovações, cards conduzidos, falhas, fluxos e tempo; números batem com o `op-relatorio.mjs` no mesmo período.
2. Quem só tem `manage_team` vê os interruptores mas não o texto dos prompts (recusa no servidor).
3. Prompts de desenvolvimento não contam como "dúvida" com o filtro padrão.
4. `gerar_relatorio` nunca devolve texto de prompt nem conteúdo de aprovação; `/auditoria-operacao` cita evidência em todo item.
5. `/varredura` não altera nada; toda ação sugerida passa pela prévia L3 de sempre.
6. Nenhuma rota nova em `/api/op` para a tela; tsc/lint/testes limpos; ferramentas das Etapas 1–6 iguais.

## Riscos
- **PII**: prompt e `op_approvals.args` têm dado pessoal — por isso o texto fica só na tela do gestor; a retenção continua pergunta aberta.
- **Número enganoso**: dev × operação, operador com duas janelas (sessão por computador), tempo de sessão com a janela aberta à toa — mostrar a definição de cada número na tela.
- **Custo de banco**: agregações sem índice em tabela que cresce com cada prompt; corte de data obrigatório e medição no passo 0 (lição do egress de 14/09).
- **Ruído da varredura**: checagem fixa demais vira lista enorme; `limite` e por coluna.

## Perguntas para o dono (decididas provisoriamente — confirmar ao acordar)
1. Quem vê o dashboard: só `manager_dashboard` (provisório) ou também cada operador vendo o próprio rendimento?
2. Texto do prompt na tela: só para `manager_dashboard` (decisão 7) — também só dos últimos N dias? Retenção do `op_requests.text` e do `op_approvals.args` (sugestão: zerar texto/args com 180/90 dias)?
3. Separar seus prompts de desenvolvimento (o seu token registra tudo neste repo): filtrar por sessão/`cwd` (provisório) ou você usa um token separado para operar?
4. "Tempo" no dashboard: tempo de sessão (com corte de pausas) ou só soma da latência das ferramentas?
5. `gerar_relatorio` sem texto de prompt (provisório) está ok para a auditoria pelo Claude Code?
6. `/varredura`: quais inconsistências importam mais (CPF/telefone duplicado, sem hospital, parado, fluxo bloqueado…)? Alguma já tem regra oficial no vault?
7. As três ferramentas de progresso da Etapa 6 e as duas novas vão para o `allow` do `.claude/settings.json`?

## Ajustes do passo 0 (25/10/2026, lendo o código e medindo produção só leitura)
Medido com `node -r dotenv/config scripts/op-relatorio.mjs --dias=30` e um script temporário READ ONLY em `scripts/` (`EXPLAIN ANALYZE`, apagado depois):
- **Volume**: `op_requests` 119 linhas, `op_tool_calls` 15, `op_sessions` 16, `op_approvals` 0, `op_requests.state` não nulo 0; `logs` 222.960. Tudo de um operador (o dono).
- **`cwd` não separa nada**: as 16 sessões têm o mesmo `cwd` (o repositório do CRM) — operação e desenvolvimento rodam na mesma pasta. A regra "sessão fora do repo = conversa" cai; fica só a regra por prompt: **pedido** = prompt que chamou ≥ 1 ferramenta `crm-op` **ou** começou com uma skill de operação (lista fechada `OP_SKILLS`); o resto é **conversa** (106 dos 119 prompts hoje: 106 sem skill e sem ferramenta). Das 13 restantes: 7 com skill e ferramenta, 5 com skill sem ferramenta, 1 sem skill com ferramenta.
- **"Dúvida" vira "consulta"** na tela (o nome "dúvida" sugeria pergunta de texto): pedido que só chamou L1 (ou skill de operação sem ferramenta). **"Ação"** = pedido com alguma ferramenta **L2+** (preparar documento já é produzir trabalho; o plano dizia L3/L4). O texto dos pedidos fica num bloco à parte, carregado por clique.
- **Custos das consultas** (30 dias): `groupBy`/`findMany` em `op_tool_calls`/`op_requests` < 0,1 ms (seq scan de 15–119 linhas; índices `[operatorId, createdAt]`/`[tool, createdAt]` existem para quando crescer); filtro de fluxos abertos `state->>'status'` com `operatorId` = **0,03 ms** pelo índice `(operatorId, createdAt)` → **sem índice parcial, sem migration**.
- **Logs `metadata.source = "op"`**: a consulta pelo índice `[action, createdAt]` com as 7 ações que a IA grava (`move`, `tag_add`, `tag_remove`, `comment_add`, `archive`, `document_add`, `op_send`) custa **213 ms** em 30 dias (6.180 linhas relidas para achar 0) e é redundante: todo log `source: "op"` nasce de uma L3/L4 que já grava `cardIds` em `op_tool_calls`. **"Cards conduzidos" sai só de `op_tool_calls`** (L3 com `confirmar: true` e não `noop` + `executar_aprovado` ok); a evidência de cada ação o `/auditoria-operacao` busca com `listar_historico` do card.
- **`confirmar`/`noop` sem puxar `args`** (que tem CPF/telefone): `$queryRaw` com `(args->>'confirmar') = 'true'` e `summary LIKE 'noop%'` (a mesma régua do `op-relatorio.mjs`).
- **Aprovação "pendente" vencida** não muda de status sozinha: a métrica conta `pendente` com `expiresAt` passado como **expirada**.
- **Fluxo parado > 14 dias** conta como **abandonado** na métrica (como `isStale` no salvar/retomar), sem gravar.
- **Tempo**: soma dos intervalos ≤ 30 min entre eventos do mesmo `sessionId` (prompts classificados como pedido + ferramentas ligadas a eles); a soma da latência das ferramentas (`durationMs`) aparece ao lado (pergunta 4).
- **`/varredura` — colunas de prontuário**: o board tem "FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL" (6 ativos, 6 sem hospital) e "DISTRIBUIÇÃO DE SOLICITAÇÕES" (1, sem hospital), onde as automações por hospital disparam. Checagem `sem_hospital` só nessas duas (`/HOSPITAL|DISTRIBUI[CÇ][AÃ]O DE SOLICITA/i`, **provisória**). CPF repetido e telefone repetido entre ativos: 0 hoje (297 ativos, 295 INSS) — ficam, custam uma leitura dos ativos (como `listar_cards_parados`). Entrou `cpf_invalido` (dígito verificador, `isValidCpf`), também barata. Fluxo bloqueado > 3 dias: 0 hoje.
- **Tela**: a seção `ia-operacao` do `Workspace.tsx` passa a montar `OpMetricsPanel` (só com `manager_dashboard`, a action confere) acima do `OpSwitchesPanel`. Card abre com `sessionStorage` `kanban-open-card` + `CustomEvent('open-kanban-card')` (padrão do `MentionsInbox`).
