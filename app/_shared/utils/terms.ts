// Aceite de termos pelo WhatsApp (T-B40K0) — regras PURAS: leitura da resposta
// do formulário de aceite, código de verificação, registro canônico (hash),
// máscaras da página pública e a TRAVA do kanban (aceite × ZapSign).
// Sem banco: quem consulta o card monta a entrada de `termsGate`.

import { brDateTimeParts } from "./date-br";

// ─── Resposta do formulário de aceite ────────────────────────────────────────

export interface TermsReply {
  accepted: boolean;
  termsVersion: string;
  name: string | null;
  cpf: string | null;
  healthConsent: boolean;
}

const yes = (v: unknown) => v === true || v === "true" || v === "Sim" || v === "sim";

/**
 * Lê o `response_json` do nfm_reply. Só é formulário de aceite quando traz a
 * chave `aceite_termos` (a caixa "SIM, autorizo" do Flow `aceite_termos_servico`);
 * qualquer outro formulário devolve null. `versao_termos` ausente = "v1".
 */
export function parseTermsReply(responseJson: unknown): TermsReply | null {
  let obj: unknown = responseJson;
  if (typeof obj === "string") {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (!("aceite_termos" in o)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null);
  const cpfDigits = typeof o.cpf === "string" ? o.cpf.replace(/\D/g, "") : "";
  return {
    accepted: yes(o.aceite_termos),
    termsVersion: (str(o.versao_termos) ?? "v1").slice(0, 20),
    name: str(o.nome_completo ?? o.nome),
    cpf: cpfDigits || null,
    healthConsent: yes(o.consentimento_dados_saude ?? o.aceite_termos),
  };
}

// ─── Código de verificação ───────────────────────────────────────────────────

// Sem 0/O/1/I/L: o código é digitado a partir do papel.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** "XXXX-XXXX-XXXX" a partir de bytes aleatórios (crypto.randomBytes no servidor). */
export function formatVerificationCode(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) chars.push(CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export function normalizeVerificationCode(raw: string): string | null {
  const s = (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length !== 12 || [...s].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

// ─── Registro canônico (o que o hash do PDF prova) ───────────────────────────

export interface TermsRecord {
  documentId: string;
  code: string;
  phone: string;
  waMessageId: string;
  acceptedAt: Date;
  termsVersion: string;
  formName: string | null;
  metaFlowId: string | null;
  name: string | null;
  cpf: string | null;
  /** SHA-256 do texto dos termos exibido no formulário (null se não lido). */
  termsTextHash: string | null;
}

/** JSON com chaves em ordem fixa: o mesmo registro dá sempre o mesmo hash. */
export function canonicalTermsRecord(r: TermsRecord): string {
  return JSON.stringify({
    documentId: r.documentId,
    code: r.code,
    phone: r.phone,
    waMessageId: r.waMessageId,
    acceptedAt: r.acceptedAt.toISOString(),
    termsVersion: r.termsVersion,
    formName: r.formName,
    metaFlowId: r.metaFlowId,
    name: r.name,
    cpf: r.cpf,
    termsTextHash: r.termsTextHash,
  });
}

/** "13/11/2026 10:42:05" no horário de Brasília. */
export function brDateTimeLabel(date: Date): string {
  const p = brDateTimeParts(date);
  const [y, m, d] = p.day.split("-");
  return `${d}/${m}/${y} ${p.time}:${p.second}`;
}

// ─── Máscaras da página pública /verificar/aceite ────────────────────────────

export function maskCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "—";
}

export function maskName(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return parts.map((p, i) => (i === 0 ? p : `${p[0]}.`)).join(" ");
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : "—";
}

export function formatCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf ?? "—";
}

// ─── Trava do kanban: aceite × ZapSign (decisão do dono, 13/11) ──────────────

/** Tag de card que diz "a ZapSign voltou assinada" (criada pela migration). */
export const ZAPSIGN_TAG_NAME = "ZAPSIGN ASSINADO";

/** A ZapSign passa a ser exigida desta coluna em diante (ordem do board). */
export const SIGNATURE_REQUIRED_FROM_COLUMN = "DISTRIBUICAO DE PROCESSOS";

// Antes da assinatura: o card só sai daqui com o aceite ou com a ZapSign.
const PRE_SIGNATURE_COLUMNS = new Set(["FILTRO DE CARTOES", "COLHER-ASSINATURA", "COLHER ASSINATURA"]);

/** Nome de coluna comparável (sem acento, maiúsculo, espaços simples). */
export function normalizeColumnName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

export interface TermsGateInput {
  from: { name: string | null; order: number | null };
  to: { name: string; order: number };
  /** `order` da coluna SIGNATURE_REQUIRED_FROM_COLUMN; null = não existe (trava da ZapSign desligada). */
  signatureFromOrder: number | null;
  hasAcceptance: boolean;
  hasZapsignTag: boolean;
}

export type TermsGateResult =
  | { ok: true }
  | { ok: false; code: "falta_aceite" | "falta_zapsign"; message: string };

/**
 * Pode mover? Regras (só para a frente; voltar é sempre livre):
 * 1. Saindo de Filtro de Cartões/COLHER-ASSINATURA: precisa do aceite OU da
 *    tag ZAPSIGN ASSINADO; para cair direto na zona da assinatura, da tag.
 * 2. Entrando na zona da assinatura (DISTRIBUIÇÃO DE PROCESSOS em diante)
 *    vindo de antes dela: card que avançou pelo ACEITE precisa da tag. Card
 *    sem aceite (fluxo antigo, já passou pela ZapSign) segue livre — os cards
 *    que já estavam adiante em 13/11 não travam.
 * Coluna "TESTE…" nunca trava (testes de automação).
 */
export function termsGate(i: TermsGateInput): TermsGateResult {
  const fromN = normalizeColumnName(i.from.name);
  const toN = normalizeColumnName(i.to.name);
  if (toN.startsWith("TESTE")) return { ok: true };
  const fromPre = PRE_SIGNATURE_COLUMNS.has(fromN);
  const toPre = PRE_SIGNATURE_COLUMNS.has(toN);
  const gate = i.signatureFromOrder;
  const toSigned = gate != null && i.to.order >= gate && !toPre;
  const fromSigned = gate != null && i.from.order != null && i.from.order >= gate && !fromPre;

  const needZapsign: TermsGateResult = {
    ok: false,
    code: "falta_zapsign",
    message: `"${i.to.name}" exige o contrato assinado na ZapSign. Quando a assinatura voltar, marque a tag ${ZAPSIGN_TAG_NAME} no card.`,
  };

  if (fromPre && !toPre) {
    if (i.hasZapsignTag) return { ok: true };
    if (toSigned) return needZapsign;
    if (!i.hasAcceptance) {
      return {
        ok: false,
        code: "falta_aceite",
        message: `Para ir para "${i.to.name}" o cliente precisa ter aceitado os termos pelo WhatsApp, ou o card precisa da tag ${ZAPSIGN_TAG_NAME} (contrato assinado na ZapSign).`,
      };
    }
    return { ok: true };
  }
  if (toSigned && !fromSigned && i.hasAcceptance && !i.hasZapsignTag) return needZapsign;
  return { ok: true };
}
