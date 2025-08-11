/* eslint-disable @next/next/no-img-element */
"use client";

import { HeroHeader } from "../section/hero9-header";
import { MdAttachMoney } from "react-icons/md"; // Ícone para Reembolso
import { FaUserSlash } from "react-icons/fa"; // Ícone para Invalidez
import { FaRibbon } from "react-icons/fa"; // Ícone para Morte
import Footer from "../section/footer";
import { Disclosure } from "@headlessui/react";
import { ChevronUpIcon } from "lucide-react";

const faqList = [
  {
    question: "Quem pode receber o Seguro DPVAT?",
    answer:
      "Qualquer vítima de acidente de trânsito, mesmo que não tenha CNH ou que tenha sido responsável pelo acidente.",
  },
  {
    question: "Quais documentos são necessários?",
    answer:
      "Documentos pessoais, boletim de ocorrência, laudo médico, entre outros. Nossa equipe te orienta em todos os passos.",
  },
  {
    question: "Preciso pagar algo pelo atendimento?",
    answer: "Não. A primeira análise é totalmente gratuita e sem compromisso.",
  },
  {
    question: "Quanto tempo demora para receber o valor?",
    answer:
      "O tempo pode variar, mas normalmente o processo leva entre 30 a 90 dias, dependendo da documentação.",
  },
  {
    question: "Acidentes antigos ainda têm direito?",
    answer:
      "Sim, em muitos casos há direito até 3 anos após a data do acidente. Entre em contato para verificar seu caso.",
  },
];

