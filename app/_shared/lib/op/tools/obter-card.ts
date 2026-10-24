import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { stripSensitive } from "../policy";
import { brDate, brDateTime, brDaysBetween } from "../resolve";
import { columnName, etapaLabel, resolveOneCardId } from "../cards";

export const cardRefSchema = z
  .string()
  .min(1)
  .describe('Referência do card: "2342", "#2342", "processo 2342", CPF, telefone, nome ou id.');

const schema = z.object({ card: cardRefSchema });

export const obterCard = defineTool({
  name: "obter_card",
  description:
    "Ficha completa de UM card: coluna atual, dias na coluna, prazo da coluna, etapa do checklist, serviço, tags, hospital, afastamento, arquivamento e cadastro (sem senhas). Referência ambígua devolve as opções.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    const id = await resolveOneCardId(args.card);
    const u = await db.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        cardNumber: true,
        name: true,
        cpf: true,
        rg: true,
        data_nasc: true,
        nome_mae: true,
        nacionalidade: true,
        estado_civil: true,
        profissao: true,
        telefone: true,
        telefone_secundario: true,
        rua: true,
        numero: true,
        bairro: true,
        cidade: true,
        estado: true,
        cep: true,
        service: true,
        status: true,
        role: true,
        hospital: true,
        outro_hospital: true,
        lesoes: true,
        data_acidente: true,
        atendimento_via: true,
        obs: true,
        otherObs: true,
        afastadoAte: true,
        statusStartedAt: true,
        archiveStatus: true,
        archivedAt: true,
        createdAt: true,
        senha_inss: true,
        label: { select: { name: true, timeLimitDays: true } },
        cardTags: { select: { name: true } },
      },
    });

    const dias = u.statusStartedAt ? brDaysBetween(u.statusStartedAt) : null;
    const prazo = u.label?.timeLimitDays ?? null;
    const card = stripSensitive({
      id: u.id,
      cardNumber: u.cardNumber,
      nome: u.name,
      servico: u.service,
      coluna: columnName(u),
      naColunaDesde: brDate(u.statusStartedAt),
      diasNaColuna: dias,
      prazoDaColunaDias: prazo,
      prazoEstourado: dias !== null && prazo !== null ? dias > prazo : null,
      etapa: etapaLabel(u.service, u.status),
      etapaCodigo: u.status,
      tags: u.cardTags.map((t) => t.name),
      hospital: u.hospital,
      outroHospital: u.outro_hospital,
      lesoes: u.lesoes,
      dataAcidente: u.data_acidente,
      afastadoAte: brDate(u.afastadoAte),
      arquivado: u.archiveStatus ? { destino: u.archiveStatus, em: brDate(u.archivedAt) } : null,
      criadoEm: brDateTime(u.createdAt),
      atendimentoVia: u.atendimento_via,
      cadastro: {
        cpf: u.cpf,
        rg: u.rg,
        dataNascimento: u.data_nasc,
        nomeMae: u.nome_mae,
        nacionalidade: u.nacionalidade,
        estadoCivil: u.estado_civil,
        profissao: u.profissao,
        telefone: u.telefone,
        telefoneSecundario: u.telefone_secundario,
        endereco: { rua: u.rua, numero: u.numero, bairro: u.bairro, cidade: u.cidade, estado: u.estado, cep: u.cep },
      },
      // Só a presença: o valor da senha do INSS nunca sai da ferramenta.
      senhaInssCadastrada: !!u.senha_inss?.trim(),
      observacoes: u.obs,
      outrasObservacoes: u.otherObs,
    });
    return {
      data: card,
      summary: `card #${u.cardNumber ?? "?"} · ${card.coluna}${dias !== null ? ` · ${dias}d` : ""}`,
      cardIds: [u.id],
    };
  },
});
