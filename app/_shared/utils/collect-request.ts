// PEDIDO EM ABERTO da IA (30/09/2026, decisões 1-5 do dono): o que a IA deve
// recolher do cliente até completar (lista de documentos, prints, dados).
//
// Até aqui, quando um atendente mandava a lista e devolvia a conversa ao bot,
// a IA não sabia que havia uma lista pendente: 80% dessas listas terminavam na
// Fila no primeiro arquivo ("recebi, vou passar para a equipe"). Agora o
// pedido fica gravado em whatsapp_conversations.collectRequest* e vai ao
// cérebro como FATO (conversationFacts.attendantRequest); conferir item por
// item, cobrar e transferir é decisão do cérebro (instruções v22). O código só
// produz o fato e o limpa nos desfechos.
//
// Três origens (collectRequestSource):
// - "devolver": texto do campo "O que a IA deve recolher?" do Devolver ao bot;
// - "lista_atendente": última mensagem de atendente com cara de lista, nos
//   últimos 7 dias e depois do fim do último pedido concluído
//   (collectRequestEndedAt). Nunca desde o closedAt: o atendente costuma
//   encerrar como "Qualificada" logo depois de mandar a lista;
// - "fluxo_ia": fluxo com cara de lista que a própria IA mandou (send_flow),
//   como o "LISTA DE DOCUMENTOS - INSS" (decisão 4).
//
// CONCLUIR × LIMPAR × MANTER (contrato de 30/09/2026):
// - concluir (collectRequestEndedData): handoff/qualify decididos pelo cérebro,
//   disqualify, resolve, opt-out do bot, bloqueio, transferência da cobrança;
//   grava collectRequestEndedAt, e a detecção não reabre a mesma lista;
// - limpar sem âncora (COLLECT_REQUEST_CLEARED): encerramento manual padrão,
//   finalizeClose/enterStandby do cron, opt-out por regex; a lista enviada
//   antes continua detectável se o cliente voltar na janela de 7 dias;
// - manter: handoffs técnicos (timeout, erro, órfã, resposta vazia), assumir,
//   reabrir, send_flow, continue.
//
// Puro (sem Prisma nem "use server"): usado pelo bot, pelo cron, pelas actions
// e pela tela.

const DAY_MS = 24 * 60 * 60_000;

/** Teto do texto do pedido (coluna, fato ao cérebro e campo do Devolver). */
export const COLLECT_REQUEST_MAX_CHARS = 1500;
/** Teto do texto do pedido nos logs (wa_return_bot, wa_collect_request). */
export const COLLECT_REQUEST_LOG_MAX = 500;
/** Teto do texto do pedido dentro de `facts` do log wa_bot (um por turno). */
export const COLLECT_REQUEST_FACT_LOG_MAX = 200;
/**
 * Janela da detecção e da validade do pedido: 7 dias, a mesma do fato
 * recentAttendant (bot.ts) e do dono pegajoso. Pedido gravado há mais tempo
 * está vencido: o bot ignora e volta a detectar.
 */
export const COLLECT_REQUEST_WINDOW_MS = 7 * DAY_MS;
/**
 * Nome do fluxo da lista do INSS. É CONTRATO: as instruções v22 mandam a IA
 * disparar este fluxo pelo nome exato e o botão rápido do Devolver lê os
 * itens dele. Renomear o fluxo na tela Fluxos quebra os dois.
 */
export const INSS_DOC_LIST_FLOW_NAME = "LISTA DE DOCUMENTOS - INSS";

export type CollectSource = "devolver" | "lista_atendente" | "fluxo_ia";
export const COLLECT_SOURCES: readonly CollectSource[] = ["devolver", "lista_atendente", "fluxo_ia"];

export function isCollectSource(v: unknown): v is CollectSource {
  return typeof v === "string" && (COLLECT_SOURCES as readonly string[]).includes(v);
}

/** Rótulo da origem para a equipe (nota da Fila, barra do inbox). */
export const COLLECT_SOURCE_LABELS: Record<CollectSource, string> = {
  devolver: "pedido no Devolver ao bot",
  lista_atendente: "lista mandada pelo atendente",
  fluxo_ia: "fluxo mandado pela IA",
};

// ---------------------------------------------------------------------------
// Texto do pedido
// ---------------------------------------------------------------------------

/** Corta em `max` code points (não quebra emoji ao meio), com "…" no fim. */
export function clipCollectText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
}

/**
 * Texto do pedido pronto para gravar: espaços nas pontas de cada linha fora,
 * 3+ quebras viram 2, corte em COLLECT_REQUEST_MAX_CHARS. Vazio, só espaço ou
 * não-string → null (nada em aberto).
 */
export function normalizeCollectRequest(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return clipCollectText(text, COLLECT_REQUEST_MAX_CHARS);
}

