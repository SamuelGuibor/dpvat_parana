# AI-First — Etapa 8: plano de execução (autonomia gradual decidida por dados: quem pode o quê, e se alguma L4 dispensa a confirmação)

> **Comece aqui num chat novo — mas só depois de pelo menos 1 semana de uso real** (Etapas 3–7 publicadas, interruptores ligados no card de teste e depois no dia a dia, equipe usando). Leia, nesta ordem: este arquivo → `docs/ai-first/07-resultado-etapa-7.md` (o painel, as definições de cada número, decisões provisórias) → `docs/ai/operacao-ia.md` (níveis L1–L4, `canRun`, interruptores `op_l3_switches`, `op_write`/`op_approve`, prova do "aprovo", armadilhas) → `docs/ai/auth-permissoes.md` (overrides em `User.permissions`, `ROLE_DEFAULTS`) → `app/_shared/utils/op-metrics.ts` + `app/_shared/lib/op/metrics.ts` (de onde sai cada número) → `app/_shared/lib/op/switches.ts` + `app/_actions/op/switches.ts` (interruptor global). Contexto de negócio: `docs/ai-first/00-diagnostico-etapa-zero.md` §8 linha 8 ("abrir L3 por ferramenta/operador com base nas métricas; avaliar L4 sem confirmação só onde política permitir") e §10 decisões 6 (sugestão só executa após o "sim"), 12 (responsável = quem conduz a IA) e 14 (aprovação por chat). Regras do repo valem integralmente (`CLAUDE.md` raiz; skills `/plano` `/migration` `/validar` `/mapa-atualizar`). **Banco = produção.** Escrito em 25/10/2026 por uma sessão autônoma (o dono estava fora): decisões **(provisória)** foram tomadas pelo lado conservador e estão em "Perguntas para o dono" — siga-as, não bloqueie. **Nada se abre sozinho**: a etapa mede, mostra e recomenda; quem liga é o dono, um interruptor por vez.

## Ponto de partida (25/10/2026)
- Etapas 3–7 commitadas localmente (sem push na noite de 25/10). Hoje: `op_write` e `op_approve` só no ADMIN++; L3/L4 com interruptor **global** desligado por padrão (`app_settings` `op_l3_switches`); L3 = prévia + `previa_hash` + "sim" + pedido de permissão do Claude Code; L4 = `preparar_*` → operador digita `aprovo <código>` (provado no servidor pelo `op_requests` do hook) → `executar_aprovado`. Nenhuma L3/L4 no `allow` do `.claude/settings.json`.
- O painel da Etapa 7 (Espaço de Trabalho → IA de operação) já dá, por operador e período: pedidos/consultas/ações, ferramentas (prévias × execuções × sem mudança), falhas por `code` (inclui `estado_mudou`, `sem_permissao`, `ferramenta_desligada`), envios (executada/expirada/falhou/cancelada), fluxos (abertos/concluídos/abandonados, bloqueio mais comum), cards conduzidos, tempo. `gerar_relatorio` dá o mesmo pelo Claude Code.
- **O que falta para decidir com segurança**: (1) saber se a ação da IA foi **desfeita** depois por uma pessoa (moveu e alguém moveu de volta; marcou tag e alguém tirou; arquivou e desarquivaram) — é o sinal mais direto de erro e o painel não mede; (2) liberar **por operador** e por ferramenta — o interruptor de hoje é global e o `op_write` vale para todas as L3; (3) uma tela que junte os critérios por operador × ferramenta com o semáforo.

## Objetivo da etapa
Depois de ≥ 7 dias de uso real, o dono abre **IA de operação → Autonomia** e vê uma matriz operador × ferramenta com os números do período e um semáforo (verde = critério atingido; amarelo = pouco dado; vermelho = critério estourado), com a razão escrita. Ele decide e liga **à mão** (um clique por par operador × ferramenta, com log). Para L4 a tela mostra os mesmos números, mas a decisão provisória é **não dispensar o "aprovo <código>"** de nenhuma; a etapa só documenta o que seria preciso para reconsiderar.

