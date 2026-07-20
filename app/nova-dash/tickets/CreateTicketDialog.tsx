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
import { TYPE_META } from './constants';

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  function pickPhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Anexe apenas imagens (JPEG, PNG, WEBP ou GIF).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('A imagem excede o limite de 10MB.');
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    if (photoRef.current) photoRef.current.value = '';
  }

  function resetForm() {
    setType('BUG');
    setTitle('');
    setDescription('');
    removePhoto();
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
      let imageKey: string | null = null;
      let imageName: string | null = null;

      if (photo) {
        const presign = await getTicketImageUploadUrl({
          name: photo.name,
          type: photo.type,
          size: photo.size,
        });
        if (!presign.success || !presign.url || !presign.key) {
          throw new Error(presign.error ?? 'Falha ao preparar o upload da imagem.');
        }
        const res = await fetch(presign.url, {
          method: 'PUT',
          body: photo,
          headers: { 'Content-Type': photo.type },
        });
        if (!res.ok) throw new Error('Erro ao enviar a imagem.');
        imageKey = presign.key;
        imageName = photo.name;
      }

      await createDevTicket({ title, description, type, imageKey, imageName });

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
              <ImagePlus className="w-3.5 h-3.5" /> Foto / Print (opcional)
            </span>
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            />
            {photoPreview ? (
              <div className="relative rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Prévia da imagem" className="w-full max-h-56 object-contain bg-gray-50 dark:bg-zinc-950/50" />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  title="Remover imagem"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <p className="px-3 py-2 text-[11px] text-gray-500 dark:text-zinc-400 truncate border-t border-gray-100 dark:border-zinc-800">
                  {photo?.name}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="w-full h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs font-medium">Clique para anexar um print (até 10MB)</span>
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
            {saving ? 'Criando…' : 'Criar Ticket'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
