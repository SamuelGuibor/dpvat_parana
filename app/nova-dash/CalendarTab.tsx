/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/_shared/ui/card'
import { Button } from '@/app/_shared/ui/button'
import { Badge } from '@/app/_shared/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/_shared/ui/dialog'
import { Input } from '@/app/_shared/ui/input'
import { Textarea } from '@/app/_shared/ui/textarea'
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from 'lucide-react'

type EventType = 'audiencia' | 'reuniao' | 'prazo' | 'contato' | 'tarefa' | 'outro'

type CalendarEvent = {
  id: string
  date: string // YYYY-MM-DD
  title: string
  description: string
  type: EventType
}

const EVENT_TYPES: { value: EventType; label: string; color: string; bg: string }[] = [
  { value: 'audiencia', label: 'Audiência',         color: 'text-purple-700', bg: 'bg-purple-100 border-purple-300' },
  { value: 'reuniao',   label: 'Reunião',           color: 'text-blue-700',   bg: 'bg-blue-100 border-blue-300' },
  { value: 'prazo',     label: 'Prazo / Vencimento', color: 'text-red-700',    bg: 'bg-red-100 border-red-300' },
  { value: 'contato',   label: 'Contato c/ Cliente', color: 'text-green-700',  bg: 'bg-green-100 border-green-300' },
  { value: 'tarefa',    label: 'Tarefa',            color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300' },
  { value: 'outro',     label: 'Outro',             color: 'text-gray-700 dark:text-zinc-300',   bg: 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700' },
]

const STORAGE_KEY = 'dpvat_calendar_events'

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function toKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getTypeStyle(type: EventType) {
  return EVENT_TYPES.find(t => t.value === type) ?? EVENT_TYPES[5]
}

export const CalendarTab: React.FC = () => {
  const today = new Date()
  const [currentYear, setCurrentYear]   = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [events, setEvents]             = useState<CalendarEvent[]>([])

  // modal de adição
  const [addOpen, setAddOpen]           = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [form, setForm]                 = useState({ title: '', description: '', type: 'contato' as EventType })

  // modal de detalhes do dia
  const [dayOpen, setDayOpen]           = useState(false)
  const [dayEvents, setDayEvents]       = useState<CalendarEvent[]>([])
  const [dayLabel, setDayLabel]         = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setEvents(JSON.parse(raw))
    } catch { /* noop */ }
  }, [])

  function save(next: CalendarEvent[]) {
    setEvents(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  function openAdd(dateKey: string) {
    setSelectedDate(dateKey)
    setForm({ title: '', description: '', type: 'contato' })
    setAddOpen(true)
  }

  function handleAdd() {
    if (!form.title.trim()) return
    const ev: CalendarEvent = {
      id: crypto.randomUUID(),
      date: selectedDate,
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
    }
    save([...events, ev])
    setAddOpen(false)
  }

  function handleDelete(id: string) {
    const next = events.filter(e => e.id !== id)
    save(next)
    setDayEvents(prev => prev.filter(e => e.id !== id))
  }

  function openDay(dateKey: string, label: string) {
    const evs = events.filter(e => e.date === dateKey)
    if (evs.length === 0) { openAdd(dateKey); return }
    setDayEvents(evs)
    setDayLabel(label)
    setSelectedDate(dateKey)
    setDayOpen(true)
  }

  // --- build calendar grid ---
  const firstDay  = new Date(currentYear, currentMonth, 1).getDay()
  const daysCount = new Date(currentYear, currentMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysCount }, (_, i) => i + 1),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="w-5 h-5" />
              Calendário
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold w-36 text-center">
                {MONTHS_PT[currentMonth]} {currentYear}
              </span>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-2 sm:p-4">
          {/* legenda */}
          <div className="flex flex-wrap gap-2 mb-3">
            {EVENT_TYPES.map(t => (
              <span key={t.value} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${t.bg} ${t.color}`}>
                {t.label}
              </span>
            ))}
          </div>

          {/* grid header */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-500 dark:text-zinc-400 py-1">{d}</div>
            ))}
          </div>

          {/* grid cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} />

              const dateKey   = toKey(currentYear, currentMonth, day)
              const isToday   = dateKey === todayKey
              const dayEvs    = events.filter(e => e.date === dateKey)
              const hasEvents = dayEvs.length > 0

              return (
                <button
                  key={idx}
                  onClick={() => openDay(dateKey, `${day} de ${MONTHS_PT[currentMonth]}`)}
                  className={[
                    'relative flex flex-col items-start p-1 rounded-lg border text-left transition-colors min-h-[64px]',
                    isToday
                      ? 'border-blue-500 bg-blue-50'
                      : hasEvents
                      ? 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800'
                      : 'border-transparent hover:border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800',
                  ].join(' ')}
                >
                  <span className={[
                    'text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full',
                    isToday ? 'bg-blue-500 text-white' : 'text-gray-700 dark:text-zinc-300',
                  ].join(' ')}>
                    {day}
                  </span>

                  <div className="w-full space-y-0.5">
                    {dayEvs.slice(0, 2).map(ev => {
                      const s = getTypeStyle(ev.type)
                      return (
                        <div
                          key={ev.id}
                          className={`text-[10px] leading-tight px-1 rounded border truncate font-medium ${s.bg} ${s.color}`}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      )
                    })}
                    {dayEvs.length > 2 && (
                      <div className="text-[10px] text-gray-400 dark:text-zinc-500 pl-1">+{dayEvs.length - 2} mais</div>
                    )}
                    {dayEvs.length === 0 && (
                      <div className="flex items-center justify-center w-full mt-1 opacity-0 group-hover:opacity-100">
                        <Plus className="w-3 h-3 text-gray-300 dark:text-zinc-600" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ----- Modal: adicionar evento ----- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo evento — {selectedDate}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as EventType }))}
                className="w-full border border-gray-300 dark:border-zinc-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Título <span className="text-red-500">*</span></label>
              <Input
                placeholder="Ex: Reunião com cliente João"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Observação <span className="text-gray-400 dark:text-zinc-500 font-normal">(opcional)</span></label>
              <Textarea
                placeholder="Detalhes adicionais..."
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!form.title.trim()}>Salvar evento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Modal: detalhes do dia ----- */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{dayLabel}</span>
              <Button
                size="sm"
                onClick={() => { setDayOpen(false); openAdd(selectedDate) }}
                className="ml-2 gap-1"
              >
                <Plus className="w-3 h-3" /> Novo
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {dayEvents.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">Nenhum evento neste dia.</p>
            )}
            {dayEvents.map(ev => {
              const s = getTypeStyle(ev.type)
              return (
                <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border ${s.bg}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>
                        {EVENT_TYPES.find(t => t.value === ev.type)?.label}
                      </span>
                    </div>
                    <p className={`text-sm font-medium mt-1 ${s.color}`}>{ev.title}</p>
                    {ev.description && (
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{ev.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(ev.id)}
                    className="text-gray-400 dark:text-zinc-500 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                    title="Remover evento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
