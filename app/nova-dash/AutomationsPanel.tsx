/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/app/_shared/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/_shared/ui/dialog";
import { Button } from "@/app/_shared/ui/button";
import { Input } from "@/app/_shared/ui/input";
import { Badge } from "@/app/_shared/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_shared/ui/select";
import {
  Plus,
  Trash2,
  Zap,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Upload,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { MentionsInput, Mention } from "react-mentions";
import useSWR from "swr";
import { mentionsStyles } from "./card-dialog/constants";

type MentionableUser = { id: string; display: string };
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Types ──────────────────────────────────────────────────────────────────

type Condition = {
  field: string;
  operator: string;
  value: string;
};

type Action = {
  type: "comment" | "file";
  templateText?: string;
  templateFileKey?: string;
  templateFileName?: string;
};

type AutomationData = {
  id: string;
  name: string;
  isActive: boolean;
  triggerLabelId: string;
  triggerLabel: { id: string; name: string; color: string };
  cardType: string;
  conditionLogic: string;
  conditions: Condition[];
  actions: Action[];
  createdAt: string;
};

interface Label {
  id: string;
  name: string;
  color: string;
}

interface AutomationsPanelProps {
  open: boolean;
  onClose: () => void;
  labels: Label[];
}

// ─── Field map ──────────────────────────────────────────────────────────────

const CARD_FIELDS: { value: string; label: string }[] = [
  { value: "name", label: "Nome" },
  { value: "cpf", label: "CPF" },
  { value: "data_nasc", label: "Data de Nascimento" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "rua", label: "Rua" },
  { value: "bairro", label: "Bairro" },
  { value: "numero", label: "Número" },
  { value: "cep", label: "CEP" },
  { value: "cidade", label: "Cidade" },
  { value: "estado", label: "Estado" },
  { value: "estado_civil", label: "Estado Civil" },
  { value: "profissao", label: "Profissão" },
  { value: "nacionalidade", label: "Nacionalidade" },
  { value: "rg", label: "RG" },
  { value: "nome_mae", label: "Nome da Mãe" },
  { value: "data_acidente", label: "Data do Acidente" },
  { value: "atendimento_via", label: "Atendimento Via" },
  { value: "hospital", label: "Hospital" },
  { value: "outro_hospital", label: "Outro Hospital" },
  { value: "lesoes", label: "Lesões" },
  { value: "service", label: "Serviço" },
  { value: "obs", label: "Observações" },
  { value: "status", label: "Status" },
  { value: "role", label: "Etapa atual" },
  { value: "nome_res", label: "Nome do Responsável" },
  { value: "cpf_res", label: "CPF do Responsável" },
  { value: "rg_res", label: "RG do Responsável" },
  { value: "estado_civil_res", label: "Estado Civil do Responsável" },
  { value: "profissao_res", label: "Profissão do Responsável" },
];

const OPERATORS = [
  { value: "equals", label: "é igual a" },
  { value: "notEquals", label: "é diferente de" },
  { value: "contains", label: "contém" },
  { value: "startsWith", label: "começa com" },
  { value: "endsWith", label: "termina com" },
  { value: "isEmpty", label: "está vazio" },
  { value: "isNotEmpty", label: "não está vazio" },
];

const VARIABLE_CHIPS = [
  "name", "cpf", "rg", "data_nasc", "telefone", "email",
  "cidade", "estado", "cep", "hospital", "data_acidente",
  "lesoes", "service", "nome_mae", "estado_civil", "profissao",
  "nacionalidade", "rua", "bairro", "numero", "cep"
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyCondition(): Condition {
  return { field: "hospital", operator: "equals", value: "" };
}

function emptyAction(): Action {
  return { type: "comment", templateText: "" };
}

function labelForField(val: string) {
  return CARD_FIELDS.find((f) => f.value === val)?.label ?? val;
}

function labelForOp(val: string) {
  return OPERATORS.find((o) => o.value === val)?.label ?? val;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Campos cujo valor deve ser escolhido a partir da lista de hospitais.
const HOSPITAL_FIELDS = new Set(["hospital", "outro_hospital"]);

function ConditionRow({
  cond,
  index,
  logic,
  total,
  onChange,
  onRemove,
  hospitals,
}: {
  cond: Condition;
  index: number;
  logic: string;
  total: number;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  hospitals: string[];
}) {
  const needsValue = !["isEmpty", "isNotEmpty"].includes(cond.operator);
  const isHospitalField = HOSPITAL_FIELDS.has(cond.field);
  // Garante que um valor já salvo apareça mesmo se sumir da lista (hospital removido).
  const hospitalOptions =
    cond.value && !hospitals.includes(cond.value)
      ? [cond.value, ...hospitals]
      : hospitals;
  return (
    <div className="flex items-start gap-2">
      {index > 0 && (
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-2.5 w-8 shrink-0">
          {logic}
        </span>
      )}
      {index === 0 && <div className="w-8 shrink-0" />}

      <div className="flex-1 flex flex-wrap gap-2 bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-2 border border-gray-100 dark:border-zinc-700">
        <Select
          value={cond.field}
          onValueChange={(v) => onChange({ ...cond, field: v })}
        >
          <SelectTrigger className="h-8 text-xs w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {CARD_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={cond.operator}
          onValueChange={(v) => onChange({ ...cond, operator: v })}
        >
          <SelectTrigger className="h-8 text-xs w-[155px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {needsValue && isHospitalField && (
          <Select
            value={cond.value}
            onValueChange={(v) => onChange({ ...cond, value: v })}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[100px]">
              <SelectValue placeholder="Selecionar hospital..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {hospitalOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-400">Nenhum hospital cadastrado</div>
              ) : (
                hospitalOptions.map((h) => (
                  <SelectItem key={h} value={h} className="text-xs">
                    {h}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}

        {needsValue && !isHospitalField && (
          <Input
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            placeholder="Valor..."
            className="h-8 text-xs flex-1 min-w-[100px]"
          />
        )}
      </div>

      <button
        onClick={onRemove}
        className="mt-2 text-gray-400 hover:text-red-500 transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ActionRow({
  action,
  index,
  onChange,
  onRemove,
  mentionUsers,
}: {
  action: Action;
  index: number;
  onChange: (a: Action) => void;
  onRemove: () => void;
  mentionUsers: MentionableUser[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function insertVar(varName: string) {
    const tpl = action.templateText ?? "";
    onChange({ ...action, templateText: tpl + `[[${varName}]]` });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/automations/upload-template", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Falha no upload");
      const data = await res.json();
      onChange({ ...action, templateFileKey: data.key, templateFileName: data.originalName });
      toast.success("Template enviado com sucesso");
    } catch {
      toast.error("Erro ao enviar template");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
            Ação {index + 1}
          </span>
          <Select
            value={action.type}
            onValueChange={(v: "comment" | "file") =>
              onChange({ type: v, templateText: "", templateFileKey: undefined, templateFileName: undefined })
            }
          >
            <SelectTrigger className="h-7 text-xs w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comment" className="text-xs">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" /> Adicionar Comentário
                </span>
              </SelectItem>
              <SelectItem value="file" className="text-xs">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Gerar Arquivo
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {action.type === "comment" && (
          <>
            <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-visible focus-within:ring-2 focus-within:ring-blue-500">
              <MentionsInput
                value={action.templateText ?? ""}
                onChange={(e: any) => onChange({ ...action, templateText: e.target.value })}
                placeholder="Escreva o texto... Use @ para mencionar e [[name]], [[cpf]] para variáveis"
                style={mentionsStyles}
              >
                <Mention
                  trigger="@"
                  data={mentionUsers}
                  markup="@[__display__](__id__)"
                  displayTransform={(_id: string, display: string) => `@${display}`}
                  renderSuggestion={(s: any) => (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
                        {s.display.charAt(0)}
                      </div>
                      <span className="font-semibold text-sm">{s.display}</span>
                    </div>
                  )}
                  appendSpaceOnAdd
                />
              </MentionsInput>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1.5">Variáveis disponíveis (clique para inserir):</p>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLE_CHIPS.map((v) => (
                  <button
                    key={v}
                    onClick={() => insertVar(v)}
                    className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors font-mono"
                  >
                    [[{v}]]
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {action.type === "file" && (
          <div className="space-y-2">
            {action.templateFileKey ? (
              <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    {action.templateFileName}.docx
                  </span>
                </div>
                <button
                  onClick={() => onChange({ ...action, templateFileKey: undefined, templateFileName: undefined })}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-zinc-600 rounded-lg py-4 text-sm text-gray-500 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {uploading ? (
                  <>
                    <Upload className="w-4 h-4 animate-pulse" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Enviar template .docx
                  </>
                )}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              No arquivo .docx, use <span className="font-mono">[[name]]</span>, <span className="font-mono">[[cpf]]</span>, etc. para inserir dados do card.
              O arquivo gerado será nomeado como <span className="font-mono">nomearquivo_nomepessoa.docx</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main editor dialog ──────────────────────────────────────────────────────

function AutomationEditor({
  open,
  onClose,
  onSave,
  labels,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  labels: Label[];
  initial?: AutomationData | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [triggerLabelId, setTriggerLabelId] = useState(initial?.triggerLabelId ?? "");
  const [cardType, setCardType] = useState(initial?.cardType ?? "both");
  const [conditionLogic, setConditionLogic] = useState(initial?.conditionLogic ?? "AND");
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<Action[]>(initial?.actions ?? [emptyAction()]);
  const [saving, setSaving] = useState(false);

  const { data: mentionUsers = [] } = useSWR<MentionableUser[]>("/api/admins", fetcher);
  const { data: hospitals = [] } = useSWR<string[]>("/api/hospitals", fetcher);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setTriggerLabelId(initial?.triggerLabelId ?? "");
      setCardType(initial?.cardType ?? "both");
      setConditionLogic(initial?.conditionLogic ?? "AND");
      setConditions(initial?.conditions ?? []);
      setActions(initial?.actions ?? [emptyAction()]);
    }
  }, [open, initial]);

  async function handleSave() {
    if (!name.trim()) { toast.error("Informe o nome da automação"); return; }
    if (!triggerLabelId) { toast.error("Selecione a coluna que dispara"); return; }
    if (actions.length === 0) { toast.error("Adicione pelo menos uma ação"); return; }

    const invalidFile = actions.some((a) => a.type === "file" && !a.templateFileKey);
    if (invalidFile) { toast.error("Faça o upload do template .docx antes de salvar"); return; }

    setSaving(true);
    try {
      await onSave({ name, triggerLabelId, cardType, conditionLogic, conditions, actions });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            {initial ? "Editar Automação" : "Nova Automação"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Solicitar prontuário Cajuru"
            />
          </div>

          {/* Trigger + card type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Coluna que dispara</label>
              <Select value={triggerLabelId} onValueChange={setTriggerLabelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar coluna..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ background: l.color }}
                        />
                        {l.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tipo de card</label>
              <Select value={cardType} onValueChange={setCardType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Usuários e Processos</SelectItem>
                  <SelectItem value="user">Apenas Usuários</SelectItem>
                  <SelectItem value="process">Apenas Processos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Condições</label>
                {conditions.length > 1 && (
                  <div className="flex gap-1">
                    {["AND", "OR"].map((l) => (
                      <button
                        key={l}
                        onClick={() => setConditionLogic(l)}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${
                          conditionLogic === l
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setConditions((p) => [...p, emptyCondition()])}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar condição
              </button>
            </div>

            {conditions.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 italic py-1">
                Sem condições — a automação dispara para qualquer card que entrar na coluna.
              </p>
            )}

            <div className="space-y-2">
              {conditions.map((c, i) => (
                <ConditionRow
                  key={i}
                  cond={c}
                  index={i}
                  logic={conditionLogic}
                  total={conditions.length}
                  hospitals={hospitals}
                  onChange={(updated) =>
                    setConditions((p) => p.map((x, xi) => (xi === i ? updated : x)))
                  }
                  onRemove={() => setConditions((p) => p.filter((_, xi) => xi !== i))}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Ações</label>
              <button
                onClick={() => setActions((p) => [...p, emptyAction()])}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar ação
              </button>
            </div>

            <div className="space-y-3">
              {actions.map((a, i) => (
                <ActionRow
                  key={i}
                  action={a}
                  index={i}
                  mentionUsers={mentionUsers}
                  onChange={(updated) =>
                    setActions((p) => p.map((x, xi) => (xi === i ? updated : x)))
                  }
                  onRemove={() => setActions((p) => p.filter((_, xi) => xi !== i))}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Salvando..." : "Salvar automação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Automation card ─────────────────────────────────────────────────────────

function AutomationCard({
  auto,
  onToggle,
  onEdit,
  onDelete,
}: {
  auto: AutomationData;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const condCount = auto.conditions.length;
  const actionCount = auto.actions.length;

  return (
    <div className={`rounded-xl border transition-all ${
      auto.isActive
        ? "border-blue-200 dark:border-blue-900 bg-white dark:bg-zinc-900"
        : "border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 opacity-60"
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: auto.triggerLabel?.color ?? "#6b7280" }}
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-zinc-100 truncate">
            {auto.name}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              → {auto.triggerLabel?.name ?? "Coluna removida"}
            </span>
            <span className="text-xs text-gray-400 dark:text-zinc-500">·</span>
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              {condCount === 0 ? "Sem condições" : `${condCount} condição${condCount > 1 ? "ões" : ""}`}
            </span>
            <span className="text-xs text-gray-400 dark:text-zinc-500">·</span>
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              {actionCount} ação{actionCount !== 1 ? "ões" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((p) => !p)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggle}
            className={`p-1.5 rounded-lg transition-colors ${
              auto.isActive
                ? "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                : "text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
            }`}
          >
            {auto.isActive ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-zinc-800 pt-3">
          {auto.conditions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">
                Condições ({auto.conditionLogic}):
              </p>
              <div className="space-y-1">
                {auto.conditions.map((c, i) => (
                  <div key={i} className="text-xs bg-gray-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5">
                    <span className="font-medium">{labelForField(c.field)}</span>{" "}
                    <span className="text-gray-500">{labelForOp(c.operator)}</span>{" "}
                    {c.value && <span className="font-mono text-blue-600 dark:text-blue-400">{c.value}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">Ações:</p>
            <div className="space-y-1">
              {auto.actions.map((a, i) => (
                <div key={i} className="text-xs bg-gray-50 dark:bg-zinc-800 rounded-lg px-3 py-1.5 flex items-start gap-2">
                  {a.type === "comment" ? (
                    <>
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span className="text-gray-600 dark:text-zinc-300 line-clamp-2">
                        {a.templateText || "(sem texto)"}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-gray-600 dark:text-zinc-300">
                        {a.templateFileName ? `${a.templateFileName}.docx` : "(template não enviado)"}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function AutomationsPanel({ open, onClose, labels }: AutomationsPanelProps) {
  const [automations, setAutomations] = useState<AutomationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AutomationData | null>(null);

  async function loadAutomations() {
    setLoading(true);
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      setAutomations(data);
    } catch {
      toast.error("Erro ao carregar automações");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadAutomations();
  }, [open]);

  async function handleSave(data: any) {
    if (editTarget) {
      const res = await fetch(`/api/automations/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      toast.success("Automação atualizada");
    } else {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao criar");
      toast.success("Automação criada");
    }
    await loadAutomations();
  }

  async function handleToggle(auto: AutomationData) {
    await fetch(`/api/automations/${auto.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !auto.isActive }),
    });
    setAutomations((p) =>
      p.map((a) => (a.id === auto.id ? { ...a, isActive: !auto.isActive } : a))
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Deseja excluir esta automação?")) return;
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    setAutomations((p) => p.filter((a) => a.id !== id));
    toast.success("Automação excluída");
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
          <SheetHeader className="px-6 py-5 border-b border-gray-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Zap className="w-5 h-5 text-yellow-500" />
                Automações do Kanban
              </SheetTitle>
              <Button
                size="sm"
                onClick={() => { setEditTarget(null); setEditorOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nova
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
              Execute ações automaticamente quando um card entrar em uma coluna.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-12 text-gray-400 dark:text-zinc-500 text-sm">
                Carregando...
              </div>
            )}

            {!loading && automations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-gray-400 dark:text-zinc-500" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-zinc-400">
                  Nenhuma automação criada
                </p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 max-w-xs">
                  Crie uma automação para adicionar comentários ou arquivos automaticamente quando um card entrar em uma coluna.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditTarget(null); setEditorOpen(true); }}
                  className="mt-1"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Criar primeira automação
                </Button>
              </div>
            )}

            {!loading &&
              automations.map((auto) => (
                <AutomationCard
                  key={auto.id}
                  auto={auto}
                  onToggle={() => handleToggle(auto)}
                  onEdit={() => { setEditTarget(auto); setEditorOpen(true); }}
                  onDelete={() => handleDelete(auto.id)}
                />
              ))}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
              <Bot className="w-3.5 h-3.5" />
              As ações são executadas quando um card é movido para a coluna configurada.
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AutomationEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        labels={labels}
        initial={editTarget}
      />
    </>
  );
}
