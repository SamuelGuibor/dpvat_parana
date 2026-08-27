import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { Prisma } from "@prisma/client";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { sendText, sendTemplate, type TemplateHeaderMedia } from "./client";
// import { OPT_OUT_FOOTER } from "./opt-out";
import { whatsappChannelId, whatsappRecipients, type WhatsAppMessageDTO } from "./service";
import { renderTemplateThreadText } from "./template-text";

// Envio de mensagens de SISTEMA pro WhatsApp do cliente — usado pelas
// automações do kanban (card entrou numa coluna) e pelo checklist de
// progresso do card (status avançou).
//
// Regra da Meta respeitada aqui:
//   - Janela de 24h ABERTA (cliente mandou mensagem nas últimas 24h)
//     → pode texto livre.
//   - Janela EXPIRADA → só template aprovado na Meta. Se nenhum template
//     estiver configurado, o envio é pulado (registramos no log o motivo).

/** Normaliza telefone BR para o formato E.164 sem "+" (55 + DDD + número). */
export function normalizePhoneBR(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Remove zeros de operadora à esquerda (ex: 041...).
  digits = digits.replace(/^0+/, "");
  if (!digits.startsWith("55")) digits = `55${digits}`;
  // 55 + DDD(2) + número(8 ou 9)
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

type ResolvedContact = {
  id: string;
  phone: string;
  name: string | null;
  optedOut: boolean;
  optedInAt: Date | null;
  numberId: string | null;
};

const CONTACT_FIELDS = {
  id: true, phone: true, name: true, optedOut: true, optedInAt: true, numberId: true,
} as const;

/**
 * Resolve o contato do WhatsApp a partir do telefone do card. Primeiro tenta
 * casar com um contato existente pelos últimos 8 dígitos (cobre máscara e o
 * 9º dígito); se não existir, cria um contato novo com o número normalizado.
 *
 * MULTI-NÚMERO (27/08/2026): o MESMO telefone existe como dois contatos quando
 * o cliente falou com as duas linhas da empresa (231 casos hoje) — e a busca
 * por telefone escolhia um deles sem critério (`LIMIT 1` sem ordenação). Com
 * `wantedNumberId` a resolução passa a ser determinística: o contato DAQUELA
 * linha; se ele ainda não existe, um contato legado (numberId null) é adotado
 * pela linha, e só em último caso um contato novo é criado — herdando opt-out
 * e opt-in do gêmeo (quem pediu para não receber, não recebe por linha nenhuma).
 */
export async function findOrCreateContactByPhone(
  rawPhone: string,
  name?: string | null,
  wantedNumberId?: string | null,
): Promise<ResolvedContact | null> {
  const digits = rawPhone.replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;

  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "whatsapp_contacts"
    WHERE right(regexp_replace(phone, '\\D', '', 'g'), 8) = ${last8}
  `);
  const twins = rows.length
    ? await db.whatsAppContact.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: CONTACT_FIELDS,
        orderBy: { createdAt: "asc" },
      })
    : [];

  if (twins.length) {
    if (!wantedNumberId) {
      // Sem linha pedida: mantém o comportamento antigo, mas determinístico —
      // um contato já vinculado a uma linha vale mais que um legado solto.
      return twins.find((t) => t.numberId) ?? twins[0];
    }
    const exact = twins.find((t) => t.numberId === wantedNumberId);
    if (exact) return exact;

    const legacy = twins.find((t) => !t.numberId);
    if (legacy) {
      const adopted = await db.whatsAppContact.update({
        where: { id: legacy.id },
        data: { numberId: wantedNumberId },
        select: CONTACT_FIELDS,
      });
      return adopted;
    }

    // Só existe gêmeo em OUTRA linha → abre o contato desta linha herdando o
    // consentimento (opt-out é global por decisão do cliente; o opt-in é o
    // aceite dele com o escritório, não com um chip específico).
    const donor = twins[0];
    const normalizedTwin = normalizePhoneBR(rawPhone) ?? donor.phone;
    const created = await db.whatsAppContact.create({
      data: {
        phone: normalizedTwin,
        name: donor.name ?? name ?? null,
        numberId: wantedNumberId,
        optedOut: donor.optedOut,
        optedInAt: donor.optedInAt,
        optInSource: donor.optedInAt ? "manual" : null,
        userId: null,
      },
      select: CONTACT_FIELDS,
    });
    return created;
  }

  const normalized = normalizePhoneBR(rawPhone);
  if (!normalized) return null;
  // phone deixou de ser unique global (multi-número) → find-or-create manual.
  // Sem linha pedida o contato nasce sem numberId e envia pelo número default;
  // o webhook o adota quando o cliente responder.
  const existing = await db.whatsAppContact.findFirst({
    where: { phone: normalized, ...(wantedNumberId ? { numberId: wantedNumberId } : {}) },
    select: CONTACT_FIELDS,
  });
  if (existing) return existing;
  const created = await db.whatsAppContact.create({
    data: { phone: normalized, name: name ?? null, numberId: wantedNumberId ?? null },
    select: CONTACT_FIELDS,
  });
  return created;
}

/**
 * Linha (WhatsAppNumber) que deve enviar. O catálogo de templates é POR WABA:
 * um template aprovado na linha B simplesmente NÃO EXISTE para a linha A, e o
 * envio era pulado com "template não cadastrado". Quando o chamador não diz a
 * linha, deduzimos pelo dono do template — assim uma automação antiga, feita
 * antes do multi-número, passa a sair pela linha certa sem ser reeditada.
 */
async function resolveNumberForTemplate(templateName?: string | null): Promise<string | null> {
  if (!templateName) return null;
  const rows = await db.whatsAppTemplate.findMany({
    where: { name: templateName, status: "APPROVED" },
    select: { numberId: true },
  });
  const ids = [...new Set(rows.map((r) => r.numberId).filter((v): v is string => !!v))];
  // Em mais de uma linha o nome é ambíguo — deixa a resolução normal decidir.
  return ids.length === 1 ? ids[0] : null;
}

/** Janela de 24h da Meta: aberta se o CLIENTE mandou mensagem nas últimas 24h. */
export async function isWindowOpen(contactId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lastInbound = await db.whatsAppMessage.findFirst({
    where: { contactId, direction: "in", createdAt: { gte: since } },
    select: { id: true },
  });
  return !!lastInbound;
}

// Cap de frequência anti-spam: no máximo 1 mensagem PROATIVA (automação ou
// progresso) por contato dentro desta janela. Rajada de avisos idênticos é o
// padrão que o classificador de spam da Meta procura.
const SYSTEM_COOLDOWN_MS =
  Number(process.env.WHATSAPP_SYSTEM_COOLDOWN_HOURS ?? 6) * 60 * 60_000;

// Depois de N proativas seguidas sem NENHUMA resposta do cliente, a equipe é
// alertada (contato por outro canal?) — quem nunca responde é quem denuncia.
// O envio NÃO é bloqueado; o alerta dispara uma única vez, ao cruzar o limiar.
const UNANSWERED_ALERT_THRESHOLD = 3;

/** Persiste a mensagem enviada pelo sistema e transmite pro inbox da equipe. */
async function persistSystemMessage(
  contact: { id: string; phone: string; name: string | null; numberId?: string | null },
  waMessageId: string,
  body: string,
  systemSource: string,
): Promise<void> {
  const message = await db.whatsAppMessage.create({
    data: {
      contactId: contact.id,
      numberId: contact.numberId ?? null,
      waMessageId,
      direction: "out",
      body,
      status: "sent",
      sentByBot: true,
      systemSource,
    },
  });
  const conversation = await db.whatsAppConversation.upsert({
    where: { contactId: contact.id },
    update: { lastMessageAt: new Date() },
    create: { contactId: contact.id, numberId: contact.numberId ?? null },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contact.id),
    contactId: contact.id,
    direction: "out",
    body,
    mediaKey: null,
    mediaType: null,
    status: "sent",
    sentByBot: true,
    authorId: null,
    createdAt: message.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: conversation.status,
  };
  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });
}

/**
 * Silêncio prolongado: se esta foi a N-ésima proativa seguida sem NENHUMA
 * resposta do cliente, avisa a equipe (uma vez, ao cruzar o limiar) para
 * tentar contato por outro canal. Não bloqueia envios futuros. Best-effort:
 * falha aqui nunca derruba o envio que já aconteceu.
 */
async function alertIfUnanswered(
  contact: { id: string; phone: string; name: string | null },
  authorId: string,
  authorName: string,
): Promise<void> {
  try {
    const lastInbound = await db.whatsAppMessage.findFirst({
      where: { contactId: contact.id, direction: "in" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const unanswered = await db.whatsAppMessage.count({
      where: {
        contactId: contact.id,
        direction: "out",
        systemSource: { not: null },
        ...(lastInbound ? { createdAt: { gt: lastInbound.createdAt } } : {}),
      },
    });
    // Só no cruzamento exato do limiar — dispara uma única vez por "seca".
    if (unanswered !== UNANSWERED_ALERT_THRESHOLD) return;

    const label = contact.name ?? `+${contact.phone}`;
    const recipients = await whatsappRecipients();
    for (const recipientId of recipients) {
      await db.notification.create({
        data: {
          recipientId,
          authorId: "whatsapp-bot",
          authorName: "🤖 Bot WhatsApp",
          targetName: label,
          message: `WhatsApp: ${label} já recebeu ${unanswered} avisos automáticos sem responder nenhum — considere contato por telefone/outro canal.`,
          contactId: contact.id,
        },
      });
    }
    await logWhatsAppEvent({
      action: "wa_text",
      message: `alerta de silêncio: ${label} recebeu ${unanswered} mensagens automáticas sem responder`,
      authorId,
      authorName,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { automated: true, unansweredCount: unanswered },
    });
  } catch (err) {
    console.error("[WHATSAPP OUTBOUND] Falha no alerta de silêncio:", contact.id, err);
  }
}

export interface SystemSendInput {
  phone: string; // telefone do card (qualquer máscara)
  clientName?: string | null;
  /**
   * Contato EXATO a usar (multi-número). O mesmo telefone pode existir como
   * dois contatos, um por linha da empresa — resolver só pelo phone pode cair
   * no gêmeo da outra linha e o envio sai pelo número errado. Quando o chamador
   * já sabe o contato (ex.: ciclo de assinatura), deve passá-lo aqui.
   */
  contactId?: string;
  /**
   * Linha da empresa (WhatsAppNumber.id) que deve enviar. Sem isto, a linha é
   * deduzida do dono do template; sem template, vale a linha do contato (ou a
   * default). Ignorado quando `contactId` é passado — ali a thread já está
   * escolhida.
   */
  numberId?: string | null;
  /** Texto livre — usado quando a janela de 24h está aberta. */
  text: string;
  /**
   * Fallback fora da janela: nome de um template APROVADO na Meta (cadastro
   * local em whatsapp_templates) + variáveis já resolvidas. Sem isso, fora
   * da janela o envio é pulado.
   */
  templateName?: string | null;
  templateVars?: string[];
  /**
   * Variável do BOTÃO do template (sufixo dinâmico de URL, ex.: o token do
   * link de assinatura). Template AUTHENTICATION não precisa: o código do
   * botão "copiar" é deduzido da 1ª variável do corpo.
   */
  templateButtonVar?: string;
  /** Identificação de quem disparou (para auditoria nos logs). */
  authorId: string;
  authorName: string;
  /** Origem: "automation" | "progress" — vai pro metadata do log. */
  source: string;
  /**
   * Mensagem TRANSACIONAL pedida pelo próprio cliente naquele momento (ex.:
   * código de assinatura que ele solicitou na tela). Pula o cooldown anti-spam
   * de mensagens proativas — o cliente está esperando; segurar o envio é que
   * quebra o fluxo. Opt-out e janela/template continuam valendo.
   */
  transactional?: boolean;
}

export interface SystemSendResult {
  sent: boolean;
  via: "text" | "template" | null;
  reason?: string;
}

/**
 * Envia uma mensagem de sistema ao cliente respeitando a janela de 24h.
 * Nunca lança: qualquer falha vira { sent: false, reason } + log de auditoria.
 */
export async function sendSystemWhatsApp(input: SystemSendInput): Promise<SystemSendResult> {
  try {
    // Com contactId o envio usa AQUELE contato (e a linha dele); a resolução
    // por telefone fica só para quem não sabe o contato (ex.: envio por card).
    const wantedNumberId = input.numberId ?? (await resolveNumberForTemplate(input.templateName));
    const contact = input.contactId
      ? await db.whatsAppContact.findUnique({
          where: { id: input.contactId },
          select: { id: true, phone: true, name: true, optedOut: true, optedInAt: true, numberId: true },
        })
      : await findOrCreateContactByPhone(input.phone, input.clientName, wantedNumberId);
    if (!contact) return { sent: false, via: null, reason: input.contactId ? "contato não encontrado" : "telefone do card inválido" };
    if (contact.optedOut) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: contato pediu para não receber mensagens (opt-out)`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "opt-out" },
      });
      return { sent: false, via: null, reason: "contato pediu para não receber mensagens" };
    }

    // Cap de frequência: já houve proativa há menos de SYSTEM_COOLDOWN_MS?
    // Pula (o card avançando várias etapas de uma vez não vira rajada).
    // Transacional (OTP etc.) não conta aqui: foi o CLIENTE que pediu.
    const lastProactive = input.transactional ? null : await db.whatsAppMessage.findFirst({
      where: {
        contactId: contact.id,
        direction: "out",
        systemSource: { not: null },
        createdAt: { gte: new Date(Date.now() - SYSTEM_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (lastProactive) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: intervalo mínimo entre mensagens automáticas ainda não passou`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "cooldown" },
      });
      return { sent: false, via: null, reason: "intervalo mínimo entre mensagens automáticas ainda não passou" };
    }

    const windowOpen = await isWindowOpen(contact.id);

    if (windowOpen) {
      const body = input.text;
      const result = await sendText(contact.phone, body, undefined, contact.numberId);
      if (!result.waMessageId) {
        await logWhatsAppEvent({
          action: "wa_text",
          message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: a Meta rejeitou o envio (${result.error ?? "sem detalhe"})`,
          authorId: input.authorId,
          authorName: input.authorName,
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phone,
          metadata: { source: input.source, automated: true, skipped: true, reason: "meta rejeitou" },
        });
        return { sent: false, via: "text", reason: result.error ?? "Meta rejeitou o envio" };
      }
      await persistSystemMessage(contact, result.waMessageId, body, input.source);
      await logWhatsAppEvent({
        action: "wa_text",
        message: `enviou mensagem automática para ${contact.name ?? contact.phone}`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, preview: input.text.slice(0, 120) },
      });
      await alertIfUnanswered(contact, input.authorId, input.authorName);
      return { sent: true, via: "text" };
    }

    // Janela expirada → mensagem PROATIVA de verdade. A Meta exige opt-in
    // documentado: sem registro de aceite, o envio é pulado (e logado).
    if (!contact.optedInAt) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: contato sem opt-in registrado (nunca iniciou conversa nem aceitou receber mensagens)`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "sem opt-in" },
      });
      return { sent: false, via: null, reason: "contato sem opt-in registrado" };
    }

    // Janela expirada → só template aprovado.
    if (!input.templateName) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: janela de 24h expirada e nenhum template configurado`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "sem template" },
      });
      return { sent: false, via: null, reason: "janela de 24h expirada e nenhum template configurado" };
    }

    // name deixou de ser unique global: catálogo é por número/WABA. Prefere o
    // template do número do contato; cai no do catálogo legado (numberId null).
    const template = await db.whatsAppTemplate.findFirst({
      where: {
        name: input.templateName,
        OR: [{ numberId: contact.numberId }, { numberId: null }],
      },
      orderBy: { numberId: { sort: "desc", nulls: "last" } },
    });
    if (!template) {
      // Catálogo é por WABA: o template pode existir, só que em OUTRA linha.
      // Dizer isso poupa o "sincronize com a Meta" que não resolve nada.
      const owners = await db.whatsAppTemplate.findMany({
        where: { name: input.templateName },
        select: { numberId: true },
      });
      const ownerIds = [...new Set(owners.map((t) => t.numberId).filter((v): v is string => !!v))];
      const elsewhere = ownerIds.length
        ? await db.whatsAppNumber.findMany({ where: { id: { in: ownerIds } }, select: { label: true } })
        : [];
      const hint = elsewhere.length
        ? ` — ele existe na linha ${elsewhere.map((n) => `"${n.label}"`).join(" / ")}, mas o contato é atendido por outra linha`
        : " (sincronize com a Meta)";
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: template "${input.templateName}" não está no catálogo desta linha${hint}`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "sem template" },
      });
      return { sent: false, via: "template", reason: `template "${input.templateName}" não está no catálogo desta linha${hint}` };
    }
    // Desde 03/08/2026 o cadastro guarda TODOS os status da Meta (antes só os
    // aprovados). Sem esta guarda, um template em análise/reprovado seria
    // tentado e falharia lá na Meta, sem motivo legível para a equipe.
    if (template.status !== "APPROVED") {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: template "${input.templateName}" está ${template.status} na Meta`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "sem template" },
      });
      return { sent: false, via: "template", reason: `template "${input.templateName}" não está aprovado na Meta (${template.status})` };
    }
    // Aviso automático não tem de onde tirar a variável do cabeçalho — evita
    // um envio que a Meta recusaria por nº de parâmetros.
    if (/\{\{\s*\d+\s*\}\}/.test(template.headerText ?? "")) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: template "${input.templateName}" tem variável no cabeçalho`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "sem template" },
      });
      return { sent: false, via: "template", reason: `template "${input.templateName}" tem variável no cabeçalho — use um template sem variável no cabeçalho para avisos automáticos` };
    }
    const vars = (input.templateVars ?? []).slice(0, template.bodyVars);
    while (vars.length < template.bodyVars) vars.push("");

    // Cabeçalho de MÍDIA: a Meta exige a mídia em todo envio — usa a mídia
    // padrão do template (S3). Sem mídia definida, pula com aviso em vez de
    // deixar a Meta recusar sem contexto.
    let headerMedia: TemplateHeaderMedia | null = null;
    const mediaKind = template.headerFormat === "IMAGE" ? "image"
      : template.headerFormat === "VIDEO" ? "video"
        : template.headerFormat === "DOCUMENT" ? "document" : null;
    if (mediaKind) {
      if (!template.headerMediaKey) {
        await logWhatsAppEvent({
          action: "wa_text",
          message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: template "${template.name}" tem cabeçalho de mídia sem mídia definida`,
          authorId: input.authorId,
          authorName: input.authorName,
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phone,
          metadata: { source: input.source, automated: true, skipped: true, reason: "sem mídia do cabeçalho" },
        });
        return { sent: false, via: "template", reason: `template "${template.name}" tem cabeçalho de mídia — defina a mídia em Templates → Gerenciar` };
      }
      const s3ForHeader = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
      headerMedia = {
        kind: mediaKind,
        link: await getSignedUrl(
          s3ForHeader,
          new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: template.headerMediaKey }),
          { expiresIn: 3600 },
        ),
        filename: template.headerMediaKey.split("/").pop()?.replace(/^\d{10,}-/, ""),
      };
    }

    // AUTHENTICATION: o botão "copiar código" repete a variável do corpo (o
    // próprio código). Nos demais, vale o sufixo de URL passado pelo chamador.
    const buttonVar = template.category === "AUTHENTICATION" ? vars[0] : input.templateButtonVar;
    const result = await sendTemplate(contact.phone, template.name, vars, template.language, undefined, contact.numberId, headerMedia, buttonVar);
    if (!result.waMessageId) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: a Meta rejeitou o template "${template.name}" (${result.error ?? "sem detalhe"})`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "meta rejeitou" },
      });
      return { sent: false, via: "template", reason: result.error ?? "Meta rejeitou o template" };
    }

    // Sem headerVar: templates com variável no cabeçalho já foram barrados acima.
    const preview = renderTemplateThreadText(template, vars);
    await persistSystemMessage(contact, result.waMessageId, preview, input.source);
    await logWhatsAppEvent({
      action: "wa_template",
      message: `enviou o template automático "${template.name}" para ${contact.name ?? contact.phone}`,
      authorId: input.authorId,
      authorName: input.authorName,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { source: input.source, automated: true, templateName: template.name, vars },
    });
    await alertIfUnanswered(contact, input.authorId, input.authorName);
    return { sent: true, via: "template" };
  } catch (err) {
    console.error("[WHATSAPP OUTBOUND] Falha no envio de sistema:", err);
    return { sent: false, via: null, reason: String(err) };
  }
}
