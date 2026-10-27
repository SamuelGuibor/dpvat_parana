---
name: procuracao
description: Operação por IA — prepara a procuração (ou a declaração de hipossuficiência) de um ou vários cards como rascunho em PDF, completa o cadastro que faltar com o que o operador disser, e anexa na pasta PROCURAÇÃO. Use quando o operador pedir "/procuracao 2342", "prepara a procuração Curitiba do 2342", "gera a procuração do fulano", "declaração de hipossuficiência do card X", "procurações dos cards da coluna Y".
---

# /procuracao — preparar procuração (rascunho → link → anexar)

Entrada: `$ARGUMENTS` = card(s) (número, CPF ou nome) e, opcional, o modelo ("Curitiba", "Taynara", "hipossuficiência"…).

## Passos
1. `listar_modelos` com `tipo: "procuracao"`. Modelo dito → nome **exato** da lista; mais de um ou nenhum → mostre a lista e pergunte. Nunca escolha sozinho.
2. `preparar_procuracao` com `card` e `modelo`, **sem** `permitir_vazios`. Vários cards → uma chamada por card, **em paralelo**.
   - `modelo_de_outro_tipo` → use a ferramenta de `details.ferramenta` (`/pedido-prontuario`, `/contrato`).
   - `gerado: false` → liste `camposFaltando` em uma linha e pergunte: "me passa os dados (eu preencho o cadastro), gero mesmo assim (saem em branco) ou prefere preencher no site?". Dados no chat → `editar_cadastro` (`confirmar: true`; campo vazio grava direto) → prepare de novo. "Gera mesmo assim" → `permitir_vazios: true`.
   - `gerado: true` → **arquivo** · link de prévia (vale até `linkValidoAte`) · campos em branco (se houver).
3. Pergunte uma vez: "Anexo na pasta **<pastaSugerida>**?". Sim → `anexar_rascunho` com `confirmar: true` (vários → `rascunhos` numa chamada só). Pasta diferente só se pedir.
4. Responda `✔ anexado em <pasta> do card <nº>` e `Próximo:` ("contrato no ZapSign → `/contrato`"; "mando ao cliente por WhatsApp?").

## Progresso (`workflow: "procuracao"` — Regras de progresso de `.claude/skills/crm/SKILL.md`)
Antes do passo 1: `retomar_fluxo` com `card` + `workflow`. Fluxo novo: `salvar_progresso` `passo: "card"` (sem ref) — abre o fluxo. `preparar_procuracao` e `anexar_rascunho` gravam os passos sozinhos (`progresso` na resposta). `salvar_progresso` só para: parou para preencher → `passo: "procuracao"` + `bloqueio` `dado_faltante` (`campos`); não quer anexar → `fim: "concluido"`. Retomado com rascunho válido (seu ou de colega) → não gere de novo (key do `jaFeito`).

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Link de prévia tem dado pessoal: só para o operador. Conversor é fila única: várias gerações em paralelo são aceitas, mas avise que podem levar mais tempo.
- `conversor_indisponivel` → "o conversor não respondeu, nada foi gravado; tente em alguns minutos". `modelo_invalido` → avise quem cuida dos modelos (`manage_templates`). `rascunho_expirado` → prepare de novo. Não insista em loop.
- Só o que as ferramentas devolveram; nunca banco, `.env` ou scripts. **Formato** curto, negrito no que decide, `Próximo:` só com ação possível. Ação = UMA chamada com `confirmar: true`; `requer_confirmacao` (contrato, troca de campo) → prévia, pergunte, repita com `previa_hash`.
