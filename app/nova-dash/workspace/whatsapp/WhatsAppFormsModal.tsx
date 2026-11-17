/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ClipboardList, Loader2, Search, Send, Pencil, RefreshCw, ExternalLink, AlertTriangle, ChevronDown, ChevronRight, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Textarea } from '@/app/_shared/ui/textarea';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { jsonFetcher, describeFetchError } from '@/app/_shared/utils/fetch-json';
import { sendWhatsAppForm } from '@/app/_actions/whatsapp/forms';
import type { WhatsAppMessageDTO } from '@/app/_shared/lib/whatsapp/service';
import {
  FORM_MESSAGE_LIMITS, FORM_STATUS_LABEL, validateFormMessage,
  type FormCatalogResponse, type FormDetailResponse, type FormFamilyDTO,
} from '@/app/_shared/utils/wa-forms';
import { WaFormPreview } from './WaFormPreview';
import { WhatsAppFormEditor } from './WhatsAppFormEditor';

// Formulários do WhatsApp (Meta "WhatsApp Flows", T-7ZQH6) no composer:
// escolher um formulário PUBLICADO da conta (WABA) do contato, ver a prévia,
// ajustar a mensagem que leva o botão e enviar com confirmação. Quem tem
// `manage_wa_forms` também edita (nova versão → rascunho → publicar).
// Não confundir com "Fluxos" (sequências de textos pré-setados do CRM).

export const FORMS_URL = '/api/whatsapp/forms';
const DEFAULT_BODY = 'Para seguirmos com o seu atendimento, toque no botão abaixo e preencha o formulário. Leva menos de 1 minuto.';
const DEFAULT_CTA = 'Abrir formulário';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  /** Enviado: o Inbox põe a mensagem na thread e aplica o patch da conversa. */
  onSent: (dto: WhatsAppMessageDTO) => void;
}

