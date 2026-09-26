// Chat geral da equipe DESLIGADO de propósito (14/09/2026, decisão do
// escritório: a equipe usa o Discord e o presencial; a aba ficava em desuso).
// O código continua preservado — para voltar, mude para `true`.
//
// A flag mora aqui (e não dentro da sidebar) porque também desliga os polls
// do chat: com ela `false`, `useUnread` não consulta /api/chat/read.
// Não reative sem pedido (CLAUDE.md, "Features desligadas de propósito").
export const TEAM_CHAT_ENABLED = false;
