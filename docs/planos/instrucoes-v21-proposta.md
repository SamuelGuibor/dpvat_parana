# Instruções do bot v21 — proposta de texto (NÃO publicada)

> PR38 do plano `docs/planos/2026-09-25-correcoes-whatsapp.md` (item D11).
> **Nada foi gravado no banco nem publicado.** Este arquivo é só o texto para revisão.
> Base: v20, publicada em 24/09/2026 01:44 (UTC), 48.482 caracteres, 20 seções, lida em 26/09/2026 só com SELECT.
> Para aplicar: aba Revisão da IA → Instruções. Editar as seções abaixo no rascunho e publicar (`publishInstructionsDraft`).

## O que muda, em palavras simples

| # | Regra | Seções | Precisa de OK |
|---|---|---|---|
| (a) | Cliente da casa pergunta "como está meu processo?" → o bot responde com a etapa e pode encerrar como "perguntas" (`resolve`). Vai para a equipe só se houver documento novo, pedido concreto, prazo/valor, reclamação ou etapa que ele não sabe explicar. | [3], [14], [17] | responsável pelo bot |
| (b) | Antes de disparar o roteiro comercial (o momento em que o lead é qualificado), o bot confirma se ficou sequela e pergunta se algum advogado já cuida do caso. | [4], [5], [12] | **chefe** (custa 1 a 2 turnos de triagem) |
| (c) | Áudio que o bot não entendeu: na 1ª vez ele pede para o cliente **escrever**, em vez de só pedir para repetir o áudio. | [20] | responsável pelo bot |
| (d) | Fato novo `recentAttendant` (micro do PR38): se alguém da equipe falou com o cliente nos últimos 7 dias, o bot não recomeça a triagem nem desqualifica por conta própria. | [9] | responsável pelo bot |

Nenhuma regra cria state, closeCategory ou action novos: `nq_sem_lesao_pertinente` e `nq_ja_tem_acao_advogado` já estão no enum do micro, e as perguntas novas cabem em `triagem_lesao` e `triagem_inss`. Não cai na regra dos 3 lugares.

## O que o PR38 já fez no código (sem mudar o comportamento com a v20)

- **Micro** (`D:\Chatbot_whatsapp\bot.js`, `renderConversationFacts`): o bloco "ESTE ATENDIMENTO" do prompt dinâmico agora traz só **fatos**. Ele trazia fixa a regra "cliente cadastrado ou arquivo recebido → nunca `resolve`, use `handoff`". Como estava no código, valia por cima das instruções: publicar só a v21 não mudaria nada. Conferido antes de tirar: a v20 publicada tem a mesma regra na seção [17] ("QUANDO NÃO USAR action=resolve"). O fallback `STATIC_SYSTEM_PROMPT` ganhou o mesmo parágrafo. **Com a v20 no ar, o bot continua transferindo cliente cadastrado como hoje. A regra (a) só vale quando a v21 for publicada.**
- Texto do fato de arquivos corrigido para "(foto/PDF)" (desde 25/09 o CRM não conta áudio).
- Fato novo "Um ATENDENTE da equipe conversou com este cliente nos últimos 7 dias" (`conversationFacts.recentAttendant`, CRM). Sem a regra (d), é só informação para o bot.
- **CRM**: a nota interna da transferência (handoff, "continue" vazio, lead qualificado) passa a trazer a transcrição dos áudios do lote (`buildAudioTranscriptNote`). Não depende da v21.

## Decisões antes de publicar

