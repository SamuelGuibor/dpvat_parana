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

// Steps for INSS
const inssSteps: Step[] = [
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
    title: "Fase de Solicitação de Documentos",
    description:
      "Nossos procuradores e advogados irão até os hospitais e clínicas médicas em que você recebeu atendimento para solicitar seu prontuário, documentos hospitalares e laudos médicos. Da mesma forma que, em caso de pré-atendimento via SIATE ou SAMU, nossa equipe comparecerá ao Corpo de Bombeiros para solicitar as guias do atendimento da ambulância. Essa é a fase mais demorada do processo, podendo levar de 30-60 dias.",
  },
  {
    id: 4,
    title: "Coleta de documentos",
    description:
      "Após os documentos solicitados ficarem completos, os procuradores irão retirar os documentos e nossa equipe de analistas irá organizar e digitalizar todos os documentos para poder enviar para o INSS. Essa fase dura entre 3-7 dias para ser finalizada.",
  },
  {
    id: 5,
    title: "Análise e Protocolo",
    description:
      "Já preparamos o seu protocolo e encaminhamos os documentos para o INSS. Nesta fase aguardamos a análise documental e agendamento da sua perícia. O prazo que o INSS é de 30 a 60 dias.  Em caso de pendência no processo, nossa equipe irá entrar em contato avisando você.",
  },
  {
    id: 6,
    title: "Agendamento de perícia",
    description: (
      <>
        Seu processo está na fase de agendamento de perícia médica no INSS. Aguardaremos a data e horário da perícia.{" "}
        <a
          href="/faq-inss"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Saiba mais sobre a perícia do INSS
        </a>
        . Nossa equipe entrará em contato assim que nos for comunicado o agendamento pericial e passaremos as orientações.  
      </>
    ),
  },
  {
    id: 7,
    title: "Aguardando resultado da perícia",
    description: "Estamos aguardando o resultado da perícia. O prazo pode variar de 1 até 90 dias, dependendo do caso. Assim que sair, avisamos você.",
  },
  {
    id: 8,
    title: "Processo Finalizado",
    description:
      "O seu pedido administrativo foi finalizado. Em caso de necessidade encaminharemos para o setor jurídico fazer recurso do processo. Entraremos em contato para mais detalhes sobre o procedimento.",
  },
  {
    id: 9,
    final: "Processo encerrado",
  },
];

// Steps for Seguro de Vida
const seguroVidaSteps: Step[] = [
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
    title: "Fase de Solicitação de Documentos",
    description:
      "Nossos procuradores e advogados irão até os hospitais e clínicas médicas em que você recebeu atendimento para solicitar seu prontuário, documentos hospitalares e laudos médicos. Da mesma forma que, em caso de pré-atendimento via SIATE ou SAMU, nossa equipe comparecerá ao Corpo de Bombeiros para solicitar as guias do atendimento da ambulância. Essa é a fase mais demorada do processo, podendo levar de 30-60 dias.",
  },
  {
    id: 4,
    title: "Coleta de documentos e Apuração de dados",
    description:
      "Após os documentos solicitados ficarem completos, os procuradores irão retirar os documentos e nossa equipe de analistas irá organizar e digitalizar todos os documentos para poder enviar para a Seguradora.",
  },
  {
    id: 5,
    title: "Análise e Protocolo",
    description:
      "Nossa equipe entrará em contato com a seguradora para tentativa previa de acordo. Os documentos foram enviados, e em breve teremos novidades. O prazo de resposta é de 30 dias para cada envio de documentos, e informaremos caso haja pendências ou atualizações.",
  },
  {
    id: 6,
    title: "Processo em Andamento",
    description: (
      <>
        O processo está na fase de avaliação do sinistro pela seguradora. Aguardaremos o parecer final.{" "}
        <a
          href="/seguro-vida"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Saiba mais sobre o Seguro de Vida
        </a>
        .
      </>
    ),
  },
  {
    id: 7,
    title: "Aguardando decisão final",
    description: "Em caso de negativa administrativa, nossa equipe jurídica entrará com recurso judicial.",
  },
  {
    id: 8,
    title: "Pagamento de honorários",
    description:
      "Aguardando o pagamento dos honorários pelo trabalho no processo de RCF.",
  },
  {
    id: 9,
    final: "Processo encerrado",
  },
];

