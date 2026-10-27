'use client';

// Painel "IA de operação" (Espaço de Trabalho), redesenhado em 27/10 para ser
// lido de relance: menos texto, mais cards e gráfico. Duas visões:
// - Equipe (manager_dashboard): bolinha de rendimento por pessoa, tempo
//   economizado, chats ativos/fechados, o que a IA produziu e o que pede atenção;
//   clicar numa bolinha abre o painel daquela pessoa.
// - Meu painel (todo op_use): o mesmo recorte só da pessoa, com os chats dela.
// A action força o escopo no servidor (quem não é gestor só recebe o próprio).
// Os números técnicos de antes ficam em "Detalhes técnicos" (OpMetricsDetails).
//
// Lê por server action, nunca por /api/op (pública no middleware). Sem poll:
// carrega ao abrir e no "Atualizar". Tempo economizado é ESTIMATIVA pela tabela
// OP_ENTREGAS (op-metrics.ts); chat ativo = uso nos últimos OP_CHAT_IDLE_MIN.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronDown, Clock, FileSignature, FileText, FolderCog,
  Hourglass, Loader2, Mail, MessageCircle, MessageSquareText, MoveRight, PauseCircle, RefreshCw, ScanText, Search, UserCog,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getOpMetricsAction, type OpMetricsPayload } from '@/app/_actions/op/metrics';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import {
  OP_CHAT_IDLE_MIN, OP_ENTREGAS, totalEntregas,
  type EntregaCounts, type EntregaGrupo, type EntregaKey, type OperatorStats,
} from '@/app/_shared/utils/op-metrics';
import { OpChatDialog } from './OpChatDialog';
import { OpMetricsDetails } from './OpMetricsDetails';
import { STATUS_LABEL, fmtMinutos, fmtQuando, iniciais, openCard } from './op-ui';

type Preset = 1 | 7 | 30 | 'custom';
type View = { tipo: 'equipe' } | { tipo: 'pessoa'; id: string };

const GRUPO_COR: Record<EntregaGrupo, string> = { documentos: '#2a78d6', envios: '#1baf7a', cards: '#eda100' };
const GRUPO_LABEL: Record<EntregaGrupo, string> = { documentos: 'Documentos', envios: 'Envios', cards: 'Cards e consultas' };
const GRUPO_TOM: Record<EntregaGrupo, string> = {
  documentos: 'bg-blue-50 text-blue-700',
  envios: 'bg-emerald-50 text-emerald-700',
  cards: 'bg-amber-50 text-amber-700',
};
const ENTREGA_ICON: Record<EntregaKey, React.ComponentType<{ className?: string }>> = {
  procuracao: FileSignature,
  pedido_prontuario: Building2,
  contrato: FileText,
  documentos_lidos: ScanText,
  whatsapp: MessageCircle,
  email: Mail,
  card_movido: MoveRight,
  cadastro: UserCog,
  comentario: MessageSquareText,
  organizacao: FolderCog,
  consulta: Search,
};

function emptyOperator(id: string, porDia: OperatorStats['porDia']): OperatorStats {
  return {
    operatorId: id, pedidos: 0, consultas: 0, acoes: 0, sessoes: 0, latenciaMs: 0, chamadas: 0, falhas: 0,
    cardsConduzidos: 0, cardsTocados: 0,
    aprovacoes: { preparadas: 0, executadas: 0, expiradas: 0, falharam: 0, canceladas: 0, pendentes: 0 },
    fluxos: { abertos: 0, concluidos: 0, abandonados: 0 },
    porDia: porDia.map((d) => ({ ...d, pedidos: 0, acoes: 0, falhas: 0, entregas: 0, minutos: { documentos: 0, envios: 0, cards: 0 } })),
    entregas: Object.fromEntries(OP_ENTREGAS.map((e) => [e.key, 0])) as EntregaCounts,
    minutosPoupados: 0, chatsAtivos: 0, chatsFechados: 0,
  };
}

// ---------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------

