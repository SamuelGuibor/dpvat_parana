/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, Send, FileBadge, Settings2, Search, Check, Image as ImageIcon, Video, FileText, AlertTriangle, ClipboardList, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppTemplates, sendWhatsAppTemplateMessage, type WhatsAppTemplateDTO,
} from '@/app/_actions/whatsapp/templates';
import type { WhatsAppMessageDTO } from '@/app/_shared/lib/whatsapp/service';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { jsonFetcher, describeFetchError } from '@/app/_shared/utils/fetch-json';
import {
  FORMS_URL, humanizeKey, type FormCatalogResponse, type FormFamilyDTO, type TemplateFormResponse,
} from '@/app/_shared/utils/wa-forms';
import { WhatsAppTemplatesModal } from './WhatsAppTemplatesModal';
import { WhatsAppFormsPanel } from './WhatsAppFormsPanel';
import { WhatsAppFormEditor } from './WhatsAppFormEditor';
import { WaFormPreview } from './WaFormPreview';

// Aberto pelo aviso de "janela de 24h expirada": único jeito de falar com o
// cliente de novo é um template aprovado na Meta. Escolhe o template, preenche
// as variáveis e envia — não passa pelo composer normal (texto livre falha).
//
// Layout em duas colunas com ALTURA FIXA (03/08/2026): antes o conteúdo
// crescia livre dentro de um DialogContent que não tem max-height, então com
// muitos templates ou muitas variáveis o modal vazava pra fora da tela e o
// botão de enviar ficava inalcançável. Agora cada coluna rola por dentro e o
// rodapé fica sempre visível.
//
// Entrada ÚNICA de template e formulário (17/11/2026): o composer perdeu o
// botão Formulário. O seletor Templates | Formulários troca a coluna; o envio
// direto de formulário só vale com a janela aberta. Template com botão de
// formulário mostra a prévia do formulário e os dados da tela, editáveis.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  /** Janela de 24 h aberta: libera a aba Formulários (fora dela a Meta recusa). */
  windowOpen: boolean;
  /**
   * Template enviado: quem abriu aplica o patch local da conversa e revalida a
   * thread em segundo plano. Síncrono de propósito (auditoria de 24/09/2026):
   * o diálogo esperava a recarga das 1.000 conversas da lista para fechar.
   */
  onSent: (dto: WhatsAppMessageDTO) => void;
}

