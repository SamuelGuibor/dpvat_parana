---
name: varredura
description: Operação por IA (Etapa 7) — varre os cards ativos atrás de problemas (parados além do prazo, CPF ou telefone repetido, CPF inválido, card sem hospital nas colunas de prontuário, fluxo da IA bloqueado), já LÊ os documentos dos cards com CPF errado para achar o certo e oferece as correções prontas. Use quando pedirem "/varredura", "varrer o kanban", "cards com problema", "duplicados", "inconsistências", "cards com CPF errado".
---

# /varredura — achar o problema e trazer a correção pronta

Entrada: `$ARGUMENTS` = opcional: coluna e/ou tipo (`duplicados`, `cpf`, `hospital`, `parados`, `fluxos`). Vazio = tudo.

## Passos
1. Checagens pelo pedido: `duplicados` → `cpf_repetido` + `telefone_repetido`; `cpf` → `cpf_invalido` + `cpf_repetido`; `hospital` → `sem_hospital`; `fluxos` → `fluxo_bloqueado`; vazio → todas. Coluna → `coluna`.
2. Em paralelo: `varrer_inconsistencias` (`limite` 30), `listar_cards_parados` (pule se o pedido foi só duplicados/CPF/hospital), `fluxos_abertos`. `coluna_ambigua` → opções e pergunte.
3. **Trabalhe antes de responder** (decisão do dono, 27/10):
   - `cpf_invalido` → `analisar_documentos` de cada card **em paralelo** (pasta IDENTIFICACAO). Com `sugestoes.cpf` → proponha a troca; `sem_documentos` → "sem documento anexado para conferir".
   - `cpf_repetido`/`telefone_repetido` → o item já vem **por grupo**, com `cards[]` (coluna, dias, documentos, comentários, criado em) e `sugestao {manter, arquivar, motivo}`: mostre a tabela e proponha arquivar os `arquivar` (`arquivar_card`, destino não destrutivo). Sem `obter_card` extra.
   - `sem_hospital` → `analisar_documentos` com `objetivo: "resumo"` na pasta EXAME MÉDICO (se houver arquivo) para achar o hospital; proponha `editar_cadastro`.
4. Responda por coluna (mais itens primeiro), uma linha por card: **nº** · nome · **problema** · evidência · **correção proposta** (ex.: "CPF no RG: **529.982.247-25** — troco?"). No topo: cards verificados e total por checagem; `total` > `mostrados` → diga. Uma linha: "checagens da IA, não regras oficiais; nada foi alterado".
5. `Próximo:` as correções prontas, em ordem: "troco o CPF dos cards 2342 e 2350 pelo que está no RG?", "preencho o hospital do 2310?", "arquivo o duplicado 2399 (o 2342 tem mais documentos)?", "aviso o responsável dos parados?", "`/retomar` o fluxo do 2301?".
6. Operador aprovou → `editar_cadastro` (`confirmar: true`; troca volta `requer_confirmacao` → mostre antes → depois, "Troco?", repita com `previa_hash` + `confirmar_trocas: true`), um card por chamada, em paralelo quando ele aprovar vários.

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- A varredura só lê; toda correção é por pedido do operador e só nos cards que ele aprovar. Checagem que parece errada (falso positivo recorrente, coluna nova de prontuário) vira sugestão ao dono (`/conhecimento sugerir` ou ticket), nunca mudança de regra.
- Todo item cita a evidência que veio da ferramenta (valor do campo, outro card, dias × prazo, fluxo/passo). Nunca invente causa.
- **Formato** curto, negrito no que decide; `sem_permissao`/`ferramenta_desligada` → uma linha e pare; nunca banco, `.env` ou scripts.
