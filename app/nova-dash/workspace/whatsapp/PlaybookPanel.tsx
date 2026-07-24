'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Sparkles, CheckCircle2, Trash2, BookOpen, AlertTriangle, Rocket,
  Pencil, Check, X,
} from 'lucide-react';
import {
  getPlaybookState, generatePlaybookDraft, approvePlaybook, discardPlaybookDraft,
  editPlaybookRule, deletePlaybookRule,
  type PlaybookVersion,
} from '@/app/_actions/whatsapp/reviews';

// PLAYBOOK — as regras destiladas que entram no system prompt do bot.
//
// Nada é publicado sozinho: a IA consolida um RASCUNHO, você compara com o que
// está no ar e decide. É a decisão de 23/07/2026 — nos primeiros meses a
// curadoria do cérebro é humana.

function RuleList({
  sections,
  dim,
  playbookId,
  onChanged,
}: {
  sections: PlaybookVersion['sections'];
  dim?: boolean;
  /** Sem id a lista é só leitura (usada no lado "no ar hoje" do diff). */
  playbookId?: string;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!sections?.length) {
    return <p className="px-3 py-6 text-center text-xs text-gray-400">Sem regras.</p>;
  }

  const editable = !!playbookId;

  async function save(sectionName: string, idx: number) {
    if (!playbookId) return;
    setBusy(true);
    try {
      await editPlaybookRule(playbookId, sectionName, idx, text);
      setEditing(null);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function remove(sectionName: string, idx: number, ruleText: string) {
    if (!playbookId) return;
    if (!confirm(`Excluir esta regra?\n\n"${ruleText}"\n\nO bot para de segui-la imediatamente.`)) return;
    setBusy(true);
    try {
      await deletePlaybookRule(playbookId, sectionName, idx);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-3 ${dim ? 'opacity-60' : ''}`}>
      {sections.map((sec) => (
        <div key={sec.name}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
            {sec.name}
          </p>
          <ul className="space-y-1">
            {sec.rules.map((r, i) => {
              const key = `${sec.name}::${i}`;
              const isEditing = editing === key;
              return (
                <li
                  key={i}
                  className="group flex items-start gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-zinc-800/60"
                >
                  <span
                    className="mt-0.5 shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    title={`${r.weight} revisão(ões) sustentam esta regra`}
                  >
                    {r.weight}×
                  </span>

                  {isEditing ? (
                    <div className="min-w-0 flex-1">
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={2}
                        className="w-full resize-y rounded border border-indigo-300 bg-white p-1.5 text-[12px] outline-none dark:border-indigo-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <div className="mt-1 flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(null)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => void save(sec.name, i)}
                          disabled={busy}
                          className="rounded bg-indigo-600 p-1 text-white disabled:opacity-40"
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-gray-700 dark:text-zinc-300">
                        {r.text}
                        {r.states?.length ? (
                          <span className="ml-1.5 font-mono text-[10px] text-gray-400">
                            [{r.states.join(', ')}]
                          </span>
                        ) : null}
                      </span>
                      {editable && (
                        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => { setEditing(key); setText(r.text); }}
                            className="rounded p-1 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-950"
                            title="Editar regra"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => void remove(sec.name, i, r.text)}
                            disabled={busy}
                            className="rounded p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-950"
                            title="Excluir regra"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function PlaybookPanel() {
  const [published, setPublished] = useState<PlaybookVersion | null>(null);
  const [draft, setDraft] = useState<PlaybookVersion | null>(null);
  const [pendingLessons, setPendingLessons] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getPlaybookState();
      setPublished(s.published);
      setDraft(s.draft);
      setPendingLessons(s.pendingLessons);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o playbook.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setWorking(label);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falhou.');
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ---- Barra de ação --------------------------------------------- */}
      <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-zinc-100">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              {published ? `Playbook v${published.version} no ar` : 'Nenhum playbook publicado ainda'}
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-zinc-400">
              {published
                ? `${published.rulesCount} regras · destiladas de ${published.reviewCount} revisões`
                : 'O bot está rodando só com o prompt base, sem regras aprendidas.'}
              {' · '}
              <span className={pendingLessons > 0 ? 'font-semibold text-amber-600' : ''}>
                {pendingLessons} lição(ões) esperando consolidação
              </span>
            </p>
          </div>

          <button
            onClick={() => void run('gerar', generatePlaybookDraft)}
            disabled={!!working || pendingLessons === 0 || !!draft}
            title={
              draft
                ? 'Já existe um rascunho — aprove ou descarte antes de gerar outro.'
                : pendingLessons === 0
                  ? 'Revise mais conversas para gerar lições novas.'
                  : ''
            }
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            {working === 'gerar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar nova versão
          </button>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-600 dark:bg-red-950/40">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* ---- Rascunho aguardando sua aprovação -------------------------- */}
      {draft && (
        <div className="mb-3 rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Rascunho v{draft.version} — aguardando sua aprovação
              </h3>
              <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                {draft.rulesCount} regras · absorve {draft.reviewCount} revisões
              </p>
              {draft.changeNote && (
                <p className="mt-2 rounded-lg bg-white p-2 text-[12px] italic text-gray-700 dark:bg-zinc-900 dark:text-zinc-300">
                  “{draft.changeNote}”
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => void run('descartar', () => discardPlaybookDraft(draft.id))}
                disabled={!!working}
                className="flex items-center gap-1.5 rounded-xl bg-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-200"
              >
                {working === 'descartar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Descartar
              </button>
              <button
                onClick={() => void run('publicar', () => approvePlaybook(draft.id))}
                disabled={!!working}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
              >
                {working === 'publicar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Publicar para o bot
              </button>
            </div>
          </div>

          {/* Diff lado a lado: o que está no ar × o que vai entrar. */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-white p-3 dark:bg-zinc-900">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                No ar hoje {published ? `(v${published.version})` : '(nada)'}
              </p>
              <RuleList sections={published?.sections ?? []} dim />
            </div>
            <div className="rounded-xl bg-white p-3 ring-2 ring-emerald-400 dark:bg-zinc-900">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                Vai entrar (v{draft.version})
              </p>
              <RuleList sections={draft.sections} playbookId={draft.id} onChanged={() => void load()} />
            </div>
          </div>
        </div>
      )}

      {/* ---- Playbook publicado ---------------------------------------- */}
      {published && !draft && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">
              Regras que o bot está usando agora
            </p>
            {published.publishedAt && (
              <span className="text-[10px] text-gray-400">
                publicado em {new Date(published.publishedAt).toLocaleString('pt-BR')}
              </span>
            )}
            <span className="ml-auto text-[10px] italic text-gray-400">
              passe o mouse numa regra para editar ou excluir — vale na hora
            </span>
          </div>
          <RuleList sections={published.sections} playbookId={published.id} onChanged={() => void load()} />
        </div>
      )}

      {!published && !draft && (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-zinc-700">
          <BookOpen className="h-10 w-10 text-gray-300" />
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-zinc-400">
              O cérebro ainda está vazio
            </p>
            <p className="mt-1 max-w-md text-xs text-gray-400">
              Revise conversas na aba ao lado. Cada reprovação vira uma lição, e quando
              houver lições suficientes você gera a primeira versão do playbook aqui.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
