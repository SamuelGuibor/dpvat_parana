import { describe, expect, it } from "vitest";
import { computeUnread, manualUnreadPatch, readPatch } from "@/app/_shared/utils/whatsapp-inbox";

// "Não lida" do inbox (auditoria de 24/09/2026): só mensagem RECEBIDA depois
// da leitura efetiva (a contagem do badge verde, que o SQL de loadConversations
// e o de countWhatsAppUnread calculam com `createdAt > leitura`) ou o marcador
// de "Marcar como não lida" (lastReadAt na época). Antes, o envio do próprio
// atendente reacendia a conversa e disparava markRead + recarga da lista.

const LEITURA = new Date("2026-09-25T12:00:00.000Z");
const EPOCH = new Date(0);

describe("computeUnread", () => {
  it("nunca lida e com mensagem recebida → não lida", () => {
    expect(computeUnread({ readAt: null, unreadCount: 3 })).toEqual({ unread: true, manualUnread: false });
  });

  it("lida depois da última recebida (a última mensagem foi do atendente) → lida", () => {
    // O envio do atendente mexe no lastMessageAt, mas não é mensagem recebida.
    expect(computeUnread({ readAt: LEITURA, unreadCount: 0 })).toEqual({ unread: false, manualUnread: false });
  });

  it("nunca lida e SEM nenhuma recebida (só template/bot de saída) → lida", () => {
    expect(computeUnread({ readAt: null, unreadCount: 0 })).toEqual({ unread: false, manualUnread: false });
  });

  it("lastReadAt na época = 'Marcar como não lida', mesmo sem recebida nova", () => {
    expect(computeUnread({ readAt: EPOCH, unreadCount: 0 })).toEqual({ unread: true, manualUnread: true });
    expect(computeUnread({ readAt: EPOCH, unreadCount: 12 })).toEqual({ unread: true, manualUnread: true });
  });

  it("uma recebida 1 ms depois da leitura já conta (o SQL compara com >)", () => {
    // A contagem vem do SQL: createdAt 12:00:00.001 > leitura 12:00:00.000 → 1.
    expect(computeUnread({ readAt: LEITURA, unreadCount: 1 })).toEqual({ unread: true, manualUnread: false });
  });

  it("leitura 1 ms depois da época não é o marcador manual", () => {
    expect(computeUnread({ readAt: new Date(1), unreadCount: 0 }).manualUnread).toBe(false);
  });
});

describe("patches de leitura batem com a regra do servidor", () => {
  it("readPatch deixa a conversa lida pela mesma regra", () => {
    const p = readPatch("2026-09-25T12:00:00.000Z");
    expect(computeUnread({ readAt: new Date(p.lastReadAt ?? NaN), unreadCount: p.unreadCount })).toEqual({
      unread: p.unread,
      manualUnread: p.manualUnread,
    });
  });

  it("manualUnreadPatch deixa a conversa não lida (manual) pela mesma regra", () => {
    const p = manualUnreadPatch();
    expect(computeUnread({ readAt: new Date(p.lastReadAt ?? NaN), unreadCount: 0 })).toEqual({
      unread: p.unread,
      manualUnread: p.manualUnread,
    });
  });
});
