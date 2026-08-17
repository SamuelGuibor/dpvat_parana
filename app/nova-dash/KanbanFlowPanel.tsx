'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Camera, ChevronDown, Clock,
  FileSpreadsheet, Layers, Link2, Loader2, Maximize2, Minimize2, Search,
  Timer, Trash2, TrendingUp, Undo2, X, Building2,
} from 'lucide-react';
import { Card, CardContent } from '@/app/_shared/ui/card';
import {
  getKanbanFlowAnalytics,
  type KanbanFlowAnalytics,
} from '@/app/_actions/analytics/get-funnel-analytics';

// Aba "Fluxo do Kanban" — layout novo (17/08/2026), baseado no mockup
// "KPIs Avançados" aprovado pelo escritório:
//   • 7 painéis (tempo, destino, retorno, descarte, tempo total, throughput,
//     por hospital), um por aba OU combinados/empilhados na mesma tela;
//   • cada painel com seletor de tipo de gráfico (colunas/pizza/linha/funil),
//     filtro de séries, temporalidade própria e comparação com o período
//     anterior (barras "fantasma" hachuradas);
//   • exportação por painel em Excel (CSV) e JPEG;
//   • no modo combinado dá pra reordenar e redimensionar os quadros — o
//     arranjo fica salvo no navegador (localStorage).
// A carga inicial vem pronta do dashboard (carga única); trocar a
// temporalidade do módulo ou ligar a comparação busca só esta análise.

// ---------------------------------------------------------------------------
// Constantes e helpers
// ---------------------------------------------------------------------------

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#64748b'];

type ChartType = 'colunas' | 'pizza' | 'linha' | 'funil';
const CHART_LABEL: Record<ChartType, string> = {
  colunas: 'Colunas', pizza: 'Pizza', linha: 'Linha', funil: 'Funil',
};

type ViewKey = 'tempo' | 'destino' | 'retrabalho' | 'descarte' | 'ciclo' | 'throughput' | 'hospital';

const VIEWS: { key: ViewKey; label: string; dot: string; icon: React.ElementType }[] = [
  { key: 'tempo', label: 'Tempo por coluna', dot: '#3b82f6', icon: Clock },
  { key: 'destino', label: 'Destino por coluna', dot: '#8b5cf6', icon: ArrowRight },
  { key: 'retrabalho', label: 'Retorno & retrabalho', dot: '#f59e0b', icon: Undo2 },
  { key: 'descarte', label: 'Descarte', dot: '#ef4444', icon: Trash2 },
  { key: 'ciclo', label: 'Tempo total no board', dot: '#10b981', icon: Timer },
  { key: 'throughput', label: 'Throughput', dot: '#06b6d4', icon: TrendingUp },
  { key: 'hospital', label: 'Por hospital', dot: '#ec4899', icon: Building2 },
];

type PeriodMode = 'dashboard' | 'd30' | 'month' | 'd90' | 'year';
const PERIOD_LABEL: Record<PeriodMode, string> = {
  dashboard: 'Período do dashboard',
  d30: 'Últimos 30 dias',
  month: 'Este mês',
  d90: 'Últimos 90 dias',
  year: 'Este ano',
};

function periodRange(mode: PeriodMode, dashFrom: string, dashTo: string): { from: string; to: string } {
  if (mode === 'dashboard') return { from: dashFrom, to: dashTo };
  const now = new Date();
  if (mode === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
  }
  if (mode === 'year') {
    return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: now.toISOString() };
  }
  const days = mode === 'd30' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: now.toISOString() };
}

/** Janela imediatamente anterior, com a mesma duração. */
function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  const len = Math.max(t - f, 3_600_000);
  return { from: new Date(f - len).toISOString(), to: new Date(f).toISOString() };
}

function fmtDays(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1) return `${Math.max(1, Math.round(n * 24))} h`;
  return `${String(n).replace('.', ',')} d`;
}

function num(n: number): string {
  return String(n).replace('.', ',');
}

/** Linha de dado que alimenta qualquer gráfico do módulo. */
interface ChartRow {
  n: string;
  v: number;
  /** Valor do período anterior (comparação) — barra fantasma. */
  prev?: number;
  count?: number;
  color?: string;
}

interface TrendSeries { name: string; color: string; points: { label: string; value: number }[] }

// ---------------------------------------------------------------------------
// Gráficos SVG (colunas / pizza / linha / funil) — SVG puro pra permitir
// exportar em JPEG sem lib externa.
// ---------------------------------------------------------------------------

