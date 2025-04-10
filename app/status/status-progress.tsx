"use client";

import { useState, useEffect } from "react";

interface Step {
  id: number;
  title?: string;
  description?: string;
  final?: string;
}

const steps: Step[] = [
  {
    id: 1,
    title: "Envio de documentos e assinatura da procuração",
    description:
      "Após envio dos seus documentos, nós te enviamos uma procuração para você assinar.",
  },
  {
    id: 2,
    title: "Solicitação de documentos",
    description:
      "Nossos procuradores e advogados vão atrás dos documentos hospitalares, prontuário, declaração do IML, guia do SIATE ou SAMU, entre outros. Essa é a fase mais demorada do processo, podendo levar de 30 a 60 dias.",
  },
  {
    id: 3,
    title: "Coleta de documentos",
    description:
      "Após os documentos ficarem prontos, nossa equipe digitaliza tudo e envia para a seguradora. Essa fase dura de 3 até 7 dias para organizar tudo.",
  },
  {
    id: 4,
    title: "Análise de documentos pela seguradora",
    description:
      "A seguradora analisa os documentos e agenda a perícia médica. Esse processo pode levar até 30 dias, podendo ser prorrogado.",
  },
  {
    id: 5,
    title: "Perícia médica e pagamentos",
    description:
      "Feita a perícia, o pagamento da indenização é feito em até 7 dias. O valor vai direto para a conta da vítima. Após isso, você realiza a transferência dos honorários da empresa.",
  },
  { id: 6, final: "Você recebeu seu dinheiro!" },
];

export default function ProgressTimeline() {
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Buscar o status do servidor ao carregar
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const status = await response.json();
        setServerStatus(status);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  // Atualizar o status automaticamente quando houver mudanças (opcional)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const status = await response.json();
        setServerStatus(status);
      } catch (error) {
        console.error(error);
      }
    }, 5000); // Atualiza a cada 5 segundos, ajuste conforme necessário
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return <div>Carregando...</div>;

  const completedSteps = mapServerStatusToCompletedSteps(serverStatus);

  return (
    <div className="relative pl-10">
      {steps.map((step, index) => {
        const isLastStep = index === steps.length - 1;

        return (
          <div key={step.id} className="relative h-[200px]">
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
                  completedSteps.includes(steps[steps.length - 2].id)
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

            <div className="ml-12 p-4 bg-gray-100 rounded-lg">
              {step.title && (
                <h2 className="text-lg font-semibold">{step.title}</h2>
              )}
              {step.description && (
                <p className="text-gray-600">{step.description}</p>
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
    case "ENVIO":
      return [1];
    case "SOLICITACAO":
      return [1, 2];
    case "COLETA":
      return [1, 2, 3];
    case "ANALISE":
      return [1, 2, 3, 4];
    case "PERICIA":
      return [1, 2, 3, 4, 5, 6];
    default:
      return [];
  }
};
