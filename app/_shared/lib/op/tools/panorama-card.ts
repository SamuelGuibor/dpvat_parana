// Decisão do dono (27/10): "como está o 2342?" custava 4–5 chamadas HTTPS
// (ficha, histórico, documentos, pendências, conversa), cada uma pagando
// token, sessão, resolve do card e registro. Aqui tudo sai numa chamada:
// o card é resolvido uma vez e os blocos rodam em paralelo no servidor,
// reaproveitando as próprias ferramentas (mesmo select, mesmas regras).

import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { resolveOneCardId } from "../cards";
import { cardRefSchema, obterCard } from "./obter-card";
import { listarHistorico } from "./listar-historico";
import { listarDocumentos } from "./listar-documentos";
import { consultarConversa } from "./consultar-conversa";
import { pendenciasDoCard } from "./verificar-pendencias";

const schema = z.object({
  card: cardRefSchema,
  historico: z.number().int().min(0).max(50).default(10).describe("Itens do histórico (0 = sem histórico)."),
  documentos: z.boolean().default(true).describe("Arquivos por pasta (só contagem e nomes)."),
  pendencias: z.boolean().default(true),
  conversa: z.boolean().default(true).describe("Conversa de WhatsApp (precisa de view_whatsapp; sem ela vem `omitida`)."),
  comLinks: z.boolean().default(false).describe("Links dos documentos (~90 min). Só se o operador for abrir."),
});

export const panoramaCard = defineTool({
  name: "panorama_card",
  description:
    "Tudo de UM card numa chamada só: ficha completa (obter_card) + histórico + documentos por pasta + pendências + conversa de WhatsApp, lidos em paralelo no servidor. Use no lugar de 4–5 chamadas separadas (/processo, /cliente com um resultado). Referência ambígua devolve as opções.",
  level: 1,
  permission: "op_use",
  schema,
  async run(ctx, args) {
    const id = await resolveOneCardId(args.card);
    const temWhatsapp = args.conversa && ctx.op.permissions.view_whatsapp === true;
    const [ficha, historico, documentos, pendencias, conversa] = await Promise.all([
      obterCard.run(ctx, obterCard.schema.parse({ card: id })),
      args.historico > 0 ? listarHistorico.run(ctx, listarHistorico.schema.parse({ card: id, limite: args.historico })) : null,
      args.documentos ? listarDocumentos.run(ctx, listarDocumentos.schema.parse({ card: id, comLinks: args.comLinks })) : null,
      args.pendencias ? pendenciasDoCard(id) : null,
      temWhatsapp
        ? consultarConversa.run(ctx, consultarConversa.schema.parse({ card: id })).catch((err: unknown) => {
            // Card sem conversa ou outra recusa esperada não derruba o panorama.
            if (err instanceof OpToolError) return { data: { erro: err.code, mensagem: err.message } };
            throw err;
          })
        : null,
    ]);
    const cardNumber = (ficha.data as { cardNumber?: number | null }).cardNumber ?? "?";
    return {
      data: {
        card: ficha.data,
        historico: historico?.data ?? null,
        documentos: documentos?.data ?? null,
        pendencias: pendencias ? { ...pendencias, card: undefined } : null,
        conversa: conversa ? conversa.data : args.conversa ? { omitida: "sem permissão view_whatsapp" } : null,
      },
      summary: `panorama do card #${cardNumber}`,
      cardIds: [id],
    };
  },
});
