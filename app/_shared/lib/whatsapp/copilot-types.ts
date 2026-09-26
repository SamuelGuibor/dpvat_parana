// Tipos da coluna Copiloto do inbox (ficha do cliente + documentos), SEM
// nenhum import de servidor.
//
// Por que um arquivo só de tipos (auditoria de 24/09/2026, THR-9): a ficha e
// os documentos eram 2 server actions em série a cada abertura de conversa
// (fila serial por aba: o clique esperava), e viraram UMA rota GET
// (/api/whatsapp/inbox/copilot/<contactId>). A montagem foi para
// copilot-data.ts, que importa o Prisma: se o navegador importasse os tipos de
// lá sem `import type`, o Prisma entraria no bundle do cliente e o build da
// Vercel quebraria. No cliente, importe sempre com `import type`.
//
// A lista de campos da ficha (`CLIENT_FIELDS`) mora em copilot-data.ts e o
// tipo `ClientInfoFields` deriva dela. O `import type` abaixo some na
// compilação: não arrasta o servidor para o navegador.
import type { CLIENT_FIELDS } from './copilot-data';

/** Nome de um campo editável da ficha (é também o nome da coluna no `User`). */
type ClientFieldKey = (typeof CLIENT_FIELDS)[number];

export type ClientInfoFields = Partial<Record<ClientFieldKey, string | null>>;

export interface ClientInfoResult {
  registered: boolean;
  userId: string | null;
  phone: string;
  cardNumber: number | null;
  fields: ClientInfoFields;
  /** Campos preenchidos pela IA (ganham selo na ficha até alguém editar). */
  aiFields: string[];
  /** Hospital citado pelo cliente — a IA nunca preenche o select. */
  hospitalHint: string | null;
  /**
   * A conversa acabou de ser vinculada ao card pelo telefone nesta leitura.
   * Só o bundle antigo (action getClientInfo, mantida por um deploy) usa: ele
   * disparava 'wa-docs-changed' para a aba Arquivos recarregar. No GET do
   * Copiloto os documentos já vêm na mesma resposta, lidos depois do vínculo.
   */
  justLinked?: boolean;
  /** Rascunhos de documento que viraram Document do card nesta leitura (mesmo uso do `justLinked`). */
  migratedDrafts?: number;
}

export interface ClientDocumentDTO {
  id: string; // id do Document (registrado) ou key (rascunho)
  key: string;
  name: string;
  uploadedAt: string;
  // URL de leitura (inline, com o NOME do documento) assinada em lote no
  // servidor: a aba Arquivos mostra miniatura e áudio sem uma action por
  // linha. null = key fora da allowlist (documento antigo): a linha cai no
  // fallback do media-url-cache (downloadFileFromS3 consulta a tabela).
  url?: string | null;
  urlExpiresAt?: string | null;
}

/**
 * Resposta do "Anexar selecionadas" (attachConversationMediaBatch). Recusa
 * esperada (seleção vazia, acima do teto, mídia de outra conversa) volta como
 * `ok: false` com o texto para o toast: erro lançado por server action chega
 * mascarado em produção e a tela não saberia dizer o motivo.
 */
export type AttachMediaBatchResult =
  | {
    ok: true;
    /** Lista nova de documentos (card ou rascunho), para trocar no cache do Copiloto. */
    documents: ClientDocumentDTO[];
    /** Mídias que viraram documento agora (novas ou restauradas da lixeira). */
    added: number;
    /** Já estavam no card/ficha: nada mudou nelas. */
    alreadyAttached: number;
  }
  | { ok: false; error: string };

/**
 * GET /api/whatsapp/inbox/copilot/<contactId>: a ficha e os documentos da
 * conversa numa ida só. Contato vinculado → documentos pessoais do card
 * (fora da lixeira); sem card → os do rascunho da conversa.
 */
export interface CopilotResponse {
  clientInfo: ClientInfoResult;
  documents: ClientDocumentDTO[];
}
