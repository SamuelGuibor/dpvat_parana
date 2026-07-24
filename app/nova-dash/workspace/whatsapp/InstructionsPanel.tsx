'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Plus, Trash2, Rocket, Eye, EyeOff, ChevronUp, ChevronDown,
  Pencil, X, Check, FileText, AlertTriangle, Undo2, Code2,
} from 'lucide-react';
import {
  getInstructionsState, upsertSection, deleteSection, toggleSection,
  moveSection, updateIntro, publishInstructionsDraft, discardInstructionsDraft,
  previewInstructions,
  type InstructionsVersion,
} from '@/app/_actions/whatsapp/instructions';

// INSTRUÇÕES — o "cérebro escrito" do bot, o que antes era um bloco de 21 mil
// caracteres escondido dentro do bot.js.
//
// Regra de segurança da tela: você edita sempre um RASCUNHO. O que está no ar
// só muda quando você clica em publicar. Assim nenhuma edição pela metade
// chega no cliente.

/** ~3,5 caracteres por token em pt-BR — mesma estimativa usada no microserviço. */
const CHARS_PER_TOKEN = 3.5;
/** Acima disso o modelo começa a diluir instrução (ver conversa sobre limites). */
const TOKEN_WARN = 20_000;

function tokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

export function InstructionsPanel() {
  const [published, setPublished] = useState<InstructionsVersion | null>(null);
  const [draft, setDraft] = useState<InstructionsVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editingIntro, setEditingIntro] = useState(false);
  const [introDraft, setIntroDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const [preview, setPreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [changeNote, setChangeNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getInstructionsState();
      setPublished(s.published);
      setDraft(s.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar as instruções.');
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

  // O rascunho é a verdade quando existe; senão mostra o publicado.
  const view = draft ?? published;
  const isDraft = !!draft;

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="grid flex-1 place-items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-zinc-700">
        <FileText className="h-10 w-10 text-gray-300" />
        <p className="max-w-md text-xs text-gray-400">
          Nenhuma versão de instruções no banco. O bot está rodando com o texto embutido
          no código.
        </p>
      </div>
    );
  }

  const chars = view.charCount;
  const tk = tokens(chars);
  const heavy = tk > TOKEN_WARN;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ---- Cabeçalho -------------------------------------------------- */}
      <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-zinc-100">
              <FileText className="h-4 w-4 text-indigo-600" />
              Instruções do bot
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isDraft
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {isDraft ? `RASCUNHO v${view.version}` : `NO AR v${view.version}`}
              </span>
            </h2>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">
              {view.sections.length} seções ·{' '}
              <span className={heavy ? 'font-bold text-red-600' : ''}>
                ~{tk.toLocaleString('pt-BR')} tokens
              </span>{' '}
              ({chars.toLocaleString('pt-BR')} caracteres)
              {heavy && ' — acima de 20 mil o modelo começa a ignorar regras'}
            </p>
            {isDraft && published && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                O bot ainda usa a v{published.version}. Suas alterações só valem depois de publicar.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={async () => {
                const p = await previewInstructions();
                setPreview(p.text);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <Code2 className="h-3.5 w-3.5" />
              Ver texto final
            </button>
            {isDraft && (
              <>
                <button
                  onClick={() => void run('descartar', discardInstructionsDraft)}
                  disabled={!!working}
                  className="flex items-center gap-1.5 rounded-xl bg-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-200"
                >
                  {working === 'descartar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Descartar mudanças
                </button>
                <button
                  onClick={() => setPublishing(true)}
                  disabled={!!working}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Publicar para o bot
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-600 dark:bg-red-950/40">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* ---- Identidade (intro) ----------------------------------------- */}
      <div className="mb-3 rounded-2xl border-l-4 border-indigo-500 bg-indigo-50/50 p-4 dark:bg-indigo-950/20">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Identidade e tom — abre o prompt
          </h3>
          {!editingIntro && (
            <button
              onClick={() => { setIntroDraft(view.intro); setEditingIntro(true); }}
              className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {editingIntro ? (
          <>
            <textarea
              value={introDraft}
              onChange={(e) => setIntroDraft(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-lg border border-indigo-200 bg-white p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-indigo-400 dark:border-indigo-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setEditingIntro(false)}
                className="rounded-lg bg-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-zinc-700 dark:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => void run('intro', async () => {
                  await updateIntro(introDraft);
                  setEditingIntro(false);
                })}
                disabled={!!working}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
              >
                {working === 'intro' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Salvar
              </button>
            </div>
          </>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-gray-700 dark:text-zinc-300">
            {view.intro}
          </pre>
        )}
      </div>

      {/* ---- Seções ------------------------------------------------------ */}
      <div className="space-y-2">
        {view.sections.map((s, i) => {
          const isEditing = editing === s.id;
          return (
            <div
              key={s.id}
              className={`rounded-2xl border bg-white transition-opacity dark:bg-zinc-900 ${
                s.enabled
                  ? 'border-gray-200 dark:border-zinc-800'
                  : 'border-dashed border-gray-300 opacity-50 dark:border-zinc-700'
              }`}
            >
              <div className="flex items-start gap-2 border-b border-gray-100 p-3 dark:border-zinc-800">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-zinc-800">
                  {i + 1}
                </span>
                <h3 className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-gray-800 dark:text-zinc-100">
                  {s.title}
                  <span className="ml-2 font-normal text-[10px] text-gray-400">
                    {s.content.length.toLocaleString('pt-BR')} chars
                  </span>
                </h3>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => void run('mover', () => moveSection(s.id, 'up'))}
                    disabled={i === 0 || !!working}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-20 dark:hover:bg-zinc-800"
                    title="Subir"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void run('mover', () => moveSection(s.id, 'down'))}
                    disabled={i === view.sections.length - 1 || !!working}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-20 dark:hover:bg-zinc-800"
                    title="Descer"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void run('toggle', () => toggleSection(s.id, !s.enabled))}
                    disabled={!!working}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    title={s.enabled ? 'Desligar (sai do prompt, texto fica salvo)' : 'Religar'}
                  >
                    {s.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(s.id);
                      setEditTitle(s.title);
                      setEditContent(s.content);
                    }}
                    className="rounded p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir a seção "${s.title}"?\n\nEla sai do prompt do bot quando você publicar.`)) {
                        void run('excluir', () => deleteSection(s.id));
                      }
                    }}
                    disabled={!!working}
                    className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="p-3">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mb-2 w-full rounded-lg border border-gray-200 p-2 text-[12px] font-bold outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={14}
                    className="w-full resize-y rounded-lg border border-gray-200 p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-lg bg-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-zinc-700 dark:text-zinc-200"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => void run('editar', async () => {
                        await upsertSection({ id: s.id, title: editTitle, content: editContent });
                        setEditing(null);
                      })}
                      disabled={!!working}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      {working === 'editar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Salvar seção
                    </button>
                  </div>
                </div>
              ) : (
                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap p-3 font-sans text-[12px] leading-relaxed text-gray-600 dark:text-zinc-400">
                  {s.content}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Nova seção -------------------------------------------------- */}
      {creating ? (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-3 dark:border-indigo-800">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Título da seção (ex.: COMO FALAR DE PRAZOS)"
            className="mb-2 w-full rounded-lg border border-indigo-200 bg-white p-2 text-[12px] font-bold outline-none dark:border-indigo-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={8}
            placeholder="As instruções desta seção..."
            className="w-full resize-y rounded-lg border border-indigo-200 bg-white p-3 font-mono text-[12px] outline-none dark:border-indigo-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={() => void run('criar', async () => {
                await upsertSection({ title: editTitle, content: editContent });
                setCreating(false);
                setEditTitle(''); setEditContent('');
              })}
              disabled={!!working || !editTitle.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
            >
              {working === 'criar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Criar seção
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setCreating(true); setEditTitle(''); setEditContent(''); }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 py-3 text-xs font-bold text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400"
        >
          <Plus className="h-4 w-4" />
          Nova seção
        </button>
      )}

      {/* ---- Modal: texto final ----------------------------------------- */}
      {preview !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">
                  Texto exato enviado ao modelo
                </h3>
                <p className="text-[11px] text-gray-400">
                  {preview.length.toLocaleString('pt-BR')} caracteres · ~{tokens(preview.length).toLocaleString('pt-BR')} tokens
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-gray-700 dark:text-zinc-300">
              {preview}
            </pre>
          </div>
        </div>
      )}

      {/* ---- Modal: publicar --------------------------------------------- */}
      {publishing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-zinc-900">
            <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">
              Publicar v{view.version} para o bot
            </h3>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">
              O bot passa a usar estas instruções em até 5 minutos (tempo do cache).
              A versão anterior fica guardada.
            </p>
            <textarea
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              rows={3}
              placeholder="O que mudou nesta versão? (ajuda a voltar atrás depois)"
              className="mt-3 w-full resize-y rounded-lg border border-gray-200 p-2 text-[12px] outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setPublishing(false)}
                className="rounded-lg bg-gray-200 px-3 py-2 text-[11px] font-bold text-gray-700 dark:bg-zinc-700 dark:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => void run('publicar', async () => {
                  await publishInstructionsDraft(changeNote);
                  setPublishing(false);
                  setChangeNote('');
                })}
                disabled={!!working}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-bold text-white disabled:opacity-40"
              >
                {working === 'publicar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Publicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
