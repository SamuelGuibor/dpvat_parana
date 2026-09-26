// Tipos da lista do inbox do WhatsApp, SEM nenhum import de servidor.
//
// Por que um arquivo só de tipos (auditoria de 24/09/2026): a lista, o hash e
// a busca saíram das server actions (fila serial por aba: o clique esperava o
// poll) para rotas GET, e a montagem foi para inbox-data.ts, que importa o
// Prisma. Se o navegador importasse o DTO de lá sem `import type`, o Prisma
// entraria no bundle do cliente e o build da Vercel quebraria. Aqui não há
// valor nenhum: no cliente, importe sempre com `import type`.

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
  // virou card) — filtro "Coluna do Kanban" do inbox.
  kanbanColumn: string | null;
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
 * GET /api/whatsapp/inbox/conversations (sem parâmetros): as conversas mais
 * recentes, até `LIST_PAGE`. `cursor` fica reservado para a sincronização
 * por delta (`?since=`): por enquanto vem sempre `null`.
 */
export interface InboxListResponse {
  items: WhatsAppConversationDTO[];
  cursor: string | null;
}

/** GET /api/whatsapp/inbox/conversations?contactId=: UMA conversa, ou `null` se o contato não tem conversa. */
export interface InboxItemResponse {
  item: WhatsAppConversationDTO | null;
}

/** GET /api/whatsapp/inbox/version: hash do que a lista exibe + total real de conversas (mesma query). */
export interface InboxVersionResponse {
  version: string;
  total: number;
}

/** GET /api/whatsapp/inbox/search?q=: conversas de TODO o histórico que casam com o termo. */
export interface InboxSearchResponse {
  items: WhatsAppConversationDTO[];
}
