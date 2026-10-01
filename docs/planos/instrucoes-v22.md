# Instruções do bot v22 — rascunho (NÃO publicado)

> Gravado no banco em 01/10/2026 como `rascunho` (versão 22), a partir da v21 publicada em 27/09.
> 21 seções, 57.841 caracteres (v21: 51.089). Para pôr no ar: aba **Revisão da IA → Instruções → Publicar** (vale em até 5 min, para todos os números).

## Por que existe
O código de 01/10 (CRM `354accd`, micro `dacd7bb`) já manda ao cérebro o bloco "PEDIDO DO ATENDENTE EM ABERTO" e aceita `keepRequest`/`handoffAfterFlow`, mas as regras de como usar isso só estavam no `STATIC_SYSTEM_PROMPT` (fallback) do micro. Com a v21 no ar, o bot recebe os fatos sem saber o que fazer com eles (0 usos de `keepRequest`/`handoffAfterFlow` em 7 dias).

## O que muda

| # | Mudança | Seções |
|---|---|---|
| 1 | **Pedido do atendente em aberto**: seção nova, vinda do fallback (checklist na ficha, "recebi X, falta Y", `keepRequest`, Meu INSS → fluxo "LISTA DE DOCUMENTOS - INSS", "assinei" → `handoffAfterFlow`, honorários) | nova [9] |
| 2 | **Como ler os fatos do sistema**: seção nova explicando cada linha do bloco DADOS DA CONVERSA, com as strings do README do micro. Deixa claro que fato sozinho não é motivo para transferir | nova [19] |
| 3 | **Atendente humano na conversa**: versão do fallback (bastidores invisíveis, caminho A remete ao pedido em aberto, "atendente recente/devolvida/cadastrado sozinhos não levam a D"), mantendo as linhas da v21 sobre o nome do atendente | [8] |
| 4 | **Retomada e devolução**: blocos ATENDIMENTO ANTERIOR e CONVERSA DEVOLVIDA PELA EQUIPE entram na triagem; progresso de lead qualificado respeita o pedido em aberto | [4] |
| 5 | **R3 segue a lição R11 do playbook**: só qualifica quem era EMPREGADO (CLT, doméstico, avulso). Autônomo, MEI e contribuinte individual não qualificam, mesmo tendo recebido auxílio-doença. Pergunta de esclarecimento do vínculo + exemplo de mensagem | [5], [12] |
| 6 | **R5 sem travar**: RG frente e verso pedido UMA vez; sem o verso → pendência "RG sem verso" e segue; CNH só a frente | [6], [7] |
| 7 | **Sem contrato do sistema**: removida a seção "CONTRATO E ASSINATURA ELETRÔNICA"; a saída A não promete mais "vou preparar o seu contrato" (agora "vou passar para a nossa equipe dar sequência no seu processo"); "contrato" virou "processo"/"cadastro" na coleta e no bloco 6 do roteiro | [2], [4], [5], [6], [7] |
| 8 | **Senhas**: o bot não pede, não oferece receber e não diz que a equipe entra na conta; senha recebida (ou `[senha omitida]`) → handoff "acesso gov.br enviado — login pela equipe". Alinha com a máscara de senha de 01/10 (o bot não vê mais a senha) | [10], [18] |
| 9 | **Área do Cliente**: não informa mais a senha padrão; pedido de acesso → handoff `perguntas` | [11] |
| 10 | "Quando NÃO usar resolve" ganha a exceção do pedido em aberto (continua em `continue`); erro de digitação "rectene/remecoce" corrigido | [3], [17] |

## Conferir antes de publicar
- **Senhas e Área do Cliente (itens 8 e 9) invertem a v21**, que mandava oferecer "me passa o CPF e a senha" e informava a senha padrão. A v22 segue o fallback de 30/09 e a máscara de senha.
- **"Assinei" / ZapSign**: mantido porque o código de 01/10 trata o caso (fato "Contrato enviado pelo atendente…"). Se a equipe não manda mais nada pela ZapSign, dá para apagar o parágrafo "ASSINEI" da seção [9] e a linha correspondente da [19].
- **R3 (item 5)** muda quem entra no funil: autônomo/MEI afastado passa a ser `nq_sem_qualidade_de_segurado`.
- **Bloco 6 do roteiro** trocou "concluímos seu contrato" por "concluímos seu cadastro".

## Depois de publicar
- Playbook: as lições R5 e R11 ficaram redundantes com as instruções; R12 ("Em recuperação") e R13 (fluxo de dispensa invisível) não têm como ser cumpridas. Limpar no próximo playbook.
- Medir em 7 dias (SQL só leitura): uso de `keepRequest`/`handoffAfterFlow` no `wa_bot`, disparos do fluxo "LISTA DE DOCUMENTOS - INSS", taxa de `nq_sem_qualidade_de_segurado` e handoffs com motivo "acesso gov.br".
