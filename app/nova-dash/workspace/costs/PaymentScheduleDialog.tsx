'use client';

import { useState } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { savePaymentSchedule, type PaymentScheduleDTO } from '@/app/_actions/costs/schedule';
import {
  COST_SERVICES, MONTH_NAMES, PAYMENT_RECURRENCES, costServiceColor, parseMoneyToCents,
} from '@/app/_shared/lib/costs';

// Cadastro/edição de uma conta do calendário de pagamentos: serviço, janela de
// dias (pode virar o mês: "28 a 3"), faixa de valor, moeda e recorrência.

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function PaymentScheduleDialog({ initial, defaultDay, defaultMonth, onClose, onSaved }: {
  initial: PaymentScheduleDTO | null;
  defaultDay: number | null;
  defaultMonth: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [service, setService] = useState(initial?.service ?? 'vercel');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dayFrom, setDayFrom] = useState(String(initial?.dayFrom ?? defaultDay ?? 10));
  const [dayTo, setDayTo] = useState(String(initial?.dayTo ?? defaultDay ?? 10));
  const [min, setMin] = useState(initial ? centsToInput(initial.minCents) : '');
  const [max, setMax] = useState(initial ? centsToInput(initial.maxCents) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'BRL');
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? 'MONTHLY');
  const [month, setMonth] = useState(String(initial?.month ?? Number(defaultMonth.slice(5, 7))));
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? defaultMonth);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const maxCents = parseMoneyToCents(max);
    // Mínimo em branco = valor fixo (mín = máx).
    const minCents = min.trim() ? parseMoneyToCents(min) : maxCents;
    if (!maxCents || maxCents <= 0 || minCents === null) { toast.error('Informe o valor (ou a faixa) esperado.'); return; }
    setSaving(true);
    try {
      await savePaymentSchedule({
        service, description, dayFrom: Number(dayFrom), dayTo: Number(dayTo),
        minCents, maxCents, currency, recurrence, month: Number(month), startMonth, notes,
      }, initial?.id);
      toast.success(initial ? 'Conta atualizada.' : 'Conta adicionada ao calendário.');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a conta.');
    } finally { setSaving(false); }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm';
  const wraps = Number(dayTo) < Number(dayFrom);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-base font-black text-gray-900">
          <CalendarPlus className="h-4 w-4 text-indigo-600" /> {initial ? 'Editar conta' : 'Nova conta no calendário'}
        </h3>

        <p className="mt-4 text-xs font-semibold text-gray-600">Plataforma</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {COST_SERVICES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setService(s.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${service === s.key ? 'border-transparent text-white shadow' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              style={service === s.key ? { backgroundColor: costServiceColor(s.key) } : undefined}
            >
              {service !== s.key && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />}
              {s.label}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-xs font-semibold text-gray-600">Descrição
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder="ex.: plano Pro, créditos de API" className={inputCls} />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-gray-600">Repete
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputCls}>
              {PAYMENT_RECURRENCES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          {recurrence === 'YEARLY' ? (
            <label className="text-xs font-semibold text-gray-600">Mês da cobrança
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} capitalize`}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
          ) : (
            <label className="text-xs font-semibold text-gray-600">{recurrence === 'ONCE' ? 'Mês' : 'A partir de'}
              <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={inputCls} />
            </label>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-gray-600">Do dia
            <input type="number" min={1} max={31} value={dayFrom} onChange={(e) => { setDayFrom(e.target.value); if (Number(dayTo) === Number(dayFrom)) setDayTo(e.target.value); }} className={inputCls} />
          </label>
          <label className="text-xs font-semibold text-gray-600">Até o dia
            <input type="number" min={1} max={31} value={dayTo} onChange={(e) => setDayTo(e.target.value)} className={inputCls} />
          </label>
        </div>
        {wraps && <p className="mt-1 text-[11px] text-amber-600">A janela vira o mês: do dia {dayFrom} até o dia {dayTo} do mês seguinte.</p>}

        <div className="mt-3 grid grid-cols-[1fr_1fr_5rem] gap-2">
          <label className="text-xs font-semibold text-gray-600">Valor mín.
            <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="opcional" className={inputCls} />
          </label>
          <label className="text-xs font-semibold text-gray-600">Valor máx.
            <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="ex.: 120,00" className={inputCls} />
          </label>
          <label className="text-xs font-semibold text-gray-600">Moeda
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              <option value="BRL">R$</option><option value="USD">US$</option>
            </select>
          </label>
        </div>

        <label className="mt-3 block text-xs font-semibold text-gray-600">Observação
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="ex.: cartão final 1234, recarga automática desligada" className={inputCls} />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
