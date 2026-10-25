# AI-First — Etapa 5: plano de execução (comunicação aprovada: e-mail ao hospital e WhatsApp ao cliente com aprovação L4)

> **Comece aqui num chat novo.** Leia, nesta ordem: este arquivo → `docs/ai-first/04-resultado-etapa-4.md` (o que existe, perguntas abertas) → `docs/ai/operacao-ia.md` (API/MCP, contrato L3 com prévia, ferramentas de documento, `op_requests` gravado pelo hook) → `docs/ai/whatsapp-bot.md` (multi-número, `sendSystemWhatsApp`, opt-out, cooldown, templates por WABA, `templatesPaused`) → `docs/ai/documentos-ia.md` (`sendEmailAws`, S3) → `docs/ai/data-model.md` (GHOST, migrations). Contexto de negócio: `docs/ai-first/00-diagnostico-etapa-zero.md` §6.3 (L4), §7 (`preparar_email`, `preparar_whatsapp`, `executar_aprovado`), §8 linha 5 e §10 (decisões 9, 11, 13, 14). Regras do repo valem integralmente (`CLAUDE.md` raiz; skills `/plano` `/migration` `/validar` `/mapa-atualizar`). **Banco = produção. Esta é a primeira etapa que manda coisa para FORA** (e-mail SES, WhatsApp Meta): todo teste de envio é para endereço/telefone do próprio dono, com interruptor ligado só durante o teste. Escrito em 25/10/2026 por uma sessão autônoma (o dono estava fora): decisões **(provisória)** foram tomadas pelo lado conservador e estão em "Perguntas para o dono" — siga-as, não bloqueie.

## Ponto de partida (25/10/2026)
- Etapas 3 e 4 implementadas e commitadas localmente (**sem push**; o dono publica): L3 com `previewOrExecute` + `previa_hash` + interruptor (`op/switches.ts`), documentos `preparar_*` (L2, rascunho em `op-drafts/`) e `anexar_rascunho` (L3). Skills `/procuracao`, `/pedido-prontuario`, `/contrato` (4b, não testada).
- Nenhuma ferramenta L4: `OP_MAX_LEVEL = 3`; `op_approve` existe em `PERMISSION_DEFS` (padrão só ADMIN++) mas nada o checa.
- E-mail: `sendEmailAws(to, subject, text, html?)` — SES v2 `Simple`, **1 destinatário, sem cc, sem anexo**, remetente `SES_FROM_EMAIL` (hoje só o reset de senha usa).
- WhatsApp: `sendSystemWhatsApp` (opt-out, cooldown, opt-in, janela de 24 h, template APPROVED da WABA do número, `templatesPaused`) e `systemSendBlockReason(contactId)` para saber antes se vai bloquear.
- Hospitais: GHOST (`User.role = "GHOST"`) tem só nome; contato vive no texto das automações de "DISTRIBUIÇÃO DE SOLICITAÇÕES" e nas notas do vault (`consultar_hospital`). `docs/operacao/modelos/email-prontuario.md` ainda é **rascunho** (status `rascunho`, sem texto).
- Registro: todo prompt do operador vira `op_requests` pelo hook `UserPromptSubmit` (texto completo, por sessão) — é a peça que deixa o servidor **provar** a aprovação digitada (ver Decisões).

## Objetivo da etapa
A IA **prepara** a comunicação externa e só envia depois de o operador **digitar a aprovação** no Claude Code; o CRM confere que o conteúdo enviado é exatamente o aprovado. Pergunta que precisa funcionar: *"/prontuario 2342"* → procedimento do hospital (nota/automação) → pedido de prontuário + procuração prontos (Etapa 4) → e-mail montado (destinatário do cadastro do hospital, assunto, corpo do modelo, anexos) → "para enviar, digite **aprovo K7QX**" → operador digita → envio pelo SES → comentário + log no card → "movo para AGUARDANDO PRONTUÁRIO?" (L3).

**Fora desta etapa**: mudar etapa do checklist (`status`) e editar cadastro pela IA (L4 também, mas ficam para a Etapa 6 ou com pedido do dono — ver perguntas), envio em lote, e-mail para quem não é hospital/cliente do card, resposta automática a e-mail recebido.

