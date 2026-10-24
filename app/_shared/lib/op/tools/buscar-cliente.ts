import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { brDate } from "../resolve";
import { CARD_WHERE, cardIdsByCpf, cardIdsByPhone, cardListSelect, columnName, etapaLabel } from "../cards";

const schema = z
  .object({
    cpf: z.string().optional().describe("CPF com ou sem máscara."),
    nome: z.string().min(2).optional().describe("Nome ou parte do nome (todas as palavras precisam aparecer)."),
    telefone: z.string().optional().describe("Telefone; casa pelos últimos 8 dígitos."),
    cardNumber: z.number().int().positive().optional().describe("Número do processo/card (ex.: 2342)."),
    incluirArquivados: z.boolean().default(true).describe("Inclui cards arquivados (padrão: sim)."),
  })
  .refine((a) => a.cpf || a.nome || a.telefone || a.cardNumber, {
    message: "Informe cpf, nome, telefone ou cardNumber.",
  });

export const buscarCliente = defineTool({
  name: "buscar_cliente",
  description:
    "Procura cards de cliente por CPF, nome, telefone ou número do processo. Devolve até 20 cards (ativos e arquivados) com número, coluna, etapa, serviço, CPF e telefone. Use antes de obter_card quando o operador não deu o número.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    let ids: string[] | null = null;
    const intersect = (next: string[]) => {
      ids = ids === null ? next : ids.filter((id) => next.includes(id));
    };
    if (args.cpf) {
      const digits = args.cpf.replace(/\D/g, "");
      if (digits.length !== 11) throw new OpToolError("argumentos_invalidos", "CPF precisa ter 11 dígitos.", 400);
      intersect(await cardIdsByCpf(digits));
    }
    if (args.telefone) intersect(await cardIdsByPhone(args.telefone));

    const words = (args.nome ?? "").split(/\s+/).filter(Boolean);
    const rows = await db.user.findMany({
      where: {
        ...CARD_WHERE,
        ...(ids !== null ? { id: { in: ids } } : {}),
        ...(args.cardNumber ? { cardNumber: args.cardNumber } : {}),
        ...(args.incluirArquivados ? {} : { archiveStatus: null }),
        ...(words.length ? { AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) } : {}),
      },
      select: cardListSelect,
      orderBy: [{ archiveStatus: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 20,
    });

    const cards = rows.map((r) => ({
      id: r.id,
      cardNumber: r.cardNumber,
      nome: r.name,
      cpf: r.cpf,
      telefone: r.telefone,
      servico: r.service,
      coluna: columnName(r),
      etapa: etapaLabel(r.service, r.status),
      hospital: r.hospital,
      arquivado: r.archiveStatus ? { destino: r.archiveStatus, em: brDate(r.archivedAt) } : null,
      tags: r.cardTags.map((t) => t.name),
    }));
    return {
      data: { total: cards.length, limite: 20, cards },
      summary: `${cards.length} card(s) encontrado(s)`,
      cardIds: cards.map((c) => c.id),
    };
  },
});
