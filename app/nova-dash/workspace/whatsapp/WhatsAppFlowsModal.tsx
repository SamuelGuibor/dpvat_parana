/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, Plus, Trash2, Save, Workflow, Clock, ChevronUp, ChevronDown,
  FileText, Image as ImageIcon, Video, Mic, File as FileIcon, Upload, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppFlows, saveWhatsAppFlow, deleteWhatsAppFlow, getFlowMediaUploadUrl,
  type WhatsAppFlowDTO, type WhatsAppFlowStep, type FlowStepKind,
} from '@/app/_actions/whatsapp/flows';
import { checkFileForWhatsApp } from './media-rules';
import { listWhatsAppTags, type WhatsAppTagDTO } from '@/app/_actions/whatsapp/tags';
import { Tag, Check } from 'lucide-react';
import { Search, Copy } from 'lucide-react';

// Gerenciador dos fluxos de mensagens pré-setadas: sequência de passos de
// texto, imagem, vídeo, áudio ou documento, com delay antes de cada envio.
// Áudio .ogg (opus) chega como mensagem de voz no celular do cliente.

const KIND_META: Record<FlowStepKind, { label: string; icon: React.ElementType; accept: string }> = {
  text:     { label: 'Texto',     icon: FileText,  accept: '' },
  image:    { label: 'Imagem',    icon: ImageIcon, accept: 'image/*' },
  video:    { label: 'Vídeo',     icon: Video,     accept: 'video/*' },
  audio:    { label: 'Áudio',     icon: Mic,       accept: 'audio/*' },
  document: { label: 'Documento', icon: FileIcon,  accept: '*' },
};
const KINDS = Object.keys(KIND_META) as FlowStepKind[];

interface EditingFlow { id?: string; name: string; description: string; steps: WhatsAppFlowStep[]; tagIds: string[] }

const emptyStep = (kind: FlowStepKind = 'text', delayMs = 1000): WhatsAppFlowStep => ({
  kind, body: '', mediaKey: null, mediaType: null, fileName: null, delayMs,
});
const EMPTY: EditingFlow = { name: '', description: '', steps: [emptyStep('text', 0)], tagIds: [] };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void; // avisa o composer pra recarregar a lista
}

