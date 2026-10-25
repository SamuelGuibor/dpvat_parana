# AI-First — Etapa 5: resultado (25/10/2026, implementada e validada localmente; deploy e teste de envio real pendentes)

> Plano: `docs/ai-first/05-plano-etapa-5.md` (a seção "Ajustes do passo 0" no fim registra o que mudou ao ler o código e depois da revisão). Mapa técnico: `docs/ai/operacao-ia.md` (ferramentas de envio L4, fluxo da aprovação, armadilhas), `docs/ai/whatsapp-bot.md` (`source: "op"`), `docs/ai/documentos-ia.md` (`sendEmailRawAws`), `docs/ai/data-model.md` (`OpApproval`, `User.hospital_*`). Próxima etapa: `docs/ai-first/06-plano-etapa-6.md`. Feita por uma sessão autônoma com o dono fora: decisões **(provisória)** abaixo e em "Perguntas para o dono". **Nada foi enviado** (nenhum e-mail, nenhum WhatsApp) nem em teste.

## Estado por passo do plano
| Passo | Estado | Onde |
|---|---|---|
| 0. Refinar o plano lendo o código | ✅ | "Ajustes do passo 0" no fim do `05-plano-etapa-5.md` |
| 1. Dados (migration aditiva) | ✅ **aplicada no Neon** | `prisma/migrations/20261025120000_op_approvals_hospital_contato/` (tabela `op_approvals` + `User.hospital_email/telefone/modo/obs`); `migrate diff` depois = só a linha conhecida da `discord` |
| 1. Backfill do contato nos GHOST | ✅ script · ➖ **não aplicado** (dono) | `scripts/vault-hospitais-para-ghost.mjs` (dry-run READ ONLY; `--apply` só grava coluna vazia). Dry-run de 25/10: 147 GHOST a preencher, 0 conflito, 16 notas sem GHOST |
| 2. Libs | ✅ | `app/_shared/lib/op/approvals.ts`, `app/_shared/lib/op/comms.ts`, `sendEmailRawAws` em `app/_shared/lib/aws-messaging.ts`, puros em `app/_shared/utils/{approval-code,email-mime,wa-send-plan,hospital-contact}.ts`, `hospitalContactFor` em `app/_shared/lib/op/hospitais.ts` |
| 3. Ferramentas | ✅ | `app/_shared/lib/op/tools/comunicacao.ts`: `preparar_email`, `preparar_whatsapp`, `executar_aprovado` (L4, desligadas); `consultar_hospital` devolve `cadastro`; `OP_MAX_LEVEL = 4`, `canRun` exige `op_approve` no L4; rótulos no `OpSwitchesPanel`; log `op_send` com rótulo no `LogsTab` |
| 4. Skills | ✅ · ⚠ **não testadas no app** | `/prontuario` (nova, 13 passos); "Regras de aprovação" em `.claude/skills/cliente/SKILL.md` (as outras apontam para lá); `/contrato` passo 8 oferece o WhatsApp com aprovação; `/hospital` e `/pedido-prontuario` apontam para `/prontuario` |
| Trava no harness | ✅ | `.claude/hooks/bash-rules.mjs`: barra comando que cita o token do app, HTTP direto a `/api/op` e arquivo executado que use o token/rede para `/api/op` (fora do MCP e dos hooks) |
| Revisão | ✅ | `revisor-regras`: 1 bloqueio (migration antes do deploy — aplicada), 4 correções (3 corrigidas, 1 = docs), 5 sugestões (2 aplicadas) — ver Decisões |
| 5. Testes/validação | ✅ local | ver Evidências |
| 5. Docs | ✅ | mapas acima; este arquivo; `06-plano-etapa-6.md` |

## Evidências (25/10/2026)
- `npx tsc --noEmit` 0 erros · eslint nos 32 arquivos alterados/novos 0 · `npm test` **78 arquivos, 1046 testes ok** (novos: `approval-code` 7, `email-mime` 4, `wa-send-plan` 8, `hospital-contact` 4, `op-approvals` 19, `op-comms` 16; `op-policy` +1, `op-registry` +1 com `ETAPA_5_L4`, `guard-bash` +3) · `npm run docs:check` 0 referência quebrada.
- Migration: `prisma db execute` → "Script executed successfully"; `migrate resolve --applied` ok; `migrate diff` depois mostra só `DROP TABLE "discord"` (drift conhecido, não aplicado); `prisma generate` ok. Só `ADD COLUMN` nullable, `CREATE TABLE`, `CREATE INDEX IF NOT EXISTS`. Nenhuma linha gravada em `op_approvals` nem em `User.hospital_*`.
- Fumaça contra produção pelo `scripts/op-testar-ferramenta.mjs` (só leitura; L4 em modo `previewOnly`: nada gravado, sem código, nada enviado):