/** Mesmo pedido? (compara o texto normalizado; null = sem pedido). */
export function sameCollectRequest(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeCollectRequest(a ?? null) === normalizeCollectRequest(b ?? null);
}

// ---------------------------------------------------------------------------
// Detecção de lista na mensagem do atendente
//
// Calibrada no banco em 30/09/2026 (SELECT de 30 dias): de 9.883 mensagens de
// atendente, 249 deram positivo, em 198 contatos, sem pegar a mensagem do link
// de assinatura nem o lembrete "conseguiu ver a lista?". Erra dos dois lados
// (explicação com 3 termos vira lista; lista em prosa sem termo passa): é só
// fato, o cérebro confere no histórico.
// ---------------------------------------------------------------------------

/** Sem acento e minúsculo, para os termos casarem com e sem acentuação. */
function foldText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Cada regex conta uma vez (termos distintos), no texto sem acento.
const DOC_TERMS: RegExp[] = [
  /\bcnis\b/,
  /\bctps\b|carteira de trabalho/,
  /carta de concess/,
  /declaracao de benef/,
  /\bpericia/,
  /\blaudo/,
  /comprovante de (endereco|residencia)|\bendereco\b/,
  /\brg\b|\bidentidade\b/,
  /\bcnh\b|habilitacao/,
  /copia do processo/,
  /\bcat\b/,
  /outros vinculos/,
  /comunicacao de decis/,
  /boletim de ocorr/,
  /prontuario/,
  /atestado/,
  /\bextrato/,
  /\bprints?\b/,
  /receituario/,
  /\bexames?\b|raio.?x/,
  /estado civil/,
  /\bprofiss/,
];

// Linha de item: "- CNIS", "-Cópia", "• RG", "✅ *Carta*", "1. CNIS", "2) RG",
// "3️⃣ Laudo". O "\S" depois exige conteúdo (traço solto não conta).
const BULLET_LINE = /^\s*[*_]*\s*(?:[-•*▪►➡✅✔☑📄📌🔹]|\d{1,2}\s*[.)\-–]|[0-9]️?⃣)\s*\S/u;

// Cabeçalho de lista ("LISTA DE DOCUMENTOS", "vamos precisar de:").
const LIST_HEADER = /lista de documentos|documentos necessarios|seguintes documentos|documentos que (precisamos|vamos precisar)|vamos precisar (de|dos)\b/;

// Mensagem de ASSINATURA (link da ZapSign, "procurações... link"): tem termos de
// documento mas não é pedido de coleta.
const SIGNATURE_LINK = /zapsign|(assinatura|procurac)[\s\S]*\blink\b|\blink\b[\s\S]*(assinatura|procurac)/;

export interface ListSignals {
  terms: number;
  bullets: number;
  header: boolean;
  signatureLink: boolean;
}

export function listSignals(text: string): ListSignals {
  const folded = foldText(text);
  return {
    terms: DOC_TERMS.filter((re) => re.test(folded)).length,
    bullets: text.split(/\r?\n/).filter((line) => BULLET_LINE.test(line)).length,
    header: LIST_HEADER.test(folded),
    signatureLink: SIGNATURE_LINK.test(folded),
  };
}

/**
 * O texto tem cara de pedido de documentos/dados em lista? 3+ termos de
 * documento, ou 2 termos em 2+ linhas de item, ou cabeçalho de lista com 2+
 * itens. Mensagem do link de assinatura nunca conta.
 */
export function isListLikeRequest(text: string | null | undefined): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  const s = listSignals(text);
  if (s.signatureLink) return false;
  return s.terms >= 3 || (s.terms >= 2 && s.bullets >= 2) || (s.header && s.bullets >= 2);
}

export interface AttendantMessageLike {
  id: string;
  body: string | null;
  createdAt: Date;
  authorId: string | null;
}

export interface DetectedAttendantRequest {
  messageId: string;
  text: string;
  at: Date;
  authorId: string | null;
}

/**
 * A mensagem de atendente com cara de lista MAIS RECENTE depois de `after`
 * (entrada em qualquer ordem). A de faltantes ("Ainda faltam: ✅ …") também
 * vale e, sendo mais nova, fica no lugar da lista antiga. Nada → null.
 */
export function pickAttendantRequest(
  msgs: readonly AttendantMessageLike[],
  after: Date,
): DetectedAttendantRequest | null {
  let best: AttendantMessageLike | null = null;
  for (const m of msgs) {
    if (m.createdAt.getTime() <= after.getTime()) continue;
    if (!isListLikeRequest(m.body)) continue;
    if (!best || m.createdAt.getTime() > best.createdAt.getTime()) best = m;
  }
  const text = best ? normalizeCollectRequest(best.body) : null;
  if (!best || !text) return null;
  return { messageId: best.id, text, at: best.createdAt, authorId: best.authorId };
}

