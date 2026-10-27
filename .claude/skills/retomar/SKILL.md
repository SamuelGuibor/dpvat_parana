---
name: retomar
description: Operação por IA (Etapa 6) — retoma um fluxo longo parado (/prontuario, /procuracao, /pedido-prontuario, /contrato), do próprio operador ou de um colega, em outra conversa ou outro dia, sem repetir o que já foi feito - mostra onde parou e por quê, relê o que pode ter mudado e segue do próximo passo. Use quando o operador pedir "/retomar", "continua de onde parei", "retoma o prontuário do 2342", "o que eu deixei pela metade".
---

# /retomar — continuar um fluxo parado

Entrada: `$ARGUMENTS` opcional = card e/ou fluxo ("prontuário do 2342"). O fluxo é do **card**: qualquer colega continua.

## Passos
1. Achar: card + fluxo → `retomar_fluxo` (`card`, `workflow`: `prontuario` | `procuracao` | `pedido_prontuario` | `contrato`). Só card → `fluxos_abertos` com `card`. Nada → `fluxos_abertos` sem args: nenhum → "sem fluxo parado (14 dias)" e pare; um → "**<rotulo>** do **<nº>** (<nome>) parou em **<onde>** há N dia(s)<, com <ultimoOperador>>. Continuo?"; vários → lista numerada e pergunte. Escolhido → `retomar_fluxo` com `fluxo`.
2. `aberto: false` → diga o `motivo` e ofereça começar pela skill do fluxo. `parar` → mostre e pare (envio em andamento: confira no card; nunca prepare de novo).
3. Colega (`avisoColega`) → diga com quem estava; o rascunho dele vale (é do card), a aprovação dele não (prepara de novo).
4. Plano em 4 linhas: **Feito** (`jaFeito`) · **Refazer** (`refazer` + motivo) · **Reler** (`reler`) · **Próximo** (`proximo.rotulo`). Aviso ou refazer → "Sigo?"; senão siga.
5. Siga a skill do fluxo (`skill`) a partir de `proximo`, depois de reler card/hospital/pendências. Reaproveite os `refs` do `jaFeito`. `aprovacaoValida` → mostre a prévia de novo e peça só o "aprovo <codigo>" (não prepare de novo). Dado faltante que continua faltando → mostre e salve o `bloqueio` de novo. Os passos seguintes as ferramentas gravam sozinhas.

## Regras (resumo — completas em `.claude/skills/crm/SKILL.md`)
- Nunca pule a releitura: o estado diz o que a IA fez, não como o card está. Ação retomada é UMA chamada com `confirmar: true` (`requer_confirmacao` → prévia e pergunte). Envio retomado começa em `preparar_*` (código novo), salvo `aprovacaoValida` (mesma sessão, no prazo): aí só o código; nunca invente `approvalId`/`hash`.
- `aviso` "progresso desligado" → siga, dizendo que desta vez não fica guardado. Ferramentas ausentes → `diagnostico_crm`.
- **Formato** curto, negrito no que decide, `Próximo:` só com ação possível.
