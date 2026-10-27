// Puro (item G, 27/10): o que a rota /api/op/tools/[tool] guarda de cada
// chamada em op_tool_calls além do resumo — o hash da prévia (emitida ou
// recebida) e os AVISOS que o resultado carregava — para o painel de
// rendimento saber o que o operador ignorou (prévia exigida que não voltou com
// o hash, envio executado apesar do aviso, cards pulados no lote). Só códigos
// curtos: nunca texto nem dado de cliente.

export type RegistroChamada = { previaHash: string | null; avisos: string[] };

const MAX_AVISOS = 20;

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Hash que a chamada recebeu nos args (2ª chamada de uma ação exigida). */
export function previaHashRecebido(args: unknown): string | null {
  const a = obj(args);
  const h = a?.previa_hash;
  return typeof h === "string" && h ? h.slice(0, 64) : null;
}

/** Hash que o resultado (ou o erro requer_confirmacao) emitiu: data.previa_hash ou data.previa.previa_hash. */
export function previaHashEmitido(data: unknown): string | null {
  const d = obj(data);
  if (!d) return null;
  const direto = d.previa_hash;
  if (typeof direto === "string" && direto) return direto.slice(0, 64);
  const previa = obj(d.previa);
  const h = previa?.previa_hash;
  return typeof h === "string" && h ? h.slice(0, 64) : null;
}

/**
 * Avisos do resultado como códigos: `aviso` (texto livre) → "aviso";
 * `previa.avisos[]` com MARKETING → "marketing"; `previa.destinoLivre` →
 * "destino_livre"; `lote.pulados` → "pulados:N"; `requerConfirmacao` → "requer_confirmacao".
 */
export function avisosDoResultado(data: unknown, code?: string | null): string[] {
  const out = new Set<string>();
  if (code === "requer_confirmacao") out.add("requer_confirmacao");
  const d = obj(data);
  if (d) {
    if (typeof d.aviso === "string" && d.aviso.trim()) out.add("aviso");
    if (Array.isArray(d.avisos) && d.avisos.length) out.add("aviso");
    const previa = obj(d.previa);
    if (previa) {
      if (previa.requerConfirmacao === true) out.add("requer_confirmacao");
      if (previa.destinoLivre === true) out.add("destino_livre");
      const av = Array.isArray(previa.avisos) ? previa.avisos : [];
      if (av.some((a) => typeof a === "string" && /marketing/i.test(a))) out.add("marketing");
      if (av.length) out.add("aviso");
    }
    const lote = obj(d.lote);
    const pulados = Array.isArray(lote?.pulados) ? lote!.pulados.length : 0;
    if (pulados) out.add(`pulados:${pulados}`);
    if (typeof d.naoEnviados === "number" && d.naoEnviados > 0) out.add(`nao_enviados:${d.naoEnviados}`);
  }
  return [...out].slice(0, MAX_AVISOS);
}

export function registroDaChamada(input: { args: unknown; data?: unknown; code?: string | null }): RegistroChamada {
  return {
    previaHash: previaHashEmitido(input.data) ?? previaHashRecebido(input.args),
    avisos: avisosDoResultado(input.data, input.code),
  };
}
