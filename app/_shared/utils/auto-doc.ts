// Normaliza o JSON que a IA devolve na leitura automática de mídia do cliente
// (T-ZAPXG, app/_shared/lib/whatsapp/auto-docs.ts). Puro e testável: a IA às
// vezes manda campo faltando, string no lugar de boolean ou data inventada fora
// do formato — nada disso pode quebrar a anexação.

export type AfastamentoSituacao = "sim" | "nao" | "indefinido";

export interface AutoDocResult {
  ehDocumento: boolean;
  tipo: string;
  pasta: string;
  afastamento: {
    situacao: AfastamentoSituacao;
    inicio: string | null;
    fim: string | null;
    evidencia: string | null;
  };
}

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function date(v: unknown): string | null {
  const t = str(v, 10);
  return t && DATE_RE.test(t) ? t : null;
}

export function parseAutoDocResult(raw: unknown): AutoDocResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = (o.afastamento && typeof o.afastamento === "object" ? o.afastamento : {}) as Record<string, unknown>;
  const sit = typeof a.situacao === "string" ? a.situacao.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
  const situacao: AfastamentoSituacao = sit === "sim" ? "sim" : sit === "nao" ? "nao" : "indefinido";
  const ehDocumento = o.ehDocumento === true || o.ehDocumento === "true";
  return {
    ehDocumento,
    // Tipo vira prefixo de nome de arquivo: sem caracteres inválidos no Windows.
    tipo: (str(o.tipo, 60) ?? "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().toUpperCase(),
    pasta: (str(o.pasta, 30) ?? "").toUpperCase(),
    afastamento: ehDocumento
      ? { situacao, inicio: date(a.inicio), fim: date(a.fim), evidencia: str(a.evidencia, 300) }
      : { situacao: "indefinido", inicio: null, fim: null, evidencia: null },
  };
}