## Decisões
| origem | decisão | efeito |
|---|---|---|
| diag. §6.3 / §7 | L4 = preparar (`approvalId` + hash canônico) → mostrar → "aprovo" → `executar_aprovado({approvalId, hash})`; argumento alterado = hash diferente = recusa | `OP_MAX_LEVEL = 4`; `canRun` exige `op_approve` no L4 (e `read_only` recusa); `op-registry.test.ts` ganha `ETAPA_5_L4` |
| 25/10 **(provisória)** | **O servidor confere a aprovação digitada**: a preparação devolve um código curto (4 caracteres de um alfabeto sem ambiguidade, derivado do `approvalId`); `executar_aprovado` só roda se existir `op_requests` **da mesma sessão e do mesmo operador**, criado **depois** da aprovação, cujo texto casa `/\baprovo\s+<código>\b/i` | fecha a lacuna da Etapa 3 ("o servidor prova a prévia, não o sim"): o modelo não digita prompt. Sem hook/token na sessão → `aprovacao_nao_digitada` |
| diag. §7 / 25/10 **(provisória)** | tabela nova `op_approvals` (migration **aditiva** pelo `/migration`): `id, operatorId, sessionId, tool, args Json, hash, code, status (pendente/executada/expirada/cancelada), expiresAt, executedAt, result Json, cardId?` | aprovação expira em 30 min; executar duas vezes = noop com o resultado da primeira (idempotência por `approvalId`) |
| diag. §10 dec. 9 | colunas nos GHOST: `hospital_email`, `hospital_telefone`, `hospital_modo` (`presencial`/`email`/`whatsapp`/`portal`), `hospital_obs` — `User`, nullable (migration aditiva) | `consultar_hospital` devolve as colunas; script `scripts/vault-hospitais-para-ghost.mjs` (dry-run padrão, `--apply`) preenche **só** a partir de nota `publicado` com contato único. Nunca `seed-hospitals`/`migrate-hospitals` (apagam GHOST) |
| diag. §10 dec. 11 **(provisória)** | destinatário de e-mail: do `hospital_email` do GHOST do card ou de nota publicada; endereço digitado pelo operador é aceito **só** com aviso "fora do cadastro" na prévia e `metadata.destinoLivre = true` no log | sem cadastro não trava a operação; o dashboard da Etapa 7 vê quem mandou para fora do cadastro |
| 25/10 **(provisória)** | `sendEmailRawAws({to, cc[], subject, text, html?, attachments[{key, name}]})` novo em `aws-messaging.ts` (SES v2 `Raw`, MIME montado no servidor, anexo lido do S3 por key — só `uploads/` do próprio card ou `op-drafts/` do próprio operador); `sendEmailAws` fica igual | nada de anexo pelo body de rota; teto de 10 MB somados (SES aceita 40 MB; folga para base64) |
| 25/10 **(provisória)** | WhatsApp da IA = mensagem ao **contato vinculado ao card**, pela linha do contato (`numberId`), com as travas do `sendSystemWhatsApp` (opt-out, cooldown, janela, template APPROVED da WABA, `templatesPaused`); a prévia já diz o bloqueio (`systemSendBlockReason`) e não deixa preparar o que vai ser bloqueado | nunca afrouxar cooldown/tetos (aviso de spam da Meta nas duas WABAs); texto livre só dentro da janela de 24 h; fora dela, só template por nome exato |
| 25/10 **(provisória)** | toda ferramenta L4 nasce com **interruptor desligado** (mesmo `op_l3_switches`, seção "IA de operação"; `isToolEnabled` passa a valer para `level >= 3`) | dono liga para testar e desliga depois |
| diag. §10 dec. 13 | link do ZapSign (4b) vai ao cliente por `preparar_whatsapp` (L4) | `/contrato` passo 8 passa a oferecer o envio com aprovação |

## Ordem de execução
### 0. Refinar o plano lendo o código (antes de tudo)
- Ler `app/_shared/lib/aws-messaging.ts`, `app/_shared/lib/whatsapp/outbound.ts` (`sendSystemWhatsApp`, `systemSendBlockReason`, `isWindowOpen`), o envio do atendente no inbox (qual função grava a mensagem como do atendente e não como "sistema"), `app/_shared/lib/op/record.ts` (`recordPrompt`, `latestRequestId`), `.claude/hooks/op-prompt.mjs`, `tools/crm-mcp/index.mjs` (header `X-Op-Session`), `app/_shared/lib/op/tools/consultar-hospital.ts`. Conferir se dá para provar a aprovação pela sessão (o `session_id` do hook é o mesmo que o MCP manda?). Registrar os ajustes numa seção "Ajustes do passo 0" no fim deste arquivo.
- Confirmar no código se o envio do atendente aparece no inbox com autor (o WhatsApp da IA deve aparecer como "<nome> (via IA)" na thread, não como bot).

