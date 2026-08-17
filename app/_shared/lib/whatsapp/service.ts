import type { WhatsAppConversation, WhatsAppContact } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { downloadMediaToS3, sendText } from "./client";
import { isOptOutMessage, isExactOptOutCommand, isOptInMessage, OPT_OUT_CONFIRMATION } from "./opt-out";
import { captureConversation } from "./brain";
import { recordRecoveryEvent } from "./rule-events";

// Ingestão de eventos do webhook da WhatsApp Cloud API.
//
// Cada conversa de WhatsApp vira um "canal" no relay SSE já existente
// (channelId = "whatsapp:<contactId>"), então os funcionários com a tela
// aberta recebem em tempo real sem nenhuma mudança no relay do Railway.

// Mesma convenção de equipe do chat interno (chat-access.ts / api/presence).
const TEAM_ROLES = ["ADMIN", "ADMIN+", "ADMIN++"];

// Validade da ficha do bot entre conversas: reabertura dentro desta janela
// mantém botMemory/botState (a IA lembra do contato); além dela, conversa
// não-qualificada recomeça limpa. Qualificado nunca expira.
const STALE_CONTEXT_MS = 7 * 24 * 60 * 60_000;

export function whatsappChannelId(contactId: string): string {
  return `whatsapp:${contactId}`;
}

/** Todos os membros da equipe recebem o broadcast (a UI filtra por conversa). */
export async function whatsappRecipients(): Promise<string[]> {
  const team = await db.user.findMany({
    where: { role: { in: TEAM_ROLES } },
    select: { id: true },
  });
  return team.map((u) => u.id);
}

export interface WhatsAppMessageDTO {
  id: string;
  channelId: string;
  contactId: string;
  // id da Meta (mensagens recebidas) — o bot usa pra marcar como lida/digitando.
  waMessageId?: string | null;
  direction: string;
  body: string | null;
  mediaKey: string | null;
  mediaType: string | null;
  status: string;
  sentByBot: boolean;
  authorId: string | null;
  createdAt: string;
  contactName: string | null;
  contactPhone: string;
  conversationStatus: string;
  replyToId?: string | null;
  replyToBody?: string | null;
  replyToDirection?: string | null;
}

