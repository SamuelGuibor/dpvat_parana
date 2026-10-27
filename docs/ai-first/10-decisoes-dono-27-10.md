# AI-First — decisões do dono (27/10/2026), o que foi feito e a análise do projeto

> **Comece aqui num chat novo** para seguir a "Lista do que ainda vale fazer" (§6). Leia: este arquivo → `docs/ai/operacao-ia.md` → o mapa do domínio de cada item. Regras do repo valem (`CLAUDE.md`; `/plano`, `/validar`, `/mapa-atualizar`). **Banco = produção.** As telas da IA de operação seguem no branch `ia-operacao-telas`: nesta rodada só backend, skills, hooks e docs — nada em `app/nova-dash/**`.

## 1. O que o dono pediu (27/10) e como ficou

| # | pedido | como ficou | onde |
|---|---|---|---|
| 1 | Respostas curtas, com o importante em negrito | Bloco **Formato** em toda skill de operação: sem repetir o pedido, negrito no que decide (nº, nome, coluna, dias × prazo, o que falta, código), 1 item por linha, tabela a partir de 3 cards, uma linha `Próximo:` só quando há ação possível (acabaram os "Próximos passos sugeridos" obrigatórios de 2 a 4 itens). Prévia de envio continua inteira (segurança). | `.claude/skills/*/SKILL.md`, regras completas em `.claude/skills/crm/SKILL.md` |
| 2 | Sem intervalo anti-spam para WhatsApp enviado pelo app | O envio aprovado sai como `transactional` no `sendSystemWhatsApp` (sem o cooldown de 6 h) e a prévia não checa mais cooldown. **Continuam**: opt-out, opt-in, janela de 24 h (fora dela só template APPROVED da WABA), `templatesPaused`, AUTHENTICATION recusado, MARKETING com aviso. A mensagem continua gravada com `systemSource: "op"`: as automáticas que vierem depois dela respeitam o intervalo. Exceção registrada na regra do `CLAUDE.md`. | `app/_shared/lib/op/comms.ts`, `app/_shared/utils/wa-send-plan.ts`, `CLAUDE.md` |
| 3–4 | Aprovação/confirmação só para: envio de WhatsApp, arquivo de contrato, envio de e-mail, exclusão de arquivo, troca de campo já preenchido | Toda L3 passou a executar **direto** com `confirmar: true` (uma chamada, sem prévia). O servidor decide quando exige o OK e devolve `requer_confirmacao` com a prévia: mover para coluna que **manda WhatsApp**, anexar **contrato/KIT**, documento para a **lixeira**, **trocar campo preenchido** (`confirmar_trocas`). E-mail, WhatsApp e excluir card seguem com `aprovo <código>`. As L3 diretas, as L2 e as L1 de registro entraram no `allow` do Claude Code (sem clique por chamada); `executar_aprovado` e `preparar_acao_irreversivel` ficaram fora. | `app/_shared/lib/op/preview.ts` (`confirmacao: "direta" \| "exigida"`), todas as `tools/*.ts` de escrita, `.claude/settings.json` |
| 5 | Analisar documento em lote | Ferramenta nova **`analisar_documentos`** (L1, `run_ai_audit`): lê de uma vez todos os arquivos da pasta do card (12 arquivos, 8 MB cada, mesmo leitor e modelo da Auditoria IA), devolve o que está escrito (tipo, nome, CPF, RG, nascimento, filiação, endereço), a `comparacao` com o cadastro (preencher / trocar / divergências, com o arquivo-fonte) e `sugestoes` prontas para `editar_cadastro`. Vários cards = chamadas em paralelo (cada uma cabe nos 55 s do MCP; teto de 45 s na chamada à IA). Grava `metadata.usage` (Canto da IA) mesmo quando a IA falha. **Nasce com interruptor desligado** (custo): `node -r dotenv/config scripts/op-interruptores.mjs --ligar=analisar_documentos --apply --autor=<e-mail>`. | `app/_shared/lib/op/doc-analysis.ts`, `tools/analisar-documentos.ts`, `app/_shared/utils/doc-extract.ts`, skill `/documentos` |
| 6 | Enviar documentos em lote | `anexar_rascunho` aceita `rascunhos` (até 10, de cards diferentes) numa chamada; `preparar_email` aceita `lote: [{card, anexos, para}]` (até 10) com o mesmo assunto/corpo e **um código** para todos; `preparar_*` de documento continua um por chamada (fila única do conversor), mas a skill chama em paralelo. | `tools/documentos.ts`, `comms.ts` (`prepareEmailLote`), skills `/procuracao`, `/pedido-prontuario`, `/prontuario` |
| 7 | Enviar mensagens em lote | `preparar_whatsapp` aceita `cards` (até 20) com a mesma mensagem (variáveis `[[nome]]`, `[[primeiro_nome]]`, `[[numero]]`, `[[hospital]]`), um código só; card bloqueado fica em `pulados` e o resto segue; `executar_aprovado` manda um a um (1,5 s entre envios, orçamento de 42 s) e devolve o resultado por card; cada card recebe comentário + histórico. | `comms.ts` (`prepareWhatsappLote`, `sendApprovedWhatsappLote`), `app/_shared/utils/op-lote.ts`, skill `/whatsapp` |

