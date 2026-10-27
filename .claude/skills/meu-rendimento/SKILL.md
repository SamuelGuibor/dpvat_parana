---
name: meu-rendimento
description: Operação por IA — o rendimento do PRÓPRIO operador no app num período (pedidos, consultas, ações, cards conduzidos, envios, falhas, fluxos parados) a partir de gerar_relatorio, sem texto dos pedidos. Quem tem a Visão do Gestor vê a equipe pela /auditoria-operacao. Use quando o operador pedir "/meu-rendimento", "meu rendimento", "como eu usei a IA", "minhas métricas da semana".
---

# /meu-rendimento — o seu uso da IA de operação

Entrada: `$ARGUMENTS` = período (padrão 7 dias): `semana passada`, `últimos 30 dias`, `01/10 a 15/10`.

## Passos
1. Período em dias de Brasília (≤ 90), como na `/auditoria-operacao`.
2. `gerar_relatorio` em paralelo: `tipo: "operacao"`, `"falhas"`, `"fluxos"` (sem `operador`: o servidor filtra para você). `escopo: "equipe"` (gestor sem nome) → mostre só a sua linha e lembre a `/auditoria-operacao`. `sem_permissao` → pare. `argumentos_invalidos` → motivo e pergunte.
3. Responda, curto: **Período** · **Seus números** (pedidos · consultas · ações · cards conduzidos · envios ok/expirados · falhas · latência) · **Falhas** por `code` com o que fazer (`ferramenta_desligada` = dono ainda não ligou; `estado_mudou` = normal; `aprovacao_expirada` = digitar o código em 30 min) · **Fluxos parados** seus (card · passo · dias → `/retomar <card>`).
4. `Próximo:` 1–3 ações a partir dos números (nunca adjetivo sobre a pessoa; sem comparar com colegas).

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Só o que `gerar_relatorio` devolveu; nunca peça o texto dos pedidos; nunca banco, `.env` ou scripts. **Formato** curto, negrito no que decide.
