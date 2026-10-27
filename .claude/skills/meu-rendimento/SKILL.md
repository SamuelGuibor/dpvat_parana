---
name: meu-rendimento
description: Operação por IA — o rendimento do PRÓPRIO operador no app num período (pedidos, consultas, ações, cards conduzidos, envios, falhas, fluxos parados) a partir de gerar_relatorio, sem texto dos pedidos. Quem tem a Visão do Gestor vê a equipe pela /auditoria-operacao. Use quando o operador pedir "/meu-rendimento", "meu rendimento", "como eu usei a IA", "minhas métricas da semana".
---

# /meu-rendimento — o seu uso da IA de operação

Entrada: `$ARGUMENTS` = período (padrão: últimos 7 dias). Exemplos: `semana passada`, `últimos 30 dias`, `01/10 a 15/10`.

Decisão do dono (26/10): cada operador vê **o próprio** rendimento; a equipe toda é só de quem tem a Visão do Gestor (`/auditoria-operacao`).

## Passos
1. Período em dias de Brasília (até 90), como na `/auditoria-operacao`: "últimos N dias" → `dias: N`; "semana passada" → `de` segunda / `ate` domingo; datas → `de`/`ate` AAAA-MM-DD.
2. `gerar_relatorio` com `tipo: "operacao"` (sem `operador`: o servidor já filtra para você quando não é gestor). Se precisar, `tipo: "falhas"` e `tipo: "fluxos"` com o mesmo período.
   - `escopo: "equipe"` (a pessoa é gestora e não pediu um nome) → mostre só a linha dela em `operadores` e lembre que a equipe toda está na `/auditoria-operacao`.
   - `sem_permissao` → diga e **pare**. `argumentos_invalidos` → diga o motivo e pergunte o período de novo.
3. Responda, curto:
   - **Período** (de/até) e as definições de pedido, consulta e ação (`definicoes`).
   - **Seus números**: pedidos · consultas · ações · cards conduzidos · envios executados/expirados · falhas · latência das ferramentas. Sem "tempo ativo" (não é medido) e sem comparar com colegas.
   - **Falhas** mais comuns por `code`, com o que fazer (tabela de códigos em `docs/ai/operacao-ia.md`): `ferramenta_desligada` = o dono ainda não ligou; `estado_mudou` = normal; `aprovacao_expirada` = digitar o código em até 30 min.
   - **Fluxos parados** seus (card, passo, dias) → ofereça `/retomar <card>`.
4. Termine com 1 a 3 **Próximos passos** a partir dos números (nunca adjetivo sobre a pessoa).

## Regras de operação (valem para toda skill de operação)
- Responda **só** com o que as ferramentas `crm-op` devolveram. Nada de deduzir dado que não veio.
- Ferramenta devolveu `sem_permissao` → diga "você não tem permissão para isso no CRM" e **pare**. Não tente outro caminho.
- **Nunca** leia o banco, o `.env` ou scripts para responder: só as ferramentas `crm-op`. Se elas não aparecem, rode `diagnostico_crm` e mostre o resultado.
- Não peça nem tente obter o texto dos pedidos: a ferramenta não devolve.
