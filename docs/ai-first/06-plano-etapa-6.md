# AI-First — Etapa 6: plano de execução (workflows com retomada: estado em `op_requests.state`, `/retomar`)

> **Comece aqui num chat novo.** Leia, nesta ordem: este arquivo → `docs/ai-first/05-resultado-etapa-5.md` (o que existe, decisões provisórias, perguntas abertas) → `docs/ai/operacao-ia.md` (API/MCP, contratos L2/L3/L4, `op_requests` gravado pelo hook, `op_approvals`, armadilhas do `session.json` e do guard) → as skills de fluxo longo `.claude/skills/{prontuario,procuracao,pedido-prontuario,contrato}/SKILL.md` e as "Regras de operação/escrita/aprovação" de `.claude/skills/cliente/SKILL.md` → `docs/ai/data-model.md` (`OpRequest.state`). Contexto de negócio: `docs/ai-first/00-diagnostico-etapa-zero.md` §6.1 (skills = workflows com passos e ponto de aprovação), §8 linha 6. Regras do repo valem integralmente (`CLAUDE.md` raiz; skills `/plano` `/migration` `/validar` `/mapa-atualizar`). **Banco = produção.** Escrito em 25/10/2026 por uma sessão autônoma (o dono estava fora): decisões **(provisória)** foram tomadas pelo lado conservador e estão em "Perguntas para o dono" — siga-as, não bloqueie.

## Ponto de partida (25/10/2026)
- Etapas 3, 4 e 5 commitadas localmente (**sem push**; o dono publica). A migration da Etapa 5 (`op_approvals` + `User.hospital_*`) **já está aplicada** no Neon; o `--apply` do contato dos GHOST e o teste de envio real são do dono (roteiro no `05-resultado-etapa-5.md`).
- Os fluxos longos existem só como texto de skill: `/prontuario` (13 passos: hospital → pendências → pedido → procuração → anexar → e-mail → "aprovo" → tag → mover), `/contrato` (8 passos, navegador), `/procuracao`, `/pedido-prontuario`. Se o operador para no meio (campo faltando no cadastro, hospital sem e-mail, conversor fora, almoço), **a próxima conversa começa do zero**: refaz `obter_card`, `consultar_hospital`, gera de novo o PDF (fila única do conversor) e pode deixar rascunho/anexo duplicado.
- `OpRequest.state` (Json, `op_requests`) existe desde a Etapa 1, **reservado** a esta etapa e nunca escrito.
- O que já é idempotente e ajuda a retomar: `anexar_rascunho` (noop por key), `comentar_card` (noop 10 min), `executar_aprovado` (noop por `approvalId`), `mover_card`/tags (noop se já está). O que vence: rascunho (7 dias), aprovação (30 min), link de prévia (~90 min).
- Lições da Etapa 5 que viram regra aqui: (1) o servidor só confia no que ELE guardou (o envio usa o `args` do banco, não o que o modelo manda) — o estado do workflow também é dado do servidor, nunca "memória" do modelo; (2) `session.json` é um por computador — retomar não pode depender da sessão; (3) o `bash-rules.mjs` barra comando/arquivo que cite o token do app (para editar doc que o cita use a ferramenta Edit); (4) o script `op-testar-ferramenta.mjs` testa prévias sem gravar (`previewOnly`) — estenda o mesmo modo para as ferramentas novas.

## Objetivo da etapa
Um fluxo de várias etapas (começando pela `/prontuario`) **guarda o progresso no CRM** a cada passo e, quando trava por dado faltante (ou o operador para), **retoma depois sem repetir** o que já foi feito — inclusive em outra conversa ou outro dia. Pergunta que precisa funcionar: *"/prontuario 2342"* → para no passo 3 ("falta a data do acidente") → operador preenche no site → dia seguinte, *"/retomar"* → "você tem 1 fluxo parado: prontuário do 2342, parou em 'pendências' (faltava data do acidente) — continuo?" → "sim" → confere de novo só o que pode ter mudado (pendências, rascunho ainda válido) → segue do passo 4, sem gerar o pedido duas vezes.

