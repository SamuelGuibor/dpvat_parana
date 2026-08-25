/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/app/nova-dash/_components/dropzone';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Separator } from '@/app/_shared/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/_shared/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/app/_shared/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import {
  Download, Loader2, Trash, FileArchive, Eye, FileText, GripVertical,
  Trash2, ArchiveRestore, Clock, Folder, ArrowLeft, ChevronRight, FolderInput,
} from 'lucide-react';
import { CiEdit } from 'react-icons/ci';
import { toast } from 'sonner';
import { getPresignedUrls } from '@/app/_actions/documents/upload-s3';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { updateDocumentName } from '@/app/_actions/documents/update-name-doc';
import { deletDoc } from '@/app/_actions/documents/delete-document';
import { listTrashedDocs, restoreDoc, purgeDoc, type TrashedDocDTO } from '@/app/_actions/documents/trash';
import { DeleteConfirmDialog } from '@/app/nova-dash/card-dialog/DeleteConfirmDialog';
import { AdminChecklist } from './AdminChecklist';
import {
  DOCUMENT_CATEGORIES, DEFAULT_DOCUMENT_CATEGORY, categoryLabel,
  isDocumentCategory, type DocumentCategoryId,
} from '@/app/_shared/lib/document-categories';
import type { FileWithBase64 } from './types';

interface Props {
  cardId: string;
  isProcess: boolean;
  ownerId?: string;
}

interface Doc { id: string; key: string; name: string; category?: string | null; }

// Valor do seletor "Tipo de documento" no upload: AUTO deixa cada arquivo cair
// na pasta que o nome indicar (inferCategory no servidor).
const AUTO_CATEGORY = 'AUTO';

