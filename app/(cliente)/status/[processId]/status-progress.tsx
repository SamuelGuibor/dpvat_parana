/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { Loader2, Check, Flag } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Step {
  id: number;
  title?: string;
  description?: string | JSX.Element;
  final?: string;
}

// ─── DPVAT ────────────────────────────────────────────────────────────────────

const dpvatSteps: Step[] = [
  {
    id: 1,
    title: "Processo iniciado",
    description:
      "Juntamos toda a sua documentação necessária para dar início ao seu processo. Nossa equipe já está trabalhando para garantir que tudo esteja em ordem.",
  },
  {
    id: 2,
    title: "Prontuário",
    description:
      "Nossos procuradores estão solicitando o seu prontuário médico junto ao hospital ou clínica em que você foi atendido. Conforme o prazo do Conselho Regional de Medicina (CRM), esse processo leva em média 30 dias.",
  },
  {
    id: 3,
    title: "Boletim de Ocorrência",
    description:
      "O B.O. precisa ser validado pela entidade que atendeu a ocorrência — Polícia Militar (PM), Polícia Civil ou Polícia Rodoviária Federal (PRF). Nossa equipe está acompanhando esse processo.",
  },
  {
    id: 4,
    title: "Análise documental",
    description:
      "Seus documentos foram enviados para análise pela Caixa Econômica Federal, responsável pelo seguro DPVAT. Essa fase pode levar até 30 dias. Nossa equipe acompanha de perto qualquer pendência e entrará em contato caso necessário.",
  },
  {
    id: 5,
    title: "Perícia médica",
    description: (
      <>
        Reta final do processo! Seu processo chegou à fase de perícia médica. Aguardaremos a data e horário do agendamento.{" "}
        <a
          href="/faq"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Saiba mais sobre a perícia médica
        </a>
        .
      </>
    ),
  },
  {
    id: 6,
    title: "Pagamento",
    description:
      "Ótima notícia! A perícia foi concluída com sucesso. O pagamento leva em torno de 7 dias para ser realizado. Em breve você receberá os valores devidos.",
  },
  {
    id: 7,
    final: "Processo finalizado",
  },
];

const dpvatStatusOrder = [
  'DPVAT_S1', 'DPVAT_S2', 'DPVAT_S3', 'DPVAT_S4', 'DPVAT_S5', 'DPVAT_S6', 'DPVAT_S7',
];

// ─── INSS – Auxílio-Acidente ──────────────────────────────────────────────────

const inssSteps: Step[] = [
  {
    id: 1,
    title: "Processo iniciado",
    description:
      "Estamos analisando seus dados e documentos para darmos seguimento ao seu processo de Auxílio-Acidente no INSS.",
  },
  {
    id: 2,
    title: "Documentação médica hospitalar",
    description:
      "Solicitamos sua documentação médica e hospitalar junto às instituições de saúde que prestaram atendimento. Conforme o prazo do Conselho Regional de Medicina (CRM), essa etapa leva em média 30 dias. É uma fase fundamental para comprovar o acidente e suas sequelas.",
  },
  {
    id: 3,
    title: "Documentos INSS",
    description: (
      <>
        Solicitamos junto ao INSS o seu dossiê contendo todas as suas informações do histórico previdenciário. Em caso de dúvidas, entre em contato conosco pelo{" "}
        <a
          href="https://wa.me/5541999999999"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
        .
      </>
    ),
  },
  {
    id: 4,
    title: "Aguardando perícia administrativa",
    description:
      "Seu processo está aguardando a realização da perícia médica administrativa no INSS. Nossa equipe está acompanhando o agendamento e entrará em contato com as orientações assim que tivermos a data confirmada.",
  },
  {
    id: 5,
    title: "Fase administrativa realizada",
    description:
      "A fase administrativa foi concluída. Estamos preparando os próximos passos do seu processo junto à equipe jurídica.",
  },
  {
    id: 6,
    title: "Enviado ao departamento jurídico",
    description:
      "Nossa equipe de advogados vai formular o pedido do seu benefício na esfera judicial. A partir daqui, seu processo segue para análise e tramitação nos tribunais.",
  },
  {
    id: 7,
    title: "Acompanhamento judicial",
    description: (
      <>
        Agora você pode acompanhar o seu processo através das plataformas oficiais do governo.{" "}
        <a
          href="#"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver processo
        </a>
        . Nossa equipe continua acompanhando cada movimentação.
      </>
    ),
  },
  {
    id: 8,
    final: "Processo finalizado",
  },
];

const inssStatusOrder = [
  'INSS_S1', 'INSS_S2', 'INSS_S3', 'INSS_S4', 'INSS_S5', 'INSS_S6', 'INSS_S7', 'INSS_S8',
];

// ─── Demais serviços (legado) ─────────────────────────────────────────────────

