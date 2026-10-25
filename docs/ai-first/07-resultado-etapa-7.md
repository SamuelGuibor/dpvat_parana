# AI-First — Etapa 7: resultado (25/10/2026, implementada e validada localmente; deploy e teste no app pendentes)

> Plano: `docs/ai-first/07-plano-etapa-7.md` (a seção "Ajustes do passo 0" no fim registra o que mudou ao ler o código e medir produção). Mapa técnico: `docs/ai/operacao-ia.md` (lib de métricas, `gerar_relatorio`, `varrer_inconsistencias`, armadilhas, receitas), `docs/ai/analytics-custos.md` (painel na lista de telas), `docs/ai/data-model.md` (leitura de `op_*`). Próxima etapa: `docs/ai-first/08-plano-etapa-8.md`. Guia da manhã para as Etapas 3–7: `docs/ai-first/RESUMO-NOITE-25-10.md`. Feita por uma sessão autônoma com o dono fora: decisões **(provisória)** abaixo e em "Perguntas para o dono". **Etapa só de leitura**: nenhuma ferramenta nova grava, nada gravado em `op_*`, nenhum card/comentário/tag tocado, nada enviado, **nenhuma migration**.

## Estado por passo do plano
| Passo | Estado | Onde |
|---|---|---|
| 0. Refinar o plano lendo o código | ✅ | "Ajustes do passo 0" no fim do `07-plano-etapa-7.md` (medição READ ONLY: volumes, `cwd`, custo de cada consulta) |
| 1. Puros | ✅ | `app/_shared/utils/op-metrics.ts`: `resolveOpPeriod` (dias de Brasília, ≤ 90), `classifyPrompt`, `callKind`, `activeMinutes`, `approvalStatus`, `flowStatus`, `buildOpMetrics`, `OP_METRIC_DEFINITIONS`, `OP_SKILLS`; `app/_shared/utils/op-varredura.ts`: `findInconsistencies`, `VARREDURA_REGRAS`, `HOSPITAL_COLUMNS_RE` |
| 1. Lib | ✅ | `app/_shared/lib/op/metrics.ts`: `loadOpMetricRows` (select mínimo, corte de data, tetos), `getOpMetrics`, `getOpPrompts` (texto só da página, token mascarado), `listOpOperators` |
| 2. Tela | ✅ · ⚠ **não vista logada** | `app/nova-dash/workspace/operacao/OpMetricsPanel.tsx` acima dos interruptores (seção IA de operação, só `manager_dashboard`); `app/_actions/op/metrics.ts` (`getOpMetricsAction`, `getOpPromptsAction`, ambas `requirePermission("manager_dashboard")`); `Workspace.tsx` monta o painel |
| 3. Ferramentas | ✅ | `tools/relatorio.ts` (`gerar_relatorio`, L1, `manager_dashboard`), `tools/varredura.ts` (`varrer_inconsistencias`, L1, `op_use`); `ETAPA_7_L1` no `tests/op-registry.test.ts` |
| 3. `.claude/settings.json` (allow) | ➖ **não feito** (provisória) | mudança de permissão é do dono (pergunta 7) |
| 4. Skills | ✅ · ⚠ **não testadas no app** | `.claude/skills/auditoria-operacao/SKILL.md`, `.claude/skills/varredura/SKILL.md` |
| Revisão | ✅ | `revisor-regras`: 0 bloqueio, 1 correção, 3 notas — tratados (ver Decisões) |
| 5. Testes/validação | ✅ local | ver Evidências |
| 5. Docs | ✅ (menos `workspace-equipe.md`) | mapas acima; este arquivo; `08-plano-etapa-8.md`; `RESUMO-NOITE-25-10.md`. `docs/ai/workspace-equipe.md` tem mudanças locais do dono: **não editado** (o que faltaria lá está em "Pendências") |

## Evidências (25/10/2026)
- `npx tsc --noEmit` 0 erros · eslint nos 13 arquivos ts/tsx alterados/novos 0 · `npm test` **83 arquivos, 1116 testes ok** (5 smoke pulados, como antes; novos: `op-metrics` 11, `op-metrics-lib` 7, `op-varredura` 6; `op-registry` +1 com `ETAPA_7_L1`) · `npm run docs:check` 0 referência quebrada · sem mudança no `schema.prisma`.
- Medição do passo 0 (READ ONLY, script temporário em `scripts/` apagado depois): `op_requests` 119, `op_tool_calls` 15, `op_sessions` 16 (todas com o mesmo `cwd`), `op_approvals` 0, `state` não nulo 0; filtro de fluxos abertos 0,03 ms pelo índice `(operatorId, createdAt)` → **sem índice parcial**; leitura de `logs` `source: "op"` 213 ms/30 dias sem achar nada → **fora** (redundante com `op_tool_calls`).
- Fumaça contra produção pelo `scripts/op-testar-ferramenta.mjs` (só leitura):

