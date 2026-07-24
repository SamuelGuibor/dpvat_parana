// Trava TEMPORÁRIA de acesso à "Revisão da IA".
//
// A permissão review_ai já nasce restrita ao cargo ADMIN++, mas hoje existe
// mais de um ADMIN++ na equipe — e a curadoria do cérebro do bot é, por
// decisão do Samuel (23/07/2026), de uma pessoa só nos primeiros meses: quem
// julga define o que a IA aprende, e dois curadores com critérios diferentes
// contaminam o playbook.
//
// Esta allowlist é uma RESTRIÇÃO, não uma concessão: ela só consegue TIRAR o
// acesso de quem a permissão já daria. Estar na lista sem ter review_ai não
// abre nada.
//
// ⚠️ COMO LIBERAR DEPOIS (é de propósito que seja fácil):
//   • para toda a equipe conforme cargo/permissões → apague a chamada de
//     restrictAiReview() em permissions-server.ts e este arquivo. O sistema
//     volta sozinho ao comportamento normal (ADMIN++ por padrão, concedível ao
//     ADMIN+ por override na tela de permissões).
//   • para mais alguém sem mexer em código → env AI_REVIEW_EMAILS com os
//     e-mails separados por vírgula (soma-se ao hardcoded).

const HARDCODED_AI_REVIEW_EMAILS = ['mucaguibor@gmail.com'];

function normalize(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

export const AI_REVIEW_EMAILS: Set<string> = new Set(
  [...HARDCODED_AI_REVIEW_EMAILS, ...(process.env.AI_REVIEW_EMAILS ?? '').split(',')]
    .map(normalize)
    .filter(Boolean),
);

/** True se o e-mail pode revisar a IA (dado que a permissão já permita). */
export function isAiReviewer(email?: string | null): boolean {
  return AI_REVIEW_EMAILS.has(normalize(email));
}
