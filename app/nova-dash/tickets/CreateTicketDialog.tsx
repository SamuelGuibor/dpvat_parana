/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel,
} from '@/app/_shared/ui/alert-dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Textarea } from '@/app/_shared/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/_shared/ui/select';
import { Ticket, Type, AlignLeft, Tag, ImagePlus, X, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createDevTicket, getTicketImageUploadUrl } from '@/app/_actions/dev-tickets/ticket-actions';
import { MAX_TICKET_IMAGES, TYPE_META } from './constants';

const fieldLabel =
  'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
const inputClasses =
  'w-full rounded-xl border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50';

interface Props {
  onCreated: () => void;
}

export function CreateTicketDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('BUG');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Cada foto carrega sua própria object URL de prévia — revogada ao remover.
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  function pickPhotos(files: FileList | null) {
    if (!files?.length) return;

    const accepted: { file: File; preview: string }[] = [];
    let free = MAX_TICKET_IMAGES - photos.length;

    for (const file of Array.from(files)) {
      if (free <= 0) {
        toast.error(`Máximo de ${MAX_TICKET_IMAGES} fotos por ticket.`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}": anexe apenas imagens (JPEG, PNG, WEBP ou GIF).`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" excede o limite de 10MB.`);
        continue;
      }
      accepted.push({ file, preview: URL.createObjectURL(file) });
      free--;
    }

    if (accepted.length) setPhotos((prev) => [...prev, ...accepted]);
    // Zera o input para permitir reescolher o mesmo arquivo depois.
    if (photoRef.current) photoRef.current.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearPhotos() {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
    if (photoRef.current) photoRef.current.value = '';
  }

  function resetForm() {
    setType('BUG');
    setTitle('');
    setDescription('');
    clearPhotos();
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error('Informe o título do ticket.');
      return;
    }
    if (!description.trim()) {
      toast.error('Descreva o problema ou a alteração.');
      return;
    }

    setSaving(true);
    try {
      // Cada foto sobe direto ao S3 por presigned PUT (o body da Vercel tem
      // limite de 4.5MB); só as chaves resultantes vão para a server action.
      const images: { key: string; name: string }[] = [];

      for (const { file } of photos) {
        const presign = await getTicketImageUploadUrl({
          name: file.name,
          type: file.type,
          size: file.size,
        });
        if (!presign.success || !presign.url || !presign.key) {
          throw new Error(presign.error ?? `Falha ao preparar o upload de "${file.name}".`);
        }
        const res = await fetch(presign.url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!res.ok) throw new Error(`Erro ao enviar "${file.name}".`);
        images.push({ key: presign.key, name: file.name });
      }

      await createDevTicket({ title, description, type, images });

      toast.success('Ticket criado! Ele entrou na fila de distribuição.');
      resetForm();
      setOpen(false);
      onCreated();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? 'Erro ao criar o ticket.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
      <AlertDialogTrigger asChild>
        <Button className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Novo Ticket
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[100vw] sm:max-w-lg md:max-w-xl max-h-[90vh] overflow-hidden rounded-3xl p-0 gap-0 border-none">
        {/* Cabeçalho com destaque */}
        <AlertDialogHeader className="space-y-0 p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-left">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Ticket className="w-5 h-5 text-white" />
            </div>
            <div>
              <AlertDialogTitle className="text-white text-lg font-black leading-tight">
                Novo Ticket para os Devs
              </AlertDialogTitle>
              <AlertDialogDescription className="text-blue-100 text-xs">
                Reporte um bug ou peça uma alteração no site. O ticket entra em distribuição até um dev assumir.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-190px)]">
          <div>
            <span className={fieldLabel}>
              <Tag className="w-3.5 h-3.5" /> Tipo
            </span>
            <Select onValueChange={setType} value={type}>
              <SelectTrigger className={`h-11 ${inputClasses}`}>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <span className={fieldLabel}>
              <Type className="w-3.5 h-3.5" /> Título
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Ex: Botão de download não funciona na aba Arquivos"
              className={`h-11 ${inputClasses}`}
            />
          </div>

          <div>
            <span className={fieldLabel}>
              <AlignLeft className="w-3.5 h-3.5" /> Descrição
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Descreva o que acontece, onde acontece e, se possível, o passo a passo para reproduzir…"
              className={`resize-none ${inputClasses}`}
            />
          </div>

          <div>
            <span className={fieldLabel}>
              <ImagePlus className="w-3.5 h-3.5" /> Fotos / Prints (opcional)
              {photos.length > 0 && (
                <span className="ml-1 normal-case tracking-normal font-medium text-gray-400">
                  {photos.length}/{MAX_TICKET_IMAGES}
                </span>
              )}
            </span>
            <input
              ref={photoRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => pickPhotos(e.target.files)}
            />

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {photos.map((p, i) => (
                  <div
                    key={p.preview}
                    className="relative rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden"
                    title={p.file.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.preview}
                      alt={`Prévia de ${p.file.name}`}
                      className="w-full h-24 object-cover bg-gray-50 dark:bg-zinc-950/50"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                      title="Remover imagem"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < MAX_TICKET_IMAGES && (
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className={`w-full rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors ${
                  photos.length > 0 ? 'h-14' : 'h-24'
                }`}
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs font-medium">
                  {photos.length > 0
                    ? 'Adicionar mais fotos'
                    : `Clique para anexar prints (até ${MAX_TICKET_IMAGES} imagens, 10MB cada)`}
                </span>
              </button>
            )}
          </div>
        </div>

        <AlertDialogFooter className="flex-row gap-3 p-6 pt-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40">
          <AlertDialogCancel className="rounded-xl h-11 mt-0" disabled={saving}>
            Cancelar
          </AlertDialogCancel>
          <Button
            onClick={handleCreate}
            disabled={saving || !title.trim() || !description.trim()}
            className="rounded-xl h-11 bg-blue-600 hover:bg-blue-700"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {saving ? (photos.length ? 'Enviando fotos…' : 'Criando…') : 'Criar Ticket'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