| caso | resultado |
|---|---|
| `gerar_relatorio {"tipo":"operacao","dias":30}` | 13 pedidos (13 consultas, 0 ações), **106 conversas fora**, 11 sessões, 15 chamadas, latência 2,6 s, 96 cards só lidos, 0 conduzidos, 4,2 min ativos — **bate** com `op-relatorio.mjs --dias=30` (119 prompts = 13 + 106; 15 chamadas; 96 cards; médias por ferramenta iguais) — ~3,5 s (a maior parte é o `jiti` do script) |
| `gerar_relatorio` `falhas` / `fluxos` / `aprovacoes` (30 dias e `de`/`ate`) | 0 falhas (taxa 0 %), 0 fluxos, 0 aprovações — coerente com o banco |
| `gerar_relatorio {"tipo":"operacao","de":"2026-01-01","ate":"2026-10-25"}` | `argumentos_invalidos` "O período vai até 90 dias." |
| `gerar_relatorio` `operador: "samuel"` / `"zzzninguem"` | filtra pelo dono / `nao_encontrado` |
| `varrer_inconsistencias {"limite":50}` | 297 cards ativos verificados, 9 itens: 4 `cpf_invalido` (COLHER-ASSINATURA, INSS/OAB/POUPA TEMPO), 5 `sem_hospital` (FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL), 0 CPF/telefone repetido, 0 fluxo bloqueado — ~3,3 s |
| saída do `gerar_relatorio` | sem texto de prompt, sem `args`, sem nome de cliente (conferido também nos testes, nos 4 tipos) |

- **Preview `dev`**: o servidor subiu e compilou sem erro, mas `/nova-dash` redireciona para `/login` — a sessão autônoma não entra com senha (regra), então **o painel não foi visto renderizando**. Coberto por tsc/eslint; conferência visual fica para o dono (roteiro abaixo).
- **Não rodou**: as skills `/auditoria-operacao` e `/varredura` no Claude Code (o catálogo do MCP só muda depois do deploy da Vercel + reiniciar o Claude Code) e a tela logada.

## Decisões tomadas na implementação
- **Pedido × conversa pela skill e pelas ferramentas, não pelo `cwd`** (passo 0): todas as sessões têm o mesmo `cwd`. Pedido = chamou ferramenta `crm-op` ou começou com skill de `OP_SKILLS`; o resto é **conversa** (contada à parte, fora de todo outro número). O filtro "Mostrar conversas" só existe na lista de texto (desligado por padrão).
- **"Dúvida" virou "consulta"** e **"ação" inclui L2** (provisória): preparar documento já é trabalho produzido; só L1 (ou skill sem ferramenta) é consulta.
- **Cards conduzidos só de `op_tool_calls`** (passo 0): L3 com `confirmar` que não foi `noop` + `executar_aprovado` ok. Os demais cards citados por ferramentas viram "só lidos" (contagem). A evidência do que foi feito no card, a `/auditoria-operacao` busca com `listar_historico`.
- **Tempo** = soma dos intervalos ≤ 30 min entre os eventos (prompt + ferramentas) dos pedidos de cada conversa; a latência somada das ferramentas aparece ao lado (pergunta 4).
- **Tela por server action, sem poll** (plano): carrega ao abrir, ao trocar período/operador e no "Atualizar". Painel inteiro só com `manager_dashboard` (provisória, pergunta 1); quem tem só `manage_team` continua vendo os interruptores e não vê o painel (o `Workspace` não monta; as actions recusam no servidor).
- **Texto dos prompts por clique** (decisão 7): `getOpPromptsAction` (`manager_dashboard`) devolve no máximo os 200 mais recentes, 50 por página, 2.000 caracteres cada, com `crmop_…` mascarado; a classificação é feita antes, sem ler o texto, e o texto só é lido para a página.
- **`gerar_relatorio` sem texto, sem `args`, sem nome de cliente** (plano + teste): só número, id, nº de card, `code`, skill e nome de quem opera; `cardIds: []` (relatório não "toca" card no `/meu-dia`).
- **Varredura com 5 checagens fixas** (provisória): `cpf_repetido`, `telefone_repetido` (só CPFs diferentes), `cpf_invalido` (entrou: barata e achou 4 casos), `sem_hospital` (só nas colunas `HOSPITAL|DISTRIBUIÇÃO DE SOLICITA…`; `outro_hospital` preenchido conta), `fluxo_bloqueado` (> 3 dias, ≤ 14, card ativo). "Parado" fica com a `listar_cards_parados` que já existe. Cada item diz que é **checagem da IA, não regra oficial**. Nada corrige.
- **Revisão**: (C1) o ramo "fluxos abertos" da consulta não tinha corte de data → agora só abertos com origem até 90 dias antes do fim do período, e os contadores de fluxo contam só os começados no período (os de antes aparecem só em "parados"); (N1) leitura de `op_tool_calls` da lista de prompts com `orderBy` + aviso `cortado` quando o teto estoura; (N2) `utcMsToKey` usa campos UTC sobre chave de calendário — não é corte de instante (registrado no código); (N3) `varrer_inconsistencias` devolve CPF completo e nome a quem tem `op_use` — coerente com `buscar_cliente` (decisão de 24/10: sem máscara).
- **Sem índice, sem migration** (passo 0): 0,03 ms hoje. Medir de novo quando `op_requests` passar de ~50 mil linhas.

