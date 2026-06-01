import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_lib/auth";
import { notificationEmitter } from "@/app/_lib/notification-emitter";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new Response("Não autorizado", { status: 401 });
  }

  const userId = session.user.id;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          cleanup();
        }
      }

      console.log("[SSE] Cliente conectado:", userId);
      send(JSON.stringify({ type: "connected" }));

      const heartbeat = setInterval(() => {
        send(JSON.stringify({ type: "ping" }));
      }, 30_000);

      function onNotification(payload: { recipientId: string; notification: unknown }) {
        console.log("[SSE] Evento recebido para:", payload.recipientId, "| Cliente:", userId);
        if (payload.recipientId === userId) {
          console.log("[SSE] Enviando notificação para cliente:", userId);
          send(JSON.stringify({ type: "notification", data: payload.notification }));
        }
      }

      function onComment(payload: { userId: string | null; processId: string | null }) {
        send(JSON.stringify({ type: "new-comment", data: payload }));
      }

      notificationEmitter.on("new-notification", onNotification);
      notificationEmitter.on("new-comment", onComment);

      function cleanup() {
        clearInterval(heartbeat);
        notificationEmitter.off("new-notification", onNotification);
        notificationEmitter.off("new-comment", onComment);
      }

      const checkClosed = setInterval(() => {
        try {
          controller.enqueue(new Uint8Array(0));
        } catch {
          cleanup();
          clearInterval(checkClosed);
        }
      }, 10_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
