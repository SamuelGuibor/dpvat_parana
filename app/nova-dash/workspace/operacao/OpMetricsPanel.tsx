'use client';

// Painel "Operação por IA" (Etapa 7), acima dos interruptores na seção IA de
// operação do Espaço de Trabalho. Mostra, por período (dias de Brasília) e por
// operador, o que a equipe fez pelo Claude Code: pedidos, consultas, ações,
// tempo, ferramentas, falhas, aprovações, fluxos parados e cards conduzidos.
//
// Só manager_dashboard (o Workspace só monta com a permissão; as actions
// conferem no servidor). Lê por server action, nunca por /api/op (pública no
// middleware). Sem poll: carrega ao abrir e no "Atualizar". O texto dos
// pedidos (decisão 7) só carrega no clique.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, HelpCircle, Loader2, MessageSquareText, RefreshCw } from 'lucide-react';
import { getOpMetricsAction, getOpPromptsAction, type OpMetricsPayload } from '@/app/_actions/op/metrics';
import type { OpPromptItem } from '@/app/_shared/lib/op/metrics';

type Preset = 7 | 30 | 90 | 'custom';

const CLASS_LABEL: Record<string, string> = { consulta: 'Consulta', acao: 'Ação', conversa: 'Conversa' };
const STATUS_LABEL: Record<string, string> = {
  executada: 'executada', expirada: 'expirada', pendente: 'pendente', enviando: 'enviando', falhou: 'falhou', cancelada: 'cancelada',
  em_andamento: 'em andamento', bloqueado: 'bloqueado', concluido: 'concluído', abandonado: 'abandonado',
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

function fmtMin(min: number) {
  if (min < 60) return `${min.toLocaleString('pt-BR')} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${Math.round(min - h * 60)} min`;
}

function openCard(id: string) {
  // O board está desmontado nesta aba: o sessionStorage segura o pedido ANTES
  // do evento (mesmo padrão da caixa de Menções e da busca global).
  const payload = { id, isProcess: false };
  try { sessionStorage.setItem('kanban-open-card', JSON.stringify(payload)); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('open-kanban-card', { detail: payload }));
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'red' | 'green' }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2" title={hint}>
      <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
        {label}
        {hint && <HelpCircle className="h-3 w-3 text-gray-300" />}
      </p>
      <p className={`text-lg font-bold ${tone === 'red' ? 'text-rose-600' : tone === 'green' ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {empty ? <p className="text-xs text-gray-400">Nada no período.</p> : children}
    </section>
  );
}

export function OpMetricsPanel() {
  const [preset, setPreset] = useState<Preset>(7);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [operatorId, setOperatorId] = useState<string>('');
  const [data, setData] = useState<OpMetricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompts, setPrompts] = useState<{ itens: OpPromptItem[]; total: number; pagina: number; paginas: number; cortado: boolean } | null>(null);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [incluirConversas, setIncluirConversas] = useState(false);

  const query = useMemo(
    () => ({
      ...(preset === 'custom' ? { de: de || undefined, ate: ate || undefined } : { dias: preset }),
      operatorId: operatorId || null,
    }),
    [preset, de, ate, operatorId],
  );

  const load = useCallback(() => {
    if (preset === 'custom' && !de) return;
    setLoading(true);
    setError(null);
    setPrompts(null);
    getOpMetricsAction(query)
      .then(setData)
      .catch((err) => {
        console.error(err);
        // Produção mascara o erro da action: mensagem própria.
        setError('Não foi possível carregar as métricas da IA de operação. Confira o período (até 90 dias) e tente de novo.');
      })
      .finally(() => setLoading(false));
  }, [query, preset, de]);
  useEffect(load, [load]);

  async function loadPrompts(pagina = 1, conversas = incluirConversas) {
    setPromptsLoading(true);
    try {
      setPrompts(await getOpPromptsAction({ ...query, incluirConversas: conversas, pagina }));
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar os pedidos. Só quem tem "Visão do Gestor" vê o texto.');
    } finally {
      setPromptsLoading(false);
    }
  }

  const m = data?.metrics;
  const def = data?.definicoes;
  const nome = (id: string) => m?.nomes[id] ?? id;
  const cardLabel = (id: string | null) => {
    if (!id) return '—';
    const c = m?.cardsInfo[id];
    return c ? `#${c.cardNumber ?? '?'} ${c.nome ?? ''}`.trim() : 'card removido';
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Activity className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-900">Operação por IA — rendimento</h2>
          <p className="text-sm text-gray-500">
            O que cada pessoa fez pelo app (Claude Code), em dias de Brasília. Passe o mouse sobre um número para ver a definição.
            Conversas e desenvolvimento ficam fora de &quot;pedidos&quot;.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setPreset(d)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${preset === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {d} dias
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreset('custom')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${preset === 'custom' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Período
        </button>
        {preset === 'custom' && (
          <>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs" aria-label="De" />
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs" aria-label="Até" />
          </>
        )}
        <select
          value={operatorId}
          onChange={(e) => setOperatorId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Operador"
        >
          <option value="">Todos os operadores</option>
          {data?.operadores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar
        </button>
        {m && <span className="text-[11px] text-gray-400">{m.periodo.de.split('-').reverse().join('/')} a {m.periodo.ate.split('-').reverse().join('/')} · {m.periodo.dias} dia(s)</span>}
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!m && loading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}

      {m && def && (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {m.cortado && (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Período muito cheio: algumas listas foram cortadas. Use um período menor.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Pedidos" value={m.totais.pedidos} hint={def.pedidos} />
            <Stat label="Consultas" value={m.totais.consultas} hint={def.consultas} />
            <Stat label="Ações" value={m.totais.acoes} hint={def.acoes} />
            <Stat label="Cards conduzidos" value={m.totais.cardsConduzidos} hint={def.cardsConduzidos} tone="green" />
            <Stat label="Falhas" value={m.totais.falhas} hint={def.falhas} tone={m.totais.falhas ? 'red' : undefined} />
            <Stat label="Tempo ativo" value={fmtMin(m.totais.minutosAtivos)} hint={def.minutosAtivos} />
          </div>
          <p className="text-[11px] text-gray-400" title={def.conversas}>
            {m.totais.conversas} conversa(s) fora da conta · {m.totais.chamadas} chamada(s) de ferramenta · latência somada{' '}
            {(m.totais.latenciaMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s · {m.totais.cardsTocados} card(s) só lidos
          </p>

          <Section title="Por operador" empty={!m.operadores.length}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-gray-500">
                  <tr>
                    <th className="py-1 pr-2">Operador</th>
                    <th className="px-2" title={def.pedidos}>Pedidos</th>
                    <th className="px-2" title={def.consultas}>Consultas</th>
                    <th className="px-2" title={def.acoes}>Ações</th>
                    <th className="px-2" title={def.cardsConduzidos}>Cards</th>
                    <th className="px-2" title={def.aprovacoes}>Envios (exec./exp.)</th>
                    <th className="px-2" title={def.falhas}>Falhas</th>
                    <th className="px-2" title={def.fluxos}>Fluxos abertos</th>
                    <th className="px-2" title={def.minutosAtivos}>Tempo</th>
                    <th className="px-2">Sessões</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {m.operadores.map((o) => (
                    <tr key={o.operatorId}>
                      <td className="py-1.5 pr-2 font-medium text-gray-900">{nome(o.operatorId)}</td>
                      <td className="px-2">{o.pedidos}</td>
                      <td className="px-2">{o.consultas}</td>
                      <td className="px-2">{o.acoes}</td>
                      <td className="px-2">{o.cardsConduzidos}</td>
                      <td className="px-2">{o.aprovacoes.executadas}/{o.aprovacoes.expiradas}</td>
                      <td className={`px-2 ${o.falhas ? 'text-rose-600' : ''}`}>{o.falhas}</td>
                      <td className="px-2">{o.fluxos.abertos}</td>
                      <td className="px-2">{fmtMin(o.minutosAtivos)}</td>
                      <td className="px-2">{o.sessoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-end gap-1 overflow-x-auto" aria-label="Pedidos por dia">
              {m.totais.porDia.map((d) => {
                const max = Math.max(1, ...m.totais.porDia.map((x) => x.pedidos));
                return (
                  <div key={d.dia} className="flex min-w-[14px] flex-1 flex-col items-center" title={`${d.dia.split('-').reverse().join('/')}: ${d.pedidos} pedido(s), ${d.acoes} ação(ões), ${d.falhas} falha(s)`}>
                    <div className="w-full rounded-t bg-indigo-400" style={{ height: `${Math.round((d.pedidos / max) * 48) + 2}px` }} />
                  </div>
                );
              })}
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Consultas mais frequentes (o que a equipe mais pergunta)" empty={!m.consultasFrequentes.length && !m.skills.length}>
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

            <Section title="Fluxos parados (/retomar)" empty={!m.fluxos.parados.length}>
              {!!m.fluxos.bloqueios.length && (
                <p className="mb-2 text-[11px] text-gray-500">Bloqueios: {m.fluxos.bloqueios.map((b) => `${b.motivo.replace(/^\w+:/, '')} (${b.total})`).join(' · ')}</p>
              )}
              <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                {m.fluxos.parados.map((f) => (
                  <li key={f.requestId} className="flex justify-between gap-2">
                    <button type="button" className="truncate text-left text-indigo-700 hover:underline" onClick={() => openCard(f.cardId)}>
                      {f.workflow} · {cardLabel(f.cardId)}
                    </button>
                    <span className="shrink-0 text-gray-500">
                      {STATUS_LABEL[f.status] ?? f.status}{f.bloqueio ? ` em ${f.bloqueio.passo} (${f.bloqueio.codigo ?? f.bloqueio.campos?.join(', ') ?? f.bloqueio.tipo})` : ''} · {f.diasParado} d · {nome(f.operatorId)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Cards conduzidos pela IA" empty={!m.cards.conduzidos.length}>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {m.cards.conduzidos.map((c) => (
                <li key={c.cardId} className="flex justify-between gap-2">
                  <button type="button" className="truncate text-left text-indigo-700 hover:underline" onClick={() => openCard(c.cardId)}>
                    {cardLabel(c.cardId)} <span className="text-gray-400">· {m.cardsInfo[c.cardId]?.coluna ?? ''}</span>
                  </button>
                  <span className="shrink-0 text-gray-500">{c.acoes} ação(ões) · {c.ferramentas.join(', ')} · {c.operadores.map(nome).join(', ')} · {fmtDateTime(c.ultimo)}</span>
                </li>
              ))}
            </ul>
          </Section>

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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => loadPrompts(1)}
                disabled={promptsLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {promptsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
                {prompts ? 'Recarregar pedidos' : 'Mostrar pedidos'}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={incluirConversas}
                  onChange={(e) => { setIncluirConversas(e.target.checked); if (prompts) void loadPrompts(1, e.target.checked); }}
                />
                Mostrar conversas (inclui desenvolvimento)
              </label>
            </div>
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
      )}
    </div>
  );
}
