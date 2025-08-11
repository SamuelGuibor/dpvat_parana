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
              <AccordionTrigger>Sofri um acidente, quais são os meus direitos?</AccordionTrigger>
              <AccordionContent>
                Geralmente um acidente pode proporcionar a possibilidade da vítima receber diversas indenizações, entre elas:
                <p>
                  1. <span className="font-bold">Ação Indenizatória contra o causador</span> <span className="text-blue-700 font-bold">RCF</span>
                </p>
                <p>
                  2. <span className="font-bold">DPVAT</span>
                </p>
                <p>
                  3. <span className="font-bold">Auxílios do INSS</span>
                </p>
                <p>
                  4. <span className="font-bold">Seguro de Vida</span>
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Qual o prazo para solicitar o meu DPVAT?</AccordionTrigger>
              <AccordionContent>
                A vítima de acidente de trânsito tem até 3 anos, contando a partir da data do acidente, para dar a entrada.
                <p>
                  <span className="font-bold">Detalhe:</span> Em caso de vítima menor de idade, o prazo de prescrição conta-se 3 anos a partir da maioridade (completado 18 anos)
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Quem tem direito ao Seguro DPVAT?</AccordionTrigger>
              <AccordionContent>
                Toda vítima de acidente que envolva veículo automotores, tem direito a receber o DPVAT. Atenção as categorias de indenização pois para cada categoria há diferentes requisitos.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Quais são os tipos de indenização que eu posso receber do DPVAT?</AccordionTrigger>
              <AccordionContent>
                <span className="font-bold">Despesas de Assistência Médica e Suplementares (DAMS)</span>               
                  <p>
                   São despesas realizadas pela vítima, em consequência do acidente. 
                   Nelas, estão incluídas despesas médico-hospitalares em caráter privado, fisioterapias, medicamentos, equipamentos ortopédicos, órteses, 
                   próteses e outras medidas terapêuticas prescritas pelo médico ou fisioterapeuta (nos casos de solicitação de reembolso de fisioterapia) 
                   e comprovadas por recibos, cupons e notas fiscais com identificação do beneficiário (ou representante legal, no caso de menores), 
                   dos estabelecimentos e profissionais de saúde envolvidos.
                  </p>
                  <hr />
                  <br />
                  <span className="font-bold">Danos Corporais ou Invalidez</span>
                  <p>
                    Indenização concedida àqueles que tiveram, em consequência de acidente de trânsito, fraturas, perda ou redução da funcionalidade 
                    de um membro ou órgão. 
                    A Invalidez Permanente pode ser total ou parcial, subdividida em parcial completa ou incompleta, conforme a extensão das perdas 
                    anatômicas ou funcionais identificadas pela perícia médica.
                  </p>
                  <hr />
                  <br />
                <span className="font-bold">Morte</span>
                <p>
                  A indenização é devida nos casos de falecimento da vítima decorrente de acidente de trânsito.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>Tive acidente sem fratura, só danos materiais, o Seguro DPVAT cobre?</AccordionTrigger>
              <AccordionContent>
                Não, o DPVAT não cobre os danos materiais, mas caso tenha tido gastos com medicamentos, é possivel acionar o DAMS.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-6">
              <AccordionTrigger>Tive lesões sem fratura, mas fiquei com sequelas, posso receber o Seguro DPVAT?</AccordionTrigger>
              <AccordionContent>
                Sim, há possibilidade. Entretanto é preciso ter uma documentação médica que comprove a debilidade.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-7">
              <AccordionTrigger>Além de fraturas, que outro tipo de lesões o DPVAT cobre?</AccordionTrigger>
              <AccordionContent>
                Não há um critério exato, mas na péricia o perito pode conceder a indenização, em casos de:
                <p>
                  1. <span className="font-bold">Lesão nos Ligamentos</span>
                </p>
                <p>
                  2. <span className="font-bold">Rompimento do Tendão</span>
                </p>
                <p>
                  3. <span className="font-bold">Luxação Acromioclavicular com Cirurgia</span>
                </p>
                <p>
                  4. <span className="font-bold">Retirada do Baço</span>
                </p>
                <p>
                  5. <span className="font-bold">Traumatismo Craniano Grave</span>
                </p>
                <p>
                  6. <span className="font-bold">Perda de Visão</span>
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-8">
              <AccordionTrigger>Não fiz o boletim de Ocorrência ainda, tenho Direito ao Seguro DPVAT?</AccordionTrigger>
              <AccordionContent>
                Sim, Por mais que o boletim seja um requisito, ele não precisa ser feito na hora. Entretando, deve ser respeitado o prazo de 3 anos para dar a entrada e elaborar o B.O.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-9">
              <AccordionTrigger>Não tenho habilitação, posso receber o Seguro DPVAT?</AccordionTrigger>
              <AccordionContent>
                Sim, Não precisa ter CNH para receber o Seguro DPVAT.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-10">
              <AccordionTrigger>Como é calculado o valor a receber do Seguro DPVAT?</AccordionTrigger>
              <AccordionContent>
                O valor é calculado com base nas lesões sofridas, sendo cada parte do corpo um valor correspondente.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-11">
              <AccordionTrigger>Quais são os beneficios do INSS que eu posso receber?</AccordionTrigger>
              <AccordionContent>
                Você pode receber:
                <p>
                  1. <span className="font-bold">Auxílio Acidente</span>
                </p>
                <p>
                  2. <span className="font-bold">Auxílio Doença</span>
                </p>
                <p>
                  3. <span className="font-bold">Aposentadoria por Invalidez</span>
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-12">
              <AccordionTrigger>O que é o Auxílio Acidente?</AccordionTrigger>
              <AccordionContent>
                O auxílio-acidente é um benefício do INSS para trabalhadores que sofreram acidentes e que por isso ficaram com sequelas que reduzem a capacidade de trabalho              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-13">
              <AccordionTrigger>O que é o Auxílio Doença?</AccordionTrigger>
              <AccordionContent>
                O auxílio-doença é um benefício previdenciário para quem precisa se afastar do trabalho ou que não consegue realizar as atividades rotineiras por conta de doença ou acidente.              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-14">
              <AccordionTrigger>O que é a Aposentadoria por Invalidez?</AccordionTrigger>
              <AccordionContent>
                A aposentadoria por invalidez é um benefício do INSS para quem não consegue mais trabalhar devido à doença ou acidente.A aposentadoria por invalidez é um benefício do INSS para quem não consegue mais trabalhar devido à doença ou acidente.
                A incapacidade para o trabalho deve ser total e permanente, sem perspectiva de recuperação ou reabilitação para exercer qualquer profissão              
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-9">
              <AccordionTrigger>Como acompanho o status do meu processo?</AccordionTrigger>
              <AccordionContent>
                Na área do cliente, você pode verificar o status atual do seu processo, que pode ser: Iniciado, Aguardando Assinatura, Solicitação de Documentos, Coleta de Documentos, Análise de Documentos, Fase Pericial, Aguardando Resultado Pericial ou Pagamento de Honorários. Cada etapa é atualizada em tempo real.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
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