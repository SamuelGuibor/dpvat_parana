'use client'

import { Badge } from "@/app/_components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/app/_components/ui/accordion";

function Feature() {
  return (
    <div className="w-full py-5 lg:py-8">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-10">
          <div className="flex gap-10 flex-col">
            <div className="flex gap-4 flex-col">
              <div>
                <Badge className="bg-blue-400 text-black border-blue-500" variant="outline">
                  Perguntas Frequentes
                </Badge>
              </div>
              <div className="flex gap-2 flex-col">
                <h4 className="text-3xl md:text-5xl tracking-tighter max-w-xl text-left font-regular">
                  Acompanhe seu Processo
                </h4>
                <p className="text-lg max-w-xl lg:max-w-lg leading-relaxed tracking-tight text-muted-foreground text-left">
                  Na Paraná Seguros, facilitamos o acompanhamento do seu processo. Veja o status de cada etapa e visualize os documentos enviados diretamente na área do cliente.
                </p>
              </div>
            </div>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>Como acompanho o status do meu processo?</AccordionTrigger>
              <AccordionContent>
                Na área do cliente, você pode verificar o status atual do seu processo, que pode ser: Iniciado, Aguardando Assinatura, Solicitação de Documentos, Coleta de Documentos, Análise de Documentos, Fase Pericial, Aguardando Resultado Pericial ou Pagamento de Honorários. Cada etapa é atualizada em tempo real.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Posso visualizar os documentos enviados?</AccordionTrigger>
              <AccordionContent>
                Sim! Na área do cliente, você pode acessar e visualizar todos os documentos enviados pela administração, como contratos, procurações, prontuários médicos e laudos, assim que forem digitalizados e disponibilizados.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>O que acontece na fase de Solicitação de Documentos?</AccordionTrigger>
              <AccordionContent>
                Nossa equipe solicita prontuários, documentos hospitalares e laudos médicos em hospitais, clínicas ou, se aplicável, no Corpo de Bombeiros (para atendimentos via SIATE ou SAMU). Essa etapa pode levar de 30 a 60 dias devido à dependência de terceiros.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Quanto tempo leva a análise de documentos?</AccordionTrigger>
              <AccordionContent>
                Após o envio dos documentos à seguradora, a análise leva até 30 dias por leva de documentos. Caso haja pendências, nossa equipe entrará em contato para informá-lo.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>O que é a Fase Pericial?</AccordionTrigger>
              <AccordionContent>
              É a etapa final do processo, onde será realizada uma perícia médica para confirmar as informações apresentadas. Aguardamos o agendamento da data e horário, e você será notificado assim que estiver disponível. Após a perícia, o resultado sai em até 7 dias úteis.

✔️ Leve todos os documentos e laudos médicos no dia da perícia.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-6">
              <AccordionTrigger>Como sei se meu processo está concluído?</AccordionTrigger>
              <AccordionContent>
                Quando o processo atingir a etapa de Pagamento de Honorários, significa que está finalizado. Você será notificado para realizar o pagamento dos honorários combinados pelo nosso trabalho.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}

export { Feature };