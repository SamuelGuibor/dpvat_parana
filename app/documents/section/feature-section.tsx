/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import {
  Loader2,
  FileText,
  FileImage,
  FileArchive,
  File as FileIcon,
  FolderOpen,
  Inbox,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/_components/ui/dialog"
import { downloadFileFromS3 } from "@/app/_actions/downloadS3"

interface ProcessInfo {
  id: string
  service: string | null
  type: string | null
  cardNumber: number | null
}

interface Document {
  id: string
  key: string
  name: string
  processId: string | null
  process: ProcessInfo | null
}

// ─── Helpers de arquivo ───────────────────────────────────────────────────────

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]

function getExt(key: string) {
  const dot = key.lastIndexOf(".")
  return dot !== -1 ? key.slice(dot).toLowerCase() : ""
}

// Só imagens e PDF podem ser exibidos no navegador. Como o cliente não pode
// baixar, os demais tipos ficam sem pré-visualização.
function previewKind(key: string): "image" | "pdf" | null {
  const ext = getExt(key)
  if (IMAGE_EXTS.includes(ext)) return "image"
  if (ext === ".pdf") return "pdf"
  return null
}

function fileIcon(key: string) {
  const ext = getExt(key)
  if (IMAGE_EXTS.includes(ext)) return FileImage
  if (ext === ".pdf") return FileText
  if ([".zip", ".rar", ".7z"].includes(ext)) return FileArchive
  if ([".doc", ".docx", ".txt", ".odt"].includes(ext)) return FileText
  return FileIcon
}

function processLabel(p: ProcessInfo | null): string {
  if (!p) return "Documentos gerais"
  const base = p.service || p.type || "Processo"
  return p.cardNumber ? `${base} · Nº ${p.cardNumber}` : base
}

// ─── Card de documento ────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onPreview,
  loading,
}: {
  doc: Document
  onPreview: (doc: Document) => void
  loading: boolean
}) {
  const Icon = fileIcon(doc.key)
  const canPreview = previewKind(doc.key) !== null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-md sm:p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:h-12 sm:w-12">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 sm:text-[15px]">
          {doc.name}
        </p>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {getExt(doc.key).replace(".", "") || "arquivo"}
        </p>
      </div>
    </div>
  )
}

// ─── Seção principal ──────────────────────────────────────────────────────────

export function FeatureSection() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { data: session, status } = useSession()

  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const userId = session?.user?.id

  useEffect(() => {
    async function fetchUserDocuments() {
      if (!userId) {
        setError("Usuário não autenticado.")
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        const response = await fetch(`/api/documents?userId=${userId}`)
        if (!response.ok) throw new Error("Erro ao buscar documentos")
        const docs = await response.json()
        setDocuments(docs)
      } catch (err) {
        console.error("Erro ao buscar documentos:", err)
        setError("Não foi possível carregar os documentos.")
      } finally {
        setLoading(false)
      }
    }

    if (status === "authenticated" && userId) {
      fetchUserDocuments()
    } else if (status === "unauthenticated") {
      setError("Por favor, faça login para ver seus documentos.")
      setLoading(false)
    }
  }, [userId, status])

  // Agrupa os documentos: gerais (sem processo) + um grupo por processo.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; docs: Document[] }>()
    for (const doc of documents) {
      const groupKey = doc.processId ?? "__general__"
      if (!map.has(groupKey)) {
        map.set(groupKey, { label: processLabel(doc.process), docs: [] })
      }
      map.get(groupKey)!.docs.push(doc)
    }
    // "Documentos gerais" sempre primeiro, depois os processos.
    return Array.from(map.entries())
      .sort(([a], [b]) => (a === "__general__" ? -1 : b === "__general__" ? 1 : 0))
      .map(([, value]) => value)
  }, [documents])

  async function openPreview(doc: Document) {
    setPreviewDoc(doc)
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const res = await downloadFileFromS3(doc.key, doc.name, true)
      if (!res.success || !res.presignedUrl) throw new Error(res.error)
      setPreviewUrl(res.presignedUrl)
    } catch (err) {
      console.error("Erro ao pré-visualizar:", err)
      setPreviewDoc(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
        <Inbox className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Nenhum documento anexado
        </p>
        <p className="mt-1 max-w-xs text-xs text-slate-400">
          Assim que a nossa equipe anexar documentos ao seu processo, eles
          aparecerão aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-8">
      {groups.map((group, gi) => (
        <section key={group.label + gi}>
          <div className="mb-3 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {group.docs.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onPreview={openPreview}
                loading={previewLoading && previewDoc?.id === doc.id}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Modal de visualização (somente leitura, sem download) */}
      <Dialog
        open={!!previewDoc}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewDoc(null)
            setPreviewUrl(null)
          }
        }}
      >
        <DialogContent className="flex h-[85vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-4 pb-3 pt-4 sm:px-5">
            <DialogTitle className="flex items-center gap-2 truncate pr-8 text-sm sm:text-base">
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{previewDoc?.name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100">
            {previewLoading || !previewUrl ? (
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            ) : previewDoc && previewKind(previewDoc.key) === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={previewDoc.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <iframe
                src={previewUrl}
                title={previewDoc?.name}
                className="h-full w-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