// Formato relevante de uma mensagem no payload do webhook da Meta
// (entry[].changes[].value.messages[]).
export interface IncomingWaMessage {
  id: string;
  from: string; // telefone E.164 sem "+"
  timestamp?: string;
  type: string; // text | image | audio | document | video | sticker | button | interactive | ...
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; caption?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  // Tipos sem texto — viram uma representação legível no extractBody (antes
  // caíam como body=null e o inbox mostrava um balão vazio).
  reaction?: { message_id?: string; emoji?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  // Presente quando o cliente RESPONDE (quote) uma mensagem.
  context?: { id?: string };
  // Presente em type="unsupported": a Meta não entrega o conteúdo (enquete,
  // evento, edição, visualização única...), mas manda o motivo aqui.
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
  // Presente quando a conversa começou por um anúncio Click-to-WhatsApp
  // (Facebook/Instagram). Base da atribuição de origem do lead.
  referral?: {
    source_url?: string;
    source_type?: string; // ad | post | page
    source_id?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    ctwa_clid?: string;
  };
}

// Facebook e Instagram usam o mesmo objeto referral; a plataforma é deduzida
// pela URL de origem do clique.
function detectAdPlatform(sourceUrl?: string): string {
  const url = (sourceUrl ?? "").toLowerCase();
  if (url.includes("instagram.com") || url.includes("ig.me")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.me") || url.includes("fb.com")) return "facebook";
  return "meta";
}

function extractBody(msg: IncomingWaMessage): string | null {
  switch (msg.type) {
    case "text":        return msg.text?.body ?? null;
    case "image":       return msg.image?.caption ?? null;
    case "video":       return msg.video?.caption ?? null;
    case "document":    return msg.document?.caption ?? null;
    case "button":      return msg.button?.text ?? null;
    case "interactive": return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
    // Áudio e figurinha viram anexo (baixados pro S3) — o balão renderiza o
    // player/imagem; o corpo fica null MESMO (o bot transcreve o áudio).
    case "audio":       return null;
    case "sticker":     return null;
    // Tipos sem texto: representação legível pro balão do inbox E pra IA
    // (antes viravam body=null → balão vazio + handoff cego pra fila).
    case "reaction":
      return msg.reaction?.emoji ? `Reagiu com ${msg.reaction.emoji}` : "Removeu a reação";
    // A Meta manda type="unsupported" quando o cliente usa um recurso que a
    // Cloud API não entrega: enquete, evento, mensagem editada, visualização
    // única etc. O conteúdo NÃO chega — só dá pra ver no aparelho.
    case "unsupported": {
      const err = msg.errors?.[0];
      const detail = err?.error_data?.details ?? err?.message ?? err?.title;
      return (
        "⚠️ O cliente enviou algo que o WhatsApp não entrega pela API (enquete, evento, mensagem editada ou visualização única). " +
        "Peça para reenviar como texto ou foto normal." +
        (detail ? `\n(Detalhe da Meta: ${detail}${err?.code ? ` — código ${err.code}` : ""})` : "")
      );
    }
    case "location": {
      const loc = msg.location;
      const label = [loc?.name, loc?.address].filter(Boolean).join(" — ");
      const coords = loc?.latitude != null && loc?.longitude != null ? ` (${loc.latitude}, ${loc.longitude})` : "";
      return `📍 Localização recebida${label ? `: ${label}` : ""}${coords}`;
    }
    case "contacts": {
      const list = (msg.contacts ?? [])
        .map((c) => [c.name?.formatted_name, c.phones?.[0]?.phone].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(", ");
      return `👤 Contato compartilhado${list ? `: ${list}` : ""}`;
    }
    default:            return `(mensagem não suportada: ${msg.type ?? "?"})`;
  }
}

function extractMediaId(msg: IncomingWaMessage): { id: string; filename?: string } | null {
  const media = msg.image ?? msg.audio ?? msg.video ?? msg.document ?? msg.sticker;
  if (!media?.id) return null;
  return { id: media.id, filename: msg.document?.filename };
}

export interface IngestResult {
  contactId: string;
  // NOSSO número que recebeu a mensagem (null = legado/envs).
  numberId: string | null;
  conversationStatus: string;
  message: WhatsAppMessageDTO;
  isNew: boolean; // false quando é retry da Meta (waMessageId já existia)
}

/**
 * Processa uma mensagem recebida: upsert de contato + conversa, dedup por
 * waMessageId (a Meta reenvia o webhook se não receber 200 a tempo), download
 * de mídia pro S3 e broadcast pro relay SSE.
 */
export async function ingestIncomingMessage(
  msg: IncomingWaMessage,
  profileName?: string,
  numberId?: string | null,
): Promise<IngestResult | null> {
  // Dedup: retry de webhook não gera mensagem nova nem re-dispara o bot.
  const existing = await db.whatsAppMessage.findUnique({
    where: { waMessageId: msg.id },
    select: { id: true },
  });

  // Cliente escreveu = opt-in documentado (exigência da Meta pra mensagens
  // proativas). Só preenche na primeira vez, preservando a data original.
  //
  // O nome de perfil do WhatsApp só entra quando o contato AINDA NÃO tem nome:
  // sobrescrever sempre apagava o nome salvo pela equipe na ficha a cada
  // mensagem recebida (o contato "voltava" pro apelido do WhatsApp).
  //
  // MULTI-NÚMERO: o contato é escopado pelo NOSSO número (numberId). Linha
  // legada sem numberId é "adotada" pelo número da mensagem na primeira vez —
  // é o backfill incremental que cobre quem escapar do ensureDefaultNumber.
  let contact = await db.whatsAppContact.findFirst({
    where: numberId
      ? { phone: msg.from, OR: [{ numberId }, { numberId: null }] }
      : { phone: msg.from },
    orderBy: { createdAt: "asc" },
  });
  if (contact && numberId && !contact.numberId) {
    contact = await db.whatsAppContact.update({ where: { id: contact.id }, data: { numberId } });
  }
  if (!contact) {
    contact = await db.whatsAppContact.create({
      data: { phone: msg.from, numberId: numberId ?? null, name: profileName ?? null, optedInAt: new Date(), optInSource: "inbound" },
    });
  }
  if (!contact.name?.trim() && profileName) {
    await db.whatsAppContact.update({ where: { id: contact.id }, data: { name: profileName } });
    contact.name = profileName;
  }
  if (!contact.optedInAt) {
    await db.whatsAppContact.update({
      where: { id: contact.id },
      data: { optedInAt: new Date(), optInSource: "inbound" },
    });
  }

  // Atribuição first-touch: a Meta manda `referral` na 1ª mensagem vinda de um
  // anúncio Click-to-WhatsApp. Grava uma única vez e nunca sobrescreve — se o
  // mesmo contato clicar em outro anúncio depois, a origem continua a original.
  if (msg.referral && !contact.adReferral) {
    await db.whatsAppContact.update({
      where: { id: contact.id },
      data: {
        adPlatform: detectAdPlatform(msg.referral.source_url),
        adSourceType: msg.referral.source_type ?? null,
        adSourceId: msg.referral.source_id ?? null,
        adSourceUrl: msg.referral.source_url ?? null,
        adHeadline: msg.referral.headline ?? null,
        ctwaClid: msg.referral.ctwa_clid ?? null,
        adReferral: msg.referral,
      },
    });
  }

  // Cliente respondeu → zera os marcadores de silêncio do bot (30min/24h).
  let conversation = await db.whatsAppConversation.upsert({
    where: { contactId: contact.id },
    update: { lastMessageAt: new Date(), botNudge30At: null, botNudge24At: null, ...(contact.numberId ? { numberId: contact.numberId } : {}) },
    create: { contactId: contact.id, numberId: contact.numberId },
  });

  // Opt-out / opt-in (anti-spam): analisa o texto do cliente cedo.
  const incomingText = extractBody(msg);
  const wantsOptOut = isOptOutMessage(incomingText);
  // Comando exato ("SAIR"/"STOP"/...): honrado mesmo em modo bot (ver abaixo).
  const exactOptOut = isExactOptOutCommand(incomingText);
  const wantsOptIn = isOptInMessage(incomingText);

  // Reativação explícita: quem estava opt-out pediu para voltar a ser atendido.
  if (contact.optedOut && wantsOptIn && !wantsOptOut) {
    await db.whatsAppContact.update({ where: { id: contact.id }, data: { optedOut: false } });
    contact.optedOut = false;
  }

  // Conversa encerrada + cliente mandou mensagem de novo → reabre (volta pro
  // bot, sem atendente). NÃO reabre se o contato está em opt-out: quem pediu
  // silêncio não deve voltar a receber respostas automáticas.
  //
  // FICHA COM VALIDADE (25/07/2026): os encerramentos preservam botMemory/
  // botState (antes zeravam — e um "obrigado" pós-despedida reabria a conversa
  // com a IA amnésica, recomeçando a triagem em loop). A limpeza acontece AQUI,
  // na reabertura, e só quando a conversa anterior é velha: recente (<7 dias) →
  // a IA volta sabendo com quem fala; velha e não-qualificada → começa limpa.
  // Qualificado nunca perde a ficha (retoma o fechamento de onde parou).
  if (conversation.status === "closed" && !contact.optedOut && !wantsOptOut) {
    let staleContext = false;
    if (!conversation.qualified && (conversation.botMemory || conversation.botState)) {
      // A mensagem atual ainda não foi gravada — a mais recente do banco é a
      // última atividade da conversa anterior.
      const lastMsg = await db.whatsAppMessage.findFirst({
        where: { contactId: contact.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      staleContext = !lastMsg || Date.now() - lastMsg.createdAt.getTime() > STALE_CONTEXT_MS;
    }
    conversation = await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: "bot", assignedToId: null, lastReadAt: null,
        // Conversa nova de verdade → ciclo de recuperação zerado.
        recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
        ...(staleContext ? { botMemory: null, botState: null } : {}),
      },
    });
  }

  // Cliente respondeu durante o STANDBY (ciclo de recuperação) → RESGATADO:
  // volta pro bot com a ficha intacta e a IA retoma de onde parou. O contador
  // de tentativas NÃO zera — se ele sumir de novo, o ciclo continua da
  // tentativa em que estava (máx. 3 no total). Telemetria: "recovered" com a
  // tentativa que o trouxe de volta (aba Métricas da Revisão da IA).
  if (conversation.status === "standby" && !contact.optedOut && !wantsOptOut) {
    const rescuedAt = conversation.recoveryAttempts;
    conversation = await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: "bot", assignedToId: null, lastReadAt: null,
        recoveryNextAt: null, recoveryOutcome: "recuperado",
      },
    });
    // Só conta como "recuperado" se alguma provocação já tinha saído — quem
    // voltou antes da 1ª tentativa voltou sozinho, não por mérito do ciclo.
    if (rescuedAt > 0) {
      await recordRecoveryEvent({
        contactId: contact.id,
        contactName: contact.name,
        botState: conversation.botState,
        action: "recovered",
        attempt: rescuedAt,
        detail: `cliente respondeu após a tentativa ${rescuedAt}`,
      });
    }
  }

