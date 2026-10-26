# AI-First — decisões do dono (26/10/2026) e plano dos ajustes

> **Comece aqui num chat novo** para implementar a parte "A fazer". Leia: este arquivo → `docs/ai-first/RESUMO-NOITE-25-10.md` → `docs/ai/operacao-ia.md` → o mapa do domínio de cada item. Regras do repo valem (`CLAUDE.md`; `/plano`, `/migration`, `/validar`, `/mapa-atualizar`). **Banco = produção.** As telas da IA de operação estão no branch `ia-operacao-telas` (o dono refaz o frontend): nesta rodada, **só backend, skills e docs** — nada em `app/nova-dash/**` nem `*.tsx`.

## Respostas do dono (substituem as provisórias das Etapas 3–8)
| # | tema | decisão | estado |
|---|---|---|---|
| 1 | `op_write` | liberado para a equipe toda (ADMIN, ADMIN+, ADMIN++) | ✅ feito (`ROLE_DEFAULTS`) |
| 2 | `op_approve` | só ADMIN++ ou quem receber a permissão por override | ✅ já era assim |
| 3 | liberação | tudo de uma vez por pessoa (via `op_write`), não por ferramenta | ✅; Etapa 8 por ferramenta × operador **cancelada** |
| 4 | escopo da IA | a IA deve poder fazer "quase tudo" que a equipe faz: editar, excluir, mover, pegar arquivos, enviar mensagem, além de sugerir. O dono já pôs as ferramentas no `allow` | A fazer (A) |
| 5 | painel de rendimento | quem tem a Visão do Gestor vê tudo; cada operador vê o **próprio** | A fazer (B), backend; a tela fica com o dono |
| 6 | remetente SES | o `SES_FROM_EMAIL` atual | ✅ já é o padrão |
| 7 | cc | sem cc; o registro de **quem pediu** cada envio fica guardado (já fica em `op_approvals`/`op_tool_calls`/log `op_send`) e a IA deve saber responder "quem pediu isso?" | conferir em (A) |
| 8 | aprovação | digitar `aprovo <código>` | ✅ |
| 9 | e-mail para endereço digitado | pode, com aviso | ✅ |
| 10 | WhatsApp | **qualquer tipo** de mensagem/template, desde que aprovada pelo operador | A fazer (C) |
| 11 | WhatsApp no inbox | "mensagem automática" | ✅ |
| 12 | L4 sem aprovação | nunca | ✅ |
| 13 | KIT do contrato | operador escolhe pelo nome | ✅ |
| 14 | ZapSign | conta única; avaliar depois uma VM rodando o navegador enquanto o operador espera | adiado pelo dono |
| 15 | cadastro | a IA **pode preencher e editar** campos do card. Campo vazio: grava direto (com a prévia normal). Campo já preenchido: mostra antes → depois e valida com o operador | A fazer (D) |
| 16 | data da procuração | sempre horário de Brasília (Curitiba) | ✅ feito (`gerarProcuracaoById` usa `brDateBR`) |
| 17 | rascunho | sem interruptor, só S3, 7 dias, só quem preparou anexa | ✅ |
| 18 | retenção | dados da operação por IA: **3 meses no banco**; o mais antigo vai para **backup no S3** a cada 3 meses, consultável lá | A fazer (E) |
| 19 | prompts de desenvolvimento | **nenhum** deve aparecer na operação | A fazer (F) |
| 20 | fluxos | 14 dias = abandonado; **pode retomar fluxo de colega** (o caso passa por vários operadores) | A fazer (G) |
| 21 | progresso | **tabela própria** (`op_workflows`) | A fazer (H) |
| 22 | `/varredura` | fica com as 2 colunas; o dono revisa depois | ✅ |
| 23 | "tempo" e "ação" | sem regra de intervalo (o operador pede o que quiser, quando quiser); preparar documento conta como ação | A fazer (I) |
| 24 | Etapa 8 | substituída pelas decisões 1 e 3 (liberação já é geral); fica só o acompanhamento pelo painel | ✅ |

