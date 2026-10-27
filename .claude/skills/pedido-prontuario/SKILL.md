---
name: pedido-prontuario
description: Operação por IA — prepara o pedido de prontuário (PEDIDO_HOSPITALAR) de um ou vários cards como rascunho em PDF, diz COMO e PARA ONDE mandar ao hospital (procedimento com fonte) e anexa no card. Não envia ao hospital (isso é a /prontuario). Use quando o operador pedir "/pedido-prontuario 2342", "prepara o pedido de prontuário do 2342", "pedido hospitalar do fulano".
---

# /pedido-prontuario — preparar o pedido e dizer como enviar

Entrada: `$ARGUMENTS` = card(s) (número, CPF ou nome).

## Passos
1. Em paralelo: `consultar_hospital` (`card`) e `listar_modelos` (`tipo: "pedido_prontuario"`). `sem_hospital` → diga que o hospital está vazio e pergunte (a IA pode preencher: `editar_cadastro`). Mais de um modelo → pergunte; um só → use.
2. `preparar_pedido_prontuario` (`card`, `modelo`, sem `permitir_vazios`); vários cards em paralelo.
   - `gerado: false` → `camposFaltando` em uma linha e pergunte: "me passa os dados (eu preencho), gero mesmo assim ou preenche no site?". Dados no chat → `editar_cadastro` (`confirmar: true`) → prepare de novo.
   - `gerado: true` → **arquivo** · link (até `linkValidoAte`) · campos em branco.
3. **Como enviar** (só do `consultar_hospital`): canal · contato copiado · pede procuração/formulário? · prazo · **Fonte** (nota validada / automação; aviso de nota não validada ou desatualizada).
4. "Anexo no card?" → `anexar_rascunho` com `confirmar: true` (`rascunhos` para vários). Pasta = `pastaSugerida`.
5. `Próximo:` modo e-mail → "mando ao hospital com aprovação? (`/prontuario <card>`)"; senão, como o operador faz pelo canal acima; "precisa de procuração? (`/procuracao`)"; "movo para a coluna de protocolo?".

## Progresso (`workflow: "pedido_prontuario"` — Regras de progresso de `.claude/skills/crm/SKILL.md`)
Antes do passo 1: `retomar_fluxo` com `card` + `workflow`. Fluxo novo: `salvar_progresso` `passo: "card"` (sem ref) — abre o fluxo. `preparar_pedido_prontuario` e `anexar_rascunho` gravam os passos sozinhos. `salvar_progresso` só para: `gerado: false` e vai preencher → `passo: "pedido"` + `bloqueio` `dado_faltante`; não quer anexar → `fim: "concluido"`. Envio por e-mail começa a `/prontuario` (o rascunho pode ir como anexo pela key).

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Esta skill **não envia**: o e-mail com aprovação é a `/prontuario`. Contato só copiado de `consultar_hospital`; nunca complete e-mail/telefone. Link de prévia só para o operador.
- `conversor_indisponivel` / `modelo_invalido` / `rascunho_expirado` → como na `/procuracao`.
- Só o que as ferramentas devolveram; nunca banco, `.env` ou scripts. **Formato** curto, negrito no que decide, `Próximo:` só com ação possível. Ação = UMA chamada com `confirmar: true`; `requer_confirmacao` → prévia, pergunte, repita com `previa_hash`.