  if (existing) {
    return null;
  }

  // Mídia: baixa antes de gravar (a URL da Meta expira rápido). Se falhar,
  // grava a mensagem sem anexo — melhor do que perder o evento.
  let mediaKey: string | null = null;
  let mediaType: string | null = null;
  const media = extractMediaId(msg);
  if (media) {
    const stored = await downloadMediaToS3(media.id, contact.id, media.filename, contact.numberId);
    if (stored) {
      mediaKey = stored.key;
      mediaType = stored.mimeType;
    }
  }

  // Cliente respondeu (quote) uma mensagem? Resolve o waMessageId pro nosso id
  // e guarda um snapshot do texto pro render ficar estável. Reação aponta a
  // mensagem reagida do mesmo jeito (reaction.message_id) — o balão da reação
  // mostra a que mensagem ela se refere.
  let replyTo: { id: string; body: string | null; direction: string } | null = null;
  const quotedWaId = msg.context?.id ?? msg.reaction?.message_id;
  if (quotedWaId) {
    replyTo = await db.whatsAppMessage.findUnique({
      where: { waMessageId: quotedWaId },
      select: { id: true, body: true, direction: true },
    });
  }

  const message = await db.whatsAppMessage.create({
    data: {
      contactId: contact.id,
      numberId: contact.numberId,
      waMessageId: msg.id,
      direction: "in",
      body: extractBody(msg),
      mediaKey,
      mediaType,
      status: "delivered",
      replyToId: replyTo?.id ?? null,
      replyToBody: replyTo ? replyTo.body ?? "📎 Anexo" : null,
      replyToDirection: replyTo?.direction ?? null,
    },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contact.id),
    contactId: contact.id,
    waMessageId: message.waMessageId,
    direction: message.direction,
    body: message.body,
    mediaKey: message.mediaKey,
    mediaType: message.mediaType,
    status: message.status,
    sentByBot: false,
    authorId: null,
    createdAt: message.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: conversation.status,
    replyToId: message.replyToId,
    replyToBody: message.replyToBody,
    replyToDirection: message.replyToDirection,
  };

