import crypto from 'crypto';

// Integração com o relay SSE (worker Node no Railway).
//
// O Vercel/Next persiste no Prisma e, em seguida, avisa o relay via /broadcast.
// O relay mantém as conexões SSE em memória e reemite a mensagem aos
// destinatários conectados. Tudo aqui é best-effort: se o relay estiver fora,
// o chat continua funcionando pelo fallback de polling (SWR).

const RELAY_URL = process.env.CHAT_RELAY_URL?.replace(/\/$/, '') ?? '';
const RELAY_SECRET = process.env.CHAT_RELAY_SECRET ?? '';

// Janela de validade do token de conexão SSE.
const TOKEN_TTL_MS = 60_000;

export function isRelayConfigured(): boolean {
  return !!RELAY_URL && !!RELAY_SECRET;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', RELAY_SECRET).update(payload).digest('hex');
}

/**
 * Token curto assinado para o cliente abrir o EventSource:
 * `<userId>.<expEpochMs>.<hmac>`. O relay revalida com o mesmo segredo.
 * EventSource não permite headers custom, por isso vai na query string.
 */
export function signRelayToken(userId: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

interface BroadcastInput {
  channelId: string;
  recipients: string[];
  message: unknown;
}

// Teto do aviso ao relay. No WhatsApp o broadcast já roda depois da resposta
// (broadcastWhatsAppEvent → runAfterResponse); no chat interno ainda é
// aguardado no caminho do envio. Nos dois casos, sem prazo um relay travado
// prendia a função sem limite (auditoria de 24/09/2026). O relay responde em
// ~50-120 ms quando está bem.
const RELAY_TIMEOUT_MS = 1_500;

// "Entregue a 0 conexões" é o sintoma do tempo real que não chega (ninguém
// conectado, ids do token ≠ User.id, ALLOWED_ORIGIN errado). Acontece em quase
// todo evento quando está quebrado, então o aviso sai no máximo 1 vez por
// minuto por instância, para não afogar os logs da Vercel.
const ZERO_DELIVERY_WARN_EVERY_MS = 60_000;
let lastZeroDeliveryWarnAt = 0;

/** Notifica o relay sobre uma nova mensagem (não lança em caso de falha). */
export async function broadcastToRelay(input: BroadcastInput): Promise<void> {
  if (!isRelayConfigured()) return;
  try {
    const res = await fetch(`${RELAY_URL}/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-relay-secret': RELAY_SECRET,
      },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    // Sem isto um 401/403 (segredo divergente) ou 5xx do relay passava calado,
    // e o "tempo real não entrega" ficava sem pista nos logs da Vercel. Só o
    // canal vai para o log — nunca o corpo da mensagem (texto do cliente).
    if (!res.ok) {
      console.warn('[CHAT RELAY] /broadcast HTTP', res.status, input.channelId);
      return;
    }
    // O relay responde { ok, delivered } (D:\chat_site\index.js).
    const data = (await res.json().catch(() => null)) as { delivered?: unknown } | null;
    if (data?.delivered === 0) {
      const now = Date.now();
      if (now - lastZeroDeliveryWarnAt >= ZERO_DELIVERY_WARN_EVERY_MS) {
        lastZeroDeliveryWarnAt = now;
        console.warn('[CHAT RELAY] entregue a 0 conexões', input.channelId, input.recipients.length);
      }
    }
  } catch (err) {
    console.error('[CHAT RELAY] Falha ao notificar o relay:', err);
  }
}
