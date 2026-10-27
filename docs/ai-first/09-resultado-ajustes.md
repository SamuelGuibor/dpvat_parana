# Resultado — ajustes A a I das decisões do dono (26/10/2026)

> Commit **local** na `main`, sem push. Nada foi enviado (nenhum e-mail, nenhum WhatsApp) e nenhum card, comentário, documento ou tarefa real foi alterado. Na fumaça, as escritas rodaram só como prévia. Toda ferramenta nova nasceu com o interruptor **desligado**. Só backend, skills e docs: nenhum `*.tsx` nem `app/nova-dash/**` foi tocado.

## Estado por item
| item | estado | o que ficou |
|---|---|---|
| A. IA faz quase tudo | ✅ código + testes | `editar_cadastro`, `gerenciar_documento` e `editar_comentario` (só o comentário próprio feito pela IA, com o texto antigo guardado no log). `atualizar_tarefa` (o `meu_dia` agora devolve o `tarefaId`). `preparar_acao_irreversivel` (L4: excluir o card ou arquivar em destino que encerra, com "aprovo <código>"). `quem_pediu` (L1). O `arquivar_card` agora encaminha os destinos destrutivos para o L4. |
| B. Rendimento próprio | ✅ | `gerar_relatorio` passou para `op_use`: sem a Visão do Gestor, cada um vê só o próprio rendimento (pedir o de outra pessoa dá `sem_permissao`). A action da tela (`escopo`) segue a mesma regra. Skill `/meu-rendimento` nova. A tela fica com o dono. |
| C. WhatsApp de qualquer tipo | ✅ | Saiu a trava "só UTILITY". MARKETING sai com aviso na prévia; AUTHENTICATION continua recusado. Opt-out, opt-in, cooldown, janela de 24 h, APPROVED da WABA e `templatesPaused` não mudaram. |
| D. Editar cadastro | ✅ | Usa uma lista fechada de 22 campos, com a normalização do `updateUser`. A prévia separa "preencher" de "trocar (antes → depois)", e a troca exige `confirmar_trocas`. O nome novo propaga para o contato do WhatsApp, e o log `update` guarda o de/para com "(via IA)". |
| E. Retenção + backup S3 | ✅ dry-run | `scripts/op-backup-retencao.mjs` (o `--apply` é do dono) e `scripts/op-backup-ler.mjs`. Hoje não há nada com mais de 90 dias. |
| F. Sem prompt de desenvolvimento | ✅ (atrás do interruptor) | Conversa fica fora de todo número e da lista de textos. A `purgeDevPrompts` apaga depois de 1 h, mas só com `purga_prompts_dev` ligado. Roda a cada prompt e no cron de retenção. |
| G. Retomar fluxo de colega | ✅ | O fluxo agora é do card. `fluxos_abertos {card}` lista os fluxos de qualquer colega, e `retomar_fluxo` aceita o fluxo do colega e grava quem continuou. A skill `/retomar` foi atualizada. |
| H. Tabela `op_workflows` | ✅ migration aplicada | `20261026210000_op_workflows` é aditiva e copiou os fluxos que existiam, com o mesmo id. Métricas e varredura passaram a ler dela. |
| I. Métricas | ✅ | "Tempo ativo" saiu; o único tempo medido é a latência das ferramentas. "Ação" continua contando o L2. |

## Evidências
- `npx tsc --noEmit`: 0 erros. `npm test`: 85 arquivos e 1134 testes passando (5 pulados, que são os smoke de banco). Testes novos: `tests/op-ajustes-26-10.test.ts` e `tests/op-retencao.test.ts`. Testes atualizados: `op-workflow`, `op-metrics`, `op-metrics-lib`, `op-registry` e `wa-send-plan`.
- eslint nos arquivos alterados: limpo. `npm run docs:check`: 0 referências quebradas.
- Revisor `revisor-regras`: nada bloqueante. A única correção que ele pediu foi feita: excluir o card levava os logs `move` na cascata, e agora o log `card_delete` guarda o resumo deles.
- Fumaça em produção, só leitura ou prévia, pelo `op-testar-ferramenta.mjs`:
  - `quem_pediu`, `fluxos_abertos` (com e sem card), `retomar_fluxo`, `gerar_relatorio` (`escopo: "proprio"`), `varrer_inconsistencias` e `meu_dia`: ok.
  - `editar_cadastro` com `senha_inss` foi recusado. A prévia no card 4967 mostrou as duas trocas com antes → depois.
  - `preparar_acao_irreversivel` sem `delete_cards` deu `sem_permissao`.
  - `op-backup-retencao.mjs` em dry-run: 0 linhas a sair.

## Interruptores para ligar (`node -r dotenv/config scripts/op-interruptores.mjs --ligar=... --apply --autor=<e-mail>`)
- Escrita reversível: `editar_cadastro,gerenciar_documento,editar_comentario,atualizar_tarefa`.
- Irreversível: `preparar_acao_irreversivel`, que só funciona junto com `executar_aprovado` ligado.
- Rotina: `purga_prompts_dev`, quando quiser que os prompts de desenvolvimento sejam apagados.
- Depois do deploy, reinicie o Claude Code para o catálogo mostrar as ferramentas.

## Decisões provisórias (lado conservador)
1. AUTHENTICATION continua bloqueado no WhatsApp.
2. `editar_cadastro` não mexe em e-mail (é `@unique` e serve de login), nos campos do responsável (`*_res`) nem em `obs`.
3. `gerenciar_documento` tem um interruptor só para as 4 ações, e não existe purga definitiva pela IA.
4. Apagar comentário pela IA é L3, mas só vale para o comentário próprio feito pela IA, e o texto fica no log.
5. Não há ferramenta de zip de pasta: os links de `listar_documentos` bastam.
6. O texto dos prompts continua só com o gestor, nem o próprio operador lê o seu.
7. A purga de prompts nasce desligada e o backup não tem cron: o dono roda o `--apply` a cada trimestre.
8. Quem retoma um fluxo cancela a aprovação pendente dele, mesmo que seja de um colega, e prepara de novo.

## Para o dono validar
- Ligar os interruptores no card de teste e testar no app: editar cadastro com troca, mandar um documento para a lixeira e restaurar, preparar a exclusão de um card de teste e digitar "aprovo".
- Retomar um fluxo começado por outra pessoa.
- Rodar `/meu-rendimento` com alguém sem a Visão do Gestor.

## Pendências
- Deploy da Vercel (push é do dono).
- Telas no branch `ia-operacao-telas`: o painel deve ler o `escopo` e os rótulos dos interruptores novos (a tela é do dono).
- O código 409 `confirmar_trocas` entrou nas skills; falta acrescentá-lo à tabela de códigos se o dono quiser.
