// DOCX → PDF no microserviço docx-converter (Railway, LibreOffice) para a IA
// de operação. Orçamento total curto de propósito: o MCP do Claude Code corta
// a chamada em 55 s (tools/crm-mcp/index.mjs) e a rota /api/op/tools tem
// maxDuration 60. Uma geração por chamada — o converter serializa as
// conversões e rajada enfileira para todo mundo (inclusive a aba Integrações).

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

export class ConverterError extends Error {
  constructor(
    /** `modelo_invalido` = 400/422 (repetir não adianta); `conversor_indisponivel` = rede/timeout/5xx. */
    public code: "modelo_invalido" | "conversor_indisponivel",
    message: string,
  ) {
    super(message);
    this.name = "ConverterError";
  }
}

/**
 * Converte com 1 retry só para falha transitória (500 esporádico do
 * LibreOffice, timeout, rede), dentro de `budgetMs` no total.
 */
export async function convertDocxToPdf(docx: Buffer, { budgetMs = 45_000 }: { budgetMs?: number } = {}): Promise<Buffer> {
  const deadline = Date.now() + budgetMs;
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;
    try {
      const res = await fetch(`${CONVERTER_URL}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
        },
        body: new Uint8Array(docx),
        signal: AbortSignal.timeout(attempt === 1 ? Math.min(30_000, remaining) : remaining),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      if (res.status === 400 || res.status === 422) {
        throw new ConverterError("modelo_invalido", `O conversor recusou o documento (${res.status}): ${detail}`);
      }
      last = `HTTP ${res.status} ${detail}`;
    } catch (err) {
      if (err instanceof ConverterError) throw err;
      last = err instanceof Error ? err.message : String(err);
    }
    console.warn(`[OP DOCS] conversão falhou (tentativa ${attempt}/2): ${last}`);
    // Fila única no converter: dar um respiro antes de pedir de novo.
    if (attempt === 1 && deadline - Date.now() > 7_000) await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new ConverterError("conversor_indisponivel", `Conversor de PDF indisponível (${last || "sem tempo"}).`);
}
