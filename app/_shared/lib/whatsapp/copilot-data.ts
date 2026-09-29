import { Prisma } from '@prisma/client';
import { db } from '@/app/_shared/lib/prisma';
import { inferCategory } from '@/app/_shared/lib/document-categories';
import { trySignGetUrl } from '@/app/_shared/lib/s3-presign';
import { runAfterResponse } from '@/app/_shared/lib/background';
import { parseDraftDocuments, planDraftMigration } from '@/app/_shared/utils/draft-documents';
import { summarizeConversationToCard } from './assist';
import type { ClientDocumentDTO, ClientInfoFields, ClientInfoResult, CopilotResponse } from './copilot-types';

// Leituras da coluna Copiloto do inbox: a ficha do cliente e os documentos da
// conversa.
//
// Sem "use server" e SEM guarda de acesso: quem chama já passou pela guarda —
// a rota GET /api/whatsapp/inbox/copilot/<contactId> (`teamRoute`: cargo do
// banco + trava de IP) e as actions de client-info.ts/client-documents.ts.
// Nunca exponha estas funções numa rota ou action sem guarda (a ficha traz
// CPF e RG).
//
// Por que existe (auditoria de 24/09/2026, THR-9): abrir uma conversa fazia 2
// server actions em série (ficha, depois documentos), cada uma relendo o
// contato, e as actions de uma aba saem numa fila SERIAL — o clique do
// atendente esperava. `loadCopilot` lê o contato UMA vez e devolve as duas
// coisas numa ida só, por GET.
//
// O vínculo contato ↔ cliente é pelo telefone: se já existe um User com o
// mesmo número, a ficha lê/edita direto o cadastro. Se não existe, os campos
// ficam como rascunho na conversa (whatsapp_contacts.clientDraft) até alguém
// clicar em "Adicionar cliente". Os documentos do rascunho (draftDocuments)
// viram Document do card em qualquer vínculo (telefone ou "Adicionar cliente").

// Campos editáveis pela ficha (subset do User relevante pro atendimento). O
// tipo ClientInfoFields (copilot-types.ts) deriva desta lista.
export const CLIENT_FIELDS = [
  'name', 'cpf', 'rg', 'email', 'data_nasc', 'data_acidente',
  'estado_civil', 'profissao', 'nome_mae', 'cidade', 'estado',
  'rua', 'bairro', 'numero', 'cep', 'hospital', 'lesoes', 'obs',
  // Preenchidos só quando o cliente informa por conta própria (o bot não pede).
  'telefone_secundario', 'rede_social',
] as const;

/** Colunas lidas do User vinculado: os campos da ficha + o nº do card. */
const USER_SELECT = Object.fromEntries(
  [...CLIENT_FIELDS, 'cardNumber'].map((f) => [f, true]),
) as Record<string, true>;

/** Tudo o que a ficha e os documentos leem do contato: uma consulta por abertura. */
const CONTACT_SELECT = {
  id: true,
  phone: true,
  name: true,
  userId: true,
  clientDraft: true,
  draftDocuments: true,
  aiFilledFields: true,
  hospitalHint: true,
} satisfies Prisma.WhatsAppContactSelect;

type CopilotContact = Prisma.WhatsAppContactGetPayload<{ select: typeof CONTACT_SELECT }>;

/** Quem abriu a conversa: vira o autor do resumo de vínculo no card. */
export interface CopilotAgent {
  id: string;
  name: string;
}

/**
 * Procura um User pelo telefone do contato (últimos 8 dígitos + conferência
 * de DDD em JS) — cobre diferenças de máscara e o 9º dígito do celular.
 */
