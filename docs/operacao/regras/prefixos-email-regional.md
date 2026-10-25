---
kind: oficial
status: rascunho
fonte: "pessoa:Samuel Guibor, 2026-10-24"
redigido_por: Samuel Guibor
validado_por: null
publicado_por: null
atualizado_em: 2026-10-24
pendente_humano: ["confirmar: a caixa prontuarios.<regiao>@ é quem ENVIA o pedido (remetente)?"]
---
# Prefixo regional antes do e-mail = caixa de envio da Paraná

## Regra
Os prefixos com ponto que as automações de hospital trazem antes do e-mail (como `.parana`, `.sc`, `.sp`, `.sudeste`, `.curitiba`, `.nordeste`) indicam a região, e a Paraná tem um e-mail para cada região. O pedido é enviado pela caixa daquela região:

`.<regiao>` → `prontuarios.<regiao>@dpvatparana.com.br`

## Fonte
Pergunta feita ao dono no chat de 24/10/2026 (lote 20261024-2013):

```text
Os prefixos `.parana`, `.sc`, `(.sp)`, `.sudeste`, `.curitiba`, `.nordeste`… — confirma o que significam? Minha leitura: o vault tem caixas próprias da Paraná com esses sufixos, então o prefixo indica de qual caixa regional o pedido sai.
```

Respostas de Samuel Guibor (dono, ADMIN++), no mesmo chat:

```text
sim, temos email para cada regiao, ent devemos mandar email com base nisso
```

```text
para isso, so adicione o prontuarios.<regiao>@dpvatparana.com.br, segue esse fluxo ai
```

Confirmação pedida ("esses prefixos aparecem nas automações de hospital, antes do e-mail, e o `(.sp)` vale igual aos outros"), resposta de Samuel Guibor no mesmo chat:

```text
o 1. Sim
```