**Fora desta etapa**: workflow novo de negócio (só os que já existem como skill), execução em segundo plano/cron sem o operador, retomar fluxo de OUTRO operador (ver perguntas), mudar etapa do checklist e editar cadastro (seguem fora), dashboard (Etapa 7).

## Decisões
| origem | decisão | efeito |
|---|---|---|
| diag. §8 linha 6 | estado do workflow em `op_requests.state` do prompt que **iniciou** o fluxo (a "origem"); sem tabela nova | nenhuma migration; o estado sobrevive à conversa e ao dia, porque não depende de `op_sessions` |
| 25/10 **(provisória)** | formato do estado versionado, validado por zod no servidor: `{ v: 1, workflow, status: "em_andamento" \| "bloqueado" \| "concluido" \| "abandonado", card: {id, cardNumber}, passo, feitos: [{passo, em, ref?}], dados: {rascunhos?, approvalId?, hospital?, modelo?…}, bloqueio?: {tipo: "dado_faltante" \| "aguardando_operador" \| "erro_externo", detalhe, campos?}, atualizadoEm }` | o modelo nunca escreve JSON livre: a ferramenta recebe só `passo`/`ref`/`bloqueio` e o servidor monta e valida |
| 25/10 **(provisória)** | **só ids e keys no estado, nunca dado pessoal** (sem CPF, sem corpo de e-mail, sem texto do cliente): o conteúdo está no card, no rascunho (`op-drafts/`) ou na aprovação (`op_approvals`) | `op_requests.state` não vira mais um lugar com PII; retomar relê da fonte |
| 25/10 **(provisória)** | um fluxo aberto por (operador, workflow, card): começar de novo o mesmo = pergunta "continuar o parado ou recomeçar?" (recomeçar marca o antigo `abandonado`) | sem dois `/prontuario 2342` paralelos gerando anexos em dobro |
| 25/10 **(provisória)** | ferramentas novas de **registro** (nível 1, escrevem só em `op_requests`, nunca no card; sem interruptor): `salvar_progresso`, `fluxos_abertos`, `retomar_fluxo` | o progresso é auditoria da operação, como o `op_tool_calls`; as ações no card continuam nas L3/L4 de sempre |
| 25/10 **(provisória)** | retomar **revalida antes de pular**: rascunho (`getDraft`: vencido → refaz só ele), aprovação (`expirada`/`falhou` → prepara de novo; `executada` → pula; `enviando` → para e manda conferir), pendências (sempre de novo), card arquivado/movido desde a pausa (avisa) | "não repetir" nunca vira "usar coisa vencida"; o que é barato reler (card, pendências) sempre é relido |
| 25/10 **(provisória)** | aprovação L4 **não é retomável**: código vence em 30 min e só vale como última mensagem da conversa da preparação — retomar um fluxo parado no "aprovo" prepara de novo (código novo) | sem brecha para reaproveitar "aprovo" velho |
| 25/10 **(provisória)** | `/retomar` lista os fluxos `em_andamento`/`bloqueado` do operador dos últimos **14 dias**; mais velho que isso vira `abandonado` na leitura (sem cron) | lista curta; nada some do banco |
| diag. §6.1 | os passos de cada workflow ficam declarados em código (`app/_shared/utils/workflows.ts`: id, ordem, rótulo, o que revalidar ao retomar, se é L3/L4) e a skill cita os mesmos ids | skill e servidor falam a mesma língua; teste fixa a ordem |

## Ordem de execução
### 0. Refinar o plano lendo o código (antes de tudo)
- Ler `app/_shared/lib/op/record.ts` (`recordPrompt`, `latestRequestId`: janela de 30 min, sessão), `app/api/op/tools/[tool]/route.ts` (o `trace.requestId` que liga a ferramenta ao prompt), `app/_shared/lib/op/approvals.ts`, `app/_shared/lib/docs/drafts.ts` (`getDraft`), as skills de fluxo longo e `.claude/hooks/op-prompt.mjs`. Conferir: (a) o prompt "/prontuario 2342" sempre vira `op_requests` antes da 1ª ferramenta? (o hook tem timeout de 5 s; sem token não grava — o fluxo então não salva e a skill segue sem retomada); (b) dá para filtrar `state->>'status'` no Prisma (`path`) sem índice sem pesar (quantos `op_requests` por operador em 14 dias?). Registrar os ajustes numa seção "Ajustes do passo 0" no fim deste arquivo.

