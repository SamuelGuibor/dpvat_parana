---
kind: extraido_do_codigo
status: publicado
fonte: "automation:cmqiadpr4001dl804yl9ghubx"
fonte_hash: 9d13d8079bdaffde5b6ff60996244096677ba885479a8029fea4753b4658d167
hospital: CAJURU
ghost_id: cmqldihy4000iia5c9logugx1
modo: ["email","presencial"]
contatos: {"email":["protocolo.huc@pucpr.br"],"telefone":[],"site":[]}
procuracao: "Procuração impressa, junto com documentos de identificação do paciente e requerentes"
prazo: null
redigido_por: agente-redator
validado_por: agente-validador
publicado_por: agente-validador
atualizado_em: 2026-10-24
pendente_humano: []
---

# CAJURU

## Como pedir

1. Envie e-mail da conta ".curitiba" para protocolo.huc@pucpr.br, usando o texto exclusivo do hospital (em Observações).
2. Depois de solicitar, passe o cartão para "SOLICITADOS, AGUARDANDO PROTOCOLO".
3. Quando o setor responder com a data de retirada, exclua a etiqueta "aguardando protocolo".
4. Imprima o e-mail, os documentos de identificação do paciente e dos requerentes (de Curitiba) e a procuração; junte tudo e ponha na pasta.
5. Mova o cartão para a coluna "COM/FALTA SENHA - SOLICITADO".
6. Se o prontuário já puder ser retirado, adicione a etiqueta "PRONTO PARA RETIRAR".

## Contato

- E-mail: protocolo.huc@pucpr.br

## Documentos e procuração

- Procuração e documentos de identificação do paciente e dos requerentes (de Curitiba), impressos junto com o e-mail de retorno do setor.
- A Fonte não menciona formulário.

## Prazo e retorno

- Prazo: a Fonte não menciona.
- O setor responde por e-mail informando a data de retirada. A retirada é presencial e eles entregam por CD.

## Observações

Texto exclusivo de solicitação (endereçado a Selma e Ivone), com os campos [[name]], [[data_acidente]], [[nome_mae]] e [[cpf]]. Pede: prontuário, ficha/declaração de entrada (BAM), guia RAS (se houver), laudos de radiografia, evoluções, ambulatórios e descrição de cirurgia, se possível em ordem cronológica. Pede para não enviar exames laboratoriais, descrição da instrumentação cirúrgica nem relatórios de custos operacionais.

## Fonte

Texto LITERAL da automação no CRM (não editar à mão: o seed regrava). É a única base para as seções acima.

### automation:cmqiadpr4001dl804yl9ghubx — Pedidos de Hospitais - CAJURU (atualizada em 17/06/2026)

````text
De ".curitiba" para "protocolo.huc@pucpr.br".
Pós solicitar passe o cartão para \\"SOLICITADOS, AGUARDANDO PROTOCOLO\\"
O setor retornará o e-mail informando a data para retirada. Exclua a etiqueta "aguardando protocolo", imprima o e-mail, os documentos de identificação do paciente e requerentes (de Curitiba) e a procuração. Os junte e os ponha na pasta, bem como hás de mover o cartão para a coluna "COM/FALTA SENHA - SOLICITADO" (caso o prontuário já possa ser retirado, adicione a etiqueta "PRONTO PARA RETIRAR". Caso o prontuário já possa ser retirado, adicione a etiqueta "PRONTO PARA RETIRAR". 
A retirada é presencial e eles entregam por CD.
Este hospital possui um texto exclusivo de solicitação:

Olá, prezadas Selma e Ivone.
Gostaria de solicitar o prontuário médico de um cliente: Nome: [[name]]
Com data de atendimento aproximada em [[data_acidente]]

Documentos solicitados: Prontuário, ficha/declaração de entrada (BAM), guia RAS (se houver), laudos de radiografia, evoluções, ambulatórios e descrição de cirurgia. Se possível, enviar em ordem cronológica.
Favor não enviar exames laboratoriais, descrição da instrumentação cirúrgica e relatórios de custos operacionais.

Nome da mãe: [[nome_mae]]
CPF do paciente: [[cpf]]

Atenciosamente,
````
