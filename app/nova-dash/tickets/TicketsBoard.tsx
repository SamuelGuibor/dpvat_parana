'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { BarChart3, ChevronDown, ListChecks, Loader2, RefreshCw, Search, Wand2, X } from 'lucide-react';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/app/_shared/ui/dropdown-menu';
import { gerarCardsAutomaticos, listarSetoresDoQuadro } from '@/app/_actions/dev-tickets/ticket-actions';
import { KNOWLEDGE_TYPES, MANUAL_TICKET_TYPES, isKnowledgeType, statusesFor, temConflito } from '@/app/_shared/utils/cerebro';
import type { CerebroResumo } from '@/app/_shared/lib/cerebro';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';
import { CreateTicketDialog } from './CreateTicketDialog';
import { SampleReviewDialog } from './SampleReviewDialog';
import { SuggestKnowledgeDialog } from './SuggestKnowledgeDialog';
import { TicketCard } from './TicketCard';
import { DevTicketDto, STATUS_META, TYPE_META, columnLabel, initials } from './constants';

// Quadro no estilo Jira (layout aprovado pelo dono em 27/10): migalha + título
// "Quadro", abas Cérebro APP · Tickets DEV (Cérebro primeiro e padrão), avatares
// de quem tem ticket, filtros Tipo · Só os meus · Atualizados, Métricas (só no
// Cérebro) e colunas com cards densos. Plano: docs/ai-first/02-plano-etapa-2.md §9.

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type View = 'cerebro' | 'dev';
type Quick = 'meus' | 'recentes' | 'conflito' | 'ia';

// Conveniência por pessoa (qual quadro abriu por último): localStorage pode
// falhar (aba anônima, bloqueio) — nunca é estado que precise persistir.
const VIEW_KEY = 'cerebro-app-view';
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'dev' ? 'dev' : 'cerebro';
  } catch {
    return 'cerebro';
  }
}

const VIEWS: Record<View, { label: string; types: readonly string[]; statusOf: string; unit: string }> = {
  cerebro: { label: 'Cérebro APP', types: KNOWLEDGE_TYPES, statusOf: 'CONHECIMENTO', unit: 'cards' },
  dev: { label: 'Tickets DEV', types: MANUAL_TICKET_TYPES, statusOf: 'BUG', unit: 'tickets' },
};

const QUICK: Record<View, { key: Quick; label: string }[]> = {
  cerebro: [
    { key: 'meus', label: 'Só os meus' },
    { key: 'recentes', label: 'Atualizados' },
    { key: 'conflito', label: 'Com conflito' },
    { key: 'ia', label: 'Aguardando IA' },
  ],
  dev: [
    { key: 'meus', label: 'Só os meus' },
    { key: 'recentes', label: 'Atualizados' },
  ],
};

const NO_ASSIGNEE = '__ninguem__';
const RECENT_MS = 7 * 86_400_000;
const AVATAR_COLORS = ['bg-[#1a6649]', 'bg-[#b4541f]', 'bg-[#2b3f9e]', 'bg-[#7a3f9e]', 'bg-[#0b4f7a]', 'bg-[#9b1c4a]'];

