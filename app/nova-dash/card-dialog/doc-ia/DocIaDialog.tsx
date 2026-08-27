/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Gerador de Documento (IA) — dialog pessoal do Samuel (trava hardcoded em
// doc-ia-access.ts; o botão só aparece pra quem está na lista).
//
// Fluxo: insere um .docx com tags ({{tag}} ou [[tag]]) → os campos são
// preenchidos com os dados do card → tags {{IA}} viram blocos de geração por
// prompt sobre os documentos do card (com rodadas de ajuste antes de aceitar)
// → ao inserir o arquivo roda a checagem automática data do acidente × início
// do benefício (Declaração de Benefício, ±20 dias) × lesão → saída em DOCX/PDF,
// inclusive nas versões DIGITALIZADAS (efeito de scanner).
//
// O painel direito traz os dados do card e os documentos com preview inline —
// dá pra conferir tudo sem sair do dialog.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/app/_shared/ui/dialog";
import { Button } from "@/app/_shared/ui/button";
import {
  AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2,
  RefreshCw, Sparkles, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { downloadFileFromS3 } from "@/app/_actions/documents/download-s3";
import { brDateVars } from "@/app/_shared/utils/date-br";
import type { ExtendedKanbanCard } from "../types";
import {
  buildScannedDocx, buildScannedPdf, downloadBlob, fillTemplate,
  isIaTag, readTemplate, renderScannedPages, type DelimiterStyle,
} from "./scan-utils";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  card: ExtendedKanbanCard;
  cardId: string;
  isProcess: boolean;
}

interface DocRow {
  id: string;
  key: string;
  name: string;
  category?: string | null;
}

interface ChatTurn { role: "user" | "assistant"; text: string; }

interface IaFieldState {
  prompt: string;
  docIds: string[];
  history: ChatTurn[];
  text: string;
  adjust: string;
  generating: boolean;
}

interface VerifyResult {
  status: "ok" | "atencao" | "sem_dados";
  data_acidente_card?: string;
  data_acidente_docs?: string;
  data_inicio_beneficio?: string;
  diff_dias?: number | null;
  lesao_card?: string;
  lesao_docs?: string;
  lesao_confere?: boolean | null;
  alertas?: string[];
  parecer?: string;
  usedFiles?: string[];
}

// Filtros rápidos dos 5 grupos de documentos usados no resumo.
const DOC_QUICK_FILTERS: { label: string; re: RegExp }[] = [
  { label: "CAT", re: /\bcat\b|comunica[cç][aã]o.*acidente/i },
  { label: "Declaração", re: /declara|benef[ií]|cnis|concess|carta/i },
  { label: "Laudos", re: /laudo|prontu[aá]|exame/i },
  { label: "BO", re: /\bb\.?o\.?\b|boletim|ocorr[eê]nc/i },
  { label: "Doc. médico", re: /atestado|m[eé]dic|receit|cirurg/i },
];

const DEFAULT_IA_PROMPT =
  "Quero que você funcione como um assistente especializado em modelagem, utilizando exclusivamente as informações fornecidas na conversa e nos documentos anexados.";

function previewKind(name: string): "image" | "pdf" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return null;
}

/** Todos os campos do card viram variável (mesma filosofia do getVars das automações). */
function cardVars(card: ExtendedKanbanCard): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(card as Record<string, any>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number") vars[k.toLowerCase()] = String(v);
  }
  vars.name = card.title ?? "";
  vars.nome = vars.name;
  vars.observacao = vars.observacao ?? vars.obs ?? "";
  for (const [k, v] of Object.entries(brDateVars())) vars[k.toLowerCase()] = v;
  return vars;
}

const CARD_SUMMARY_FIELDS: [keyof ExtendedKanbanCard | "title", string][] = [
  ["title", "Nome"], ["cpf", "CPF"], ["rg", "RG"], ["data_nasc", "Nascimento"],
  ["telefone", "Telefone"], ["data_acidente", "Data do acidente"], ["lesoes", "Lesões"],
  ["hospital", "Hospital"], ["profissao", "Profissão"], ["service", "Serviço"],
  ["cidade", "Cidade"], ["estado", "UF"],
];

// ─── Componente ─────────────────────────────────────────────────────────────

