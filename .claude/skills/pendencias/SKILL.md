---
name: pendencias
description: Operação por IA — mostra o que falta (documentos, checklist, cadastro, senha do INSS, tags de pendência) de um card pelo número, ou de todos os cards de uma coluna. Use quando o operador pedir "pendências", "o que falta", "quais documentos faltam", "pendências da coluna X".
---

# /pendencias — o que falta num card ou numa coluna

Entrada: `$ARGUMENTS` = número do processo (ou CPF/nome) **ou** nome de coluna.

## Passos
1. Decida o alvo: número/CPF/"#2342" → card; texto que parece coluna → coluna. Na dúvida, chame `listar_colunas` e confira se o texto casa com alguma; se não casar, trate como nome de cliente.
2. **Card** → `verificar_pendencias`. Responda por grupo: pastas vazias · checklist não marcado (por seção) · campos vazios da procuração · campos vazios do pedido hospitalar · senha do INSS · tags de pendência. Repita o `aviso` da ferramenta (a lista oficial de documentos por serviço ainda não existe).
3. **Coluna** → `listar_cards_coluna` (`limite: 30`); `coluna_ambigua` → pergunte. Depois `verificar_pendencias` para cada card devolvido (em paralelo, até 30). Responda com uma tabela: nº · nome · dias na coluna · principais faltas (até 3) e, no fim, as faltas mais comuns da coluna. Se `total` > `mostrados`, diga.
4. **Próximos passos sugeridos**: o que cobrar de quem (cliente, comercial, ADM), começando pelo que trava a etapa atual.

## Regras de operação
- Responda **só** com o que as ferramentas `crm-op` devolveram. Pendência é sinal do CRM, não regra oficial: não diga "o INSS exige X".
- `sem_permissao` → diga e pare. Nunca leia o banco, o `.env` ou scripts; ferramenta ausente → `diagnostico_crm`.
- Nunca mostre senha (só "cadastrada / não cadastrada").
- Nesta etapa a IA **não altera nada**: não marca checklist, não cobra cliente, não comenta.
- Toda resposta termina com **Próximos passos sugeridos**.