### 1. Dados (migration aditiva, pelo `/migration`)
- `op_approvals` (acima) com índices `(operatorId, createdAt)` e `(status, expiresAt)`.
- `User`: `hospital_email String?`, `hospital_telefone String?`, `hospital_modo String?`, `hospital_obs String?` (só usados em GHOST).
- `migrate diff → db execute → migrate resolve`; apagar a linha `DROP TABLE "discord"`; `npx prisma generate`; `docs/ai/data-model.md`.

### 2. Libs
- `app/_shared/lib/op/approvals.ts`: `createApproval({op, sessionId, tool, args, cardId})` → `{approvalId, code, hash, expiresAt}`; `verifyTypedApproval({approval, op, sessionId})` (consulta `op_requests`); `executeApproval` (status + resultado, idempotente sob advisory lock do `approvalId`). Puro testável em `app/_shared/utils/approval-code.ts` (código curto, regex do "aprovo").
- `aws-messaging.ts`: `sendEmailRawAws` (MIME `multipart/mixed`, `Content-Disposition` com `filename*` UTF-8 — reaproveitar `contentDisposition` de `s3-keys.ts`), nunca lança, devolve `{sent, id, error}`.
- `app/_shared/lib/op/comms.ts`: `prepareEmail`/`prepareWhatsapp` (montam o conteúdo final, validam destino e anexos, devolvem a prévia), `sendApprovedEmail`/`sendApprovedWhatsapp` (despacham + `Comment` no card + log `op_email`/`wa_text` com `authorName "<nome> (via IA)"`, `metadata.source = "op"`, `metadata.approvalId`).

### 3. Ferramentas (`app/_shared/lib/op/tools/`)
| ferramenta | nível | args | devolve |
|---|---|---|---|
| `preparar_email` | L4 (prepara) | `card`, `para?` (padrão: e-mail do hospital do card), `cc[]?`, `assunto`, `corpo`, `anexos[]` (ids de rascunho ou nomes de documento do card) | prévia completa (de, para, cc, assunto, corpo, anexos com tamanho, avisos "fora do cadastro") + `approvalId` + **código** — nada enviado |
| `preparar_whatsapp` | L4 (prepara) | `card`, `texto` **ou** `template` + `variaveis[]` | prévia (linha, contato, janela aberta?, bloqueio de opt-out/cooldown) + `approvalId` + código |
| `executar_aprovado` | L4 (`op_approve`, interruptor) | `approvalId`, `hash` | `aprovacao_nao_digitada` / `aprovacao_expirada` / `hash_diferente` / resultado do envio + estado relido |
| `consultar_hospital` (muda) | L1 | — | + `cadastro: {email, telefone, modo, obs}` do GHOST |
- `tests/op-registry.test.ts`: `ETAPA_5_L4`; nenhuma ferramenta `enviar_*` direta (o teste atual já barra `^enviar`).
- `OpSwitchesPanel`: rótulos de `executar_aprovado` (ou um por canal: `executar_aprovado:email`, `:whatsapp` — decidir no passo 0).

### 4. Skills
- `/prontuario <card>` (13 passos): 1 `obter_card` · 2 `consultar_hospital` (modo, contato, procuração exigida) · 3 `verificar_pendencias` (campos do pedido/procuração) · 4 `preparar_pedido_prontuario` · 5 `preparar_procuracao` se o hospital pede · 6 `anexar_rascunho` dos dois (L3) · 7 modo ≠ e-mail → diz como fazer (presencial/portal/WhatsApp do hospital) e pula para 11 · 8 monta assunto/corpo pelo modelo `modelos/email-prontuario.md` (só se publicado; senão texto padrão da skill, marcado) · 9 `preparar_email` com os anexos · 10 mostra a prévia e pede "digite **aprovo <código>**" · 11 `executar_aprovado` · 12 `comentar_card` / tag PRONTUÁRIO SOLICITADO (L3, se existir) · 13 oferece `mover_card` para a coluna de espera (L3).
- `/contrato`: passo 8 oferece `preparar_whatsapp` com o link de assinatura.
- Bloco "Regras de aprovação" (novo, nas skills com L4): nunca digitar o código pelo operador, nunca reaproveitar código, `hash_diferente` → preparar de novo e mostrar de novo.

