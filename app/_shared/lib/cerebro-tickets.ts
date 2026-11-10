// Núcleo dos tickets de conhecimento do Cérebro APP, compartilhado pelas
// server actions do quadro (app/_actions/dev-tickets/ticket-actions.ts) e
// pelas ferramentas da IA de operação (op/tools/tickets.ts). SEM guarda: quem
// chama já passou por requireTeam/opAuth e decidiu a permissão.
// Plano: docs/ai-first/11-plano-cerebro-app.md.

import { Prisma } from "@prisma/client";
import { db } from "./prisma";
import { matchColumn } from "./op/resolve";
import { activeCardsByHospital, loadHospitalGroups, loadVaultIndex } from "./op/hospitais";
import { automationSourceText, normalizeHospitalName } from "@/app/_shared/utils/vault";
import {
  MANUAL_TICKET_TYPES,
  acrescentarTexto,
  destinoDoTipo,
  TIPO_DO_DESTINO,
  compararContatos,
  parseShortTicketId,
  skillProtegida,
  skillValida,
  type CerebroMeta,
  type Destino,
} from "@/app/_shared/utils/cerebro";

export function metaOf(ticket: { meta: unknown }): CerebroMeta {
  return ticket.meta && typeof ticket.meta === "object" ? (ticket.meta as CerebroMeta) : {};
}

export function withHistory(meta: CerebroMeta, texto: string, por?: string | null): CerebroMeta {
  const historico = [...(meta.historico ?? []), { texto, em: new Date().toISOString(), ...(por ? { por } : {}) }].slice(-30);
  return { ...meta, historico };
}

export const asJson = (m: CerebroMeta) => m as unknown as Prisma.InputJsonValue;

export class CerebroError extends Error {
  constructor(
    public code: "invalido" | "nao_encontrado" | "ambiguo" | "protegida",
    message: string,
  ) {
    super(message);
  }
}

export interface SugestaoInput {
  title: string;
  /** vault (padrão, nota de hospital/regra/etapa) · skill · bot. */
  destino?: Destino;
  /** vault: hospital (opcional) para comparar com a automação viva. */
  hospital?: string;
  /** skill: pasta em .claude/skills/. */
  skill?: string;
  proposta: string;
  evidencia?: string;
  sectorId?: string | null;
}

const SEM_AUTOMACAO = "(Hospital sem automação ativa: conhecimento novo.)";
const SEM_SKILL = "(Skill não informada: skill nova ou a IA acha pelo assunto. Skill nova vira ticket DEV.)";

/** Destino vault com hospital: automação viva, nota do vault e contatos de hoje × proposta. */
async function metaDoHospital(hospital: string, proposta: string) {
  const [grupos, index, cards] = await Promise.all([loadHospitalGroups(), loadVaultIndex(), activeCardsByHospital()]);
  const m = matchColumn([...grupos.values()].map((g) => g.nome), normalizeHospitalName(hospital));
  const nome = m.exact !== null ? m.exact : m.candidates.length === 1 ? m.candidates[0] : null;
  const key = normalizeHospitalName(nome ?? hospital);
  const g = nome ? grupos.get(key) : undefined;
  const hoje = g ? g.autos.map(automationSourceText).join("\n\n") : "";
  const meta: CerebroMeta = {
    hospital: g?.nome ?? hospital,
    automacoes: g?.autos.map((a) => ({ id: a.id, nome: a.name })) ?? [],
    nota: index.find((n) => n.hospital_norm === key)?.path,
    hoje: hoje || undefined,
    comparacao: compararContatos(hoje, proposta),
    cardsAtivos: cards.get(key)?.n ?? 0,
  };
  return { meta, temAutomacao: Boolean(g) };
}

/**
 * Cria o ticket de sugestão já com a checagem que o servidor consegue fazer:
 * vault com hospital → contatos da automação viva × proposta; skill → nome
 * válido e fora das protegidas (o texto da skill está no repositório, a IA
 * compara na hora de implementar); bot → versão do playbook publicado, para a
 * análise saber se o cérebro mudou desde a sugestão.
 */
