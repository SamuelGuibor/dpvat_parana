# Chat Relay (SSE) — worker Node no Railway

Este relay entrega as mensagens do chat da equipe em tempo real. Ele **não**
acessa o banco: o app Next (Vercel) persiste no Prisma e, em seguida, chama
`POST /broadcast` aqui; o relay reemite para os clientes conectados via SSE.

Se este serviço estiver fora do ar, o chat **continua funcionando** pelo
fallback de polling (SWR) no front — o SSE é só aceleração.

## Variáveis de ambiente

| Onde | Nome | Valor |
|------|------|-------|
| Railway (relay) | `CHAT_RELAY_SECRET` | segredo forte compartilhado |
| Railway (relay) | `ALLOWED_ORIGIN` | ex.: `https://seu-app.vercel.app` |
| Railway (relay) | `PORT` | fornecido pelo Railway |
| Vercel (Next)   | `CHAT_RELAY_URL` | URL pública do relay, ex.: `https://relay.up.railway.app` |
| Vercel (Next)   | `CHAT_RELAY_SECRET` | **o mesmo** segredo do relay |

> Enquanto `CHAT_RELAY_URL`/`CHAT_RELAY_SECRET` **não** estiverem setados na
> Vercel, o app ignora o relay e usa só polling — nada quebra.

## Contrato

- `GET /events?token=<userId>.<exp>.<hmac>` → abre SSE. O relay valida o HMAC
  (mesmo segredo) e o `exp`, extrai o `userId` e registra a conexão.
- `POST /broadcast` (header `x-relay-secret`) com body
  `{ channelId, recipients: string[], message }` → envia `message` como evento
  SSE para cada `recipients[i]` que estiver conectado.

O token é emitido por `GET /api/chat/token` no app Next
(`app/api/chat/token/route.ts`) e assinado em `app/_shared/lib/chat-relay.ts`.

## Implementação de referência (Express)

```js
// index.js  — depende só de "express"
const express = require('express');
const crypto = require('crypto');

const SECRET = process.env.CHAT_RELAY_SECRET || '';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const app = express();
app.use(express.json());

// userId -> Set<res>
const clients = new Map();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-relay-secret');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function verifyToken(token) {
  const [userId, exp, sig] = String(token || '').split('.');
  if (!userId || !exp || !sig) return null;
  if (Date.now() > Number(exp)) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${userId}.${exp}`).digest('hex');
  // timingSafeEqual exige buffers do mesmo tamanho
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

app.get('/events', (req, res) => {
  const userId = verifyToken(req.query.token);
  if (!userId) return res.status(401).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  // heartbeat para manter a conexão viva (proxies/Railway)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    const set = clients.get(userId);
    if (set) { set.delete(res); if (set.size === 0) clients.delete(userId); }
  });
});

app.post('/broadcast', (req, res) => {
  if (req.headers['x-relay-secret'] !== SECRET) return res.status(403).end();
  const { recipients = [], message } = req.body || {};
  const data = `data: ${JSON.stringify(message)}\n\n`;
  for (const uid of recipients) {
    const set = clients.get(uid);
    if (set) for (const client of set) client.write(data);
  }
  res.json({ ok: true, delivered: recipients.length });
});

app.get('/health', (_req, res) => res.json({ ok: true, connections: clients.size }));

app.listen(process.env.PORT || 3001, () => console.log('chat-relay up'));
```

## Notas
- O relay é stateless-ish (conexões em memória). Se rodar em múltiplas
  instâncias, um usuário conectado na instância A não recebe o `/broadcast`
  que chega na instância B. Para o volume atual, **1 instância** basta. Se
  precisar escalar, trocar o registro em memória por Redis pub/sub.
- Segurança: o segredo nunca vai ao cliente; o cliente só recebe o token
  curto (60s) assinado por ele.