export async function findUserByPhone(phone: string): Promise<{ id: string } | null> {
  const digits = phone.replace(/\D/g, '');
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;

  const rows = await db.$queryRaw<{ id: string; telefone: string | null; telefone_secundario: string | null }[]>(
    Prisma.sql`
      SELECT id, telefone, telefone_secundario FROM "User"
      WHERE right(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), 8) = ${last8}
         OR right(regexp_replace(coalesce(telefone_secundario, ''), '\\D', '', 'g'), 8) = ${last8}
      LIMIT 5
    `,
  );
  if (!rows.length) return null;

  // DDD do contato (formato Meta: 55 + DDD + número). Se algum candidato
  // bater o DDD também, prefere ele; senão fica com o primeiro dos 8 dígitos.
  const ddd = digits.startsWith('55') ? digits.slice(2, 4) : digits.slice(0, 2);
  const withDdd = rows.find((r) =>
    [r.telefone, r.telefone_secundario].some((t) => {
      const d = (t ?? '').replace(/\D/g, '');
      const dd = d.startsWith('55') ? d.slice(2, 4) : d.slice(0, 2);
      return d.slice(-8) === last8 && dd === ddd;
    }),
  );
  return withDdd ?? rows[0];
}

/** Lista de campos marcados como preenchidos pela IA (whatsapp_contacts). */
function aiFieldList(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.keys(raw as Record<string, unknown>);
}

type UnsignedDoc = Omit<ClientDocumentDTO, 'url' | 'urlExpiresAt'>;

/** Assina todos de uma vez (HMAC local, sem ida à rede): nenhuma action por linha. */
async function withSignedUrls(docs: UnsignedDoc[]): Promise<ClientDocumentDTO[]> {
  const signed = await Promise.all(docs.map((d) => trySignGetUrl(d.key, { inline: true, fileName: d.name })));
  return docs.map((d, i) => ({ ...d, url: signed[i]?.url ?? null, urlExpiresAt: signed[i]?.expiresAt ?? null }));
}

/**
 * Documentos pessoais do card (sem processo — não são de um processo
 * específico), fora da lixeira, do mais antigo ao mais novo.
 */
async function cardDocuments(userId: string): Promise<ClientDocumentDTO[]> {
  const docs = await db.document.findMany({
    where: { userId, processId: null, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, key: true, name: true, uploadedAt: true },
  });
  return withSignedUrls(
    docs.map((d) => ({ id: d.id, key: d.key, name: d.name, uploadedAt: d.uploadedAt.toISOString() })),
  );
}

/** Documentos do rascunho (contato ainda sem card): o id é a própria key. */
function draftDocumentsOf(raw: unknown): Promise<ClientDocumentDTO[]> {
  return withSignedUrls(
    parseDraftDocuments(raw).map((d) => ({ id: d.key, key: d.key, name: d.name, uploadedAt: d.uploadedAt ?? '' })),
  );
}

/**
 * Resolve o vínculo: o userId já salvo ou o match por telefone, memorizado.
 *
 * Vínculo atômico (`updateMany` só onde userId ainda é null): duas abas
 * abrindo a mesma conversa juntas — ou o SWR repetindo o GET — só vinculam (e
 * resumem) uma vez. Quem perde a corrida segue como cadastrado, sem resumo
 * novo, com o vínculo que ficou gravado.
 */
async function resolveUserLink(
  contact: CopilotContact,
  agent: CopilotAgent,
): Promise<{ userId: string | null; justLinked: boolean }> {
  if (contact.userId) return { userId: contact.userId, justLinked: false };

  const found = await findUserByPhone(contact.phone);
  if (!found) return { userId: null, justLinked: false };

  const link = await db.whatsAppContact.updateMany({
    where: { id: contact.id, userId: null },
    data: { userId: found.id },
  });
  if (link.count === 1) {
    // Acabou de VINCULAR a conversa a um card → resumo automático do
    // histórico vira comentário no card. Sai do caminho da resposta: a ficha,
    // os links das mídias e o envio esperavam os 2-4 s da IA. runAfterResponse
    // usa o waitUntil: a Vercel não congela a função antes de o resumo gravar
    // o comentário e o log wa_summary com metadata.usage (a IA já foi paga no
    // micro; sem o log o gasto sumia do Canto da IA). O teto continua sendo o
    // maxDuration de quem chama (a rota do Copiloto declara 60 s).
    runAfterResponse('resumo de vínculo', () =>
      summarizeConversationToCard(contact.id, { userId: found.id }, agent));
    return { userId: found.id, justLinked: true };
  }

  const fresh = await db.whatsAppContact.findUnique({
    where: { id: contact.id },
    select: { userId: true },
  });
  return { userId: fresh?.userId ?? null, justLinked: false };
}

