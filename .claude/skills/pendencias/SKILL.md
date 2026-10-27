---
name: pendencias
description: Operação por IA — mostra o que falta (documentos, checklist, cadastro, senha do INSS, tags de pendência) de um card pelo número, ou de todos os cards de uma coluna numa chamada só, e oferece resolver (completar cadastro pelos documentos, cobrar o cliente por WhatsApp em lote). Use quando o operador pedir "pendências", "o que falta", "quais documentos faltam", "pendências da coluna X".
---

# /pendencias — o que falta num card ou numa coluna

Entrada: `$ARGUMENTS` = número do processo (ou CPF/nome) **ou** nome de coluna.

## Passos
1. Número/CPF/"#2342" → card; texto → coluna (na dúvida, `listar_colunas`; não casou → nome de cliente).
2. **Card** → `verificar_pendencias` com `card`. Responda por grupo, só o que falta: pastas vazias · checklist (nunca aberto = uma linha) · campos da procuração · campos do pedido hospitalar · senha do INSS · tags. Repita o `aviso` numa linha.
3. **Coluna** → `listar_cards_coluna` (`limite: 50`) e depois **uma** `verificar_pendencias` com `cards` = os números devolvidos. Tabela: **nº** · nome · dias · principais faltas (até 3). Feche com `faltasMaisComuns`. `total` > `mostrados` → diga.
4. `Próximo:` a oferta que resolve mais: campos vazios **e** documento de identificação anexado → "leio os documentos e completo o cadastro? (`/documentos`)"; documento faltando → "cobro o(s) cliente(s) por WhatsApp? (`/whatsapp`)"; procuração completa e pasta vazia → "preparo a procuração?"; pedido completo → "preparo o pedido de prontuário?".

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Só o que as ferramentas `crm-op` devolveram. Pendência é sinal do CRM, não regra oficial ("o INSS exige X" não). Nunca banco, `.env` ou scripts (ferramenta ausente → `diagnostico_crm`). Senha nunca aparece.
- **Formato**: curto; **negrito** no que decide; tabela a partir de 3 cards; termine com UMA linha `Próximo:` só se houver ação que você pode fazer.
- **Ação** (cadastro, tag, comentar, avisar): só por pedido do operador; chame UMA vez com `confirmar: true`. `requer_confirmacao` (troca de campo preenchido → `confirmar_trocas: true` depois do "Troco?") → mostre `details.previa`, pergunte e repita com `previa_hash`. A IA não marca checklist.
- **Envio** (WhatsApp ao cliente): `preparar_whatsapp` (`cards` para lote) → cole o `previaTexto` → "digite só **aprovo <código>**" → `executar_aprovado` só com o código como última mensagem. Bloqueio → diga e pare.
- `sem_permissao` / `ferramenta_desligada` → uma linha e pare.
