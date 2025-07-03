/* eslint-disable @next/next/no-img-element */
"use client";

import { Disclosure } from "@headlessui/react";
import { ChevronUpIcon } from "lucide-react";
import Footer from "../section/footer";
import { HeroHeader } from "../section/hero9-header";

export default function SegurosAplicativos() {
    const whatsappUrl =
        "https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20seguro%20de%20Aplicativos";

    return (
        <>
            <HeroHeader />

            <main className="text-gray-800">
                <div className="relative h-[500px]">
                    <img
                        src="/transparencia.jpg"
                        alt="Seguro contra terceiros"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center text-center px-4 z-10">
                        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Assessoria para Seguro de Aplicativos
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


                <section className="max-w-6xl mx-auto px-8 py-16 flex flex-col md:flex-row gap-10">
                    <div className="flex-1 text-left flex flex-col">
                        <p className="text-lg mb-8 max-w-xl leading-relaxed">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
                            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                            Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.
                        </p>
                        <div className="w-full flex justify-center md:justify-start">
                            <a
                                href="#contato"
                                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-semibold transition"
                            >
                                Quero saber meus direitos
                            </a>
                        </div>
                    </div>
                    <div className="flex-1 max-w-sm bg-[#f9f7f1] border-2 border-gray-700 rounded-lg p-8 shadow-md self-start font-serif text-gray-900 leading-relaxed">
                        <h3 className="font-bold text-2xl mb-4 border-b border-gray-700 pb-2">
                            Com mais de 20 mil clientes atendidos
                        </h3>
                        <p className="text-base">
                            Confiança, experiência e dedicação no que fazemos. Nossa equipe atua com total transparência e compromisso, garantindo a você o melhor atendimento e a segurança no processo de indenização.
                            <br /><br />
                            Estamos sempre prontos para esclarecer dúvidas e oferecer suporte personalizado, porque cada caso merece atenção única e detalhada.
                        </p>
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
                            Seguro de Aplicativo
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

                <section className="py-16 px-6 bg-white">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-2xl font-semibold text-blue-600 mb-8 text-center">Perguntas Frequentes</h2>
                        <div className="space-y-4">
                            {faqList.map((item, idx) => (
                                <Disclosure key={idx}>
                                    {({ open }) => (
                                        <div className="border border-black-200 rounded-lg">
                                            <Disclosure.Button className="flex justify-between w-full p-4 font-medium text-left text-black-800">
                                                {item.question}
                                                <ChevronUpIcon className={`w-5 h-5 transform transition-transform ${open ? "rotate-180" : ""}`} />
                                            </Disclosure.Button>
                                            <Disclosure.Panel className="p-4 text-gray-700">
                                                {item.answer}
                                            </Disclosure.Panel>
                                        </div>
                                    )}
                                </Disclosure>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}

const faqList = [
    {
        question: "Quem pode receber o Seguro DPVAT?",
        answer: "Qualquer vítima de acidente de trânsito, mesmo sem CNH ou sendo culpado.",
    },
    {
        question: "Quais documentos são necessários?",
        answer: "Documentos pessoais, boletim de ocorrência, laudo médico e outros. A assessoria te orienta.",
    },
    {
        question: "Precisa pagar pela consultoria?",
        answer: "A primeira análise é gratuita. Só cobramos após o sucesso do processo.",
    },
    {
        question: "Qual o prazo para dar entrada?",
        answer: "Até 3 anos após o acidente.",
    },
    {
        question: "Posso receber mesmo sendo o causador?",
        answer: "Sim! O seguro cobre todos os envolvidos no acidente, inclusive o condutor culpado.",
    },
];