export async function criarSugestao(input: SugestaoInput, autor: { id: string; name: string | null }) {
  const title = input.title?.trim();
  const proposta = input.proposta?.trim();
  if (!title) throw new CerebroError("invalido", "Informe o assunto");
  if (!proposta) throw new CerebroError("invalido", "Escreva o que deve mudar ou ser registrado");
  const destino: Destino = input.destino ?? "vault";
  if (!TIPO_DO_DESTINO[destino]) throw new CerebroError("invalido", "Destino inválido");

  let sectorId: string | null = null;
  if (input.sectorId) {
    const s = await db.sector.findUnique({ where: { id: input.sectorId }, select: { id: true } });
    if (!s) throw new CerebroError("invalido", "Setor não encontrado");
    sectorId = s.id;
  }

  let meta: CerebroMeta = { destino, proposta, evidencia: input.evidencia?.trim() || undefined };
  let description = proposta;

  if (destino === "skill") {
    const skill = input.skill?.trim().toLowerCase().replace(/^\//, "") ?? "";
    if (skill) {
      if (!skillValida(skill)) throw new CerebroError("invalido", "Nome de skill inválido (use o nome da pasta, ex.: meu-dia)");
      if (skillProtegida(skill)) {
        throw new CerebroError("protegida", `A skill /${skill} é protegida: mudança nela é ticket DEV (Novo ticket → Alteração).`);
      }
      meta = { ...meta, skill };
    } else {
      description = `${proposta}\n\n${SEM_SKILL}`;
    }
  } else if (destino === "bot") {
    const pb = await db.whatsAppPlaybook.findFirst({ where: { status: "publicado" }, orderBy: { version: "desc" }, select: { version: true } });
    meta = { ...meta, playbookVersao: pb?.version };
  } else if (input.hospital?.trim()) {
    const h = await metaDoHospital(input.hospital.trim(), proposta);
    meta = { ...meta, ...h.meta };
    if (!h.temAutomacao) description = `${proposta}\n\n${SEM_AUTOMACAO}`;
  }
  meta = withHistory(meta, "Sugeriu o conhecimento", autor.name);

  return db.devTicket.create({
    data: {
      title,
      description,
      type: TIPO_DO_DESTINO[destino],
      meta: asJson(meta),
      sectorId,
      creatorId: autor.id,
      creatorName: autor.name ?? "Usuário",
    },
  });
}

export interface EdicaoSugestaoInput {
  title?: string;
  /** Substitui a proposta inteira. */
  proposta?: string;
  /** Junta ao fim da proposta ("acrescenta X no S-…"). */
  acrescentar?: string;
  evidencia?: string;
  /** Só destino vault: recalcula automação/nota/comparação. */
  hospital?: string;
  /** Só destino skill. */
  skill?: string;
  /** undefined = não mexe; null = tira o setor. */
  sectorId?: string | null;
}

export type MudancaSugestao = { campo: string; de: string | null; para: string | null };

type TicketRow = Awaited<ReturnType<typeof acharTicket>>;

/**
 * T-1Q1EB: monta a edição da sugestão (sem gravar) — a ferramenta mostra
 * `mudancas` na prévia e só grava com `gravarEdicaoSugestao` depois do "sim".
 * A trava de fase/autor é de quem chama (`motivoSemEdicao`).
 */
export async function planejarEdicaoSugestao(t: TicketRow, input: EdicaoSugestaoInput) {
  const base = metaOf(t);
  const destino = base.destino ?? destinoDoTipo(t.type) ?? "vault";
  const mudancas: MudancaSugestao[] = [];
  const data: Prisma.DevTicketUpdateInput = {};
  let meta: CerebroMeta = { ...base };

  if (input.proposta !== undefined && input.acrescentar !== undefined) {
    throw new CerebroError("invalido", "Use proposta (substitui) OU acrescentar (junta ao fim), não os dois");
  }
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new CerebroError("invalido", "Informe o assunto");
    if (title !== t.title) {
      mudancas.push({ campo: "título", de: t.title, para: title });
      data.title = title;
    }
  }
  const propostaAtual = base.proposta ?? t.description;
  let proposta = propostaAtual;
  if (input.proposta !== undefined) proposta = input.proposta.trim();
  if (input.acrescentar !== undefined) proposta = acrescentarTexto(propostaAtual, input.acrescentar);
  if (!proposta) throw new CerebroError("invalido", "Escreva o que deve mudar ou ser registrado");
  if (proposta !== propostaAtual) {
    mudancas.push({ campo: "proposta", de: propostaAtual, para: proposta });
    meta.proposta = proposta;
  }
  if (input.evidencia !== undefined) {
    const ev = input.evidencia.trim() || undefined;
    if (ev !== base.evidencia) {
      mudancas.push({ campo: "evidência", de: base.evidencia ?? null, para: ev ?? null });
      meta.evidencia = ev;
    }
  }
  if (input.skill !== undefined) {
    if (destino !== "skill") throw new CerebroError("invalido", "Skill só vale para sugestão com destino skill");
    const skill = input.skill.trim().toLowerCase().replace(/^\//, "");
    if (!skillValida(skill)) throw new CerebroError("invalido", "Nome de skill inválido (use o nome da pasta, ex.: meu-dia)");
    if (skillProtegida(skill)) throw new CerebroError("protegida", `A skill /${skill} é protegida: mudança nela é ticket DEV.`);
    if (skill !== base.skill) {
      mudancas.push({ campo: "skill", de: base.skill ?? null, para: skill });
      meta.skill = skill;
    }
  }
  if (input.hospital !== undefined && destino !== "vault") {
    throw new CerebroError("invalido", "Hospital só vale para sugestão com destino vault");
  }
  const hospital = input.hospital !== undefined ? input.hospital.trim() : base.hospital;
  let temAutomacao = true;
  // Hospital novo ou proposta nova num vault com hospital: a comparação
  // hoje × proposta é refeita contra a automação viva de agora.
  if (destino === "vault" && hospital && (input.hospital !== undefined || meta.proposta !== base.proposta)) {
    const h = await metaDoHospital(hospital, proposta);
    if (h.meta.hospital !== base.hospital) mudancas.push({ campo: "hospital", de: base.hospital ?? null, para: h.meta.hospital ?? null });
    meta = { ...meta, ...h.meta };
    temAutomacao = h.temAutomacao;
  } else if (destino === "vault" && base.hospital) {
    temAutomacao = Boolean(base.automacoes?.length);
  }
  if (input.sectorId !== undefined && input.sectorId !== t.sectorId) {
    const [de, para] = await Promise.all([
      t.sectorId ? db.sector.findUnique({ where: { id: t.sectorId }, select: { name: true } }) : null,
      input.sectorId ? db.sector.findUnique({ where: { id: input.sectorId }, select: { name: true } }) : null,
    ]);
    if (input.sectorId && !para) throw new CerebroError("invalido", "Setor não encontrado");
    mudancas.push({ campo: "setor", de: de?.name ?? null, para: para?.name ?? null });
    data.sectorId = input.sectorId;
  }

  // A descrição do ticket é a proposta + os avisos que o "Sugerir" põe.
  if (meta.proposta !== base.proposta) {
    data.description =
      destino === "skill" && !meta.skill
        ? `${proposta}\n\n${SEM_SKILL}`
        : destino === "vault" && hospital && !temAutomacao
          ? `${proposta}\n\n${SEM_AUTOMACAO}`
          : proposta;
  }
  return { mudancas, data, meta };
}

/** Grava a edição planejada, com o registro de quem alterou no histórico do ticket. */
export async function gravarEdicaoSugestao(
  t: TicketRow,
  plano: Awaited<ReturnType<typeof planejarEdicaoSugestao>>,
  autor: string,
) {
  const campos = plano.mudancas.map((m) => m.campo).join(", ");
  const meta = withHistory(plano.meta, `Editou a sugestão (${campos})`, autor);
  return db.devTicket.update({
    where: { id: t.id },
    data: { ...plano.data, meta: asJson(meta) },
    select: { id: true, type: true, status: true },
  });
}

/**
 * Ticket DEV (bug, alteração, melhoria, outro) — o "Novo ticket" do quadro e
 * o `criar_ticket_dev` da IA (decisão do dono de 30/10). Fotos só pelo site
 * (vêm do presign com prefixo dev-tickets/, checado por quem chama).
 */
export async function criarTicketDev(
  input: { title: string; description: string; type: string; images?: { key: string; name: string }[]; sectorId?: string | null },
  autor: { id: string; name: string | null },
) {
  const title = input.title?.trim();
  const description = input.description?.trim();
  if (!title) throw new CerebroError("invalido", "Informe o título do ticket");
  if (!description) throw new CerebroError("invalido", "Descreva o problema ou a alteração desejada");
  // Tipos de conhecimento nascem do "Sugerir conhecimento" ou do sistema.
  if (!(MANUAL_TICKET_TYPES as readonly string[]).includes(input.type)) throw new CerebroError("invalido", "Tipo de ticket inválido");
  const photos = input.images ?? [];
  return db.devTicket.create({
    data: {
      title,
      description,
      type: input.type,
      images: photos as unknown as Prisma.InputJsonValue,
      // imageKey/imageName seguem preenchidos com a primeira foto: a UI antiga
      // e qualquer consumidor legado continuam enxergando o anexo principal.
      imageKey: photos[0]?.key ?? null,
      imageName: photos[0]?.name ?? null,
      sectorId: input.sectorId ?? null,
      creatorId: autor.id,
      creatorName: autor.name ?? "Usuário",
    },
  });
}

/** Acha o ticket pelo id curto ("S-K2P9X") ou inteiro. Mais de um com o mesmo sufixo → ambiguo. */
export async function acharTicket(ref: string) {
  const sufixo = parseShortTicketId(ref);
  if (!sufixo) throw new CerebroError("invalido", "Ticket inválido: use o id curto do card (ex.: C-K2P9X)");
  const achados = await db.devTicket.findMany({ where: { id: { endsWith: sufixo } }, take: 2 });
  if (!achados.length) throw new CerebroError("nao_encontrado", `Nenhum ticket com o id ${ref}`);
  if (achados.length > 1) throw new CerebroError("ambiguo", `Mais de um ticket termina em ${sufixo}: use mais caracteres do id`);
  return achados[0];
}
