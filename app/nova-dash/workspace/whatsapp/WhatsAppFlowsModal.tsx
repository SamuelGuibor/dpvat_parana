/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, Plus, Trash2, Save, Workflow, Clock, ChevronUp, ChevronDown,
  FileText, Image as ImageIcon, Video, Mic, File as FileIcon, Upload, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
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

interface EditingFlow { id?: string; name: string; description: string; steps: WhatsAppFlowStep[] }

const emptyStep = (kind: FlowStepKind = 'text', delayMs = 1000): WhatsAppFlowStep => ({
  kind, body: '', mediaKey: null, mediaType: null, fileName: null, delayMs,
});
const EMPTY: EditingFlow = { name: '', description: '', steps: [emptyStep('text', 0)] };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void; // avisa o composer pra recarregar a lista
}

export function WhatsAppFlowsModal({ open, onOpenChange, onChanged }: Props) {
  const [flows, setFlows] = useState<WhatsAppFlowDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingFlow>(EMPTY);

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
    if (open) { reload(); setEditing(EMPTY); }
  }, [open]);

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
    if (!window.confirm('Excluir este fluxo?')) return;
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
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl">
            <Workflow className="h-6 w-6 text-emerald-600" /> Fluxos de mensagens
          </DialogTitle>
          <DialogDescription className="text-base">
            Sequências prontas de texto, imagem, vídeo, áudio ou documento. O delay é a espera antes de cada passo.
            Dica: áudio <b>.ogg</b> chega como mensagem de voz no WhatsApp do cliente.
          </DialogDescription>
        </DialogHeader>

        {/* Fluxos existentes */}
        <div className="flex flex-wrap gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {!loading && flows.map((f) => (
            <span key={f.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-base font-semibold ${editing.id === f.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20' : 'border-gray-200 text-gray-600 dark:border-zinc-700 dark:text-zinc-300'}`}>
              <button onClick={() => setEditing({ id: f.id, name: f.name, description: f.description ?? '', steps: f.steps.length ? f.steps.map((s) => ({ ...s })) : [emptyStep('text', 0)] })}>
                {f.name} <span className="text-gray-400">({f.steps.length})</span>
              </button>
              <button onClick={() => handleDelete(f.id)} title="Excluir fluxo" className="text-gray-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setEditing(EMPTY)}
            className={`flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-base font-semibold ${!editing.id ? 'border-emerald-500 text-emerald-700' : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-zinc-700 dark:text-zinc-400'}`}
          >
            <Plus className="h-4 w-4" /> Novo fluxo
          </button>
        </div>

        {/* Editor */}
        <div className="space-y-3 rounded-xl border border-gray-100 p-3 dark:border-zinc-800">
          <label className="block">
            <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Nome do fluxo</span>
            <Input value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Boas-vindas" className="h-11 text-base" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">
              Descrição <span className="font-normal text-gray-400">(quando o bot deve usar este fluxo)</span>
            </span>
            <textarea
              value={editing.description}
              onChange={(e) => setEditing((f) => ({ ...f, description: e.target.value }))}
              placeholder="Ex.: Enviar quando o cliente cadastrado pergunta sobre a etapa de perícia médica do processo."
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white p-2.5 text-base outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span className="mt-1 block text-sm text-gray-400">
              A IA lê esta descrição para decidir, sozinha, se este fluxo se encaixa na situação do cliente. Sem descrição, o bot não dispara o fluxo automaticamente.
            </span>
          </label>

          <div className="space-y-2">
            {editing.steps.map((step, idx) => (
              <StepCard
                key={idx}
                step={step}
                index={idx}
                total={editing.steps.length}
                onChange={(patch) => setStep(idx, patch)}
                onMove={(dir) => moveStep(idx, dir)}
                onRemove={() => setEditing((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))}
              />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => setEditing((f) => ({ ...f, steps: [...f.steps, emptyStep('text', f.steps.length ? 1000 : 0)] }))}
            className="text-base"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar passo
          </Button>
        </div>

        <DialogFooter>
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

        {/* Delay */}
        {index > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400">
            <Clock className="h-4 w-4" />
            <Input
              type="number" min={0} max={120} step={0.5}
              value={step.delayMs / 1000}
              onChange={(e) => onChange({ delayMs: Math.round(Number(e.target.value) * 1000) })}
              className="h-8 w-20 px-2 text-base"
            />
            s antes
          </span>
        )}

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
