import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { DEFAULT_CHECKLIST_ITEMS } from "../../admin-checklist";
import { DOCUMENT_CATEGORIES, inferCategory, isDocumentCategory } from "../../document-categories";
import { columnName, resolveOneCardId } from "../cards";
import { cardRefSchema } from "./obter-card";
import { dedupeRefs } from "@/app/_shared/utils/op-lote";

// Campos que os modelos de procuração/pedido hospitalar preenchem
// (gerarProcuracaoById). Vazio no card = sai em branco no documento.
const CAMPOS_PROCURACAO = [
  ["name", "nome"],
  ["cpf", "CPF"],
  ["rg", "RG"],
  ["estado_civil", "estado civil"],
  ["profissao", "profissão"],
  ["rua", "rua"],
  ["numero", "número"],
  ["bairro", "bairro"],
  ["cidade", "cidade"],
  ["estado", "estado"],
  ["cep", "CEP"],
  ["data_nasc", "data de nascimento"],
  ["nome_mae", "nome da mãe"],
] as const;
const CAMPOS_PEDIDO_HOSPITALAR = [
  ["hospital", "hospital"],
  ["data_acidente", "data do acidente"],
] as const;

const TAG_PENDENCIA_RE = /FALTA|PEND[EÊ]NCIA|VENCID/i;

/** Lote (27/10): os nºs de uma coluna inteira cabem numa chamada. */
export const PENDENCIAS_LOTE_MAX = 50;
const LOTE_CONCORRENCIA = 8;

const AVISO = "Verificação por sinais do CRM (pastas, checklist, campos, tags). A lista oficial de documentos exigidos por serviço (INSS) ainda não existe — confirme com a equipe antes de cobrar o cliente.";

const schema = z
  .object({
    card: cardRefSchema.optional(),
    cards: z
      .array(cardRefSchema)
      .min(1)
      .max(PENDENCIAS_LOTE_MAX)
      .optional()
      .describe(`LOTE: até ${PENDENCIAS_LOTE_MAX} cards numa chamada (ex.: os nºs de listar_cards_coluna). Devolve itens por card e faltasMaisComuns.`),
  })
  .refine((a) => Boolean(a.card) !== Boolean(a.cards), { message: "mande card OU cards (um dos dois)" });

export interface PendenciasCard {
  card: { id: string; cardNumber: number | null; nome: string | null; coluna: string; servico: string | null };
  pastasVazias: string[];
  checklistPendente: string[];
  checklistNuncaAberto: boolean;
  camposVaziosProcuracao: string[];
  camposVaziosPedidoHospitalar: string[];
  senhaInssCadastrada: boolean;
  tagsDePendencia: string[];
  /** Sinais somados (pastas + checklist + campos + tags). */
  total: number;
}

/** Pendências de UM card já resolvido (id). Leitura pura: nada é semeado nem gravado. */
export async function pendenciasDoCard(id: string): Promise<PendenciasCard> {
  const [card, docs, checklist] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        cardNumber: true,
        name: true,
        cpf: true,
        rg: true,
        estado_civil: true,
        profissao: true,
        rua: true,
        numero: true,
        bairro: true,
        cidade: true,
        estado: true,
        cep: true,
        data_nasc: true,
        nome_mae: true,
        hospital: true,
        data_acidente: true,
        service: true,
        senha_inss: true,
        role: true,
        label: { select: { name: true } },
        cardTags: { select: { name: true } },
      },
    }),
    db.document.findMany({ where: { userId: id, deletedAt: null }, select: { name: true, category: true } }),
    db.adminChecklistItem.findMany({
      where: { userId: id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { text: true, section: true, checked: true },
    }),
  ]);

  const perFolder = new Map<string, number>(DOCUMENT_CATEGORIES.map((c) => [c.id, 0]));
  for (const d of docs) {
    const folder = d.category && isDocumentCategory(d.category) ? d.category : inferCategory(d.name);
    perFolder.set(folder, (perFolder.get(folder) ?? 0) + 1);
  }
  const pastasVazias = DOCUMENT_CATEGORIES.filter((c) => c.id !== "OUTROS" && !perFolder.get(c.id)).map((c) => c.label);

  // Leitura não semeia o checklist (a rota da aba Arquivos semeia no 1º GET):
  // sem linhas = card nunca abriu a aba = itens padrão, nenhum marcado.
  const checklistNuncaAberto = checklist.length === 0;
  const items = checklistNuncaAberto ? DEFAULT_CHECKLIST_ITEMS.map((i) => ({ ...i, checked: false })) : checklist;
  const checklistPendente = items.filter((i) => !i.checked).map((i) => `${i.section ?? "—"}: ${i.text}`);

  const empty = (v: string | null | undefined) => !v || !v.trim();
  const camposProcuracao = CAMPOS_PROCURACAO.filter(([k]) => empty(card[k])).map(([, label]) => label);
  const camposPedidoHospitalar = CAMPOS_PEDIDO_HOSPITALAR.filter(([k]) => empty(card[k])).map(([, label]) => label);
  const tagsDePendencia = card.cardTags.map((t) => t.name).filter((n) => TAG_PENDENCIA_RE.test(n));

  return {
    card: { id: card.id, cardNumber: card.cardNumber, nome: card.name, coluna: columnName(card), servico: card.service },
    pastasVazias,
    checklistPendente,
    checklistNuncaAberto,
    camposVaziosProcuracao: camposProcuracao,
    camposVaziosPedidoHospitalar: camposPedidoHospitalar,
    senhaInssCadastrada: !empty(card.senha_inss),
    tagsDePendencia,
    total: pastasVazias.length + checklistPendente.length + camposProcuracao.length + tagsDePendencia.length,
  };
}