### 1. Puros (`app/_shared/utils/workflows.ts`)
- `WORKFLOWS`: `prontuario` (passos `card`, `hospital`, `pendencias`, `pedido`, `procuracao`, `anexar`, `modo`, `texto_email`, `preparar_email`, `aprovar`, `enviar`, `tag`, `mover`), `procuracao`, `pedido_prontuario`, `contrato` (sem o passo do navegador como "feito" automático: o operador confirma).
- `workflowStateSchema` (zod, `v: 1`), `nextStep(state)`, `markDone(state, passo, ref?)`, `block(state, bloqueio)`, `resumePlan(state, fatos)` (puro: dado o estado + o que foi relido — rascunho vencido? aprovação em que status? card arquivado? — devolve os passos a refazer e o próximo), `isStale(state, agora)` (14 dias, por `brDaysBetween`).

### 2. Lib (`app/_shared/lib/op/workflow.ts`)
- `startOrFind({op, workflow, cardId, requestId})` (um aberto por operador+workflow+card; outro aberto → devolve o existente para a skill perguntar), `saveProgress(...)` (update do `state` da origem, só pelo dono do fluxo, com releitura e merge sob `pg_advisory_xact_lock` do id da origem), `listOpen(op)`, `loadForResume(id, op)` (+ revalidação: `getDraft`, `loadApproval`, card).
- Sem `requestId` (hook sem token/timeout) → `sem_registro` e a skill avisa "este fluxo não vai poder ser retomado" e segue.

### 3. Ferramentas (`app/_shared/lib/op/tools/fluxos.ts`)
| ferramenta | nível | args | devolve |
|---|---|---|---|
| `salvar_progresso` | L1 (registro) | `workflow`, `card`, `passo` (id do `WORKFLOWS`), `ref?` (key de rascunho, `approvalId`, nome de coluna), `bloqueio?` | estado salvo (sem PII) + próximo passo; passo fora da ordem → `passo_invalido` |
| `fluxos_abertos` | L1 | — | fluxos do operador (14 dias): workflow, card, passo, bloqueio, há quanto tempo |
| `retomar_fluxo` | L1 | `fluxo` (id) ou `card` + `workflow` | estado + `resumePlan` (o que foi feito e ainda vale, o que refazer, próximo passo) |
- `tests/op-registry.test.ts`: lista `ETAPA_6_L1`; descrição começa com "REGISTRO."; nenhuma delas escreve fora de `op_requests`.
- `scripts/op-testar-ferramenta.mjs`: `fluxos_abertos`/`retomar_fluxo` rodam normal (leitura); `salvar_progresso` só em `previewOnly` (devolve o estado que gravaria).
- `.claude/settings.json`: as três no `allow` (não mexem no CRM) **(provisória)**.

### 4. Skills
- `/retomar` (nova): `fluxos_abertos` → nenhum: diz isso; um: "continuo o <workflow> do <card>, parado em <passo> (<bloqueio>)?"; vários: lista e pergunta → `retomar_fluxo` → mostra o que já foi feito e o que vai refazer → segue a skill do workflow a partir do passo indicado.
- `/prontuario` (e depois `/procuracao`, `/pedido-prontuario`, `/contrato`): bloco "Progresso" — no início `retomar_fluxo` com `card` (fluxo aberto → pergunta continuar/recomeçar); depois de cada passo concluído, `salvar_progresso` com o `ref` do que foi criado; ao parar por dado faltante, `salvar_progresso` com `bloqueio` e diz "quando preencher, digite /retomar".
- "Regras de operação": nunca considerar um passo feito sem o `ref` que a ferramenta devolveu; nunca pular revalidação que o `retomar_fluxo` pediu.

