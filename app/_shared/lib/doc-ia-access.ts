// Trava HARDCODED do "Gerador de Documento (IA)" do card.
//
// Por decisão do Samuel (25/08/2026), este recurso é pessoal: o botão no
// CardDialog e as rotas /api/doc-ia NÃO passam pelo sistema de permissões
// (roles/overrides) de propósito — ninguém consegue se conceder acesso pela
// tela de permissões. Só quem estiver NESTA lista vê o botão e consegue usar
// as rotas.
//
// Para liberar para mais alguém: adicione o e-mail (ou id) aqui e faça deploy.

const HARDCODED_DOC_IA_EMAILS = ["mucaguibor@gmail.com"];
const HARDCODED_DOC_IA_USER_IDS = ["cmazo6j870000ia0gw5ppb486"]; // Samuel

function normalize(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

/** True se o usuário (id/e-mail da sessão) pode usar o Gerador de Documento IA. */
export function canUseDocIa(user?: { id?: string | null; email?: string | null } | null): boolean {
  if (!user) return false;
  if (user.id && HARDCODED_DOC_IA_USER_IDS.includes(user.id)) return true;
  return HARDCODED_DOC_IA_EMAILS.map(normalize).includes(normalize(user.email));
}
