# API externa: conversa de WhatsApp por telefone

Endpoint HTTP para um **sistema de fora do CRM** (servidor a servidor, sem login). Você manda um token e o celular do lead. A API devolve, para cada linha de WhatsApp da empresa em que esse celular conversou:

- por qual número (linha) o lead chegou;
- tags, qualificação, desfecho, anúncio de origem e card do kanban;
- as mensagens com o **texto inteiro**, em ordem cronológica.

Ticket de origem: T-WOJYR (18/11/2026). Código: `app/api/external/whatsapp/messages/route.ts`.

---

## 1. Configuração de quem consome

Guarde duas variáveis no ambiente do **seu** sistema (nunca no código, nunca em repositório):

| Variável (sugestão) | Valor |
|---|---|
| `CRM_API_URL` | URL base do CRM, sem barra no fim. Produção: o mesmo domínio em que a equipe faz login no CRM. Local: `http://localhost:3000`. |
| `CRM_API_TOKEN` | O token `crmapi_...` recebido do responsável pelo CRM. |

Regras do token:
- Vai **só** no header `Authorization: Bearer <token>`. Na query string ele não vale e ainda vazaria para o log de acesso da Vercel.
- É de uso servidor a servidor. Nunca coloque o token em front-end, app ou planilha compartilhada. A API não libera CORS.
- Um token por sistema integrado. Assim dá para revogar um sem derrubar os outros.

---

## 2. Gerar, entregar e revogar o token (equipe do CRM)

Só o hash (sha256) fica no banco, na tabela `api_tokens`. O token em claro aparece **uma vez**, na geração.

```bash
# Ver os tokens (id, label, último uso, revogado)
node -r dotenv/config scripts/gerar-token-api.mjs --listar

# Gerar (sem --apply é só simulação). --saida grava o token num arquivo em vez de imprimir na tela
node -r dotenv/config scripts/gerar-token-api.mjs --gerar --label="Sistema X" --autor="<e-mail ou nome do membro>" --saida=token.txt --apply

# Revogar (vale na hora, sem deploy)
node -r dotenv/config scripts/gerar-token-api.mjs --revogar=<id> --apply
```

- O `.env` do repositório aponta para o banco de **produção**. Os comandos acima mexem nele.
- Entregue o token por um canal seguro (cofre de senhas, mensagem que expira) e apague o arquivo `--saida` depois.
- Token vazou ou o sistema foi desligado: revogue e gere outro.

---

## 3. Subir a API em outro deploy do CRM

A rota já vem no código. Num ambiente novo (outro banco ou outro projeto da Vercel), confira três coisas:

1. **Tabela `api_tokens` no banco.** É a migration `prisma/migrations/20261118170000_api_tokens`. Siga o fluxo seguro do repositório (`/migration`): `prisma db execute` com o `migration.sql`, depois `prisma migrate resolve --applied 20261118170000_api_tokens` e por fim `prisma generate`. Nunca rode `prisma migrate dev`.
2. **Prefixo liberado no middleware.** `"/api/external"` precisa estar em `PUBLIC_API_PREFIXES` (`middleware.ts`), e já está. Sem ele, o middleware devolve `401 {"error":"Não autenticado"}` antes de a rota rodar, porque ele pede sessão de login.
3. **Variáveis de ambiente.** A API não pede nenhuma env própria. Usa as que o CRM já tem: `DATABASE_URL` (o banco) e as `AWS_*` (só para `includeMedia=1`). Ver `.env.example`.

Depois do deploy, gere um token nesse ambiente (seção 2) e rode o checklist da seção 9.

---

## 4. Requisição

```
GET {CRM_API_URL}/api/external/whatsapp/messages?phone=5541999998888
Authorization: Bearer crmapi_...
```

