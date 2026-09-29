// Erros da IA do Copiloto (resumo, sugestão, transcrição) e o status HTTP de
// cada um na rota POST /api/whatsapp/assist/<op>. Puro — sem Next, sem banco —
// para o tests/assist-errors.test.ts; quem lança é o lib (assist.ts e
// transcribe.ts), quem traduz é a rota.
//
// Por que existe (auditoria de 24/09/2026, DUR-4): a IA do Copiloto era server
// action, e em produção o Next mascara o texto do erro ("An error occurred in
// the Server Components render…"). Pela rota a mensagem PT-BR chega à tela, e
// o status separa "a IA demorou" (504) de "o micro caiu" (502) de "pedido
// inválido" (400/404), sem ler o texto.

export type AssistErrorCode =
  | 'timeout' // o micro não respondeu no prazo (ASSIST_TIMEOUT_MS) ou devolveu 504
  | 'offline' // não deu para falar com o micro (fora do ar, DNS, conexão recusada)
  | 'upstream' // o micro respondeu com erro ou com um corpo sem o que foi pedido
  | 'not_found' // contato ou mensagem não existe
  | 'bad_input' // pedido que não faz sentido (sem conversa para resumir, mensagem sem áudio)
  | 'not_configured'; // CHATBOT_URL/CHATBOT_SECRET vazios no servidor

/**
 * Falha da IA do Copiloto com a mensagem PT-BR que vai para o atendente.
 * Continua sendo `Error`: as actions antigas (wrappers) e o bot, que fazem
 * `catch` genérico, seguem iguais.
 */
export class AssistError extends Error {
  readonly code: AssistErrorCode;

  constructor(code: AssistErrorCode, message: string) {
    super(message);
    this.name = 'AssistError';
    this.code = code;
  }
}

/**
 * `instanceof` e, de reserva, `name` + `code`: cada rota é um bundle próprio
 * do Next, e uma cópia duplicada do módulo faria o `instanceof` falhar em
 * silêncio (a mensagem boa viraria o 500 genérico).
 */
export function isAssistError(err: unknown): err is AssistError {
  if (err instanceof AssistError) return true;
  return (
    err instanceof Error
    && err.name === 'AssistError'
    && typeof (err as { code?: unknown }).code === 'string'
  );
}

/** Code → HTTP. Code desconhecido (ou ausente) = 500. */
export function assistErrorStatus(code: string | null | undefined): number {
  switch (code) {
    case 'timeout':
      return 504;
    case 'offline':
    case 'upstream':
      return 502;
    case 'not_configured':
      return 503;
    case 'not_found':
      return 404;
    case 'bad_input':
      return 400;
    default:
      return 500;
  }
}

/** Texto da rota quando a falha não é uma `AssistError` (banco, S3, bug). */
export const ASSIST_FAILURE_MESSAGE = 'A IA não conseguiu concluir o pedido. Tente de novo.';

export interface AssistFailure {
  status: number;
  error: string;
}

/**
 * Erro do lib → resposta da rota: `AssistError` mantém a mensagem PT-BR e o
 * status do code; o resto vira 500 com texto genérico (o erro cru pode ter
 * detalhe de banco ou de S3, e vai só para o log do servidor).
 */
export function assistFailure(err: unknown): AssistFailure {
  if (isAssistError(err)) {
    return { status: assistErrorStatus(err.code), error: err.message || ASSIST_FAILURE_MESSAGE };
  }
  return { status: 500, error: ASSIST_FAILURE_MESSAGE };
}
