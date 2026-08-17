/* eslint-disable no-unused-vars */ // a regra base confunde nome de parâmetro em tipo de callback
'use client';

// BANCO DE HORAS de um colaborador (visão do gestor, 16/08/2026): saldo
// acumulado do ciclo, saldo do mês, horas compensadas e os lançamentos de
// compensação/abono. O ciclo pode ser reiniciado (novo bankStartKey) — a CLT
// manda compensar o banco em até 6 meses, e o painel alerta a partir dos 5.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PiggyBank, Plus, Trash2, TimerReset, AlertTriangle } from 'lucide-react';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  fmtHm, fmtSigned, fmtDayLabel,
  type BankSummary, type WorkSchedule,
} from '@/app/_shared/lib/ponto';

interface Adjustment {
  id: string;
  date: string;
  minutes: number;
  kind: string;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

interface Props {
  userId: string;
  userName: string;
  bank: BankSummary;
  monthBalance: number;
  schedule: WorkSchedule;
  today: string;
  /** Recarrega o painel da equipe (saldos mudaram). */
  onChanged: () => void;
}

export function BankPanel({ userId, userName, bank, monthBalance, schedule, today, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<'compensation' | 'credit'>('compensation');
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState('0');
  const [mins, setMins] = useState('0');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ponto-adjustments?userId=${userId}`);
      const data = await res.json();
      if (res.ok) setAdjustments(data.adjustments ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (listOpen) loadAdjustments(); }, [listOpen, loadAdjustments]);

  async function saveAdjustment() {
    const total = (Number(hours) || 0) * 60 + (Number(mins) || 0);
    if (total <= 0) { toast.error('Informe a quantidade de horas.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ponto-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, date, minutes: total, kind, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Não foi possível lançar.'); return; }
      toast.success(kind === 'compensation' ? 'Compensação lançada.' : 'Abono lançado.');
      setFormOpen(false);
      setHours('0'); setMins('0'); setNote('');
      onChanged();
      if (listOpen) await loadAdjustments();
    } finally {
      setSaving(false);
    }
  }

  async function removeAdjustment(a: Adjustment) {
    if (!(await confirm({
      title: 'Excluir lançamento',
      description: `${a.kind === 'compensation' ? 'Compensação' : 'Abono'} de ${fmtHm(Math.abs(a.minutes))} em ${fmtDayLabel(a.date)} volta para o saldo.`,
    }))) return;
    const res = await fetch(`/api/ponto-adjustments?id=${a.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Não foi possível excluir.'); return; }
    toast.success('Lançamento excluído.');
    onChanged();
    await loadAdjustments();
  }

  async function resetCycle() {
    if (!(await confirm({
      title: `Reiniciar o ciclo de ${userName.split(' ')[0]}`,
      description: 'O banco de horas volta a contar do zero a partir de hoje. Os registros antigos continuam no histórico, mas saem do saldo acumulado.',
    }))) return;
    const res = await fetch('/api/work-session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, schedule: { ...schedule, bankStartKey: today } }),
    });
    if (!res.ok) { toast.error('Não foi possível reiniciar o ciclo.'); return; }
    toast.success('Ciclo do banco de horas reiniciado.');
    onChanged();
  }

  const field = 'w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-400';

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-400">
          <PiggyBank className="h-4 w-4" /> Banco de horas
          {bank.startKey && (
            <span className="normal-case tracking-normal">· ciclo desde {fmtDayLabel(bank.startKey)} ({bank.monthsOld} {bank.monthsOld === 1 ? 'mês' : 'meses'})</span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
          >
            <Plus className="h-3.5 w-3.5" /> Lançar compensação/abono
          </button>
          <button
            onClick={resetCycle}
            title="Zera o saldo acumulado e começa um novo ciclo a partir de hoje"
            className="flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
          >
            <TimerReset className="h-3.5 w-3.5" /> Reiniciar ciclo
          </button>
        </div>
      </div>

      {bank.alert && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Ciclo do banco de horas com {bank.monthsOld} meses — a CLT exige compensar em até 6 meses.
            Programe as compensações ou reinicie o ciclo.
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Saldo acumulado',
            value: fmtSigned(bank.accumulated),
            tone: bank.accumulated > 0 ? 'text-emerald-600' : bank.accumulated < 0 ? 'text-red-500' : 'text-gray-700',
            hint: bank.accumulated > 0 ? 'horas extras a compensar' : bank.accumulated < 0 ? 'horas devidas' : 'em dia',
          },
          {
            label: 'Saldo do mês',
            value: fmtSigned(monthBalance),
            tone: monthBalance > 0 ? 'text-emerald-600' : monthBalance < 0 ? 'text-red-500' : 'text-gray-700',
            hint: 'trabalhado − meta nos dias registrados',
          },
          { label: 'Horas compensadas', value: fmtHm(bank.compensated), tone: 'text-blue-600', hint: 'folgas já abatidas no ciclo' },
          { label: 'Meta diária', value: fmtHm(schedule.dailyMinutes), tone: 'text-gray-700', hint: schedule.startTime && schedule.endTime ? `${schedule.startTime}–${schedule.endTime} · ${fmtHm(schedule.breakMinutes ?? 0)} de intervalo` : 'defina a escala no botão de jornada' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-gray-50/80 p-3">
            <p className="text-[11px] text-gray-400">{c.label}</p>
            <p className={`font-mono text-lg font-semibold tabular-nums ${c.tone}`}>{c.value}</p>
            <p className="text-[10px] text-gray-300">{c.hint}</p>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="mt-3 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-0.5 rounded-full bg-white p-0.5 ring-1 ring-gray-100">
              {([['compensation', 'Compensação (abate)'], ['credit', 'Abono (credita)']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    kind === k ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={field} />
              <span className="text-sm text-gray-500">h</span>
              <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className={field} />
              <span className="text-sm text-gray-500">min</span>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={note}
              maxLength={300}
              placeholder={kind === 'compensation' ? 'Ex.: folga na sexta para compensar horas extras' : 'Ex.: abono de atestado médico'}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <button
              onClick={saveAdjustment}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lançar'}
            </button>
            <button onClick={() => setFormOpen(false)} className="text-sm text-gray-400">Cancelar</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setListOpen((v) => !v)}
        className="mt-3 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        {listOpen ? 'Esconder lançamentos' : 'Ver lançamentos do banco'}
      </button>

      {listOpen && (
        <div className="mt-2 space-y-1">
          {loading ? (
            <p className="py-2 text-center text-xs text-gray-300">Carregando…</p>
          ) : adjustments.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-300">Nenhum lançamento ainda.</p>
          ) : (
            adjustments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50">
                <span className="w-12 font-mono text-gray-500 tabular-nums">{fmtDayLabel(a.date)}</span>
                <span className={`font-mono font-semibold tabular-nums ${a.minutes < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {fmtSigned(a.minutes)}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {a.kind === 'compensation' ? 'compensação' : 'abono'}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-400">{a.note ?? ''}</span>
                <span className="hidden text-[10px] text-gray-300 sm:block">por {a.createdByName}</span>
                <button
                  onClick={() => removeAdjustment(a)}
                  title="Excluir lançamento"
                  className="rounded-md p-1 text-gray-300 hover:bg-white hover:text-red-500 hover:shadow-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