// Steps for RCF
const rcfSteps: Step[] = [
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
    title: "Fase de Solicitação de Documentos",
    description:
      "Nossos procuradores e advogados irão até os hospitais e clínicas médicas em que você recebeu atendimento para solicitar seu prontuário, documentos hospitalares e laudos médicos. Da mesma forma que, em caso de pré-atendimento via SIATE ou SAMU, nossa equipe comparecerá ao Corpo de Bombeiros para solicitar as guias do atendimento da ambulância. Essa é a fase mais demorada do processo, podendo levar de 30-60 dias.",
  },
  {
    id: 4,
    title: "Coleta de documentos e Apuração de dados",
    description:
      "Após os documentos solicitados ficarem completos, os procuradores irão retirar os documentos e nossa equipe de analistas irá organizar e digitalizar todos os documentos para poder enviar para a Seguradora do causador. Também serão apurados os dados pessoais do causador para eventual citação do mesmo em ação judicial.",
  },
  {
    id: 5,
    title: "Análise e Protocolo",
    description:
      "Nossa equipe entrará em contato com a seguradora para tentativa previa de acordo. Os documentos foram enviados, e em breve teremos novidades. O prazo de resposta é de 30 dias, e informaremos caso haja pendências ou atualizações.",
  },
  {
    id: 6,
    title: "Processo em Andamento",
    description: (
      <>
        O processo está na fase de avaliação do sinistro pela seguradora do causador. Aguardaremos o parecer final.{" "}
        <a
          href="/faq-rcf"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Saiba mais sobre o RCF
        </a>
        .
      </>
    ),
  },
  {
    id: 7,
    title: "Aguardando decisão final",
    description: "Em caso de negativa administrativa, nossa equipe jurídica entrará com recurso judicial.",
  },
  {
    id: 8,
    title: "Pagamento de honorários",
    description:
      "Aguardando o pagamento dos honorários pelo trabalho no processo de RCF.",
  },
  {
    id: 9,
    final: "Processo encerrado",
  },
];

// Steps for SPVAT
const spvatSteps: Step[] = [
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
    title: "Fase de Solicitação de Documentos",
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
    title: "Processo em STANDBY",
    description:
      "Quero te atualizar sobre a situação do seguro DPVAT:✅ O DPVAT ainda está realizando pagamentos para vítimas de acidentes ocorridos até 14 de novembro de 2023, desde que sejam solicitados dentro do prazo de 3 anos após a data do acidente, que é o prazo de prescrição.🚫 Para acidentes ocorridos a partir de 15 de novembro de 2023, infelizmente não há mais cobertura nem pagamentos, pois o seguro foi encerrado em razão de mudanças na legislação. O governo chegou a criar um novo seguro chamado SPVAT, que estava previsto para começar em 2025, porém a lei foi revogada antes de entrar em vigor. Ou seja, o SPVAT ainda não está valendo e depende de um novo projeto de lei ser aprovado na Câmara e no Senado, além da regulamentação pela SUSEP. Estamos acompanhando de perto todo esse processo. Assim que tivermos qualquer novidade, aviso você imediatamente.",
  },
  {
    id: 6,
    title: "Fase pericial",
    description: (
      <>
        Seu processo está na fase de perícia médica do SPVAT. Aguardaremos a data e horário da perícia.{" "}
        <a
          href="/faq-spvat"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Saiba mais sobre a perícia do SPVAT
        </a>
        .
      </>
    ),
  },
  {
    id: 7,
    title: "Aguardando resultado pericial",
    description: "Após a perícia, o resultado será liberado em até 7 dias.",
  },
  {
    id: 8,
    title: "",
    description:
      "Aguardando o pagamento dos honorários pelo nosso trabalho no processo do SPVAT.",
  },
  {
    id: 9,
    final: "Aguardando Regularização da Nova Lei 221/24",
  },
];

// Steps for DPVAT
const dpvatSteps: Step[] = [
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
  const [service, setService] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const { status, role, service } = await response.json();
        setServerStatus(status);
        setUserRole(role);
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
  }, []);

  if (isLoading) return <div><Loader2 className="h-4 w-4 animate-spin" /></div>;

  // Select the appropriate steps based on the service
  const selectedSteps = (() => {
    switch (service) {
      case "INSS":
        return inssSteps;
      case "Seguro de Vida":
        return seguroVidaSteps;
      case "RCF":
        return rcfSteps;
      case "SPVAT":
        return spvatSteps;
      case "DPVAT":
        return dpvatSteps;
      default:
        return dpvatSteps;
    }
  })();

  const completedSteps = mapServerStatusToCompletedSteps(serverStatus);
  const currentStepId = completedSteps.length > 0 ? Math.max(...completedSteps) + 1 : 1;
  const isStepVisible = (stepId: number) => stepId <= currentStepId;

  return (
    <div className="relative lg:pl-10">
      {selectedSteps.map((step, index) => {
        const isLastStep = index === selectedSteps.length - 1;
        const isVisible = isStepVisible(step.id);
        const isCurrentStep = step.id === currentStepId && !completedSteps.includes(step.id);

        return (
          <div
            key={step.id}
            className={`relative min-h-[150px] sm:h-[220px] lg:h-[200px] flex flex-col ${!isVisible ? "filter blur-sm" : ""}`}
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
                  completedSteps.includes(selectedSteps[selectedSteps.length - 1].id)
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}
              >
                {step.final}
              </div>
            ) : (
              <div
                className={`absolute left-2 top-0 w-5 h-5 rounded-full border-2 transition-all duration-300 ease-in-out ${
                  completedSteps.includes(step.id)
                    ? "bg-blue-500 border-blue-500"
                    : isCurrentStep
                    ? "bg-white border-red-500 animate-pulse"
                    : "bg-white border-blue-500"
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