### 5. Testes, validação, documentação
- vitest: schema (rejeita PII óbvia: CPF/e-mail no estado), ordem dos passos, `markDone` idempotente, `resumePlan` (rascunho vencido refaz só o pedido; aprovação `executada` pula envio; `expirada` volta a `preparar_email`; `enviando` bloqueia; card arquivado avisa), `isStale`, um aberto por operador+workflow+card, só o dono salva, corrida (advisory lock mockado).
- Fumaça contra produção **só leitura / previewOnly** pelo `scripts/op-testar-ferramenta.mjs` (`fluxos_abertos` vazio, `retomar_fluxo` de card sem fluxo → `nao_encontrado`). Nada gravado em `op_requests` pelo script.
- `/validar` + `revisor-regras` (sem PII no estado, nada no card por ferramenta L1, Brasília nas datas, permissões).
- `/mapa-atualizar operacao-ia data-model` + `docs/ai-first/06-resultado-etapa-6.md` + plano da Etapa 7.

## Critérios de aceite
1. `/prontuario` interrompido no passo de pendências e retomado em outra conversa (outro dia) continua do passo seguinte, sem gerar o pedido de novo nem anexar duas vezes.
2. Rascunho vencido no meio é refeito sozinho (só ele); aprovação nunca é reaproveitada (prepara de novo); envio `executada` nunca é repetido; `enviando` para e manda conferir.
3. Falha (conversor fora, hospital sem e-mail) grava `bloqueio` e não apaga o que já estava feito.
4. Estado sem dado pessoal (só ids/keys); só o dono do fluxo salva/retoma.
5. Sem `requestId` (hook sem token) a skill avisa e segue sem retomada — nada quebra.
6. tsc/lint/testes limpos; ferramentas da Etapa 5 continuam iguais.

## Riscos
- **Estado divergente do CRM** (alguém mexeu no card pelo site no meio): por isso o retomar relê card, pendências, rascunho e aprovação; o estado só diz o que a IA fez, não o que o card é.
- **Modelo "lembrando" do passo em vez de ler o estado**: as skills mandam chamar `retomar_fluxo` e seguir o `resumePlan`; teste de skill é manual (roteiro no resultado).
- **`op_requests` crescendo com JSON**: estado pequeno (só ids); se a listagem pesar, índice de expressão em `state->>'status'` por migration aditiva (passo 0 mede).
- **Dois computadores do mesmo operador**: o estado é por operador (não por sessão), então retomar no outro computador funciona; o "aprovo" continua por sessão (Etapa 5).

## Perguntas para o dono (decididas provisoriamente — confirmar ao acordar)
1. Guardar o progresso em `op_requests.state` (sem tabela nova) está ok? (alternativa: tabela `op_workflows`, melhor para o dashboard da Etapa 7)
2. Retomar fluxo de OUTRO operador (passar o caso para um colega) entra? (provisório: não; cada um retoma o seu)
3. 14 dias para um fluxo parado virar "abandonado" está bom?
4. As três ferramentas de registro podem ficar no `allow` (sem pedir permissão a cada passo)? Elas não mexem no card.
5. Quais workflows além da `/prontuario` ganham retomada nesta etapa? (provisório: `/prontuario` primeiro; `/procuracao`, `/pedido-prontuario`, `/contrato` se couber)
6. As perguntas abertas das Etapas 4 e 5 (remetente do SES, cc padrão, KIT padrão, WhatsApp no inbox com nome) seguem valendo e mudam pouco aqui.

