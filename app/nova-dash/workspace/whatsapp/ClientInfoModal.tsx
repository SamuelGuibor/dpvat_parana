/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, UserRoundPlus, Save, BadgeCheck, FilePen, Upload, FileText, Trash2, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  getClientInfo, saveClientInfo, addClientFromConversation,
  type ClientInfoFields, type ClientInfoResult,
} from '@/app/_actions/whatsapp/client-info';
import {
  listClientDocuments, getClientDocumentUploadUrl, confirmClientDocumentUpload, deleteClientDocument,
  type ClientDocumentDTO,
} from '@/app/_actions/whatsapp/client-documents';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';

// Ficha do cliente aberta pelo cabeçalho da conversa. Se o telefone já bate
// com um cadastro, lê/edita o User direto; senão os campos ficam salvos como
// rascunho da conversa até o "Adicionar cliente".

const FIELD_GROUPS: { title: string; fields: { key: keyof ClientInfoFields; label: string; placeholder?: string }[] }[] = [
  {
    title: 'Dados pessoais',
    fields: [
      { key: 'name', label: 'Nome completo' },
      { key: 'cpf', label: 'CPF' },
      { key: 'rg', label: 'RG' },
      { key: 'data_nasc', label: 'Data de nascimento', placeholder: 'dd/mm/aaaa' },
      { key: 'estado_civil', label: 'Estado civil' },
      { key: 'profissao', label: 'Profissão' },
      { key: 'nome_mae', label: 'Nome da mãe' },
      { key: 'email', label: 'E-mail' },
    ],
  },
  {
    title: 'Endereço',
    fields: [
      { key: 'rua', label: 'Rua' },
      { key: 'numero', label: 'Número' },
      { key: 'bairro', label: 'Bairro' },
      { key: 'cep', label: 'CEP' },
      { key: 'cidade', label: 'Cidade' },
      { key: 'estado', label: 'Estado' },
    ],
  },
  {
    title: 'Acidente',
    fields: [
      { key: 'data_acidente', label: 'Data do acidente', placeholder: 'dd/mm/aaaa' },
      { key: 'hospital', label: 'Hospital' },
      { key: 'lesoes', label: 'Lesões' },
      { key: 'obs', label: 'Observações' },
    ],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactLabel: string;
}

export function ClientInfoModal({ open, onOpenChange, contactId, contactLabel }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<ClientInfoResult | null>(null);
  const [fields, setFields] = useState<ClientInfoFields>({});

  const [docs, setDocs] = useState<ClientDocumentDTO[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  function reloadDocs() {
    setDocsLoading(true);
    listClientDocuments(contactId)
      .then(setDocs)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Falha ao carregar documentos.'))
      .finally(() => setDocsLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setInfo(null);
    getClientInfo(contactId)
      .then((res) => {
        setInfo(res);
        setFields(res.fields);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Falha ao carregar a ficha.');
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
    reloadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId, onOpenChange]);

  async function uploadDocs(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const mime = file.type || 'application/octet-stream';
        const { url, key } = await getClientDocumentUploadUrl(contactId, file.name, mime);
        const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': mime } });
        if (!put.ok) throw new Error(`Falha ao subir "${file.name}".`);
        await confirmClientDocumentUpload(contactId, key, file.name);
      }
      reloadDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao subir documento.');
    } finally {
      setUploading(false);
    }
  }

  async function openDoc(doc: ClientDocumentDTO) {
    const res = await downloadFileFromS3(doc.key, doc.name, true);
    if (res.success && res.presignedUrl) window.open(res.presignedUrl, '_blank');
    else toast.error('Não foi possível abrir o documento.');
  }

  async function removeDoc(doc: ClientDocumentDTO) {
    if (!window.confirm(`Excluir "${doc.name}"?`)) return;
    try {
      setDocs(await deleteClientDocument(contactId, doc.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  function setField(key: keyof ClientInfoFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function run(fn: () => Promise<ClientInfoResult>, okMsg: string) {
    setSaving(true);
    try {
      const res = await fn();
      setInfo(res);
      setFields(res.fields);
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const registered = info?.registered ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {registered ? <BadgeCheck className="h-5 w-5 text-emerald-600" /> : <FilePen className="h-5 w-5 text-amber-500" />}
            Ficha do cliente — {contactLabel}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? 'Carregando...'
              : registered
                ? `Cliente cadastrado${info?.cardNumber ? ` (cartão nº ${info.cardNumber})` : ''}. Alterações salvam direto no cadastro.`
                : 'Sem cadastro para este telefone. Os campos ficam salvos nesta conversa até você adicionar o cliente.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {FIELD_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">{group.title}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {group.fields.map((f) => (
                    <label key={f.key} className="block">
                      <span className="mb-1 block text-sm font-semibold text-gray-500 dark:text-zinc-400">{f.label}</span>
                      <Input
                        value={fields[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className="h-9"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {/* Documentos pessoais */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Documentos</p>
                <input
                  ref={docInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { uploadDocs(e.target.files); e.target.value = ''; }}
                />
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => docInputRef.current?.click()} className="h-7 text-sm">
                  {uploading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Upload className="mr-1.5 h-3 w-3" />}
                  Enviar documento
                </Button>
              </div>

              {docsLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              {!docsLoading && docs.length === 0 && (
                <p className="text-sm text-gray-400">Nenhum documento anexado ainda.</p>
              )}
              {!docsLoading && docs.length > 0 && (
                <div className="space-y-1.5">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-base dark:border-zinc-800">
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                      <button onClick={() => openDoc(doc)} className="min-w-0 flex-1 truncate text-left hover:underline">
                        {doc.name}
                      </button>
                      <button onClick={() => openDoc(doc)} title="Baixar" className="text-gray-400 hover:text-emerald-600">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeDoc(doc)} title="Excluir" className="text-gray-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!loading && !registered && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => run(() => addClientFromConversation(contactId, fields), 'Cliente adicionado ao sistema.')}
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <UserRoundPlus className="mr-2 h-4 w-4" /> Adicionar cliente
            </Button>
          )}
          {!loading && (
            <Button
              disabled={saving}
              onClick={() => run(
                () => saveClientInfo(contactId, fields),
                registered ? 'Cadastro atualizado.' : 'Rascunho salvo nesta conversa.',
              )}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {registered ? 'Salvar alterações' : 'Salvar rascunho'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
