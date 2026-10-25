---
kind: extraido_do_codigo
status: rascunho
fonte: "automation:cmqkzfbz80007le04iq0zpt09"
fonte_hash: 58d61ee15384d079724c5af953cd81102bd72bdaf4b016c83d074b9c7f8f2acc
hospital: UPAS CANOAS
ghost_id: cmqldjtvq006fia5cz9dqegj2
modo: ["email","presencial"]
contatos: {"email":["atendimento.cidadao@canoas.rs.gov.br"],"telefone":[],"site":["https://www.canoas.rs.gov.br/servicos/portalsei/"]}
procuracao: "Usar quaisquer documentos como procurador"
prazo: null
redigido_por: null
validado_por: null
publicado_por: null
atualizado_em: 2026-10-24
pendente_humano: ["Fonte contraditória sobre custo: diz retirada 'sem custos' e a mensagem ao cliente diz que pagaremos 'o valor que o hospital cobrar'","Endereço da secretaria de saúde de Canoas (local de retirada) não consta na Fonte"]
---

# UPAS CANOAS

## Como pedir

1. Envie e-mail de ".sc" para atendimento.cidadao@canoas.rs.gov.br.
2. Use quaisquer documentos como procurador.
3. Envie ao cliente a mensagem sobre a retirada presencial (ver Observações).
4. Acompanhe o andamento em https://www.canoas.rs.gov.br/servicos/portalsei/.

## Contato

- E-mail: atendimento.cidadao@canoas.rs.gov.br
- Acompanhamento: https://www.canoas.rs.gov.br/servicos/portalsei/

## Documentos e procuração

- Quaisquer documentos como procurador.
- Na retirada, o cliente leva documento de identificação pessoal (CIN e/ou CNH).
- Formulários e anexos: a Fonte não menciona.

## Prazo e retorno

- Prazo: a Fonte não menciona.
- Retorno: a retirada é somente presencial, na secretaria de saúde da cidade. Avisar o cliente quando o prontuário estiver disponível.

## Observações

- A Fonte diz que a retirada é sem custos, mas a mensagem ao cliente diz que pagaremos o valor que o hospital cobrar. Isso precisa de confirmação humana.
- Não há filial em Canoas, por isso o cliente precisa retirar.
- Mensagem a enviar ao cliente, em resumo: o hospital informou que a solicitação pode ser online, mas a retirada é só presencial; pede que o cliente retire; avisaremos quando estiver disponível; ele deve levar CIN e/ou CNH. A mensagem completa começa com "Boa tarde, [[name]]." e está na Fonte.

## Fonte

Texto LITERAL da automação no CRM (não editar à mão: o seed regrava). É a única base para as seções acima.

### automation:cmqkzfbz80007le04iq0zpt09 — Pedidos de Hospitais - UPAS CANOAS (atualizada em 19/06/2026)

````text
De ".sc" para "atendimento.cidadao@canoas.rs.gov.br".
Use quaisquer documentos como procurador. A retirada ocorre somente de forma presencial (sem custos), na secretaria de saúde da cidade, envie ao cliente a mensagem:

Boa tarde, [[name]].

Entrei em contato com o hospital para solicitar seu prontuário e eles informaram que, apesar de a solicitação poder ser feita online, a retirada ocorre apenas presencialmente.

Infelizmente, ainda não temos filial em Canoas. O senhor poderia, por gentileza, realizar a retirada?

Avisaremos quando o prontuário estiver disponível e pagaremos ao senhor o valor que o hospital cobrar para entregá-lo. Será necessário apenas que leve seu documento de identificação pessoal (CIN e/ou CNH).


Para acompanhar o andamento da solicitação, acompanhe pelo site https://www.canoas.rs.gov.br/servicos/portalsei/
````