function Kpi({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-[24px] font-semibold tabular-nums leading-none ${color}`}>{value}</div>
      <div className="mt-1.5 text-xs text-gray-500">{hint}</div>
    </div>
  );
}

const toolBtn = 'h-9 rounded-md border-gray-200 bg-white font-medium text-gray-800';

export function TicketsBoard() {
  const { data: session } = useSession();
  const { perms } = usePermissions();
  const [view, setView] = useState<View>('cerebro');
  const [busca, setBusca] = useState('');
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [setoresSel, setSetoresSel] = useState<string[]>([]);
  const [quick, setQuick] = useState<Quick[]>([]);
  const [metricas, setMetricas] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);

  useEffect(() => setView(readView()), []);

  const { data: raw, isLoading, mutate } = useSWR<DevTicketDto[]>('/api/dev-tickets', fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 10_000,
  });
  // Indicadores leem S3 + automações: atualização mais espaçada que a lista, e só no Cérebro.
  const { data: resumo, mutate: mutateResumo } = useSWR<CerebroResumo & { error?: string }>(
    view === 'cerebro' ? '/api/cerebro/resumo' : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120_000 },
  );
  // Setores mudam raramente: lidos uma vez (filtro, chip do card e "Enviar sugestão").
  const { data: setores } = useSWR('cerebro-setores', () => listarSetoresDoQuadro(), { revalidateOnFocus: false });
  const setorPorId = useMemo(() => new Map((setores ?? []).map((s) => [s.id, s])), [setores]);
  const tickets = useMemo(() => (Array.isArray(raw) ? raw : []), [raw]);
  const myId = session?.user?.id;
  const cfg = VIEWS[view];

  function trocar(v: View) {
    setView(v);
    // Filtros são do quadro: tipo/pessoa de um não fazem sentido no outro.
    setTipos([]);
    setSetoresSel([]);
    setPessoas([]);
    setQuick((q) => q.filter((x) => QUICK[v].some((y) => y.key === x)));
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* conveniência: sem storage, abre sempre no Cérebro */
    }
  }

  const doQuadro = useMemo(() => tickets.filter((t) => (view === 'cerebro' ? isKnowledgeType(t.type) : !isKnowledgeType(t.type))), [tickets, view]);
  const abertos = (v: View) => tickets.filter((t) => (v === 'cerebro') === isKnowledgeType(t.type) && t.status !== 'CONCLUIDO').length;

  const gente = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of doQuadro) if (t.assigneeId && t.assigneeName) map.set(t.assigneeId, t.assigneeName);
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [doQuadro]);

  const visible = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const now = Date.now();
    return doQuadro.filter((t) => {
      if (q && !`${t.title} ${t.description} ${t.meta?.hospital ?? ''} ${t.creatorName} ${t.assigneeName ?? ''}`.toLowerCase().includes(q)) return false;
      if (tipos.length && !tipos.includes(t.type)) return false;
      if (setoresSel.length && !setoresSel.includes(t.sectorId ?? NO_ASSIGNEE)) return false;
      if (pessoas.length && !pessoas.includes(t.assigneeId ?? NO_ASSIGNEE)) return false;
      if (quick.includes('meus') && myId && t.creatorId !== myId && t.assigneeId !== myId) return false;
      if (quick.includes('recentes') && now - new Date(t.updatedAt).getTime() > RECENT_MS) return false;
      if (quick.includes('conflito') && !temConflito(t.meta)) return false;
      if (quick.includes('ia') && t.status !== 'VALIDACAO_IA') return false;
      return true;
    });
  }, [doQuadro, busca, tipos, setoresSel, pessoas, quick, myId]);

  const colunas = useMemo(() => statusesFor(cfg.statusOf), [cfg.statusOf]);
  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(colunas.map((s) => [s, [] as DevTicketDto[]]));
    for (const t of visible) (groups[t.status] ?? groups.EM_DISTRIBUICAO).push(t);
    // A API devolve em ordem de criação (fila FIFO); em Concluído faz mais
    // sentido ver as entregas mais recentes primeiro.
    groups.CONCLUIDO.reverse();
    return groups;
  }, [visible, colunas]);

  const filtrando = Boolean(busca.trim() || tipos.length || setoresSel.length || pessoas.length || quick.length);
  const limpar = () => {
    setBusca('');
    setTipos([]);
    setSetoresSel([]);
    setPessoas([]);
    setQuick([]);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const refresh = () => {
    void mutate();
    if (view === 'cerebro') void mutateResumo();
  };

  async function gerar() {
    setGerando(true);
    try {
      const r = await gerarCardsAutomaticos();
      toast.success(
        r.criados
          ? `${r.criados} card(s) criados${r.restantes ? ` (faltam ${r.restantes}: clique de novo)` : ''}.`
          : 'Nada novo: lacunas e desatualizadas já têm card aberto.',
      );
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg && !/Server Components render/.test(msg) ? msg : 'Não foi possível gerar os cards.');
    } finally {
      setGerando(false);
    }
  }

  const okResumo = resumo && !resumo.error;
  const lotes = okResumo ? resumo.lotes : [];
  const emValidacao = doQuadro.filter((t) => t.status === 'VALIDACAO_IA').length;

  return (
    <div className="space-y-4 bg-[#f6f7f5] px-4 py-5 sm:px-6">
      {/* Migalha + título + abas + ações */}
      <div className="text-xs text-gray-500">
        Equipe <span className="mx-1">/</span> <span className="font-medium text-gray-800">{cfg.label}</span>
      </div>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-semibold tracking-tight text-gray-900">Quadro</h2>
        <div role="tablist" aria-label="Quadro" className="inline-flex gap-1 rounded-lg bg-[#eef0ec] p-[3px]">
          {(['cerebro', 'dev'] as View[]).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => trocar(v)}
                className={`flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {VIEWS[v].label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-[#e3f1ea] text-[#114a34]' : 'bg-white/70 text-gray-500'}`}>{abertos(v)}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view === 'cerebro' && perms.manage_knowledge && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={toolBtn} disabled={!lotes.length}>
                    <ListChecks className="mr-1.5 h-4 w-4" /> Conferir lote
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-gray-500">Lotes publicados</DropdownMenuLabel>
                  {lotes.map((l) => (
                    <DropdownMenuItem key={l.id} onClick={() => setLoteAberto(l.id)}>
                      <span className="font-mono text-xs">{l.id}</span>
                      <span className="ml-2 text-xs text-gray-600">
                        {l.aprovadas} aprovadas · amostra {l.amostra}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" className={toolBtn} disabled={gerando} onClick={gerar} title="Cria um card por lacuna e por nota desatualizada que ainda não tem card aberto">
                {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
                Gerar cards
              </Button>
            </>
          )}
          {view === 'cerebro' ? <SuggestKnowledgeDialog onCreated={refresh} setores={setores ?? []} /> : <CreateTicketDialog onCreated={() => mutate()} />}
          <Button variant="outline" size="icon" onClick={refresh} aria-label="Atualizar" className="h-9 w-9 rounded-md border-gray-200 bg-white">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Barra: busca · avatares · tipo · filtros rápidos · métricas */}
      <nav aria-label="Filtros" className="flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <label htmlFor="cerebro-busca" className="sr-only">Buscar neste quadro</label>
          <Input
            id="cerebro-busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no quadro"
            className="h-9 w-[210px] max-w-full rounded-md border-gray-200 bg-white pl-9"
          />
        </div>

        <div className="flex items-center" aria-label="Filtrar por responsável">
          {gente.slice(0, 8).map((p, i) => {
            const on = pessoas.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPessoas(toggle(pessoas, p.id))}
                aria-pressed={on}
                title={p.nome}
                aria-label={`Só os de ${p.nome}`}
                className={`relative rounded-full ring-2 transition-transform hover:z-10 hover:-translate-y-0.5 ${on ? 'z-10 ring-[#1a6649]' : 'ring-[#f6f7f5]'} ${i ? '-ml-1.5' : ''}`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={`text-[11px] font-semibold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{initials(p.nome)}</AvatarFallback>
                </Avatar>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPessoas(toggle(pessoas, NO_ASSIGNEE))}
            aria-pressed={pessoas.includes(NO_ASSIGNEE)}
            title="Sem responsável"
            aria-label="Só os sem responsável"
            className={`relative ${gente.length ? '-ml-1.5' : ''} rounded-full ring-2 ${pessoas.includes(NO_ASSIGNEE) ? 'z-10 ring-[#1a6649]' : 'ring-[#f6f7f5]'}`}
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className={`text-[10px] font-semibold ${pessoas.includes(NO_ASSIGNEE) ? 'bg-[#1a6649] text-white' : 'border border-dashed border-gray-400 bg-white text-gray-600'}`}>
                ?
              </AvatarFallback>
            </Avatar>
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={`${toolBtn} ${tipos.length ? 'border-[#1a6649] bg-[#e3f1ea] text-[#114a34]' : ''}`}>
              Tipo{tipos.length ? ` · ${tipos.length}` : <span className="ml-1 font-normal text-gray-500">todos</span>}
              <ChevronDown className="ml-1.5 h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {cfg.types.map((t) => {
              const n = doQuadro.filter((x) => x.type === t).length;
              return (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={tipos.includes(t)}
                  onCheckedChange={() => setTipos(toggle(tipos, t))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {TYPE_META[t]?.label ?? t}
                  <span className="ml-auto pl-4 text-xs tabular-nums text-gray-500">{n}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {Boolean(setores?.length) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={`${toolBtn} ${setoresSel.length ? 'border-[#1a6649] bg-[#e3f1ea] text-[#114a34]' : ''}`}>
                Setor{setoresSel.length ? ` · ${setoresSel.length}` : <span className="ml-1 font-normal text-gray-500">todos</span>}
                <ChevronDown className="ml-1.5 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {[...(setores ?? []), { id: NO_ASSIGNEE, name: 'Sem setor', color: '#9ca3af' }].map((st) => {
                const n = doQuadro.filter((x) => (x.sectorId ?? NO_ASSIGNEE) === st.id).length;
                return (
                  <DropdownMenuCheckboxItem
                    key={st.id}
                    checked={setoresSel.includes(st.id)}
                    onCheckedChange={() => setSetoresSel(toggle(setoresSel, st.id))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: st.color }} aria-hidden="true" />
                    {st.name}
                    <span className="ml-auto pl-4 text-xs tabular-nums text-gray-500">{n}</span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex flex-wrap gap-1.5">
          {QUICK[view].map((q) => {
            const on = quick.includes(q.key);
            return (
              <button
                key={q.key}
                type="button"
                onClick={() => setQuick(toggle(quick, q.key))}
                aria-pressed={on}
                className={`h-9 rounded-md border px-3 text-[13px] font-medium transition-colors ${
                  on ? 'border-[#1a6649] bg-[#e3f1ea] text-[#114a34]' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                }`}
              >
                {q.label}
              </button>
            );
          })}
        </div>

        {filtrando && (
          <Button variant="ghost" className="h-9 rounded-md font-medium text-gray-600" onClick={limpar}>
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-xs tabular-nums text-gray-500">
            {visible.length} de {doQuadro.length} {cfg.unit}
          </span>
          {view === 'cerebro' && (
            <Button variant="outline" className={`${toolBtn} ${metricas ? 'border-[#1a6649] bg-[#e3f1ea] text-[#114a34]' : ''}`} aria-pressed={metricas} onClick={() => setMetricas((m) => !m)}>
              <BarChart3 className="mr-1.5 h-4 w-4" /> Métricas
            </Button>
          )}
        </div>
      </nav>

      {view === 'cerebro' && metricas && (
        <>
          <section aria-label="Resumo" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi
              label="Notas publicadas"
              value={okResumo ? `${resumo.publicadas} / ${resumo.hospitaisComAutomacao}` : '—'}
              hint="hospitais com automação ativa"
              color="text-[#114a34]"
            />
            <Kpi label="Em validação" value={String(emValidacao)} hint="cards na Validação IA" color="text-violet-800" />
            <Kpi label="Desatualizadas" value={okResumo ? String(resumo.desatualizadas.length) : '—'} hint="automação mudou depois da nota" color="text-rose-800" />
            <Kpi
              label="Lacunas"
              value={okResumo ? String(resumo.lacunas.length) : '—'}
              hint={okResumo ? `${resumo.lacunas.reduce((s, l) => s + l.cardsAtivos, 0)} cards ativos sem procedimento` : 'cards ativos sem procedimento'}
              color="text-amber-900"
            />
            <Kpi label="Abertos" value={String(abertos('cerebro'))} hint="cards de conhecimento não publicados" color="text-blue-800" />
          </section>
          {resumo?.error && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Indicadores indisponíveis: {resumo.error}</p>}
        </>
      )}

      {/* Colunas preenchem a largura e cada uma rola por dentro (altura presa à janela). */}
      <div className="overflow-x-auto pb-1">
        <div className={`grid items-stretch gap-3 ${colunas.length === 5 ? "min-w-[1100px] grid-cols-5" : "min-w-[880px] grid-cols-4"}`}>
          {colunas.map((statusKey) => {
            const meta = STATUS_META[statusKey];
            const columnTickets = byStatus[statusKey] ?? [];
            const label = columnLabel(view, statusKey);
            return (
              <section key={statusKey} aria-label={label} className="flex h-[calc(100vh-270px)] min-h-[360px] min-w-0 flex-col gap-2 overflow-y-auto rounded-[10px] bg-[#eef0ec] p-2.5">
                <div className="sticky -top-2.5 z-10 -mx-2.5 -mt-2.5 flex items-center gap-2 bg-[#eef0ec] px-3.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[.06em] text-gray-500">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  {label}
                  <span className="font-medium opacity-80 tabular-nums">{columnTickets.length}</span>
                  <span className="ml-auto truncate text-[11px] font-normal normal-case tracking-normal opacity-70" title={meta.hint}>
                    {view === 'dev' && statusKey === 'EM_DESENVOLVIMENTO' ? 'dev no código' : meta.short}
                  </span>
                </div>
                {columnTickets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
                    <p className="text-xs text-gray-500">{filtrando ? 'Nada com esses filtros' : 'Nada aqui'}</p>
                  </div>
                ) : (
                  columnTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onChanged={refresh} setor={ticket.sectorId ? setorPorId.get(ticket.sectorId) : undefined} />)
                )}
              </section>
            );
          })}
        </div>
      </div>

      {loteAberto && (
        <SampleReviewDialog
          loteId={loteAberto}
          open={Boolean(loteAberto)}
          onOpenChange={(v) => {
            if (!v) setLoteAberto(null);
          }}
        />
      )}
    </div>
  );
}
