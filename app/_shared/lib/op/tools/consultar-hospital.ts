import { z } from "zod/v4";
import { db } from "../../prisma";
import { readVaultText } from "../../s3-presign";
import { defineTool, OpToolError } from "../registry";
import { brDate, matchColumn } from "../resolve";
import { resolveOneCardId } from "../cards";
import { activeCardsByHospital, ghostFor, loadHospitalGroups, loadVaultIndex } from "../hospitais";
import { automationAttachments, automationSourceText, normalizeHospitalName, parseNote } from "@/app/_shared/utils/vault";

// Procedimento de pedido de prontuário por hospital (Etapa 2 do AI-First).
// A fonte é a automação ATIVA da coluna "DISTRIBUIÇÃO DE SOLICITAÇÕES" (é o que
// o CRM comenta no card). Decisão do dono (05/11, T-R1ABP): falta de nota no
// vault não é aviso nem bloqueio — só 163 de 279 hospitais têm nota e elas só
// reescrevem o texto da automação. Nota publicada e em dia vem como complemento;
// nota desatualizada não vem (contradiria a automação, que prevalece).

const schema = z
  .object({
    hospital: z.string().min(2).optional().describe('Nome do hospital (aproximado, ex.: "angelina caron").'),
    card: z.string().min(1).optional().describe('Ou o card ("2342", "#2342"): usa o hospital cadastrado no card.'),
  })
  .refine((a) => Boolean(a.hospital || a.card), { message: "informe hospital ou card" });

export const consultarHospital = defineTool({
  name: "consultar_hospital",
  description:
    "Como pedir o prontuário num hospital: o texto da automação ATIVA do CRM (DISTRIBUIÇÃO DE SOLICITAÇÕES) é a fonte principal (de/para do e-mail, documentos, formulário, contato, anexos); nota do vault só como complemento, quando existe e está em dia. Também o GHOST do catálogo com o contato cadastrado (`cadastro`: e-mail, telefone, modo) e quantos cards ativos têm esse hospital. Aceita nome aproximado (mais de um = `ambiguo` com as opções) ou nº do card.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    let query = args.hospital ?? "";
    let cardNumber: number | null = null;
    if (!query && args.card) {
      const id = await resolveOneCardId(args.card);
      const u = await db.user.findUniqueOrThrow({ where: { id }, select: { hospital: true, cardNumber: true } });
      cardNumber = u.cardNumber;
      if (!u.hospital?.trim()) throw new OpToolError("sem_hospital", `O card ${u.cardNumber ?? ""} não tem hospital cadastrado.`, 404);
      query = u.hospital;
    }

    const grupos = await loadHospitalGroups();
    const nomes = [...grupos.values()].map((g) => g.nome);
    const match = matchColumn(nomes, normalizeHospitalName(query));
    let escolhido: string;
    if (match.exact !== null) escolhido = match.exact;
    else {
      if (match.candidates.length === 1) escolhido = match.candidates[0];
      else if (match.candidates.length > 1)
        throw new OpToolError("ambiguo", `"${query}" casa com ${match.candidates.length} hospitais. Qual deles?`, 409, match.candidates.slice(0, 15));
      else
        throw new OpToolError(
          "nao_encontrado",
          `Nenhum procedimento cadastrado para "${query}"${cardNumber ? ` (hospital do card ${cardNumber})` : ""}. Pode ser hospital sem automação ou nome digitado diferente — ver docs/operacao/_relatorios/lacunas.md.`,
          404,
        );
    }
    const key = normalizeHospitalName(escolhido);
    const g = grupos.get(key)!;

    // Item B (27/10): GHOST pelo catálogo cacheado (era a mesma query de hospitalContactFor, duplicada).
    const [ghost, cards, index] = await Promise.all([ghostFor(escolhido), activeCardsByHospital(), loadVaultIndex()]);

    const entrada = index.find((n) => n.hospital_norm === key) ?? null;
    let nota: { caminho: string; atualizadaEm: string | null; texto: string } | null = null;
    if (entrada) {
      const raw = await readVaultText(`operacao-vault/${entrada.path}`);
      if (raw) {
        const { fm, body } = parseNote(raw);
        // Só a parte redigida; a Fonte já vai em `automacoes` (texto vivo).
        const texto = body.replace(/^## +Fonte\b[\s\S]*$/m, "").trim();
        if (fm.fonte_hash === g.hash) nota = { caminho: `docs/operacao/${entrada.path}`, atualizadaEm: entrada.atualizado_em, texto };
      }
    }

    return {
      data: {
        hospital: g.nome,
        ...(cardNumber ? { card: cardNumber } : {}),
        fonte: "automacao_ativa",
        automacoes: g.autos.map((a) => ({
          id: a.id,
          nome: a.name,
          atualizadaEm: brDate(a.updatedAt),
          texto: automationSourceText(a),
          anexos: automationAttachments(a),
        })),
        ghost: ghost ? { id: ghost.id, nome: ghost.name } : null,
        // Etapa 5: contato cadastrado no GHOST (só preenchido a partir de nota
        // publicada). null = ainda não cadastrado; use a nota/automação.
        cadastro:
          ghost && (ghost.hospital_email || ghost.hospital_telefone || ghost.hospital_modo || ghost.hospital_obs)
            ? { email: ghost.hospital_email, telefone: ghost.hospital_telefone, modo: ghost.hospital_modo, obs: ghost.hospital_obs }
            : null,
        cardsAtivos: cards.get(key)?.n ?? 0,
        // Complemento: só existe se a nota está em dia com a automação.
        nota,
      },
      summary: `${g.nome}: ${g.autos.length} automação(ões) ativa(s)${nota ? ", com nota" : ""}`,
    };
  },
});
