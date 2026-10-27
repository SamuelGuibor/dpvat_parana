---
name: parados
description: Operação por IA — lista os cards do kanban parados na coluna atual há N dias ou mais (ou além do prazo da coluna), agrupados por coluna, e oferece agir em lote (avisar responsáveis, cobrar clientes por WhatsApp). Use quando o operador pedir "parados", "cards travados", "o que está atrasado", "processos parados há mais de 7 dias".
---

# /parados — cards parados por coluna

Entrada: `$ARGUMENTS` = opcional: nome de coluna e/ou número de dias (ex.: `com senha 10`, `15`, vazio).

## Passos
1. Número → `diasMin`; o resto → `coluna`. Sem número, não mande `diasMin` (vale o prazo de cada coluna, ou 7).
2. `listar_cards_parados`. `coluna_ambigua`/`coluna_nao_encontrada` → opções (`details`) e pergunte.
3. Responda: critério usado e total numa linha; depois uma tabela por coluna (maior grupo primeiro): **nº** · nome · **dias parado** · etapa · tags. `total` > `mostrados` → diga quantos ficaram de fora e ofereça filtrar. `cardsSemDataDeEntrada` > 0 → cite.
4. `Próximo:` o que você pode fazer em lote, pelo pior caso: "aviso o responsável dos N cards? (`notificar_pessoa` por card, em paralelo)", "cobro os clientes desses cards por WhatsApp? (`/whatsapp`)", "abro o pior: `/processo <nº>`".

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Só o que as ferramentas `crm-op` devolveram; não invente motivo do atraso. Nunca banco, `.env` ou scripts (ferramenta ausente → `diagnostico_crm`).
- **Formato**: curto; **negrito** no que decide; tabela a partir de 3 cards; termine com UMA linha `Próximo:` só se houver ação que você pode fazer.
- **Ação** (mover, tag, comentar, avisar, arquivar): só por pedido do operador, e só nos cards que ele disser; chame UMA vez com `confirmar: true` (vários cards = chamadas em paralelo). `requer_confirmacao` → mostre `details.previa`, pergunte "Confirma?" e repita com `previa_hash`.
- **Envio** (WhatsApp ao cliente): `preparar_whatsapp` com `cards` → cole o `previaTexto` → "digite só **aprovo <código>**" → `executar_aprovado` só com o código como última mensagem. Bloqueio → diga e pare.
- `sem_permissao` / `ferramenta_desligada` → uma linha e pare.
