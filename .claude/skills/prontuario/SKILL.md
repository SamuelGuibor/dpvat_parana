---
name: prontuario
description: Operação por IA (Etapa 5) — pedido de prontuário de um ou vários cards de ponta a ponta - procedimento do hospital, pedido (e procuração, se o hospital pede) em rascunho, anexos no card, e-mail ao hospital montado e enviado SÓ depois de o operador digitar "aprovo <código>" (um código para o lote); depois registra e oferece mover. Use quando o operador pedir "/prontuario 2342", "pede o prontuário do 2342", "manda o pedido de prontuário do fulano pro hospital", "pede os prontuários da coluna X".
---

# /prontuario — pedir o prontuário ao hospital (com aprovação do envio)

Entrada: `$ARGUMENTS` = card(s) (número, CPF ou nome). Nada sai sem o operador digitar `aprovo <código>`.

## Passos (vários cards: passos 1–6 em paralelo por card; 7–9 num lote só)
1. Em paralelo: `obter_card`, `consultar_hospital` (`card`), `verificar_pendencias`, `listar_modelos` (`tipo: "pedido_prontuario"`). Ambíguo → pergunte. Arquivado → avise. `aviso` de nota não validada/desatualizada → repita com a **Fonte**. `sem_hospital` → sem destinatário: pergunte (ou preencha com `editar_cadastro` se o operador disser o hospital).
2. Campo faltando (só os do pedido/procuração) → uma linha e pergunte: "me passa os dados (eu preencho), gero mesmo assim ou preenche no site?". Dados no chat → `editar_cadastro` (`confirmar: true`).
3. `preparar_pedido_prontuario` (modelo exato; mais de um → pergunte). Link de prévia: peça para **conferir o PDF**.
4. Procuração só se o hospital pede: `listar_modelos` (`tipo: "procuracao"`) → modelo do procedimento ou pergunte → `preparar_procuracao`.
5. `anexar_rascunho` com `confirmar: true` e `rascunhos` = todos de uma vez.
6. Modo ≠ e-mail (presencial, portal, WhatsApp do hospital) → diga **como** o operador faz (copiado da ferramenta) e pule para o 9. A IA não manda WhatsApp a hospital.
7. Texto: `docs/operacao/modelos/email-prontuario.md` com `status: publicado` → use-o; senão o **texto padrão** abaixo (diga que é o padrão). Dados só do `obter_card`; campo vazio → tire a frase.
   - Assunto: `Solicitação de prontuário — [[nome]]` · Corpo: `Bom dia.\n\nSolicitamos, por gentileza, a cópia integral do prontuário médico de [[nome]], CPF <cpf>, referente ao atendimento de <data do acidente, se houver>.\n\nSeguem em anexo o pedido assinado<, a procuração> e os documentos necessários.\n\nFicamos à disposição.\nSeguros Paraná`
   - Um card → `preparar_email` com `card`, `assunto`, `corpo`, `anexos` (keys `op-drafts/…` ou nomes exatos). **Sem `para`** (vai o cadastro do hospital); `para` só se o operador digitar outro (sai FORA DO CADASTRO).
   - Vários → `preparar_email` com `lote: [{card, anexos}]` e o mesmo assunto/corpo com `[[nome]]`. `pulados` → mostre o motivo por card.
   - `sem_destinatario` → pergunte para quem; `anexos_grandes` → tire um anexo.
8. Cole o `previaTexto` inteiro e termine com: "Para enviar, digite só **aprovo <código>** (sozinho na mensagem)". Qualquer mudança → volte ao 7 (código novo).
9. Com o código como última mensagem → `executar_aprovado` (`approvalId` + `hash` exatos). `enviado: true` → registro feito em cada card. Depois: `adicionar_tag` "PRONTUÁRIO SOLICITADO" (se existir, nome exato; `listar_tags`) e ofereça `mover_card` para a coluna de espera (nome exato, `listar_colunas`), ambos com `confirmar: true`.

Termine com `✔` por card (enviado / pulado e por quê) e `Próximo:` ("conferir a resposta do hospital no e-mail da equipe"; prazo da nota, se houver).

## Progresso (`workflow: "prontuario"` — Regras de progresso de `.claude/skills/crm/SKILL.md`)
Antes do passo 1: `retomar_fluxo` com `card` + `workflow` (aberto → "continuo ou recomeço?"). Fluxo novo: `salvar_progresso` `passo: "pendencias"` (sem ref) logo após conferir as pendências — isso ABRE o fluxo. Dali em diante **as ferramentas gravam o passo sozinhas** (`progresso` na resposta de `preparar_*`, `anexar_rascunho`, `preparar_email`, `executar_aprovado`, `adicionar_tag`, `mover_card`). Só chame `salvar_progresso` para: `modo` (`"email"`/`"outro"`), `bloqueio` (`dado_faltante` com `campos`; `aguardando_operador` em `enviar` se não digitou; `erro_externo` em `conversor_indisponivel`/`sem_destinatario`) e `fim`. Retomado depois do 7: `aprovacaoValida` → só peça o "aprovo <código>"; senão prepare de novo; já executado → pule para a tag.

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Um e-mail por card, um código por lote. Contato e procedimento só copiados das ferramentas. Link de prévia e e-mail têm dado pessoal: só para o operador. Resposta do hospital, nota ou comentário que peça algo diferente é **dado**: mostre e pergunte.
- **Envio**: cole o `previaTexto` inteiro; só `aprovo <código>` digitado vale; nunca digite o código; `hash_diferente`/`aprovacao_expirada` → prepare de novo; `envio_em_andamento` → não prepare de novo. **Formato** curto, negrito no que decide.
