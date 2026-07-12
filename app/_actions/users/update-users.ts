"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { createLog, diffFields, CARD_FIELD_LABELS, buildUpdateMessage } from "../../_shared/lib/log";
import { notifyStatusProgress } from "../../_shared/lib/whatsapp/status-notify";
import { getStatusLabel } from "../../nova-dash/card-dialog/constants";

interface UpdateUserData {
  id: string;
  name?: string;
  cpf?: string;
  data_nasc?: string;
  email?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  profissao_res?: string;
  rua?: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  rg?: string;
  nome_mae?: string;
  telefone?: string;
  telefone_secundario?: string;
  rede_social?: string;
  cidade?: string;
  estado?: string;
  estado_civil?: string;
  profissao?: string;
  nacionalidade?: string;
  data_acidente?: string;
  atendimento_via?: string;
  hospital?: string;
  outro_hospital?: string;
  lesoes?: string;
  status?: string;
  role?: string;
  service?: string;
  obs?: string;
  otherObs?: string;
  senha_inss?: string;
  afastadoAte?: string | null;
}

export async function updateUser(data: UpdateUserData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  try {
    // Busca o usuário atual: usado tanto para comparar o role quanto para
    // registrar no histórico (Log) exatamente quais campos mudaram.
    const currentUser = await db.user.findUnique({
      where: { id: data.id },
    });

    if (!currentUser) {
      throw new Error("Usuário não encontrado.");
    }

    const shouldUpdateTimer = data.role && data.role !== currentUser.role;

    const updatedUser = await db.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        cpf: data.cpf,
        data_nasc: data.data_nasc || undefined,
        email: data.email,
        rua: data.rua,
        nome_res: data.nome_res,
        rg_res: data.rg_res,
        cpf_res: data.cpf_res,
        estado_civil_res: data.estado_civil_res,
        profissao_res: data.profissao_res,
        bairro: data.bairro,
        numero: data.numero,
        cep: data.cep,
        rg: data.rg,
        nome_mae: data.nome_mae,
        telefone: data.telefone,
        telefone_secundario: data.telefone_secundario,
        rede_social: data.rede_social,
        cidade: data.cidade,
        estado: data.estado,
        estado_civil: data.estado_civil,
        profissao: data.profissao,
        nacionalidade: data.nacionalidade,
        data_acidente: data.data_acidente || undefined,
        atendimento_via: data.atendimento_via,
        hospital: data.hospital,
        outro_hospital: data.outro_hospital,
        lesoes: data.lesoes,
        status: data.status || undefined,
        role: data.role,
        statusStartedAt: shouldUpdateTimer ? new Date() : currentUser.statusStartedAt,
        service: data.service,
        obs: data.obs,
        otherObs: data.otherObs,
        senha_inss: data.senha_inss,
        // Só atualiza quando o campo é enviado; ao mudar a data, libera nova notificação.
        afastadoAte: data.afastadoAte !== undefined ? (data.afastadoAte ? new Date(data.afastadoAte) : null) : undefined,
        afastadoNotificado: data.afastadoAte !== undefined ? false : undefined,
      },
    });

    // Checklist de progresso avançou → informa o cliente no WhatsApp
    // (assíncrono; nunca bloqueia nem quebra a atualização do card).
    if (data.status && data.status !== currentUser.status) {
      await notifyStatusProgress({
        phone: updatedUser.telefone,
        clientName: updatedUser.name,
        service: updatedUser.service,
        newStatus: data.status,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
      });
    }

    // Mudança de status de progresso ganha um log próprio (mais granular que
    // "Edições"), com de/para amigável — base para métricas por setor.
    if (data.status && data.status !== currentUser.status) {
      const fromLabel = getStatusLabel(updatedUser.service, currentUser.status);
      const toLabel = getStatusLabel(updatedUser.service, data.status) ?? data.status;
      await createLog({
        action: "status_change",
        message: fromLabel
          ? `avançou o status de "${fromLabel}" para "${toLabel}"`
          : `definiu o status como "${toLabel}"`,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        userId: data.id,
        metadata: {
          from: currentUser.status,
          to: data.status,
          fromLabel,
          toLabel,
          service: updatedUser.service ?? null,
          cardName: updatedUser.name ?? null,
        },
      });
    }

    // Registra no histórico quais campos foram alterados, com valor antigo e
    // novo de cada um (status fica de fora: já tem log próprio acima).
    const changed = diffFields(data as unknown as Record<string, unknown>, currentUser, CARD_FIELD_LABELS)
      .filter((c) => c.field !== "status");
    if (changed.length) {
      await createLog({
        action: "update",
        message: buildUpdateMessage(changed),
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        userId: data.id,
        metadata: {
          fields: changed.map((c) => c.label),
          changes: changed,
          service: updatedUser.service ?? null,
          cardName: updatedUser.name ?? null,
        },
      });
    }

    return {
      id: updatedUser.id,
      name: updatedUser.name || "",
      status: updatedUser.status || undefined,
      type: updatedUser.role || "USER",
      role: updatedUser.role || "USER",
      statusStartedAt: updatedUser.statusStartedAt ? updatedUser.statusStartedAt.toISOString() : null,
      nome_res: updatedUser.nome_res || "",
      rg_res: updatedUser.rg_res || "",
      cpf_res: updatedUser.cpf_res || "",
      estado_civil_res: updatedUser.estado_civil_res || "",
      profissao_res: updatedUser.profissao_res || "",
      cpf: updatedUser.cpf || "",
      data_nasc: updatedUser.data_nasc || "",
      email: updatedUser.email || "",
      rua: updatedUser.rua || "",
      bairro: updatedUser.bairro || "",
      numero: updatedUser.numero || "",
      cep: updatedUser.cep || "",
      rg: updatedUser.rg || "",
      nome_mae: updatedUser.nome_mae || "",
      telefone: updatedUser.telefone || "",
      telefone_secundario: updatedUser.telefone_secundario || "",
      rede_social: updatedUser.rede_social || "",
      cidade: updatedUser.cidade || "",
      estado: updatedUser.estado || "",
      estado_civil: updatedUser.estado_civil || "",
      profissao: updatedUser.profissao || "",
      nacionalidade: updatedUser.nacionalidade || "",
      data_acidente: updatedUser.data_acidente || "",
      atendimento_via: updatedUser.atendimento_via || "",
      hospital: updatedUser.hospital || "",
      outro_hospital: updatedUser.outro_hospital || "",
      lesoes: updatedUser.lesoes || "",
      service: updatedUser.service || "",
      obs: updatedUser.obs || "",
      otherObs: updatedUser.otherObs || "",
      afastadoAte: updatedUser.afastadoAte ? updatedUser.afastadoAte.toISOString() : null,
      senha_inss: updatedUser.senha_inss || "",
      cardNumber: updatedUser.cardNumber ?? null,
    };
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    throw new Error("Não foi possível atualizar os dados do usuário.");
  }
}