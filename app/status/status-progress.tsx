"use client"

/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
// components/ProgressTimeline.tsx
import { useState } from "react";

// Definir a interface para o tipo de cada step
interface Step {
  id: number; // Tornar id obrigatório, já que será usado em completedSteps
  title?: string;
  description?: string;
  final?: string; // Propriedade opcional para o texto final
}

// Definir o array de steps com o tipo Step[]
const steps: Step[] = [
  { id: 1, title: "Envio de documentos e assinatura da procuração", description: "Após envio dos seus documentos, nós te enviamos uma procuração para você assinar." },
  { id: 2, title: "Solicitação de documentos", description: "Nossos procuradores e advogados vão atrás dos documentos hospitalares, prontuário, declaração do IML, guia do SIATE ou SAMU, entre outros. Essa é a fase mais demorada do processo, podendo levar de 30 a 60 dias." },
  { id: 3, title: "Coleta de documentos", description: "Após os documentos ficarem prontos, nossa equipe digitaliza tudo e envia para a seguradora. Essa fase dura de 3 até 7 dias para organizar tudo." },
  { id: 4, title: "Análise de documentos pela seguradora", description: "A seguradora analisa os documentos e agenda a perícia médica. Esse processo pode levar até 30 dias, podendo ser prorrogado." },
  { id: 5, title: "Perícia médica e pagamentos", description: "Feita a perícia, o pagamento da indenização é feito em até 7 dias. O valor vai direto para a conta da vítima. Após isso, você realiza a transferência dos honorários da empresa." },
  { id: 6, final: "Você recebeu seu dinheiro!" }, // Mantemos como um step, mas com a propriedade final
];

export default function ProgressTimeline() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const handleCheckboxChange = (stepId: number) => {
    if (completedSteps.includes(stepId)) {
      setCompletedSteps(completedSteps.filter((id) => id !== stepId));
    } else {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };

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
                  completedSteps.includes(steps[steps.length - 2].id) ? "bg-green-500" : "bg-gray-300"
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
              {step.title && <h2 className="text-lg font-semibold">{step.title}</h2>}
              {step.description && <p className="text-gray-600">{step.description}</p>}
              {!step.final && (
                <label className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={completedSteps.includes(step.id)}
                    onChange={() => handleCheckboxChange(step.id)}
                  />
                  <span>Marcar como concluído</span>
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}