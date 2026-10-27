// Lote na IA de operação (decisão do dono, 27/10 — docs/ai-first/10-decisoes-dono-27-10.md):
// uma aprovação ("aprovo <código>") cobre N envios; um anexar cobre N rascunhos.
// Puro e testado em tests/op-lote.test.ts: variáveis de card no texto, limites
// e o texto da prévia que a skill cola inteiro.

/** Teto por aprovação: 20 WhatsApps cabem no orçamento de 55 s do MCP com 1,5 s entre envios. */
export const LOTE_WHATSAPP_MAX = 20;
export const LOTE_EMAIL_MAX = 10;
export const LOTE_ANEXOS_MAX = 10;
/** Intervalo entre envios do lote (humano aprovou, não é rajada de automação). */
export const LOTE_WHATSAPP_GAP_MS = 1_500;
/** Orçamento do envio em lote, contado do início do executar_aprovado (maxDuration 60 s, MCP corta em 55 s). */
export const LOTE_ENVIO_BUDGET_MS = 40_000;

export interface CardVars {
  nome: string | null;
  cardNumber: number | null;
  hospital?: string | null;
}

const VARS: Record<string, (c: CardVars) => string> = {
  nome: (c) => c.nome ?? "",
  name: (c) => c.nome ?? "",
  primeiro_nome: (c) => (c.nome ?? "").trim().split(/\s+/)[0] ?? "",
  numero: (c) => (c.cardNumber === null ? "" : String(c.cardNumber)),
  hospital: (c) => c.hospital ?? "",
};

/** `[[nome]]`, `[[primeiro_nome]]`, `[[numero]]`, `[[hospital]]` → dados do card; tag desconhecida fica como está. */
export function fillCardVars(text: string, card: CardVars): string {
  return text.replace(/\[\[\s*([a-z_]+)\s*\]\]/gi, (m, k: string) => {
    const f = VARS[k.toLowerCase()];
    return f ? f(card) : m;
  });
}

export function hasCardVars(text: string): boolean {
  return /\[\[\s*(nome|name|primeiro_nome|numero|hospital)\s*\]\]/i.test(text);
}

/** "#2342" / "processo 2342" / " 2342 " → "2342" (chave de deduplicação). */
export function refKey(ref: string): string {
  return ref.trim().replace(/^#/, "").replace(/^processo\s+/i, "").toLowerCase();
}

/** Referências repetidas contam uma vez, na ordem em que vieram. */
export function dedupeRefs(refs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of refs) {
    const k = refKey(r);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r.trim());
  }
  return out;
}

export interface LoteItemPrevia {
  cardNumber: number | null;
  nome: string | null;
  /** telefone + linha (WhatsApp) ou e-mail (e-mail). */
  destino: string;
  /** "texto" | template "x" | "2 anexo(s)"… */
  saiComo?: string;
  texto: string;
  avisos?: string[];
}

export interface LotePulado {
  card: string;
  cardNumber: number | null;
  nome: string | null;
  code: string;
  message: string;
}

/**
 * Prévia em texto do lote, montada no servidor (a skill cola sem reescrever).
 * Texto igual para todos sai uma vez; diferente (variáveis) sai por item.
 */
export function previaTextoLote(input: { canal: "WhatsApp" | "e-mail"; itens: LoteItemPrevia[]; pulados: LotePulado[]; assunto?: string }): string {
  const { canal, itens, pulados } = input;
  const linhas: string[] = [`${canal.toUpperCase()} EM LOTE — ${itens.length} envio(s)${pulados.length ? `, ${pulados.length} pulado(s)` : ""}`];
  if (input.assunto) linhas.push(`Assunto: ${input.assunto}`);
  const textos = new Set(itens.map((i) => i.texto));
  const unico = textos.size === 1 && itens.length > 0;
  itens.forEach((i, n) => {
    linhas.push(`${n + 1}. card ${i.cardNumber ?? "?"} (${i.nome ?? ""}) → ${i.destino}${i.saiComo ? ` · ${i.saiComo}` : ""}`);
    if (!unico) linhas.push(indent(i.texto), "");
    for (const a of i.avisos ?? []) linhas.push(`   ⚠ ${a}`);
  });
  if (unico) linhas.push("", "Texto (igual para todos):", itens[0].texto);
  if (pulados.length) {
    linhas.push("", "NÃO VÃO (bloqueados na preparação):");
    for (const p of pulados) linhas.push(`- card ${p.cardNumber ?? p.card} (${p.nome ?? ""}): ${p.code} — ${p.message}`);
  }
  return linhas.join("\n");
}

function indent(t: string): string {
  return t
    .split("\n")
    .map((l) => `   ${l}`)
    .join("\n");
}

export interface LoteEnvioItem {
  cardId: string;
  cardNumber: number | null;
  nome: string | null;
  sent: boolean;
  via?: string | null;
  reason?: string;
}

/** Resultado do lote: executada se ao menos um saiu (o que não saiu vem listado; nunca se reenvia o lote). */
export function loteOutcome(itens: LoteEnvioItem[]): { sent: boolean; enviados: number; naoEnviados: number; itens: LoteEnvioItem[]; aviso?: string } {
  const enviados = itens.filter((i) => i.sent).length;
  const naoEnviados = itens.length - enviados;
  return {
    sent: enviados > 0,
    enviados,
    naoEnviados,
    itens,
    ...(naoEnviados ? { aviso: `${naoEnviados} não saiu/saíram: veja o motivo por card e, se fizer sentido, prepare de novo SÓ esses.` } : {}),
  };
}
