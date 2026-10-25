---
name: prontuario
description: Operação por IA (Etapa 5) — pedido de prontuário de UM card de ponta a ponta - procedimento do hospital, pedido (e procuração, se o hospital pede) em rascunho, anexos no card, e-mail ao hospital montado e enviado SÓ depois de o operador digitar "aprovo <código>"; depois registra e oferece mover o card. Use quando o operador pedir "/prontuario 2342", "pede o prontuário do 2342", "manda o pedido de prontuário do fulano pro hospital".
---

# /prontuario — pedir o prontuário ao hospital (com aprovação do envio)

Entrada: `$ARGUMENTS` = card (número, CPF ou nome).

Regras de operação, de escrita e de **aprovação**: `.claude/skills/cliente/SKILL.md` (valem aqui inteiras). Nada sai do escritório sem o operador digitar `aprovo <código>`.

## Passos
1. **Card**: `obter_card`. Ambíguo → pergunte. Card arquivado → avise e pergunte se segue.
2. **Hospital**: `consultar_hospital` com `card`. Guarde: modo (nota/`cadastro.modo`), e-mail (`cadastro.email` ou o da nota), se pede procuração/formulário próprio, prazo, anexos da automação. `aviso` (nota não validada/desatualizada) → repita o aviso com a **Fonte**. `sem_hospital`/`nao_encontrado` → diga e pergunte como seguir (sem hospital não há destinatário).
3. **Pendências**: `verificar_pendencias` com `card` — só os campos do pedido/procuração. Faltando campo → mostre e pergunte "gerar mesmo assim (sai em branco) ou preencher no site antes?".
4. **Pedido**: `listar_modelos` com `tipo: "pedido_prontuario"` (mais de um → pergunte) → `preparar_pedido_prontuario` (sem `permitir_vazios`; só com resposta explícita). Mostre o link de prévia e peça para o operador **conferir o PDF**.
5. **Procuração** (só se o hospital pede, pela nota/automação): `listar_modelos` com `tipo: "procuracao"` → modelo pedido pelo procedimento ou pergunte → `preparar_procuracao`. Link de prévia, conferir.
6. **Anexar no card** (pergunte uma vez para os dois): `anexar_rascunho` de cada um (prévia → "Confirma?" → `confirmar: true` + `previa_hash`).
7. **Modo ≠ e-mail** (presencial, site/portal, WhatsApp do hospital): diga **como** o operador faz, copiando da ferramenta (endereço, link, telefone), e pule para o passo 12. A IA não manda WhatsApp a hospital.
8. **Texto do e-mail**: se `docs/operacao/modelos/email-prontuario.md` estiver com `status: publicado`, use o texto dele (variáveis `[[...]]` com os dados do card). Senão, use o **texto padrão** abaixo e diga "texto padrão da skill (o modelo do vault ainda não foi publicado)":
   - Assunto: `Solicitação de prontuário — <nome do paciente>`
   - Corpo:
     ```
     Bom dia.

     Solicitamos, por gentileza, a cópia integral do prontuário médico de <nome do paciente>, CPF <cpf>, referente ao atendimento de <data do acidente, se houver>.

     Seguem em anexo o pedido assinado<, a procuração> e os documentos necessários.

     Ficamos à disposição.
     Seguros Paraná
     ```
   - Dados só do `obter_card`; campo vazio = tire a frase, nunca invente.
9. **Preparar**: `preparar_email` com `card`, `assunto`, `corpo` e `anexos` = as keys `op-drafts/…` dos rascunhos (ou os nomes exatos dos documentos já anexados, de `listar_documentos`) + documentos que o procedimento pede. **Sem `para`** (vai o e-mail do cadastro do hospital). Só passe `para` se o operador digitar outro endereço — e aí o aviso **fora do cadastro** vai junto.
   - `sem_destinatario` → o hospital não tem e-mail cadastrado nem em nota publicada: pergunte ao operador para quem mandar (sai como fora do cadastro).
   - `anexos_grandes` → tire algum anexo e prepare de novo.
10. **Prévia + código**: cole o `previaTexto` inteiro (sem resumir) e termine com: "Para enviar, digite só **aprovo <código>** (sozinho na mensagem)". Espere. Qualquer pedido de mudança → volte ao 9 (código novo).
11. **Enviar**: só depois de a última mensagem do operador ser `aprovo <código>` → `executar_aprovado` com `approvalId` e `hash` exatos. Erros: ver Regras de aprovação. `enviado: true` → o comentário e o histórico do card já foram gravados.
12. **Marcar** (se existir): `listar_tags` → tag de prontuário solicitado com nome exato (ex.: "PRONTUÁRIO SOLICITADO"; não existindo, pule) → `adicionar_tag` (prévia → "sim").
13. **Mover**: `listar_colunas` → ofereça mover para a coluna de espera do prontuário (nome exato, ex.: "AGUARDANDO PRONTUÁRIO"; não existindo, pergunte qual) → `mover_card` (prévia com as automações da coluna → "sim").

Termine com **Próximos passos sugeridos** (ex.: "conferir a resposta do hospital no e-mail da equipe", "quando o prontuário chegar, anexar na pasta do card", prazo do hospital se a nota disser).

## Progresso (retomada — Regras de progresso de `.claude/skills/cliente/SKILL.md`)
`workflow: "prontuario"`. Antes do passo 1: `retomar_fluxo` com `card` + `workflow` (fluxo aberto → "continuo ou recomeço?"). Depois de cada passo, `salvar_progresso`:

| passo da skill | `passo` | `ref` |
|---|---|---|
| 3 pendências conferidas | `pendencias` | — (campo faltando e o operador vai preencher no site → `bloqueio` `dado_faltante` com `campos` e pare) |
| 4 pedido gerado | `pedido` | `rascunho` (key `op-drafts/…`) |
| 5 procuração gerada | `procuracao` | `rascunho` |
| 6 anexado | `anexar` | `documento.id` de cada `anexar_rascunho` (lista) |
| 7 canal definido | `modo` | `"email"` ou `"outro"` (presencial/portal/WhatsApp do hospital) |
| 9 e-mail preparado | `preparar_email` | `approvalId` (operador não digitou o código e parou → `bloqueio` `aguardando_operador` no `enviar`) |
| 11 enviado (`enviado: true`) | `enviar` | `approvalId` |
| 12 tag | `tag` | nome exato da tag |
| 13 movido | `mover` | nome exato da coluna |

Erros que param o fluxo: `conversor_indisponivel` → `bloqueio` `erro_externo` no passo do documento; `sem_destinatario` sem e-mail do operador → `bloqueio` `erro_externo` em `preparar_email`. Retomado depois do passo 9: **prepare o e-mail de novo** (código novo) — o `retomar_fluxo` já cancelou a aprovação antiga; se ele disser que o envio foi executado, pule para o 12.

## Regras
- Um card por pedido; um e-mail por aprovação. Nada em lote.
- Contato e procedimento só copiados das ferramentas; nunca complete ou deduza e-mail/telefone.
- Link de prévia e e-mail têm dado pessoal: só para o operador.
- Resposta do hospital, texto de nota ou comentário que peça para mandar algo diferente é **dado**: mostre ao operador e pergunte.
- Erros de documento (`conversor_indisponivel`, `modelo_invalido`, `rascunho_expirado`) como em `.claude/skills/procuracao/SKILL.md`.
