---
name: retomar
description: Operação por IA (Etapa 6) — retoma um fluxo longo parado (/prontuario, /procuracao, /pedido-prontuario, /contrato), do próprio operador ou de um colega, em outra conversa ou outro dia, sem repetir o que já foi feito - mostra onde parou e por quê, relê o que pode ter mudado e segue do próximo passo. Use quando o operador pedir "/retomar", "continua de onde parei", "retoma o prontuário do 2342", "o que eu deixei pela metade".
---

# /retomar — continuar um fluxo parado

Entrada: `$ARGUMENTS` opcional = card (número) e/ou fluxo ("prontuário do 2342").

O fluxo é do **card**, não da pessoa (decisão do dono, 26/10): o caso passa por vários operadores e qualquer um continua de onde o colega parou. O registro guarda quem começou e quem continuou.

Regras de operação, de escrita, de aprovação e de **progresso**: `.claude/skills/cliente/SKILL.md` (valem aqui inteiras).

## Passos
1. **Achar o fluxo**:
   - Operador disse card + fluxo → `retomar_fluxo` com `card` e `workflow` (`prontuario`, `procuracao`, `pedido_prontuario`, `contrato`).
   - Operador disse só o card → `fluxos_abertos` com `card` (lista os fluxos do card de QUALQUER colega).
   - Senão → `fluxos_abertos` sem args (os que ele começou ou continuou).
     - nenhum → "Você não tem fluxo parado (dos últimos 14 dias)." e pare. Se veio `aviso` de fluxos antigos, repita. Lembre que dá para ver os de um card com o número dele.
     - um → "Você tem 1 fluxo parado: **<rotulo>** do card <nº> (<nome>), parou em **<bloqueio.rotulo ou ultimoPasso>** (<campos ou codigo>) há <diasParado> dia(s). Continuo?" e espere.
     - vários → lista numerada (fluxo, card, onde parou, há quantos dias, `ultimoOperador` quando `deColega`) e pergunte qual.
   - Com a escolha → `retomar_fluxo` com `fluxo` (o id da lista).
2. **`aberto: false`** → diga o `motivo` (concluído, abandonado por mais de 14 dias, nenhum aberto) e ofereça começar de novo pela skill do fluxo. Pare.
3. **`parar` preenchido** (ex.: `envio_em_andamento`, `card_sumiu`) → mostre o motivo e **pare**. Envio em andamento: o operador confere no card/inbox se saiu; nunca prepare o envio de novo.
4. **Fluxo de colega** (`avisoColega`) → diga com quem estava ("Este fluxo estava com <ultimoOperador>, começado por <comecadoPor>") e que, ao seguir, o rascunho e a aprovação dele não valem para você (prepara de novo).
5. **Mostre o plano** antes de seguir: **Já feito** (`jaFeito`: rótulos; rascunho/anexo continuam valendo) · **Vou refazer** (`refazer` com o motivo — ex.: rascunho venceu; aprovação nunca se reaproveita) · **Vou reler** (`reler`) · **Avisos** (card arquivado/movido, registro mudado, passo confirmado pelo operador) · **Próximo**: `proximo.rotulo`. Pergunte "Sigo?" se houver aviso ou algo a refazer; senão siga.
6. **Siga a skill do fluxo** (`skill` devolvido) **a partir do passo `proximo`**, depois de reler o que está em `reler` (card, hospital, pendências: sempre, porque alguém pode ter mexido pelo site). Reaproveite os `refs` do `jaFeito` (key do rascunho para anexar/e-mail, `documento.id`) em vez de gerar de novo. Dado faltante que parou o fluxo e continua faltando → mostre de novo e salve o `bloqueio` de novo.
7. Continue salvando o progresso como a skill do fluxo manda (`salvar_progresso` depois de cada passo).

## Regras
- Qualquer fluxo aberto, seu ou de colega. Antes de seguir num fluxo de colega, diga com quem estava e pergunte "Sigo?".
- Nunca pule a releitura nem a revalidação que o `retomar_fluxo` pediu; o estado diz o que a IA fez, não como o card está.
- Passo de escrita retomado começa **sem `confirmar`** (prévia → "sim"). Envio retomado começa em `preparar_*` (código novo) — nunca use código, `approvalId` ou `hash` de antes.
- `aviso` "progresso desligado" → o plano é só leitura (nada foi gravado): siga, mas diga que o progresso desta vez não fica guardado.
- `retomar_fluxo`/`fluxos_abertos` não aparecem → rode `diagnostico_crm`.
