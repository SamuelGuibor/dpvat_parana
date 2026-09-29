// Tipos dos avisos do cabeçalho da nova-dash (badges das abas e pop-up do
// dev), SEM nenhum import de servidor.
//
// Por que um arquivo só de tipos (auditoria de 24/09/2026): os badges saíram
// das server actions (fila serial por aba: voltar o foco enfileirava 3-4
// contagens na frente do clique) para UMA rota GET (/api/team/badges), e a
// montagem foi para header-badges.ts, que importa o Prisma. Se o navegador
// importasse os tipos de lá sem `import type`, o Prisma entraria no bundle do
// cliente e o build da Vercel quebraria. No cliente, importe sempre com
// `import type`.

/** Pop-up do setor de desenvolvimento ainda válido ("dê F5, saiu atualização"). */
export interface DevAlertDTO {
  id: string;
  title: string | null;
  message: string;
  authorName: string;
  createdAt: string;
}

/** GET /api/team/badges: tudo o que o cabeçalho conta, numa ida só. */
export interface HeaderBadgesResponse {
  /** Conversas do WhatsApp não lidas (só as não encerradas) — badge da aba WhatsApp. */
  whatsappUnread: number;
  /** Menções PENDENTES de quem está logado — badge da aba Menções e Tarefas. */
  mentionsPending: number;
  /** Pop-ups do dev ainda válidos (até 10, mais antigo primeiro); o "já visto" é filtrado no navegador. */
  devAlerts: DevAlertDTO[];
  /** Eventos da agenda que começam nas próximas 24 h (ou começaram há até 3 h). */
  eventsSoon: number;
}
