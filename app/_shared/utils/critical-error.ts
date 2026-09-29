// Regras puras do registro de erro crítico (app/_shared/lib/report-error.ts).
//
// O reportCriticalError grava o erro no banco (Log "critical_error") porque o
// console da Vercel é efêmero: conversa que ficava órfã no bot não deixava
// causa investigável. O banco não é lixeira de log, então o registro vai
// resumido (mensagem cortada, só as linhas "at" da pilha) e o mesmo erro
// repetido não é gravado de novo a cada evento.

const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_FRAMES = 8;

export interface ErrorInfo {
  name: string;
  message: string;
  /** Só as primeiras linhas "at ..." da pilha. */
  stack?: string;
}

function cut(text: string, max = MAX_MESSAGE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Resumo do erro para o log. A mensagem é cortada (erro do Prisma traz a
 * chamada inteira, com os dados, no texto) e a pilha fica só com os quadros
 * "at": a 1ª linha da pilha repete a mensagem.
 */
export function describeError(err: unknown): ErrorInfo {
  if (err instanceof Error) {
    const frames = (err.stack ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("at "))
      .slice(0, MAX_STACK_FRAMES);
    return {
      name: err.name || "Error",
      message: cut(err.message || err.name || "erro sem mensagem"),
      ...(frames.length ? { stack: frames.join("\n") } : {}),
    };
  }
  if (typeof err === "string") return { name: "string", message: cut(err || "erro sem mensagem") };
  let text: string;
  try {
    text = JSON.stringify(err) ?? String(err);
  } catch {
    // Objeto circular: o String() nunca lança.
    text = String(err);
  }
  return { name: typeof err, message: cut(text) };
}

/**
 * Chave de "mesmo erro" para não gravar de novo dentro da janela: contexto +
 * contato + começo da mensagem. Evento repetido (número desconhecido no
 * webhook, banco fora do ar) viraria uma linha por mensagem recebida.
 */
export function criticalErrorKey(context: string, message: string, contactId?: string | null): string {
  return `${context}|${contactId ?? "-"}|${message.slice(0, 200)}`;
}
