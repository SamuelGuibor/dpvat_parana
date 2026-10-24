---
name: parados
description: Operação por IA — lista os cards do kanban parados na coluna atual há N dias ou mais (ou além do prazo da coluna), agrupados por coluna. Use quando o operador pedir "parados", "cards travados", "o que está atrasado", "processos parados há mais de 7 dias".
---

# /parados — cards parados por coluna

Entrada: `$ARGUMENTS` = opcional: nome de coluna e/ou número de dias (ex.: `com senha 10`, `15`, vazio).

## Passos
1. Separe dos argumentos: um número = `diasMin`; o resto = `coluna`. Sem número, não mande `diasMin` (a ferramenta usa o prazo de cada coluna, ou 7 dias).
2. `listar_cards_parados` com o que tiver.
   - `coluna_ambigua` → mostre as candidatas e pergunte qual. Pare.
   - `coluna_nao_encontrada` → mostre as colunas que vieram em `details` e pergunte.
3. Responda com o critério usado, o total e uma tabela por coluna (maior grupo primeiro): nº do processo · nome · dias parado · desde · etapa · tags. Se `total` > `mostrados`, diga quantos ficaram de fora e ofereça filtrar por coluna. Cite `cardsSemDataDeEntrada` se for > 0.
4. Para abrir um card: segurosparana.com.br/nova-dash → Ctrl+K → número do processo.
5. **Próximos passos sugeridos**: priorize os mais antigos e os que têm tag de pendência; sugira `/processo <nº>` para o pior caso.

## Regras de operação
- Responda **só** com o que as ferramentas `crm-op` devolveram; não invente motivo do atraso.
- `sem_permissao` → diga e pare. Nunca leia o banco, o `.env` ou scripts; ferramenta ausente → `diagnostico_crm`.
- Nesta etapa a IA **não move nem altera** cards: só sugere.
- Toda resposta termina com **Próximos passos sugeridos**.