  // Best-effort, igual ao chat interno: se o relay estiver fora, o polling cobre.
  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });

  // Opt-out por REGEX. Duas situações:
  //   1. COMANDO exato ("SAIR"/"STOP"/"DESCADASTRAR"...): honrado SEMPRE,
  //      inclusive em modo bot. É o que o rodapé das automáticas ensina, então
  //      não pode cair no vácuo (antes, em modo bot, "SAIR" ia pra IA — e ela
  //      podia não reconhecer, deixando o cliente sem descadastro).
  //   2. FRASE ambígua ("pare de me mandar", etc.): fora do modo bot, honra
  //      direto; em modo bot, deixa a IA julgar pelo contexto (evita tratar
  //      "vou precisar sair, mas já volto" como descadastro).
  if (wantsOptOut && (exactOptOut || conversation.status !== "bot")) {
    if (!contact.optedOut) {
      try {
        const confirm = await sendText(contact.phone, OPT_OUT_CONFIRMATION, undefined, contact.numberId);
        if (confirm.waMessageId) {
          await db.whatsAppMessage.create({
            data: {
              contactId: contact.id, numberId: contact.numberId, waMessageId: confirm.waMessageId,
              direction: "out", body: OPT_OUT_CONFIRMATION, status: "sent", sentByBot: true,
            },
          });
        }
      } catch (err) {
        console.error("[WHATSAPP] Falha ao confirmar opt-out:", contact.id, err);
      }
    }
    await db.whatsAppContact.update({ where: { id: contact.id }, data: { optedOut: true } });
    // Cérebro: era o único desfecho que encerrava SEM snapshot — a conversa de
    // quem se descadastra (fricção/abandono) é justamente a mais valiosa de
    // revisar. Captura ANTES do update, que zera a ficha logo abaixo.
    await captureConversation(contact.id, "manual", {
      closeCategory: "nao_qualificado",
      qualified: false,
    });
    conversation = await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { status: "closed", assignedToId: null, closeCategory: "nao_qualificado", botMemory: null, botState: null },
    });
    return { contactId: contact.id, numberId: contact.numberId, conversationStatus: "closed", message: dto, isNew: true };
  }

  // Notificação (sino) do "cliente respondeu": NUNCA para todo mundo quando
  // já existe um dono do ticket — só a fila de distribuição (sem atendente)
  // justifica avisar a equipe inteira. Conversa em modo "bot" não notifica
  // aqui: se a IA decidir escalar, o próprio handoff cria a notificação certa.
  await notifyIncomingMessage(conversation, contact, message.id, dto.body, mediaType);

  return { contactId: contact.id, numberId: contact.numberId, conversationStatus: conversation.status, message: dto, isNew: true };
}