| Parâmetro | Obrigatório | Padrão | O que faz |
|---|---|---|---|
| `phone` | sim | — | Celular do lead. Aceita máscara (`(41) 99999-8888`), com ou sem `55`, com ou sem o 9º dígito. O DDD é obrigatório. |
| `messages` | não | `1` | `0` devolve só os dados da conversa, sem `mensagens` nem `hasMore`. |
| `limit` | não | `100` | Mensagens por conversa, de 1 a 500. Valor acima de 500 vira 500; valor inválido vira 100. |
| `before` | não | — | Data ISO 8601 (UTC). Traz as `limit` mensagens **mais novas** anteriores a ela. |
| `after` | não | — | Data ISO 8601 (UTC). Traz as `limit` mensagens **mais antigas** posteriores a ela. |
| `numberId` | não | — | Filtra uma linha da empresa (o `linha.id` de uma resposta anterior). |
| `includeMedia` | não | `0` | `1` inclui `mediaUrl`, um link temporário do S3, em cada mensagem com arquivo. |

### Como o telefone é procurado
- O número é normalizado para `55 + DDD + número` e procurado por **igualdade**. O DDD nunca muda: o mesmo número com outro DDD é outra pessoa e dá 404.
- **Com e sem o 9º dígito** acham o mesmo contato, quando o número tem cara de celular.
- Número com cara de **fixo** (os 8 dígitos finais começam por 2, 3, 4 ou 5) é procurado só na forma exata. Pôr ou tirar o 9 ali acharia a conversa de outra pessoa.

### Paginação
- **Sem cursor:** as `limit` mensagens mais recentes de cada conversa.
- **Voltar no histórico:** mande `before` = `createdAt` da **primeira** mensagem recebida.
- **Avançar (sincronização incremental):** mande `after` = `createdAt` da **última** mensagem que você já tem. Comece com `after=2000-01-01T00:00:00.000Z` para ler a conversa inteira do início, sem pular nenhuma.
- `hasMore: true` quer dizer que o bloco veio cheio, e provavelmente há mais mensagens na direção do cursor.
- Com várias linhas, pagine **uma conversa por vez**, com `numberId`: o cursor vale para todas as conversas da resposta.

### Exemplo
```bash
curl -s "$CRM_API_URL/api/external/whatsapp/messages?phone=5541999998888&limit=50" \
  -H "Authorization: Bearer $CRM_API_TOKEN"
```

---

## 5. Resposta 200

Uma entrada em `conversas` para **cada linha da empresa** em que o celular conversou. A conversa mais recente vem primeiro. Dados fictícios:

```json
{
  "phone": "5541999998888",
  "conversas": [
    {
      "contactId": "cmabc123contato",
      "nome": "Maria da Silva",
      "telefone": "5541999998888",
      "linha": {
        "id": "cmlinha0001",
        "label": "Brasil Benefícios IA",
        "displayPhone": "5541988887777",
        "active": true
      },
      "tags": [
        { "name": "Qualificada", "color": "#10b981", "aplicadaEm": "2026-11-10T14:02:11.000Z" }
      ],
      "status": "closed",
      "qualified": true,
      "closeCategory": "qualificado",
      "closeLabel": "Qualificada",
      "closedAt": "2026-11-10T14:02:10.000Z",
      "atendente": "João Atendente",
      "botState": "coleta_documentos",
      "ultimaMensagemEm": "2026-11-12T18:30:00.000Z",
      "primeiroContatoEm": "2026-11-10T13:40:00.000Z",
      "optedOut": false,
      "importSource": null,
      "origem": {
        "adPlatform": "instagram",
        "adSourceType": "ad",
        "adSourceId": "120200000000000000",
        "adHeadline": "Sofreu acidente de trânsito?",
        "adSourceUrl": "https://www.instagram.com/p/xxxx"
      },
      "card": { "cardNumber": 5056, "coluna": "EM ANALISE UNI", "arquivadoEm": null },
      "hasMore": false,
      "mensagens": [
        {
          "id": "cmmsg001",
          "waMessageId": "wamid.HBgM...",
          "direction": "in",
          "autor": "cliente",
          "authorName": null,
          "body": "Oi, sofri um acidente de moto e quero saber dos meus direitos",
          "transcript": null,
          "mediaType": null,
          "hasMedia": false,
          "status": "read",
          "interactive": null,
          "replyToId": null,
          "editedAt": null,
          "createdAt": "2026-11-10T13:40:00.000Z"
        },
        {
          "id": "cmmsg002",
          "waMessageId": "wamid.HBgN...",
          "direction": "out",
          "autor": "bot",
          "authorName": "Bot",
          "body": "Olá, Maria! Sinto muito pelo acidente. Pode me contar quando aconteceu?",
          "transcript": null,
          "mediaType": null,
          "hasMedia": false,
          "status": "read",
          "interactive": null,
          "replyToId": null,
          "editedAt": null,
          "createdAt": "2026-11-10T13:40:20.000Z"
        }
      ]
    }
  ]
}
```

