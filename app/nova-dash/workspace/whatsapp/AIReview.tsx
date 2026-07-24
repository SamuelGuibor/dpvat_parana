'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bot, User, StickyNote, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Inbox, RefreshCw, Brain, Clock, MessageSquare, BookOpen, Lightbulb,
  Pencil, Check, X, FileText,
} from 'lucide-react';
import {
  listReviews, getReview, submitReview, updateLesson,
  type ReviewListItem, type ReviewDetail, type ReviewFilter,
} from '@/app/_actions/whatsapp/reviews';
import { PlaybookPanel } from './PlaybookPanel';
import { InstructionsPanel } from './InstructionsPanel';
import {
  REVIEW_ERROR_TAGS, VERDICT_HINTS, CLOSED_REASON_LABELS,
  type ReviewVerdict,
} from '@/app/_shared/lib/whatsapp/review-tags';
import { CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';

// REVISÃO DA IA — a tela onde o cérebro é alimentado.
//
// Regra de UX que guiou o desenho: APROVAR é um clique só; REPROVAR custa
// esforço (comentário obrigatório + tags + resposta correta opcional). Se
// aprovar desse trabalho, a fila nunca andaria e não haveria dado nenhum.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDuration(ms: number | null): string | null {
  if (!ms || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, '0')}`;
}

const ROLE_STYLE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  client: { label: 'Cliente', icon: User, cls: 'bg-white border-gray-200 dark:bg-zinc-800 dark:border-zinc-700' },
  bot: { label: 'IA', icon: Bot, cls: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900' },
  agent: { label: 'Atendente', icon: User, cls: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900' },
  nota: { label: 'Nota interna', icon: StickyNote, cls: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900' },
};

export function AIReview() {
  const [filter, setFilter] = useState<ReviewFilter>('pendente');
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [pending, setPending] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulário de julgamento
  const [verdict, setVerdict] = useState<ReviewVerdict>('aprovado');
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [correctReply, setCorrectReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'fila' | 'playbook' | 'instrucoes'>('fila');

  // "A IA entendeu assim" — lição destilada logo após salvar, editável na hora.
  // Fica sobre a conversa que acabou de ser julgada, não sobre a próxima.
  const [lessonCard, setLessonCard] = useState<
    { reviewId: string; contactName: string; lesson: string; section: string; states: string[] } | null
  >(null);
  const [lessonDraft, setLessonDraft] = useState('');
  const [lessonSaving, setLessonSaving] = useState(false);
  const [lessonSaved, setLessonSaved] = useState(false);

  const loadList = useCallback(async (f: ReviewFilter) => {
    setLoadingList(true);
    try {
      const res = await listReviews(f);
      setItems(res.items);
      setPending(res.pending);
      setSelectedId((cur) => (cur && res.items.some((i) => i.id === cur) ? cur : (res.items[0]?.id ?? null)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a fila.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void loadList(filter); }, [filter, loadList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let alive = true;
    setLoadingDetail(true);
    getReview(selectedId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        // Pré-carrega o formulário com o que já foi julgado (permite corrigir).
        setVerdict((d?.verdict as ReviewVerdict) ?? 'aprovado');
        setComment(d?.comment ?? '');
        setTags(d?.errorTags ?? []);
        setCorrectReply(d?.correctReply ?? '');
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Falha ao abrir a conversa.'))
      .finally(() => alive && setLoadingDetail(false));
    return () => { alive = false; };
  }, [selectedId]);

  function toggleTag(key: string) {
    setTags((cur) => (cur.includes(key) ? cur.filter((t) => t !== key) : [...cur, key]));
  }

  async function save(v: ReviewVerdict) {
    if (!selectedId) return;
    const judgedId = selectedId;
    const judgedName = detail?.contactName || `+${detail?.contactPhone ?? ''}`;
    setSaving(true);
    setError(null);
    try {
      // submitReview já devolve a lição destilada (a extração roda no servidor
      // logo após gravar o julgamento).
      const extracted = await submitReview(judgedId, {
        verdict: v,
        comment,
        errorTags: tags,
        correctReply,
      });

      if (extracted) {
        setLessonCard({
          reviewId: judgedId,
          contactName: judgedName,
          lesson: extracted.lesson,
          section: extracted.section,
          states: extracted.states,
        });
        setLessonDraft(extracted.lesson);
        setLessonSaved(false);
      } else {
        setLessonCard(null);
      }

      // Avança para a próxima da fila sem perder o ritmo.
      const idx = items.findIndex((i) => i.id === judgedId);
      const next = items[idx + 1]?.id ?? null;
      setComment(''); setTags([]); setCorrectReply(''); setVerdict('aprovado');
      await loadList(filter);
      if (filter === 'pendente') setSelectedId(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function saveLessonEdit() {
    if (!lessonCard) return;
    setLessonSaving(true);
    try {
      await updateLesson(lessonCard.reviewId, lessonDraft);
      setLessonSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui corrigir a lição.');
    } finally {
      setLessonSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ---- Abas: fila de revisão / playbook ---------------------------- */}
      <div className="flex shrink-0 items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
        {([
          ['fila', 'Fila de revisão', Brain],
          ['playbook', 'Aprendido', BookOpen],
          ['instrucoes', 'Instruções', FileText],
        ] as [typeof tab, string, React.ElementType][]).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === key
                ? 'bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ---- "A IA entendeu assim" — aparece logo após salvar ------------ */}
      {lessonCard && tab === 'fila' && (
        <div className="shrink-0 rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-2 flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                A IA entendeu assim a sua revisão de {lessonCard.contactName}:
              </p>
              <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                Esta frase é o que vai virar regra no playbook. Se ela te interpretou mal, corrija agora.
              </p>
            </div>
            <button
              onClick={() => setLessonCard(null)}
              className="rounded p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900"
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <textarea
            value={lessonDraft}
            onChange={(e) => { setLessonDraft(e.target.value); setLessonSaved(false); }}
            rows={2}
            className="w-full resize-y rounded-lg border border-amber-200 bg-white p-2 text-[12px] leading-relaxed outline-none focus:border-amber-400 dark:border-amber-800 dark:bg-zinc-900 dark:text-zinc-100"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200">
              {lessonCard.section}
            </span>
            {lessonCard.states.map((s) => (
              <span key={s} className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-amber-800 dark:bg-zinc-900 dark:text-amber-300">
                {s}
              </span>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {lessonSaved && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> corrigida
                </span>
              )}
              <button
                onClick={() => void saveLessonEdit()}
                disabled={lessonSaving || lessonDraft.trim() === lessonCard.lesson.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
              >
                {lessonSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                Corrigir lição
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'playbook' ? (
        <PlaybookPanel />
      ) : tab === 'instrucoes' ? (
        <InstructionsPanel />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      {/* ---- Fila ------------------------------------------------------- */}
      <aside className="flex min-h-0 shrink-0 flex-col rounded-2xl border border-gray-200 bg-white lg:w-80 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-gray-100 p-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-zinc-100">
              <Brain className="h-4 w-4 text-indigo-600" />
              Revisão da IA
            </h2>
            <button
              onClick={() => void loadList(filter)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              title="Atualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex gap-1">
            {([
              ['pendente', `Pendentes${pending ? ` (${pending})` : ''}`],
              ['revisado', 'Revisadas'],
              ['todos', 'Todas'],
            ] as [ReviewFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  filter === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="grid place-items-center py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-2 px-4 py-10 text-center text-gray-400">
              <Inbox className="h-8 w-8" />
              <p className="text-xs">
                {filter === 'pendente'
                  ? 'Nenhuma conversa esperando revisão. As encerradas a partir de agora aparecem aqui.'
                  : 'Nada por aqui ainda.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((it) => {
                const active = it.id === selectedId;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => setSelectedId(it.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40'
                          : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
                          {it.contactName || `+${it.contactPhone}`}
                        </span>
                        {it.status === 'revisado' && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                              it.verdict === 'aprovado'
                                ? 'bg-emerald-100 text-emerald-700'
                                : it.verdict === 'parcial'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {it.verdict?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                        <span>{fmtDate(it.createdAt)}</span>
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {it.messageCount}
                        </span>
                        {!it.botOnly && <span className="text-emerald-600">c/ atendente</span>}
                      </div>
                      <p className="mt-1 truncate text-[10px] text-gray-500 dark:text-zinc-400">
                        {CLOSED_REASON_LABELS[it.closedReason] ?? it.closedReason}
                        {it.closeCategory ? ` · ${CLOSE_CATEGORY_LABELS[it.closeCategory] ?? it.closeCategory}` : ''}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ---- Conversa ---------------------------------------------------- */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        {loadingDetail ? (
          <div className="grid flex-1 place-items-center text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !detail ? (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-gray-400">
            Selecione uma conversa na fila para revisar.
          </div>
        ) : (
          <>
            <header className="border-b border-gray-200 px-4 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">
                {detail.contactName || `+${detail.contactPhone}`}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-zinc-400">
                <span>{CLOSED_REASON_LABELS[detail.closedReason] ?? detail.closedReason}</span>
                {detail.closeCategory && (
                  <span>{CLOSE_CATEGORY_LABELS[detail.closeCategory] ?? detail.closeCategory}</span>
                )}
                {fmtDuration(detail.durationMs) && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(detail.durationMs)}
                  </span>
                )}
                {detail.botState && (
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-800">
                    {detail.botState}
                  </span>
                )}
              </div>
              {detail.botMemory && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-indigo-600">
                    Ficha que a IA montou
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-indigo-50 p-2 text-[11px] text-gray-700 dark:bg-indigo-950/40 dark:text-zinc-300">
                    {detail.botMemory}
                  </p>
                </details>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {detail.messages === null ? (
                <p className="text-center text-xs text-red-500">
                  Não consegui ler o histórico no S3 (o arquivo pode ter sido removido).
                </p>
              ) : (
                detail.messages.map((m, i) => {
                  const style = ROLE_STYLE[m.role] ?? ROLE_STYLE.client;
                  const Icon = style.icon;
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-2.5 ${style.cls} ${m.role === 'client' ? '' : 'ml-6'}`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                        <Icon className="h-3 w-3" />
                        {m.role === 'agent' && m.authorName ? m.authorName : style.label}
                        <span className="ml-auto font-normal normal-case tracking-normal">
                          {fmtDate(m.at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800 dark:text-zinc-200">
                        {m.text}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>

      {/* ---- Julgamento -------------------------------------------------- */}
      {detail && (
        <aside className="flex min-h-0 shrink-0 flex-col overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 lg:w-80 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-bold text-gray-800 dark:text-zinc-100">
            A IA conduziu bem?
          </h3>

          {detail.status === 'revisado' && (
            <p className="mb-3 rounded-lg bg-gray-100 p-2 text-[11px] text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">
              Já revisada por {detail.reviewerName ?? '—'}
              {detail.reviewedAt ? ` em ${fmtDate(detail.reviewedAt)}` : ''}. Salvar de novo substitui o julgamento.
            </p>
          )}

          {/* Aprovar: 1 clique. */}
          <button
            onClick={() => void save('aprovado')}
            disabled={saving}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Aprovar
          </button>
          <p className="mb-4 text-[10px] leading-snug text-gray-400">{VERDICT_HINTS.aprovado}</p>

          <div className="mb-3 border-t border-gray-100 pt-3 dark:border-zinc-800">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Ou aponte o que houve
            </p>

            <div className="mb-2 flex gap-1">
              {(['parcial', 'reprovado'] as ReviewVerdict[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVerdict(v)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    verdict === v
                      ? v === 'parcial'
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {v === 'parcial' ? 'Parcial' : 'Reprovar'}
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap gap-1">
              {REVIEW_ERROR_TAGS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => toggleTag(t.key)}
                  title={t.hint}
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-colors ${
                    tags.includes(t.key)
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-zinc-300">
              O que faltou / por quê <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Ex.: o cliente já tinha dito que era autônomo; a IA não devia ter perguntado de novo e devia ter oferecido..."
              className="mb-3 w-full resize-y rounded-lg border border-gray-200 p-2 text-[12px] outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />

            <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-zinc-300">
              Era assim que devia ter respondido
              <span className="ml-1 font-normal text-gray-400">(opcional, mas vale ouro)</span>
            </label>
            <textarea
              value={correctReply}
              onChange={(e) => setCorrectReply(e.target.value)}
              rows={3}
              placeholder="Escreva a resposta certa. Ela vira exemplo de treino."
              className="mb-3 w-full resize-y rounded-lg border border-gray-200 p-2 text-[12px] outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />

            <button
              onClick={() => void save(verdict === 'aprovado' ? 'reprovado' : verdict)}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-900 disabled:opacity-50 dark:bg-zinc-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : verdict === 'parcial' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Salvar {verdict === 'parcial' ? 'como parcial' : 'reprovação'}
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-[11px] text-red-600 dark:bg-red-950/40">{error}</p>
          )}
        </aside>
      )}
      </div>
      )}
    </div>
  );
}