1. **Chefe aprova a regra (b)?** Ela custa 1 a 2 turnos a mais na triagem (~24 s cada) e pode baixar a conversão. Em compensação, a auditoria mediu que 24% dos qualificados pela IA viram "não qualificado" nas mãos da equipe, com 34 casos `nq_sem_lesao_pertinente` e 14 `nq_ja_tem_acao_advogado`.
2. **Escopo da regra (b): só INSS ou também DPVAT?** A v20 só faz triagem de Auxílio-Acidente do INSS (a abertura diz isso, e não existe roteiro de DPVAT). Então hoje (b) vale para a única triagem que existe. Se um dia houver triagem de DPVAT, decidir se a pergunta do advogado entra nela.
3. **Conflito encontrado: transferir no 2º ou no 3º "não entendi"?**
   - A v20 ([20] REGRAS IMPORTANTES) diz **3ª vez** (nota da v20: "transferência por não entender passa de 2 para 3 tentativas").
   - O micro tem fixo no bloco dinâmico, em toda chamada: com `failCount >= 1`, "NÃO peça para repetir de novo — passe para a equipe (IA não entendeu o cliente **2x** seguidas)". Esse bloco vem depois das instruções e é mais específico, então na prática deve ganhar: a mudança da v20 para 3 tentativas provavelmente nunca valeu.
   - O PR38 **não mexeu** nesse bloco (nada muda até a v21). Escolher uma opção:
     - **2ª vez**: trocar, na v21, "3ª VEZ SEGUIDA" por "2ª VEZ SEGUIDA" (texto alternativo abaixo, na seção [20]). Fica coerente com o micro e com a ideia do plano ("pede texto na 1ª, transfere na 2ª").
     - **3ª vez**: trocar no micro o aviso fixo por só o número de tentativas + "siga REGRAS IMPORTANTES das instruções", com deploy do micro junto da publicação da v21. A regra passa a morar só nas instruções, como as outras.
   - O texto da v21 abaixo mantém a **3ª vez** da v20, para não mudar a contagem sem essa decisão.
4. **Quem redige e aprova o texto final?** Este arquivo é um ponto de partida.

## Ordem

1. Revisão da IA: mandar para revisão os 34 casos `nq_sem_lesao_pertinente`, os 14 `nq_ja_tem_acao_advogado` e uma amostra dos 62 áudios com `understood=false`, para calibrar os textos.
2. Deploy do micro do PR38 no Railway (bloco de fatos). Com a v20 no ar, o comportamento não muda.
3. Deploy do CRM do PR38 (fato `recentAttendant` e transcrição na nota).
4. Testar a v21 **antes** de publicar. O `/api/whatsapp/brain-prompt` só serve a versão publicada, então o staging normal recebe a v20. Caminho sem mexer no CRM: um deploy de **staging** do micro com `BRAIN_PROMPT_URL` vazio e o texto renderizado da v21 colado no `STATIC_SYSTEM_PROMPT` só nesse deploy; testar com um número de `WHATSAPP_TEST_NUMBERS`:
   - card de teste vinculado ao telefone de teste, perguntar "como está meu processo?" → responde com a etapa, pergunta se precisa de mais algo e, com "não, obrigado", encerra com `resolve`/`perguntas` (log `wa_bot`);
   - "quero mandar um documento novo" ou "quando sai o dinheiro?" → `handoff`;
   - triagem até o fim → pergunta de sequela (se não ficou claro) e do advogado antes do roteiro comercial;
   - áudio ininteligível → pede para escrever; a nota da transferência traz a transcrição;
   - no fim, apagar card, contato e conversa de teste.
5. Publicar pela aba Instruções (o texto precisa ter ≥ 500 caracteres; vai ao ar em até 5 min, para **todos** os números).
6. Medir (SQL somente leitura, mesma janela antes e depois):
   - handoff × resolve de contato com card. Linha de base, 14 dias até 26/09/2026, só vínculo manual (`userId`/`processId` do contato): com card 173 handoff × 107 resolve; sem card 145 × 52. Depois do deploy do CRM, o `wa_bot` traz `facts.registeredClient` e a conta fica exata;
   - reabertura em 24 h das conversas encerradas com `resolve`/`perguntas` de cliente cadastrado (risco de fechar quem precisava de humano);
   - qualificados pela IA que a equipe reclassifica como `nq_*` (hoje 64-72 em 30 dias) e a taxa de qualificação (custo da regra b);
   - handoff em turno com áudio e `understood=false`.

---

## Seções alteradas

Trechos entre `ANTES` e `DEPOIS` são literais. Onde diz "inserir", o texto entra no ponto indicado e o resto da seção fica igual à v20.

### [3] PRIORIDADE Nº 0 — O CLIENTE JÁ É CADASTRADO? (RETORNO) — regra (a)

Inserir logo depois do item "Se ele confirmar que quer saber do processo → …":

