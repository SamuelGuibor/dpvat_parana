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
      description = `${proposta}\n\n(Skill não informada: skill nova ou a IA acha pelo assunto. Skill nova vira ticket DEV.)`;
    }
  } else if (destino === "bot") {
    const pb = await db.whatsAppPlaybook.findFirst({ where: { status: "publicado" }, orderBy: { version: "desc" }, select: { version: true } });
    meta = { ...meta, playbookVersao: pb?.version };
  } else if (input.hospital?.trim()) {
    const hospital = input.hospital.trim();
    const [grupos, index, cards] = await Promise.all([loadHospitalGroups(), loadVaultIndex(), activeCardsByHospital()]);
    const m = matchColumn([...grupos.values()].map((g) => g.nome), normalizeHospitalName(hospital));
    const nome = m.exact !== null ? m.exact : m.candidates.length === 1 ? m.candidates[0] : null;
    const key = normalizeHospitalName(nome ?? hospital);
    const g = nome ? grupos.get(key) : undefined;
    const hoje = g ? g.autos.map(automationSourceText).join("\n\n") : "";
    meta = {
      ...meta,
      hospital: g?.nome ?? hospital,
      automacoes: g?.autos.map((a) => ({ id: a.id, nome: a.name })) ?? [],
      nota: index.find((n) => n.hospital_norm === key)?.path,
      hoje: hoje || undefined,
      comparacao: compararContatos(hoje, proposta),
      cardsAtivos: cards.get(key)?.n ?? 0,
    };
    if (!g) description = `${proposta}\n\n(Hospital sem automação ativa: conhecimento novo.)`;
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
