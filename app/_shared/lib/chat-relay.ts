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

// Teto do aviso ao relay. O broadcast é aguardado no caminho do envio (sem
// waitUntil, promise solta pode ser congelada quando a função responde), e
// sem prazo um relay travado prendia o envio do atendente sem limite
// (auditoria de 24/09/2026). O relay responde em ~50-120 ms quando está bem.
const RELAY_TIMEOUT_MS = 1_500;

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
    // Sem isto um 401 (segredo divergente) ou 5xx do relay passava calado, e o
    // "tempo real não entrega" ficava sem pista nos logs da Vercel.
    if (!res.ok) console.error(`[CHAT RELAY] Relay respondeu ${res.status} ao broadcast.`);
  } catch (err) {
    console.error('[CHAT RELAY] Falha ao notificar o relay:', err);
  }
}