export function WhatsAppFormsModal({ open, onOpenChange, contactId, onSent }: Props) {
  const [catalog, setCatalog] = useState<FormCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAds, setShowAds] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [detail, setDetail] = useState<FormDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailReq = useRef(0);

  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showExtras, setShowExtras] = useState(false);
  const [sending, setSending] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  async function loadCatalog(refresh = false) {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await jsonFetcher<FormCatalogResponse>(`${FORMS_URL}?contactId=${encodeURIComponent(contactId)}${refresh ? '&refresh=1' : ''}`);
      setCatalog(data);
      setFamilyId((cur) => (cur && data.families.some((f) => f.familyId === cur)
        ? cur
        : data.families.find((f) => !f.adAuto && f.active)?.familyId ?? null));
    } catch (err) {
      setLoadError(describeFetchError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadCatalog();
    } else {
      setSearch(''); setEditing(false); setDetail(null); setShowAds(false); setShowExtras(false);
    }
  }, [open, contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  const family: FormFamilyDTO | null = catalog?.families.find((f) => f.familyId === familyId) ?? null;
  const sendVersion = family?.active ?? null;

  useEffect(() => {
    if (!open || editing || !sendVersion) { setDetail(null); return; }
    const req = ++detailReq.current;
    setDetailLoading(true);
    setDetailError(null);
    jsonFetcher<FormDetailResponse>(`${FORMS_URL}?versionId=${encodeURIComponent(sendVersion.id)}&contactId=${encodeURIComponent(contactId)}`)
      .then((d) => {
        if (req !== detailReq.current) return; // trocou de formulário no meio
        setDetail(d);
        setBody(d.version.bodyText ?? DEFAULT_BODY);
        setCta(d.version.cta ?? DEFAULT_CTA);
        setHeader(d.version.headerText ?? '');
        setFooter(d.version.footerText ?? '');
        setValues(d.suggested);
      })
      .catch((err) => { if (req === detailReq.current) setDetailError(describeFetchError(err)); })
      .finally(() => { if (req === detailReq.current) setDetailLoading(false); });
  }, [open, editing, sendVersion?.id, sendVersion?.updatedAt, contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  const term = search.trim().toLowerCase();
  const families = catalog?.families ?? [];
  const adCount = families.filter((f) => f.adAuto).length;
  const visible = families.filter((f) => (showAds || !f.adAuto || f.familyId === familyId) && (!term || f.name.toLowerCase().includes(term)));

  const messageError = validateFormMessage({ body, cta, header, footer });
  const missingData = detail?.entryData.filter((d) => d.type === 'string' && !(values[d.key] ?? '').trim()) ?? [];
  const canSend = !!detail?.flowJson && !messageError && !sending;

  async function handleSend() {
    if (!family || !sendVersion || !canSend) return;
    const ok = await confirm({
      title: `Enviar o formulário "${family.name}"?`,
      description: missingData.length
        ? `O cliente recebe a mensagem com o botão "${cta.trim()}". Atenção: ${missingData.map((d) => d.key).join(', ')} ficou em branco e aparece vazio no formulário.`
        : `O cliente recebe a mensagem com o botão "${cta.trim()}" e preenche dentro do WhatsApp.`,
      tone: missingData.length ? 'warning' : 'default',
      confirmLabel: 'Enviar',
    });
    if (!ok) return;
    setSending(true);
    try {
      const r = await sendWhatsAppForm({ contactId, versionId: sendVersion.id, body, cta, header, footer, values });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Formulário enviado.');
      onOpenChange(false);
      onSent(r.message);
    } catch {
      toast.error('Falha ao enviar o formulário. Atualize a página (F5) e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[88vh] max-h-[88vh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-gray-100 py-4 pl-5 pr-12 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <ClipboardList className="h-5 w-5 text-cyan-600" /> {editing && family ? `Editar formulário — ${family.name}` : 'Enviar formulário do WhatsApp'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editing
                ? 'Formulário publicado não muda na Meta: salvar cria uma nova versão em rascunho, e publicar faz dela a versão enviada.'
                : 'O cliente preenche dentro do WhatsApp e a resposta aparece aqui na conversa. Só sai dentro da janela de 24 h.'}
            </DialogDescription>
          </DialogHeader>

          {editing && family ? (
            <WhatsAppFormEditor
              family={family}
              onBack={() => setEditing(false)}
              onChanged={() => loadCatalog(true)}
            />
          ) : loading && !catalog ? (
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : loadError && !catalog ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-red-600">{loadError}</p>
              <Button variant="outline" onClick={() => loadCatalog()}>Tentar de novo</Button>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              {/* Lista */}
              <div className="flex min-h-0 flex-col border-b border-gray-100 dark:border-zinc-800 sm:border-b-0 sm:border-r">
                <div className="flex shrink-0 items-center gap-2 p-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar formulário..." className="h-10 pl-9 text-sm" />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadCatalog(true)}
                    disabled={loading}
                    title="Buscar de novo na Meta"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {catalog?.syncError && (
                  <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Não consegui atualizar com a Meta: {catalog.syncError}
                  </p>
                )}
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                  {visible.length === 0 && <p className="p-2 text-sm text-gray-400">Nenhum formulário {term ? 'encontrado' : 'nesta conta do WhatsApp'}.</p>}
                  {visible.map((f) => {
                    const sel = f.familyId === familyId;
                    const v = f.active ?? f.draft ?? f.versions[0];
                    return (
                      <button
                        key={f.familyId}
                        type="button"
                        onClick={() => setFamilyId(f.familyId)}
                        className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${sel
                          ? 'bg-cyan-50 text-cyan-900 dark:bg-cyan-900/30 dark:text-cyan-100'
                          : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{f.name}</span>
                          <span className={`block text-xs ${sel ? 'opacity-75' : 'text-gray-400'}`}>
                            {f.active ? `v${f.active.version} publicada` : FORM_STATUS_LABEL[v?.status ?? ''] ?? v?.status}
                            {f.draft && f.active ? ` · rascunho v${f.draft.version}` : ''}
                          </span>
                        </span>
                        {sel && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                  {adCount > 0 && !term && (
                    <button type="button" onClick={() => setShowAds((s) => !s)} className="flex w-full items-center gap-1 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-zinc-300">
                      {showAds ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {showAds ? 'Esconder' : 'Mostrar'} {adCount} formulário(s) automático(s) de anúncio
                    </button>
                  )}
                </div>
              </div>

              {/* Prévia + mensagem + envio */}
              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  {!family ? (
                    <p className="text-sm text-gray-400">Escolha um formulário na lista.</p>
                  ) : !sendVersion ? (
                    <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Este formulário não tem versão publicada — só formulário publicado pode ser enviado.
                    </p>
                  ) : detailLoading && !detail ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : detailError ? (
                    <p className="text-sm text-red-600">{detailError}</p>
                  ) : detail ? (
                    <>
                      <section>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-600 dark:text-zinc-300">Mensagem que leva o formulário</span>
                          <span className="text-xs text-gray-400">{body.trim().length}/{FORM_MESSAGE_LIMITS.body}</span>
                        </div>
                        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="text-sm" />
                        <div className="mt-2 flex items-center gap-2">
                          <span className="w-28 shrink-0 text-xs font-semibold text-gray-500">Texto do botão</span>
                          <Input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={FORM_MESSAGE_LIMITS.cta} className="h-9 text-sm" />
                        </div>
                        <button type="button" onClick={() => setShowExtras((s) => !s)} className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                          {showExtras ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Cabeçalho e rodapé (opcional)
                        </button>
                        {showExtras && (
                          <div className="mt-2 space-y-2">
                            <Input value={header} onChange={(e) => setHeader(e.target.value)} maxLength={FORM_MESSAGE_LIMITS.header} placeholder="Cabeçalho (negrito, até 60)" className="h-9 text-sm" />
                            <Input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={FORM_MESSAGE_LIMITS.footer} placeholder="Rodapé (cinza, até 60)" className="h-9 text-sm" />
                          </div>
                        )}
                        {messageError && <p className="mt-1.5 text-xs text-red-600">{messageError}</p>}
                      </section>

                      {detail.entryData.length > 0 && (
                        <section>
                          <span className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Dados que o formulário já abre preenchidos</span>
                          <div className="space-y-2">
                            {detail.entryData.map((d) => (
                              <div key={d.key} className="flex items-center gap-2">
                                <span className="w-28 shrink-0 truncate font-mono text-xs text-gray-500" title={d.key}>{d.key}</span>
                                {d.type === 'string' || d.type === 'number' || d.type === 'boolean' ? (
                                  <Input
                                    value={values[d.key] ?? ''}
                                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                                    placeholder={typeof d.example === 'string' ? `Ex.: ${d.example}` : d.type}
                                    className="h-9 text-sm"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-400">vai o exemplo do próprio formulário ({d.type})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      <section>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-600 dark:text-zinc-300">Prévia das telas</span>
                          {detail.previewUrl && (
                            <a href={detail.previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">
                              Prévia interativa da Meta <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {detail.flowJson
                          ? <WaFormPreview json={detail.flowJson} entryId={detail.entryScreen} />
                          : <p className="text-sm text-red-600">{detail.jsonError ?? 'Não consegui ler o formulário na Meta.'}</p>}
                      </section>
                    </>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 dark:border-zinc-800">
                  {catalog?.canEdit && family ? (
                    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-zinc-300">
                      <Pencil className="h-4 w-4" /> Editar formulário
                    </button>
                  ) : <span />}
                  <Button onClick={handleSend} disabled={!canSend || !sendVersion} className="bg-cyan-600 hover:bg-cyan-700">
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar formulário
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
