import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { DEFAULT_CHECKLIST_ITEMS } from "../../admin-checklist";
import { DOCUMENT_CATEGORIES, inferCategory, isDocumentCategory } from "../../document-categories";
import { columnName, resolveOneCardId } from "../cards";
import { cardRefSchema } from "./obter-card";

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

const schema = z.object({ card: cardRefSchema });

export const verificarPendencias = defineTool({
  name: "verificar_pendencias",
  description:
    "O que falta no card: pastas de documento vazias, itens do checklist previdenciário não marcados, campos de cadastro vazios que a procuração e o pedido hospitalar usam, senha do INSS não cadastrada e tags de pendência. É uma verificação por sinais do CRM — a lista oficial de documentos por serviço ainda não existe.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    const id = await resolveOneCardId(args.card);
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

    const data = {
      card: { cardNumber: card.cardNumber, nome: card.name, coluna: columnName(card), servico: card.service },
      pastasVazias,
      checklistPendente,
      checklistNuncaAberto,
      camposVaziosProcuracao: camposProcuracao,
      camposVaziosPedidoHospitalar: camposPedidoHospitalar,
      senhaInssCadastrada: !empty(card.senha_inss),
      tagsDePendencia,
      aviso:
        "Verificação por sinais do CRM (pastas, checklist, campos, tags). A lista oficial de documentos exigidos por serviço (INSS) ainda não existe — confirme com a equipe antes de cobrar o cliente.",
    };
    const n = pastasVazias.length + checklistPendente.length + camposProcuracao.length + tagsDePendencia.length;
    return { data, summary: `card #${card.cardNumber ?? "?"}: ${n} sinal(is) de pendência`, cardIds: [id] };
  },
});
