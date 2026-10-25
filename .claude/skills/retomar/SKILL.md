---
name: retomar
description: Operação por IA (Etapa 6) — retoma um fluxo longo que o operador deixou parado (/prontuario, /procuracao, /pedido-prontuario, /contrato), em outra conversa ou outro dia, sem repetir o que já foi feito - mostra onde parou e por quê, relê o que pode ter mudado e segue do próximo passo. Use quando o operador pedir "/retomar", "continua de onde parei", "retoma o prontuário do 2342", "o que eu deixei pela metade".
---

# /retomar — continuar um fluxo parado

Entrada: `$ARGUMENTS` opcional = card (número) e/ou fluxo ("prontuário do 2342").

Regras de operação, de escrita, de aprovação e de **progresso**: `.claude/skills/cliente/SKILL.md` (valem aqui inteiras).

## Passos
1. **Achar o fluxo**:
   - Operador disse card + fluxo → `retomar_fluxo` com `card` e `workflow` (`prontuario`, `procuracao`, `pedido_prontuario`, `contrato`).
   - Senão → `fluxos_abertos`.
     - nenhum → "Você não tem fluxo parado (dos últimos 14 dias)." e pare. Se veio `aviso` de fluxos antigos, repita.
     - um → "Você tem 1 fluxo parado: **<rotulo>** do card <nº> (<nome>), parou em **<bloqueio.rotulo ou ultimoPasso>** (<campos ou codigo>) há <diasParado> dia(s). Continuo?" e espere.
     - vários → lista numerada (fluxo, card, onde parou, há quantos dias) e pergunte qual.
   - Com a escolha → `retomar_fluxo` com `fluxo` (o id da lista).
2. **`aberto: false`** → diga o `motivo` (concluído, abandonado por mais de 14 dias, nenhum aberto) e ofereça começar de novo pela skill do fluxo. Pare.
3. **`parar` preenchido** (ex.: `envio_em_andamento`, `card_sumiu`) → mostre o motivo e **pare**. Envio em andamento: o operador confere no card/inbox se saiu; nunca prepare o envio de novo.
4. **Mostre o plano** antes de seguir: **Já feito** (`jaFeito`: rótulos; rascunho/anexo continuam valendo) · **Vou refazer** (`refazer` com o motivo — ex.: rascunho venceu; aprovação nunca se reaproveita) · **Vou reler** (`reler`) · **Avisos** (card arquivado/movido, registro mudado, passo confirmado pelo operador) · **Próximo**: `proximo.rotulo`. Pergunte "Sigo?" se houver aviso ou algo a refazer; senão siga.
5. **Siga a skill do fluxo** (`skill` devolvido) **a partir do passo `proximo`**, depois de reler o que está em `reler` (card, hospital, pendências: sempre, porque alguém pode ter mexido pelo site). Reaproveite os `refs` do `jaFeito` (key do rascunho para anexar/e-mail, `documento.id`) em vez de gerar de novo. Dado faltante que parou o fluxo e continua faltando → mostre de novo e salve o `bloqueio` de novo.
6. Continue salvando o progresso como a skill do fluxo manda (`salvar_progresso` depois de cada passo).

## Regras
- Só fluxos do **próprio** operador (`sem_permissao` = é de outra pessoa: pare).
- Nunca pule a releitura nem a revalidação que o `retomar_fluxo` pediu; o estado diz o que a IA fez, não como o card está.
- Passo de escrita retomado começa **sem `confirmar`** (prévia → "sim"). Envio retomado começa em `preparar_*` (código novo) — nunca use código, `approvalId` ou `hash` de antes.
- `aviso` "progresso desligado" → o plano é só leitura (nada foi gravado): siga, mas diga que o progresso desta vez não fica guardado.
- `retomar_fluxo`/`fluxos_abertos` não aparecem → rode `diagnostico_crm`.
