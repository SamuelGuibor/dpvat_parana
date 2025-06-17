/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface Step {
  id: number;
  title?: string;
  description?: string | JSX.Element;
  final?: string;
}

const steps: Step[] = [
  {
    id: 1,
    title: "Processo iniciado",
    description:
      "Confirmado o envio dos seus documentos iniciais. Agora nossa equipe da Paraná Seguros vai preparar o protocolo de entrada e enviará o contrato e procuração para colher sua assinatura.",
  },
  {
    id: 2,
    title: "Aguardando assinatura",
    description:
      "Enviamos o contrato e procuração e agora estamos aguardando a sua assinatura.",
  },
  {
    id: 3,
    title: "Fase de solicitação de documentos",
    description:
      "Nossos procuradores e advogados irão até os hospitais e clínicas médicas em que você recebeu atendimento para solicitar seu prontuário, documentos hospitalares e laudos médicos. Da mesma forma que, em caso de pré-atendimento via SIATE ou SAMU, nossa equipe comparecerá ao Corpo de Bombeiros para solicitar as guias do atendimento da ambulância. Essa é a fase mais demorada do processo, podendo levar de 30-60 dias.",
  },
  {
    id: 4,
    title: "Coleta de documentos",
    description:
      "Após os documentos solicitados ficarem completos, os procuradores irão retirar os documentos e nossa equipe de analistas irá organizar e digitalizar todos os documentos para poder enviar para a Seguradora. Essa fase dura entre 3-7 dias para ser finalizada.",
  },
  {
    id: 5,
    title: "Análise de documentos",
    description:
      "Seus documentos já foram enviados para a Seguradora e agora devemos aguardar a análise deles. Nesta fase eles analisarão todos os detalhes da documentação e nos comunicarão se precisam de mais documentos. O prazo que a Seguradora coloca para análise de cada leva de documentos enviados é de 30 dias. Em caso de pendência no processo, nossa equipe irá entrar em contato avisando você.",
  },
  {
    id: 6,
    title: "Fase Pericial",
    description: (
      <>
        Reta final do processo. Após muito esforço e dedicação do nosso pessoal, o seu processo finalmente caminhou para a fase de perícia médica. Agora, aguardaremos até quando tivermos a data e horário do agendamento da sua perícia. Fique tranquilo, agora só falta uma pequena etapa para concluir seu processo. Contamos com sua colaboração e agradecemos pela sua paciência.{" "}
        <a
          href="/faq"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Para saber mais sobre perícia médica, clique aqui
        </a>
        .
      </>
    ),
  },
  {
    id: 7,
    title: "Aguardando resultado pericial",
    description: "Após realizar a perícia, o resultado sai em até 7 dias.",
  },
  {
    id: 8,
    title: "Pagamento de honorários",
    description:
      "Aguardando pagamento dos honorários combinados pelo nosso trabalho.",
  },
  {
    id: 9,
    final: "Processo encerrado",
  },
];

export default function ProgressTimeline() {
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const { status, role } = await response.json();
        setServerStatus(status);
        setUserRole(role);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const { status, role } = await response.json();
        setServerStatus(status);
        setUserRole(role);
      } catch (error) {
        console.error(error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return <div><Loader2 className="h-4 w-4 animate-spin" /></div>;


  const completedSteps = mapServerStatusToCompletedSteps(serverStatus);

  return (
    <div className="relative lg:pl-10">
      {steps.map((step, index) => {
        const isLastStep = index === steps.length - 1;

        return (
          <div
            key={step.id}
            className="relative min-h-[150px] sm:h-[220px] lg:h-[200px] flex flex-col"
          >
            {!isLastStep && (
              <div className="absolute left-4 top-0 w-0.5 h-full bg-gray-200">
                <div
                  className={`w-full bg-blue-500 transition-all duration-500 ease-in-out ${
                    completedSteps.includes(step.id) ? "h-full" : "h-0"
                  }`}
                ></div>
              </div>
            )}

            {step.final ? (
              <div
                className={`absolute left-0 top-0 px-4 py-2 rounded-full text-white font-semibold transition-all duration-300 ease-in-out ${
                  completedSteps.includes(steps[steps.length - 1].id)
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}
              >
                {step.final}
              </div>
            ) : (
              <div
                className={`absolute left-2 top-0 w-5 h-5 rounded-full border-2 border-blue-500 transition-all duration-300 ease-in-out ${
                  completedSteps.includes(step.id) ? "bg-blue-500" : "bg-white"
                }`}
              ></div>
            )}

            <div className="ml-12 p-4 sm:p-6 bg-gray-100 rounded-lg space-y-3 sm:space-y-4">
              {step.title && (
                <h2 className="text-lg font-semibold">{step.title}</h2>
              )}
              {step.description && (
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const mapServerStatusToCompletedSteps = (
  serverStatus: string | null
): number[] => {
  if (!serverStatus) return [];

  switch (serverStatus) {
    case "INICIADO":
      return [1];
    case "AGUARDANDO_ASSINATURA":
      return [1, 2];
    case "SOLICITAR_DOCUMENTOS":
      return [1, 2, 3];
    case "COLETA_DOCUMENTOS":
      return [1, 2, 3, 4];
    case "ANALISE_DOCUMENTOS":
      return [1, 2, 3, 4, 5];
    case "PERICIAL":
      return [1, 2, 3, 4, 5, 6];
    case "AGUARDANDO_PERICIAL":
      return [1, 2, 3, 4, 5, 6, 7];
    case "PAGAMENTO_HONORARIO":
      return [1, 2, 3, 4, 5, 6, 7, 8];
    case "PROCESSO_ENCERRADO":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    default:
      return [];
  }
};