Com `includeMedia=1`, toda mensagem ganha também `mediaUrl` e `mediaUrlExpiresAt`. Nas mensagens sem arquivo, os dois vêm `null`. O link expira: baixe o arquivo na hora ou peça de novo.

---

## 6. Significado dos campos

**Conversa**

| Campo | Significado | Quando vem `null` |
|---|---|---|
| `contactId` | Id do contato no CRM (um por linha da empresa). | nunca |
| `nome` | Nome do contato no WhatsApp ou o que a equipe gravou. | sem nome |
| `telefone` | Como o número está gravado. Pode vir sem o 9º dígito. | nunca |
| `linha` | Número da empresa em que o lead conversou. `label` é o nome na tela Números do CRM (ex.: "Brasil Benefícios IA"); `displayPhone` é o número da linha; `active: false` é linha desativada (o histórico continua legível). | contato antigo sem linha; `displayPhone` vem `null` quando o número não foi cadastrado na tela Números |
| `tags` | Tags da conversa, com a data em que cada uma foi aplicada. | `[]` sem tag |
| `status` | `bot` (a IA está atendendo), `queued` (na fila, esperando atendente), `human` (com atendente), `standby` (o cliente sumiu; está em recuperação), `closed` (encerrada). | contato sem conversa (ex.: importado que nunca escreveu) |
| `qualified` | Valor cru gravado no encerramento: `true` = qualificada, `false` = não qualificada. | nunca foi gravado (em andamento, ou encerrada sem marcar) |
| `closeCategory` | Desfecho do último encerramento: `qualificado`, `nao_qualificado`, `nq_<motivo>` (não qualificado por um motivo específico), `perguntas`, `novo_acidente`, `transferido`, `sem_resposta`… | em andamento ou nunca encerrada |
| `closeLabel` | O mesmo desfecho em texto legível. | quando `closeCategory` é `null` |
| `closedAt` | Quando aconteceu o último encerramento (UTC). Só faz sentido junto com `status: "closed"`. | nunca encerrada |
| `atendente` | Nome do atendente responsável. | sem atendente |
| `botState` | Etapa em que a IA parou (ex.: `triagem_seguro`, `coleta_cpf`). Valor interno. | sem etapa |
| `ultimaMensagemEm` / `primeiroContatoEm` | Última mensagem da conversa / primeira vez que o número apareceu nessa linha (UTC). | `ultimaMensagemEm`: sem conversa |
| `optedOut` | `true` = o cliente pediu para não receber mais mensagens. | nunca |
| `importSource` | `botconversa` = contato importado da migração de 18/08/2026. | contato orgânico |
| `origem` | Anúncio Click-to-WhatsApp da **primeira** mensagem (first touch): plataforma (`facebook`/`instagram`), tipo (`ad`/`post`/`page`), id, título e link. | sem anúncio |
| `card` | Card do kanban ligado ao contato: número, coluna atual e `arquivadoEm` (`null` = ativo). | contato sem card |

**Mensagem**

| Campo | Significado |
|---|---|
| `direction` | `in` = o cliente mandou; `out` = a empresa mandou. |
| `autor` | `cliente`, `bot` (IA), `equipe` (atendente) ou `sistema` (automação do kanban, aviso de andamento, cobrança, recuperação). |
| `authorName` | Nome do atendente em `equipe`, `"Bot"` em `bot` e `null` nos outros casos. |
| `body` | Texto **inteiro**, sem corte. Pode ser `null` em mídia sem legenda. |
| `transcript` | Transcrição do áudio, quando já foi feita. |
| `mediaType` / `hasMedia` | Tipo do arquivo (`image/jpeg`, `audio/ogg`…) e se a mensagem tem arquivo. O arquivo nunca vem no corpo: use `includeMedia=1`. |
| `status` | Entrega: `sent`, `delivered`, `read` ou `failed`. |
| `interactive` | Formulário do WhatsApp. Enviado: `{ kind: "flow", flowName, cta, header, footer }`. Respondido: `{ kind: "flow_reply", flowName, fields: [{ key, label, value }] }`, com o que o cliente preencheu. Nas outras mensagens, `null`. |
| `replyToId` | Id da mensagem que esta responde (citação). |
| `editedAt` / `createdAt` | Datas em ISO 8601, UTC. |

