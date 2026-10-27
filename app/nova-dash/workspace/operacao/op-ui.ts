// Utilitários de UI do painel da IA de operação (rendimento + detalhes).

export const STATUS_LABEL: Record<string, string> = {
  executada: 'executada', expirada: 'expirada', pendente: 'pendente', enviando: 'enviando', falhou: 'falhou', cancelada: 'cancelada',
  em_andamento: 'em andamento', bloqueado: 'bloqueado', concluido: 'concluído', abandonado: 'abandonado',
};

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

/** "3h 20m", "45 min", "0 min". */
export function fmtMinutos(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
}

/** "há 5 min", "há 2 h", "ontem 14:30", "25/10 09:12". */
export function fmtQuando(iso: string, agora = Date.now()) {
  const diffMin = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 12 * 60) return `há ${Math.round(diffMin / 60)} h`;
  return fmtDateTime(iso);
}

export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function openCard(id: string) {
  // O board está desmontado nesta aba: o sessionStorage segura o pedido ANTES
  // do evento (mesmo padrão da caixa de Menções e da busca global).
  const payload = { id, isProcess: false };
  try { sessionStorage.setItem('kanban-open-card', JSON.stringify(payload)); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('open-kanban-card', { detail: payload }));
}
