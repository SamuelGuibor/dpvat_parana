/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send, FileBadge, Settings2, Search, Check, Image as ImageIcon, Video, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppTemplates, sendWhatsAppTemplateMessage, type WhatsAppTemplateDTO,
} from '@/app/_actions/whatsapp/templates';
import { WhatsAppTemplatesModal } from './WhatsAppTemplatesModal';

// Aberto pelo aviso de "janela de 24h expirada": único jeito de falar com o
// cliente de novo é um template aprovado na Meta. Escolhe o template, preenche
// as variáveis e envia — não passa pelo composer normal (texto livre falha).
//
// Layout em duas colunas com ALTURA FIXA (03/08/2026): antes o conteúdo
// crescia livre dentro de um DialogContent que não tem max-height, então com
// muitos templates ou muitas variáveis o modal vazava pra fora da tela e o
// botão de enviar ficava inalcançável. Agora cada coluna rola por dentro e o
// rodapé fica sempre visível.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onSent: () => Promise<void>;
}

export function WhatsAppSendTemplateModal({ open, onOpenChange, contactId, onSent }: Props) {
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
      // Só aprovados: a Meta recusa o envio de template em análise/reprovado.
      const list = await listWhatsAppTemplates(true);
      setTemplates(list);
      if (list.length && !list.some((t) => t.id === selectedId)) setSelectedId(list[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open) reload(); else setTemplateSearch(''); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const filteredTemplates = templates.filter((t) => {
    const term = templateSearch.trim().toLowerCase();
    return t.name.toLowerCase().includes(term) || t.language.toLowerCase().includes(term);
  });

  useEffect(() => {
    setVars(selected ? Array.from({ length: selected.bodyVars }, () => '') : []);
    setHeaderVar('');
  }, [selected?.id, selected?.bodyVars]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cabeçalho aceita no máximo uma variável, sempre {{1}}.
  const headerHasVar = /\{\{\s*1\s*\}\}/.test(selected?.headerText ?? '');
  const headerPreview = selected?.headerText
    ? selected.headerText.replaceAll('{{1}}', headerVar || '{{1}}')
    : null;

  const preview = selected?.bodyPreview
    ? vars.reduce((acc, v, i) => acc.replaceAll(`{{${i + 1}}}`, v || `{{${i + 1}}}`), selected.bodyPreview)
    : null;

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    try {
      await sendWhatsAppTemplateMessage(contactId, selected.id, vars, headerVar);
      toast.success('Template enviado.');
      await onSent();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar o template.');
    } finally {
      setSending(false);
    }
  }

  // Cabeçalho de mídia: o envio usa a mídia padrão definida no gerenciador —
  // sem ela a Meta recusa, então o botão fica travado com o aviso.
  const isMediaHeader = !!selected?.headerFormat && selected.headerFormat !== 'TEXT';
  const missingHeaderMedia = isMediaHeader && !selected!.hasHeaderMedia;

  const canSend = !!selected && !sending && !(headerHasVar && !headerVar.trim()) && !missingHeaderMedia;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[85vh] max-h-[85vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          {/* pr-12 reserva espaço para o X de fechar, que é absolute no topo direito. */}
          <DialogHeader className="shrink-0 border-b border-gray-100 py-4 pl-5 pr-12 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <FileBadge className="h-5 w-5 text-emerald-600" /> Enviar mensagem de template
            </DialogTitle>
            <DialogDescription className="text-sm">
              A janela de 24h expirou — só um template aprovado na Meta chega ao cliente agora.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
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
                <div className="shrink-0 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Buscar template..."
                      className="h-10 pl-9 text-sm"
                    />
                  </div>
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
                        <span className="block truncate font-mono text-sm font-semibold">{t.name}</span>
                        <span className={`block text-xs ${t.id === selectedId ? 'opacity-75' : 'text-gray-400'}`}>
                          {t.language} · {t.bodyVars ? `${t.bodyVars} variável(is)` : 'sem variável'}
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

                  {(preview || headerPreview) && (
                    <div>
                      <span className="mb-1.5 block text-sm font-semibold text-gray-600 dark:text-zinc-300">Prévia</span>
                      <div className="rounded-xl bg-gray-100 p-3 dark:bg-zinc-900/60">
                        <div className="rounded-xl rounded-tl-sm bg-emerald-50 p-3 dark:bg-emerald-950/30">
                          {headerPreview && (
                            <p className="mb-1 whitespace-pre-wrap text-sm font-bold leading-snug text-gray-900 dark:text-zinc-50">
                              {headerPreview}
                            </p>
                          )}
                          {preview && (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-zinc-100">
                              {preview}
                            </p>
                          )}
                          {selected?.footerText && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">{selected.footerText}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 dark:border-zinc-800">
                  <button
                    onClick={() => setManageOpen(true)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-zinc-300"
                  >
                    <Settings2 className="h-4 w-4" /> Gerenciar
                  </button>
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
    </>
  );
}