function getExt(key: string) {
  const dot = key.lastIndexOf('.');
  return dot !== -1 ? key.slice(dot) : '';
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

// Só imagens e PDF podem ser exibidos direto no navegador; os demais tipos
// (docx, xlsx, zip...) não têm pré-visualização nativa.
function previewKind(key: string): 'image' | 'pdf' | null {
  const ext = getExt(key).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  return null;
}

// Linha arrastável da tabela: o useSortable precisa rodar uma vez por item,
// então a <tr> vira componente próprio. O handle (attributes/listeners) sai
// por render prop para o JSX das células continuar dentro do FilesTab —
// assim só o grip inicia o arrasto e os demais botões seguem clicáveis.
function SortableRow({ id, children }: {
  id: string;
  children: (handle: { attributes: any; listeners: any }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // Enquanto arrasta: meio transparente + sombra + z-index pra linha
      // "flutuar" por cima das vizinhas durante a troca de posição.
      className={`hover:bg-gray-50 dark:hover:bg-zinc-800 ${isDragging ? 'relative z-10 opacity-60 shadow-lg bg-gray-50' : ''}`}
    >
      {children({ attributes, listeners })}
    </tr>
  );
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function FilesTab({ cardId, isProcess, ownerId }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [base64Files, setBase64Files] = useState<FileWithBase64[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [deletingDoc, setDeletingDoc] = useState<Doc | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  // Navegação estilo Google Drive: null = tela das pastas; com valor = dentro
  // da pasta, mostrando só os arquivos daquela categoria.
  const [openFolder, setOpenFolder] = useState<DocumentCategoryId | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>(AUTO_CATEGORY);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Lixeira (30 dias): itens excluídos ficam restauráveis antes da purga.
  const [trash, setTrash] = useState<TrashedDocDTO[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);
  const [purgingDoc, setPurgingDoc] = useState<TrashedDocDTO | null>(null);

  // Pré-visualização de anexos (evita baixar cada arquivo só para conferir).
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => { loadDocs(); loadTrash(); }, [cardId, isProcess]);

  // Entrar numa pasta já deixa o upload apontado pra ela (sair volta ao AUTO).
  useEffect(() => {
    setUploadCategory(openFolder ?? AUTO_CATEGORY);
  }, [openFolder]);

  // Um balde por categoria; anexo sem categoria (ou com valor desconhecido)
  // cai em OUTROS pra nunca sumir da tela.
  const docsByCategory = useMemo(() => {
    const map = new Map<DocumentCategoryId, Doc[]>(
      DOCUMENT_CATEGORIES.map((c) => [c.id, [] as Doc[]]),
    );
    for (const doc of docs) {
      const id = isDocumentCategory(doc.category) ? doc.category : DEFAULT_DOCUMENT_CATEGORY;
      map.get(id)!.push(doc);
    }
    return map;
  }, [docs]);

  // Lista mostrada na tabela: só os arquivos da pasta aberta.
  const visibleDocs = openFolder ? docsByCategory.get(openFolder) ?? [] : [];

  async function loadTrash() {
    try {
      setTrash(await listTrashedDocs(cardId, isProcess));
    } catch (err) {
      console.error(err); // lixeira é acessório — não bloqueia a aba
    }
  }

  async function loadDocs() {
    try {
      const params = new URLSearchParams();
      if (isProcess) params.set('processId', cardId);
      else params.set('userId', cardId);
      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) throw new Error('Erro ao buscar documentos');
      setDocs(await res.json());
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar documentos.');
    }
  }

  async function handleDrop(accepted: File[]) {
    try {
      const filesB64 = await Promise.all(
        accepted.map(async (f) => ({ name: f.name, type: f.type, base64: await fileToBase64(f) }))
      );
      setFiles((p) => [...p, ...accepted]);
      setBase64Files((p) => [...p, ...filesB64]);
    } catch (err) {
      console.error(err);
      setError('Erro ao processar arquivos.');
    }
  }

  async function uploadFiles() {
    if (!cardId) return toast.error('ID não fornecido.');
    if (base64Files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const fileInfos = base64Files.map((f) => ({ name: f.name, type: f.type }));
      const response = await getPresignedUrls(fileInfos, cardId, isProcess);
      if (!response.success || !response.presignedUrls) {
        throw new Error(response.error || 'Erro ao obter URLs pré-assinadas');
      }

      const uploaded = await Promise.all(
        response.presignedUrls.map(async ({ fileName, url, key }) => {
          const file = base64Files.find((f) => f.name === fileName);
          if (!file) return null;
          const base64Data = file.base64.split(',')[1];
          const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: file.type });
          const res = await fetch(url, {
            method: 'PUT',
            body: blob,
            headers: {
              'Content-Type': file.type,
            },
          });
          if (!res.ok) throw new Error(`Erro ao enviar ${fileName}`);
          return { key, name: fileName };
        })
      );

      const valid = uploaded.filter(Boolean) as { key: string; name: string }[];

      // Pasta do lote: escolha explícita do seletor vale pra todos; em AUTO o
      // servidor decide arquivo a arquivo pelo nome.
      const chosen = uploadCategory === AUTO_CATEGORY ? undefined : uploadCategory;

      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: ownerId,
          processId: isProcess ? cardId : null,
          documents: valid.map((v) => ({ ...v, category: chosen })),
        }),
      });

      await loadDocs();
      setFiles([]);
      setBase64Files([]);
      // Leva pra pasta onde os arquivos acabaram de cair (Drive faz o mesmo).
      if (chosen && isDocumentCategory(chosen)) setOpenFolder(chosen);
      toast.success('Upload concluído.');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao fazer upload: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(key: string, fileName: string) {
    try {
      setDownloading(key);
      const res = await downloadFileFromS3(key, fileName);
      if (!res.success || !res.presignedUrl) throw new Error(res.error);
      window.location.href = res.presignedUrl;
    } catch (err: any) {
      toast.error('Erro ao baixar: ' + err.message);
    } finally {
      setDownloading(null);
    }
  }

  async function openPreview(doc: Doc) {
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const res = await downloadFileFromS3(doc.key, doc.name, true);
      if (!res.success || !res.presignedUrl) throw new Error(res.error);
      setPreviewUrl(res.presignedUrl);
    } catch (err: any) {
      toast.error('Erro ao pré-visualizar: ' + err.message);
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownloadAll() {
    try {
      setDownloadingAll(true);
      const params = new URLSearchParams();
      if (isProcess) params.set('processId', cardId);
      else params.set('userId', cardId);

      const res = await fetch(`/api/documents/download-all?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao gerar o zip');
      }

      const blob = await res.blob();
      const failed = Number(res.headers.get('X-Failed-Count') || '0');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Tenta usar o filename do header; senão um nome padrão.
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      link.download = match?.[1] || 'documentos.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      if (failed > 0) {
        toast.warning(`Zip gerado, mas ${failed} arquivo(s) não puderam ser baixados.`);
      } else {
        toast.success('Download iniciado.');
      }
    } catch (err: any) {
      toast.error('Erro ao baixar todos: ' + err.message);
    } finally {
      setDownloadingAll(false);
    }
  }

  async function saveName(id: string) {
    try {
      setSavingId(id);
      const updated = await updateDocumentName({ id, newName: editedName });
      // Atualiza key e name para refletir o rename no S3
      setDocs((p) => p.map((d) => (d.id === id ? { ...d, name: updated.name, key: updated.key } : d)));
      toast.success('Arquivo renomeado.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao renomear');
    } finally {
      setSavingId(null);
      setEditingId(null);
    }
  }

  // Sensores do arrastar e soltar: distance 5 evita que um clique simples
  // (abrir, baixar, editar) dispare arrasto sem querer; teclado mantém a
  // reordenação acessível (espaço pega, setas movem, espaço solta).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Solta o arquivo na nova posição e persiste a ordem completa (mesmo
  // endpoint das antigas setas). Otimista: reordena o estado na hora;
  // se a persistência falhar, recarrega do servidor pra desfazer.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // A reordenação acontece DENTRO da pasta aberta: os índices salvos valem
    // só entre os arquivos daquela categoria (empate com outra pasta não
    // importa, porque as listas nunca se misturam na tela).
    const oldIndex = visibleDocs.findIndex((d) => d.id === active.id);
    const newIndex = visibleDocs.findIndex((d) => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(visibleDocs, oldIndex, newIndex);
    // Reinsere a pasta reordenada no lugar dela dentro da lista completa.
    const queue = [...next];
    const merged = docs.map((d) =>
      next.some((n) => n.id === d.id) ? queue.shift()! : d,
    );
    setDocs(merged);
    try {
      const res = await fetch('/api/documents/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: next.map((d) => d.id) }),
      });
      if (!res.ok) throw new Error('Erro ao salvar a ordem');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar a ordem dos arquivos.');
      await loadDocs();
    }
  }

  // Mover de pasta: muda a categoria do anexo (organização real, não só nome).
  async function moveDoc(doc: Doc, category: DocumentCategoryId) {
    const current = isDocumentCategory(doc.category) ? doc.category : DEFAULT_DOCUMENT_CATEGORY;
    if (current === category) return;
    setMovingId(doc.id);
    // Otimista: o arquivo já sai da pasta aberta; se falhar, recarrega.
    setDocs((p) => p.map((d) => (d.id === doc.id ? { ...d, category } : d)));
    try {
      const res = await fetch('/api/documents/category', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, category }),
      });
      if (!res.ok) throw new Error('Erro ao mover');
      toast.success(`Movido para ${categoryLabel(category)}.`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao mover o arquivo de pasta.');
      await loadDocs();
    } finally {
      setMovingId(null);
    }
  }

  async function confirmDeleteDoc() {
    if (!deletingDoc) return;
    try {
      await deletDoc(deletingDoc.id);
      setDocs((p) => p.filter((d) => d.id !== deletingDoc.id));
      toast.success('Movido para a lixeira — restaurável por 30 dias.');
      await loadTrash();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao deletar.');
    } finally {
      setDeletingDoc(null);
    }
  }

  async function handleRestore(doc: TrashedDocDTO) {
    try {
      setTrashBusyId(doc.id);
      await restoreDoc(doc.id);
      setTrash((p) => p.filter((d) => d.id !== doc.id));
      await loadDocs();
      toast.success('Documento restaurado.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao restaurar.');
    } finally {
      setTrashBusyId(null);
    }
  }

  async function confirmPurgeDoc() {
    if (!purgingDoc) return;
    try {
      setTrashBusyId(purgingDoc.id);
      await purgeDoc(purgingDoc.id);
      setTrash((p) => p.filter((d) => d.id !== purgingDoc.id));
      toast.success('Documento excluído definitivamente.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir de vez.');
    } finally {
      setTrashBusyId(null);
      setPurgingDoc(null);
    }
  }

  return (
    <div className="space-y-4 px-1">
      <Dropzone onDrop={handleDrop} src={files} onError={console.error} className="w-full">
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>

      {files.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {/* Tipo de documento = pasta de destino. Definido ANTES de enviar,
              para o arquivo já nascer no lugar certo. */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Tipo de documento</Label>
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="h-9 w-72">
                <SelectValue placeholder="Escolha a pasta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_CATEGORY}>Detectar pelo nome (automático)</SelectItem>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Azul explícito (padrão das ações principais do painel): o
              variant default é quase preto e some no modo escuro. */}
          <Button
            onClick={uploadFiles}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar {files.length} arquivo{files.length > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Separator />

      {/* Checklist Previdenciário: fica entre a área de upload e a lista de
          anexos, para conferir a documentação sem sair da aba Arquivos. */}
      {cardId && (
        <AdminChecklist cardId={cardId} isProcess={isProcess} title="Checklist Previdenciário" />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {openFolder ? (
            // Trilha de navegação: "Arquivos › PASTA", com voltar (Drive).
            <div className="flex min-w-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-gray-500"
                onClick={() => setOpenFolder(null)}
                title="Voltar para as pastas"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
              <button
                type="button"
                onClick={() => setOpenFolder(null)}
                className="text-sm text-gray-500 hover:underline dark:text-zinc-400"
              >
                Arquivos
              </button>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span className="truncate text-sm font-medium">
                {categoryLabel(openFolder)} ({visibleDocs.length})
              </span>
            </div>
          ) : (
            <Label>Pastas de Documentos ({docs.length} arquivo{docs.length === 1 ? '' : 's'})</Label>
          )}
          <div className="flex items-center gap-2">
            {trash.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTrashOpen(true)}
                className="h-8 text-gray-500"
                title="Documentos excluídos — restauráveis por 30 dias"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Lixeira ({trash.length})
              </Button>
            )}
            {docs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                className="h-8"
              >
                {downloadingAll ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileArchive className="w-4 h-4 mr-2" />
                )}
                Baixar todos (.zip)
              </Button>
            )}
          </div>
        </div>
        {!openFolder ? (
          // Tela inicial: as pastas, como no Drive — abre com clique duplo.
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Clique duas vezes na pasta para abrir.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DOCUMENT_CATEGORIES.map((cat) => {
                const count = docsByCategory.get(cat.id)?.length ?? 0;
                // OUTROS é a sobra: só aparece quando tem algo dentro.
                if (cat.id === 'OUTROS' && count === 0) return null;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onDoubleClick={() => setOpenFolder(cat.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenFolder(cat.id);
                      }
                    }}
                    title="Clique duas vezes para abrir"
                    className="flex select-none items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-zinc-800 dark:hover:border-zinc-600"
                  >
                    <Folder
                      className={`h-8 w-8 shrink-0 ${count > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-zinc-600'}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">
                        {count} arquivo{count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : visibleDocs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-zinc-400 border-2 border-dashed rounded-lg">
            Nenhum documento nesta pasta
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Reordenação por arrastar e soltar: restrito ao eixo vertical e
                ao corpo da tabela pra linha não "escapar" do quadro. */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Nome do Arquivo</th>
                  <th className="text-right p-3 font-medium w-32">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <SortableContext items={visibleDocs.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                {visibleDocs.map((doc) => (
                  <SortableRow key={doc.id} id={doc.id}>
                  {({ attributes, listeners }) => (<>
                    <td className="p-3">
                      {editingId === doc.id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center flex-1 gap-0">
                            <Input
                              value={editedName}
                              onChange={(e) => setEditedName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && savingId !== doc.id) saveName(doc.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-8 text-sm rounded-r-none border-r-0 flex-1"
                              autoFocus
                              placeholder="Nome do arquivo"
                            />
                            <span className="h-8 px-2 flex items-center text-xs text-gray-500 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-r-md border-l-0 whitespace-nowrap">
                              {getExt(doc.key) || '.docx'}
                            </span>
                          </div>
                          <Button size="sm" onClick={() => saveName(doc.id)} disabled={savingId === doc.id}>
                            {savingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <span className="block truncate max-w-md">{doc.name}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {editingId !== doc.id && (
                        <div className="flex items-center justify-end gap-1">
                          {/* Handle de arrasto: só ele inicia a reordenação
                              (touch-none evita o scroll roubar o gesto no touch). */}
                          <button
                            type="button"
                            {...attributes}
                            {...listeners}
                            className="h-8 w-6 mr-1 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                            title="Arrastar para reordenar"
                            aria-label="Arrastar para reordenar"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => {
                              setEditingId(doc.id);
                              const ext = getExt(doc.key);
                              // Remove a extensão do campo para o usuário editar apenas o nome
                              setEditedName(ext && doc.name.toLowerCase().endsWith(ext.toLowerCase()) ? doc.name.slice(0, -ext.length) : doc.name);
                            }}>
                            <CiEdit className="h-4 w-4" />
                          </Button>
                          {previewKind(doc.key) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Pré-visualizar"
                              onClick={() => openPreview(doc)} disabled={previewLoading && previewDoc?.id === doc.id}>
                              {previewLoading && previewDoc?.id === doc.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Eye className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Baixar"
                            onClick={() => handleDownload(doc.key, doc.name)} disabled={downloading === doc.key}>
                            {downloading === doc.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                          {/* Mover de pasta: mesma ideia do "Organizar" do Drive. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Mover para outra pasta"
                                disabled={movingId === doc.id}>
                                {movingId === doc.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <FolderInput className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Mover para</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {DOCUMENT_CATEGORIES.map((cat) => (
                                <DropdownMenuItem
                                  key={cat.id}
                                  disabled={cat.id === openFolder}
                                  onSelect={() => moveDoc(doc, cat.id)}
                                >
                                  <Folder className="mr-2 h-4 w-4 text-amber-500" />
                                  {cat.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => setDeletingDoc(doc)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </>)}
                  </SortableRow>
                ))}
                </SortableContext>
              </tbody>
            </table>
            </DndContext>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={!!deletingDoc}
        onOpenChange={(o) => !o && setDeletingDoc(null)}
        title={`Excluir "${deletingDoc?.name}"?`}
        description="O documento vai para a lixeira e pode ser restaurado em até 30 dias. Depois disso é excluído de vez."
        onConfirm={confirmDeleteDoc}
      />

      <DeleteConfirmDialog
        open={!!purgingDoc}
        onOpenChange={(o) => !o && setPurgingDoc(null)}
        title={`Excluir "${purgingDoc?.name}" DE VEZ?`}
        description="O arquivo será apagado do armazenamento e não tem como recuperar. Essa ação é irreversível."
        onConfirm={confirmPurgeDoc}
      />

      {/* Lixeira — como a galeria do celular: 30 dias pra restaurar. */}
      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-gray-500" />
              Lixeira ({trash.length})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 dark:text-zinc-400 -mt-1">
            Documentos excluídos ficam aqui por 30 dias. Depois disso são apagados
            automaticamente e não têm como ser recuperados.
          </p>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {trash.length === 0 ? (
              <div className="text-center py-10 text-gray-500 dark:text-zinc-400">
                A lixeira está vazia.
              </div>
            ) : (
              <ul className="divide-y border rounded-lg overflow-hidden">
                {trash.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-800">
                    <FileText className="w-5 h-5 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.name}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">
                        Excluído em {new Date(doc.deletedAt).toLocaleDateString('pt-BR')}
                        {doc.deletedBy ? ` por ${doc.deletedBy}` : ''}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        doc.daysLeft <= 5
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                      title="Dias até a exclusão automática"
                    >
                      <Clock className="w-3 h-3" />
                      {doc.daysLeft === 0 ? 'expira hoje' : `${doc.daysLeft}d`}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => handleRestore(doc)}
                      disabled={trashBusyId === doc.id}
                    >
                      {trashBusyId === doc.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <ArchiveRestore className="w-4 h-4 mr-1" />}
                      Restaurar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                      title="Excluir de vez (irreversível)"
                      onClick={() => setPurgingDoc(doc)}
                      disabled={trashBusyId === doc.id}
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewDoc} onOpenChange={(o) => { if (!o) { setPreviewDoc(null); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 pr-8 truncate">
              <FileText className="w-4 h-4 shrink-0 text-gray-500" />
              <span className="truncate">{previewDoc?.name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 bg-gray-100 dark:bg-zinc-950 flex items-center justify-center overflow-auto">
            {previewLoading || !previewUrl ? (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            ) : previewDoc && previewKind(previewDoc.key) === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={previewDoc.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <iframe src={previewUrl} title={previewDoc?.name} className="w-full h-full border-0" />
            )}
          </div>

          {previewDoc && (
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <Button variant="outline" size="sm" onClick={() => handleDownload(previewDoc.key, previewDoc.name)}>
                <Download className="w-4 h-4 mr-2" />
                Baixar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}