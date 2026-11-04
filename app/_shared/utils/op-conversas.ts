// Filtros de conversa do WhatsApp para a IA de operação (listar_conversas e
// preparar_whatsapp com `conversas`): mandar mensagem a QUALQUER contato do
// inbox, não só a quem tem card. Puro e testado em tests/op-conversas.test.ts;
// o SQL fica em app/_shared/lib/op/conversas.ts.
//
// As pastas espelham o inbox (WhatsAppInbox.tsx: pastas derivadas de
// `status`): fila = queued, atendimento = human, recuperação = standby.

import { brDayKey } from "./date-br";

export const PASTAS_CONVERSA = ["bot", "fila", "atendimento", "recuperacao", "encerradas"] as const;
export type PastaConversa = (typeof PASTAS_CONVERSA)[number];

export const STATUS_DA_PASTA: Record<PastaConversa, string> = {
  bot: "bot",
  fila: "queued",
  atendimento: "human",
  recuperacao: "standby",
  encerradas: "closed",
};

export const PASTA_DO_STATUS: Record<string, PastaConversa> = Object.fromEntries(
  Object.entries(STATUS_DA_PASTA).map(([p, s]) => [s, p as PastaConversa]),
) as Record<string, PastaConversa>;

/** Qual data o período filtra. */
export const CAMPOS_DATA = ["ultima_mensagem", "ultima_do_cliente", "inicio_conversa"] as const;
export type CampoData = (typeof CAMPOS_DATA)[number];

/** Teto de uma página de listar_conversas. */
export const CONVERSAS_LIMITE_MAX = 200;
/** Padrão de "não repetir": contato que recebeu mensagem aprovada pela IA nas últimas N horas fica de fora. */
export const SEM_REPETIR_HORAS_PADRAO = 12;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * "hoje" | "ontem" | "anteontem" | "-3" (há 3 dias) | "AAAA-MM-DD" | "DD/MM/AAAA"
 * → chave de dia de Brasília. Inválido → null (quem chama recusa; nunca vira
 * "sem filtro" em silêncio).
 */
export function resolveDia(ref: string, now: Date = new Date()): string | null {
  const t = ref.trim().toLowerCase();
  const back = (n: number) => brDayKey(new Date(now.getTime() - n * 86_400_000));
  if (t === "hoje") return back(0);
  if (t === "ontem") return back(1);
  if (t === "anteontem") return back(2);
  const rel = /^-(\d{1,3})$/.exec(t);
  if (rel) return back(Number(rel[1]));
  if (DAY_RE.test(t)) return validDay(t);
  const dmy = DMY_RE.exec(t);
  if (dmy) return validDay(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
  return null;
}

function validDay(key: string): string | null {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? key : null;
}

/** Período inclusivo; sem `ate` = até hoje; `ate` antes de `desde` → erro. */
export function resolvePeriodo(desde: string | undefined, ate: string | undefined, now: Date = new Date()): { de: string; ate: string } | { erro: string } | null {
  if (!desde && !ate) return null;
  const de = desde ? resolveDia(desde, now) : null;
  if (desde && !de) return { erro: `data inválida em desde: "${desde}" (use hoje, ontem, -3, AAAA-MM-DD ou DD/MM/AAAA)` };
  const fim = ate ? resolveDia(ate, now) : brDayKey(now);
  if (ate && !fim) return { erro: `data inválida em ate: "${ate}" (use hoje, ontem, -3, AAAA-MM-DD ou DD/MM/AAAA)` };
  const inicio = de ?? "2000-01-01";
  if (fim! < inicio) return { erro: "ate é anterior a desde" };
  return { de: inicio, ate: fim! };
}

/**
 * Quem pode receber AGORA, na régua do sendSystemWhatsApp (antecipa o
 * planWhatsAppSend sem template): texto livre só com janela aberta; fora dela
 * só template e só com opt-in.
 */
type Estado = { optedOut: boolean; optedIn: boolean; janelaAberta: boolean; linhaAtiva: boolean; templatesPausados?: boolean };

export function alcance(c: Estado): "texto" | "so_template" | "bloqueado" {
  return motivoBloqueio(c) ? "bloqueado" : c.janelaAberta ? "texto" : "so_template";
}

/** Fora da janela só sai template: linha com templates pausados (WhatsAppNumber.templatesPaused) também bloqueia. */
export function motivoBloqueio(c: Estado): string | null {
  if (c.optedOut) return "opt_out";
  if (!c.linhaAtiva) return "linha_inativa";
  if (c.janelaAberta) return null;
  if (!c.optedIn) return "janela_fechada_sem_opt_in";
  if (c.templatesPausados) return "templates_pausados";
  return null;
}
