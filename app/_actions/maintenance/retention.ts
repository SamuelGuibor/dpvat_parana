"use server";

import { db } from "../../_shared/lib/prisma";

/**
 * Retenção automática das tabelas de histórico (cron /api/maintenance/retention).
 *
 * Nem `Notification` nem `logs` são "dados do escritório" — são rastros de
 * operação que crescem para sempre e que a tela quase não alcança. Juntas já
 * somam 144 MB (135 mil + 110 mil linhas) num banco de ~300 MB, e o custo da
 * Neon é dominado por tráfego/armazenamento desse tipo de tabela.
 *
 * As duas regras abaixo são conservadoras de propósito: apagam só o que
 * comprovadamente nenhuma tela lê (ver comentários de cada uma).
 */

/** Sino: lidas somem em 30 dias; qualquer uma some em 90. */
const NOTIF_READ_RETENTION_DAYS = 30;
const NOTIF_MAX_RETENTION_DAYS = 90;

/** Logs operacionais do WhatsApp: 6 meses. */
const LOG_RETENTION_DAYS = 180;

/**
 * Ações de log PURGÁVEIS. Só o rastro operacional do atendimento por WhatsApp,
 * que alimenta métricas sempre consultadas por período (Chatbot/Equipe/Setores).
 *
 * O que NÃO está aqui fica para sempre, de propósito:
 *  - `move` é lido SEM limite de data pelo Relatório de Pastas
 *    (folder-report.ts), que procura a PRIMEIRA entrada de cada card numa
 *    coluna — um card de julho movido hoje precisa do log de julho;
 *  - `archive`/`status_change`/`create`/`update` e os de documento/comentário
 *    são o histórico do card, que o time consulta na própria ficha.
 */
const PURGEABLE_LOG_ACTIONS = [
  "wa_bot",
  "wa_text",
  "wa_ficha_ai",
  "wa_return_bot",
  "wa_template",
  "wa_flow",
  "wa_transcribe",
  "wa_summary",
  "wa_suggest",
  "wa_media",
  "wa_note",
];

export interface RetentionResult {
  notificationsRead: number;
  notificationsOld: number;
  logs: number;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * O sino (/api/notification) só devolve as 50 últimas de cada usuário — hoje
 * são 17 usuários, ou seja 850 linhas alcançáveis de 135.862 existentes. As
 * outras 135 mil são invisíveis pela interface e nunca mais serão lidas.
 *
 * A rastreabilidade de "de onde veio" não mora aqui: menções e tarefas têm a
 * tabela `mentions` própria, justamente porque o sino é volátil (o usuário
 * limpa quando quer). Nada de métrica agrega Notification.
 *
 * Os dois únicos outros leitores são janelas curtas de deduplicação de aviso
 * (3 minutos em service.ts, horas em cron-tasks.ts) — muito abaixo do corte.
 */
export async function purgeOldNotifications(): Promise<{ read: number; old: number }> {
  const [readResult, oldResult] = await Promise.all([
    db.notification.deleteMany({
      where: { read: true, createdAt: { lt: daysAgo(NOTIF_READ_RETENTION_DAYS) } },
    }),
    // Rede de segurança: não-lida parada há 3 meses é aviso abandonado.
    db.notification.deleteMany({
      where: { createdAt: { lt: daysAgo(NOTIF_MAX_RETENTION_DAYS) } },
    }),
  ]);
  return { read: readResult.count, old: oldResult.count };
}

/** Apaga os logs operacionais de WhatsApp com mais de 180 dias. */
export async function purgeOldLogs(): Promise<number> {
  const result = await db.log.deleteMany({
    where: {
      action: { in: PURGEABLE_LOG_ACTIONS },
      createdAt: { lt: daysAgo(LOG_RETENTION_DAYS) },
    },
  });
  return result.count;
}

export async function runRetention(): Promise<RetentionResult> {
  const notifications = await purgeOldNotifications();
  const logs = await purgeOldLogs();
  return {
    notificationsRead: notifications.read,
    notificationsOld: notifications.old,
    logs,
  };
}
