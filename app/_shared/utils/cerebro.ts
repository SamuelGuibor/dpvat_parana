// Quadro "Cérebro APP" (Tickets Dev + conhecimento da operação): listas,
// fluxo e a comparação hoje × proposta. Puro, compartilhado pelas server
// actions (app/_actions/dev-tickets/ticket-actions.ts) e pela UI
// (app/nova-dash/tickets/). Testado em tests/cerebro.test.ts.

import { extractContacts, normEmail, normPhone, normUrl } from "./contacts";

export const TICKET_TYPES = ["BUG", "ALTERACAO", "MELHORIA", "OUTRO", "CONHECIMENTO", "LACUNA", "DESATUALIZADO"] as const;
/** Tipos de conhecimento: só quem tem manage_knowledge assume/move; passam por VALIDACAO_IA. */
export const KNOWLEDGE_TYPES = ["CONHECIMENTO", "LACUNA", "DESATUALIZADO"] as const;
/** Tipos que a pessoa escolhe no "Novo ticket" (os de conhecimento nascem do "Sugerir" ou do sistema). */
export const MANUAL_TICKET_TYPES = ["BUG", "ALTERACAO", "MELHORIA", "OUTRO"] as const;

export const TICKET_STATUS_FLOW = ["EM_DISTRIBUICAO", "EM_ANALISE", "EM_DESENVOLVIMENTO", "VALIDACAO_IA", "CONCLUIDO"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUS_FLOW)[number];

export const isKnowledgeType = (t: string) => (KNOWLEDGE_TYPES as readonly string[]).includes(t);

/** Próxima fase: ticket comum pula a Validação IA (ela é só do conhecimento). */
export function nextStatus(type: string, status: string): TicketStatus | null {
  switch (status) {
    case "EM_DISTRIBUICAO":
      return "EM_ANALISE";
    case "EM_ANALISE":
      return "EM_DESENVOLVIMENTO";
    case "EM_DESENVOLVIMENTO":
      return isKnowledgeType(type) ? "VALIDACAO_IA" : "CONCLUIDO";
    case "VALIDACAO_IA":
      return "CONCLUIDO";
    default:
      return null;
  }
}

/** Fases permitidas para o tipo (ticket comum não entra em VALIDACAO_IA). */
export function statusesFor(type: string): TicketStatus[] {
  return TICKET_STATUS_FLOW.filter((s) => s !== "VALIDACAO_IA" || isKnowledgeType(type));
}

/** "cmh3x…k2p9" → "C-K2P9" (prefixo pelo tipo): id curto para copiar no comando da IA. */
export function shortTicketId(id: string, type: string): string {
  const p = type === "LACUNA" ? "L" : type === "DESATUALIZADO" ? "D" : isKnowledgeType(type) ? "C" : "T";
  return `${p}-${id.slice(-5).toUpperCase()}`;
}

// ---------------------------------------------------------------- meta do card

export type Comparacao = {
  campo: "e-mail" | "telefone" | "link";
  hoje: string[];
  proposta: string[];
  situacao: "igual" | "novo" | "conflito" | "sem_mudanca";
};

export type ConferenciaDecisao = { decisao: "confere" | "devolver"; obs?: string; por: string; em: string };

export type CerebroMeta = {
  /** Chave de deduplicação dos cards automáticos: lacuna:<hospital> · desatualizado:<nota> · lote:<id>. */
  chave?: string;
  hospital?: string;
  nota?: string;
  automacoes?: { id: string; nome: string }[];
  /** Texto vivo da automação no momento da sugestão. */
  hoje?: string;
  proposta?: string;
  evidencia?: string;
  comparacao?: Comparacao[];
  cardsAtivos?: number;
  lote?: {
    id: string;
    aprovadas: number;
    devolvidas: number;
    pendentes: number;
    amostra: string[];
    decisoes?: Record<string, ConferenciaDecisao>;
  };
  historico?: { texto: string; em: string; por?: string }[];
};

/**
 * Compara contatos do texto de hoje (automação) com a proposta, por tipo:
 * igual · novo (não existia) · conflito (existia e é outro) · sem_mudanca
 * (a proposta não fala desse tipo). Só contatos: o resto do texto o humano lê.
 */
export function compararContatos(hoje: string, proposta: string): Comparacao[] {
  const a = extractContacts(hoje ?? "");
  const b = extractContacts(proposta ?? "");
  const tipos: [Comparacao["campo"], string[], string[], (s: string) => string][] = [
    ["e-mail", a.email, b.email, normEmail],
    ["telefone", a.telefone, b.telefone, normPhone],
    ["link", a.site, b.site, normUrl],
  ];
  return tipos
    .filter(([, h, p]) => h.length || p.length)
    .map(([campo, h, p, norm]) => {
      let situacao: Comparacao["situacao"];
      if (!p.length) situacao = "sem_mudanca";
      else if (!h.length) situacao = "novo";
      else {
        const hs = new Set(h.map(norm));
        situacao = p.every((x) => hs.has(norm(x))) ? "igual" : "conflito";
      }
      return { campo, hoje: h, proposta: p, situacao };
    });
}

export const temConflito = (m: CerebroMeta | null | undefined) => Boolean(m?.comparacao?.some((c) => c.situacao === "conflito"));