**Nunca saem:** notas internas da equipe, mensagens apagadas, CPF e demais campos do cadastro do cliente, ficha preenchida pela IA, rascunho de cadastro, campos internos do formulário (token, ids, motivo da fila), dados técnicos do anúncio (`ctwaClid`, payload cru) e credenciais das linhas.

**Saem inteiros:** o texto que o cliente escreveu e as respostas de formulário. Se ele digitou CPF, RG ou endereço na conversa, isso vem no `body` e em `interactive.fields`. Trate a resposta como dado pessoal (LGPD): guarde só o necessário, com acesso restrito.

---

## 7. Erros

| HTTP | Corpo | Quando |
|---|---|---|
| 400 | `{"error":"phone inválido…"}` | `phone` ausente ou fora do formato; `before`/`after` sem data válida; `numberId` com caractere estranho |
| 401 | `{"error":"Token da API ausente, inválido ou revogado."}` | sem header, token errado, token revogado ou token só na query. A mensagem é a mesma nos três casos, de propósito |
| 401 | `{"error":"Não autenticado"}` | o prefixo `/api/external` não está liberado no middleware desse deploy (seção 3) |
| 404 | `{"error":"Nenhuma conversa de WhatsApp com este telefone."}` | nenhum contato com esse número (ou com esse `numberId`) |
| 429 | `{"error":"Muitas requisições. Espere um minuto."}` | estourou o limite (seção 8) |
| 500 | `{"error":"Falha ao carregar. Tente de novo."}` | erro interno; fica registrado no CRM como `critical_error` |

---

## 8. Limites e auditoria

- **60 requisições por minuto por token** e 120 por minuto por IP. O contador fica em memória em cada instância da Vercel, então o limite real pode ser um pouco maior. Não conte com isso.
- Cada chamada autenticada (200 e 404) gera um log `api_wa_messages` no CRM, com o token usado, o telefone e o número de mensagens. O log é apagado depois de 6 meses. O `lastUsedAt` do token é atualizado a cada 5 minutos, no máximo.
- Para sincronizar muitos leads, espace as chamadas e use `after` para buscar só o que é novo.

---

## 9. Checklist de teste

```bash
# 401: sem token
curl -s -o /dev/null -w "%{http_code}\n" "$CRM_API_URL/api/external/whatsapp/messages?phone=5541999998888"

# 200: token válido + telefone com conversa
curl -s -w "\n%{http_code}\n" "$CRM_API_URL/api/external/whatsapp/messages?phone=<celular com conversa>&limit=5" \
  -H "Authorization: Bearer $CRM_API_TOKEN"

# 200 sem mensagens
curl -s "$CRM_API_URL/api/external/whatsapp/messages?phone=<celular>&messages=0" -H "Authorization: Bearer $CRM_API_TOKEN"

# 404: número sem conversa (troque o DDD do celular acima)
curl -s -o /dev/null -w "%{http_code}\n" "$CRM_API_URL/api/external/whatsapp/messages?phone=5599999998888" \
  -H "Authorization: Bearer $CRM_API_TOKEN"
```

O que conferir:
- O mesmo celular com e sem o 9º dígito devolve os mesmos `contactId`.
- Nenhuma nota interna aparece: compare com a conversa aberta no inbox do CRM.
- Depois de revogar o token, a mesma chamada dá 401.

Do lado do CRM, `node -r dotenv/config scripts/diag-api-externa-mensagens.mjs --saida=<arquivo>` (só leitura) escolhe um telefone de amostra com 2 linhas, nota interna e mensagem apagada. Ele grava o telefone no arquivo, mostra quantas mensagens a API deve devolver por contato e lista os últimos logs `api_wa_messages`.