## A fazer (uma sessão, no ciclo implementar → revisar → testar → documentar → commit local)
- **A. "IA faz quase tudo"** — mapear o que a equipe faz no site e que a IA ainda não faz, e criar as ferramentas que faltam com o contrato existente (L3 prévia + `previa_hash`; reversível = L3; irreversível ou para fora = L4 com `aprovo <código>`):
  - mover documento de pasta, renomear documento, mandar documento para a lixeira e restaurar (lixeira = reversível, L3);
  - editar/apagar comentário próprio da IA; concluir/dar ciência em tarefa da Caixa de Menções;
  - "pegar arquivos": `listar_documentos` já dá o link; conferir se baixar o zip de uma pasta faz falta;
  - excluir card e arquivar em destino destrutivo: **L4** (aprovação digitada), nunca L3;
  - ferramenta de leitura "quem pediu" (de um envio, de uma aprovação, de uma ação no card), para a decisão 7.
  - Cada ferramenta nova nasce **desligada** e o dono liga pelo `scripts/op-interruptores.mjs`.
- **B. Rendimento próprio** — `gerar_relatorio` e as actions de `app/_actions/op/metrics.ts` aceitam o operador ver **só o próprio** sem `manager_dashboard` (com: tudo); skill `/meu-rendimento` ou bloco no `/meu-dia`.
- **C. WhatsApp qualquer tipo** — tirar a trava "só UTILITY" de `preparar_whatsapp`. **Mantêm-se** (regra do repo, as duas WABAs já levaram aviso de spam): opt-out, opt-in, cooldown, marcapasso, janela de 24 h (fora dela só template `APPROVED` da WABA do contato), `templatesPaused`. A prévia passa a avisar quando o template é MARKETING.
- **D. Editar cadastro** — ferramenta `editar_cadastro` (L3): campos permitidos por lista (os da procuração/pedido + contato), normalização igual à do `updateUser` (CPF/telefone/CEP; nome propaga para o `WhatsAppContact`), prévia por campo marcando "vazio → valor" e "**valor antigo → novo** (confirmar)", log `update` com diff de/para "(via IA)". Nunca: senha, `senha_inss`, `role`, `status` do checklist (manda WhatsApp ao cliente — continua fora).
- **E. Retenção 3 meses + backup S3** — script `scripts/op-backup-retencao.mjs` (dry-run / `--apply`): exporta para o S3 (`operacao-backup/AAAA-trimestre/*.jsonl.gz`) `op_requests`, `op_tool_calls`, `op_approvals` (e `op_workflows`) com mais de 90 dias, confere a contagem e **só então** apaga do banco; cron trimestral opcional, com `CRON_SECRET`. Leitura do backup: script que lista/baixa por período. Logs `move` e histórico do card **não** entram (nunca purgados).
- **F. Sem prompt de desenvolvimento** — o hook grava o prompt; um prompt sem ferramenta `crm-op` nem skill de operação é **apagado** depois de 1 h (cron/rotina) e nunca aparece no painel, relatório nem auditoria. Avaliar também não gravar quando o `cwd` não é o repo de operação.
- **G. Retomar fluxo de colega** — `fluxos_abertos`/`retomar_fluxo` listam e retomam fluxos de qualquer operador do mesmo card (com o nome de quem começou); o registro passa a ter "quem continuou".
- **H. Tabela `op_workflows`** — migration aditiva (`/migration`), migrar `salvar_progresso`/`fluxos_abertos`/`retomar_fluxo` de `op_requests.state` para ela (sem perder fluxo aberto: copiar os que houver).
- **I. Métricas** — tirar a regra de "intervalos ≤ 30 min" do tempo (decidir: só latência das ferramentas, ou remover o número); "ação" continua incluindo L2.

## Travas
Nada enviado em teste; ferramenta nova desligada; migration só aditiva; nenhum arquivo de tela (`app/nova-dash/**`, `*.tsx`) nem os arquivos locais do dono; commit local sem push.
