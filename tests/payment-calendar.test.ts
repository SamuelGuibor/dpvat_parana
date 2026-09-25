import { describe, expect, it } from 'vitest';
import {
  occurrencesForMonth, windowFor, occursIn, clampDay, addMonthsKey, type ScheduleLite,
} from '@/app/_shared/utils/payment-calendar';

const base: ScheduleLite = {
  id: 's1', dayFrom: 10, dayTo: 12, recurrence: 'MONTHLY', month: null, startMonth: '2026-01', active: true,
};

describe('payment-calendar', () => {
  it('limita o dia ao fim do mês (fevereiro)', () => {
    expect(clampDay('2026-02', 31)).toBe('2026-02-28');
    expect(clampDay('2028-02', 30)).toBe('2028-02-29');
    expect(windowFor({ dayFrom: 29, dayTo: 31 }, '2026-04')).toEqual({ from: '2026-04-29', to: '2026-04-30' });
  });

  it('janela que vira o mês fecha no mês seguinte', () => {
    expect(windowFor({ dayFrom: 28, dayTo: 3 }, '2026-12')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    expect(addMonthsKey('2026-12', 1)).toBe('2027-01');
  });

  it('anual só cai no mês dela; única só no mês de início', () => {
    const anual = { ...base, recurrence: 'YEARLY', month: 10 };
    expect(occursIn(anual, '2026-10')).toBe(true);
    expect(occursIn(anual, '2026-11')).toBe(false);
    const unica = { ...base, recurrence: 'ONCE', startMonth: '2026-10' };
    expect(occursIn(unica, '2026-10')).toBe(true);
    expect(occursIn(unica, '2027-10')).toBe(false);
    expect(occursIn({ ...base, startMonth: '2026-11' }, '2026-10')).toBe(false);
    expect(occursIn({ ...base, active: false }, '2026-10')).toBe(false);
  });

  it('status: pago > atrasado > aberto > futuro', () => {
    const st = (today: string, paid = false) =>
      occurrencesForMonth([base], '2026-10', today, new Set(paid ? ['s1|2026-10'] : []))[0].status;
    expect(st('2026-10-05')).toBe('futuro');
    expect(st('2026-10-10')).toBe('aberto');
    expect(st('2026-10-12')).toBe('aberto');
    expect(st('2026-10-13')).toBe('atrasado');
    expect(st('2026-10-13', true)).toBe('pago');
  });

  it('ciclo de consumo é o mês que termina no vencimento', () => {
    const [o] = occurrencesForMonth([base], '2026-10', '2026-10-01', new Set());
    expect(o.cycleFrom).toBe('2026-09-13');
    expect(o.cycleTo).toBe('2026-10-12');
    expect(o.daysToDue).toBe(11);
  });
});
