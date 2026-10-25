# AI-First — Etapa 6: resultado (25/10/2026, implementada e validada localmente; deploy e teste no app pendentes)

> Plano: `docs/ai-first/06-plano-etapa-6.md` (a seção "Ajustes do passo 0" no fim registra o que mudou ao ler o código e depois da revisão). Mapa técnico: `docs/ai/operacao-ia.md` (ferramentas de progresso, `op_requests.state`, armadilhas, receitas), `docs/ai/data-model.md` (`OpRequest.state`). Próxima etapa: `docs/ai-first/07-plano-etapa-7.md`. Feita por uma sessão autônoma com o dono fora: decisões **(provisória)** abaixo e em "Perguntas para o dono". **Nada foi gravado em `op_requests`** (nem em teste), nenhum card/comentário/tag tocado, nada enviado, **nenhuma migration**.

## Estado por passo do plano
| Passo | Estado | Onde |
|---|---|---|
| 0. Refinar o plano lendo o código | ✅ | "Ajustes do passo 0" no fim do `06-plano-etapa-6.md` |
| 1. Puros | ✅ | `app/_shared/utils/workflows.ts`: `WORKFLOWS` (4 fluxos), `workflowStateSchema` v1, `checkStep`/`nextStep`/`currentStep`/`markDone`/`block`/`finish`/`isStale`/`resumePlan`, `campoKey`, `BLOQUEIO_CODIGOS` |
| 2. Lib | ✅ | `app/_shared/lib/op/workflow.ts`: `openFlows`, `saveProgress` (advisory lock + claim do prompt de origem), `verifyStepRefs` (ref conferido na fonte), `loadForResume` (releitura + plano + poda do estado) |
| 3. Ferramentas | ✅ | `app/_shared/lib/op/tools/fluxos.ts`: `salvar_progresso` (L1, **interruptor desligado**), `fluxos_abertos`, `retomar_fluxo`; `switchable` no `OpTool` + `hasSwitch` (rota, catálogo, painel); rótulo no `OpSwitchesPanel`; `anexar_rascunho` devolve `documento.id` |
| 3. `.claude/settings.json` (allow) | ➖ **não feito** (provisória) | mudança de permissão fica para o dono (pergunta 4) |
| 4. Skills | ✅ · ⚠ **não testadas no app** | `/retomar` (nova); seção "Progresso" em `/prontuario`, `/procuracao`, `/pedido-prontuario`, `/contrato`; "Regras de progresso" em `.claude/skills/cliente/SKILL.md` |
| Revisão | ✅ | `revisor-regras`: 1 bloqueio, 4 correções, 5 sugestões — todos tratados (ver Decisões) |
| 5. Testes/validação | ✅ local | ver Evidências |
| 5. Docs | ✅ | mapas acima; este arquivo; `07-plano-etapa-7.md` |

## Evidências (25/10/2026)
- `npx tsc --noEmit` 0 erros · eslint nos 15 arquivos alterados/novos (ts/tsx/mjs) 0 · `npm test` **80 arquivos, 1091 testes ok** (novos: `workflows` 24, `op-workflow` 20; `op-registry` +1 com `ETAPA_6_L1`, `op-preview` +1 caso de `switchable`) · `npm run docs:check` 0 referência quebrada · `npx prisma validate` ok (só o comentário de `OpRequest.state` mudou: sem SQL, sem migration).
- Fumaça contra produção pelo `scripts/op-testar-ferramenta.mjs` (só leitura; `salvar_progresso` em `previewOnly`: devolve `estadoQueGravaria`, nada vai para `op_requests`; `retomar_fluxo` não cancela nem grava):