const AXIS_TEXT = '#94a3b8';
const GRID_LINE = '#e2e8f0';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function ColumnsChart({ rows, unit, compare, onBar }: {
  rows: ChartRow[]; unit: string; compare: boolean; onBar?: (row: ChartRow) => void;
}) {
  const colW = 64;
  const width = Math.max(560, rows.length * colW);
  const height = 280;
  const padB = 66;
  const padT = 26;
  const max = Math.max(...rows.map((r) => r.v), ...(compare ? rows.map((r) => r.prev ?? 0) : [0]), 0.001);
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <pattern id="ghost-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="#cbd5e1" opacity="0.45" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#94a3b8" strokeWidth="3" opacity="0.5" />
          </pattern>
        </defs>
        <line x1={0} y1={height - padB} x2={width} y2={height - padB} stroke={GRID_LINE} />
        {rows.map((r, i) => {
          const h = ((r.v / max) * (height - padB - padT));
          const x = i * colW + 14;
          const barW = 34;
          const y = height - padB - h;
          const ghostH = compare && r.prev != null ? (r.prev / max) * (height - padB - padT) : 0;
          return (
            <g
              key={r.n}
              onClick={onBar ? () => onBar(r) : undefined}
              style={onBar ? { cursor: 'pointer' } : undefined}
            >
              <title>{`${r.n}: ${num(r.v)}${unit}${compare && r.prev != null ? ` (anterior: ${num(r.prev)}${unit})` : ''}`}</title>
              {ghostH > 0 && (
                <rect x={x} y={height - padB - ghostH} width={barW} height={ghostH} rx={4} fill="url(#ghost-hatch)" />
              )}
              <rect x={x} y={y} width={barW} height={Math.max(h, 2)} rx={4} fill={r.color ?? COLORS[0]} />
              <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize={11} fill="#475569" fontWeight={600}>
                {num(r.v)}{unit}
              </text>
              <text x={x + barW / 2} y={height - padB + 14} textAnchor="middle" fontSize={9.5} fill={AXIS_TEXT}>
                {truncate(r.n, 13)}
              </text>
              {r.n.length > 13 && (
                <text x={x + barW / 2} y={height - padB + 26} textAnchor="middle" fontSize={9.5} fill={AXIS_TEXT}>
                  {truncate(r.n.slice(12), 13)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PieChart({ rows, unit, onSlice }: { rows: ChartRow[]; unit: string; onSlice?: (row: ChartRow) => void }) {
  const total = rows.reduce((a, r) => a + r.v, 0) || 1;
  let offset = 25;
  return (
    <div className="flex flex-col items-center gap-4 py-3 sm:flex-row sm:justify-center sm:gap-10">
      <svg width={170} height={170} viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
        {rows.map((r, i) => {
          const pct = (r.v / total) * 100;
          const el = (
            <circle
              key={r.n} cx="21" cy="21" r="15.9" fill="transparent"
              stroke={r.color ?? COLORS[i % COLORS.length]} strokeWidth="6"
              strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset}
              strokeLinecap="butt"
            >
              <title>{`${r.n}: ${num(r.v)}${unit}`}</title>
            </circle>
          );
          offset -= pct;
          return el;
        })}
      </svg>
      <div className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <button
            key={r.n}
            onClick={onSlice ? () => onSlice(r) : undefined}
            className={`flex items-center justify-between gap-6 text-left text-xs text-gray-600 dark:text-zinc-300 ${onSlice ? 'hover:text-gray-900 dark:hover:text-white' : 'cursor-default'}`}
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color ?? COLORS[i % COLORS.length] }} />
              {truncate(r.n, 34)}
            </span>
            <span className="font-bold tabular-nums">{Math.round((r.v / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FunnelChart({ rows, unit, onStage }: { rows: ChartRow[]; unit: string; onStage?: (row: ChartRow) => void }) {
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const max = Math.max(...sorted.map((r) => r.v), 0.001);
  const width = 640;
  const rowH = 34;
  const height = sorted.length * (rowH + 6) + 6;
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto block max-w-full">
        {sorted.map((r, i) => {
          const w = 180 + (r.v / max) * (width - 220);
          const x = (width - w) / 2;
          const y = i * (rowH + 6) + 3;
          return (
            <g key={r.n} onClick={onStage ? () => onStage(r) : undefined} style={onStage ? { cursor: 'pointer' } : undefined}>
              <title>{`${r.n}: ${num(r.v)}${unit}`}</title>
              <rect x={x} y={y} width={w} height={rowH} rx={6} fill={r.color ?? COLORS[i % COLORS.length]} />
              <text x={width / 2} y={y + rowH / 2 + 4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#ffffff">
                {truncate(r.n, 42)} — {num(r.v)}{unit}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineChart({ series, unit }: { series: TrendSeries[]; unit: string }) {
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const W = 640; const H = 260; const padL = 38; const padB = 30; const padT = 12; const padR = 12;
  const all = series.flatMap((s) => s.points.map((p) => p.value));
  const max = Math.max(...all, 0.001) * 1.15;
  const stepX = labels.length > 1 ? (W - padL - padR) / (labels.length - 1) : 0;
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const xOf = (i: number) => padL + i * stepX;
  if (labels.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">Sem dados semanais no período.</p>;
  }
  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block min-w-[420px]">
          {[0, 1, 2, 3, 4].map((g) => {
            const val = (max / 4) * g;
            const y = yOf(val);
            return (
              <g key={g}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={GRID_LINE} />
                <text x={2} y={y + 4} fontSize={9} fill={AXIS_TEXT}>{num(Math.round(val * 10) / 10)}</text>
              </g>
            );
          })}
          {labels.map((l, i) => (
            <text key={i} x={xOf(i)} y={H - 8} fontSize={9} fill={AXIS_TEXT} textAnchor="middle">{l}</text>
          ))}
          {series.map((s) => (
            <g key={s.name}>
              <polyline
                points={s.points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(' ')}
                fill="none" stroke={s.color} strokeWidth={2.2}
              />
              {s.points.map((p, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(p.value)} r={3} fill={s.color}>
                  <title>{`${s.name} — ${p.label}: ${num(p.value)}${unit}`}</title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-row flex-wrap gap-3 lg:w-44 lg:flex-col lg:gap-2 lg:pt-2">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças de UI do módulo
// ---------------------------------------------------------------------------

function KpiCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 text-xs text-gray-500 dark:text-zinc-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueClass ?? 'text-gray-800 dark:text-zinc-100'}`}>{value}</p>
      {sub && <p className="mt-1 truncate text-[11px] text-gray-400" title={sub}>{sub}</p>}
    </div>
  );
}

function Insight({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' | 'ok' }) {
  const cls = tone === 'warn'
    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
    : tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
      : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-2.5 text-xs ${cls}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function SegControl<T extends string>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels: Record<string, string>;
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            o === value
              ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-white'
              : 'text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

/** Botãozinho com painel de checkboxes pra ligar/desligar séries. */
function SeriesFilter({ rows, hidden, onToggle }: {
  rows: ChartRow[]; hidden: Set<string>; onToggle: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        ☰ Filtrar <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 max-h-64 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {rows.map((r, i) => (
            <label key={r.n} className="flex cursor-pointer items-center gap-2 py-1 text-xs text-gray-700 dark:text-zinc-200">
              <input type="checkbox" checked={!hidden.has(r.n)} onChange={() => onToggle(r.n)} />
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color ?? COLORS[i % COLORS.length] }} />
              <span className="truncate">{r.n}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exportação (Excel/CSV e JPEG)
// ---------------------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV com BOM e ";" — abre direto no Excel pt-BR. */
function exportCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v).replace('.', ',');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // '﻿' = BOM — sem ele o Excel pt-BR abre o arquivo com acentuação quebrada.
  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Converte o 1º SVG do container num JPEG e baixa. */
function exportJpeg(container: HTMLElement | null, filename: string) {
  const svg = container?.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = svg.clientWidth || Number(svg.getAttribute('width')) || 640;
  const h = svg.clientHeight || Number(svg.getAttribute('height')) || 280;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((jpeg) => { if (jpeg) downloadBlob(jpeg, filename); }, 'image/jpeg', 0.95);
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ---------------------------------------------------------------------------
// Layout persistido (ordem + largura dos quadros no modo combinado)
// ---------------------------------------------------------------------------

interface PanelLayout { order: ViewKey[]; wide: Partial<Record<ViewKey, boolean>> }
const LAYOUT_KEY = 'kanban-flow-layout-v1';
const DEFAULT_ORDER = VIEWS.map((v) => v.key);

function loadLayout(): PanelLayout {
  if (typeof window === 'undefined') return { order: DEFAULT_ORDER, wide: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as PanelLayout | null;
    if (!raw?.order) return { order: DEFAULT_ORDER, wide: {} };
    const known = raw.order.filter((k) => DEFAULT_ORDER.includes(k));
    return { order: [...known, ...DEFAULT_ORDER.filter((k) => !known.includes(k))], wide: raw.wide ?? {} };
  } catch {
    return { order: DEFAULT_ORDER, wide: {} };
  }
}

// ---------------------------------------------------------------------------
// Modal de drill-down (lista de cards)
// ---------------------------------------------------------------------------

interface ModalState { title: string; sub: string; rows: { a: string; b: string }[] }

function DrillModal({ modal, onClose }: { modal: ModalState; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[80vh] w-[520px] max-w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">{modal.title}</h3>
            <p className="text-xs text-gray-400">{modal.sub}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </div>
        {modal.rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">Sem lista de cards disponível para este recorte.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <tbody>
              {modal.rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                  <td className="py-1.5 pr-3 text-xs font-semibold text-gray-700 dark:text-zinc-200">{r.a}</td>
                  <td className="py-1.5 text-right text-xs tabular-nums text-gray-500 dark:text-zinc-400">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function KanbanFlowPanel({ data, from, to }: { data: KanbanFlowAnalytics; from: string; to: string }) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('dashboard');
  const [flow, setFlow] = useState<KanbanFlowAnalytics>(data);
  const [prevFlow, setPrevFlow] = useState<KanbanFlowAnalytics | null>(null);
  const [compare, setCompare] = useState(false);
  const [loading, setLoading] = useState(false);

  const [activeViews, setActiveViews] = useState<ViewKey[]>(['tempo']);
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineDraft, setCombineDraft] = useState<Set<ViewKey>>(new Set());
  const combined = activeViews.length > 1;

  const [layout, setLayout] = useState<PanelLayout>(loadLayout);
  const [chartTypes, setChartTypes] = useState<Partial<Record<ViewKey, ChartType>>>({});
  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<ViewKey, Set<string>>>>({});
  const [origem, setOrigem] = useState<string | null>(null);
  const [hospitalQuery, setHospitalQuery] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);

  const chartRefs = useRef<Partial<Record<ViewKey, HTMLDivElement | null>>>({});

  // Sincroniza com a carga única quando o dashboard troca o período global.
  useEffect(() => {
    if (periodMode === 'dashboard') { setFlow(data); }
  }, [data, periodMode]);

  const range = useMemo(() => periodRange(periodMode, from, to), [periodMode, from, to]);

  // Temporalidade própria do módulo: fora do modo "dashboard", busca só esta análise.
  useEffect(() => {
    let alive = true;
    if (periodMode === 'dashboard') { setFlow(data); return; }
    setLoading(true);
    getKanbanFlowAnalytics(range.from, range.to)
      .then((d) => { if (alive) setFlow(d); })
      .catch((err) => console.error('[FLUXO] Falha ao buscar período:', err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, range.from, range.to]);

  // Comparação: busca a janela imediatamente anterior com a mesma duração.
  useEffect(() => {
    let alive = true;
    if (!compare) { setPrevFlow(null); return; }
    const prev = previousRange(range.from, range.to);
    getKanbanFlowAnalytics(prev.from, prev.to)
      .then((d) => { if (alive) setPrevFlow(d); })
      .catch((err) => console.error('[FLUXO] Falha ao buscar período anterior:', err));
    return () => { alive = false; };
  }, [compare, range.from, range.to]);

  const persistLayout = useCallback((updater: (prev: PanelLayout) => PanelLayout) => {
    setLayout((prev) => {
      const next = updater(prev);
      if (next !== prev) {
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* quota */ }
      }
      return next;
    });
  }, []);

  // Troca de posição com o vizinho VISÍVEL (pula painéis que não estão na tela).
  const movePanel = useCallback((key: ViewKey, dir: -1 | 1) => {
    persistLayout((prev) => {
      const visible = prev.order.filter((k) => activeViews.includes(k));
      const i = visible.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= visible.length) return prev;
      const order = [...prev.order];
      const pi = order.indexOf(key);
      const pj = order.indexOf(visible[j]);
      [order[pi], order[pj]] = [order[pj], order[pi]];
      return { ...prev, order };
    });
  }, [activeViews, persistLayout]);

  // Largura padrão é "total" — o primeiro clique precisa levar pra "meia".
  const toggleWide = useCallback((key: ViewKey) => {
    persistLayout((prev) => ({ ...prev, wide: { ...prev.wide, [key]: !(prev.wide[key] ?? true) } }));
  }, [persistLayout]);

  const toggleSeries = useCallback((view: ViewKey, name: string) => {
    setHiddenSeries((prev) => {
      const set = new Set(prev[view] ?? []);
      if (set.has(name)) set.delete(name); else set.add(name);
      return { ...prev, [view]: set };
    });
  }, []);

  const setType = useCallback((view: ViewKey, t: ChartType) => {
    setChartTypes((prev) => ({ ...prev, [view]: t }));
  }, []);

  if (flow.totalMoves === 0 && !loading) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Nenhuma movimentação de card registrada no período selecionado.
      </p>
    );
  }

  const orderedActive = layout.order.filter((k) => activeViews.includes(k));

  return (
    <div className="space-y-4">
      {/* ===== Cabeçalho do módulo: temporalidade + comparação + combinação ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-zinc-100">KPIs do Fluxo do Kanban</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            Baseado no histórico real de movimentação dos cards entre colunas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCompare((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              compare
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-gray-200 bg-white text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
            }`}
          >
            <span className={`relative h-4 w-7 rounded-full transition-colors ${compare ? 'bg-blue-500' : 'bg-gray-300 dark:bg-zinc-600'}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${compare ? 'left-3.5' : 'left-0.5'}`} />
            </span>
            Comparar c/ período anterior
          </button>
          <select
            value={periodMode}
            onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {(Object.keys(PERIOD_LABEL) as PeriodMode[]).map((m) => (
              <option key={m} value={m}>{PERIOD_LABEL[m]}</option>
            ))}
          </select>
          <div className="relative">
            <button
              onClick={() => { setCombineDraft(new Set(combined ? activeViews : [])); setCombineOpen((v) => !v); }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <Link2 className="h-3.5 w-3.5" /> Combinar painéis
            </button>
            {combineOpen && (
              <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-xs font-bold text-gray-800 dark:text-zinc-100">Ver vários painéis juntos</p>
                <p className="mb-2 text-[11px] text-gray-400">Selecione 2 ou mais para exibir empilhados na mesma tela.</p>
                {VIEWS.map((v) => (
                  <label key={v.key} className="flex cursor-pointer items-center gap-2 py-1 text-xs text-gray-700 dark:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={combineDraft.has(v.key)}
                      onChange={() => setCombineDraft((prev) => {
                        const next = new Set(prev);
                        if (next.has(v.key)) next.delete(v.key); else next.add(v.key);
                        return next;
                      })}
                    />
                    <span className="h-2 w-2 rounded-full" style={{ background: v.dot }} />
                    {v.label}
                  </label>
                ))}
                <button
                  onClick={() => {
                    if (combineDraft.size < 2) return;
                    setActiveViews(layout.order.filter((k) => combineDraft.has(k)));
                    setCombineOpen(false);
                  }}
                  disabled={combineDraft.size < 2}
                  className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Aplicar ({combineDraft.size} selecionados)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {combined && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <span className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5" />
            Modo combinado — arraste com as setas e ajuste a largura de cada quadro; o arranjo fica salvo neste navegador.
          </span>
          <button
            onClick={() => setActiveViews(['tempo'])}
            className="rounded-lg border border-blue-300 px-2.5 py-1 font-medium hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900/40"
          >
            Sair do modo combinado
          </button>
        </div>
      )}

      {/* ===== Abas (modo painel único) ===== */}
      {!combined && (
        <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-zinc-700">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveViews([v.key])}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeViews[0] === v.key
                  ? 'border-blue-600 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.dot }} />
              {v.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center gap-2 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">Carregando período…</span>
        </div>
      ) : (
        <div className={combined ? 'grid grid-cols-1 gap-4 xl:grid-cols-2' : 'space-y-4'}>
          {orderedActive.map((key) => (
            <div key={key} className={combined && (layout.wide[key] ?? true) ? 'xl:col-span-2' : ''}>
              <PanelCard
                view={key}
                flow={flow}
                prevFlow={compare ? prevFlow : null}
                chartType={chartTypes[key]}
                setChartType={(t) => setType(key, t)}
                hidden={hiddenSeries[key] ?? new Set()}
                onToggleSeries={(n) => toggleSeries(key, n)}
                origem={origem}
                setOrigem={setOrigem}
                hospitalQuery={hospitalQuery}
                setHospitalQuery={setHospitalQuery}
                openModal={setModal}
                chartRef={(el) => { chartRefs.current[key] = el; }}
                exportChartJpeg={() => exportJpeg(chartRefs.current[key] ?? null, `fluxo-kanban-${key}.jpg`)}
                combined={combined}
                isWide={layout.wide[key] ?? true}
                onToggleWide={() => toggleWide(key)}
                onMove={(dir) => movePanel(key, dir)}
              />
            </div>
          ))}
        </div>
      )}

      {modal && <DrillModal modal={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel individual — todo o conteúdo de UMA visão
// ---------------------------------------------------------------------------

interface PanelProps {
  view: ViewKey;
  flow: KanbanFlowAnalytics;
  prevFlow: KanbanFlowAnalytics | null;
  chartType?: ChartType;
  setChartType: (t: ChartType) => void;
  hidden: Set<string>;
  onToggleSeries: (name: string) => void;
  origem: string | null;
  setOrigem: (o: string) => void;
  hospitalQuery: string;
  setHospitalQuery: (q: string) => void;
  openModal: (m: ModalState) => void;
  chartRef: (el: HTMLDivElement | null) => void;
  exportChartJpeg: () => void;
  combined: boolean;
  isWide: boolean;
  onToggleWide: () => void;
  onMove: (dir: -1 | 1) => void;
}

/** Tipos de gráfico disponíveis por painel (linha usa a série semanal REAL). */
const TYPES_BY_VIEW: Record<ViewKey, ChartType[]> = {
  tempo: ['colunas', 'pizza', 'linha'],
  destino: ['colunas', 'pizza', 'funil'],
  retrabalho: ['colunas', 'pizza', 'funil', 'linha'],
  descarte: ['colunas', 'pizza', 'linha'],
  ciclo: [],
  throughput: ['colunas', 'linha'],
  hospital: ['colunas', 'pizza', 'funil'],
};

function PanelCard(props: PanelProps) {
  const { view, flow, prevFlow, hidden, combined } = props;
  const meta = VIEWS.find((v) => v.key === view)!;
  const types = TYPES_BY_VIEW[view];
  const type = props.chartType ?? types[0] ?? 'colunas';

  // ----- monta linhas do gráfico + KPIs + tabelas conforme a visão -----
  const built = buildView(view, flow, prevFlow, props.origem, props.hospitalQuery);
  const rows = built.rows.filter((r) => !hidden.has(r.n));

  const csv = () => exportCsv(`fluxo-kanban-${view}.csv`, built.csvHeader, built.csvRows);

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {/* Cabeçalho do painel */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: meta.dot }}>
              <meta.icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">{meta.label}</p>
              <p className="text-[11px] text-gray-400">{built.sub}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {combined && (
              <>
                <button onClick={() => props.onMove(-1)} title="Mover para cima" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => props.onMove(1)} title="Mover para baixo" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button onClick={props.onToggleWide} title={props.isWide ? 'Meia largura' : 'Largura total'} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  {props.isWide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
            {types.length > 0 && (
              <SegControl options={types} value={type} onChange={props.setChartType} labels={CHART_LABEL} />
            )}
            {built.rows.length > 0 && types.length > 0 && (
              <SeriesFilter rows={built.rows} hidden={hidden} onToggle={props.onToggleSeries} />
            )}
            <button onClick={csv} title="Baixar em Excel (CSV)" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
            {types.length > 0 && (
              <button onClick={props.exportChartJpeg} title="Baixar gráfico em JPEG" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <Camera className="h-3.5 w-3.5" /> JPEG
              </button>
            )}
          </div>
        </div>

        {/* Seletor de origem (só na visão destino) */}
        {view === 'destino' && flow.destinations.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
            Origem:
            <select
              value={props.origem ?? flow.destinations[0].column}
              onChange={(e) => props.setOrigem(e.target.value)}
              className="max-w-[320px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              {flow.destinations.map((d) => (
                <option key={d.column} value={d.column}>{d.column} ({d.total} saídas)</option>
              ))}
            </select>
          </div>
        )}

        {/* Busca de hospital (só na visão hospital) */}
        {view === 'hospital' && (
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={props.hospitalQuery}
              onChange={(e) => props.setHospitalQuery(e.target.value)}
              placeholder="Pesquisar hospital…"
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        )}

        {/* KPIs */}
        {built.kpis.length > 0 && (
          <div className={`grid grid-cols-2 gap-3 ${built.kpis.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {built.kpis.map((k) => <KpiCard key={k.label} {...k} />)}
          </div>
        )}

        {/* Insight */}
        {built.insight && <Insight tone={built.insightTone}>{built.insight}</Insight>}

        {/* Gráfico */}
        {types.length > 0 && (
          <div ref={props.chartRef}>
            {type === 'colunas' && (
              <ColumnsChart rows={rows} unit={built.unit} compare={!!prevFlow} onBar={(r) => props.openModal(built.drill(r))} />
            )}
            {type === 'pizza' && <PieChart rows={rows} unit={built.unit} onSlice={(r) => props.openModal(built.drill(r))} />}
            {type === 'funil' && <FunnelChart rows={rows} unit={built.unit} onStage={(r) => props.openModal(built.drill(r))} />}
            {type === 'linha' && <LineChart series={built.trend} unit={built.unit} />}
          </div>
        )}
        {type === 'linha' && types.includes('linha') && (
          <p className="text-[11px] text-gray-400">Linha = evolução semanal real dentro do período selecionado.</p>
        )}

        {/* Tabelas específicas da visão */}
        {built.extra}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// buildView: transforma KanbanFlowAnalytics nos dados de cada painel
// ---------------------------------------------------------------------------

interface BuiltView {
  sub: string;
  unit: string;
  rows: ChartRow[];
  trend: TrendSeries[];
  kpis: { label: string; value: string; sub?: string; valueClass?: string }[];
  insight: React.ReactNode | null;
  insightTone: 'info' | 'warn' | 'ok';
  csvHeader: string[];
  csvRows: (string | number | null | undefined)[][];
  drill: (row: ChartRow) => ModalState;
  extra: React.ReactNode | null;
}

function deltaSub(cur: number, prev: number | undefined, unit: string, goodWhenDown = false): string | undefined {
  if (prev == null) return undefined;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return 'igual ao período anterior';
  const arrow = d > 0 ? '▲' : '▼';
  const good = goodWhenDown ? d < 0 : d > 0;
  return `${arrow} ${num(Math.abs(d))}${unit} vs anterior ${good ? '(melhor)' : '(pior)'}`;
}

function buildView(
  view: ViewKey,
  flow: KanbanFlowAnalytics,
  prevFlow: KanbanFlowAnalytics | null,
  origem: string | null,
  hospitalQuery: string,
): BuiltView {
  const weekly = flow.weekly ?? [];

  if (view === 'tempo') {
    const prevByCol = new Map((prevFlow?.dwell ?? []).map((c) => [c.column, c.avgDays]));
    const rows: ChartRow[] = flow.dwell.map((c) => ({
      n: c.column, v: c.avgDays, prev: prevByCol.get(c.column), count: c.n,
      color: c.avgDays > 1.2 ? '#ef4444' : c.avgDays > 0.6 ? '#f59e0b' : '#3b82f6',
    }));
    const sorted = [...flow.dwell].sort((a, b) => b.avgDays - a.avgDays);
    const avgAll = flow.dwell.length
      ? Math.round((flow.dwell.reduce((a, c) => a + c.avgDays, 0) / flow.dwell.length) * 10) / 10 : null;
    const prevAvgAll = prevFlow?.dwell.length
      ? Math.round((prevFlow.dwell.reduce((a, c) => a + c.avgDays, 0) / prevFlow.dwell.length) * 10) / 10 : undefined;
    return {
      sub: 'Tempo médio de permanência por coluna — clique numa barra para ver os cards mais lentos.',
      unit: ' d',
      rows,
      trend: [{ name: 'Tempo médio/etapa', color: '#3b82f6', points: weekly.map((w) => ({ label: w.label, value: w.avgDwellDays ?? 0 })) }],
      kpis: [
        { label: 'Coluna mais lenta', value: fmtDays(sorted[0]?.avgDays), sub: sorted[0]?.column, valueClass: 'text-red-600' },
        { label: 'Coluna mais rápida', value: fmtDays(sorted[sorted.length - 1]?.avgDays), sub: sorted[sorted.length - 1]?.column, valueClass: 'text-emerald-600' },
        { label: 'Tempo médio geral / etapa', value: fmtDays(avgAll), sub: deltaSub(avgAll ?? 0, prevAvgAll, ' d', true) },
        { label: 'Colunas monitoradas', value: String(flow.dwell.length) },
      ],
      insight: sorted[0] && sorted[1] && sorted[0].avgDays >= sorted[1].avgDays * 2
        ? (<><b>Gargalo identificado:</b> &quot;{sorted[0].column}&quot; retém os cards {fmtDays(sorted[0].avgDays)} em média — mais que o dobro da segunda colocada.</>)
        : null,
      insightTone: 'warn',
      csvHeader: ['Coluna', 'Saídas', 'Tempo médio (dias)', 'Maior (dias)', 'Menor (dias)'],
      csvRows: flow.dwell.map((c) => [c.column, c.n, c.avgDays, c.maxDays, c.minDays]),
      drill: (r) => {
        const col = flow.dwell.find((c) => c.column === r.n);
        return {
          title: r.n,
          sub: `${col?.n ?? 0} saída(s) medidas — cards que mais demoraram nesta coluna`,
          rows: (col?.slowest ?? []).map((s) => ({ a: s.card, b: fmtDays(s.days) })),
        };
      },
      extra: null,
    };
  }

  if (view === 'destino') {
    const sel = flow.destinations.find((d) => d.column === origem) ?? flow.destinations[0];
    const rows: ChartRow[] = (sel?.destinations ?? []).map((d, i) => ({
      n: d.to, v: d.pct, count: d.count, color: d.expected ? COLORS[i % COLORS.length] : '#ef4444',
    }));
    const offPattern = flow.destinations.flatMap((c) =>
      c.destinations.filter((d) => !d.expected && c.mapped).map((d) => ({ from: c.column, ...d })));
    return {
      sub: 'Para onde os cards seguem a partir de cada coluna (percentual das saídas).',
      unit: '%',
      rows,
      trend: [],
      kpis: [],
      insight: offPattern.length
        ? (<><b>{offPattern.length} destino(s) fora do fluxo esperado</b> neste período — ex.: {offPattern[0].from} → {offPattern[0].to} ({offPattern[0].count} card(s)). Destinos fora do padrão aparecem em vermelho.</>)
        : (<><b>Nenhum movimento fora do fluxo esperado</b> nas colunas mapeadas. ✓</>),
      insightTone: offPattern.length ? 'warn' : 'ok',
      csvHeader: ['Origem', 'Destino', 'Cards', '% das saídas', 'Dentro do fluxo esperado?'],
      csvRows: flow.destinations.flatMap((c) =>
        c.destinations.map((d) => [c.column, d.to, d.count, d.pct, d.expected ? 'sim' : 'NÃO'])),
      drill: (r) => ({
        title: `${sel?.column ?? ''} → ${r.n}`,
        sub: `${r.count ?? 0} card(s) fizeram este movimento no período`,
        rows: [],
      }),
      extra: null,
    };
  }

  if (view === 'retrabalho') {
    const rows: ChartRow[] = flow.rework.byColumn.map((c) => ({ n: c.column, v: c.count, count: c.count, color: '#f59e0b' }));
    const totalCards = flow.throughput?.entries ?? 0;
    const pctCards = totalCards ? Math.round((flow.rework.cardsWithReturn / totalCards) * 100) : 0;
    const prevPct = prevFlow && prevFlow.throughput?.entries
      ? Math.round((prevFlow.rework.cardsWithReturn / prevFlow.throughput.entries) * 100) : undefined;
    return {
      sub: 'Cards que voltaram para uma coluna onde já tinham passado.',
      unit: '',
      rows,
      trend: [{ name: 'Retornos/semana', color: '#f59e0b', points: weekly.map((w) => ({ label: w.label, value: w.returns })) }],
      kpis: [
        { label: 'Cards com retorno', value: `${pctCards}%`, sub: deltaSub(pctCards, prevPct, ' pp', true), valueClass: 'text-amber-600' },
        { label: 'Retornos no período', value: String(flow.rework.totalReturns) },
        { label: 'Coluna que mais recebe', value: flow.rework.byColumn[0]?.column ?? '—', valueClass: 'text-sm pt-2' },
      ],
      insight: (<>O <b>motivo do retorno</b> (documento faltante, assinatura pendente…) ainda não é registrado ao mover o card — quando for, este painel cruza coluna × motivo.</>),
      insightTone: 'info',
      csvHeader: ['Coluna que recebeu de volta', 'Retornos'],
      csvRows: flow.rework.byColumn.map((c) => [c.column, c.count]),
      drill: (r) => ({
        title: r.n,
        sub: 'Retornos registrados para esta coluna (amostra)',
        rows: flow.rework.samples.filter((s) => s.backTo === r.n).map((s) => ({ a: s.card, b: `${s.from} → ${s.backTo}` })),
      }),
      extra: flow.rework.samples.length > 0 ? (
        <details className="group rounded-xl border border-gray-200 dark:border-zinc-700">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-zinc-300">
            Quem voltou, de onde → para onde ({flow.rework.samples.length})
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="max-h-64 overflow-y-auto border-t border-gray-100 dark:border-zinc-800">
            <table className="w-full border-collapse text-left">
              <tbody>
                {flow.rework.samples.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-200">{s.card}</td>
                    <td className="px-4 py-1.5 text-xs text-gray-500 dark:text-zinc-400">{s.from} → {s.backTo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null,
    };
  }

  if (view === 'descarte') {
    const prevByCol = new Map((prevFlow?.discard ?? []).map((c) => [c.column, c.pct]));
    const rows: ChartRow[] = flow.discard.map((c) => ({
      n: c.column, v: c.pct, prev: prevByCol.get(c.column), count: c.discarded, color: '#ef4444',
    }));
    const totalMoves = flow.discard.reduce((a, c) => a + c.passed, 0);
    const totalDisc = flow.discard.reduce((a, c) => a + c.discarded, 0);
    const pctAll = totalMoves ? Math.round((totalDisc / totalMoves) * 1000) / 10 : 0;
    const prevTotalMoves = prevFlow?.discard.reduce((a, c) => a + c.passed, 0) ?? 0;
    const prevPctAll = prevFlow && prevTotalMoves
      ? Math.round(((prevFlow.discard.reduce((a, c) => a + c.discarded, 0)) / prevTotalMoves) * 1000) / 10 : undefined;
    return {
      sub: 'Percentual de cards enviados para "Nikolas Analisar", por coluna de origem.',
      unit: '%',
      rows,
      trend: [{ name: '% descarte/semana', color: '#ef4444', points: weekly.map((w) => ({ label: w.label, value: w.discardPct })) }],
      kpis: [
        { label: 'Total descartado', value: String(flow.throughput?.discarded ?? totalDisc), valueClass: 'text-red-600' },
        { label: '% sobre movimentos', value: `${num(pctAll)}%`, sub: deltaSub(pctAll, prevPctAll, ' pp', true), valueClass: 'text-red-600' },
        { label: 'Coluna com maior %', value: flow.discard[0] ? `${flow.discard[0].pct}%` : '—', sub: flow.discard[0]?.column },
      ],
      insight: null,
      insightTone: 'info',
      csvHeader: ['Coluna de origem', 'Saíram dela', 'Descartados', '% de descarte'],
      csvRows: flow.discard.map((c) => [c.column, c.passed, c.discarded, c.pct]),
      drill: (r) => {
        const c = flow.discard.find((d) => d.column === r.n);
        return {
          title: r.n,
          sub: `${c?.discarded ?? 0} de ${c?.passed ?? 0} saídas foram para o descarte`,
          rows: [],
        };
      },
      extra: null,
    };
  }

  if (view === 'ciclo') {
    const t = flow.totalTime;
    return {
      sub: 'Do primeiro ao último movimento do card dentro do período.',
      unit: ' d',
      rows: [],
      trend: [],
      kpis: [
        { label: 'Tempo médio total', value: fmtDays(t.avgDays) },
        { label: 'Mediana', value: fmtDays(t.medianDays) },
        { label: 'Card mais lento', value: fmtDays(t.slowest[0]?.days), sub: t.slowest[0]?.card, valueClass: 'text-red-600' },
        { label: 'Card mais rápido', value: fmtDays(t.fastest[0]?.days), sub: t.fastest[0]?.card, valueClass: 'text-emerald-600' },
      ],
      insight: null,
      insightTone: 'info',
      csvHeader: ['Grupo', 'Card', 'Dias'],
      csvRows: [
        ...t.slowest.map((c) => ['10 mais lentos', c.card, c.days] as (string | number)[]),
        ...t.fastest.map((c) => ['10 mais rápidos', c.card, c.days] as (string | number)[]),
      ],
      drill: () => ({ title: '', sub: '', rows: [] }),
      extra: (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {([['10 mais lentos', t.slowest, 'text-red-600'], ['10 mais rápidos', t.fastest, 'text-emerald-600']] as const).map(([title, list, cls]) => (
            <div key={title}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
              {list.length === 0 ? (
                <p className="text-sm text-gray-500">Sem dados suficientes no período.</p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <tbody>
                    {list.map((c, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                        <td className="w-8 py-1.5 text-xs text-gray-400">{i + 1}º</td>
                        <td className="truncate py-1.5 pr-3 text-sm text-gray-700 dark:text-zinc-200">{c.card}</td>
                        <td className={`py-1.5 text-right text-sm font-bold tabular-nums ${cls}`}>{fmtDays(c.days)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ),
    };
  }

  if (view === 'throughput') {
    const tp = flow.throughput ?? { entries: 0, done: 0, discarded: 0, balance: 0 };
    const rows: ChartRow[] = weekly.map((w) => ({ n: `Sem. ${w.label}`, v: w.entries, count: w.entries, color: '#3b82f6' }));
    const lastWeeks = weekly.slice(-3);
    const pressured = lastWeeks.length >= 2 && lastWeeks.every((w) => w.entries > w.done + w.discarded);
    return {
      sub: 'Vazão do fluxo: quantos cards entram e quantos saem (enviados ou descartados) por semana.',
      unit: '',
      rows,
      trend: [
        { name: 'Entradas', color: '#3b82f6', points: weekly.map((w) => ({ label: w.label, value: w.entries })) },
        { name: 'Enviados (concluídos)', color: '#10b981', points: weekly.map((w) => ({ label: w.label, value: w.done })) },
        { name: 'Descartados', color: '#ef4444', points: weekly.map((w) => ({ label: w.label, value: w.discarded })) },
      ],
      kpis: [
        { label: 'Entradas no período', value: String(tp.entries), sub: deltaSub(tp.entries, prevFlow?.throughput?.entries, ''), valueClass: 'text-blue-600' },
        { label: 'Enviados (concluídos)', value: String(tp.done), sub: deltaSub(tp.done, prevFlow?.throughput?.done, ''), valueClass: 'text-emerald-600' },
        { label: 'Descartados', value: String(tp.discarded), sub: deltaSub(tp.discarded, prevFlow?.throughput?.discarded, '', true), valueClass: 'text-red-600' },
        { label: 'Saldo em andamento', value: `${tp.balance >= 0 ? '+' : ''}${tp.balance}`, sub: 'entradas − saídas', valueClass: 'text-amber-600' },
      ],
      insight: pressured
        ? (<><b>Atenção:</b> nas últimas semanas as entradas superaram as saídas — o volume represado no fluxo está crescendo.</>)
        : null,
      insightTone: 'warn',
      csvHeader: ['Semana (início)', 'Entradas', 'Enviados', 'Descartados', 'Retornos', 'Movimentos'],
      csvRows: weekly.map((w) => [w.weekStart, w.entries, w.done, w.discarded, w.returns, w.moves]),
      drill: (r) => ({ title: r.n, sub: `${r.count ?? 0} card(s) entraram nesta semana`, rows: [] }),
      extra: null,
    };
  }

  // hospital
  const all = flow.hospitals ?? [];
  const q = hospitalQuery.trim().toLowerCase();
  const hosp = q ? all.filter((h) => h.hospital.toLowerCase().includes(q)) : all;
  return {
    sub: 'Cruzamento por hospital do card — volume, conclusão, retrabalho, descarte e tempo médio.',
    unit: '',
    rows: hosp.slice(0, 12).map((h, i) => ({ n: h.hospital, v: h.cards, count: h.cards, color: COLORS[i % COLORS.length] })),
    trend: [],
    kpis: [
      { label: 'Hospitais no período', value: String(hosp.length) },
      { label: 'Maior volume', value: String(hosp[0]?.cards ?? 0), sub: hosp[0]?.hospital },
      {
        label: 'Maior % retrabalho',
        value: hosp.length ? `${[...hosp].sort((a, b) => b.returnPct - a.returnPct)[0].returnPct}%` : '—',
        sub: hosp.length ? [...hosp].sort((a, b) => b.returnPct - a.returnPct)[0].hospital : undefined,
        valueClass: 'text-amber-600',
      },
      {
        label: 'Maior % descarte',
        value: hosp.length ? `${[...hosp].sort((a, b) => b.discardPct - a.discardPct)[0].discardPct}%` : '—',
        sub: hosp.length ? [...hosp].sort((a, b) => b.discardPct - a.discardPct)[0].hospital : undefined,
        valueClass: 'text-red-600',
      },
    ],
    insight: null,
    insightTone: 'info',
    csvHeader: ['Hospital', 'Cards no período', 'Enviados', 'Descartados', 'Cards c/ retorno', '% retrabalho', '% descarte', 'Tempo médio (dias)'],
    csvRows: hosp.map((h) => [h.hospital, h.cards, h.done, h.discarded, h.returns, h.returnPct, h.discardPct, h.avgDays]),
    drill: (r) => {
      const h = hosp.find((x) => x.hospital === r.n);
      return {
        title: r.n,
        sub: `${h?.cards ?? 0} card(s) movimentados no período`,
        rows: h ? [
          { a: 'Enviados (concluídos)', b: String(h.done) },
          { a: 'Descartados', b: `${h.discarded} (${h.discardPct}%)` },
          { a: 'Cards com retorno', b: `${h.returns} (${h.returnPct}%)` },
          { a: 'Tempo médio no board', b: fmtDays(h.avgDays) },
        ] : [],
      };
    },
    extra: <HospitalTable hospitals={hosp} filtered={q.length > 0} total={all.length} />,
  };
}

/** Tabela completa por hospital — já chega filtrada pela busca. */
function HospitalTable({ hospitals, filtered, total }: {
  hospitals: KanbanFlowAnalytics['hospitals']; filtered: boolean; total: number;
}) {
  const th = 'py-2 pr-3 text-[11px] font-bold uppercase tracking-wide text-gray-400';
  const td = 'py-2 pr-3 text-sm text-gray-700 dark:text-zinc-200';
  const pill = (pct: number, warnAt: number, dangerAt: number) => (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
      pct >= dangerAt
        ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
        : pct >= warnAt
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
    }`}>{pct}%</span>
  );
  if (hospitals.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-500">
        {filtered ? 'Nenhum hospital encontrado para a busca.' : 'Nenhum hospital identificado nos cards do período.'}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-zinc-700">
            <th className={th}>Hospital</th>
            <th className={`${th} text-right`}>Solicitações</th>
            <th className={`${th} text-right`}>Enviados</th>
            <th className={`${th} text-right`}>Descartados</th>
            <th className={th}>% Retrabalho</th>
            <th className={th}>% Descarte</th>
            <th className={`${th} text-right`}>Tempo médio</th>
          </tr>
        </thead>
        <tbody>
          {hospitals.map((h) => (
            <tr key={h.hospital} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
              <td className={`${td} font-semibold`}>{h.hospital}</td>
              <td className={`${td} text-right tabular-nums`}>{h.cards}</td>
              <td className={`${td} text-right tabular-nums text-emerald-600`}>{h.done}</td>
              <td className={`${td} text-right tabular-nums text-red-600`}>{h.discarded}</td>
              <td className={td}>{pill(h.returnPct, 10, 18)}</td>
              <td className={td}>{pill(h.discardPct, 12, 20)}</td>
              <td className={`${td} text-right font-semibold tabular-nums`}>{fmtDays(h.avgDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered && (
        <p className="mt-2 text-[11px] text-gray-400">Mostrando {hospitals.length} de {total} hospitais (filtro ativo).</p>
      )}
    </div>
  );
}