| caso | resultado |
|---|---|
| `consultar_hospital {"card":"4967"}` | STA TEREZA GUARAPUAVA, nota publicada, `cadastro: null` (colunas vazias: resposta igual à de antes + o campo novo) — 6,3 s |
| `preparar_email` card 4967 + rascunho da Etapa 4 | destino `same@…` tirado da **nota publicada** (aviso "o GHOST ainda não tem cadastro"), remetente `SES_FROM_EMAIL`, anexo de 80 KB com ETag, aviso "card arquivado", `destinoForaDoCadastro: false`, `aprovacao: null` — 5,0 s |
| `preparar_whatsapp` texto, cards 4967/5100/4800 | `linha_inativa` (contato na linha desativada 2323) |
| `preparar_whatsapp` texto, cards 5050/5200 | `janela_fechada` |
| `preparar_whatsapp` template `recuperacao_triagem_1` (5050) | `template_categoria` (é MARKETING) |
| `preparar_whatsapp` template inexistente | `template_nao_encontrado` |
| `executar_aprovado` pelo script | recusado ("só roda … prévia de preparar_* (L4)") |

- **Não rodou contra produção**: um `preparar_whatsapp` que PASSA (precisa de conversa com a janela de 24 h aberta numa linha ativa) e qualquer `executar_aprovado` (por desenho: nenhum envio nesta sessão). Cobertos por teste com mocks (`op-comms`, `op-approvals`).

## Decisões tomadas na implementação
- **Aprovação provada pelo servidor** (provisória, plano): `executar_aprovado` só envia se o ÚLTIMO prompt do operador na mesma conversa, depois da preparação, for `aprovo <código>` sozinho (≤ 120 caracteres; "ok, aprovo K7QX pode mandar" vale; pergunta, citação ou frase longa não). Mais estrito que o plano (que aceitava qualquer prompt depois) — mensagem depois do código = digitar de novo.
- **Reserva atômica no lugar de advisory lock**: pendente → enviando por `updateMany`; `enviando` preso nunca reenvia (o operador confere no card). Falha do canal → `falhou` (prepara de novo).
- **O que sai é o `args` do banco**: o modelo só manda `approvalId` + `hash`; anexos conferidos pelo ETag e contato pela linha antes de enviar (`hash_diferente`).
- **Três interruptores, todos desligados**: `preparar_email` (canal e-mail), `preparar_whatsapp` (canal WhatsApp) e `executar_aprovado`. Envio exige o do canal E o do executar.
- **L4 = `op_use` + `op_write` + `op_approve`** (+ `view_whatsapp` no WhatsApp); `op_approve` segue só ADMIN++ (provisória).
- **WhatsApp pelo `sendSystemWhatsApp` sem mexer nele** (`source: "op"`, `contactId` do card, sem `transactional`): opt-out, cooldown de 6 h, janela, opt-in, template APPROVED da WABA e `templatesPaused` valem de novo no envio. A prévia antecipa tudo (`planWhatsAppSend`) e recusa o que seria bloqueado.
- **Template só UTILITY** (provisória, do revisor): MARKETING foi a causa do aviso de spam; AUTHENTICATION é código de verificação.
- **Contato confirmado** (do revisor): sem vínculo manual no inbox, o telefone do contato tem que ter DDD + 8 últimos iguais ao do card (`contato_nao_confirmado`).
- **WhatsApp da IA aparece no inbox como mensagem automática** (provisória): pôr o nome do atendente na thread mudaria a régua do cron de silêncio e o dono pegajoso. Autor "(via IA)" no log `wa_text`, no comentário do card e no `op_send`.
- **Destino do e-mail**: cadastro do GHOST → e-mail único da nota publicada → senão pergunta. Endereço digitado sai com `destinoLivre` e aviso "DESTINO FORA DO CADASTRO" (provisória). Cópia para a equipe não é "fora".
- **Prévia em texto montada no servidor** (`previaTexto`, do revisor): a skill cola sem resumir, para o aviso de fora do cadastro não sumir.
- **Backfill dos GHOST só pelo dono**: o script não roda `--apply` sozinho; só preenche coluna vazia, nunca sobrescreve.
- **Achados do revisor sem mudança**: limpeza de `op_approvals` (`args` tem dado pessoal) → pendência; 3 interruptores → mantido (o painel explica); `op_send` conta como atividade na Visão do Gestor → mantido (é trabalho do operador); `hospital_obs` sem fonte → fica vazio.

