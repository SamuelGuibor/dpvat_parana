/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Save, Upload, Trash2, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Textarea } from '@/app/_shared/ui/textarea';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { jsonFetcher, describeFetchError } from '@/app/_shared/utils/fetch-json';
import {
  activateWhatsAppFormVersion, discardWhatsAppFormDraft, publishWhatsAppFormDraft,
  saveWhatsAppFormDefaults, saveWhatsAppFormDraft,
} from '@/app/_actions/whatsapp/forms';
import {
  FORM_MESSAGE_LIMITS, FORM_STATUS_LABEL, applyEditableFields, entryScreen, extractEditableFields, moveScreen, readFlowJson,
  validateFormMessage,
  type FlowJson, type FlowValidationError, type FormDetailResponse, type FormFamilyDTO,
} from '@/app/_shared/utils/wa-forms';
import { WaFormPreview } from './WaFormPreview';

// Editor do formulário (permissão manage_wa_forms; o guard é o das actions).
// Formulário publicado não muda na Meta: "Salvar rascunho" cria (na 1ª vez)
// um Flow novo clonado da versão de base e sobe o JSON editado; "Publicar" faz
// do rascunho a versão ativa. Textos/rótulos/obrigatório/botões e a ordem das
// telas pelo modo Textos; o resto (campo novo, navegação) pelo JSON avançado,
// que a Meta valida — os erros dela aparecem na tela.

type Tab = 'textos' | 'json' | 'mensagem' | 'versoes';
const FORMS_URL = '/api/whatsapp/forms';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

interface Props {
  family: FormFamilyDTO;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}