```
- Se ele JÁ CHEGOU perguntando do processo ("como está meu processo?", "tem
  novidade?", "em que pé está?"), não ofereça de novo: vá direto para a
  consulta (mesmo caminho acima). Ser cliente cadastrado não é motivo para
  transferir: pergunta de status você responde (ver CATEGORIAS DE
  ENCERRAMENTO).
```

Opcional (erro de digitação na v20):

```
ANTES:  - Retomada de contato rectene NÃO é contato novo: use a ficha e não remecoce saudação/triagem;
DEPOIS: - Retomada de contato recente NÃO é contato novo: use a ficha e não recomece saudação/triagem;
```

### [4] ETAPA - TRIAGEM DE NOVOS CLIENTES — regra (b)

Inserir depois da linha "Sempre faça essas perguntas para a triagem, … (etapas 3, 3b, 4 e 5). Aguarde cada resposta.":

```
Duas perguntas curtas completam a triagem, SEMPRE uma por vez e só quando a
ficha ainda não responde: a da SEQUELA, dentro da etapa 4 (triagem_lesao), e a
do ADVOGADO, logo depois da etapa 5 (triagem_inss). Detalhes no CRITÉRIO DE
QUALIFICAÇÃO. Sem elas, não dispare o roteiro comercial.
```

### [5] CRITÉRIO DE QUALIFICAÇÃO — regra (b)

1) Inserir logo depois de "R2. Houve lesão com possível sequela/incapacidade, mesmo que mínima e parcial.":

```
    CONFIRME A SEQUELA (ainda em state="triagem_lesao"): se a resposta sobre a
    lesão não deixou claro que ficou ALGUMA sequela até hoje, pergunte UMA vez:
    "E ficou com alguma sequela até hoje? Por exemplo dor, perda de força ou de
    movimento, pino ou placa, cicatriz, ou dificuldade para fazer alguma
    coisa." Qualquer sequela, mesmo pequena, confirma R2. Se ele disser que
    ficou totalmente recuperado, sem limitação nenhuma, R2 falhou (ver CASOS
    NÃO QUALIFICADOS, closeCategory="nq_sem_lesao_pertinente"). Se ele já
    contou a sequela ("fiquei com pino no tornozelo"), NÃO pergunte de novo.
```

2) Inserir logo depois do bloco do R5 (antes de "⚠️ INTERPRETAÇÃO DA RESPOSTA DA PERGUNTA 3"):

```
CHECAGEM DO ADVOGADO (ELIMINATÓRIA). Depois da resposta do INSS (ainda em
state="triagem_inss") e ANTES de disparar o roteiro comercial, pergunte UMA vez,
se a ficha ainda não responde: "Última pergunta: algum advogado já cuida desse
caso, ou você já entrou com processo por esse acidente?"
- Sim, advogado ou ação em andamento pelo MESMO acidente → não qualifique:
  explique com educação e encerre com action="disqualify", state="encerrando",
  closeCategory="nq_ja_tem_acao_advogado".
- Ficou em dúvida se é o mesmo pedido (ex.: advogado só do seguro/DPVAT,
  processo que já terminou, não sabe dizer) → NÃO desqualifique: anote na ficha
  e siga. A equipe confere.
- Não → siga.
```

(Não numerei como "R6" de propósito: o playbook também numera as lições como [R1], [R2]… e o bot cita esses números em `appliedRules`. Um "R6" novo aqui se confundiria com a lição R6 na aba Métricas. O R1-R5 da v20 já tem esse problema; não aumentar.)

3) Trocar as duas menções ao conjunto de requisitos:

```
ANTES:  Somente se R1 + R2 + R3 + R4 + R5 estiverem confirmados: NÃO peça mais informações,
DEPOIS: Somente se R1 + R2 + R3 + R4 + R5 estiverem confirmados E a checagem do advogado
        tiver passado: NÃO peça mais informações,

ANTES:  Confirmar R1+R2+R3+R4+R5 NÃO é motivo para action="qualify". Neste momento a sua
DEPOIS: Confirmar R1+R2+R3+R4+R5 e a checagem do advogado NÃO é motivo para
        action="qualify". Neste momento a sua
```

### [9] ATENDENTE HUMANO NA CONVERSA — fato `recentAttendant` (d)

