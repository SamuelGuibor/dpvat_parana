// Tipos da lista do inbox do WhatsApp, SEM nenhum import de servidor.
//
// Por que um arquivo só de tipos (auditoria de 24/09/2026): a lista, o hash e
// a busca saíram das server actions (fila serial por aba: o clique esperava o
// poll) para rotas GET, e a montagem foi para inbox-data.ts, que importa o
// Prisma. Se o navegador importasse o DTO de lá sem `import type`, o Prisma
// entraria no bundle do cliente e o build da Vercel quebraria. Aqui não há
// valor nenhum: no cliente, importe sempre com `import type`.

import type { CollectRequestDTO } from '@/app/_shared/utils/collect-request';

export interface WhatsAppConversationDTO {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  status: string; // bot | queued | human | closed
  qualified: boolean | null; // só relevante quando status="closed"
  // Categoria do desfecho (só relevante quando status="closed"): qualificado |
  // nao_qualificado | nq_* (sub-motivo) | perguntas | novo_acidente | transferido.
  closeCategory: string | null;
  // Rótulo humano do desfecho, já resolvido no servidor (inclui os motivos
  // dinâmicos da tabela whatsapp_close_reasons) — ex.: "Não qualificada — sem
  // cobertura INSS". Vai no chip "Encerrada · {label}" e nos grupos da pasta.
  closeCategoryLabel: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  lastMessageAt: string;
  lastReadAt: string | null;
  lastInboundAt: string | null; // controla a janela de 24h da Meta
  lastMessagePreview: string | null;
  // Quem falou por último (para o selinho de atendente na lista): nome do
  // atendente da última mensagem enviada, ou null se foi o cliente.
  lastMessageAuthorName: string | null;
  lastMessageFromBot: boolean;
  // A última mensagem foi do CLIENTE (direction "in") — usado pra destacar na
  // lista quem está esperando resposta da equipe.
  lastMessageFromClient: boolean;
  // Status da ÚLTIMA mensagem quando ela é nossa (sent/delivered/read) — o
  // "radar de vácuo": read + horas sem resposta = cliente viu e ignorou.
  lastMessageStatus: string | null;
  // Tipo de mídia da última mensagem (image/*, video/*, audio/*, application/*),
  // null quando é só texto — vira ícone na prévia da lista.
  lastMessageMediaType: string | null;
  // Última nota interna que o BOT deixou ao transferir pra fila (o "por que
  // caiu na fila" que hoje só aparecia dentro do Copiloto) — mostrado direto
  // na linha da Fila pra decidir quem atender primeiro sem abrir a conversa.
  handoffReason: string | null;
  // Origem do lead (first-touch de Click-to-WhatsApp ads): facebook | instagram
  // | null (orgânico). Vira o logo no canto do avatar.
  adPlatform: string | null;
  // Quando a conversa começou — âncora da linha de jornada na thread.
  createdAt: string;
  // Resumo do caso pro card rico (direto da ficha, sem chamada de IA):
  caseLesoes: string | null;
  caseCidade: string | null;
  caseDataAcidente: string | null;
  // O que trava o CONTRATO (única pendência que aparece na tela): o CPF.
  hasCpf: boolean;
  // Provocações do ciclo de recuperação já enviadas (0-5) — exibido quando
  // status="standby" como "1ª de 5".
  recoveryAttempts: number;
  // Pedido em aberto que a IA está recolhendo (30/09/2026): texto do Devolver,
  // lista detectada do atendente ou fluxo de lista que a IA mandou. null =
  // nada em aberto. Barra "IA recolhendo" na thread e pill "Lista" na linha.
  // Aninhado de propósito: vazio custa ~20 bytes por linha nas 1.000 da lista.
  collectRequest: CollectRequestDTO | null;
  // Não lida = o cliente mandou algo que ninguém da equipe viu (unreadCount >
  // 0) ou alguém usou "Marcar como não lida". Mensagem de SAÍDA não conta
  // (regra em computeUnread, app/_shared/utils/whatsapp-inbox.ts).
  unread: boolean;
  // Quantas mensagens RECEBIDAS desde a última leitura de qualquer atendente —
  // o badge verde de contagem (estilo WhatsApp) na lista.
  unreadCount: number;
  // Alguém usou "Marcar como não lida" (12/08/2026): o badge vira um marcador
  // próprio em vez da contagem (que seria o histórico inteiro, "99+").
  manualUnread: boolean;
  // Coluna do kanban do cliente vinculado (null quando a conversa ainda não
  // virou card): NOME da Label do card (fallback: `User.role`, a cópia do
  // nome) e o id dela, que é o que o filtro "Coluna do Kanban" usa (o nome
  // diverge do `role` quando a coluna é renomeada).
  kanbanColumn: string | null;
  kanbanLabelId: string | null;
  // Contato em opt-out (pediu pra parar ou foi bloqueado pela equipe).
  optedOut: boolean;
  // Número da empresa que atende esta conversa (multi-número): o inbox filtra
  // e etiqueta por ele. Null em conversa legada ainda não adotada.
  numberId: string | null;
  // Número desativado na tela Números: histórico só para consulta — a tela
  // esconde o composer e o servidor recusa qualquer envio.
  readOnly: boolean;
  tags: { id: string; name: string; color: string }[];
}