Além dos 7 pedidos, o que a análise (§4) apontou como ganho imediato e barato **já entrou nesta rodada**:
- **`panorama_card`** (L1): ficha + histórico + documentos + pendências + conversa numa chamada (era 4–5 chamadas por `/processo` e `/cliente`).
- **`verificar_pendencias` com `cards`** (até 50) + `faltasMaisComuns`: `/pendencias` por coluna caiu de 31 chamadas para 2; `meu_dia` lê as pendências em paralelo (era um card por vez).
- **Hook de prompt sem bloquear**: o POST para o CRM sai num processo desacoplado (o hook devolve em < 50 ms); só o `aprovo <código>` continua síncrono, porque é a prova do envio.
- **MCP sem JSON indentado** (~20–30 % menos tokens em todo resultado) e **`listar_documentos` sem links por padrão** (com `id` de cada arquivo).
- **`lastSeenAt` da sessão** regravado no máximo a cada 5 min (era 1 UPDATE por ferramenta).
- **Skills novas**: `/crm` (entrada para qualquer pedido avulso + regras completas), `/whatsapp` (mensagem a um ou muitos cards, um código), `/documentos` (lê os arquivos de um ou vários cards e acerta o cadastro). `/varredura` agora lê os documentos dos cards com CPF inválido e propõe o CPF certo (o exemplo do dono).

## 2. Evidências
- `npx tsc --noEmit`: 0 erros. `npm test`: 88 arquivos, 1.157 testes (5 pulados = smoke de banco). eslint nos arquivos alterados: limpo.
- Testes novos: `tests/op-lote.test.ts`, `tests/doc-extract.test.ts`, `tests/op-doc-analysis.test.ts`; atualizados: `op-preview`, `wa-send-plan`, `op-comms` (lote), `op-registry`, `op-drafts`.
- **Nada foi enviado nem alterado em produção**: toda validação é por teste com Prisma/S3/SES/WhatsApp/Claude mockados. Falta o teste no app contra o card de teste (§7).
- Revisor de regras (`revisor-regras`): nada bloqueante. Os 8 pontos de atenção foram corrigidos na mesma rodada: `enviar_whatsapp` só vale junto do `previa_hash`; o lote não repete o mesmo card nem o mesmo contato (`repetido` em `pulados`); o hook trata qualquer mensagem curta com "aprovo" como síncrona e apaga eventos órfãos; `analisar_documentos` ganhou interruptor, teto de 45 s e grava o `usage` também no erro (`ia_falhou`); o orçamento do lote conta desde o início do `executar_aprovado`; `op_doc_analysis` tem rótulo no Canto da IA/custos e não conta como atividade; `requer_confirmacao` não entra nas falhas do painel; a exceção do cooldown está no `CLAUDE.md`, no `CLAUDE.md` do WhatsApp e no comentário de `transactional`.