/**
 * Notificação (sino) do "cliente respondeu" — política de destinatário:
 *   - conversa "queued" (ninguém assumiu ainda) → toda a equipe pode pegar,
 *     então TODOS recebem (é a fila de distribuição).
 *   - conversa "human" com dono (assignedToId) → SÓ o dono é avisado.
 *   - conversa "bot" → não notifica aqui; se a IA escalar, handoffToQueue/
 *     qualifyToQueue já criam a notificação certa depois de decidir.
 * Debounce leve (3min) por destinatário pra não inundar o sino quando o
 * cliente manda várias mensagens em sequência.
 */
async function notifyIncomingMessage(
  conversation: WhatsAppConversation,
  contact: WhatsAppContact,
  messageId: string,
  body: string | null,
  mediaType: string | null,
): Promise<void> {
  if (conversation.status !== "queued" && conversation.status !== "human") return;

  try {
    // "human" SEM dono era buraco negro: retornava em silêncio e nem bot nem
    // humano agiam (qualquer limpeza que zere assignedToId mantendo o status
    // prendia a conversa). Agora é tratado como fila: avisa a equipe inteira.
    const owned = conversation.status === "human" && !!conversation.assignedToId;
    const recipientIds = owned
      ? [conversation.assignedToId as string]
      : await whatsappRecipients();
    if (!recipientIds.length) return;

    const label = contact.name ?? `+${contact.phone}`;
    const preview = body ? body.slice(0, 80) : mediaType ? "📎 Anexo" : "mensagem";
    const message = owned
      ? `${label} respondeu: ${preview}`
      : `${label} está aguardando na fila: ${preview}`;

    for (const recipientId of recipientIds) {
      const recent = await db.notification.findFirst({
        where: { recipientId, contactId: contact.id, read: false, createdAt: { gte: new Date(Date.now() - 3 * 60_000) } },
        select: { id: true },
      });
      if (recent) continue; // já tem aviso fresco pendente pra esse destinatário

      await db.notification.create({
        data: {
          recipientId,
          authorId: "whatsapp-client",
          authorName: label,
          targetName: label,
          message,
          contactId: contact.id,
        },
      });
    }
  } catch (err) {
    console.error("[WHATSAPP] Falha ao notificar mensagem recebida:", messageId, err);
  }
}

// Status de entrega reportado pela Meta (entry[].changes[].value.statuses[]).
export interface IncomingWaStatus {
  id: string; // waMessageId da mensagem enviada por nós
  status: string; // sent | delivered | read | failed
  // Presentes quando status = "failed": código e descrição do erro da Meta.
  errors?: { code?: number; title?: string; message?: string }[];
}

// Debounce do alerta de falha de entrega: no máximo 1 aviso por conversa a
// cada 6h, mesmo que várias mensagens falhem em sequência.
const DELIVERY_ALERT_DEBOUNCE_MS = 6 * 60 * 60_000;

// Erro 131050: o PRÓPRIO cliente pediu à Meta para não receber mensagens de
// marketing desta empresa. É um opt-out formal — ignorá-lo é o que derruba a
// conta por spam, então aqui (e só aqui) marcamos optedOut automaticamente.
const META_USER_OPTED_OUT = 131050;

