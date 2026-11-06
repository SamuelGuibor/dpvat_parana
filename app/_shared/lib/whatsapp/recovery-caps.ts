// Teto de provocações do ciclo de recuperação (status "standby") POR NÚMERO
// da empresa. Módulo compartilhado entre o cron (que decide quantas mandar) e
// o inbox (pill "Nª de N") — sem 'use server' de propósito: são só constantes.
//
// 19/08/2026: aviso de spam da Meta nominal na WABA "Paraná Seguros"
// (1578951027140630) — o número "Seguros Paraná IA" caiu pra 2 provocações
// (1 texto livre na janela de 24h + a despedida em template).
// 03/09/2026: voltou pra 3 (2 textos + despedida). Os demais números seguem
// no teto padrão. Chave = phoneNumberId da Meta (estável e visível no
// painel; o cuid do banco não é).

export const RECOVERY_MAX_ATTEMPTS_DEFAULT = 4;

export const RECOVERY_MAX_BY_PHONE_NUMBER_ID: Record<string, number> = {
  '1267705099752954': 3, // Seguros Paraná IA
};

// Ritmo da recuperação (decisão do dono, 05/11/2026, T-IFYLF): o teto de 60/dia
// acabava às 08:30 com a fila automática e a cobrança que o atendente programou
// esperava dias. Agora 800/dia, UM envio por minuto das 7h às 21h: o cron roda a
// cada minuto nesse horário e cada rodada manda no máximo um. 55 s, e não 60:
// o disparo do cron varia alguns segundos e um minuto inteiro pularia rodadas.
export const RECOVERY_DAILY_CAP_DEFAULT = 800;
export const RECOVERY_MIN_SEND_GAP_MS = 55_000;

/** Pode sair outra provocação agora? (intervalo global, entre todas as conversas e linhas) */
export function recoveryGapOk(lastSentAt: Date | null, now: number): boolean {
  return !lastSentAt || now - lastSentAt.getTime() >= RECOVERY_MIN_SEND_GAP_MS;
}

export function recoveryCapForPhoneNumberId(phoneNumberId: string): number {
  return RECOVERY_MAX_BY_PHONE_NUMBER_ID[phoneNumberId] ?? RECOVERY_MAX_ATTEMPTS_DEFAULT;
}