| caso | resultado |
|---|---|
| `fluxos_abertos {}` | `total: 0` — 1,8 s |
| `retomar_fluxo {"card":"4967","workflow":"prontuario"}` | `aberto: false` ("Nenhum fluxo aberto…") — 2,4 s |
| `retomar_fluxo {"fluxo":"cmxx…"}` | `nao_encontrado` |
| `salvar_progresso` pendências + `bloqueio` `dado_faltante` `campos: ["data do acidente","Fulano"]` | estado `bloqueado` com `campos: ["data_acidente"]` ("Fulano" descartado), `proximo` = pendências; sem nome/CPF no estado — 3,9 s |
| `salvar_progresso` `anexar` sem `pedido` | `passo_invalido` ("vem depois de pedido") |
| `salvar_progresso` `pedido` com o rascunho da Etapa 4 (procuração) | `ref_invalido` ("rascunho é de outro tipo") |
| `salvar_progresso` workflow `procuracao`, passo `procuracao`, mesmo rascunho | aceito em prévia; `modelo` tirado do metadado do S3 — 5,2 s |
| `salvar_progresso` `preparar_email` sem `modo` | `passo_invalido` ("depende de modo = email") |
| `salvar_progresso` `fim: "concluido"` sem fluxo | `nao_encontrado` |

- **Não rodou contra produção**: qualquer gravação de estado (por desenho: interruptor desligado e nada em `op_requests` nesta sessão) e o ciclo completo parar → retomar em outra conversa. Cobertos por teste com mocks (`op-workflow`) e pelo roteiro abaixo.

## Decisões tomadas na implementação
- **Estado em `op_requests.state` do prompt de origem** (plano): sem tabela nova, sem migration. Um prompt guarda no máximo um fluxo (claim com `state` nulo e mesmo operador).
- **Só ids/keys no estado; ref conferido no servidor** (provisória, plano + revisão): o modelo manda `passo` + `ref`; o servidor confere na fonte (rascunho do próprio operador/card/tipo, documento no card, aprovação do operador/card/ferramenta e **posterior ao prompt de origem**, envio só `executada`, tag/coluna que o card tem, comentário do card posterior à origem) e só então marca feito.
- **Bloqueio sem texto livre** (revisão B1/C2): o `detalhe` do plano saiu do schema da ferramenta e do estado; só `tipo`, `campos` (chaves de `DOC_FIELD_LABELS`, aceitando o rótulo) e `codigo` (`BLOQUEIO_CODIGOS`); o que não está na lista não entra no estado. O argumento cru da chamada continua em `op_tool_calls.args`, como em todas as ferramentas (lá CPF/telefone já aparecem pela decisão de 24/10).
- **`salvar_progresso` com interruptor, desligado** (provisória, mais conservadora que o plano, que dizia "sem interruptor"): toda ferramenta nova que grava nasce desligada. Desligado, as skills avisam uma vez e seguem sem retomada.
- **Aprovação L4 nunca se reaproveita** (plano): retomar cancela a pendente do fluxo (`cancelada`) — mesmo com o interruptor desligado (S4), nunca no script — e manda preparar de novo (código novo). `executada` = envio feito (nunca repete), inclusive quando a aprovação executada é uma nova que não foi salva (S5). `enviando` → `parar`.
- **Revalidar antes de pular** (plano): card, hospital e pendências sempre relidos; rascunho vencido refaz só ele — a não ser que já esteja anexado no card (aí usa o documento); anexo na lixeira refaz o anexar; card arquivado/movido/tag tirada → aviso; card sumiu → `parar`.
- **Passos do `/prontuario` enxugados**: sem `texto_email` nem `aprovar` (o texto tem dado pessoal e vive só na conversa; o "aprovo" já é provado no `executar_aprovado`).
- **Passo do ZapSign (`/contrato`) é confiança no operador**: sem ref; só salvo depois de ele confirmar no chat; ao retomar vem com aviso. Link de assinatura nunca vai para o estado.
- **14 dias** (provisória, plano) por dia de calendário em Brasília desde o último progresso; vira `abandonado` ao ser lido pelo salvar/retomar (sem cron). `fluxos_abertos` só esconde (conta no `aviso`).
- **Retomar fluxo de outro operador: não** (provisória, plano) — `sem_permissao`.
- **Achados do revisor sem mudança de código**: custo do filtro Json sem índice (S1 → medido no passo 0, índice parcial fica para a Etapa 7 se pesar); `read_only` pode chamar `salvar_progresso` (S2: L1, sem efeito prático — não tem rascunho/aprovação para citar); `zapsign` sem prova (S3: aviso no retomar + regra na skill).