**Fora desta etapa**: abrir qualquer coisa automaticamente; L4 sem código digitado; ação em lote; ferramenta nova de escrita; mudar `.claude/settings.json` (é do dono); editar cadastro/etapa do checklist pela IA.

## Métricas a olhar (painel da Etapa 7 + o "desfeito" desta etapa) e limiares provisórios
Janela: os últimos **7 dias** (mínimo) e de preferência 14. Sempre por **operador × ferramenta**. Abaixo do volume mínimo o semáforo fica amarelo ("pouco dado"), nunca verde.

| métrica | de onde sai | limiar para L3 ficar verde **(provisório)** | por quê |
|---|---|---|---|
| execuções observadas | painel → Ferramentas (`execucoes`) e Cards conduzidos | ≥ **10** execuções da ferramenta pelo operador (≥ 5 para `arquivar_card`) | abaixo disso qualquer taxa é ruído |
| desfeito em 24 h por pessoa | **novo** (passo 2): log de volta no mesmo card por autor que não é "(via IA)" | ≤ **5 %** das execuções e **0** em arquivar | é o erro real que o operador não viu na prévia |
| `estado_mudou` | painel → Falhas por código | ≤ **10 %** das chamadas com `confirmar` | alto = prévia e "sim" distantes; card mexido no site no meio |
| prévia sem execução | Ferramentas (`previas` − `execucoes`) | só informativo; > **50 %** acende amarelo | muita prévia descartada = a IA propõe coisa errada ou o operador desiste |
| falhas que não são de permissão | Falhas por código, tirando `sem_permissao`, `ferramenta_desligada`, `estado_mudou` | ≤ **5 %** das chamadas da ferramenta | `argumentos_invalidos`/`erro_interno` repetido = skill ou ferramenta com defeito: corrigir antes de abrir |
| `noop` | Ferramentas (`noop`) | só informativo | alto = a IA pede o que já está feito (não é risco, é desperdício) |
| fluxos abandonados | Fluxos (`abandonados`/`abertos`) | só informativo para L3; > **30 %** dos fluxos do operador acende amarelo | fluxo largado no meio pode deixar card pela metade |
| consultas antes de agir | Por operador (`consultas`/`acoes`) | ≥ **20** consultas do operador no período antes da 1ª L3 dele | operador que ainda não usa a leitura não deveria começar pela escrita |

Para **L4** (e-mail/WhatsApp), mostrar e **não** liberar dispensa nesta etapa:
| métrica | de onde sai | o que seria preciso para reconsiderar dispensar o código **(provisório: não dispensar)** |
|---|---|---|
| envios executados | Envios (`executada`) | ≥ **50** por canal no total da equipe, ≥ 20 do operador |
| envio falhou / enviando preso | Envios (`falhou`, `enviando`) | **0** em 30 dias |
| reclamação/bounce do SES; aviso da Meta | fora do painel (console SES; logs `wa_account`) | **0** em 30 dias |
| expirada | Envios (`expirada`) | ≤ 20 % (alto = o operador prepara e não lê; dispensar o código seria pior) |
| destino fora do cadastro | `op_send.metadata.destinoLivre` | **0** — dispensa só pensável para e-mail ao `hospital_email` do cadastro, com modelo fixo |