// Progressão dos status da Meta. Um status NUNCA regride (os webhooks chegam
// fora de ordem: um "sent" atrasado não pode rebaixar um "delivered"/"read" já
// aplicado — era isso que deixava mensagens entregues com tique único).
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

/** Atualiza o status de entrega de uma mensagem enviada (out). */
export async function applyStatusUpdate(st: IncomingWaStatus): Promise<void> {
  const rank = STATUS_RANK[st.status];
  if (!rank) return;

  // A linha da mensagem é criada DEPOIS da chamada à Meta — o webhook de
  // status pode chegar antes do INSERT commitar. Sem retry, o update não acha
  // nada, o evento é perdido e a mensagem fica "sent" para sempre.
  let message: { id: string; contactId: string } | null = null;
  for (let attempt = 0; attempt < 4 && !message; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const found = await db.whatsAppMessage.findUnique({
      where: { waMessageId: st.id },
      select: { id: true, contactId: true, status: true },
    });
    if (!found) continue; // ainda não gravada (ou enviada fora do sistema)
    if ((STATUS_RANK[found.status] ?? 0) < rank) {
      await db.whatsAppMessage.update({ where: { id: found.id }, data: { status: st.status } });
    }
    message = found;
  }
  if (!message || st.status !== "failed") return;

  try {
    const codes = (st.errors ?? []).map((e) => e.code).filter((c): c is number => typeof c === "number");
    if (codes.includes(META_USER_OPTED_OUT)) {
      await db.whatsAppContact.update({
        where: { id: message.contactId },
        data: { optedOut: true },
      });
    }
    const detail = (st.errors ?? [])
      .map((e) => [e.code, e.title ?? e.message].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("; ");
    await alertDeliveryFailure(
      message.contactId,
      `a Meta recusou o envio${detail ? ` (${detail})` : ""}`,
    );
  } catch (err) {
    console.error("[WHATSAPP] Falha ao tratar status failed:", st.id, err);
  }
}

/**
 * Falha de entrega (status "failed" ou mensagem parada em "sent" — provável
 * bloqueio ou número errado). Política escolhida: NÃO bloqueia envios futuros
 * (a janela de 24h continua sendo validada em todo envio); em vez disso a
 * conversa vai para a FILA e a equipe recebe notificação pedindo verificação:
 * número correto? cliente bloqueou? janela de 24h expirada?
 * Debounce por conversa via deliveryAlertAt.
 */
export async function alertDeliveryFailure(contactId: string, cause: string): Promise<void> {
  const conversation = await db.whatsAppConversation.upsert({
    where: { contactId },
    update: {},
    create: { contactId },
    include: { contact: true },
  });
  const alertedRecently =
    conversation.deliveryAlertAt &&
    conversation.deliveryAlertAt.getTime() > Date.now() - DELIVERY_ALERT_DEBOUNCE_MS;
  if (alertedRecently) return;

  // Manda pra fila de atendimento (se ninguém já estiver cuidando): alguém
  // precisa conferir o número/bloqueio antes do próximo envio automático.
  // Conversa ENCERRADA não volta pra fila: reabrir ticket fechado por causa de
  // status antigo era o que gerava alertas de fila a noite toda.
  const shouldQueue = conversation.status === "bot";
  await db.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      deliveryAlertAt: new Date(),
      ...(shouldQueue ? { status: "queued", assignedToId: null, queuedAt: new Date(), queueAlertAt: null } : {}),
    },
  });

  const contact = conversation.contact;
  const label = contact.name ?? `+${contact.phone}`;
  const text =
    `⚠️ WhatsApp: mensagem para ${label} não foi entregue — ${cause}. ` +
    `Verifique se o número está correto, se o cliente bloqueou nosso contato ou se a janela de 24h expirou.`;

  // Dono do ticket é avisado sozinho; sem dono, a equipe toda (é a fila).
  const recipients =
    conversation.status === "human" && conversation.assignedToId
      ? [conversation.assignedToId]
      : await whatsappRecipients();
  for (const recipientId of recipients) {
    await db.notification.create({
      data: {
        recipientId,
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        targetName: label,
        message: text,
        contactId,
      },
    });
  }
}
