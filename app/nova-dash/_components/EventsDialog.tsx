/* eslint-disable no-unused-vars */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CalendarDays, Clock, Loader2, MapPin, Pencil, Plus, Trash2,
  User as UserIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Calendar } from '@/app/_shared/ui/calendar';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Textarea } from '@/app/_shared/ui/textarea';
import {
  listUpcomingEvents, listPastEvents, createEvent, updateEvent, deleteEvent,
  type EventDTO, type EventInput,
} from '@/app/_actions/events/event-actions';
import { BR_TZ, brDateTimeParts, brDayKey } from '@/app/_shared/utils/date-br';

// "Eventos" (27/08/2026): a agenda dos compromissos combinados com clientes —
// quem vem ao escritório e quando, perícia, audiência. Mesmo desenho do
// Eventos do Discord: ícone no cabeçalho, lista do que vem por dia e um botão
// "Criar evento". Tudo em horário de Brasília (o CRM roda em UTC na Vercel).
//
// O formulário usa o Calendar do shadcn (mesma base do DateFilter do Kanban):
// dia no calendário + hora em campo próprio, em vez do datetime-local cru do
// navegador, que muda de cara em cada sistema operacional.

const dayTitleFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BR_TZ, weekday: 'long', day: '2-digit', month: 'long',
});
const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BR_TZ, hour: '2-digit', minute: '2-digit',
});