export function WhatsAppSendTemplateModal({ open, onOpenChange, contactId, windowOpen, onSent }: Props) {
  const [mode, setMode] = useState<'templates' | 'forms'>('templates');
  const [onlyForms, setOnlyForms] = useState(false);
  const [form, setForm] = useState<TemplateFormResponse | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [flowValues, setFlowValues] = useState<Record<string, string>>({});
  const formReq = useRef(0);
  const [editFamily, setEditFamily] = useState<FormFamilyDTO | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const [templates, setTemplates] = useState<WhatsAppTemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  const [headerVar, setHeaderVar] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  async function reload() {
    setLoading(true);
    try {
      // Só aprovados E do catálogo do número que atende este contato — enviar
      // template de outra WABA a Meta recusa (multi-número, 18/08/2026).
      const list = await listWhatsAppTemplates(true, contactId);
      setTemplates(list);
      if (list.length && !list.some((t) => t.id === selectedId)) setSelectedId(list[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) reload();
    else { setTemplateSearch(''); setMode('templates'); setOnlyForms(false); setEditFamily(null); }
  }, [open, contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const filteredTemplates = templates.filter((t) => {
    const term = templateSearch.trim().toLowerCase();
    if (onlyForms && !t.flowButton) return false;
    return t.name.toLowerCase().includes(term) || t.language.toLowerCase().includes(term);
  });

  useEffect(() => {
    setVars(selected ? Array.from({ length: selected.bodyVars }, () => '') : []);
    setHeaderVar('');
  }, [selected?.id, selected?.bodyVars]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadForm(templateId: string) {
    const req = ++formReq.current;
    setFormLoading(true);
    setFormError(null);
    setForm(null);
    try {
      const d = await jsonFetcher<TemplateFormResponse>(`${FORMS_URL}?templateId=${encodeURIComponent(templateId)}&contactId=${encodeURIComponent(contactId)}`);
      if (req !== formReq.current) return; // trocou de template no meio
      setForm(d);
      setFlowValues(d.suggested);
    } catch (err) {
      if (req === formReq.current) setFormError(describeFetchError(err));
    } finally {
      if (req === formReq.current) setFormLoading(false);
    }
  }

  // Template com botão de formulário: busca a prévia e os dados da tela.
  useEffect(() => {
    if (!open || !selected?.flowButton) { formReq.current++; setForm(null); setFormError(null); setFormLoading(false); setFlowValues({}); return; }
    void loadForm(selected.id);
  }, [open, selected?.id, !!selected?.flowButton]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openEditor() {
    if (!form?.version) return;
    setOpeningEditor(true);
    try {
      // O editor precisa da família inteira: vem do catálogo da WABA do contato.
      const cat = await jsonFetcher<FormCatalogResponse>(`${FORMS_URL}?contactId=${encodeURIComponent(contactId)}`);
      const fam = cat.families.find((f) => f.familyId === form.version!.familyId);
      if (!fam) { toast.error('Não encontrei este formulário no catálogo da linha do contato.'); return; }
      setEditFamily(fam);
    } catch (err) {
      toast.error(describeFetchError(err));
    } finally {
      setOpeningEditor(false);
    }
  }

  // Cabeçalho aceita no máximo uma variável, sempre {{1}}.
  const headerHasVar = /\{\{\s*1\s*\}\}/.test(selected?.headerText ?? '');
  const headerPreview = selected?.headerText
    ? selected.headerText.replaceAll('{{1}}', headerVar || '{{1}}')
    : null;

  const preview = selected?.bodyPreview
    ? vars.reduce((acc, v, i) => acc.replaceAll(`{{${i + 1}}}`, v || `{{${i + 1}}}`), selected.bodyPreview)
    : null;

  const formData = form?.button ? form.entryData : [];
  const blankData = formData.filter((d) => d.type === 'string' && !(flowValues[d.key] ?? '').trim());

  async function handleSend() {
    if (!selected) return;
    if (blankData.length) {
      const ok = await confirm({
        title: `Enviar "${selected.name}" com dados em branco?`,
        description: `${blankData.map((d) => humanizeKey(d.key)).join(', ')} ficou em branco e aparece vazio no formulário do cliente.`,
        tone: 'warning',
        confirmLabel: 'Enviar mesmo assim',
      });
      if (!ok) return;
    }
    setSending(true);
    try {
      // A action devolve o erro em texto (lançado, chegaria mascarado em produção).
      // Dados da tela só vão quando a prévia carregou (sem ela, a sugestão do servidor).
      const r = await sendWhatsAppTemplateMessage(contactId, selected.id, vars, headerVar, form?.button ? flowValues : null);
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); return; }
      toast.success('Template enviado.');
      onOpenChange(false);
      onSent(r.message);
    } catch {
      toast.error('Falha ao enviar o template. Atualize a página (F5) e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  // Cabeçalho de mídia: o envio usa a mídia padrão definida no gerenciador —
  // sem ela a Meta recusa, então o botão fica travado com o aviso.
  const isMediaHeader = !!selected?.headerFormat && selected.headerFormat !== 'TEXT';
  const missingHeaderMedia = isMediaHeader && !selected!.hasHeaderMedia;

  const canSend = !!selected && !sending && !(headerHasVar && !headerVar.trim()) && !missingHeaderMedia && !form?.warning?.blocking;
  const bubble = selected ? {
    header: headerPreview, body: preview ?? '', footer: selected.footerText, buttons: selected.buttons ?? [],
  } : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[85vh] max-h-[85vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          {/* pr-12 reserva espaço para o X de fechar, que é absolute no topo direito. */}
          <DialogHeader className="shrink-0 border-b border-gray-100 py-4 pl-5 pr-12 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <FileBadge className="h-5 w-5 text-emerald-600" /> {editFamily ? `Editar formulário — ${editFamily.name}` : 'Enviar template ou formulário'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {windowOpen
                ? 'Template aprovado funciona sempre; formulário direto só com a janela de 24 h aberta.'
                : 'A janela de 24h expirou — só um template aprovado na Meta chega ao cliente agora.'}
            </DialogDescription>
            {!editFamily && (
              <div role="tablist" className="mt-2 inline-flex w-fit rounded-lg bg-gray-100 p-0.5 text-sm">
                <button
                  type="button" role="tab" aria-selected={mode === 'templates'}
                  onClick={() => setMode('templates')}
                  className={`rounded-md px-3 py-1 font-semibold ${mode === 'templates' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
                >Templates</button>
                <button
                  type="button" role="tab" aria-selected={mode === 'forms'}
                  onClick={() => setMode('forms')}
                  disabled={!windowOpen}
                  title={windowOpen ? 'Enviar formulário direto (dentro da janela de 24 h)' : 'Fora da janela de 24 h o formulário só sai por template'}
                  className={`rounded-md px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'forms' ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500'}`}
                >Formulários</button>
              </div>
            )}
          </DialogHeader>

          {editFamily ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Voltar relê a prévia: o template aponta um flow_id fixo, e o aviso de versão pode ter mudado. */}
              <WhatsAppFormEditor
                family={editFamily}
                onBack={() => { setEditFamily(null); if (selected) void loadForm(selected.id); }}
                onChanged={() => {}}
              />
            </div>
          ) : mode === 'forms' && windowOpen ? (
            <WhatsAppFormsPanel contactId={contactId} onSent={(dto) => { onOpenChange(false); onSent(dto); }} />
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-base text-gray-400">Nenhum template aprovado disponível.</p>
              <Button variant="outline" onClick={() => setManageOpen(true)} className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Gerenciar templates
              </Button>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              {/* Coluna 1: busca + lista, rolando por dentro */}
              <div className="flex min-h-0 flex-col border-b border-gray-100 dark:border-zinc-800 sm:border-b-0 sm:border-r">
                <div className="flex shrink-0 items-center gap-2 p-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Buscar template..."
                      className="h-10 pl-9 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnlyForms((v) => !v)}
                    aria-pressed={onlyForms}
                    className={`flex h-10 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${onlyForms ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <ClipboardList className="h-3.5 w-3.5" /> Com formulário
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                  {filteredTemplates.length === 0 && (
                    <p className="p-2 text-sm text-gray-400">Nenhum template encontrado.</p>
                  )}
                  {filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        t.id === selectedId
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                          : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-sm font-semibold">{t.name}</span>
                          {t.flowButton && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                              <ClipboardList className="h-3 w-3" /> Formulário
                            </span>
                          )}
                        </span>
                        <span className={`block text-xs ${t.id === selectedId ? 'opacity-75' : 'text-gray-400'}`}>
                          {t.language} · {t.bodyVars === 1 ? '1 variável' : t.bodyVars ? `${t.bodyVars} variáveis` : 'sem variável'}
                        </span>
                      </span>
                      {t.id === selectedId && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Coluna 2: variáveis + prévia (rola) e rodapé fixo */}
              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  {isMediaHeader && (
                    <div className={`flex items-start gap-2 rounded-xl p-3 text-sm leading-relaxed ${
                      missingHeaderMedia
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300'
                        : 'bg-sky-50 text-sky-800 dark:bg-sky-950/20 dark:text-sky-300'
                    }`}>
                      {missingHeaderMedia
                        ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        : selected?.headerFormat === 'IMAGE'
                          ? <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />
                          : selected?.headerFormat === 'VIDEO'
                            ? <Video className="mt-0.5 h-4 w-4 shrink-0" />
                            : <FileText className="mt-0.5 h-4 w-4 shrink-0" />}
                      {missingHeaderMedia
                        ? 'Este template tem cabeçalho de mídia, mas nenhuma mídia foi definida. Abra "Gerenciar" e clique em "Definir mídia".'
                        : `O cliente recebe este template com ${selected?.headerFormat === 'IMAGE' ? 'a imagem' : selected?.headerFormat === 'VIDEO' ? 'o vídeo' : 'o PDF'} do cabeçalho definido no gerenciador.`}
                    </div>
                  )}

                  {headerHasVar && (
                    <div>
                      <span className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">
                        Variável do cabeçalho
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="w-9 shrink-0 font-mono text-xs text-gray-400">{'{{1}}'}</span>
                        <Input
                          value={headerVar}
                          onChange={(e) => setHeaderVar(e.target.value)}
                          placeholder="Ex.: Maria"
                          className="h-10 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {selected && selected.bodyVars > 0 && (
                    <div>
                      <span className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Variáveis</span>
                      <div className="space-y-2">
                        {vars.map((v, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-9 shrink-0 font-mono text-xs text-gray-400">{`{{${i + 1}}}`}</span>
                            <Input
                              value={v}
                              onChange={(e) => setVars((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                              placeholder={`Variável ${i + 1}`}
                              className="h-10 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selected?.flowButton && formLoading && (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  )}
                  {selected?.flowButton && formError && (
                    <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                      Não consegui carregar o formulário deste template: {formError}{' '}
                      <button type="button" onClick={() => loadForm(selected.id)} className="font-semibold underline">Tentar de novo</button>
                      <span className="mt-1 block text-xs text-red-600">O template ainda pode ser enviado (os dados da tela vão pela sugestão do card).</span>
                    </div>
                  )}

                  {form?.button && formData.length > 0 && (
                    <div>
                      <span className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Dados que o formulário já abre preenchidos</span>
                      <div className="space-y-2">
                        {formData.map((d) => (
                          <div key={d.key} className="flex items-center gap-2">
                            <span className="w-28 shrink-0 truncate text-xs font-semibold text-gray-500" title={d.key}>{humanizeKey(d.key)}</span>
                            {d.type === 'string' || d.type === 'number' || d.type === 'boolean' ? (
                              <Input
                                value={flowValues[d.key] ?? ''}
                                onChange={(e) => setFlowValues((v) => ({ ...v, [d.key]: e.target.value }))}
                                placeholder={typeof d.example === 'string' ? `Ex.: ${d.example}` : d.type}
                                className="h-9 text-sm"
                              />
                            ) : (
                              <span className="text-xs text-gray-400">vai o exemplo do próprio formulário ({d.type})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {form?.warning && (
                    <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${form.warning.blocking ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {form.warning.text}
                    </div>
                  )}

                  {bubble && (bubble.body || bubble.header) && (
                    <div>
                      <span className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Prévia: o que o cliente recebe</span>
                      <div className="rounded-xl bg-gray-100 p-3">
                        {form?.flowJson ? (
                          <WaFormPreview
                            json={form.flowJson}
                            openScreen={form.openScreen}
                            values={flowValues}
                            previewUrl={form.previewUrl}
                            message={bubble}
                          />
                        ) : (
                          <WaTemplateBubble {...bubble} />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 dark:border-zinc-800">
                  <span className="flex items-center gap-4">
                    <button
                      onClick={() => setManageOpen(true)}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-zinc-300"
                    >
                      <Settings2 className="h-4 w-4" /> Gerenciar
                    </button>
                    {form?.canEdit && form.version && (
                      <button onClick={openEditor} disabled={openingEditor} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">
                        {openingEditor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Editar formulário
                      </button>
                    )}
                  </span>
                  <Button onClick={handleSend} disabled={!canSend} className="bg-emerald-600 hover:bg-emerald-700">
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar template
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WhatsAppTemplatesModal open={manageOpen} onOpenChange={setManageOpen} onChanged={reload} />
      {confirmDialog}
    </>
  );
}

/** Bolha de template sem formulário: cabeçalho, corpo, rodapé e os botões. */
function WaTemplateBubble({ header, body, footer, buttons }: { header: string | null; body: string; footer: string | null; buttons: { type: string; text: string }[] }) {
  return (
    <div className="rounded-xl rounded-tl-sm bg-emerald-50">
      <div className="p-3">
        {header && <p className="mb-1 whitespace-pre-wrap text-sm font-bold leading-snug text-gray-900">{header}</p>}
        {body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{body}</p>}
        {footer && <p className="mt-2 text-xs text-gray-500">{footer}</p>}
      </div>
      {buttons.map((b, i) => (
        <div key={i} className="border-t border-emerald-100 px-3 py-2 text-center text-sm font-semibold text-cyan-700">{b.text || b.type}</div>
      ))}
    </div>
  );
}