/** Lote: roda `pendenciasDoCard` com concorrência limitada (não despeja 50 × 3 queries de uma vez no Neon). */
async function pendenciasEmLote(ids: string[]): Promise<PendenciasCard[]> {
  const out: PendenciasCard[] = [];
  for (let i = 0; i < ids.length; i += LOTE_CONCORRENCIA) {
    out.push(...(await Promise.all(ids.slice(i, i + LOTE_CONCORRENCIA).map(pendenciasDoCard))));
  }
  return out;
}

/** "Falta" mais comum do lote: pasta vazia, campo vazio, tag, senha, checklist nunca aberto. */
function faltasMaisComuns(itens: PendenciasCard[]): { falta: string; cards: number }[] {
  const count = new Map<string, number>();
  const add = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  for (const i of itens) {
    i.pastasVazias.forEach((p) => add(`pasta vazia: ${p}`));
    i.camposVaziosProcuracao.forEach((c) => add(`cadastro: ${c}`));
    i.camposVaziosPedidoHospitalar.forEach((c) => add(`cadastro: ${c}`));
    i.tagsDePendencia.forEach((t) => add(`tag: ${t}`));
    if (!i.senhaInssCadastrada) add("sem senha do INSS");
    if (i.checklistNuncaAberto) add("checklist nunca aberto");
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([falta, cards]) => ({ falta, cards }));
}

export const verificarPendencias = defineTool({
  name: "verificar_pendencias",
  description:
    "O que falta no card (ou em VÁRIOS cards, com `cards` — uma chamada para a coluna inteira): pastas de documento vazias, itens do checklist previdenciário não marcados, campos de cadastro vazios que a procuração e o pedido hospitalar usam, senha do INSS não cadastrada e tags de pendência. No lote devolve também faltasMaisComuns. É uma verificação por sinais do CRM — a lista oficial de documentos por serviço ainda não existe.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    if (args.cards) {
      const refs = dedupeRefs(args.cards);
      const ids: string[] = [];
      const naoEncontrados: { card: string; code: string; message: string }[] = [];
      for (const ref of refs) {
        try {
          ids.push(await resolveOneCardId(ref));
        } catch (err) {
          if (!(err instanceof OpToolError)) throw err;
          naoEncontrados.push({ card: ref, code: err.code, message: err.message });
        }
      }
      const itens = await pendenciasEmLote([...new Set(ids)]);
      // Checklist nunca aberto = 11 linhas idênticas por card: no lote vale só a contagem.
      const compactos = itens.map((i) => ({
        ...i,
        checklistPendente: i.checklistNuncaAberto ? [] : i.checklistPendente,
        checklistPendentes: i.checklistPendente.length,
      }));
      return {
        data: { total: itens.length, itens: compactos, faltasMaisComuns: faltasMaisComuns(itens), naoEncontrados, aviso: AVISO },
        summary: `pendências de ${itens.length} card(s)${naoEncontrados.length ? ` (${naoEncontrados.length} não encontrado(s))` : ""}`,
        cardIds: ids,
      };
    }
    const id = await resolveOneCardId(args.card!);
    const p = await pendenciasDoCard(id);
    const { total, card, ...resto } = p;
    const data = { card: { cardNumber: card.cardNumber, nome: card.nome, coluna: card.coluna, servico: card.servico }, ...resto, aviso: AVISO };
    return { data, summary: `card #${card.cardNumber ?? "?"}: ${total} sinal(is) de pendência`, cardIds: [id] };
  },
});