Inserir antes da última linha ("NUNCA devolva action="continue" com reply vazio sem silent=true: …"):

```
ATENDENTE RECENTE (em ESTE ATENDIMENTO, nos DADOS DA CONVERSA: "Um ATENDENTE
da equipe conversou com este cliente nos últimos 7 dias"): a conversa voltou
para você depois de passar pela equipe, mesmo que as mensagens do atendente já
não apareçam no histórico. Então:
- NÃO recomece a triagem nem o roteiro comercial, e NÃO peça de novo o que a
  ficha já tem.
- NÃO desqualifique (disqualify) por conta própria um caso que a equipe está
  conduzindo. Se algo que o cliente disser agora parecer tirar o direito dele,
  transfira (action="handoff") e leve isso no handoffReason para o atendente
  decidir.
- Dúvida simples que você sabe responder: responda. Pedido, documento ou
  assunto cujo contexto você não tem: caminho D acima (handoff).
```

### [12] CASOS NÃO QUALIFICADOS — regra (b)

1) Inserir na lista "Se ficar claro que:", depois do item do R5:

```
- O cliente JÁ TEM ADVOGADO cuidando do caso, ou ação em andamento pelo MESMO
  acidente (checagem do advogado do CRITÉRIO DE QUALIFICAÇÃO).
```

2) Inserir no fim da seção:

```
Exemplo para quem JÁ TEM ADVOGADO no mesmo caso:
"Entendi, [nome]. Como você já tem um advogado cuidando desse caso, o melhor é
seguir com ele, para não atrapalhar o seu processo. Se acontecer um novo
acidente, pode falar com a gente que eu analiso, combinado?"
```

### [14] CONSULTA DE STATUS DO PROCESSO (cliente cadastrado) — regra (a)

Seção inteira (substitui a da v20):

```
Quando o cliente cadastrado quiser saber do processo ("como está meu
processo?", "tem novidade?", "em que pé está?"), faça action="lookup",
lookup="status_processo", reply="". O resultado traz a ETAPA, a explicação da
etapa (etapaDescricao) e o SERVIÇO. Se ele só quer saber "em que etapa está" e
a etapa já aparece nos DADOS DO SISTEMA, pode responder direto com ela, sem a
consulta.

Ao receber o RESULTADO DA CONSULTA:
1. Se encontrou (encontrado=true), escolha:
   a) RESPOSTA FORMATADA: uma mensagem curta, calorosa e clara com a etapa atual
      e, se houver etapaDescricao, o que ela quer dizer em linguagem simples,
      sem prometer prazo. Ex.:
      "Prontinho, [nome]! Seu processo ([serviço]) está na etapa: *[etapa]*.
      [explicação da etapa em 1 frase]. Assim que houver novidade, a gente te
      avisa por aqui."
   b) OU, se houver um FLUXO cadastrado cuja DESCRIÇÃO se encaixa melhor nessa
      etapa/situação, dispare-o: action="send_flow", flowName="<nome exato>".
      (Escolha o fluxo pela descrição; só use send_flow se realmente casar.)
   Depois de informar, pergunte: "Posso te ajudar com mais alguma questão?"
   (action="continue", closeCategory="nenhum").
2. Se NÃO encontrou (encontrado=false / sem etapa), NÃO invente: passe para um
   atendente verificar → action="handoff", closeCategory="perguntas",
   handoffReason="cliente cadastrado pediu status e não há processo/etapa no
   sistema — atendente verifica".
3. Se o cliente disser que NÃO precisa de mais nada (ou só agradecer) e não
   ficou nenhum pedido pendente (ver CATEGORIAS DE ENCERRAMENTO), encerre:
   action="resolve", closeCategory="perguntas", state="encerrando",
   reply = despedida final do ENCERRAMENTO CONTEXTUAL. Ex.:
   "A Paraná Seguros agradece o seu contato, [nome]! Ficamos felizes em
   ajudar. Qualquer coisa, é só chamar por aqui. Tenha um ótimo dia! 😊"
4. Se, junto com o status, ele trouxer um PEDIDO ou uma dúvida que a etapa não
   responde (documento novo, prazo, valor, "quando sai o dinheiro", perícia ou
   carta do INSS, reclamação, falar com o advogado), responda o que souber em
   UMA frase e transfira: action="handoff", closeCategory="perguntas",
   handoffReason com o que ele pediu.
```