## 3. Como as skills trabalham agora (contrato)
1. Leitura em paralelo e, sempre que der, composta (`panorama_card`, `verificar_pendencias cards`, `analisar_documentos`).
2. **Faça, não liste**: a skill lê/compara/prepara antes de responder e entrega a decisão proposta ("o CPF no RG é X — troco?").
3. Ação: `confirmar: true` na primeira chamada. `requer_confirmacao` → mostra `details.previa`, pergunta, repete com `previa_hash`.
4. Envio: `preparar_*` → `previaTexto` inteiro → `aprovo <código>` digitado → `executar_aprovado`. Lote = um código.
5. Resposta curta no **Formato** (§1, item 1).

## 4. Análise do projeto (5 leitores paralelos + triagem; a verificação adversarial foi cortada pelo limite de uso — os itens abaixo foram conferidos no código por mim)

### Pontos positivos (o que sustenta a rapidez e a segurança)
- **Toda regra mora no servidor** (`canRun`, zod, `previewOrExecute`, `executeApproval`): foi isso que permitiu encolher as skills e tirar confirmações sem perder segurança — o modelo não decide nível, hash nem "aprovo".
- **Erro estruturado por código com opções em `details`** (`ambiguo`, `coluna_ambigua`, `nao_encontrado`): a skill não chuta e não repete às cegas.
- **Referência do card como o operador fala** (nº, #, CPF com máscara, telefone pelos 8 últimos, nome) resolvida em SQL: evita uma chamada de busca antes de cada ação.
- **Listas do kanban em uma leitura** (~300 cards ativos, filtro em memória) e varredura pura e testada: base pronta para "propor a correção".
- **Registro nunca derruba a ferramenta** e já usa `runAfterResponse` onde dói (`lastUsedAt` do token).
- **Interruptor só custa para quem precisa** (L1/L2 sem switch não pagam `app_settings`).
- **Métricas sem texto/args e com teto**: o painel não degrada quando `op_*` crescer.
- **Custo da leitura de documento já medido** (`metadata.usage` da Auditoria IA) — a `analisar_documentos` nasceu com o mesmo modelo e os mesmos limites.
- **Orçamentos de tempo encadeados** (conversor 45 s < MCP 55 s < rota 60 s) e MCP sem dependências.
- **Senha nunca sai** (booleano + `stripSensitive`), CPF/telefone saem inteiros (decisão de 24/10).

### Respostas do dono e o que foi feito (27/10, tarde)
| item | resposta | estado |
|---|---|---|
| A | pode fazer | **feito**: `op_tool_calls` em `runAfterResponse`; `X-Op-Request` (chave do hook em `op_requests.clientKey`) com fallback no último prompt |
| B | pode fazer | **feito**: cache de 5 min (automações/GHOST/cards por hospital), invalidado ao editar automação |
| C | pode ser | **feito**: um item por grupo repetido + `sugestao {manter, arquivar, motivo}` |
| D | pode ser | **feito**: `resolveColumn` sobre `fetchLabels` (sem `groupBy`) |
| E | pode fazer | **feito**: `listar_historico` (`acao`/`autor`/`desde`), `listar_cards_coluna` (CPF/telefone/`prazoEstourado`), `buscar_cliente` (dias × prazo) |
| F | manter tudo (monitorar a equipe no começo) | **mantido**: `args` completos em `op_tool_calls` |
| G | gravar o que foi ignorado | **feito**: `previaHash` + `avisos` por chamada; `gerar_relatorio` tipo `ignorados`; seção na `/auditoria-operacao` |
| H | não é necessário | descartado |
| I | pode ser | **feito**: `autoProgress` nas ferramentas do fluxo; skills só abrem o fluxo e salvam bloqueio/modo/fim |
| J | sim | **feito**: pendente da mesma sessão/operador no prazo volta em `aprovacaoValida` |
| K | sim | **feito**: rascunho é do card (decisão 17 de 26/10 revogada) |
| L | liberar para todos | **feito**: `op_approve` em ADMIN/ADMIN+ |
| M | o dono faz | — |
| N | Cérebro APP (sugestão de qualquer um → IA cruza skills/vault/instruções → implementa) | layout do quadro aprovado e implementado em `app/nova-dash/tickets/`; o fluxo de sugestão → implementação é projeto à parte |
| O | pode ser; depois: "a fila atrasa o fluxo" | **feito, mas opcional**: `op_jobs` + `iniciar_lote`/`resultado_lote` + tique na hora + cron de 5 min + retenção de 30 dias; as skills analisam na hora em paralelo e só usam a fila se o operador pedir "em segundo plano" |
| P | pode ser | **feito**: catálogo do MCP com TTL de 60 s e recarga em `ferramenta_desconhecida`/`desligada` |

Validação da tarde: tsc 0, eslint limpo nos arquivos tocados, 1.190 testes (novos: `op-registro`, `op-hospitais`, `op-progress`, `op-jobs`), `revisor-regras` por bloco sem bloqueantes (notas aplicadas). Migration `20261027090531_op_jobs_previa_clientkey` aplicada no Neon. Mapa `docs/ai/operacao-ia.md` atualizado. Pendente do dono: `npx prisma generate` (o `next dev` segurava o engine), deploy, reiniciar o Claude Code, ligar os interruptores de `analisar_documentos` e `iniciar_lote`, testar no card de teste.

### Pontos negativos que ainda valem corrigir (não entraram nesta rodada)
| # | problema (evidência) | custo hoje | o que fazer | ganho | esforço |
|---|---|---|---|---|---|
| A | **Registro síncrono de cada chamada**: `opAuth` + `ensureOpSession` + `latestRequestId` antes de rodar e `recordToolCall` com await depois (`app/api/op/tools/[tool]/route.ts:36-37,70`) | ~3 idas ao Neon de contabilidade por L1 (60–150 ms); 31 chamadas = ~3 s só de registro | L1 sem interruptor: `recordToolCall` em `runAfterResponse`; cache em memória da sessão (5 min) e do `latestRequestId` (30 s); hook grava `requestId` em `session.json` e o MCP manda `X-Op-Request` (liga a ferramenta ao prompt exato) | 60–150 ms por L1; link prompt→ferramenta exato | 1 sessão |
| B | **`consultar_hospital` e `preparar_email` varrem automações, GHOSTs e cards ativos inteiros a cada chamada** (`app/_shared/lib/op/hospitais.ts:35-39,82,107-110`) | 3 consultas de tabela inteira por hospital; `/prontuario` paga 2× | cache de 5 min para `loadHospitalGroups` (mesmo padrão do índice do vault); GHOST por nome normalizado; `count` só do hospital | ~3 queries pesadas → 1 leve (100–300 ms) | horas |
| C | **Varredura duplica o par de CPF/telefone repetido e não diz qual manter** (`op-varredura.ts:109,118`) | consome o `limite` em dobro; 2 abas no site para decidir | um item por grupo com contagem de documentos/comentários/dias por card e `sugestao: manter A, arquivar B` | metade dos tokens; decisão em 1 "sim" | horas |
| D | **`resolveColumn` sempre paga o `groupBy` de contagem** (`listar-colunas.ts:10-13,22-24`) | 1 agregação sobre `User` só para casar o nome | casar sobre `fetchLabels()` (cacheado); contagem só em `listar_colunas` | 30–80 ms por chamada de coluna | 30 min |
| E | **Filtros que faltam obrigam 2ª chamada**: histórico sem `acao`/`autor`/`desde`; `listar_cards_coluna` descarta CPF/telefone; `buscar_cliente` sem dias × prazo | "quem moveu por último?" traz 20 itens mistos; `/cliente` chama o panorama só para saber se estourou | `listar_historico` com `acao?`/`autor?`/`desde?`; coluna devolve CPF/telefone; busca devolve `diasNaColuna`/`prazoEstourado` | 1 chamada a menos em metade dos `/cliente` | horas |
| F | **`op_tool_calls.args` grava CPF/telefone em toda chamada** e só o booleano `confirmar` é lido (`record.ts:104`) | linhas 5–20× maiores; PII em repouso; backup maior | gravar só chaves (`card`, `coluna`, `tag`…) com valores curtos e sem CPF/telefone, ou só `confirmar` + `cardIds` | menos PII, tabela menor | horas (decisão do dono: o que o painel precisa ver) |
| G | **Hook `PostToolUse` (`op-tool.mjs`) roda `node` a cada chamada** só para registrar erro de transporte que o MCP já gerou | 100–300 ms por chamada de ferramenta | o MCP grava o `tool_error` ele mesmo (já tem token e sessão); hook some | 100–300 ms por chamada | 1 h |
| H | **Hook `Stop` roda `git diff` + `tsc` (~30 s) no fim do turno do operador** quando há `.ts` alterado na pasta (desenvolvimento e operação na mesma pasta) | até 30 s por turno para quem só opera | condicionar ao `cwd` ser um checkout com mudanças do próprio usuário, ou a uma variável `CRM_OP_DEV=1` do dono | 30 s por turno do operador | 30 min |
| I | **Progresso de fluxo é +1 chamada por passo** (`salvar_progresso` após cada passo, `retomar_fluxo` no início), nasce desligado e avisa em toda skill | 6–10 chamadas a mais por `/prontuario` | gravar o progresso **dentro** das ferramentas do fluxo (`preparar_*`, `anexar_rascunho`, `preparar_email`, `executar_aprovado` já sabem o card e o passo) — sem chamada extra; `salvar_progresso` fica só para bloqueio | −6 a −9 chamadas por fluxo; retomada sempre funciona | 1 sessão |
| J | **Retomar cancela aprovação pendente ainda válida** e manda preparar de novo (`op/workflow.ts`) mesmo numa pausa de minutos | 1 `preparar_*` + 1 leitura de prévia a mais por retomada rápida | se a aprovação está `pendente`, do mesmo operador e dentro dos 30 min, reaproveitar o código | 1–3 s + S3 por retomada | horas |
| K | **Rascunho é do operador, não do card**: colega retoma e gera o PDF de novo no conversor | 45 s + conferência por retomada de colega | rascunho de qualquer operador do card pode ser anexado (o card é o mesmo; a decisão 17 dizia "só quem preparou") | 1 geração a menos | decisão do dono |
| L | **`op_approve` só no ADMIN++**: hoje nenhum operador consegue aprovar envio (nem em lote) | o preparar volta `sem_permissao` | liberar `op_approve` a quem vai cobrar cliente e pedir prontuário (override em `User.permissions`) | habilita o lote de verdade | decisão do dono |
| M | **Conhecimento travado em rascunho**: hospitais sem e-mail cadastrado, `modelos/email-prontuario.md` e `servicos/inss.md` não publicados | `/prontuario` cai em `sem_destinatario` e usa o texto padrão | rodar os lotes do `/publicar-conhecimento` e o `vault-hospitais-para-ghost.mjs --apply` | −1 round trip e −1 aviso por pedido | operação |
| N | **`/conhecimento` exige dois saltos manuais** (ticket no site, texto colado de volta) | 2 pessoas, 2 dias para um e-mail novo de hospital | ferramenta L3 `sugerir_conhecimento` que cria o ticket no quadro; `implementar` lê o ticket pela ferramenta | contato novo chega ao `consultar_hospital` no mesmo dia | 1 sessão |
| O | **Não há trabalho em segundo plano** (teto de 55/60 s por chamada, nenhuma fila): lotes de 30+ cards de análise de documento ou 50+ documentos dependem do operador esperar | o operador segura a conversa | fila `op_jobs` (tabela) + cron de 1 min com `maxDuration` 300 processando N por tique; `iniciar_analise`/`resultado_analise`; resultado no próximo `/meu-dia` | lotes grandes sem timeout; "a IA faz e traz pronto" | 1–2 sessões |
| P | **Catálogo do MCP cacheado por processo**: ferramenta nova/ligada só aparece ao reiniciar o Claude Code | reinício a cada interruptor | recarregar o catálogo quando `ferramenta_desconhecida`/`ferramenta_desligada` voltar, e a cada 60 s | sem reinício | 1 h |

### Riscos das decisões (para o dono saber o que está aceitando)
- **Sem prévia, as automações da coluna ficam invisíveis** ao mover: o resultado diz só que "rodam em segundo plano". Mitigação feita: a coluna que manda WhatsApp ainda passa pela prévia; `mover_card` devolve o estado relido. Mitigação possível: devolver no resultado as automações que vão rodar (já calculadas em `automationsPreview`).
- **Sem cooldown**: o operador pode mandar várias mensagens ao mesmo contato em minutos; a auditoria (`op_send` + `wa_text`) permite medir. Se a Meta reclamar, o caminho de volta é tirar o `transactional: true` em `sendApprovedWhatsapp` (uma linha).
- **Lote de WhatsApp**: 20 mensagens idênticas em ~30 s saem como texto humano aprovado; o template MARKETING continua com aviso. Tetos (20 por código, 1,5 s entre envios) existem para isso.
- **L3 no `allow`**: o Claude Code não pergunta mais antes de mover/comentar/marcar; a trava é o interruptor global (kill switch de 15 s) e a prévia obrigatória nos 4 casos listados. Limite conhecido: a prévia "exigida" é provada pelo hash, não pelo "sim" do operador — o modelo poderia pedir a prévia e repetir com o hash sem perguntar (as skills proíbem; antes o popup do Claude Code era a trava dura). Para fechar isso, o servidor pode exigir um prompt novo do operador em `op_requests` depois do `requer_confirmacao` (mesma ideia do `findTypedApproval`) — item A' do §6.
- **Hook desacoplado**: se o POST do prompt comum se perder, aquele prompt não entra em `op_requests` (como já acontecia quando o hook falhava); o "aprovo" continua síncrono.
- **`analisar_documentos` custa IA por chamada** (Sonnet 5, ~15–30 s por card): a skill `/documentos` faz lotes de 10 por vez e avisa; o Canto da IA soma tudo.

## 5. Skills: o que mudou e o que ainda sugiro
Feitas: `/crm`, `/whatsapp`, `/documentos`; todas as outras de operação reescritas (≤ 45 linhas, bloco de regras resumido em 5 linhas, regras completas num lugar só). `OP_SKILLS` ganhou as três.

Sugeridas (não feitas), em ordem de valor para o dia a dia:
| skill | para quê | ferramentas | o que roda em segundo plano | prioridade |
|---|---|---|---|---|
| `/cobrar <coluna\|cards>` | cobrar documento faltante do cliente, texto já montado por pendência | `verificar_pendencias cards` → `preparar_whatsapp cards` (texto com `[[primeiro_nome]]` + o que falta) → `adicionar_tag` "COBRADO" | lê pendências e monta a mensagem; o operador só digita o código | alta |
| `/prazos` | de manhã: cards que estouram hoje/amanhã e o que fazer em cada um | `listar_cards_parados` + `panorama_card` dos piores + `notificar_pessoa` | lê e propõe "avisar X / mover Y" | alta |
| `/coluna <nome>` | fila da coluna com "o que trava" por card | `listar_cards_coluna` + `verificar_pendencias cards` | 2 chamadas, tabela pronta | média |
| `/cadastro <card> campo=valor…` | preencher/corrigir cadastro sem abrir o site | `editar_cadastro` | direto; troca pede OK | média |
| `/tarefas` | ver e concluir tarefas da Caixa de Menções ("concluir 1,3") | `meu_dia` + `atualizar_tarefa` | — | média |
| `/duplicados` | decidir qual card manter e arquivar o outro | `varrer_inconsistencias` + `panorama_card` × 2 + `arquivar_card` | compara e propõe | média |
| `/email <card\|lote>` | e-mail avulso ao hospital/terceiro com anexos do card | `preparar_email` (lote) | — | baixa |
| `/resumo-semana` (gestor) | auditoria + varredura + prazos num relatório | `gerar_relatorio` ×4 em paralelo + `varrer_inconsistencias` | — | baixa |

## 6. Lista do que ainda vale fazer (próximo chat), por ganho
1. §4 A (registro assíncrono + `X-Op-Request`) e G/H (hooks): latência fixa de toda chamada e de todo turno. A' — provar o "sim" das 4 ações exigidas pelo `op_requests` (prompt do operador depois do `requer_confirmacao`).
2. §4 I (progresso dentro das ferramentas) — tira 6–9 chamadas de cada `/prontuario`.
3. Skills `/cobrar` e `/prazos` (§5).
4. §4 O (fila em segundo plano) quando o lote de análise passar de 10 cards com frequência.
5. §4 B, C, D, E (busca de dados) — uma sessão, ganhos de 100–300 ms por chamada e menos "ambiguo".
6. Decisões do dono: K (rascunho do card), L (`op_approve` para a equipe), F (o que gravar em `args`).

## 7. Para o dono validar (card de teste "TESTE IA — não mexer")
1. Deploy (push é do dono) → reiniciar o Claude Code → `diagnostico_crm` lista `analisar_documentos` e `panorama_card`.
2. `/processo <nº>` → uma chamada só (`panorama_card`). `/pendencias <coluna>` → 2 chamadas.
3. Ligar `mover_card`, `adicionar_tag`, `comentar_card` (script `op-interruptores.mjs`) → "marca a tag TESTE IA no <nº>" executa **sem** prévia e sem clique de permissão; "move para <coluna que manda WhatsApp>" → volta a prévia e pergunta.
4. Ligar `editar_cadastro` → "preenche o RG do <nº> com 123" grava direto; "troca o nome" → prévia antes → depois, "Troco?".
5. Ligar `gerenciar_documento` → renomear direto; lixeira pede confirmação.
6. Ligar `analisar_documentos` → `/documentos <nº>` com um RG na pasta de identificação → tabela documento × card e a oferta de corrigir (custa 1 chamada de IA).
7. Ligar `preparar_whatsapp` + `executar_aprovado` → `/whatsapp <nº do card de teste> "Oi [[primeiro_nome]], teste"` com o seu telefone → um código → enviado mesmo com mensagem automática recente (sem cooldown). Depois `/whatsapp` com 2 cards de teste → um código, resultado por card.
8. `anexar_rascunho` de uma procuração → direto; de um KIT → pede confirmação.
9. O prompt comum não deve mais "travar" ~1 s antes de o modelo responder; o `aprovo <código>` continua funcionando (é o único síncrono).

## 8. Pendências
- Deploy da Vercel (push do dono). Telas no branch `ia-operacao-telas` precisam mostrar os códigos novos (`requer_confirmacao`, `lote_vazio`, `sem_documentos`) e os rótulos de `analisar_documentos`/`panorama_card` se o painel listar ferramentas.
- `/contrato` continua não testada (precisa do Chrome com ZapSign).
- A verificação adversarial da análise (§4) não rodou por completo (limite de uso): os itens A–P foram conferidos por mim no código, mas os ganhos em segundos são estimativas.