## Decisões
| origem | decisão | efeito |
|---|---|---|
| 25/10 **(provisória)** | autonomia = **liberar por operador × ferramenta**, com o interruptor global ainda valendo como kill switch (desligou o global, desliga para todos) | `app_settings` `op_autonomy` = `{ <tool>: [userId…] }` lido junto com `op_l3_switches` (cache de 15 s); `canRun` passa a receber "ligado para este operador"; sem migration (`app_settings` já existe) |
| 25/10 **(provisória)** | `op_write` continua sendo o portão do cargo; o par operador × ferramenta é a segunda trava | quem não tem `op_write` nunca escreve, mesmo na lista |
| 25/10 **(provisória)** | nada abre sozinho: a tela recomenda (semáforo + razão), o dono clica; cada mudança grava log `update` `metadata.stage = "op_autonomy"` (como `op_switch`) | auditável, reversível em 1 clique |
| 25/10 **(provisória)** | prévia + "sim" **nunca** some de L3 nesta etapa; "autonomia" muda **quem** pode e **quais** ferramentas, não o fluxo de confirmação | o servidor continua provando a prévia (`previa_hash`) |
| 25/10 **(provisória)** | L4: **nenhuma** dispensa o `aprovo <código>`; a tela mostra os números e o que faltaria (tabela acima) | regra da Etapa 5 mantida (envio para fora só com o código digitado pelo operador e provado no servidor); o §8 do diagnóstico pede "avaliar L4 sem confirmação só onde política permitir" — esta etapa avalia e mostra, não dispensa |
| 25/10 **(provisória)** | "desfeito" = no mesmo card, até 24 h depois da execução da IA, uma pessoa (autor sem "(via IA)") fez a ação inversa: `move` de volta para a coluna `from`, `tag_remove` da tag que a IA pôs (e vice-versa), desarquivar o que a IA arquivou | leitura de `logs` **só dos cards conduzidos** (`userId IN cardIds`, índice `[userId]`) e com corte de data — nada de varrer `logs` por `metadata` |
| 25/10 **(provisória)** | ordem de abertura sugerida (menor risco → maior): `comentar_card` → `adicionar_tag`/`remover_tag` → `notificar_pessoa` → `anexar_rascunho` → `mover_card` (com `enviar_whatsapp` sempre perguntado) → `arquivar_card` | um degrau por semana, por operador |
| 25/10 **(provisória)** | `.claude/settings.json` não muda nesta etapa (L3/L4 continuam fora do `allow`) | o pedido de permissão do Claude Code segue como terceira trava |

## Ordem de execução
### 0. Refinar o plano lendo o código e medindo (antes de tudo)
- Conferir que houve uso real: `node -r dotenv/config scripts/op-relatorio.mjs --dias=7` e o painel. **Se houver menos de 50 pedidos (fora conversas) de pelo menos 2 operadores, pare aqui**: registre os números e remarque a etapa (o semáforo ficaria todo amarelo).
- Ler `canRun` (`op/policy.ts`), `op/switches.ts` (cache, `isToolEnabled`), a rota `app/api/op/tools/[tool]/route.ts` e o catálogo (`permitido`), `OpSwitchesPanel.tsx`.
- Medir (READ ONLY, script temporário em `scripts/`): logs dos cards conduzidos no período (linhas, `EXPLAIN` com `userId = ANY(...)` + `createdAt`); taxa de `estado_mudou` e `noop` reais; se algum `desfeito` aparece à mão em 3–5 casos (conferir com `listar_historico`). Registrar em "Ajustes do passo 0" no fim deste arquivo.

### 1. Puros (`app/_shared/utils/op-autonomy.ts`)
- `isUndo(execucao, logsDepois)` (pares inversos por ferramenta), `autonomyVerdict(stats, limiares)` → `{ cor: "verde"|"amarelo"|"vermelho", razoes: string[] }`, `AUTONOMY_THRESHOLDS` (os limiares acima, num lugar só), ordem de abertura sugerida.

### 2. Lib (`app/_shared/lib/op/autonomy.ts`)
- `getAutonomyMatrix({ periodo })`: reaproveita `loadOpMetricRows`/`buildOpMetrics` + logs dos cards conduzidos (corte de data, `take` baixo) → linhas operador × ferramenta com números + veredito. Sem `text`/`args`.
- `op_autonomy` em `op/switches.ts`: leitura junto com `op_l3_switches` (mesmo cache; falha de leitura = ninguém liberado), `setOpAutonomy(tool, userId, on, autor)` com log.
- `canRun`/rota: L3 exige interruptor global **e** (lista vazia = como hoje, todos com `op_write` **(provisória: compatível com o que já está ligado)** | lista com gente = só quem está nela). Teste para os dois casos.