/**
 * Âncora da detecção: o mais novo entre o fim do último pedido concluído e
 * agora − 7 dias. NUNCA o closedAt (ver o cabeçalho).
 */
export function requestAnchor(endedAt: Date | null | undefined, now: Date | number = Date.now()): Date {
  const nowMs = typeof now === "number" ? now : now.getTime();
  return new Date(Math.max(endedAt?.getTime() ?? 0, nowMs - COLLECT_REQUEST_WINDOW_MS));
}

/** Pedido gravado ainda válido (aberto há no máximo COLLECT_REQUEST_WINDOW_MS)? */
export function isCollectRequestLive(
  at: Date | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (!at) return false;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs - at.getTime() <= COLLECT_REQUEST_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Gravação (espalhar no `data` de um update do Prisma). Sempre por
// update/updateMany do Prisma, que toca o @updatedAt: o delta do inbox só vê a
// conversa que mudou por ele (SQL cru não toca).
// ---------------------------------------------------------------------------

/** Abre (ou substitui) o pedido; zera a cobrança automática. */
export function collectOpenData(text: string, byId: string | null, source: CollectSource, at: Date) {
  return {
    collectRequest: text,
    collectRequestAt: at,
    collectRequestById: byId,
    collectRequestSource: source,
    collectNudgeAt: null,
    collectNudgeCount: 0,
  };
}

/** LIMPAR sem âncora (não grava collectRequestEndedAt; ver o cabeçalho). */
export const COLLECT_REQUEST_CLEARED = {
  collectRequest: null,
  collectRequestAt: null,
  collectRequestById: null,
  collectRequestSource: null,
  collectNudgeAt: null,
  collectNudgeCount: 0,
} as const;

/** CONCLUIR: limpa e grava o fim (âncora da detecção). */
export function collectRequestEndedData(now: Date = new Date()) {
  return { ...COLLECT_REQUEST_CLEARED, collectRequestEndedAt: now };
}

// ---------------------------------------------------------------------------
// Fato ao cérebro (conversationFacts.attendantRequest) e versão do log
// ---------------------------------------------------------------------------

export interface AttendantRequestFact {
  text: string;
  source: CollectSource;
  /** ISO: abertura do pedido (na lista detectada, a hora da mensagem). */
  at: string;
  /** Houve "Devolver ao bot" depois (ou no instante) do pedido. */
  returnedToBot: boolean;
  /** Fotos/PDFs do cliente desde o pedido. */
  docsSinceOpened: number;
  /** Cobranças automáticas já enviadas neste pedido. */
  nudges: number;
  /** Só em fluxo_ia: nome do fluxo que abriu o pedido. */
  flowName?: string | null;
}

export function buildAttendantRequestFact(input: {
  text: string;
  source: CollectSource;
  at: Date;
  returnedToBotAt: Date | null | undefined;
  docsSinceOpened: number;
  nudges: number;
  flowName?: string | null;
}): AttendantRequestFact {
  return {
    text: clipCollectText(input.text, COLLECT_REQUEST_MAX_CHARS),
    source: input.source,
    at: input.at.toISOString(),
    returnedToBot: !!input.returnedToBotAt && input.returnedToBotAt.getTime() >= input.at.getTime(),
    docsSinceOpened: Math.max(0, Math.round(input.docsSinceOpened || 0)),
    nudges: Math.max(0, Math.round(input.nudges || 0)),
    ...(input.source === "fluxo_ia" ? { flowName: input.flowName ?? null } : {}),
  };
}

/** Fato enxuto para o log wa_bot (o texto inteiro vai só ao cérebro). */
export function attendantRequestForLog(fact: AttendantRequestFact | null): AttendantRequestFact | null {
  if (!fact) return null;
  return { ...fact, text: clipCollectText(fact.text, COLLECT_REQUEST_FACT_LOG_MAX) };
}

// ---------------------------------------------------------------------------
// DTO da lista do inbox (barra "IA recolhendo", pill "Lista")
// ---------------------------------------------------------------------------

export interface CollectRequestDTO {
  text: string;
  /** ISO. */
  at: string;
  byName: string | null;
  source: CollectSource;
  nudges: number;
}

/**
 * Patch do DTO: o otimista da tela e a resposta da action saem da MESMA
 * função, senão a linha "pula" quando o delta chega.
 */
export function collectRequestPatch(
  v: { text: string; at: Date | string; byName: string | null; source: CollectSource; nudges?: number } | null,
): { collectRequest: CollectRequestDTO | null } {
  if (!v) return { collectRequest: null };
  return {
    collectRequest: {
      text: v.text,
      at: typeof v.at === "string" ? v.at : v.at.toISOString(),
      byName: v.byName,
      source: v.source,
      nudges: v.nudges ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Fluxos (send_flow da IA e botão rápido do Devolver)
// ---------------------------------------------------------------------------

export interface FlowStepLike {
  kind: string;
  body?: string | null;
}

/**
 * Texto dos passos de TEXTO do fluxo que têm cara de lista, juntos. O passo a
 * passo do app ("1. Abra o Meu INSS; 2. Clique na lupinha…") não entra: não é
 * item a recolher. Nenhum passo com cara de lista → null (o fluxo não abre
 * pedido).
 */
export function flowListText(steps: readonly FlowStepLike[] | null | undefined): string | null {
  const parts = (steps ?? [])
    .filter((s) => s.kind === "text" && typeof s.body === "string" && isListLikeRequest(s.body))
    .map((s) => s.body as string);
  return parts.length ? normalizeCollectRequest(parts.join("\n\n")) : null;
}

/** Itens (linhas de item, sem o marcador) do 1º passo de texto com cara de lista. */
export function collectItemsFromFlowSteps(steps: readonly FlowStepLike[] | null | undefined): string[] {
  const step = (steps ?? []).find((s) => s.kind === "text" && typeof s.body === "string" && isListLikeRequest(s.body));
  if (!step?.body) return [];
  return listItems(step.body);
}

/** Linhas de item de um texto, sem o marcador ("- ", "✅ ", "1. ") e sem negrito. */
export function listItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => BULLET_LINE.test(line))
    .map((line) =>
      line
        .replace(/^\s*[*_]*\s*(?:[-•*▪►➡✅✔☑📄📌🔹]️?|\d{1,2}\s*[.)\-–]|[0-9]️?⃣)\s*/u, "")
        .replace(/[*_]+/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Texto do botão rápido "Lista de documentos do INSS" do Devolver: título + um
 * item por linha. Sem itens → null (o botão some).
 */
export function collectPresetFromFlow(
  steps: readonly FlowStepLike[] | null | undefined,
  title = "Lista de documentos do INSS (Meu INSS)",
): string | null {
  const items = collectItemsFromFlowSteps(steps);
  if (!items.length) return null;
  return normalizeCollectRequest(`${title}:\n${items.map((i) => `- ${i}`).join("\n")}`);
}

/**
 * Pedido VAGO ("ver se tem Meu INSS") + lista do fluxo que a IA acabou de
 * mandar: a lista entra no fim do texto, senão ela nunca viraria o pedido.
 */
export function appendListToRequest(current: string, listText: string): string {
  return normalizeCollectRequest(`${current}\n\n${listText}`) ?? current;
}

/**
 * Resumo curto para a barra/pill: os primeiros itens que cabem em `max`
 * caracteres + "(+N)"; sem itens, a 1ª linha cortada.
 */
export function collectSummary(text: string, max = 90): string {
  const items = listItems(text).map((i) => i.replace(/\s*\(.*$/, "").trim()).filter(Boolean);
  if (!items.length) {
    const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    return clipCollectText(first, max);
  }
  const shown: string[] = [];
  for (const item of items) {
    const next = [...shown, item].join(", ");
    const rest = items.length - shown.length - 1;
    if (shown.length && next.length + (rest > 0 ? ` (+${rest})`.length : 0) > max) break;
    shown.push(item);
  }
  const rest = items.length - shown.length;
  const joined = clipCollectText(shown.join(", "), max);
  return rest > 0 ? `${joined} (+${rest})` : joined;
}

// ---------------------------------------------------------------------------
// Nota interna da Fila
// ---------------------------------------------------------------------------

/**
 * Linha do pedido na MESMA nota da transferência (a lista da Fila mostra só a
 * última nota do bot como motivo). `concluded`: a transferência concluiu o
 * pedido (quem pegar confere o que falta); senão ele continua valendo quando
 * a conversa voltar ao bot. Sem pedido → null.
 */
export function requestNoteLine(
  req: { text: string | null; source: string | null } | null | undefined,
  opts: { concluded: boolean },
): string | null {
  const text = req?.text?.trim();
  if (!text) return null;
  const label = isCollectSource(req?.source) ? COLLECT_SOURCE_LABELS[req.source] : "pedido registrado";
  // Concluído: o mesmo UPDATE apaga a coluna, então a nota é o único lugar
  // onde a equipe ainda lê a lista inteira (o preset do INSS tem ~500
  // caracteres). Em aberto, a coluna continua valendo e a nota só resume.
  const clipped = clipCollectText(text, opts.concluded ? COLLECT_REQUEST_MAX_CHARS : 300);
  return opts.concluded
    ? `📋 Pedido que a IA estava recolhendo (${label}):\n${clipped}`
    : `📋 Pedido em aberto (${label}) — continua valendo se a conversa voltar ao bot:\n${clipped}`;
}
