---
name: auditoria-operacao
description: Operação por IA (Etapa 7, só gestor) — auditoria do que a equipe fez pelo app num período - rendimento por pessoa, consultas mais frequentes, falhas por código, fluxos parados, envios aprovados/expirados e o que melhorar, sempre com evidência (ids, nº de card, código). Só leitura, sem texto dos pedidos. Use quando pedirem "/auditoria-operacao", "auditoria da semana passada", "como a equipe usou a IA", "rendimento da operação", "o que melhorar na IA".
---

# /auditoria-operacao — auditoria da operação por IA

Entrada: `$ARGUMENTS` = período e, opcional, uma pessoa (`semana passada`, `últimos 30 dias`, `01/10 a 15/10`, `outubro Isadora`; vazio = 7 dias).

## Passos
1. Período em dias de Brasília (≤ 90): "últimos N dias" → `dias`; "semana passada" → `de` segunda / `ate` domingo; "ontem" → `de` = `ate`; datas → AAAA-MM-DD; mês → 1º ao último (ou hoje). Pessoa → `operador`.
2. `gerar_relatorio` **em paralelo** com `tipo` `operacao`, `falhas`, `fluxos`, `aprovacoes`, `ignorados` (mesmo período/operador). `escopo: "proprio"` ou `sem_permissao` → "a auditoria da equipe é só da Visão do Gestor; o seu é `/meu-rendimento`" e pare. `argumentos_invalidos` → motivo e pergunte. `ambiguo`/`nao_encontrado` no operador → opções.
3. Evidência de ação: `listar_historico` (`limite: 10`) em até 5 cards (falha repetida e envio expirado primeiro), em paralelo.
4. Responda (pule seção vazia com "nada no período"):
   - **Período** (de/até) e as definições em uma linha. Conversa/desenvolvimento não entra (decisão do dono).
   - **Por pessoa**: tabela pessoa · pedidos · consultas · ações · cards conduzidos · envios ok/expirados · falhas · latência (s) · sessões. Só números, sem adjetivo.
   - **Consultas frequentes**: `skills` e `consultasFrequentes`.
   - **Falhas**: por `code` (maior primeiro) · taxa · 2–3 `exemplos` · cards.
   - **Fluxos parados**: `bloqueios` mais comuns e `parados` (fluxo · card · passo · dias · quem). Qualquer colega retoma (`/retomar <card>`).
   - **Envios**: por status/canal; `expirada`/`falhou` com id, card, pessoa.
   - **O que foi ignorado** (`ignorados`, decisão do dono de 27/10): prévias que exigiam OK e nunca voltaram confirmadas (pessoa · ferramenta · card · quando), envios que saíram apesar do aviso (MARKETING, destino fora do cadastro), cards pulados e não enviados. Tabela por pessoa (`porOperador`). Só o fato, sem julgar: quem decide é o gestor.
   - **O que melhorar**: 2–6 itens, cada um com **evidência** e **quem faz**, só de padrões dos dados: `code` repetido ≥ 3 (`sem_permissao` → dono revê permissão; `ferramenta_desligada` → dono liga o interruptor; `estado_mudou` → normal; `argumentos_invalidos` → ajuste de skill, ticket) · bloqueio por campo → equipe preenche antes · `sem_hospital`/`sem_destinatario` → nota do vault (`/conhecimento sugerir`) · aprovação expirada → digitar o código em 30 min · muitas consultas e nenhuma ação → `op_write`/interruptores · prévia exigida sem OK repetida na mesma pessoa → conversar sobre a confirmação · envio com aviso MARKETING repetido → risco de bloqueio da Meta, dono revê.
5. `Próximo:` 1–3 itens com quem faz e onde.

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- **Só leitura**; nenhuma ação, nota ou regra muda a partir daqui (vira sugestão). Pedido de agir num card → skill do assunto.
- Todo número e conclusão vêm de `gerar_relatorio`/`listar_historico`; sem evidência não escreva; nunca deduza intenção. Nunca peça o texto dos pedidos (fica só na tela do gestor). `cortado: true` → avise e sugira período menor.
- **Formato** curto, tabelas, negrito no que decide; nunca banco, `.env` ou scripts.