## Ajustes do passo 0 (25/10/2026, lendo o código; inclui o que a revisão mudou)
- **(a) O prompt vira `op_requests` antes da 1ª ferramenta: sim, quando há token.** O `UserPromptSubmit` roda antes de o modelo agir (timeout 8 s no `settings.json`, o hook corta em 5 s). A ferramenta liga-se ao prompt por `latestRequestId` (último prompt da sessão em 30 min). Sem token/hook fora: `requestId` nulo → `salvar_progresso` devolve `semRegistro` e a skill segue sem retomada. Hook falhando com um prompt anterior ainda na janela: a origem fica nesse prompt anterior (só rotula errado; o claim exige `state` nulo e o mesmo operador — nunca ocupa prompt de outro nem sobrescreve outro fluxo).
- **(b) Filtro `state->'status'` sem índice: ok por ora.** Em 30 dias: 1 operador, 16 sessões, 118 prompts (106 de desenvolvimento). A busca usa o índice `(operatorId, createdAt)` + filtro Json por `path` do Prisma (`take: 50`). Se crescer: índice parcial `WHERE state IS NOT NULL` por `/migration` aditiva (Etapa 7 decide, junto com o dashboard).
- **Origem por mensagem**: um prompt guarda no máximo um fluxo (`updateMany … state = DbNull`); dois fluxos começados na mesma mensagem → o segundo sai `semRegistro` ("um fluxo por mensagem").
- **Passos do `/prontuario` enxugados**: `texto_email` e `aprovar` saíram. O texto vive só na conversa (tem dado pessoal; refazer é barato) e o "aprovo" é provado pelo servidor no `executar_aprovado`. Ficou: `card · hospital · pendencias · pedido · procuracao? · anexar? · modo · preparar_email · enviar · tag? · mover?` (`?` = opcional). `modo` = `email`|`outro`; `preparar_email`/`enviar` só se aplicam com `email`.
- **Tipos de passo** em `app/_shared/utils/workflows.ts`: `reler` (sempre refeito), `rascunho` (key), `anexo` (`documento.id`, uuid), `aprovacao`/`envio` (`approvalId`), `registro` (valor, tag, coluna, comentário — conferidos no card), `operador` (ZapSign: sem ref, só confiança no operador, com aviso ao retomar). `requer` + `quando` decidem a ordem (`passo_invalido`).
- **Sem `dados` livres no estado**: tudo fica em `feitos[].refs` (+ `modelo` tirado do metadado do rascunho). O ref é **conferido no servidor** antes de virar feito (`ref_invalido`): rascunho do próprio operador, do card e do tipo certo; documento no card fora da lixeira; aprovação do operador, do card, da ferramenta e criada depois do prompt de origem (fluxo novo: 24 h); envio só com aprovação `executada`; tag/coluna que o card tem agora; comentário do card criado depois da origem.
- **Bloqueio sem texto livre** (revisão, B1/C2): só `tipo` + `campos` (chaves de `DOC_FIELD_LABELS`; o rótulo "estado civil" é convertido) + `codigo` (lista fechada `BLOQUEIO_CODIGOS`). O que não está na lista é descartado — nome/CPF não têm onde entrar. O texto para o operador é montado na saída.
- **Interruptor no `salvar_progresso`** (provisória, mais conservadora que o plano): o plano dizia "sem interruptor"; a trava da sessão autônoma manda ferramenta nova que grava nascer desligada. Novo campo `switchable` no `OpTool` + `hasSwitch` em `op/switches.ts`; aparece no painel IA de operação. Desligado: a skill avisa uma vez e segue sem retomada; `retomar_fluxo` vira só leitura do estado (mas ainda cancela a aprovação pendente do fluxo — S4 da revisão).
- **`.claude/settings.json` NÃO foi alterado** (provisória): pôr as três no `allow` é mudança de permissão; fica para o dono (pergunta 4). Até lá o Claude Code pede permissão a cada chamada.
- **`retomar_fluxo` de card sem fluxo = `aberto: false` (ok)**, não erro: é o começo normal de toda skill. `nao_encontrado` só para `fluxo` (id) inexistente.
- **Retomar grava** (com interruptor ligado, nunca no script): tira do estado os feitos que perderam a validade, cancela a aprovação pendente do fluxo (`cancelada`) e atualiza a coluna do card; sob o mesmo advisory lock e só se ninguém salvou no meio (`atualizadoEm` igual). Envio executado mas não salvo (aprovação nova do mesmo operador/card/ferramenta depois da origem) conta como feito — nunca manda duas vezes (S5).
- **`anexar_rascunho` passou a devolver `documento.id`** (campo novo, compatível) para servir de ref do passo `anexar`.
- **Concluído**: o último passo salvo encerra sozinho; opcionais recusados → `fim: "concluido"`; recomeçar → `fim: "abandonado"`. Parado há mais de 14 dias (Brasília) vira `abandonado` ao ser lido pelo salvar/retomar (sem cron).