export function WhatsAppFlowsModal({ open, onOpenChange, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [flows, setFlows] = useState<WhatsAppFlowDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingFlow>(EMPTY);
  // Tags de conversa disponíveis (para etiquetar o contato no disparo do fluxo).
  const [allTags, setAllTags] = useState<WhatsAppTagDTO[]>([]);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const visibleFlows = q ? flows.filter((f) => f.name.toLowerCase().includes(q)) : flows;

  function selectFlow(f: WhatsAppFlowDTO) {
    setEditing({ id: f.id, name: f.name, description: f.description ?? '', steps: f.steps.length ? f.steps.map((s) => ({ ...s })) : [emptyStep('text', 0)], tagIds: f.tagIds ?? [] });
  }
  // Duplicar: vira um fluxo novo (sem id) já com os passos copiados.
  function duplicateFlow() {
    setEditing((f) => ({ ...f, id: undefined, name: `${f.name} (cópia)`, steps: f.steps.map((s) => ({ ...s })) }));
    toast.info('Cópia pronta — ajuste e clique em "Criar fluxo".');
  }

  async function reload() {
    setLoading(true);
    try {
      setFlows(await listWhatsAppFlows());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar fluxos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      reload();
      setEditing(EMPTY);
      listWhatsAppTags().then(setAllTags).catch(() => setAllTags([]));
    }
  }, [open]);

  function toggleTag(tagId: string) {
    setEditing((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((t) => t !== tagId) : [...f.tagIds, tagId],
    }));
  }

  function setStep(idx: number, patch: Partial<WhatsAppFlowStep>) {
    setEditing((f) => ({
      ...f,
      steps: f.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function moveStep(idx: number, dir: -1 | 1) {
    setEditing((f) => {
      const steps = [...f.steps];
      const j = idx + dir;
      if (j < 0 || j >= steps.length) return f;
      [steps[idx], steps[j]] = [steps[j], steps[idx]];
      return { ...f, steps };
    });
  }

  async function handleSave() {
    const incomplete = editing.steps.some((s) => s.kind !== 'text' && !s.mediaKey);
    if (incomplete) { toast.error('Há passo de mídia sem arquivo enviado.'); return; }
    setSaving(true);
    try {
      await saveWhatsAppFlow(editing);
      toast.success('Fluxo salvo.');
      setEditing(EMPTY);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar o fluxo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: 'Excluir fluxo',
      description: 'Os passos deste fluxo serão apagados. Essa ação não pode ser desfeita.',
    }))) return;
    try {
      await deleteWhatsAppFlow(id);
      toast.success('Fluxo excluído.');
      if (editing.id === id) setEditing(EMPTY);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {confirmDialog}
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl">
            <Workflow className="h-6 w-6 text-emerald-600" /> Fluxos de mensagens
          </DialogTitle>
          <DialogDescription className="text-base">
            Sequências prontas de texto, imagem, vídeo, áudio ou documento. Dica: áudio <b>.ogg</b> chega como mensagem de voz no WhatsApp do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[460px] gap-4 md:grid-cols-[220px_minmax(0,1fr)_230px]">
          {/* Coluna 1 — lista de fluxos */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar fluxo..." className="h-9 pl-8 text-sm" />
            </div>
            <button
              onClick={() => setEditing(EMPTY)}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm font-semibold ${!editing.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20' : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-zinc-700 dark:text-zinc-400'}`}
            >
              <Plus className="h-4 w-4" /> Novo fluxo
            </button>
            <div className="max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
              {loading && <p className="flex items-center gap-2 p-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
              {!loading && flows.length === 0 && <p className="p-2 text-sm text-gray-400">Nenhum fluxo criado ainda.</p>}
              {!loading && flows.length > 0 && visibleFlows.length === 0 && <p className="p-2 text-sm text-gray-400">Nenhum fluxo encontrado.</p>}
              {visibleFlows.map((f) => {
                const active = editing.id === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => selectFlow(f)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${active ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 hover:border-gray-300 dark:border-zinc-700'}`}
                  >
                    <span className="block truncate text-sm font-semibold">{f.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                      {f.steps.slice(0, 6).map((s, i) => {
                        const Icon = KIND_META[s.kind]?.icon ?? FileText;
                        return <Icon key={i} className="h-3 w-3" />;
                      })}
                      <span className="ml-1">{f.steps.length} {f.steps.length === 1 ? 'passo' : 'passos'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coluna 2 — editor */}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <Input value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do fluxo (ex.: Boas-vindas)" className="h-10 flex-1 text-base font-semibold" />
              {editing.id && (
                <>
                  <Button variant="outline" onClick={duplicateFlow} title="Duplicar fluxo"><Copy className="mr-1.5 h-4 w-4" /> Duplicar</Button>
                  <Button variant="outline" onClick={() => handleDelete(editing.id!)} title="Excluir fluxo" className="text-red-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-zinc-300">
                Quando usar <span className="font-normal text-gray-400">(a IA lê isto para decidir sozinha; sem descrição o bot não dispara)</span>
              </span>
              <textarea
                value={editing.description}
                onChange={(e) => setEditing((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Enviar quando o cliente cadastrado pergunta sobre a etapa de perícia médica."
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>

            <div>
              <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-zinc-300">
                <Tag className="h-4 w-4 text-emerald-600" /> Etiquetar contato ao disparar <span className="font-normal text-gray-400">(opcional)</span>
              </span>
              {allTags.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma tag de conversa criada ainda — crie em Tags, no inbox do WhatsApp.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => {
                    const active = editing.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors ${active ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}
                        style={active ? { background: t.color } : undefined}
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Linha do tempo: passos ligados por um trilho, com o delay entre eles */}
            <div>
              {editing.steps.map((step, idx) => (
                <div key={idx}>
                  {idx > 0 && (
                    <div className="ml-[13px] flex items-center gap-2 border-l border-gray-300 py-1.5 pl-5 dark:border-zinc-600">
                      <span className="flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-gray-500 dark:border-zinc-600 dark:text-zinc-400">
                        <Clock className="h-3.5 w-3.5" /> espera
                        <input
                          type="number" min={0} max={120} step={0.5}
                          value={step.delayMs / 1000}
                          onChange={(e) => setStep(idx, { delayMs: Math.round(Number(e.target.value) * 1000) })}
                          className="h-6 w-14 rounded border border-gray-200 bg-white px-1 text-center text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        s
                      </span>
                    </div>
                  )}
                  <StepCard
                    step={step}
                    index={idx}
                    total={editing.steps.length}
                    onChange={(patch) => setStep(idx, patch)}
                    onMove={(dir) => moveStep(idx, dir)}
                    onRemove={() => setEditing((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))}
                  />
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => setEditing((f) => ({ ...f, steps: [...f.steps, emptyStep('text', f.steps.length ? 1000 : 0)] }))}
              className="w-full border-dashed text-sm"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar passo
            </Button>
          </div>

          {/* Coluna 3 — como o cliente vê */}
          <div className="min-w-0 rounded-xl bg-gray-50 p-3 dark:bg-zinc-900/60">
            <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-zinc-400">Como o cliente vê</p>
            <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
              {editing.steps.map((s, i) => {
                const Icon = KIND_META[s.kind]?.icon ?? FileText;
                return (
                  <div key={i}>
                    {i > 0 && <p className="mb-1 text-center text-[11px] text-gray-400">{s.delayMs / 1000}s</p>}
                    <div className="rounded-xl rounded-bl-sm border border-gray-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                      {s.kind !== 'text' && (
                        <p className="flex items-center gap-1 text-gray-500 dark:text-zinc-400">
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{s.fileName ?? KIND_META[s.kind].label}</span>
                        </p>
                      )}
                      {s.kind !== 'audio' && s.body && <p className="whitespace-pre-wrap break-words">{s.body}</p>}
                      {s.kind === 'text' && !s.body && <p className="text-gray-400">(vazio)</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-base">Fechar</Button>
          <Button size="lg" onClick={handleSave} disabled={saving} className="bg-emerald-600 text-base hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
            {editing.id ? 'Salvar alterações' : 'Criar fluxo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepCard({
  step, index, total, onChange, onMove, onRemove,
}: {
  step: WhatsAppFlowStep; index: number; total: number;
  onChange: (patch: Partial<WhatsAppFlowStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = KIND_META[step.kind] ?? KIND_META.text;

  async function uploadMedia(file: File | null) {
    if (!file) return;
    const check = checkFileForWhatsApp(file);
    if (!check.ok) { toast.error(check.reason); return; }
    setUploading(true);
    try {
      const mime = check.mimeType;
      const { url, key } = await getFlowMediaUploadUrl(file.name, mime);
      const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': mime } });
      if (!put.ok) throw new Error('Falha ao subir o arquivo.');
      onChange({ mediaKey: key, mediaType: mime, fileName: file.name });
      toast.success(`"${file.name}" pronto.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3.5 dark:border-zinc-700 dark:bg-zinc-950/40">
      {/* Cabeçalho do passo: número, tipo, delay e controles */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{index + 1}</span>

        {/* Tipo do passo */}
        <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-700">
          {KINDS.map((k) => {
            const Icon = KIND_META[k].icon;
            const isActive = step.kind === k;
            return (
              <button
                key={k}
                title={KIND_META[k].label}
                onClick={() => onChange({ kind: k, ...(k === 'text' ? { mediaKey: null, mediaType: null, fileName: null } : {}) })}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors ${isActive ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{KIND_META[k].label}</span>
              </button>
            );
          })}
        </div>

        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => onMove(-1)} disabled={index === 0} title="Mover para cima" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-zinc-800">
            <ChevronUp className="h-5 w-5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} title="Mover para baixo" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-zinc-800">
            <ChevronDown className="h-5 w-5" />
          </button>
          {total > 1 && (
            <button onClick={onRemove} title="Remover passo" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-200 hover:text-red-500 dark:hover:bg-zinc-800">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </span>
      </div>

      {/* Mídia do passo */}
      {step.kind !== 'text' && (
        <div className="mb-2 flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={meta.accept || undefined}
            className="hidden"
            onChange={(e) => { uploadMedia(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-9 text-base">
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {step.mediaKey ? 'Trocar arquivo' : `Enviar ${meta.label.toLowerCase()}`}
          </Button>
          {step.mediaKey && (
            <span className="flex min-w-0 items-center gap-1.5 text-base text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{step.fileName}</span>
            </span>
          )}
        </div>
      )}

      {/* Texto / legenda */}
      {step.kind !== 'audio' && (
        <textarea
          value={step.body}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder={step.kind === 'text' ? `Mensagem do passo ${index + 1}... (*negrito* _itálico_)` : 'Legenda (opcional)...'}
          rows={step.kind === 'text' ? 2 : 1}
          className="w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-base outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      )}
    </div>
  );
}