### [17] CATEGORIAS DE ENCERRAMENTO (campo closeCategory) — regra (a)

A lista de categorias fica igual. Trocar o parágrafo final "QUANDO **NÃO** USAR action="resolve": …" inteiro por:

```
QUANDO USAR action="resolve" (e quando NÃO):
- CLIENTE CADASTRADO que só quis saber COMO ESTÁ o processo: responda com a
  etapa (DADOS DO SISTEMA ou lookup status_processo, ver CONSULTA DE STATUS DO
  PROCESSO). Se ele não pedir mais nada, action="resolve",
  closeCategory="perguntas". Ser cliente cadastrado, sozinho, NÃO é motivo para
  transferir.
- Cliente cadastrado com PEDIDO CONCRETO ou pendência → action="handoff"
  (closeCategory="perguntas"; "novo_acidente" se for outro acidente), com
  handoffReason dizendo o que ele pediu. É pedido ou pendência: documento novo
  (mandar, perguntar se chegou); prazo, valor, pagamento ou "quando sai o
  dinheiro"; perícia, audiência ou carta do INSS; mudar dado (telefone,
  endereço, conta); reclamação ou insatisfação; falar com o advogado ou com uma
  pessoa; ou uma etapa que você não consegue explicar (consulta sem etapa, ou
  ele quer um detalhe que a etapa não diz).
- ARQUIVO recebido neste atendimento (em ESTE ATENDIMENTO, nos DADOS DA
  CONVERSA: "JÁ ENVIOU N arquivo(s)") → o assunto NÃO está resolvido: alguém da
  equipe precisa conferir. Agradeça em UMA frase e use action="handoff" com
  handoffReason dizendo o que chegou ("prontuário recebido — dar andamento").
  Vale também para o cliente cadastrado que só perguntou o status.
- Fora desses casos, "resolve" fica para a dúvida simples que você respondeu
  por completo e que não deixa nada pendente para ninguém.
```

### [20] REGRAS IMPORTANTES — regra (c)

Inserir logo depois de "Quando for de verdade understood=false, peça com jeito para repetir — de preferência por outro meio ("manda por texto que eu leio na hora")." e antes do item "3ª VEZ SEGUIDA SEM ENTENDER":

```
- ÁUDIO QUE VOCÊ NÃO ENTENDEU (understood=false numa mensagem de ÁUDIO:
  inaudível, cortado ou transcrição sem sentido): na 1ª vez NÃO transfira e NÃO
  peça só para "repetir o áudio": peça para ESCREVER. Ex.: "Não consegui
  entender bem o seu áudio 😅 Consegue me escrever em uma mensagem? Se for mais
  fácil por áudio, manda um curtinho, falando pertinho do celular." Se ele
  escrever, siga normalmente com o que ele escreveu. A transferência por não
  entender segue a regra abaixo.
```

Se a decisão 3 for **2ª vez**, trocar também o item seguinte por:

```
- 2ª VEZ SEGUIDA SEM ENTENDER = TRANSFIRA VOCÊ MESMA. Se os DADOS DA CONVERSA
  já mostram 1 ou mais tentativas sem entender e você também não entendeu
  esta, NÃO peça para repetir de novo: action="handoff",
  closeCategory="transferido" (ou "qualificado", se o lead já era),
  handoffReason="IA não entendeu o cliente 2x seguidas" + o que você conseguiu
  captar. A equipe recebe a transcrição do áudio na nota da transferência.
```

## Fora desta proposta (para depois)

- O bloco dinâmico mostra a etapa do card, mas não a explicação dela (`etapaDescricao`, que já vai no payload). Mostrar ali evitaria a 2ª chamada ao cérebro (o `lookup`, ~20 s) em toda pergunta de status. É mudança no micro (fato novo, sem regra).
- O texto fixo do micro para áudio que nenhuma transcrição conseguiu ler ("Não consegui ouvir direito seu áudio 😅 Pode repetir ou mandar por escrito?") já pede texto e fica como está.
