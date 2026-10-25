---
name: pedido-prontuario
description: Operação por IA — prepara o pedido de prontuário (PEDIDO_HOSPITALAR) de UM card como rascunho em PDF e diz COMO e PARA ONDE mandar ao hospital do card (procedimento com fonte); se o operador quiser, anexa no card. Não envia nada ao hospital. Use quando o operador pedir "/pedido-prontuario 2342", "prepara o pedido de prontuário do 2342", "pedido hospitalar do fulano".
---

# /pedido-prontuario — preparar o pedido e dizer como enviar

Entrada: `$ARGUMENTS` = card (número, CPF ou nome).

## Passos
1. Em paralelo: `consultar_hospital` com `card` e `listar_modelos` com `tipo: "pedido_prontuario"`.
   - Card sem hospital (`sem_hospital`) → diga que o hospital do card está vazio e que o pedido sai sem hospital; pergunte se quer seguir.
   - Mais de um modelo de pedido → mostre e pergunte qual. Um só → use esse nome exato.
2. `preparar_pedido_prontuario` com `card` e `modelo`, **sem** `permitir_vazios`.
   - `gerado: false` → liste `camposFaltando` (hospital, data do acidente, nome da mãe…) e pergunte "gerar mesmo assim (saem em branco) ou preencher no site antes?". A IA não edita o cadastro. Só com "gera mesmo assim" → repita com `permitir_vazios: true`.
   - `gerado: true` → link de prévia (`previewUrl`, até `linkValidoAte`), campos em branco, `rascunhoVenceEm`.
3. **Como enviar** (do `consultar_hospital`, sem inventar): canal (e-mail/presencial/portal), contato copiado da ferramenta, se pede procuração/formulário próprio, prazo. Nota não validada/desatualizada → o aviso da `/hospital`. Termine com a **Fonte**.
4. Pergunte se quer anexar o pedido no card. Sim → `anexar_rascunho` (prévia → "Confirma?" → `confirmar: true` + `previa_hash`). A pasta padrão do pedido é a que `pastaSugerida` indicar; pasta diferente só se o operador pedir.
5. **Próximos passos sugeridos**: "enviar ao hospital pelo canal acima (a IA ainda não envia — Etapa 5)", "precisa de procuração? → `/procuracao <card>`", "mover para a coluna de protocolo quando enviar (`mover_card`)".

## Regras
- A IA **não envia** o pedido (nem e-mail, nem WhatsApp) nesta etapa: diga como o operador envia.
- Contato só copiado de `consultar_hospital`; nunca complete ou deduza e-mail/telefone.
- Uma geração por pedido (conversor de PDF é fila única). Nada em lote.
- Link de prévia tem dado pessoal: só para o operador.
- Erros (`conversor_indisponivel`, `modelo_invalido`, `rascunho_expirado`) como em `.claude/skills/procuracao/SKILL.md`.
- Demais regras: "Regras de operação" de `.claude/skills/cliente/SKILL.md` e "Regras de escrita" de `.claude/skills/processo/SKILL.md`.