export function WhatsAppFormEditor({ family, onBack, onChanged }: Props) {
  // Edita o rascunho, se já existe; senão parte da versão ativa.
  const base = family.draft ?? family.active ?? family.versions[0];
  const [detail, setDetail] = useState<FormDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [work, setWork] = useState<FlowJson | null>(null);
  const [edits, setEdits] = useState<Record<string, string | boolean>>({});
  const [tab, setTab] = useState<Tab>('textos');
  const [rawJson, setRawJson] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [validation, setValidation] = useState<FlowValidationError[] | null>(null);
  const [msg, setMsg] = useState({ bodyText: '', cta: '', headerText: '', footerText: '' });
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    jsonFetcher<FormDetailResponse>(`${FORMS_URL}?versionId=${encodeURIComponent(base.id)}`)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setWork(d.flowJson);
        setEdits({});
        setRawJson(d.flowJson ? JSON.stringify(d.flowJson, null, 2) : '');
        setRawError(null);
        setMsg({ bodyText: d.version.bodyText ?? '', cta: d.version.cta ?? '', headerText: d.version.headerText ?? '', footerText: d.version.footerText ?? '' });
      })
      .catch((err) => { if (alive) setLoadError(describeFetchError(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [base.id, base.updatedAt]);

  const current = useMemo(() => (work ? applyEditableFields(work, edits) : null), [work, edits]);
  const fields = useMemo(() => (work ? extractEditableFields(work) : []), [work]);

  /** JSON final: o do modo avançado (se é a aba aberta) ou o dos textos. */
  function finalJson(): FlowJson | null {
    if (tab === 'json') {
      const parsed = readFlowJson(rawJson);
      setRawError(parsed ? null : 'JSON inválido: precisa ser um objeto com a lista "screens".');
      return parsed;
    }
    return current;
  }

  function switchTab(next: Tab) {
    if (tab === 'json' && next !== 'json') {
      const parsed = readFlowJson(rawJson);
      if (!parsed) { setRawError('JSON inválido: corrija antes de sair do modo avançado.'); return; }
      setWork(parsed);
      setEdits({});
      setRawError(null);
    }
    if (next === 'json' && tab !== 'json' && current) setRawJson(JSON.stringify(current, null, 2));
    setTab(next);
  }

  function move(i: number, to: number) {
    if (!current) return;
    setWork(moveScreen(current, i, to));
    setEdits({});
  }

  const dirty = (() => {
    if (!detail?.flowJson) return false;
    const now = tab === 'json' ? readFlowJson(rawJson) : current;
    return !!now && JSON.stringify(now) !== JSON.stringify(detail.flowJson);
  })();

  async function saveDraft() {
    const json = finalJson();
    if (!json) return;
    setBusy('draft');
    try {
      const r = await saveWhatsAppFormDraft({ baseVersionId: base.id, flowJson: JSON.stringify(json) });
      if (!r.ok) { toast.error(r.error); return; }
      setValidation(r.validationErrors);
      toast[r.validationErrors.length ? 'warning' : 'success'](r.validationErrors.length
        ? `Rascunho v${r.version.version} salvo, mas a Meta apontou ${r.validationErrors.length} erro(s): corrija antes de publicar.`
        : `Rascunho v${r.version.version} salvo. Confira a prévia e publique.`);
      await onChanged();
    } catch {
      toast.error('Falha ao salvar o rascunho. Atualize a página (F5) e tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!family.draft) return;
    const ok = await confirm({
      title: `Publicar a versão v${family.draft.version}?`,
      description: 'Ela passa a ser a versão enviada aos clientes. A versão atual fica no histórico e pode voltar a ser a ativa. Formulário publicado não pode mais ser alterado na Meta.',
      tone: 'warning',
      confirmLabel: 'Publicar',
    });
    if (!ok) return;
    setBusy('publish');
    try {
      const r = await publishWhatsAppFormDraft(family.draft.id);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`Versão v${r.version.version} publicada e ativa.`);
      setValidation(null);
      await onChanged();
    } catch {
      toast.error('Falha ao publicar. Atualize a página (F5) e tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!family.draft) return;
    const ok = await confirm({
      title: `Descartar o rascunho v${family.draft.version}?`,
      description: 'O rascunho é apagado na Meta. A versão publicada continua igual.',
      confirmLabel: 'Descartar',
    });
    if (!ok) return;
    setBusy('discard');
    try {
      const r = await discardWhatsAppFormDraft(family.draft.id);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Rascunho descartado.');
      setValidation(null);
      await onChanged();
    } catch {
      toast.error('Falha ao descartar. Atualize a página (F5) e tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  async function activate(versionId: string, version: number) {
    const ok = await confirm({
      title: `Voltar para a versão v${version}?`,
      description: 'Ela passa a ser a enviada aos clientes. Nada é apagado.',
      tone: 'warning',
      confirmLabel: 'Tornar ativa',
    });
    if (!ok) return;
    setBusy(`activate:${versionId}`);
    try {
      const r = await activateWhatsAppFormVersion(versionId);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`v${version} ativa.`);
      await onChanged();
    } catch {
      toast.error('Falha ao trocar a versão. Atualize a página (F5) e tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  async function saveDefaults() {
    setBusy('defaults');
    try {
      const r = await saveWhatsAppFormDefaults(family.familyId, { bodyText: msg.bodyText, cta: msg.cta, headerText: msg.headerText, footerText: msg.footerText });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Texto padrão da mensagem salvo.');
      await onChanged();
    } catch {
      toast.error('Falha ao salvar. Atualize a página (F5) e tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  const tabCls = (t: Tab) => `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${tab === t
    ? 'bg-cyan-600 text-white'
    : 'text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`;
  const msgError = msg.bodyText || msg.cta ? validateFormMessage({ body: msg.bodyText, cta: msg.cta, header: msg.headerText, footer: msg.footerText }) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-zinc-800">
        <button type="button" onClick={onBack} className="mr-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-zinc-300">
          <ArrowLeft className="h-4 w-4" /> Voltar ao envio
        </button>
        <button type="button" className={tabCls('textos')} onClick={() => switchTab('textos')}>Textos e telas</button>
        <button type="button" className={tabCls('json')} onClick={() => switchTab('json')}>JSON avançado</button>
        <button type="button" className={tabCls('mensagem')} onClick={() => switchTab('mensagem')}>Mensagem</button>
        <button type="button" className={tabCls('versoes')} onClick={() => switchTab('versoes')}>Versões ({family.versions.length})</button>
        <span className="ml-auto text-xs text-gray-400">
          Editando {base.status === 'DRAFT' ? `o rascunho v${base.version}` : `a partir da v${base.version} publicada`}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : loadError || !detail ? (
        <p className="p-5 text-sm text-red-600">{loadError ?? 'Falha ao carregar o formulário.'}</p>
      ) : !work ? (
        <p className="p-5 text-sm text-red-600">{detail.jsonError ?? 'Não consegui ler o JSON deste formulário na Meta.'}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            {validation && validation.length > 0 && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
                <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> A Meta apontou erros no rascunho:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {validation.map((e, i) => <li key={i}>{e.message}{e.line ? ` (linha ${e.line})` : ''}</li>)}
                </ul>
              </div>
            )}
            {validation && validation.length === 0 && (
              <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> A Meta aceitou o rascunho sem erros.
              </p>
            )}

            {tab === 'textos' && current && current.screens.map((s, si) => (
              <section key={`${s.id}-${si}`} className="rounded-xl border border-gray-200 dark:border-zinc-700">
                <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-zinc-800">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{si + 1}</span>
                  <span className="truncate text-sm font-semibold">{s.id}</span>
                  {s.id === entryScreen(current).id && <span className="text-xs text-emerald-600">abre primeiro</span>}
                  <span className="ml-auto flex gap-1">
                    <button type="button" disabled={si === 0} onClick={() => move(si, si - 1)} title="Subir a tela" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-zinc-800"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" disabled={si === current.screens.length - 1} onClick={() => move(si, si + 1)} title="Descer a tela" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-zinc-800"><ArrowDown className="h-4 w-4" /></button>
                  </span>
                </div>
                <div className="space-y-2.5 p-3">
                  {fields.filter((f) => f.screenIndex === si).length === 0 && <p className="text-xs text-gray-400">Sem texto fixo nesta tela (só expressões — edite pelo JSON avançado).</p>}
                  {fields.filter((f) => f.screenIndex === si).map((f) => {
                    const value = f.key in edits ? edits[f.key] : f.value;
                    return (
                      <label key={f.key} className="block">
                        <span className="mb-1 block text-xs font-semibold text-gray-500 dark:text-zinc-400">{f.label}</span>
                        {f.kind === 'bool' ? (
                          <input
                            type="checkbox"
                            checked={value === true}
                            onChange={(e) => setEdits((ed) => ({ ...ed, [f.key]: e.target.checked }))}
                            className="h-4 w-4 accent-cyan-600"
                          />
                        ) : f.kind === 'multiline' ? (
                          <Textarea value={String(value)} onChange={(e) => setEdits((ed) => ({ ...ed, [f.key]: e.target.value }))} rows={f.asLines ? 8 : 3} className="text-sm" />
                        ) : (
                          <Input value={String(value)} onChange={(e) => setEdits((ed) => ({ ...ed, [f.key]: e.target.value }))} className="h-9 text-sm" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            {tab === 'json' && (
              <div>
                <p className="mb-2 text-xs text-gray-500">JSON do Flow (versão {String(work.version ?? '?')}). Imagens vão em base64 — não apague o campo <code>src</code>. A Meta valida ao salvar.</p>
                <Textarea value={rawJson} onChange={(e) => { setRawJson(e.target.value); setRawError(null); }} rows={28} spellCheck={false} className="font-mono text-xs" />
                {rawError && <p className="mt-1.5 text-xs text-red-600">{rawError}</p>}
              </div>
            )}

            {tab === 'mensagem' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Texto que vem preenchido no envio (o atendente ainda pode mudar na hora). Não altera o formulário na Meta.</p>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Mensagem ({FORM_MESSAGE_LIMITS.body} máx.)</span>
                  <Textarea value={msg.bodyText} onChange={(e) => setMsg((m) => ({ ...m, bodyText: e.target.value }))} rows={4} className="text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Texto do botão ({FORM_MESSAGE_LIMITS.cta} máx., sem emoji)</span>
                  <Input value={msg.cta} maxLength={FORM_MESSAGE_LIMITS.cta} onChange={(e) => setMsg((m) => ({ ...m, cta: e.target.value }))} className="h-9 text-sm" />
                </label>
                <Input value={msg.headerText} maxLength={FORM_MESSAGE_LIMITS.header} onChange={(e) => setMsg((m) => ({ ...m, headerText: e.target.value }))} placeholder="Cabeçalho (opcional)" className="h-9 text-sm" />
                <Input value={msg.footerText} maxLength={FORM_MESSAGE_LIMITS.footer} onChange={(e) => setMsg((m) => ({ ...m, footerText: e.target.value }))} placeholder="Rodapé (opcional)" className="h-9 text-sm" />
                {msgError && <p className="text-xs text-red-600">{msgError}</p>}
                <Button onClick={saveDefaults} disabled={!!busy || !!msgError || !msg.bodyText.trim()} className="bg-cyan-600 hover:bg-cyan-700">
                  {busy === 'defaults' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar texto padrão
                </Button>
              </div>
            )}

            {tab === 'versoes' && (
              <ul className="space-y-2">
                {family.versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-zinc-700">
                    <span className="font-mono font-semibold">v{v.version}</span>
                    <span className="truncate text-gray-600 dark:text-zinc-300">{v.name}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{FORM_STATUS_LABEL[v.status] ?? v.status}</span>
                    {v.active && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">ativa</span>}
                    <span className="text-xs text-gray-400">
                      {v.publishedAt ? `publicada ${fmtDate(v.publishedAt)}` : `criada ${fmtDate(v.createdAt)}`}{v.createdByName ? ` · ${v.createdByName}` : ''}
                    </span>
                    {v.status === 'PUBLISHED' && !v.active && (
                      <Button size="sm" variant="outline" className="ml-auto h-7" disabled={!!busy} onClick={() => activate(v.id, v.version)}>
                        {busy === `activate:${v.id}` && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Tornar ativa
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hidden min-h-0 overflow-y-auto border-l border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/40 lg:block">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-600 dark:text-zinc-300">Prévia</span>
              {detail.previewUrl && (
                <a href={detail.previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">
                  Meta (versão salva) <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {current && <WaFormPreview json={tab === 'json' ? readFlowJson(rawJson) ?? current : current} entryId={entryScreen(current).id} />}
          </div>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-zinc-800">
        {family.draft && (
          <Button variant="ghost" onClick={discard} disabled={!!busy} className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700">
            {busy === 'discard' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Descartar rascunho v{family.draft.version}
          </Button>
        )}
        <Button variant="outline" onClick={saveDraft} disabled={!!busy || !work || tab === 'mensagem' || tab === 'versoes' || !dirty}>
          {busy === 'draft' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {family.draft ? `Salvar no rascunho v${family.draft.version}` : 'Salvar como nova versão (rascunho)'}
        </Button>
        {family.draft && (
          <Button onClick={publish} disabled={!!busy || dirty || (validation?.length ?? 0) > 0} title={dirty ? 'Salve o rascunho antes de publicar' : undefined} className="bg-cyan-600 hover:bg-cyan-700">
            {busy === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Publicar v{family.draft.version}
          </Button>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