## Para o dono validar (ordem sugerida)
1. Publicar (push da `main` → Vercel; leva junto as Etapas 3, 4 e 5). Sem migration nesta etapa.
2. Reiniciar o Claude Code; `diagnostico_crm` lista `fluxos_abertos` e `retomar_fluxo` (permitidas) e `salvar_progresso` com `permitido: false`.
3. Espaço de Trabalho → IA de operação → ligar **"Guardar o progresso dos fluxos (retomar com /retomar)"**. (Se quiser parar de responder ao pedido de permissão a cada passo: pôr `mcp__crm-op__salvar_progresso`, `mcp__crm-op__fluxos_abertos`, `mcp__crm-op__retomar_fluxo` no `allow` do `.claude/settings.json` — pergunta 4.)
4. No card de teste "TESTE IA — não mexer" **com a data do acidente vazia**: `/prontuario <nº>` → para nas pendências → a skill salva o bloqueio e diz "digite /retomar" → feche a conversa → preencha a data no site → conversa nova: `/retomar` → "1 fluxo parado: pedido de prontuário do <nº>, parou em pendências (data do acidente)" → "sim" → relê pendências → gera o pedido (uma vez) → anexar (prévia → "sim") → **pare de novo** antes do e-mail → `/retomar` noutro dia/conversa → não gera o pedido de novo, vai direto ao e-mail com código novo.
5. Casos: gere um pedido, espere vencer (7 dias) ou apague o anexo na lixeira → `/retomar` refaz só aquilo. Prepare o e-mail e não digite o código → `/retomar` → a aprovação antiga aparece `cancelada` (Etapa 5: `aprovo <código antigo>` não envia mais).
6. Conferir o estado no banco (só leitura): `node -r dotenv/config scripts/op-relatorio.mjs --dias=1` (contagens) — o JSON do `state` não tem nome/CPF.
7. Desligar o interruptor se não for usar ainda. Responder as perguntas abaixo.

## Perguntas para o dono (decididas provisoriamente)
1. Progresso em `op_requests.state` (sem tabela nova) está ok? (alternativa: tabela `op_workflows`, mais fácil para o dashboard da Etapa 7)
2. Retomar fluxo de OUTRO operador (passar o caso para um colega)? (provisório: não; cada um retoma o seu)
3. 14 dias para um fluxo parado virar "abandonado"?
4. Pôr `salvar_progresso`, `fluxos_abertos` e `retomar_fluxo` no `allow` do `.claude/settings.json`? (provisório: não mexi — mudança de permissão é sua)
5. `salvar_progresso` com interruptor (provisório: sim, desligado) ou sempre ligado como as leituras?
6. Bloqueio só com campos/código de lista fechada (sem texto livre) está bom? (o operador vê o motivo montado pelo sistema)
7. Pendências das Etapas 4 e 5 (remetente do SES, cc padrão, KIT padrão, WhatsApp no inbox com nome, limpeza de `op_approvals`) continuam abertas.

## Pendências e riscos conhecidos
- Deploy, ligar o interruptor e o roteiro de retomada no app (acima) — só o dono. Skills não testadas no Claude Code com o catálogo novo.
- **Skill lembrando em vez de ler**: as skills mandam chamar `retomar_fluxo` no início e salvar com o ref exato; o servidor recusa ref inventado (`ref_invalido`), mas pular o `salvar_progresso` só faz o fluxo não ser retomável (teste manual).
- Hook sem token / fora do ar: o fluxo segue sem retomada (`semRegistro`); com um prompt anterior ainda na janela de 30 min, a origem fica nesse prompt (rótulo errado no dashboard, sem efeito no fluxo).
- `op_requests` sem índice em `state`: filtro por `operatorId` + Json; medir na Etapa 7.
- Dois fluxos começados na mesma mensagem: o segundo não tem retomada (um fluxo por mensagem).
- `docs/ai/workspace-equipe.md` (mudanças locais do dono) continua sem a seção "IA de operação".
