// Monta o texto de um template do jeito que ele chega no celular do cliente,
// para guardar na thread da equipe. Quem renderiza o template de verdade é a
// Meta; o que fica salvo aqui é a nossa cópia de referência — e ela precisa
// bater com o que o cliente leu, senão a equipe responde no escuro.
//
// Antes (03/08/2026) cada chamador montava esse texto do seu jeito, e os dois
// estavam incompletos: o envio manual (modal "Enviar template") perdia o
// RODAPÉ, e o envio automático (automações/avisos) perdia CABEÇALHO e RODAPÉ.
//
// O cabeçalho sai em *negrito* — marcação nativa do WhatsApp, que é como o app
// do cliente o exibe e como a bolha da thread renderiza (ver wa-format.tsx).

export interface TemplateTextParts {
  name: string;
  headerText?: string | null;
  bodyPreview?: string | null;
  footerText?: string | null;
}

/** Troca {{1}}, {{2}}... pelos valores informados, na ordem. */
function fillVars(text: string, values: string[]): string {
  return values.reduce((acc, v, i) => acc.replaceAll(`{{${i + 1}}}`, v), text);
}

/**
 * Texto do template para a thread: cabeçalho em negrito, corpo e rodapé,
 * separados por linha em branco. Partes ausentes simplesmente não aparecem.
 *
 * @param headerVar valor de {{1}} do cabeçalho (a Meta permite no máx. 1).
 */
export function renderTemplateThreadText(
  template: TemplateTextParts,
  vars: string[],
  headerVar?: string | null,
): string {
  const rawHeader = template.headerText?.trim();
  const header = rawHeader ? fillVars(rawHeader, [headerVar?.trim() ?? '']).trim() : null;

  const rawBody = template.bodyPreview?.trim();
  const body = rawBody
    ? fillVars(rawBody, vars)
    : `[Template: ${template.name}]${vars.length ? ` (${vars.join(', ')})` : ''}`;

  const footer = template.footerText?.trim() || null;

  return [header ? `*${header}*` : null, body, footer].filter(Boolean).join('\n\n');
}
