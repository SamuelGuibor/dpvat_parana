// Utilitários de canais do chat da equipe.
//
// Dois tipos de canal:
//  - "general": o canal Geral, visível a todos.
//  - "dm:<idA>__<idB>": conversa direta entre dois usuários. Os ids são
//    ordenados para que o par (A,B) e (B,A) resulte SEMPRE no mesmo canal.

export const GENERAL_CHANNEL = 'general';

/** Id determinístico de uma conversa direta entre dois usuários. */
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('__')}`;
}

/** True se o canal é uma conversa direta (DM). */
export function isDmChannel(channelId: string): boolean {
  return channelId.startsWith('dm:');
}

/** Ids dos dois participantes de um canal de DM (ou null se não for DM). */
export function dmParticipants(channelId: string): [string, string] | null {
  if (!isDmChannel(channelId)) return null;
  const [a, b] = channelId.slice(3).split('__');
  if (!a || !b) return null;
  return [a, b];
}

// O controle de acesso a canais (que consulta membership no banco para canais
// custom) fica em `app/_shared/lib/chat-access.ts` — server-side.
