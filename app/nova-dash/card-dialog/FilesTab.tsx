/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/app/nova-dash/_components/dropzone';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Separator } from '@/app/_shared/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Download, Loader2, Trash, FileArchive, Eye, FileText } from 'lucide-react';
import { CiEdit } from 'react-icons/ci';
import { toast } from 'sonner';
import { getPresignedUrls } from '@/app/_actions/documents/upload-s3';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { updateDocumentName } from '@/app/_actions/documents/update-name-doc';
import { deletDoc } from '@/app/_actions/documents/delete-document';
import { DeleteConfirmDialog } from '@/app/nova-dash/card-dialog/DeleteConfirmDialog';
import { AdminChecklist } from './AdminChecklist';
import type { FileWithBase64 } from './types';

interface Props {
  cardId: string;
  isProcess: boolean;
  ownerId?: string;
}

interface Doc { id: string; key: string; name: string; }

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

  // Pré-visualização de anexos (evita baixar cada arquivo só para conferir).
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => { loadDocs(); }, [cardId, isProcess]);

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

      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: ownerId,
          processId: isProcess ? cardId : null,
          documents: valid,
        }),
      });

      await loadDocs();
      setFiles([]);
      setBase64Files([]);
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

  async function confirmDeleteDoc() {
    if (!deletingDoc) return;
    try {
      await deletDoc(deletingDoc.id);
      setDocs((p) => p.filter((d) => d.id !== deletingDoc.id));
      toast.success('Documento deletado.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao deletar.');
    } finally {
      setDeletingDoc(null);
    }
  }

  return (
    <div className="space-y-4 px-1">
      <Dropzone onDrop={handleDrop} src={files} onError={console.error} className="w-full">
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>

      {files.length > 0 && (
        <Button onClick={uploadFiles} disabled={uploading}>
          {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Enviar {files.length} arquivo{files.length > 1 ? 's' : ''}
        </Button>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Separator />

      {/* Checklist Previdenciário: fica entre a área de upload e a lista de
          anexos, para conferir a documentação sem sair da aba Arquivos. */}
      {cardId && (
        <AdminChecklist cardId={cardId} isProcess={isProcess} title="Checklist Previdenciário" />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Arquivos Anexados ({docs.length})</Label>
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
        {docs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-zinc-400 border-2 border-dashed rounded-lg">
            Nenhum documento encontrado
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Nome do Arquivo</th>
                  <th className="text-right p-3 font-medium w-32">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800">
                    <td className="p-3">
                      {editingId === doc.id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center flex-1 gap-0">
                            <Input
                              value={editedName}
                              onChange={(e) => setEditedName(e.target.value)}
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => setDeletingDoc(doc)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={!!deletingDoc}
        onOpenChange={(o) => !o && setDeletingDoc(null)}
        title={`Deletar "${deletingDoc?.name}"?`}
        description="Tem certeza que deseja deletar? Essa ação é irreversível."
        onConfirm={confirmDeleteDoc}
      />

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