/** Foto (ou iniciais) com anel de progresso da meta e ponto verde de "usando agora". */
function PersonRing({ nome, foto, valor, meta, online, size = 64 }: { nome: string; foto?: string | null; valor: number; meta: number; online?: boolean; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const f = Math.min(valor / Math.max(meta, 1), 1);
  const cor = f >= 0.8 ? '#1baf7a' : f >= 0.5 ? '#2a78d6' : '#eda100';
  const inner = size - 14;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={cor} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Avatar className="absolute" style={{ width: inner, height: inner, top: 7, left: 7 }}>
        {foto && <AvatarImage src={foto} alt={nome} className="object-cover" />}
        <AvatarFallback className={`bg-indigo-50 font-semibold text-indigo-700 ${size > 70 ? 'text-lg' : 'text-xs'}`}>{iniciais(nome)}</AvatarFallback>
      </Avatar>
      {online && <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" title="Usando agora" />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, sub, destaque }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; hint?: string; sub?: string; destaque?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3" title={hint}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className={`mt-1 text-2xl font-bold ${destaque ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function Card({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Producao({ entregas, hint }: { entregas: EntregaCounts; hint?: string }) {
  const itens = OP_ENTREGAS.filter((e) => entregas[e.key] > 0);
  return (
    <Card title="O que a IA produziu" right={hint ? <span className="text-[11px] text-gray-400" title={hint}>como contamos?</span> : undefined}>
      {!itens.length ? (
        <p className="text-xs text-gray-400">Nada produzido no período.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {itens.map((e) => {
            const Icon = ENTREGA_ICON[e.key];
            return (
              <div key={e.key} className="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5" title={`${e.minutos} min cada (estimativa)`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${GRUPO_TOM[e.grupo]}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight text-gray-900">{entregas[e.key]}</p>
                  <p className="truncate text-[11px] text-gray-500">{e.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MinutosPorDia({ porDia, titulo }: { porDia: OperatorStats['porDia']; titulo: string }) {
  const longo = porDia.length > 14;
  const data = porDia.map((d) => {
    const [, mm, dd] = d.dia.split('-');
    const dow = new Date(`${d.dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return {
      dia: longo ? `${dd}/${mm}` : `${dow} ${dd}`,
      documentos: +(d.minutos.documentos / 60).toFixed(2),
      envios: +(d.minutos.envios / 60).toFixed(2),
      cards: +(d.minutos.cards / 60).toFixed(2),
    };
  });
  const vazio = porDia.every((d) => !d.entregas);
  return (
    <Card title={titulo}>
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
        {(Object.keys(GRUPO_COR) as EntregaGrupo[]).map((g) => (
          <span key={g} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GRUPO_COR[g] }} />{GRUPO_LABEL[g]}</span>
        ))}
      </div>
      {vazio ? (
        <p className="py-10 text-center text-xs text-gray-400">Sem entregas no período.</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eef0f2" />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} unit="h" />
              <Tooltip
                cursor={{ fill: '#f3f4f6' }}
                formatter={(v: number, k: string) => [fmtMinutos(v * 60), GRUPO_LABEL[k as EntregaGrupo] ?? k]}
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              {(Object.keys(GRUPO_COR) as EntregaGrupo[]).map((g, i, arr) => (
                <Bar key={g} dataKey={g} stackId="m" fill={GRUPO_COR[g]} maxBarSize={24} radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export function OpMetricsPanel() {
  const [preset, setPreset] = useState<Preset>(7);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [data, setData] = useState<OpMetricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ tipo: 'equipe' });
  const [atencao, setAtencao] = useState<'parados' | 'falhas' | 'expirados' | null>(null);
  const [chatAberto, setChatAberto] = useState<string | null>(null);

  const query = useMemo(
    () => ({ ...(preset === 'custom' ? { de: de || undefined, ate: ate || undefined } : { dias: preset }), operatorId: null }),
    [preset, de, ate],
  );

  const load = useCallback(() => {
    if (preset === 'custom' && !de) return;
    setLoading(true);
    setError(null);
    getOpMetricsAction(query)
      .then((d) => {
        setData(d);
        // Quem não é gestor só tem o próprio painel.
        if (d.escopo === 'proprio') setView({ tipo: 'pessoa', id: d.meuId });
      })
      .catch((err) => {
        console.error(err);
        // Produção mascara o erro da action: mensagem própria.
        setError('Não foi possível carregar o rendimento da IA de operação. Confira o período (até 90 dias) e tente de novo.');
      })
      .finally(() => setLoading(false));
  }, [query, preset, de]);
  useEffect(load, [load]);

  const m = data?.metrics;
  const def = data?.definicoes;
  const gestor = data?.escopo === 'equipe';
  const nome = (id: string) => m?.nomes[id] ?? data?.operadores.find((o) => o.id === id)?.nome ?? 'Operador';
  const cardLabel = (id: string | null) => {
    if (!id) return null;
    const c = m?.cardsInfo[id];
    return c ? `card ${c.cardNumber ?? '?'}${c.nome ? ` · ${c.nome.split(' ')[0]}` : ''}` : null;
  };
  const dias = m?.periodo.dias ?? 7;

  const pessoa = useMemo(() => {
    if (!m || view.tipo !== 'pessoa') return null;
    return m.operadores.find((o) => o.operatorId === view.id) ?? emptyOperator(view.id, m.totais.porDia);
  }, [m, view]);

  const ranking = useMemo(() => (m ? m.operadores.filter((o) => o.minutosPoupados > 0).map((o) => o.operatorId) : []), [m]);

  // Atenção: na visão de pessoa, só o que é dela.
  const doRecorte = <T extends { operatorId?: string; operadores?: string[] }>(l: T[]) =>
    view.tipo === 'pessoa' ? l.filter((x) => x.operatorId === view.id || x.operadores?.includes(view.id)) : l;
  const parados = m ? doRecorte(m.fluxos.parados) : [];
  const falhas = m ? doRecorte(m.falhas) : [];
  const expirados = m ? doRecorte(m.aprovacoes.lista.filter((a) => a.status === 'expirada')) : [];

  const presetBtn = (p: Preset, label: string) => (
    <button
      key={String(p)}
      type="button"
      onClick={() => setPreset(p)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${preset === p ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      {/* Cabeçalho: visão + período */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Activity className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-900">IA de operação</h2>
          {m && <p className="text-xs text-gray-400">{m.periodo.de.split('-').reverse().join('/')} a {m.periodo.ate.split('-').reverse().join('/')}</p>}
        </div>
        {gestor && (
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setView({ tipo: 'equipe' })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view.tipo === 'equipe' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'}`}
            >
              Equipe
            </button>
            <button
              type="button"
              onClick={() => data && setView({ tipo: 'pessoa', id: data.meuId })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view.tipo === 'pessoa' && view.id === data?.meuId ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'}`}
            >
              Meu painel
            </button>
          </div>
        )}
        <div className="flex rounded-xl bg-gray-100 p-1">
          {presetBtn(1, 'Hoje')}
          {presetBtn(7, '7 dias')}
          {presetBtn(30, '30 dias')}
          {presetBtn('custom', 'Período')}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1">
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs" aria-label="De" />
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs" aria-label="Até" />
          </div>
        )}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          aria-label="Atualizar"
          title="Atualizar"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!m && loading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}

      {m && def && (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {m.cortado && (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Período muito cheio: alguns números podem estar cortados. Use um período menor.
            </p>
          )}

          {view.tipo === 'equipe' ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Clock} label="Tempo economizado" value={fmtMinutos(m.totais.minutosPoupados)} sub={m.totais.minutosPoupados >= 480 ? `≈ ${(m.totais.minutosPoupados / 480).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia(s) de trabalho` : 'estimativa'} hint={def.tempoEconomizado} destaque />
                <Kpi icon={MessageCircle} label="Chats ativos agora" value={m.totais.chatsAtivos} sub={`${m.operadores.filter((o) => o.chatsAtivos > 0).length} pessoa(s) usando`} hint={def.chats} />
                <Kpi icon={CheckCircle2} label="Chats fechados" value={m.totais.chatsFechados} hint={def.chats} />
                <Kpi icon={FileText} label="Entregas" value={totalEntregas(m.totais.entregas)} sub="docs, envios, cards" hint={def.entregas} />
              </div>

              <Card title="Rendimento por pessoa" right={<span className="text-[11px] text-gray-400">anel = meta de {m.metaEntregas} entregas · ponto verde = usando agora</span>}>
                {!m.operadores.length ? (
                  <p className="text-xs text-gray-400">Ninguém usou a IA de operação no período.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {m.operadores.map((o) => {
                      const total = totalEntregas(o.entregas);
                      return (
                        <button
                          key={o.operatorId}
                          type="button"
                          onClick={() => setView({ tipo: 'pessoa', id: o.operatorId })}
                          className="flex flex-col items-center gap-1 rounded-xl p-2 text-center hover:bg-gray-50"
                          title={`Abrir o painel de ${nome(o.operatorId)}`}
                        >
                          <PersonRing nome={nome(o.operatorId)} foto={m.fotos[o.operatorId]} valor={total} meta={m.metaEntregas} online={o.chatsAtivos > 0} />
                          <span className="w-full truncate text-xs font-semibold text-gray-900">{nome(o.operatorId).split(' ')[0]}</span>
                          <span className="text-[11px] text-gray-500">{total} entregas</span>
                          <span className="text-[11px] font-medium text-emerald-600">{fmtMinutos(o.minutosPoupados)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <MinutosPorDia porDia={m.totais.porDia} titulo="Horas economizadas por dia" />
                <Atencao parados={parados.length} falhas={falhas.reduce((a, f) => a + f.total, 0)} expirados={expirados.length} aberto={atencao} onToggle={setAtencao} />
              </div>

              <Card title="Chats da equipe" right={<span className="text-[11px] text-gray-400" title={def.chats}>clique para ler · fecha após {OP_CHAT_IDLE_MIN} min parado</span>}>
                <ChatList chats={m.chats.slice(0, 12)} parados={[]} cardLabel={cardLabel} onOpen={setChatAberto} nome={(id) => nome(id).split(' ')[0]} fotos={m.fotos} />
              </Card>
            </>
          ) : pessoa && (
            <>
              <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-gray-200 bg-white p-4">
                {gestor && (
                  <button type="button" onClick={() => setView({ tipo: 'equipe' })} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Voltar para a equipe" title="Voltar para a equipe">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <PersonRing nome={nome(pessoa.operatorId)} foto={m.fotos[pessoa.operatorId]} valor={totalEntregas(pessoa.entregas)} meta={m.metaEntregas} online={pessoa.chatsAtivos > 0} size={96} />
                <div className="min-w-[160px] flex-1">
                  <p className="text-base font-bold text-gray-900">{nome(pessoa.operatorId)}</p>
                  <p className="text-xs text-gray-500">{pessoa.operatorId === data?.meuId ? 'Você poupou' : 'Poupou'}</p>
                  <p className="text-4xl font-bold leading-tight text-emerald-600" title={def.tempoEconomizado}>{fmtMinutos(pessoa.minutosPoupados)}</p>
                  <p className="text-[11px] text-gray-400">
                    {totalEntregas(pessoa.entregas)} de {m.metaEntregas} entregas da meta
                    {gestor && ranking.includes(pessoa.operatorId) && ` · ${ranking.indexOf(pessoa.operatorId) + 1}º da equipe`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Kpi icon={MessageCircle} label="Chats ativos" value={pessoa.chatsAtivos} hint={def.chats} />
                  <Kpi icon={CheckCircle2} label="Fechados" value={pessoa.chatsFechados} hint={def.chats} />
                  <Kpi icon={FileText} label="Entregas" value={totalEntregas(pessoa.entregas)} hint={def.entregas} />
                  <Kpi icon={MoveRight} label="Cards" value={pessoa.cardsConduzidos} hint={def.cardsConduzidos} />
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title={pessoa.operatorId === data?.meuId ? 'Meus chats' : 'Chats'} right={<span className="text-[11px] text-gray-400" title={def.chats}>fecha após {OP_CHAT_IDLE_MIN} min parado</span>}>
                  <ChatList
                    chats={m.chats.filter((c) => c.operatorId === pessoa.operatorId)}
                    parados={parados}
                    cardLabel={cardLabel}
                    onOpen={setChatAberto}
                  />
                </Card>
                <MinutosPorDia porDia={pessoa.porDia} titulo={dias > 1 ? 'Horas economizadas por dia' : 'Hoje'} />
              </div>

              {(parados.length > 0 || falhas.length > 0 || expirados.length > 0) && (
                <Atencao parados={parados.length} falhas={falhas.reduce((a, f) => a + f.total, 0)} expirados={expirados.length} aberto={atencao} onToggle={setAtencao} horizontal />
              )}
            </>
          )}

          {/* Lista aberta do "Precisa de atenção" */}
          {atencao && (
            <Card title={atencao === 'parados' ? 'Fluxos parados (/retomar)' : atencao === 'falhas' ? 'Falhas' : 'Envios expirados'} right={<button type="button" className="text-xs text-gray-400 hover:text-gray-700" onClick={() => setAtencao(null)}>fechar</button>}>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                {atencao === 'parados' && (parados.length ? parados.map((f) => (
                  <li key={f.requestId} className="flex justify-between gap-2">
                    <button type="button" className="truncate text-left text-indigo-700 hover:underline" onClick={() => openCard(f.cardId)}>/{f.workflow} · {cardLabel(f.cardId) ?? 'card'}</button>
                    <span className="shrink-0 text-gray-500">{STATUS_LABEL[f.status] ?? f.status} · {f.diasParado} d · {nome(f.operatorId).split(' ')[0]}</span>
                  </li>
                )) : <li className="text-gray-400">Nenhum.</li>)}
                {atencao === 'falhas' && (falhas.length ? falhas.map((f) => (
                  <li key={`${f.tool}-${f.code}`} className="flex justify-between gap-2">
                    <span><span className="font-mono">{f.tool}</span> · <span className="font-semibold text-rose-600">{f.code}</span></span>
                    <span className="shrink-0 text-gray-500">{f.total}× · {f.operadores.map((id) => nome(id).split(' ')[0]).join(', ')}</span>
                  </li>
                )) : <li className="text-gray-400">Nenhuma.</li>)}
                {atencao === 'expirados' && (expirados.length ? expirados.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <button type="button" disabled={!a.cardId} className="truncate text-left text-indigo-700 hover:underline disabled:text-gray-500" onClick={() => a.cardId && openCard(a.cardId)}>{a.canal} · {cardLabel(a.cardId) ?? 'lote'}</button>
                    <span className="shrink-0 text-gray-500">{nome(a.operatorId).split(' ')[0]} · {fmtQuando(a.criadaEm)}</span>
                  </li>
                )) : <li className="text-gray-400">Nenhum.</li>)}
              </ul>
            </Card>
          )}

          <Producao entregas={view.tipo === 'equipe' ? m.totais.entregas : pessoa?.entregas ?? m.totais.entregas} hint={def.entregas} />

          <OpChatDialog sessionId={chatAberto} onClose={() => setChatAberto(null)} />

          {gestor && view.tipo === 'equipe' && (
            <details className="group rounded-2xl border border-gray-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> Detalhes técnicos
                <span className="text-xs font-normal text-gray-400">ferramentas, falhas, envios e texto dos pedidos</span>
              </summary>
              <div className="border-t border-gray-100 p-4">
                <OpMetricsDetails m={m} query={query} />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Atencao({ parados, falhas, expirados, aberto, onToggle, horizontal }: {
  parados: number; falhas: number; expirados: number; aberto: string | null;
  onToggle: (k: 'parados' | 'falhas' | 'expirados' | null) => void; horizontal?: boolean;
}) {
  const itens = [
    { k: 'parados' as const, label: 'Fluxos parados', n: parados, icon: PauseCircle, tom: 'bg-amber-50 text-amber-700' },
    { k: 'falhas' as const, label: 'Falhas', n: falhas, icon: AlertTriangle, tom: 'bg-rose-50 text-rose-600' },
    { k: 'expirados' as const, label: 'Envios expirados', n: expirados, icon: Hourglass, tom: 'bg-gray-100 text-gray-500' },
  ];
  return (
    <Card title="Precisa de atenção">
      <div className={horizontal ? 'grid grid-cols-3 gap-2' : 'space-y-1'}>
        {itens.map(({ k, label, n, icon: Icon, tom }) => (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(aberto === k ? null : k)}
            className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-gray-50 ${aberto === k ? 'bg-gray-50' : ''}`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tom}`}><Icon className="h-4 w-4" /></span>
            <span className="flex-1 text-gray-700">{label}</span>
            <span className={`font-bold ${n ? 'text-gray-900' : 'text-gray-300'}`}>{n}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ChatList({ chats, parados, cardLabel, onOpen, nome, fotos }: {
  chats: OpMetricsPayload['metrics']['chats'];
  parados: OpMetricsPayload['metrics']['fluxos']['parados'];
  cardLabel: (id: string | null) => string | null;
  onOpen: (sessionId: string) => void;
  /** Visão Equipe: mostra quem fez o chat. */
  nome?: (id: string) => string;
  fotos?: Record<string, string | null>;
}) {
  if (!chats.length && !parados.length) return <p className="text-xs text-gray-400">Nenhum chat no período.</p>;
  const titulo = (skill: string | null, cardIds: string[], totalCards: number) => {
    const base = skill ? `/${skill}` : 'Pedido livre';
    const card = cardLabel(cardIds[0] ?? null);
    const mais = totalCards > 1 ? ` +${totalCards - 1}` : '';
    return card ? `${base} · ${card}${mais}` : totalCards ? `${base} · ${totalCards} card(s)` : base;
  };
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {parados.slice(0, 3).map((f) => (
        <li key={`f-${f.requestId}`} className="flex items-center gap-2 py-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
          <button type="button" className="min-w-0 flex-1 truncate text-left text-gray-800 hover:underline" onClick={() => openCard(f.cardId)}>/{f.workflow} · {cardLabel(f.cardId) ?? 'card'}</button>
          <span className="shrink-0 text-[11px] text-amber-600">parado {f.diasParado} d</span>
        </li>
      ))}
      {chats.slice(0, 8).map((c) => (
        <li key={c.sessionId} className="flex items-center gap-2 py-2">
          {c.ativo ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
          {nome && (
            <Avatar className="h-6 w-6 shrink-0">
              {fotos?.[c.operatorId] && <AvatarImage src={fotos[c.operatorId]!} alt={nome(c.operatorId)} className="object-cover" />}
              <AvatarFallback className="bg-indigo-50 text-[9px] font-semibold text-indigo-700">{iniciais(nome(c.operatorId))}</AvatarFallback>
            </Avatar>
          )}
          <button
            type="button"
            onClick={() => onOpen(c.sessionId)}
            className={`min-w-0 flex-1 truncate text-left ${c.ativo ? 'text-gray-900' : 'text-gray-500'} hover:text-indigo-700 hover:underline`}
            title="Ler o chat"
          >
            {nome && <span className="font-medium text-gray-700">{nome(c.operatorId)} · </span>}
            {titulo(c.skill, c.cardIds, c.totalCards)}
          </button>
          <span className="shrink-0 text-[11px] text-gray-400">{c.entregas ? `${c.entregas} entrega(s) · ` : ''}{fmtQuando(c.ultimo)}</span>
        </li>
      ))}
    </ul>
  );
}
