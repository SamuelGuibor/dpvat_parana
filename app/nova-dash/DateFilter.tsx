/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { Button } from '@/app/_shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/app/_shared/ui/popover'
import { Calendar } from '@/app/_shared/ui/calendar'
import { CalendarIcon, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subMonths, subYears, addMonths, addYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'

export interface DateRange {
  from: Date
  to: Date
}

type PresetKey =
  | 'hoje'
  | 'ontem'
  | '7dias'
  | '15dias'
  | '30dias'
  | 'mes_atual'
  | 'mes_passado'
  | '3meses'
  | '6meses'
  | 'ano_atual'
  | 'ano_passado'
  | 'tudo'
  | 'custom'

interface Preset {
  key: PresetKey
  label: string
  getRange: () => DateRange
}

const PRESETS: Preset[] = [
  {
    key: 'hoje',
    label: 'Hoje',
    getRange: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  },
  {
    key: 'ontem',
    label: 'Ontem',
    getRange: () => {
      const d = subDays(new Date(), 1)
      return { from: startOfDay(d), to: endOfDay(d) }
    },
  },
  {
    key: '7dias',
    label: '7 dias',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    key: '15dias',
    label: '15 dias',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 14)), to: endOfDay(new Date()) }),
  },
  {
    key: '30dias',
    label: '30 dias',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    key: 'mes_atual',
    label: 'Este mes',
    getRange: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }),
  },
  {
    key: 'mes_passado',
    label: 'Mes passado',
    getRange: () => {
      const d = subMonths(new Date(), 1)
      return { from: startOfMonth(d), to: endOfMonth(d) }
    },
  },
  {
    key: '3meses',
    label: '3 meses',
    getRange: () => ({ from: startOfDay(subMonths(new Date(), 3)), to: endOfDay(new Date()) }),
  },
  {
    key: '6meses',
    label: '6 meses',
    getRange: () => ({ from: startOfDay(subMonths(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    key: 'ano_atual',
    label: 'Este ano',
    getRange: () => ({ from: startOfYear(new Date()), to: endOfDay(new Date()) }),
  },
  {
    key: 'ano_passado',
    label: 'Ano passado',
    getRange: () => {
      const d = subYears(new Date(), 1)
      return { from: startOfYear(d), to: endOfYear(d) }
    },
  },
  {
    key: 'tudo',
    label: 'Todo periodo',
    getRange: () => ({ from: new Date(2020, 0, 1), to: endOfDay(new Date()) }),
  },
]

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<PresetKey>('mes_atual')
  const [calendarRange, setCalendarRange] = useState<DayPickerRange | undefined>({
    from: value.from,
    to: value.to,
  })

  const handlePreset = useCallback((preset: Preset) => {
    const range = preset.getRange()
    setActivePreset(preset.key)
    setCalendarRange({ from: range.from, to: range.to })
    onChange(range)
    if (preset.key !== 'custom') setOpen(false)
  }, [onChange])

  const handleCalendarSelect = useCallback((range: DayPickerRange | undefined) => {
    setCalendarRange(range)
    if (range?.from && range?.to) {
      setActivePreset('custom')
      onChange({ from: startOfDay(range.from), to: endOfDay(range.to) })
    }
  }, [onChange])

  const handleReset = useCallback(() => {
    const preset = PRESETS.find(p => p.key === 'mes_atual')!
    handlePreset(preset)
  }, [handlePreset])

  const label = useMemo(() => {
    if (activePreset !== 'custom') {
      const p = PRESETS.find(pr => pr.key === activePreset)
      return p?.label ?? ''
    }
    return `${format(value.from, 'dd/MM/yy')} - ${format(value.to, 'dd/MM/yy')}`
  }, [activePreset, value])

  // Quick navigation
  const goToPrevMonth = useCallback(() => {
    const d = subMonths(value.from, 1)
    const range = { from: startOfMonth(d), to: endOfMonth(d) }
    setActivePreset('custom')
    setCalendarRange({ from: range.from, to: range.to })
    onChange(range)
  }, [value, onChange])

  const goToNextMonth = useCallback(() => {
    const d = addMonths(value.from, 1)
    const now = new Date()
    const range = {
      from: startOfMonth(d),
      to: d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        ? endOfDay(now)
        : endOfMonth(d),
    }
    setActivePreset('custom')
    setCalendarRange({ from: range.from, to: range.to })
    onChange(range)
  }, [value, onChange])

  return (
    <div className="flex items-center gap-2">
      {/* Quick month navigation */}
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={goToPrevMonth}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 min-w-[200px] justify-start gap-2 font-medium text-sm"
          >
            <CalendarIcon className="h-4 w-4 text-gray-500 dark:text-zinc-400" />
            <span>{label}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Presets sidebar */}
            <div className="border-r p-2 space-y-0.5 min-w-[140px]">
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider px-2 pb-1">
                Periodo
              </p>
              {PRESETS.map(preset => (
                <button
                  key={preset.key}
                  onClick={() => handlePreset(preset)}
                  className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors
                    ${activePreset === preset.key
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300'
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendar */}
            <div className="p-3">
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider px-1 pb-2">
                Personalizado
              </p>
              <Calendar
                mode="range"
                selected={calendarRange}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                locale={ptBR}
                disabled={{ after: new Date() }}
                className="rounded-md"
              />
              {activePreset === 'custom' && calendarRange?.from && calendarRange?.to && (
                <p className="text-xs text-gray-500 dark:text-zinc-400 text-center mt-2">
                  {format(calendarRange.from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  {' '}&rarr;{' '}
                  {format(calendarRange.to, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={goToNextMonth}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Reset */}
      {activePreset !== 'mes_atual' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-xs text-gray-500 dark:text-zinc-400 gap-1"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3" />
          Resetar
        </Button>
      )}
    </div>
  )
}

// Helper to get the default range (current month)
export function getDefaultDateRange(): DateRange {
  return {
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }
}
