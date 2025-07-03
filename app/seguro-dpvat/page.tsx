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
            src="/transparencia.jpg"
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