### 5. Testes, validação, documentação
- vitest: código curto e regex do "aprovo" (caixa, acento, código errado, código de outra aprovação), `verifyTypedApproval` (prompt antes da aprovação não vale; outra sessão não vale; outro operador não vale), hash muda com qualquer campo (para, cc, anexo, corpo), expiração, idempotência, MIME do `sendEmailRawAws` (anexo com acento, cc), WhatsApp bloqueado por opt-out/`templatesPaused`/janela fechada sem template.
- Fumaça: prévias contra produção pelo `scripts/op-testar-ferramenta.mjs` (que **não** executa L4 — manter assim). Envio real só pelo dono, no card de teste, para o próprio e-mail/telefone.
- `/validar` + `revisor-regras` (envio só com aprovação conferida, multi-número, opt-out/cooldown intactos, nada no body > 4,5 MB, `runAfterResponse` se algo for depois da resposta, permissões, sem segredo em log).
- `/mapa-atualizar operacao-ia whatsapp-bot documentos-ia data-model` + `docs/ai-first/05-resultado-etapa-5.md` + plano da Etapa 6.

## Critérios de aceite
1. Nenhum envio sem um prompt "aprovo <código>" do mesmo operador, na mesma sessão, depois da preparação; o modelo chamando `executar_aprovado` sozinho → `aprovacao_nao_digitada`.
2. Qualquer mudança em para/cc/assunto/corpo/anexos/texto/template depois de preparar → `hash_diferente`; aprovação vencida (30 min) → `aprovacao_expirada`.
3. Executar duas vezes = um envio só.
4. WhatsApp: opt-out, cooldown, janela de 24 h, template só APPROVED da WABA do número do contato, `templatesPaused` — todos barram já na prévia.
5. E-mail sai do `SES_FROM_EMAIL`, com anexos lidos do S3 (nada pelo body), e vira comentário + log no card com quem aprovou.
6. Interruptor desligado esconde `executar_aprovado`; `op_approve` ausente → `sem_permissao`; `read_only` recusa.
7. GHOST com `hospital_email` preenchido só por nota publicada (dry-run do script mostra antes).
8. tsc/lint/testes limpos; `consultar_hospital` continua respondendo igual quando as colunas estão vazias.

## Riscos
- **Reputação do remetente SES** (e-mail para hospital caindo em spam ou bounce): começar com poucos envios; ver o painel do SES; bounce volta como erro no resultado.
- **Spam na Meta**: as duas WABAs já levaram aviso. Nada de lote, nada de afrouxar cooldown; mensagem da IA conta no mesmo teto.
- **Destinatário errado**: o contato do hospital é texto livre nas automações; por isso só nota publicada preenche o GHOST e endereço livre aparece destacado na prévia.
- **Prova da aprovação depende do hook**: sem `CRM_OP_TOKEN` na máquina ou com o hook falhando, não há `op_requests` e nada é enviado (falha fechada, por desenho). O hook usa o mesmo token do MCP; um modelo que conseguisse chamar `/api/op/events` com o token forjaria o prompt — os guards de `.env`/ambiente (`guard-secrets`, `guard-bash`) são a barreira; registrar como limitação.

## Perguntas para o dono (decididas provisoriamente — confirmar ao acordar)
1. Aprovação conferida pelo servidor via prompt "aprovo <código>" registrado pelo hook está ok? (alternativa: botão de aprovar no site, mais lento para a equipe)
2. E-mail para endereço digitado no chat (fora do cadastro do hospital) pode sair, com aviso? (provisório: sim, destacado e logado)
3. Qual remetente? `SES_FROM_EMAIL` atual (é o do reset de senha) ou um endereço próprio da operação (ex.: prontuarios@…)? Precisa verificar no SES antes.
4. Cópia (cc) padrão para algum e-mail da equipe em todo pedido de prontuário?
5. WhatsApp da IA: só texto dentro da janela de 24 h, ou também template fora da janela? (provisório: os dois, template só por nome exato e APPROVED)
6. Mudar etapa do checklist (`status`, avisa o cliente) e editar cadastro pela IA entram aqui ou numa etapa própria? (provisório: fora da Etapa 5)
7. Quem recebe `op_approve` além do ADMIN++? (provisório: ninguém até o dono validar)
8. Pendências da Etapa 4 que mudam esta etapa: `/contrato` testada? KIT padrão? ZapSign por operador ou conta única?
