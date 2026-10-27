'use client';

// Detalhes técnicos da IA de operação (só Visão do Gestor), recolhidos abaixo
// do painel de rendimento: consultas frequentes, falhas por código, envios,
// fluxos parados, cards conduzidos, ferramentas e o texto dos pedidos. O texto
// (decisão 7) só carrega no clique.

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Loader2, MessageSquareText } from 'lucide-react';
import { getOpPromptsAction } from '@/app/_actions/op/metrics';
import type { OpMetricsView, OpPromptItem } from '@/app/_shared/lib/op/metrics';
import { STATUS_LABEL, fmtDateTime, openCard } from './op-ui';

const CLASS_LABEL: Record<string, string> = { consulta: 'Consulta', acao: 'Ação', conversa: 'Conversa' };

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {empty ? <p className="text-xs text-gray-400">Nada no período.</p> : children}
    </section>
  );
}

export function OpMetricsDetails({
  m,
  query,
}: {
  m: OpMetricsView;
  query: { dias?: number; de?: string; ate?: string; operatorId: string | null };
}) {
  const [prompts, setPrompts] = useState<{ itens: OpPromptItem[]; total: number; pagina: number; paginas: number; cortado: boolean } | null>(null);
  const [promptsLoading, setPromptsLoading] = useState(false);

  const nome = (id: string) => m.nomes[id] ?? id;
  const cardLabel = (id: string | null) => {
    if (!id) return '—';
    const c = m.cardsInfo[id];
    return c ? `#${c.cardNumber ?? '?'} ${c.nome ?? ''}`.trim() : 'card removido';
  };

  async function loadPrompts(pagina = 1) {
    setPromptsLoading(true);
    try {
      setPrompts(await getOpPromptsAction({ ...query, pagina }));
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar os pedidos. Só quem tem "Visão do Gestor" vê o texto.');
    } finally {
      setPromptsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-400">
        {m.totais.pedidos} pedido(s) · {m.totais.consultas} consulta(s) · {m.totais.acoes} ação(ões) · {m.totais.chamadas} chamada(s) de ferramenta ·
        latência somada {(m.totais.latenciaMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s · {m.totais.cardsTocados} card(s) só lidos
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Consultas mais frequentes" empty={!m.consultasFrequentes.length && !m.skills.length}>
          <ul className="space-y-1 text-xs">
            {m.skills.map((s) => <li key={`s-${s.skill}`} className="flex justify-between"><span className="font-mono">{s.skill.startsWith('(') ? s.skill : `/${s.skill}`}</span><span>{s.total}</span></li>)}
          </ul>
          {!!m.consultasFrequentes.length && (
            <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
              {m.consultasFrequentes.map((t) => <li key={t.tool} className="flex justify-between"><span className="font-mono">{t.tool}</span><span>{t.total}</span></li>)}
            </ul>
          )}
        </Section>

        <Section title="Falhas por código" empty={!m.falhas.length}>
          <ul className="space-y-1 text-xs">
            {m.falhas.map((f) => (
              <li key={`${f.tool}-${f.code}`} className="flex flex-wrap justify-between gap-1">
                <span><span className="font-mono">{f.tool}</span> · <span className="font-semibold text-rose-600">{f.code}</span></span>
                <span className="text-gray-500">{f.total}× · {f.operadores.map(nome).join(', ')}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Envios para fora (e-mail / WhatsApp)" empty={!m.aprovacoes.lista.length}>
          <p className="mb-2 text-[11px] text-gray-500">
            {Object.entries(m.aprovacoes.porStatus).map(([k, v]) => `${STATUS_LABEL[k] ?? k}: ${v}`).join(' · ')}
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {m.aprovacoes.lista.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <button type="button" className="truncate text-left text-indigo-700 hover:underline disabled:text-gray-500" disabled={!a.cardId} onClick={() => a.cardId && openCard(a.cardId)}>
                  {a.canal} · {cardLabel(a.cardId)}
                </button>
                <span className="shrink-0 text-gray-500">{STATUS_LABEL[a.status] ?? a.status} · {nome(a.operatorId)} · {fmtDateTime(a.criadaEm)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Cards conduzidos pela IA" empty={!m.cards.conduzidos.length}>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {m.cards.conduzidos.map((c) => (
              <li key={c.cardId} className="flex justify-between gap-2">
                <button type="button" className="truncate text-left text-indigo-700 hover:underline" onClick={() => openCard(c.cardId)}>
                  {cardLabel(c.cardId)} <span className="text-gray-400">· {m.cardsInfo[c.cardId]?.coluna ?? ''}</span>
                </button>
                <span className="shrink-0 text-gray-500">{c.acoes} ação(ões) · {c.operadores.map(nome).join(', ')} · {fmtDateTime(c.ultimo)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Ferramentas" empty={!m.ferramentas.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-gray-500">
              <tr><th className="py-1 pr-2">Ferramenta</th><th className="px-2">Nível</th><th className="px-2">Chamadas</th><th className="px-2">Ok</th><th className="px-2">Prévias</th><th className="px-2">Execuções</th><th className="px-2">Sem mudança</th><th className="px-2">Média</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {m.ferramentas.map((t) => (
                <tr key={t.tool}>
                  <td className="py-1 pr-2 font-mono">{t.tool}</td>
                  <td className="px-2">L{t.level}</td>
                  <td className="px-2">{t.total}</td>
                  <td className="px-2">{t.ok}</td>
                  <td className="px-2">{t.previas}</td>
                  <td className="px-2">{t.execucoes}</td>
                  <td className="px-2">{t.noop}</td>
                  <td className="px-2">{t.mediaMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Pedidos (texto)">
        <p className="mb-2 text-[11px] text-gray-500">
          O texto completo dos pedidos pode ter CPF e nome de cliente: só aparece para quem tem a Visão do Gestor, e só quando você pede.
        </p>
        <button
          type="button"
          onClick={() => loadPrompts(1)}
          disabled={promptsLoading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {promptsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
          {prompts ? 'Recarregar pedidos' : 'Mostrar pedidos'}
        </button>
        {prompts && (
          <div className="mt-3 space-y-2">
            {!prompts.itens.length && <p className="text-xs text-gray-400">Nenhum pedido no período.</p>}
            {prompts.itens.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-100 p-2">
                <p className="text-[11px] text-gray-500">
                  {fmtDateTime(p.criadoEm)} · {p.operador} · <span className="font-semibold">{CLASS_LABEL[p.classe]}</span>
                  {p.skill && <> · <span className="font-mono">/{p.skill}</span></>}
                  {!!p.ferramentas.length && <> · {p.ferramentas.join(', ')}</>}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-800">{p.texto}</p>
              </div>
            ))}
            {prompts.paginas > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" disabled={prompts.pagina <= 1 || promptsLoading} onClick={() => loadPrompts(prompts.pagina - 1)} className="rounded-lg bg-gray-100 p-1 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
                <span>Página {prompts.pagina} de {prompts.paginas} · {prompts.total} pedido(s){prompts.cortado ? ' (mostrando os 200 mais recentes)' : ''}</span>
                <button type="button" disabled={prompts.pagina >= prompts.paginas || promptsLoading} onClick={() => loadPrompts(prompts.pagina + 1)} className="rounded-lg bg-gray-100 p-1 disabled:opacity-40" aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
