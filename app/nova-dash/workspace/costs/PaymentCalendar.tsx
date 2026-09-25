'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, Check, Receipt, ChevronLeft, ChevronRight, Clock, Loader2,
  Pause, Pencil, Play, Plus, Trash2, Undo2, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  listPaymentCalendar, markPaymentPaid, unmarkPaymentPaid, deletePaymentSchedule,
  setPaymentScheduleActive,
  type LooseInvoiceDTO, type OccurrenceDTO, type PaymentCalendarData, type PaymentScheduleDTO,
} from '@/app/_actions/costs/schedule';
import {
  MONTH_NAMES, PAYMENT_RECURRENCES, costServiceColor, costServiceLabel, formatMoney,
  parseMoneyToCents,
} from '@/app/_shared/lib/costs';
import { addMonthsKey, daysInMonthKey } from '@/app/_shared/utils/payment-calendar';
import { PaymentScheduleDialog } from './PaymentScheduleDialog';

// CALENDÁRIO DE PAGAMENTOS (24/09/2026): "dia 10 a 12 paga a Vercel, R$ 100 a
// 120". Grade do mês com a janela de cada conta, pendências no topo e o
// "marcar pago" que vira fatura manual (entra nos totais do painel de Custos).

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const STATUS_STYLE: Record<string, { label: string; chip: string; dot: string }> = {
  pago: { label: 'Pago', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  atrasado: { label: 'Atrasado', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  aberto: { label: 'Vence agora', chip: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  futuro: { label: 'A vencer', chip: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

function dm(key: string) {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}
function monthTitle(monthKey: string) {
  return `${MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1]} de ${monthKey.slice(0, 4)}`;
}
function windowLabel(o: OccurrenceDTO) {
  return o.from === o.to ? `dia ${dm(o.from)}` : `${dm(o.from)} a ${dm(o.to)}`;
}
function dueText(o: OccurrenceDTO) {
  if (o.status === 'pago') return o.payment ? `pago em ${dm(o.payment.paidOn)}` : 'pago';
  if (o.status === 'atrasado') return `atrasado há ${-o.daysToDue} dia${o.daysToDue === -1 ? '' : 's'}`;
  if (o.daysToDue === 0) return 'último dia hoje';
  return `faltam ${o.daysToDue} dia${o.daysToDue === 1 ? '' : 's'}`;
}
function rangeText(s: PaymentScheduleDTO) {
  return s.minCents === s.maxCents
    ? formatMoney(s.maxCents, s.currency)
    : `${formatMoney(s.minCents, s.currency)} – ${formatMoney(s.maxCents, s.currency)}`;
}

export function PaymentCalendar({ onPaidChange }: { onPaidChange?: () => void }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<PaymentCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PaymentScheduleDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [defaultDay, setDefaultDay] = useState<number | null>(null);
  const [paying, setPaying] = useState<OccurrenceDTO | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async (m?: string) => {
    setLoading(true);
    try { setData(await listPaymentCalendar(m)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao carregar o calendário.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(month); }, [load, month]);

  const schedById = useMemo(() => new Map((data?.schedules ?? []).map((s) => [s.id, s])), [data]);
  const viewMonth = data?.month ?? month ?? '';

  // Grade: dias do mês com as contas cuja janela cobre cada dia.
  const cells = useMemo(() => {
    if (!data) return [];
    const [y, m] = data.month.split('-').map(Number);
    const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const total = daysInMonthKey(data.month);
    const out: ({ key: string; day: number; occ: OccurrenceDTO[]; loose: LooseInvoiceDTO[] } | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= total; d++) {
      const key = `${data.month}-${String(d).padStart(2, '0')}`;
      out.push({
        key, day: d,
        occ: data.occurrences.filter((o) => o.from <= key && key <= o.to),
        loose: data.looseInvoices.filter((x) => x.day === key),
      });
    }
    while (out.length % 7) out.push(null);
    return out;
  }, [data]);

  const reload = async () => { await load(viewMonth); onPaidChange?.(); };

  async function unmark(o: OccurrenceDTO) {
    const s = schedById.get(o.scheduleId);
    const ok = await confirm({
      title: 'Desfazer pagamento?',
      description: `${s ? costServiceLabel(s.service) : 'Conta'} de ${monthTitle(o.periodKey)} volta para pendente e a fatura lançada é apagada.`,
    });
    if (!ok) return;
    try { await unmarkPaymentPaid(o.scheduleId, o.periodKey); toast.success('Pagamento desfeito.'); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao desfazer.'); }
  }

  async function removeSchedule(s: PaymentScheduleDTO) {
    const ok = await confirm({
      title: 'Excluir conta do calendário?',
      description: `${costServiceLabel(s.service)}${s.description ? ` — ${s.description}` : ''}. Os pagamentos já feitos continuam nas faturas.`,
    });
    if (!ok) return;
    try { await deletePaymentSchedule(s.id); toast.success('Conta excluída.'); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao excluir.'); }
  }

  async function toggleActive(s: PaymentScheduleDTO) {
    try { await setPaymentScheduleActive(s.id, !s.active); await load(viewMonth); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao salvar.'); }
  }

  const openNew = (day?: number) => { setEditing(null); setDefaultDay(day ?? null); setFormOpen(true); };

  if (!data && loading) {
    return <div className="grid place-items-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) return null;

  const { totals } = data;
  const paidPct = totals.expectedMaxBrlCents > 0 ? Math.min(100, Math.round((totals.paidBrlCents / totals.expectedMaxBrlCents) * 100)) : 0;
  const pending = data.occurrences.filter((o) => o.status !== 'pago').length;
  const dayList = selectedDay ? data.occurrences.filter((o) => o.from <= selectedDay && selectedDay <= o.to) : data.occurrences;
  const looseList = selectedDay ? data.looseInvoices.filter((x) => x.day === selectedDay) : data.looseInvoices;

  return (
    <div className="space-y-4">
      {/* Navegação do mês */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-gray-200 bg-white">
          <button onClick={() => { setSelectedDay(null); setMonth(addMonthsKey(viewMonth, -1)); }} className="rounded-l-xl p-2 hover:bg-gray-50" title="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[10rem] px-2 text-center text-sm font-black capitalize text-gray-900">{monthTitle(viewMonth)}</span>
          <button onClick={() => { setSelectedDay(null); setMonth(addMonthsKey(viewMonth, 1)); }} className="rounded-r-xl p-2 hover:bg-gray-50" title="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {viewMonth !== data.today.slice(0, 7) && (
          <Button variant="outline" size="sm" onClick={() => { setSelectedDay(null); setMonth(data.today.slice(0, 7)); }}>Hoje</Button>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        <div className="flex-1" />
        <Button size="sm" onClick={() => openNew()} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-1 h-4 w-4" /> Nova conta
        </Button>
      </div>

      {/* Resumo do mês */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Previsto no mês</p>
          <p className="text-lg font-black tabular-nums text-gray-900">
            {totals.expectedMinBrlCents === totals.expectedMaxBrlCents
              ? formatMoney(totals.expectedMaxBrlCents)
              : `${formatMoney(totals.expectedMinBrlCents)} – ${formatMoney(totals.expectedMaxBrlCents)}`}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Já pago</p>
          <p className="text-lg font-black tabular-nums text-emerald-600">{formatMoney(totals.paidBrlCents)}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} /></div>
          {totals.looseBrlCents > 0 && (
            <p className="mt-1 text-[10px] text-gray-400">+ {formatMoney(totals.looseBrlCents)} em faturas avulsas</p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pendentes no mês</p>
          <p className="text-lg font-black tabular-nums text-gray-900">{pending} <span className="text-xs font-semibold text-gray-400">de {data.occurrences.length}</span></p>
        </div>
        <div className={`rounded-2xl border p-3 ${data.overdue.length ? 'border-rose-200 bg-rose-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Atrasados</p>
          <p className={`text-lg font-black tabular-nums ${data.overdue.length ? 'text-rose-600' : 'text-gray-900'}`}>{data.overdue.length}</p>
        </div>
      </div>

      {/* Pendências (independem do mês exibido) */}
      {(data.overdue.length > 0 || data.upcoming.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {[...data.overdue, ...data.upcoming].map((o) => {
            const s = schedById.get(o.scheduleId);
            if (!s) return null;
            const late = o.status === 'atrasado';
            return (
              <button
                key={`${o.scheduleId}|${o.periodKey}`}
                onClick={() => setPaying(o)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:shadow-sm ${late ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                title="Clique para marcar como pago"
              >
                {late ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: costServiceColor(s.service) }} />
                {costServiceLabel(s.service)} · {windowLabel(o)} · {dueText(o)}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* Grade do mês */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c, i) => {
              if (!c) return <div key={`e${i}`} className="min-h-[5.5rem] border-b border-r border-gray-50 bg-gray-50/40" />;
              const isToday = c.key === data.today;
              const isSel = c.key === selectedDay;
              return (
                <div
                  key={c.key}
                  onClick={() => setSelectedDay(isSel ? null : c.key)}
                  onDoubleClick={() => openNew(c.day)}
                  className={`group relative min-h-[5.5rem] cursor-pointer border-b border-r border-gray-100 p-1 transition hover:bg-indigo-50/40 ${isSel ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300' : ''}`}
                  title="Clique para filtrar · duplo clique para criar conta neste dia"
                >
                  <div className="flex items-center justify-between">
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>{c.day}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openNew(c.day); }}
                      className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-white hover:text-indigo-600 group-hover:opacity-100"
                      title="Nova conta neste dia"
                    ><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {c.occ.slice(0, 3).map((o) => {
                      const s = schedById.get(o.scheduleId);
                      if (!s) return null;
                      const color = costServiceColor(s.service);
                      const isStart = o.from === c.key || c.day === 1;
                      const isEnd = o.to === c.key;
                      const paid = o.status === 'pago';
                      const late = o.status === 'atrasado';
                      return (
                        <button
                          key={o.scheduleId}
                          onClick={(e) => { e.stopPropagation(); if (paid) void unmark(o); else setPaying(o); }}
                          className={`flex w-full items-center gap-1 truncate px-1.5 py-0.5 text-left text-[10px] font-bold text-white shadow-sm transition hover:brightness-110 ${isStart ? 'rounded-l-md' : '-ml-1 pl-2.5'} ${isEnd ? 'rounded-r-md' : '-mr-1'} ${paid ? 'opacity-50' : ''} ${late ? 'ring-2 ring-rose-400' : ''}`}
                          style={{ backgroundColor: color }}
                          title={`${costServiceLabel(s.service)} · ${windowLabel(o)} · ${rangeText(s)} · ${paid ? 'clique para desfazer' : 'clique para marcar pago'}`}
                        >
                          {paid && <Check className="h-3 w-3 shrink-0" />}
                          {late && <AlertTriangle className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{isStart || isEnd ? costServiceLabel(s.service) : ' '}</span>
                        </button>
                      );
                    })}
                    {c.occ.length > 3 && <p className="px-1 text-[10px] font-semibold text-gray-400">+{c.occ.length - 3}</p>}
                    {c.loose.slice(0, 2).map((x) => (
                      <div
                        key={x.id}
                        className="flex items-center gap-1 truncate rounded-md border-l-[3px] bg-gray-100 px-1 py-0.5 text-[10px] font-semibold text-gray-600"
                        style={{ borderLeftColor: costServiceColor(x.service) }}
                        title={`Fatura lançada: ${costServiceLabel(x.service)}${x.description ? ` · ${x.description}` : ''} · ${formatMoney(x.amountCents, x.currency)}`}
                      >
                        <span className="truncate">{formatMoney(x.amountBrlCents)}</span>
                      </div>
                    ))}
                    {c.loose.length > 2 && <p className="px-1 text-[10px] font-semibold text-gray-400">+{c.loose.length - 2} fatura{c.loose.length - 2 === 1 ? '' : 's'}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lista do mês (ou do dia selecionado) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              {selectedDay ? `Dia ${dm(selectedDay)}` : 'Contas do mês'}
            </h3>
            {selectedDay && <button onClick={() => setSelectedDay(null)} className="text-xs font-semibold text-indigo-600 hover:underline">ver o mês</button>}
          </div>
          {dayList.length === 0 && looseList.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
              {data.schedules.length === 0 ? 'Nenhuma conta cadastrada. Clique em "Nova conta" para começar.' : 'Nada vence aqui.'}
            </div>
          )}
          {dayList.map((o) => {
            const s = schedById.get(o.scheduleId);
            if (!s) return null;
            const st = STATUS_STYLE[o.status];
            return (
              <div key={o.scheduleId} className="rounded-2xl border border-gray-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: costServiceColor(s.service) }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-gray-900">{costServiceLabel(s.service)}</p>
                    <p className="truncate text-[11px] text-gray-400">{s.description || windowLabel(o)}{s.description ? ` · ${windowLabel(o)}` : ''}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.chip}`}>{st.label}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="text-[11px] text-gray-500">
                    <p>esperado <b className="text-gray-800">{rangeText(s)}</b></p>
                    {o.cycleConsumedBrlCents !== null && !o.payment && (
                      <p className="flex items-center gap-1 text-indigo-600" title={`Consumo pelas APIs de ${dm(o.cycleFrom)} a ${dm(o.cycleTo)}`}>
                        <Zap className="h-3 w-3" /> consumo do ciclo {formatMoney(o.cycleConsumedBrlCents)}
                      </p>
                    )}
                    {o.payment
                      ? <p className="text-emerald-700">pago {formatMoney(o.payment.amountCents, o.payment.currency)} em {dm(o.payment.paidOn)}{o.payment.description ? ` · ${o.payment.description}` : ''}</p>
                      : <p className={o.status === 'atrasado' ? 'font-semibold text-rose-600' : ''}>{dueText(o)}</p>}
                  </div>
                  {o.payment ? (
                    <Button variant="ghost" size="sm" onClick={() => unmark(o)} className="h-7 px-2 text-gray-500" title="Desfazer pagamento"><Undo2 className="h-3.5 w-3.5" /></Button>
                  ) : (
                    <Button size="sm" onClick={() => setPaying(o)} className="h-7 bg-emerald-600 px-2.5 text-xs hover:bg-emerald-700"><Check className="mr-1 h-3.5 w-3.5" /> Marcar pago</Button>
                  )}
                </div>
              </div>
            );
          })}
          {looseList.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-gray-700">
                <Receipt className="h-3.5 w-3.5 text-gray-400" /> Faturas avulsas lançadas
              </p>
              <ul className="space-y-1.5">
                {looseList.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: costServiceColor(x.service) }} />
                    <span className="w-10 shrink-0 tabular-nums text-gray-400">{dm(x.day)}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-700">{costServiceLabel(x.service)}{x.description ? ` · ${x.description}` : ''}</span>
                    <span className="shrink-0 font-bold tabular-nums text-gray-900">{formatMoney(x.amountBrlCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Contas cadastradas */}
      {data.schedules.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <p className="border-b border-gray-100 px-4 py-2.5 text-sm font-black text-gray-900">Contas cadastradas</p>
          <ul className="divide-y divide-gray-100">
            {data.schedules.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${s.active ? '' : 'opacity-50'}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: costServiceColor(s.service) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">{costServiceLabel(s.service)}{s.description ? <span className="font-normal text-gray-400"> · {s.description}</span> : null}</p>
                  <p className="text-[11px] text-gray-400">
                    {PAYMENT_RECURRENCES.find((r) => r.key === s.recurrence)?.label}
                    {s.recurrence === 'YEARLY' && s.month ? ` (${MONTH_NAMES[s.month - 1]})` : ''}
                    {s.recurrence === 'ONCE' ? ` (${monthTitle(s.startMonth)})` : ''}
                    {' · '}{s.dayFrom === s.dayTo ? `dia ${s.dayFrom}` : `dia ${s.dayFrom} a ${s.dayTo}`}
                    {' · '}{rangeText(s)}
                    {!s.active ? ' · pausada' : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(s); setFormOpen(true); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => toggleActive(s)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={s.active ? 'Pausar' : 'Reativar'}>{s.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                  <button onClick={() => removeSchedule(s)} className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {formOpen && (
        <PaymentScheduleDialog
          initial={editing}
          defaultDay={defaultDay}
          defaultMonth={viewMonth}
          onClose={() => setFormOpen(false)}
          onSaved={async () => { setFormOpen(false); await load(viewMonth); }}
        />
      )}
      {paying && schedById.get(paying.scheduleId) && (
        <MarkPaidDialog
          occ={paying}
          schedule={schedById.get(paying.scheduleId)!}
          today={data.today}
          fxRate={data.fxRate}
          onClose={() => setPaying(null)}
          onSaved={async () => { setPaying(null); await reload(); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** "Marcar pago": data, valor real e observação. Valor vem sugerido pelo consumo do ciclo. */
function MarkPaidDialog({ occ, schedule, today, fxRate, onClose, onSaved }: {
  occ: OccurrenceDTO; schedule: PaymentScheduleDTO; today: string; fxRate: number;
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  // Sugestão: consumo do ciclo pelas APIs (em real) quando a conta é em real;
  // senão o máximo esperado.
  const suggested = schedule.currency === 'BRL' && occ.cycleConsumedBrlCents
    ? occ.cycleConsumedBrlCents
    : schedule.maxCents;
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(centsToInput(suggested));
  const [currency, setCurrency] = useState(schedule.currency);
  const [brl, setBrl] = useState(schedule.currency === 'USD' ? centsToInput(Math.round(suggested * fxRate)) : '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const cents = parseMoneyToCents(amount);
    if (!cents || cents <= 0) { toast.error('Informe o valor pago.'); return; }
    const brlCents = currency === 'BRL' ? cents : parseMoneyToCents(brl);
    if (!brlCents || brlCents <= 0) { toast.error('Informe quanto deu em real.'); return; }
    setSaving(true);
    try {
      await markPaymentPaid({ scheduleId: occ.scheduleId, periodKey: occ.periodKey, paidOn, amountCents: cents, currency, amountBrlCents: brlCents, note });
      toast.success('Pagamento registrado.');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao registrar o pagamento.');
    } finally { setSaving(false); }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-base font-black text-gray-900">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: costServiceColor(schedule.service) }} />
          Pagar {costServiceLabel(schedule.service)}
        </h3>
        <p className="mt-1 text-xs text-gray-400">
          {monthTitle(occ.periodKey)} · vence {windowLabel(occ)} · esperado {rangeText(schedule)}
        </p>
        {occ.cycleConsumedBrlCents !== null && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] text-indigo-700">
            <Zap className="h-3 w-3 shrink-0" /> Consumo pelas APIs de {dm(occ.cycleFrom)} a {dm(occ.cycleTo)}: <b>{formatMoney(occ.cycleConsumedBrlCents)}</b>
          </p>
        )}
        <label className="mt-4 block text-xs font-semibold text-gray-600">Pago em
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
        </label>
        <div className="mt-3 grid grid-cols-[1fr_5rem] gap-2">
          <label className="text-xs font-semibold text-gray-600">Valor pago
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputCls} autoFocus />
          </label>
          <label className="text-xs font-semibold text-gray-600">Moeda
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              <option value="BRL">R$</option><option value="USD">US$</option>
            </select>
          </label>
        </div>
        {currency === 'USD' && (
          <label className="mt-3 block text-xs font-semibold text-gray-600">Quanto deu em real (fatura do cartão)
            <input value={brl} onChange={(e) => setBrl(e.target.value)} inputMode="decimal" className={inputCls} />
          </label>
        )}
        <label className="mt-3 block text-xs font-semibold text-gray-600">Observação
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: pago no cartão do escritório" maxLength={120} className={inputCls} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Confirmar pagamento
          </Button>
        </div>
      </div>
    </div>
  );
}