interface CopilotParts {
  clientInfo: ClientInfoResult;
  /** null quando quem chamou pediu só a ficha. */
  documents: ClientDocumentDTO[] | null;
}

/**
 * Ordem: contato → vínculo (pode gravar o userId agora) → user e documentos em
 * paralelo. Os documentos dependem do userId resolvido aqui, por isso não vão
 * no mesmo Promise.all do contato.
 */
async function buildCopilot(
  contactId: string,
  agent: CopilotAgent,
  opts: { documents: boolean },
): Promise<CopilotParts | null> {
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId }, select: CONTACT_SELECT });
  if (!contact) return null;

  const { userId, justLinked } = await resolveUserLink(contact, agent);

  if (userId) {
    const [user, docs] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: USER_SELECT }),
      opts.documents ? cardDocuments(userId) : Promise.resolve(null),
    ]);
    if (user) {
      // Documento anexado na ficha antes de o card existir: vira arquivo do
      // card no vínculo de agora e, para contato vinculado com rascunho preso
      // (vínculo por telefone antigo não migrava), na próxima abertura. O
      // parse evita abrir transação em toda abertura sem rascunho.
      const migratedDrafts = parseDraftDocuments(contact.draftDocuments).length
        ? await migrateDraftDocuments(contactId, userId)
        : 0;
      const u = user as unknown as Record<string, string | null> & { cardNumber?: number | null };
      const fields: ClientInfoFields = {};
      for (const key of CLIENT_FIELDS) fields[key] = u[key] ?? null;
      // Contato vinculado a um card → o nome do cadastro é o nome oficial. O
      // contato nasce com o apelido do perfil do WhatsApp, que é o que o bot e
      // a lista do inbox usam; alinha aqui para o cliente parar de ser chamado
      // pelo apelido depois de a equipe ter corrigido o nome no card.
      const cardName = u.name?.trim();
      if (cardName && cardName !== contact.name) {
        await db.whatsAppContact.update({ where: { id: contactId }, data: { name: cardName } });
      }
      // Rascunho que acabou de virar Document: a lista lida em paralelo ainda
      // não o tinha — relê (só neste caso raro).
      const documents = opts.documents ? (migratedDrafts ? await cardDocuments(userId) : docs) : null;
      return {
        clientInfo: {
          registered: true,
          userId,
          phone: contact.phone,
          cardNumber: u.cardNumber ?? null,
          fields,
          aiFields: aiFieldList(contact.aiFilledFields),
          hospitalHint: contact.hospitalHint ?? null,
          ...(justLinked ? { justLinked } : {}),
          ...(migratedDrafts ? { migratedDrafts } : {}),
        },
        documents,
      };
    }
    // User apontado não existe mais → limpa o vínculo e cai pro rascunho.
    await db.whatsAppContact.update({ where: { id: contactId }, data: { userId: null } });
  }

  const draft = (contact.clientDraft ?? {}) as ClientInfoFields;
  return {
    clientInfo: {
      registered: false,
      userId: null,
      phone: contact.phone,
      cardNumber: null,
      fields: { name: contact.name ?? null, ...draft },
      aiFields: aiFieldList(contact.aiFilledFields),
      hospitalHint: contact.hospitalHint ?? null,
    },
    documents: opts.documents ? await draftDocumentsOf(contact.draftDocuments) : null,
  };
}

