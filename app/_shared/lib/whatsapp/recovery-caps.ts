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

export function recoveryCapForPhoneNumberId(phoneNumberId: string): number {
  return RECOVERY_MAX_BY_PHONE_NUMBER_ID[phoneNumberId] ?? RECOVERY_MAX_ATTEMPTS_DEFAULT;
}