## Para o dono validar (ordem sugerida)
1. Publicar (push da `main` → Vercel; leva junto as Etapas 3 e 4). A migration já está no Neon.
2. Conferir o dry-run e preencher o contato: `node -r dotenv/config scripts/vault-hospitais-para-ghost.mjs` → ler a lista → `--apply`. Depois `consultar_hospital` de um hospital mostra `cadastro`.
3. Reiniciar o Claude Code; `diagnostico_crm` lista as 3 ferramentas novas com `permitido: false` (desligadas). Ligar no Espaço de Trabalho → IA de operação: "E-mail para fora (hospital) — canal" e "Enviar o que o operador aprovou".
4. No card de teste "TESTE IA — não mexer" (criar; com hospital cujo e-mail é o **seu**, ou passe `para` com o seu e-mail — vai como fora do cadastro): `/prontuario <nº>` → pedido em rascunho → prévia do e-mail com código → digitar **outra coisa** antes → `aprovacao_nao_digitada` → `aprovo <código>` → e-mail chega no seu endereço com o anexo (nome com acento certo) → comentário + histórico "Envio (IA)" no card → repetir `executar_aprovado` = noop.
5. Casos de recusa: esperar 30 min → `aprovacao_expirada`; pedir para mudar o assunto depois de preparar → prepara de novo, código novo.
6. WhatsApp (só se quiser, com o **seu** telefone num contato de teste vinculado ao card de teste, janela aberta: mande "oi" antes): ligar "WhatsApp ao cliente — canal" → `preparar_whatsapp` → `aprovo <código>` → mensagem chega; conferir no inbox como "mensagem automática" e o cooldown de 6 h barrando a segunda.
7. **Desligar os três interruptores** depois do teste. Ver o painel do SES (bounce/reclamação).
8. Responder as perguntas abaixo.

## Perguntas para o dono (decididas provisoriamente)
1. Aprovação = o operador digitar `aprovo <código>` sozinho, como última mensagem, conferida pelo servidor — ok? (alternativa: botão no site)
2. E-mail para endereço digitado no chat (fora do cadastro) pode sair, com aviso? (provisório: sim, destacado e logado com `destinoLivre`)
3. Remetente: o `SES_FROM_EMAIL` atual (`contato@…`, o do reset de senha) ou um próprio (ex.: prontuarios@…)? A resposta do hospital vai para esse endereço.
4. Cópia (cc) padrão para algum e-mail da equipe em todo pedido de prontuário?
5. WhatsApp da IA: só UTILITY (provisório) está ok? Texto livre só dentro da janela.
6. WhatsApp da IA no inbox como "mensagem automática" (provisório) ou com o nome do atendente (muda a régua do cron de silêncio)?
7. Mudar etapa do checklist e editar cadastro pela IA: Etapa própria? (provisório: fora da 5 e da 6)
8. Quem recebe `op_approve` além do ADMIN++? (provisório: ninguém)
9. Por quanto tempo guardar `op_approvals` (o conteúdo do e-mail/mensagem)? (sugestão: zerar `args`/`result` das encerradas com 90 dias)
10. Pendências da Etapa 4 (KIT padrão, ZapSign por operador, `/contrato` testada) continuam abertas.

## Pendências e riscos conhecidos
- Deploy, `--apply` do contato dos GHOST e teste de envio real (roteiro acima) — só o dono.
- `op_approvals` sem limpeza (dado pessoal em `args`).
- Modelo `docs/operacao/modelos/email-prontuario.md` ainda em rascunho: a `/prontuario` usa o texto padrão da skill e avisa.
- Prova do "aprovo" depende do hook com o token na máquina; um processo local com o token poderia forjar o prompt — a trava é o `bash-rules.mjs` (texto) + o pedido de permissão do Claude Code (registrado no mapa).
- Duas janelas do Claude Code no mesmo computador: o código digitado na janela "errada" não vale (falha fechada).
- Template com botão de URL dinâmica não é detectado na prévia (o cadastro não guarda os botões): falha na Meta e vira `falhou`.
- O rascunho de teste da Etapa 4 (`op-drafts/cmsp9hqlk0001l904y4fyvnku/1792900329052-11fe030d.pdf`) foi lido (HEAD) de novo na fumaça; nada novo gravado no S3.
- `docs/ai/workspace-equipe.md` (mudanças locais do dono) continua sem a seção "IA de operação".