### 3. Tela
- Aba/bloco **"Autonomia"** na seção IA de operação (`manage_team` altera; `manager_dashboard` vê): matriz com semáforo, razões, número que levou à cor e o botão por célula. L4 na mesma tela, só leitura, com "o que faltaria".
- Action `app/_actions/op/autonomy.ts` (`requirePermission`); erro com mensagem própria; sem poll.

### 4. Skills e auditoria
- `/auditoria-operacao`: seção nova **"Autonomia"** via `gerar_relatorio` `tipo: "autonomia"` (mesmos números; sem texto de prompt).
- Nada muda nas skills de escrita (prévia → "sim" continua).

### 5. Testes, validação, documentação
- vitest: `isUndo` (move de volta, tag tirada, desarquivado, ação de outra pessoa que não é inversa, fora de 24 h), `autonomyVerdict` nas bordas dos limiares, lista vazia × lista com gente no `canRun`, cache/kill switch (global desligado vence a lista), `getAutonomyMatrix` com Prisma mockado (corte de data, só cards conduzidos).
- Fumaça só leitura (`scripts/op-testar-ferramenta.mjs gerar_relatorio '{"tipo":"autonomia"}'`); tela no preview só para ver renderizar.
- `/validar` + `revisor-regras` · `/mapa-atualizar operacao-ia auth-permissoes` · `docs/ai-first/08-resultado-etapa-8.md` + plano da Etapa 9.

## Critérios de aceite
1. A matriz mostra, para cada operador × ferramenta, os números do período, a cor e a razão; com pouco dado é sempre amarelo.
2. Nenhuma liberação acontece sem clique do dono; cada clique grava log e vale em ≤ 15 s; desligar o global desliga todos.
3. Lista vazia = comportamento de hoje (nada quebra no dia do deploy).
4. "Desfeito" bate com o histórico do card em 5 casos conferidos à mão.
5. L4 continua exigindo `aprovo <código>`; a tela de L4 é só leitura.
6. tsc/lint/testes limpos; ferramentas das Etapas 1–7 iguais; sem migration (ou, se o passo 0 exigir, só aditiva pelo `/migration`).

## Riscos
- **Pouco uso real** → decisão em cima de ruído: o volume mínimo e o amarelo existem para isso; o passo 0 pode adiar a etapa.
- **Goodhart**: operador que "evita" o `estado_mudou` não confirmando nada; olhar prévia-sem-execução junto.
- **"Desfeito" com falso positivo** (a pessoa moveu de volta porque o processo andou, não porque a IA errou): mostrar a lista dos casos, não só a taxa; o dono decide.
- **Kill switch com cache**: lista nova vale em até 15 s por instância — mesma régua de hoje.
- **Dado pessoal**: a matriz não precisa de nome de cliente; os casos de "desfeito" mostram nº do card.

## Perguntas para o dono (decididas provisoriamente — confirmar ao acordar)
1. Liberar por **operador × ferramenta** (provisório) ou só por operador (todas as L3 de uma vez, via `op_write`)?
2. Os limiares (≥ 10 execuções, desfeito ≤ 5 %, `estado_mudou` ≤ 10 %, falha ≤ 5 %, ≥ 20 consultas antes da 1ª escrita) fazem sentido? Quer mais rígido no `mover_card`/`arquivar_card`?
3. Janela de 7 dias (mínimo) ou 14?
4. A ordem de abertura (comentar → tags → avisar → anexar → mover → arquivar) bate com o risco que você vê?
5. L4: confirma que **nenhuma** dispensa o `aprovo <código>`? Se um dia sim, só e-mail ao hospital do cadastro com modelo fixo?
6. Lista vazia = todos com `op_write` (provisório, compatível com hoje) ou lista vazia = ninguém (mais seguro, mas desliga o que você já tiver ligado)?
7. Quem além de você deveria receber `op_write`/`op_approve` primeiro (para o piloto da semana)?
8. Pôr alguma L3 no `allow` do `.claude/settings.json` da máquina de um operador experiente (tira o pedido de permissão do Claude Code, mantém prévia + "sim")? (provisório: não)