## Para o dono validar (ordem sugerida)
1. Publicar (push da `main` → Vercel; leva junto as Etapas 3–6). **Sem migration nesta etapa.**
2. Espaço de Trabalho → **IA de operação** (com a sua conta, que tem a Visão do Gestor): o painel "Operação por IA — rendimento" aparece acima dos interruptores. 7 dias: ~13 pedidos seus, "106 conversa(s) fora da conta" (seus prompts de desenvolvimento), 0 ações. Passe o mouse sobre os números (definição). Troque para 30/90 dias e um período de datas; escolha o operador.
3. "Mostrar pedidos" → aparecem só os pedidos (os 13); marque "Mostrar conversas" → aparecem também os prompts de desenvolvimento. Confira que nenhum `crmop_…` aparece.
4. Com uma conta que tenha só `manage_team` (sem Visão do Gestor), se houver: a seção mostra só os interruptores.
5. Reiniciar o Claude Code; `diagnostico_crm` lista `gerar_relatorio` e `varrer_inconsistencias` (permitidas para você).
6. `/auditoria-operacao últimos 30 dias` → seções Rendimento, Consultas frequentes, Falhas, Fluxos, Envios, O que melhorar — cada item com id/card/código; nenhum texto de pedido. `/auditoria-operacao 2026-01-01 a 2026-10-25` → recusa "até 90 dias".
7. `/varredura` → por coluna: os 4 CPFs inválidos e os 5 cards sem hospital em FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (+ os parados de `listar_cards_parados`), cada um com regra e evidência; "nada foi alterado"; próximos passos um card por vez. Clique num card do painel (Cards conduzidos/Fluxos/Envios) depois de ter algum: abre o card no Kanban.
8. Depois de uma semana de uso real, abrir o painel e seguir o `08-plano-etapa-8.md` (decidir autonomia pelos números).
9. Responder as perguntas abaixo.

## Perguntas para o dono (decididas provisoriamente)
1. Quem vê o painel: só `manager_dashboard` (provisório) ou também cada operador o próprio rendimento (ex.: no `/meu-dia` ou no Meu Espaço)?
2. Texto dos prompts na tela: só com `manager_dashboard` e só os 200 mais recentes do período (provisório). Retenção do `op_requests.text` e do `op_approvals.args`: zerar com 180/90 dias (sugestão)? Nada foi apagado.
3. Seus prompts de desenvolvimento: separados por "chamou ferramenta ou skill de operação" (provisório) — ou você prefere um token só para operar (aí nada de dev seria registrado)?
4. "Tempo" = intervalos ≤ 30 min entre os eventos dos pedidos (provisório) ou só a latência das ferramentas? 30 min está bom?
5. `gerar_relatorio` sem texto de prompt nem nome de cliente (provisório) está ok para a auditoria pelo Claude Code?
6. `/varredura`: as 5 checagens servem? Quais são as colunas de pedido de prontuário de verdade (hoje: FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL e DISTRIBUIÇÃO DE SOLICITAÇÕES)? "COM SENHA - SOLICITADO" (26 de 46 sem hospital) também deveria ter hospital? Alguma dessas vira regra oficial no vault?
7. `.claude/settings.json`: pôr `mcp__crm-op__gerar_relatorio` e `mcp__crm-op__varrer_inconsistencias` (L1, só leitura) no `allow`, junto com as três da Etapa 6? (não mexi)
8. "Ação" inclui preparar documento (L2) — ok, ou prefere L2 contado à parte?

## Pendências e riscos conhecidos
- Deploy, abrir o painel logado e rodar as duas skills no Claude Code — só o dono.
- **`docs/ai/workspace-equipe.md` não foi editado** (mudanças locais do dono). Faltaria lá, na seção do Espaço de Trabalho: "IA de operação" = `OpMetricsPanel` (só `manager_dashboard`) + `OpSwitchesPanel` (`manage_team` altera, `manager_dashboard` vê); actions `app/_actions/op/metrics.ts` e `app/_actions/op/switches.ts`; carga sem poll; abrir card via `kanban-open-card` + `open-kanban-card`. (A seção "IA de operação" também faltava desde a Etapa 3.)
- **Número com pouco dado**: hoje só o dono usa, quase tudo leitura. O painel só diz algo útil depois de a equipe usar (Etapa 8 espera ≥ 1 semana).
- **Duas janelas do Claude Code no mesmo computador** contam como sessões separadas mas podem ligar ferramenta ao prompt da outra (o `session.json` é um por computador): "tempo ativo" pode sair um pouco maior.
- **`OP_SKILLS` é lista fixa**: skill de operação nova que não entrar lá conta como conversa.
- **`HOSPITAL_COLUMNS_RE` depende do nome da coluna**: renomear a coluna tira a checagem sem erro.
- A varredura devolve CPF completo a quem tem `op_use` (como `buscar_cliente`), e o `op_tool_calls` guarda só o resumo (contagem), não o CPF achado.