export default function SeguroDpvat() {
  const whatsappUrl =
    "https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20seguro%20DPVAT";

  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden bg-white text-gray-800">
        <div className="relative h-[500px]">
          <img
            src="/dpvat.jpg"
            alt="Seguro contra terceiros"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center text-center px-4 z-10">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Assessoria para Seguro DPVAT em Curitiba
            </h1>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
            >
              Fale com um Especialista
            </a>
          </div>
        </div>

        <section className="py-16 px-6 lg:px-32">
          <div>
            <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
              Assessoria Especializada em Seguro DPVAT em Curitiba
            </h1>

            <p className="mb-10 text-lg max-w-3xl mx-auto text-center">
              Somos a Nova SPVAT, especialistas em auxiliar vítimas de acidentes
              de trânsito a receberem suas indenizações do Seguro DPVAT de forma
              rápida, segura e sem burocracia. Com mais de 10 mil clientes
              atendidos, cuidamos de todo o processo para garantir seus direitos.
            </p>

            <div className="text-center mb-10">
              <h2 className="text-xl font-semibold">
                As coberturas do Seguro DPVAT incluem:
              </h2>
            </div>

            <div className="flex flex-row justify-center gap-48 mb-10 mr-20">
              <div className="flex flex-col items-center gap-2 text-center max-w-[150px]">
                <div className="bg-gray-500 rounded-full p-3 text-white">
                  <MdAttachMoney size={24} />
                </div>
                <p className="text-lg font-medium">
                  Reembolso de Despesas Médicas
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 text-center max-w-[150px]">
                <div className="bg-gray-500 rounded-full p-3 text-white">
                  <FaUserSlash size={24} />
                </div>
                <p className="text-lg font-medium">
                  Invalidez Total ou Parcial
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 text-center max-w-[150px]">
                <div className="bg-gray-500 rounded-full p-3 text-white">
                  <FaRibbon size={24} />
                </div>
                <p className="text-lg font-medium">Morte</p>
              </div>
            </div>


            <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

            <div className="pb-10 px-6 lg:px-32">
              <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-bold mb-4 text-center">Tipos de indenização</h2>
                <br />

                <div className="flex items-center gap-2">
                  <div className="bg-gray-500 w-12 rounded-full p-3 text-white">
                    <MdAttachMoney size={24} />
                  </div>
                  <p className="text-lg text-gray-700"> São os gastos efetuados pela vítima em razão do acidente. Incluem-se aqui despesas com atendimento médico e hospitalar na rede privada, sessões de fisioterapia, medicamentos, aparelhos ortopédicos, órteses, próteses e demais tratamentos indicados por médico ou fisioterapeuta (no caso de pedidos de reembolso de fisioterapia). Esses gastos devem ser devidamente comprovados por recibos, cupons ou notas fiscais, contendo a identificação do beneficiário (ou de seu representante legal, quando se tratar de menor), bem como dos profissionais ou estabelecimentos de saúde responsáveis.</p>
                </div>

                <br />
                <br />

                <div className="flex items-center gap-2">
                  <div className="bg-gray-500 w-12 rounded-full p-3 text-white">
                    <FaUserSlash size={24} />
                  </div>
                  <p className="text-lg text-gray-700"> É a indenização paga à pessoa que, em decorrência de um acidente de trânsito, sofreu perda ou redução da função de um membro ou órgão, configurando invalidez permanente e definitiva — ou seja, quando não há mais possibilidade de recuperação. Essa invalidez pode ser total ou parcial, sendo a parcial classificada como completa ou incompleta, de acordo com o grau de perda anatômica ou funcional constatado pela perícia médica.</p>
                </div>

                <br />
                <br />

                <div className="flex items-center gap-2">
                  <div className="bg-gray-500 w-12 rounded-full p-3 text-white">
                    <FaRibbon size={24} />
                  </div>
                  <p className="text-lg text-gray-700"> A indenização é devida nos casos de falecimento da vítima decorrente de acidente de trânsito.</p>
                </div>
                <br />
              </div>

            </div>

            <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
              Valores da indenização
            </h1>
            <div className="max-w-6xl mx-auto bg-[#f9f7f1] border-2 border-gray-700 rounded-lg p-8 shadow-md font-serif text-gray-900 leading-relaxed">
              <ul className="list-disc mb-10 text-lg max-w-4xl pl-10">
                <li><span className="font-bold">Morte</span> Até R$ 13.500,00</li>
                <li><span className="font-bold">IP</span> Até R$ 13.500,00</li>
                <li><span className="font-bold">DAMS</span> Até R$ 2.700,00</li>
              </ul>
              <br />
              <p className="text-lg text-gray-700 text-left">
                O pagamento das indenizações DPVAT CAIXA ocorre em conta Poupança Social Digital CAIXA. Caso você não possua uma conta Poupança Social Digital CAIXA, esta é aberta automaticamente e de forma gratuita após a aprovação da indenização DPVAT. Basta, quando for solicitar a indenização, autorizar a abertura da conta e o crédito do valor. Caso já possua Conta Poupança Social Digital CAIXA, o crédito ocorrerá nessa conta. Em hipótese alguma o pagamento é realizado em conta de terceiros.
              </p>
              <br />
              <p className="text-lg text-gray-700 text-left">
                Para consultar e movimentar os valores do crédito da indenização DPVAT, a vítima ou seus beneficiários devem realizar o cadastramento no aplicativo CAIXA Tem, disponível nas lojas de aplicativos Play Store e App Store.
              </p>
              <br />
              <p className="text-lg text-gray-700 text-left">
                Para abertura da conta para menores, é necessário que o representante legal apresente, no ato da solicitação da indenização, documento de identificação com foto ou certidão de nascimento e CPF do menor. Após o crédito ser efetivado em conta, o representante legal deve realizar o cadastro no aplicativo CAIXA Tem e comparecer à agência de sua melhor conveniência para habilitar a conta para movimentação.
              </p>
            </div>

            <h3 className="text-2xl pt-10 font-bold mb-6 text-left text-blue-700">
              Despesas de Assistência Médica e Suplementares (DAMS)
            </h3>

            <p className="text-lg text-gray-700 text-left">
              Caso a vítima de acidente de trânsito efetue despesas com assistência médica e suplementares para seu tratamento, terá direito ao reembolso desses valores, desde que devidamente comprovados.
            </p>
            <br />
            <p className="text-lg text-gray-700 text-left">
              A indenização corresponde ao valor de até R$ 2.700,00, conforme a Lei n° 6.194/1974, e serão pagas em Conta Poupança Social Digital CAIXA aberta em nome da própria vítima.
            </p>
            <br />
            <p className="text-lg text-gray-700 text-left">
              Se o total das despesas válidas for inferior a R$ 2.700,00, a indenização será também inferior a R$ 2.700,00. E, se o total das despesas válidas for superior a R$ 2.700,00, a indenização será limitada ao teto estabelecido em lei de R$ 2.700,00.
            </p>

            <h3 className="text-2xl pt-10 font-bold mb-6 text-left text-blue-700">
              Invalidez Permanente (IP)
            </h3>

            <p className="text-lg text-gray-700 text-left">
              A indenização por invalidez permanente pode variar de R$ 135,00 até R$ 13.500,00 para tratamento concluído e invalidez de caráter definitivo por perda anatômica ou redução funcional, total ou parcial das funções de membros e/ou órgãos, decorrente do acidente de trânsito.
            </p>
            <br />
            <p className="text-lg text-gray-700 text-left">
              O percentual da perda do segmento anatômico é definido entre 10% e 100%, de acordo com a Lei n° 6.194/1974.
            </p>
            <br />

            <ul className="list-disc mb-10 text-lg max-w-4xl pl-10">
              <li>75% (repercussão intensa);</li>
              <li>50% (repercussão média);</li>
              <li>25% (repercussão leve);</li>
              <li>10%, (sequelas residuais).</li>
            </ul>

            <p className="text-lg text-gray-700 text-left">
              O percentual da limitação funcional é estabelecido em:
            </p>
            <br />
            <ul className="list-disc mb-10 text-lg max-w-4xl pl-10">
              <li>10% (residual);</li>
              <li>25% (leve);</li>
              <li>50% (média);</li>
              <li>75% (intensa);</li>
              <li>100% (completa)</li>
            </ul>
            <p className="text-lg text-gray-700 text-left">
              Após perícia médica, o valor da indenização é apurado com base na multiplicação entre o percentual da perda do segmento anatômico, o percentual de limitação funcional e o valor máximo da indenização (R$ 13.500,00).
            </p>
            <br />
            <p className="text-lg text-gray-700 text-left">
              A CAIXA contratou empresas especializadas na realização de perícia médica, com abrangência nas 5 regiões do país. As empresas, caso julguem necessário, podem entrar em contato com a vítima para o agendamento de perícia por telechamada, presencial ou em domicílio, de acordo com cada caso. A definição da melhor modalidade da perícia médica indicada para cada vítima é prerrogativa dessas empresas, por meio de critérios técnicos, respeitados os melhores protocolos médicos aplicados à matéria.
            </p>

            <h3 className="text-2xl pt-10 font-bold mb-6 text-left text-blue-700">
              Morte
            </h3>

            <p className="text-lg text-gray-700 text-left">
              As indenizações correspondem ao valor de até R$ 13.500,00, conforme a Lei n° 6.194/1974, e são pagas em Conta Poupança Social Digital CAIXA aberta em nome do(s) beneficiário(s) legal(is). As indenizações por morte e por IP, decorrentes do mesmo acidente e vítima, não são cumulativas. Somente a diferença de valores é devida.
            </p>
            <br />
            <p className="text-lg text-gray-700 text-left">
              Nos casos de falecimento da vítima de acidente de trânsito, os beneficiários são o(a) cônjuge ou companheiro (a) e/ou herdeiros legais da vítima, conforme disposto na Lei nº 10.406/2002 (Código Civil).
            </p>
            <br />
            <p className="text-lg text-gray-700 text-left">
              O valor máximo da indenização por morte é compartilhado entre todos os beneficiários legais.
            </p>
            <br />
            <div className="pb-10 px-6 ">
              <div className="w-full mx-auto bg-white border border-gray-300 rounded-lg p-6 shadow-md">
                <p className="text-lg text-gray-700 text-left">
                  <span className="font-bold">Por exemplo:</span> Se a vítima era casada ou tinha união estável e deixou filhos, 50% da indenização vai para o cônjuge ou companheiro e 50% é dividido entre os filhos. E, se a vítima era solteira e sem filhos, a indenização é destinada aos pais e/ou avós vivos e, na ausência destes, aos irmãos da vítima.                </p>
              </div>
            </div>

            <p className="text-lg text-gray-700 text-left">
              Para ter direito ao valor integral da indenização, é necessário apresentar as certidões de óbito dos demais herdeiros legais falecidos da vítima para comprovação do direito.
            </p>

            <div className="grid md:grid-cols-2 gap-12 mt-12">
              <div>
                <h2 className="text-2xl font-semibold text-blue-600 mb-4">
                  Fale Conosco
                </h2>
                <p className="mb-2">
                  📍  Tv. Jorge Cuquel, 6 - Seminário, Curitiba - PR
                </p>
                <p className="mb-2">📞 (41) 99786-2323</p>
                <p className="mt-4 text-sm text-gray-600">
                  Agende uma visita sem custo inicial!
                </p>
              </div>

              <div>
                <h2 className="text-2xl font-semibold text-blue-600 mb-4">
                  Sobre Nós
                </h2>
                <p className="mb-2">
                  Atendemos motoristas, pedestres e passageiros, mesmo sem CNH ou
                  em caso de culpa no acidente. Nosso processo é ágil, com
                  soluções em cerca de 60 dias.
                </p>
                <p className="text-sm text-gray-600">
                  Mais de 10.000 clientes satisfeitos!
                </p>
              </div>
            </div>

          </div>
        </section>
        <section className="relative mt-10">
          <img
            src="/car.jpg"
            alt="Ajuda com seguro contra terceiros"
            className="w-full h-[270px] object-cover"
          />
          <div className="absolute inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center text-white text-center px-4">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Seguro DPVAT
            </h2>
            <p className="text-lg mb-6 max-w-2xl">
              Entre em contato agora mesmo e agende uma visita. Estamos aqui para ajudar!
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
            >
              Agendar Visita
            </a>
          </div>
        </section>
        <section className="relative py-16 px-6 lg:px-32">
          <h2 className="text-2xl font-semibold text-blue-600 mb-8 text-center">
            Perguntas Frequentes
          </h2>

          <div className="space-y-4 max-w-4xl mx-auto">
            {faqList.map((item, idx) => (
              <Disclosure key={idx}>
                {({ open }) => (
                  <div className="border rounded-lg p-4">
                    <Disclosure.Button className="flex justify-between w-full text-left font-medium text-gray-900">
                      {item.question}
                      <ChevronUpIcon
                        className={`w-5 h-5 transition-transform ${open ? "rotate-180" : ""
                          }`}
                      />
                    </Disclosure.Button>
                    <Disclosure.Panel className="mt-2 text-gray-700">
                      {item.answer}
                    </Disclosure.Panel>
                  </div>
                )}
              </Disclosure>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}