/**
 * GET /api/whatsapp/inbox/conversations (sem parâmetros): todas as conversas
 * abertas + as `LIST_PAGE` encerradas mais recentes (tetos por grupo em
 * inbox-delta.ts). `cursor` = now() do BANCO no início da leitura
 * (ISO), o ponto de partida do delta (`?since=`); `null` só em servidor
 * antigo. `total` = conversas no banco (badge do topo; a lista é capada).
 */
export interface InboxListResponse {
  items: WhatsAppConversationDTO[];
  cursor: string | null;
  total: number;
}

/**
 * GET /api/whatsapp/inbox/conversations?since=<ISO>: só as conversas que
 * mudaram desde `since` (conversa, tag aplicada, contato ou card vinculado).
 * `full: true` = o delta não vale (since inválido ou com mais de 24 h, ou
 * mudou coisa demais): `items` vem vazio e o cliente busca a lista inteira.
 * `total` = conversas no banco; `null` quando a rota nem chegou a ler.
 */
export interface InboxDeltaResponse {
  items: WhatsAppConversationDTO[];
  cursor: string | null;
  full: boolean;
  total: number | null;
}

/** GET /api/whatsapp/inbox/conversations?contactId=: UMA conversa, ou `null` se o contato não tem conversa. */
export interface InboxItemResponse {
  item: WhatsAppConversationDTO | null;
}

/**
 * GET /api/whatsapp/inbox/version: hash do que a lista exibe + total real de
 * conversas (mesma query). TRANSITÓRIA: o cliente atual sincroniza pelo delta
 * (`?since=`); a rota fica para abas com o bundle anterior e sai quando o
 * delta estabilizar.
 */
export interface InboxVersionResponse {
  version: string;
  total: number;
}

/**
 * GET /api/whatsapp/inbox/search?q=&tag=&from=&to=&label=&number=&fila=&skip=:
 * conversas de TODO o histórico que casam com os filtros (busca, tag, data de
 * entrada, coluna do Kanban; número e "Em fila" junto deles), uma página de
 * `INBOX_FILTER_PAGE` a partir de `skip`. `total` = quantas casam no banco
 * inteiro (o "X de Y" do inbox). Sem filtro de servidor → `{ items: [], total: 0 }`.
 */
export interface InboxSearchResponse {
  items: WhatsAppConversationDTO[];
  total: number;
}

/** Uma coluna do Kanban no filtro do inbox: `count` = conversas com card NÃO arquivado nela. */
export interface InboxColumnOption {
  id: string;
  name: string;
  count: number;
}

/** GET /api/whatsapp/inbox/columns: colunas do Kanban na ordem do quadro. */
export interface InboxColumnsResponse {
  items: InboxColumnOption[];
}
