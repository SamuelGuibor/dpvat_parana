---
kind: extraido_do_codigo
status: rascunho
fonte: "automation:cmqffmdjk000jl904uzn7ixgo"
fonte_hash: bf1cb9358f07615081d70c8f2fc8774242295b70d6883b3622ee5d4e6aa5380a
hospital: POLICLINICA PATO BRANCO
ghost_id: cmqldj2gw0031ia5c2t1yc2to
modo: ["site","email"]
contatos: {"email":["same@policlinicapb.com.br","prontuarios.parana@dpvatparana.com.br"],"telefone":[],"site":["https://hospitalpoliclinica.org.br/solicitacao-de-prontuario-medico/","https://drive.google.com/file/d/1hY_AtRJ7bprvhjNpPpk3j-axLqwNW_7z/view?usp=sharing"]}
procuracao: "Formulário de solicitação autenticado pelo ZapSing e assinado"
prazo: null
redigido_por: null
validado_por: null
publicado_por: null
atualizado_em: 2026-10-24
pendente_humano: ["Automação marcada como INCOMPLETO no título da Fonte", "A Fonte não diz valor nem forma de pagamento", "A Fonte não informa prazo", "Procuração/documentos do procurador não mencionados"]
---

# POLICLINICA PATO BRANCO

## Como pedir

1. Faça a solicitação pelo site https://hospitalpoliclinica.org.br/solicitacao-de-prontuario-medico/
2. Autentique o formulário pelo ZapSing: https://drive.google.com/file/d/1hY_AtRJ7bprvhjNpPpk3j-axLqwNW_7z/view?usp=sharing
3. Envie e-mail do ".parana" para same@policlinicapb.com.br com a solicitação padrão no corpo.
4. Anexe o formulário assinado e o comprovante de pagamento, com o nome do cliente na descrição.

## Contato

- E-mail: same@policlinicapb.com.br
- E-mail para recebimento do prontuário: prontuarios.parana@dpvatparana.com.br
- Site: https://hospitalpoliclinica.org.br/solicitacao-de-prontuario-medico/
- Formulário: https://drive.google.com/file/d/1hY_AtRJ7bprvhjNpPpk3j-axLqwNW_7z/view?usp=sharing

## Documentos e procuração

- Formulário de solicitação (link acima), autenticado pelo ZapSing e assinado.
- Comprovante de pagamento, com o nome do cliente na descrição.
- Procuração: a Fonte não menciona.

## Prazo e retorno

Prazo: a Fonte não menciona. O prontuário deve ser encaminhado por e-mail para prontuarios.parana@dpvatparana.com.br.

## Observações

- A automação está marcada como INCOMPLETO na Fonte.
- Assunto/corpo do e-mail: iniciar com "Boa tarde" e dizer que seguem, no corpo, a solicitação padrão e, nos anexos, o comprovante de pagamento e o formulário assinado.
- Solicitação padrão (preencher os campos entre [[ ]] com os dados do cliente): "Eu, [[name]], [[estado_civil]], [[nacionalidade]], [[data_nasc]], nº do CPF [[cpf]], nº do R.G. [[rg]], [[rua]], [[numero]], solicito a extração de cópias do meu prontuário médico do Instituto Policlínica PB, relativo ao período de [[data_acidente]] a data em que os atendimentos referentes ao caso foram cessados. Solicito ainda que seja encaminhado por e-mail no endereço eletrônico prontuarios.parana@dpvatparana.com.br."
- Documentos solicitados: Prontuário, ficha/declaração de entrada (BAM), guia RAS (se houver), laudos de radiografia, evoluções, ambulatórios e descrição de cirurgia. Se possível, em ordem cronológica.
- Não enviar exames laboratoriais, descrição da instrumentação cirúrgica nem relatórios de custos operacionais.

## Fonte

Texto LITERAL da automação no CRM (não editar à mão: o seed regrava). É a única base para as seções acima.

### automation:cmqffmdjk000jl904uzn7ixgo — Pedidos de Hospitais - POLICLINICA PATO BRANCO - INCOMPLETO (atualizada em 15/06/2026)

````text
Solicitação ocorre pelo site https://hospitalpoliclinica.org.br/solicitacao-de-prontuario-medico/
Após, autentique pelo ZapSing o formulário https://drive.google.com/file/d/1hY_AtRJ7bprvhjNpPpk3j-axLqwNW_7z/view?usp=sharing e o envie para o e-mail "same@policlinicapb.com.br" através do ".parana", anexando também o comprovante de pagamento com o nome do cliente na descrição.

Eu, [[name]], [[estado_civil]], [[nacionalidade]], [[data_nasc]], nº do CPF [[cpf]], nº do R.G. [[rg]], [[rua]], [[numero]], solicito a extração de cópias do meu prontuário médico do Instituto Policlínica PB, relativo ao período de [[data_acidente]] a data em que os atendimentos referentes ao caso foram cessados. Solicito ainda que seja encaminhado por e-mail no endereço eletrônico prontuarios.parana@dpvatparana.com.br.

Ao e-mail, enviar
Boa tarde

Segue no corpo do e-mail a solicitação padrão, e, nos anexos, o comprovante de pagamento e o formulário de solicitação assinado.

Documentos solicitados: Prontuário, ficha/declaração de entrada (BAM), guia RAS (se houver), laudos de radiografia, evoluções, ambulatórios e descrição de cirurgia. Se possível, enviar em ordem cronológica.
Favor não enviar exames laboratoriais, descrição da instrumentação cirúrgica e relatórios de custos operacionais.
````