/**
 * Ficha + documentos da conversa numa ida só (GET do Copiloto). `null` =
 * contato não existe. ESCREVE no banco na 1ª abertura de quem tem card pelo
 * telefone (vínculo, resumo no card, rascunhos migrados, nome alinhado) — de
 * forma idempotente, porque o SWR pode repetir a chamada.
 */
export async function loadCopilot(contactId: string, agent: CopilotAgent): Promise<CopilotResponse | null> {
  const parts = await buildCopilot(contactId, agent, { documents: true });
  return parts && { clientInfo: parts.clientInfo, documents: parts.documents ?? [] };
}

/** Só a ficha (retorno de salvar/criar card e da action antiga). Lança se o contato não existe. */
export async function loadClientInfo(contactId: string, agent: CopilotAgent): Promise<ClientInfoResult> {
  const parts = await buildCopilot(contactId, agent, { documents: false });
  if (!parts) throw new Error('Contato não encontrado.');
  return parts.clientInfo;
}

/**
 * Só os documentos: do card vinculado (sem refazer o vínculo por telefone) ou
 * do rascunho. É o retorno das mutações de documento. Lança se o contato não
 * existe.
 */
export async function loadClientDocuments(contactId: string): Promise<ClientDocumentDTO[]> {
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { userId: true, draftDocuments: true },
  });
  if (!contact) throw new Error('Contato não encontrado.');
  return contact.userId ? cardDocuments(contact.userId) : draftDocumentsOf(contact.draftDocuments);
}

/**
 * Move os documentos anexados como rascunho na conversa pro cadastro real do
 * cliente. Devolve quantos rascunhos saíram do contato (0 = nada a migrar,
 * outra chamada já migrou, ou falhou).
 *
 * Reivindica o rascunho numa transação com a linha do contato travada (FOR
 * UPDATE): duas abas abrindo a mesma conversa, ou a ficha e o "Adicionar
 * cliente" juntos, esperam uma pela outra, e a segunda já lê o rascunho vazio.
 * Ler o JSON fora da trava deixava as duas criarem os mesmos documentos.
 *
 * Best-effort: se falhar, a transação desfaz tudo (o rascunho continua lá) e a
 * próxima abertura da conversa tenta de novo; a ficha nunca quebra por isso.
 */
export async function migrateDraftDocuments(contactId: string, userId: string): Promise<number> {
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ draftDocuments: unknown }[]>(Prisma.sql`
        SELECT "draftDocuments" FROM whatsapp_contacts WHERE id = ${contactId} FOR UPDATE
      `);
      const drafts = parseDraftDocuments(rows[0]?.draftDocuments);
      if (!drafts.length) return 0;

      // Sem filtro de deletedAt de propósito: key na lixeira do card também
      // conta (é restaurada em vez de ganhar uma 2ª linha). Uma linha por key
      // para o mesmo arquivo não aparecer duas vezes na aba Arquivos do card.
      const existing = await tx.document.findMany({
        where: { userId, key: { in: drafts.map((d) => d.key) } },
        select: { id: true, key: true, deletedAt: true },
      });
      const plan = planDraftMigration(drafts, existing);

      if (plan.create.length) {
        await tx.document.createMany({
          // Pasta escolhida no "Anexar selecionadas" vence; sem ela, pelo nome.
          data: plan.create.map((d) => ({ userId, key: d.key, name: d.name, category: d.category ?? inferCategory(d.name) })),
        });
      }
      if (plan.restoreIds.length) {
        await tx.document.updateMany({
          where: { id: { in: plan.restoreIds } },
          data: { deletedAt: null, deletedBy: null },
        });
      }
      await tx.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: Prisma.DbNull } });
      return drafts.length;
    });
  } catch (err) {
    console.error('[WHATSAPP FICHA] Falha ao migrar rascunhos de documentos para o card:', contactId, err);
    return 0;
  }
}