export function DocIaDialog({ open, onClose, card, cardId, isProcess }: Props) {
  const [template, setTemplate] = useState<{ bytes: ArrayBuffer; name: string } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [styles, setStyles] = useState<DelimiterStyle[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [iaFields, setIaFields] = useState<Record<string, IaFieldState>>({});
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [preview, setPreview] = useState<{ url: string; kind: "image" | "pdf"; name: string } | null>(null);
  const [verify, setVerify] = useState<{ loading: boolean; result: VerifyResult | null; error: string | null }>({ loading: false, result: null, error: null });
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalTags = useMemo(() => tags.filter((t) => !isIaTag(t)), [tags]);
  const iaTags = useMemo(() => tags.filter(isIaTag), [tags]);

  // Documentos do card (mesma rota da aba Arquivos).
  useEffect(() => {
    if (!open) return;
    const param = isProcess ? `processId=${cardId}` : `userId=${cardId}`;
    fetch(`/api/documents?${param}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao listar documentos"))))
      .then((list: DocRow[]) => setDocs(list))
      .catch(() => toast.error("Não foi possível carregar os documentos do card."));
  }, [open, cardId, isProcess]);

  // ── Inserção do template ──────────────────────────────────────────────────

  const runVerify = useCallback(async () => {
    setVerify({ loading: true, result: null, error: null });
    try {
      const res = await fetch("/api/doc-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "verify", cardId, isProcess }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha na checagem");
      setVerify({ loading: false, result: data, error: null });
    } catch (err: any) {
      setVerify({ loading: false, result: null, error: err.message });
    }
  }, [cardId, isProcess]);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Envie um arquivo .docx");
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const info = readTemplate(bytes);
      if (info.tags.length === 0) {
        toast.warning("Nenhuma tag encontrada no arquivo — confira se usou {{tag}} ou [[tag]].");
      }
      const vars = cardVars(card);
      const initial: Record<string, string> = {};
      const initialIa: Record<string, IaFieldState> = {};
      // Pré-seleção dos 5 grupos que entram no resumo (CAT, declaração,
      // laudos, BO, doc médico) — dá pra ajustar depois nos checkboxes.
      const defaultDocIds = docs
        .filter((d) => DOC_QUICK_FILTERS.some((qf) => qf.re.test(d.name)))
        .map((d) => d.id);
      for (const tag of info.tags) {
        if (isIaTag(tag)) {
          initialIa[tag] = {
            prompt: DEFAULT_IA_PROMPT,
            docIds: defaultDocIds,
            history: [],
            text: "",
            adjust: "",
            generating: false,
          };
        } else {
          initial[tag] = vars[tag.toLowerCase()] ?? "";
        }
      }
      setTemplate({ bytes, name: file.name });
      setTags(info.tags);
      setStyles(info.styles);
      setValues(initial);
      setIaFields(initialIa);
      // Checagem automática de datas assim que o docx entra.
      runVerify();
    } catch (err: any) {
      console.error(err);
      toast.error("Não foi possível ler o .docx: " + (err?.message ?? "erro desconhecido"));
    }
  }

  function resetTemplate() {
    setTemplate(null);
    setTags([]);
    setValues({});
    setIaFields({});
    setVerify({ loading: false, result: null, error: null });
  }

  // ── Geração por IA ────────────────────────────────────────────────────────

  async function generateIa(tag: string, isAdjust: boolean) {
    const field = iaFields[tag];
    if (!field) return;
    if (!field.prompt.trim()) { toast.error("Escreva o prompt da geração."); return; }
    if (field.docIds.length === 0 && !isAdjust) {
      toast.warning("Nenhum documento selecionado — a IA vai usar só os dados do card.");
    }

    let history: ChatTurn[] = [];
    if (isAdjust) {
      if (!field.adjust.trim()) { toast.error("Escreva o ajuste que você quer."); return; }
      // O texto atual (possivelmente editado à mão) vira a última resposta da IA.
      const prior = field.history.slice(0, -1);
      history = [
        ...prior,
        { role: "assistant", text: field.text },
        { role: "user", text: field.adjust.trim() },
      ];
    }

    setIaFields((p) => ({ ...p, [tag]: { ...p[tag], generating: true } }));
    try {
      const res = await fetch("/api/doc-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "generate", cardId, isProcess,
          docIds: field.docIds, prompt: field.prompt, history,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha na geração");
      if (data.skipped?.length) {
        toast.warning(`Arquivos ignorados (formato/tamanho): ${data.skipped.join(", ")}`);
      }
      setIaFields((p) => ({
        ...p,
        [tag]: {
          ...p[tag],
          text: data.text,
          history: [...history, { role: "assistant", text: data.text }],
          adjust: "",
          generating: false,
        },
      }));
      toast.success(`Texto de {{${tag}}} ${isAdjust ? "ajustado" : "gerado"} — revise e edite se precisar.`);
    } catch (err: any) {
      setIaFields((p) => ({ ...p, [tag]: { ...p[tag], generating: false } }));
      toast.error(err.message);
    }
  }

  // ── Preview de documento (painel direito) ─────────────────────────────────

  async function openPreview(doc: DocRow) {
    const kind = previewKind(doc.name);
    if (!kind) { toast.warning("Sem preview para este formato — baixe pelo card."); return; }
    const res = await downloadFileFromS3(doc.key, doc.name, true);
    if (!res.success || !res.presignedUrl) { toast.error("Falha ao abrir o documento."); return; }
    setPreview({ url: res.presignedUrl, kind, name: doc.name });
  }

  // ── Saídas ────────────────────────────────────────────────────────────────

  function allValues(): Record<string, string> {
    const merged: Record<string, string> = { ...values };
    for (const [tag, f] of Object.entries(iaFields)) merged[tag] = f.text;
    return merged;
  }

  function checkIaFilled(): boolean {
    const empty = iaTags.filter((t) => !iaFields[t]?.text.trim());
    if (empty.length) {
      toast.error(`Gere o texto das tags de IA antes: ${empty.map((t) => `{{${t}}}`).join(", ")}`);
      return false;
    }
    return true;
  }

  function outName(ext: string, scanned = false): string {
    const client = (card.title ?? "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
    const base = (template?.name ?? "documento").replace(/\.docx$/i, "");
    return `${client}_${base}${scanned ? "_digitalizado" : ""}.${ext}`;
  }

  async function toPdf(docxBlob: Blob): Promise<ArrayBuffer> {
    const res = await fetch("/api/doc-ia/convert", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: docxBlob,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Falha na conversão para PDF");
    }
    return res.arrayBuffer();
  }

  async function handleDownload(kind: "docx" | "pdf" | "pdf_scan" | "docx_scan") {
    if (!template || downloading) return;
    if (!checkIaFilled()) return;
    setDownloading(kind);
    try {
      const filled = fillTemplate(template.bytes, allValues(), styles);
      if (kind === "docx") {
        downloadBlob(filled, outName("docx"));
      } else {
        const pdfBytes = await toPdf(filled);
        if (kind === "pdf") {
          downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), outName("pdf"));
        } else {
          const pages = await renderScannedPages(pdfBytes);
          if (kind === "pdf_scan") {
            downloadBlob(await buildScannedPdf(pages), outName("pdf", true));
          } else {
            downloadBlob(buildScannedDocx(pages, outName("docx", true)), outName("docx", true));
          }
        }
      }
      toast.success("Documento gerado!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Falha ao gerar o documento.");
    } finally {
      setDownloading(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const v = verify.result;
  const verifyTone =
    v?.status === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : v?.status === "atencao" ? "border-amber-300 bg-amber-50 text-amber-900"
    : "border-slate-300 bg-slate-50 text-slate-700";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[94vh] flex flex-col overflow-hidden p-4" autoFocus={false}>
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Gerador de Documento (IA) — {card.title}
          </DialogTitle>
          <DialogDescription>
            Insira um .docx com tags ({"{{tag}}"} ou [[tag]]); a tag {"{{IA}}"} gera texto por prompt sobre os documentos do card.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 overflow-hidden min-h-0">
          {/* ══ Coluna esquerda: template + campos + saídas ══ */}
          <div className="overflow-y-auto pr-1 space-y-4 min-h-0">
            {/* Template */}
            {!template ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-violet-300 rounded-xl flex flex-col items-center justify-center gap-2 text-violet-700 hover:bg-violet-50 transition-colors"
              >
                <Upload className="h-8 w-8" />
                <span className="font-semibold">Inserir modelo .docx</span>
                <span className="text-xs text-muted-foreground">
                  Tags {"{{nome}}"}, {"{{cpf}}"}, [[data_acidente]]… e {"{{IA}}"} para texto gerado por prompt
                </span>
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-lg border bg-violet-50/60 border-violet-200 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-violet-600" />
                  <span className="font-medium">{template.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {tags.length} tag(s) · {iaTags.length} de IA
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={resetTemplate}>
                  <X className="h-4 w-4 mr-1" /> Trocar
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            {/* Checagem automática de datas */}
            {template && (
              <div className={`rounded-lg border px-3 py-2.5 text-sm ${verify.error ? "border-red-300 bg-red-50 text-red-900" : verifyTone}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    {verify.loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Cruzando data do acidente × Declaração de Benefício × laudos…</>
                    ) : verify.error ? (
                      <><AlertTriangle className="h-4 w-4" /> Checagem falhou: {verify.error}</>
                    ) : v?.status === "ok" ? (
                      <><CheckCircle2 className="h-4 w-4" /> Datas compatíveis</>
                    ) : v?.status === "atencao" ? (
                      <><AlertTriangle className="h-4 w-4" /> Atenção nas datas</>
                    ) : (
                      <><AlertTriangle className="h-4 w-4" /> Sem dados suficientes para o cruzamento</>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={runVerify} disabled={verify.loading} title="Reverificar">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {v && !verify.loading && (
                  <div className="mt-1.5 space-y-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs">
                      <span>Acidente (card): <b>{v.data_acidente_card || "—"}</b></span>
                      <span>Acidente (docs): <b>{v.data_acidente_docs || "—"}</b></span>
                      <span>Início benefício: <b>{v.data_inicio_beneficio || "—"}</b></span>
                      {typeof v.diff_dias === "number" && <span>Diferença: <b>{v.diff_dias} dia(s)</b> (esperado ~20)</span>}
                      {v.lesao_confere !== null && v.lesao_confere !== undefined && (
                        <span>Lesão confere: <b>{v.lesao_confere ? "sim" : "NÃO"}</b></span>
                      )}
                    </div>
                    {(v.alertas ?? []).map((a, i) => (
                      <div key={i} className="text-xs flex gap-1"><span>⚠️</span><span>{a}</span></div>
                    ))}
                    {v.parecer && <p className="text-xs opacity-90">{v.parecer}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Campos normais */}
            {template && normalTags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Campos do documento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {normalTags.map((tag) => (
                    <label key={tag} className="text-xs">
                      <span className="font-medium text-muted-foreground">{`{{${tag}}}`}</span>
                      {(values[tag] ?? "").length > 60 ? (
                        <textarea
                          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm min-h-[64px]"
                          value={values[tag] ?? ""}
                          onChange={(e) => setValues((p) => ({ ...p, [tag]: e.target.value }))}
                        />
                      ) : (
                        <input
                          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                          value={values[tag] ?? ""}
                          onChange={(e) => setValues((p) => ({ ...p, [tag]: e.target.value }))}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Campos de IA */}
            {iaTags.map((tag) => {
              const f = iaFields[tag];
              if (!f) return null;
              return (
                <div key={tag} className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    <h3 className="text-sm font-semibold">{`{{${tag}}}`} — texto gerado por IA</h3>
                  </div>

                  {/* Seleção de documentos */}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Documentos:</span>
                      {DOC_QUICK_FILTERS.map((qf) => (
                        <button
                          key={qf.label}
                          className="text-[11px] rounded-full border border-violet-300 px-2 py-0.5 hover:bg-violet-100"
                          onClick={() => {
                            const ids = docs.filter((d) => qf.re.test(d.name)).map((d) => d.id);
                            if (!ids.length) { toast.info(`Nenhum arquivo bate com "${qf.label}".`); return; }
                            setIaFields((p) => ({
                              ...p,
                              [tag]: { ...p[tag], docIds: [...new Set([...p[tag].docIds, ...ids])] },
                            }));
                          }}
                        >
                          + {qf.label}
                        </button>
                      ))}
                      <button
                        className="text-[11px] rounded-full border px-2 py-0.5 hover:bg-slate-100"
                        onClick={() => setIaFields((p) => ({ ...p, [tag]: { ...p[tag], docIds: docs.map((d) => d.id) } }))}
                      >
                        Todos
                      </button>
                      <button
                        className="text-[11px] rounded-full border px-2 py-0.5 hover:bg-slate-100"
                        onClick={() => setIaFields((p) => ({ ...p, [tag]: { ...p[tag], docIds: [] } }))}
                      >
                        Nenhum
                      </button>
                    </div>
                    <div className="max-h-28 overflow-y-auto rounded-md border bg-white px-2 py-1.5 space-y-0.5">
                      {docs.length === 0 && <p className="text-xs text-muted-foreground">Card sem documentos.</p>}
                      {docs.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={f.docIds.includes(d.id)}
                            onChange={(e) => {
                              setIaFields((p) => ({
                                ...p,
                                [tag]: {
                                  ...p[tag],
                                  docIds: e.target.checked
                                    ? [...p[tag].docIds, d.id]
                                    : p[tag].docIds.filter((x) => x !== d.id),
                                },
                              }));
                            }}
                          />
                          <span className="truncate flex-1">{d.name}</span>
                          <button
                            className="text-violet-600 hover:text-violet-800 shrink-0"
                            title="Ver documento"
                            onClick={(e) => { e.preventDefault(); openPreview(d); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Prompt */}
                  <label className="block text-xs">
                    <span className="font-medium text-muted-foreground">Prompt</span>
                    <textarea
                      className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm min-h-[64px]"
                      value={f.prompt}
                      onChange={(e) => setIaFields((p) => ({ ...p, [tag]: { ...p[tag], prompt: e.target.value } }))}
                    />
                  </label>

                  <Button
                    size="sm"
                    onClick={() => generateIa(tag, false)}
                    disabled={f.generating}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {f.generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                    {f.text ? "Gerar de novo" : "Gerar com IA"}
                  </Button>

                  {/* Resultado + ajuste interativo */}
                  {f.text && (
                    <>
                      <label className="block text-xs">
                        <span className="font-medium text-muted-foreground">
                          Texto gerado (edite à vontade — é o que entra no documento)
                        </span>
                        <textarea
                          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm min-h-[140px] bg-white"
                          value={f.text}
                          onChange={(e) => setIaFields((p) => ({ ...p, [tag]: { ...p[tag], text: e.target.value } }))}
                        />
                      </label>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 rounded-md border px-2 py-1.5 text-sm"
                          placeholder='Pedir ajuste à IA (ex.: "cite a data do benefício", "mais curto")'
                          value={f.adjust}
                          onChange={(e) => setIaFields((p) => ({ ...p, [tag]: { ...p[tag], adjust: e.target.value } }))}
                          onKeyDown={(e) => { if (e.key === "Enter" && !f.generating) generateIa(tag, true); }}
                        />
                        <Button size="sm" variant="outline" onClick={() => generateIa(tag, true)} disabled={f.generating}>
                          {f.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajustar"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Saídas */}
            {template && (
              <div className="rounded-xl border p-3 space-y-2 sticky bottom-0 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Download className="h-4 w-4" /> Gerar documento
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDownload("docx")} disabled={!!downloading}>
                    {downloading === "docx" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} DOCX
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDownload("pdf")} disabled={!!downloading}>
                    {downloading === "pdf" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} PDF
                  </Button>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => handleDownload("pdf_scan")} disabled={!!downloading}>
                    {downloading === "pdf_scan" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} PDF digitalizado
                  </Button>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => handleDownload("docx_scan")} disabled={!!downloading}>
                    {downloading === "docx_scan" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} DOCX digitalizado
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Digitalizado = com efeito de scanner (leve rotação, ruído e tom de papel), página a página.
                </p>
              </div>
            )}
          </div>

          {/* ══ Coluna direita: dados do card + documentos + preview ══ */}
          <div className="overflow-y-auto space-y-3 min-h-0 border-l pl-4 max-lg:border-l-0 max-lg:pl-0">
            <div>
              <h3 className="text-sm font-semibold mb-1.5">Dados do card</h3>
              <div className="rounded-lg border bg-slate-50 px-3 py-2 grid grid-cols-1 gap-y-0.5 text-xs">
                {CARD_SUMMARY_FIELDS.map(([field, label]) => {
                  const val = (card as any)[field];
                  if (!val) return null;
                  return (
                    <div key={String(field)} className="flex gap-1.5">
                      <span className="text-muted-foreground shrink-0">{label}:</span>
                      <span className="font-medium break-words">{String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1.5">Documentos ({docs.length})</h3>
              <div className="space-y-1 max-h-[30vh] overflow-y-auto pr-1">
                {docs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openPreview(d)}
                    className="w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-left hover:bg-violet-50 hover:border-violet-200 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate flex-1">{d.name}</span>
                    <Eye className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  </button>
                ))}
                {docs.length === 0 && <p className="text-xs text-muted-foreground">Nenhum documento no card.</p>}
              </div>
            </div>

            {preview && (
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between bg-slate-100 px-2 py-1">
                  <span className="text-xs font-medium truncate">{preview.name}</span>
                  <button onClick={() => setPreview(null)} className="text-slate-500 hover:text-slate-800">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {preview.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt={preview.name} className="w-full max-h-[48vh] object-contain bg-slate-50" />
                ) : (
                  <iframe src={preview.url} title={preview.name} className="w-full h-[48vh] bg-slate-50" />
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