function dayHeading(iso: string): string {
  const key = brDayKey(iso);
  const today = brDayKey();
  // "Amanhã" = hoje + 1 dia, comparado pela chave do fuso de Brasília.
  const tomorrow = brDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const label = dayTitleFmt.format(new Date(iso));
  if (key === today) return `Hoje · ${label}`;
  if (key === tomorrow) return `Amanhã · ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Horários que a equipe mais marca — um clique em vez de digitar. */
const QUICK_TIMES = ['09:00', '10:00', '11:00', '13:30', '14:00', '15:00', '16:00'];

/** Locais recorrentes. "Escritório" é o padrão: é onde o cliente vem. */
const QUICK_PLACES = ['Escritório', 'Online', 'Hospital', 'INSS', 'Fórum'];

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Date → "YYYY-MM-DD" no horário LOCAL (o do navegador de quem marca). */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date na meia-noite LOCAL — o que o Calendar espera receber. */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Estado do formulário: dia e hora separados (o servidor recebe juntos). */
interface FormState {
  title: string;
  date: Date | undefined;
  startTime: string;
  endTime: string;
  clientName: string;
  location: string;
  description: string;
}

function emptyForm(): FormState {
  // Sugere a próxima hora cheia — sempre lida em Brasília, não no fuso do
  // navegador, pra hora sugerida e hora salva serem a mesma coisa.
  const { day, time } = brDateTimeParts(new Date(Date.now() + 60 * 60 * 1000));
  return {
    title: '',
    date: dateFromKey(day),
    startTime: `${time.slice(0, 2)}:00`,
    endTime: '',
    clientName: '',
    location: 'Escritório',
    description: '',
  };
}

function formFromEvent(e: EventDTO): FormState {
  // Dia e hora sempre em Brasília: é o mesmo fuso em que o card mostra o
  // evento, então abrir pra editar não pode trocar o horário.
  const start = brDateTimeParts(e.startsAt);
  return {
    title: e.title,
    date: dateFromKey(start.day),
    startTime: start.time,
    endTime: e.endsAt ? brDateTimeParts(e.endsAt).time : '',
    clientName: e.clientName ?? '',
    location: e.location ?? '',
    description: e.description ?? '',
  };
}

function toInput(f: FormState): EventInput {
  if (!f.date) throw new Error('Escolha o dia no calendário.');
  if (!f.startTime) throw new Error('Informe o horário de início.');
  const day = dateKey(f.date);
  return {
    title: f.title,
    startsAt: `${day}T${f.startTime}`,
    endsAt: f.endTime ? `${day}T${f.endTime}` : null,
    clientName: f.clientName,
    location: f.location,
    description: f.description,
  };
}

/** Iniciais pro selo de quem criou o evento. */
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa o cabeçalho pra atualizar o contador do ícone. */
  onChanged?: () => void;
}

export function EventsDialog({ open, onOpenChange, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [tab, setTab] = useState<'futuros' | 'anteriores'>('futuros');
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // null = lista; 'new' = criando; id = editando aquele evento.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const reload = useCallback(async (which: 'futuros' | 'anteriores') => {
    setLoading(true);
    try {
      setEvents(which === 'futuros' ? await listUpcomingEvents() : await listPastEvents());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar os eventos.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setTab('futuros');
    reload('futuros');
  }, [open, reload]);

  // Agrupa por dia (fuso de Brasília) preservando a ordem que veio do servidor.
  const byDay = useMemo(() => {
    const map = new Map<string, EventDTO[]>();
    for (const e of events) {
      const key = brDayKey(e.startsAt);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()];
  }, [events]);

  function startCreate() {
    setForm(emptyForm());
    setEditing('new');
  }

  function startEdit(e: EventDTO) {
    setForm(formFromEvent(e));
    setEditing(e.id);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const input = toInput(form);
      if (editing === 'new') {
        await createEvent(input);
        toast.success('Evento criado.');
      } else if (editing) {
        await updateEvent(editing, input);
        toast.success('Evento atualizado.');
      }
      setEditing(null);
      await reload(tab);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar o evento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e: EventDTO) {
    const ok = await confirm({
      title: 'Excluir evento',
      description: `"${e.title}" será removido da agenda da equipe. Não dá pra desfazer.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteEvent(e.id);
      toast.success('Evento excluído.');
      await reload(tab);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir o evento.');
    }
  }

  function changeTab(next: 'futuros' | 'anteriores') {
    setTab(next);
    setEditing(null);
    reload(next);
  }

  const canSave = !!form.title.trim() && !!form.date && !!form.startTime;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              Eventos
              <span className="ml-1 text-xs font-normal text-gray-500 dark:text-zinc-400">
                agenda de quem vem ao escritório
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <div className="flex items-center gap-1">
              {(['futuros', 'anteriores'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeTab(t)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    tab === t
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t === 'futuros' ? 'Próximos' : 'Anteriores'}
                </button>
              ))}
            </div>
            {editing === null && (
              <Button size="sm" onClick={startCreate} className="h-8">
                <Plus className="mr-1.5 h-4 w-4" />
                Criar evento
              </Button>
            )}
          </div>

          {editing !== null ? (
            // ---- Formulário: calendário à esquerda, dados à direita ----------
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                <div className="space-y-2">
                  <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-900">
                    <Calendar
                      mode="single"
                      selected={form.date}
                      onSelect={(d) => setForm((f) => ({ ...f, date: d ?? f.date }))}
                      locale={ptBR}
                      defaultMonth={form.date}
                      className="p-2"
                    />
                  </div>
                  {/* Confirmação em texto do que foi escolhido — o calendário
                      sozinho deixa dúvida de qual dia ficou marcado. */}
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {form.date
                      ? `${format(form.date, "EEEE, dd 'de' MMMM", { locale: ptBR })}${form.startTime ? ` · ${form.startTime}` : ''}`
                      : 'Escolha o dia'}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-title">Nome do evento *</Label>
                    <Input
                      id="ev-title"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Ex.: Assinatura de procuração"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gray-400" /> Horário *
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label="Hora de início"
                        value={form.startTime}
                        onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                        className="w-28"
                      />
                      <span className="text-xs text-gray-400">até</span>
                      <Input
                        type="time"
                        aria-label="Hora de término (opcional)"
                        value={form.endTime}
                        onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                        className="w-28"
                      />
                      <span className="text-[11px] text-gray-400">opcional</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {QUICK_TIMES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, startTime: t }))}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            form.startTime === t
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ev-client" className="flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5 text-gray-400" /> Cliente
                    </Label>
                    <Input
                      id="ev-client"
                      value={form.clientName}
                      onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                      placeholder="Nome de quem vem"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ev-place" className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" /> Local
                    </Label>
                    <Input
                      id="ev-place"
                      value={form.location}
                      onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                      placeholder="Escritório"
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {QUICK_PLACES.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, location: p }))}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            form.location === p
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ev-desc">Observações</Label>
                    <Textarea
                      id="ev-desc"
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="O que precisa estar pronto, quem atende..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving || !canSave}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing === 'new' ? 'Criar evento' : 'Salvar'}
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            // ---- Vazio (mesmo tom do Discord) --------------------------------
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-gray-100 dark:bg-zinc-800">
                <CalendarDays className="h-8 w-8 text-gray-400" />
              </span>
              <p className="mt-2 text-lg font-bold">
                {tab === 'futuros' ? 'Não há eventos futuros.' : 'Nenhum evento anterior.'}
              </p>
              <p className="max-w-sm text-sm text-gray-500 dark:text-zinc-400">
                {tab === 'futuros'
                  ? 'Marque o horário em que um cliente vem ao escritório e a equipe inteira vê aqui.'
                  : 'O que já passou aparece nesta aba.'}
              </p>
            </div>
          ) : (
            // ---- Lista por dia ------------------------------------------------
            <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {byDay.map(([key, items]) => (
                <div key={key} className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    {dayHeading(items[0].startsAt)}
                  </p>
                  {items.map((e) => (
                    <div
                      key={e.id}
                      className="group flex items-stretch gap-3 rounded-xl border p-3 transition-colors hover:border-emerald-400/60 hover:bg-emerald-50/40 dark:hover:bg-zinc-800/60"
                    >
                      {/* Faixa de horário */}
                      <div className="flex w-[68px] shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-600/10 py-2 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <span className="text-base font-bold leading-none">
                          {timeFmt.format(new Date(e.startsAt))}
                        </span>
                        {e.endsAt && (
                          <span className="mt-1 text-[10px] font-semibold opacity-70">
                            até {timeFmt.format(new Date(e.endsAt))}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{e.title}</p>

                        {/* Cliente e local em destaque: são o "quem" e o
                            "onde" que a equipe olha primeiro. */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {e.clientName && (
                            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                              <UserIcon className="h-3 w-3 shrink-0" />
                              <span className="truncate">{e.clientName}</span>
                            </span>
                          )}
                          {e.location && (
                            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              {/* "Escritório" ganha o ícone de prédio: é o
                                  local mais comum e o que importa reconhecer
                                  de relance. */}
                              {/escrit[óo]rio/i.test(e.location)
                                ? <Building2 className="h-3 w-3 shrink-0" />
                                : <MapPin className="h-3 w-3 shrink-0" />}
                              <span className="truncate">{e.location}</span>
                            </span>
                          )}
                        </div>

                        {e.description && (
                          <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-600 dark:text-zinc-300">
                            {e.description}
                          </p>
                        )}

                        {/* Autoria com selo de iniciais, no rodapé do cartão. */}
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-zinc-400">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-600 dark:bg-zinc-700 dark:text-zinc-200">
                            {initials(e.createdByName)}
                          </span>
                          Marcado por <b className="font-semibold text-gray-700 dark:text-zinc-200">{e.createdByName}</b>
                        </div>
                      </div>

                      {e.canManage && (
                        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Editar evento"
                            onClick={() => startEdit(e)}
                          >
                            <Pencil className="h-3.5 w-3.5 text-gray-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Excluir evento"
                            onClick={() => handleDelete(e)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}

/**
 * Ícone do cabeçalho: abre a agenda e mostra quantos eventos começam nas
 * próximas 24h (o "tem gente chegando hoje" sem precisar abrir nada).
 */
export function EventsButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={count > 0 ? `${count} evento(s) nas próximas 24h` : 'Eventos'}
      aria-label="Eventos"
      onClick={onOpen}
      className="relative"
    >
      <CalendarDays className="h-5 w-5 text-gray-500" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Button>
  );
}
