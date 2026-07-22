"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { createLog, diffFields, CARD_FIELD_LABELS, buildUpdateMessage } from "../../_shared/lib/log";
import { notifyStatusProgress } from "../../_shared/lib/whatsapp/status-notify";
import { getStatusLabel } from "../../nova-dash/card-dialog/constants";
import { stripFormat } from "../../_shared/utils/format";

interface UpdateProcessData {
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

export async function updateProcess(data: UpdateProcessData) {
  // O banco guarda CPF/telefone/CEP SEM máscara (só dígitos) — a UI formata
  // na exibição. Normaliza antes do update e do diff de log.
  data.cpf = stripFormat(data.cpf);
  data.cpf_res = stripFormat(data.cpf_res);
  data.telefone = stripFormat(data.telefone);
  data.telefone_secundario = stripFormat(data.telefone_secundario);
  data.cep = stripFormat(data.cep);

  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  try {
    // Busca o processo atual: usado tanto para comparar o role quanto para
    // registrar no histórico (Log) exatamente quais campos mudaram.
    const currentProcess = await db.process.findUnique({
      where: { id: data.id },
    });

    if (!currentProcess) {
      throw new Error("Processo não encontrado.");
    }

    const shouldUpdateTimer = data.role && data.role !== currentProcess.role;

    const updatedProcess = await db.process.update({
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
        statusStartedAt: shouldUpdateTimer ? new Date() : currentProcess.statusStartedAt,
        observacao: data.obs,
        otherObs: data.otherObs,
        service: data.service,
        senha_inss: data.senha_inss,
        // Só atualiza quando o campo é enviado; ao mudar a data, libera nova notificação.
        afastadoAte: data.afastadoAte !== undefined ? (data.afastadoAte ? new Date(data.afastadoAte) : null) : undefined,
        afastadoNotificado: data.afastadoAte !== undefined ? false : undefined,
      },
    });

    // Checklist de progresso avançou → informa o cliente no WhatsApp
    // (assíncrono; nunca bloqueia nem quebra a atualização do card).
    if (data.status && data.status !== currentProcess.status) {
      await notifyStatusProgress({
        phone: updatedProcess.telefone,
        clientName: updatedProcess.name,
        service: updatedProcess.service,
        newStatus: data.status,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
      });
    }

    // Mudança de status de progresso ganha um log próprio (mais granular que
    // "Edições"), com de/para amigável — base para métricas por setor.
    if (data.status && data.status !== currentProcess.status) {
      const fromLabel = getStatusLabel(updatedProcess.service, currentProcess.status);
      const toLabel = getStatusLabel(updatedProcess.service, data.status) ?? data.status;
      await createLog({
        action: "status_change",
        message: fromLabel
          ? `avançou o status de "${fromLabel}" para "${toLabel}"`
          : `definiu o status como "${toLabel}"`,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        processId: data.id,
        metadata: {
          from: currentProcess.status,
          to: data.status,
          fromLabel,
          toLabel,
          service: updatedProcess.service ?? null,
          cardName: updatedProcess.name ?? null,
        },
      });
    }

    // Registra no histórico quais campos foram alterados, com valor antigo e
    // novo de cada um (status fica de fora: já tem log próprio acima).
    // `obs` no client é gravado na coluna `observacao` do Process.
    const changed = diffFields(
      data as unknown as Record<string, unknown>,
      currentProcess,
      CARD_FIELD_LABELS,
      { obs: "observacao" },
    ).filter((c) => c.field !== "status");
    if (changed.length) {
      await createLog({
        action: "update",
        message: buildUpdateMessage(changed),
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        processId: data.id,
        metadata: {
          fields: changed.map((c) => c.label),
          changes: changed,
          service: updatedProcess.service ?? null,
          cardName: updatedProcess.name ?? null,
        },
      });
    }

    return {
      id: updatedProcess.id,
      name: updatedProcess.name || "",
      status: updatedProcess.status || undefined,
      type: updatedProcess.role || "PROCESS",
      role: updatedProcess.role || "PROCESS",
      statusStartedAt: updatedProcess.statusStartedAt ? updatedProcess.statusStartedAt.toISOString() : null,
      nome_res: updatedProcess.nome_res || "",
      rg_res: updatedProcess.rg_res || "",
      cpf_res: updatedProcess.cpf_res || "",
      estado_civil_res: updatedProcess.estado_civil_res || "",
      profissao_res: updatedProcess.profissao_res || "",
      cpf: updatedProcess.cpf || "",
      data_nasc: updatedProcess.data_nasc || "",
      email: updatedProcess.email || "",
      rua: updatedProcess.rua || "",
      bairro: updatedProcess.bairro || "",
      numero: updatedProcess.numero || "",
      cep: updatedProcess.cep || "",
      rg: updatedProcess.rg || "",
      nome_mae: updatedProcess.nome_mae || "",
      telefone: updatedProcess.telefone || "",
      telefone_secundario: updatedProcess.telefone_secundario || "",
      rede_social: updatedProcess.rede_social || "",
      cidade: updatedProcess.cidade || "",
      estado: updatedProcess.estado || "",
      estado_civil: updatedProcess.estado_civil || "",
      profissao: updatedProcess.profissao || "",
      nacionalidade: updatedProcess.nacionalidade || "",
      data_acidente: updatedProcess.data_acidente || "",
      atendimento_via: updatedProcess.atendimento_via || "",
      hospital: updatedProcess.hospital || "",
      outro_hospital: updatedProcess.outro_hospital || "",
      lesoes: updatedProcess.lesoes || "",
      obs: updatedProcess.observacao || "",
      otherObs: updatedProcess.otherObs || "",
      afastadoAte: updatedProcess.afastadoAte ? updatedProcess.afastadoAte.toISOString() : null,
      service: updatedProcess.service || "",
      senha_inss: updatedProcess.senha_inss || "",
      cardNumber: updatedProcess.cardNumber ?? null,
    };
  } catch (error) {
    console.error("Erro ao atualizar processo:", error);
    throw new Error("Não foi possível atualizar os dados do processo.");
  }
}