const genericSteps: Step[] = [
  { id: 1, title: "Processo iniciado", description: "Confirmado o envio dos seus documentos iniciais. Nossa equipe está preparando o protocolo de entrada." },
  { id: 2, title: "Aguardando assinatura", description: "Enviamos o contrato e procuração e agora estamos aguardando a sua assinatura." },
  { id: 3, title: "Fase de Solicitação de Documentos", description: "Nossa equipe está solicitando os documentos necessários junto às instituições responsáveis. Essa fase pode levar de 30 a 60 dias." },
  { id: 4, title: "Coleta de documentos", description: "Após os documentos ficarem prontos, nossa equipe irá retirá-los e organizar tudo para envio." },
  { id: 5, title: "Análise e Protocolo", description: "Os documentos foram enviados e estamos aguardando análise. O prazo de resposta é de até 30 dias." },
  { id: 6, title: "Fase Pericial", description: "Seu processo chegou à fase de perícia. Aguardaremos a data e horário do agendamento." },
  { id: 7, title: "Aguardando resultado pericial", description: "Após a perícia, o resultado é liberado em até 7 dias." },
  { id: 8, title: "Pagamento de honorários", description: "Aguardando o pagamento dos honorários pelo trabalho realizado." },
  { id: 9, final: "Processo encerrado" },
];

const genericStatusOrder = [
  'INICIADO', 'AGUARDANDO_ASSINATURA', 'SOLICITAR_DOCUMENTOS', 'COLETA_DOCUMENTOS',
  'ANALISE_DOCUMENTOS', 'PERICIAL', 'AGUARDANDO_PERICIAL', 'PAGAMENTO_HONORARIO', 'PROCESSO_ENCERRADO',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStepsByService(service: string | null) {
  if (service === 'DPVAT') return { steps: dpvatSteps, order: dpvatStatusOrder };
  if (service === 'INSS') return { steps: inssSteps, order: inssStatusOrder };
  return { steps: genericSteps, order: genericStatusOrder };
}

function getCompletedSteps(status: string | null, order: string[]): number[] {
  if (!status) return [];
  const idx = order.indexOf(status);
  if (idx < 0) return [];
  return Array.from({ length: idx + 1 }, (_, i) => i + 1);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ProgressTimeline() {
  const { processId } = useParams();

  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/process-status?processId=${processId}`, { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status do processo");
        const { status, service } = await response.json();
        setServerStatus(status);
        setService(service);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();

    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [processId]);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const { steps: selectedSteps, order } = getStepsByService(service);
  const completedSteps = getCompletedSteps(serverStatus, order);
  const currentStepId = completedSteps.length > 0 ? Math.max(...completedSteps) + 1 : 1;

  const realSteps = selectedSteps.filter((s) => !s.final).length;
  const progressPct = Math.min(100, Math.round((completedSteps.length / realSteps) * 100));

  return (
    <div className="mx-auto max-w-3xl">
      {/* Barra de progresso geral */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-500">
          <span>Progresso do processo</span>
          <span className="text-blue-600">{progressPct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-700 ease-in-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {selectedSteps.map((step, index) => {
          const isLastStep = index === selectedSteps.length - 1;
          const isCompleted = completedSteps.includes(step.id);
          const isCurrentStep = step.id === currentStepId && !isCompleted;
          const isFuture = !isCompleted && !isCurrentStep;

          return (
            <div key={step.id} className="relative flex gap-4 pb-6 last:pb-0 sm:gap-5">
              {/* Linha conectora */}
              {!isLastStep && (
                <div className="absolute left-[18px] top-10 h-[calc(100%-2.5rem)] w-0.5 sm:left-[22px]">
                  <div className="h-full w-full bg-gray-200" />
                  <div
                    className={`absolute inset-0 w-full origin-top bg-blue-500 transition-all duration-500 ease-in-out ${
                      isCompleted ? "scale-y-100" : "scale-y-0"
                    }`}
                  />
                </div>
              )}

              {/* Marcador */}
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300 sm:h-11 sm:w-11 ${
                    step.final
                      ? isCompleted
                        ? "border-green-500 bg-green-500 text-white shadow-md shadow-green-500/30"
                        : "border-gray-300 bg-white text-gray-300"
                      : isCompleted
                      ? "border-blue-500 bg-blue-500 text-white shadow-md shadow-blue-500/30"
                      : isCurrentStep
                      ? "animate-pulse border-blue-500 bg-white text-blue-600 ring-4 ring-blue-100"
                      : "border-gray-300 bg-white text-gray-400"
                  }`}
                >
                  {step.final ? (
                    <Flag className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : isCompleted ? (
                    <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    step.id
                  )}
                </div>
              </div>

              {/* Card */}
              <div
                className={`min-w-0 flex-1 rounded-xl border p-4 transition-all duration-300 sm:p-5 ${
                  step.final
                    ? isCompleted
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-white"
                    : isCurrentStep
                    ? "border-blue-200 bg-white shadow-md shadow-blue-500/5 ring-1 ring-blue-100"
                    : isFuture
                    ? "border-gray-200 bg-white opacity-60"
                    : "border-gray-200 bg-white"
                }`}
              >
                {step.final ? (
                  <div className="flex items-center gap-2">
                    <h2
                      className={`text-base font-semibold sm:text-lg ${
                        isCompleted ? "text-green-700" : "text-gray-400"
                      }`}
                    >
                      {step.final}
                    </h2>
                  </div>
                ) : (
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center gap-2">
                      {step.title && (
                        <h2 className="text-base font-semibold text-gray-800 sm:text-lg">
                          {step.title}
                        </h2>
                      )}
                      {isCurrentStep && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Em andamento
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Concluído
                        </span>
                      )}
                    </div>
                    {step.description && (
                      <p className="text-sm leading-relaxed text-gray-600 sm:text-[15px]">
                        {step.description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
