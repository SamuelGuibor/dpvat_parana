/* eslint-disable @next/next/no-img-element */
"use client";

import { Disclosure } from "@headlessui/react";
import { ChevronUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import Footer from "../section/footer";
import { HeroHeader } from "../section/hero9-header";

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

export default function SeguroVida() {
    const whatsappUrl =
        "https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20Seguro%20de%20Vida!";

    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) return null;

    return (
        <>
            <HeroHeader />
            <div className="relative h-[500px]">
                <img
                    src="/transparencia.jpg"
                    alt="Seguro contra terceiros"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center text-center px-4 z-10">
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Assessoria para Seguro de Vida
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

            <main className="overflow-hidden bg-white text-gray-800">
                <section className="relative pt-12 px-6 lg:px-32">
                    <div className="mb-12 text-left max-w-full">
                        <h1 className="text-4xl font-bold mb-4 text-blue-700">
                            Assessoria em Curitiba
                        </h1>
                        <p className="text-lg max-w-2xl">
                            Somos especialistas em auxiliar vítimas de acidentes de trânsito a
                            receberem suas indenizações do Seguro DPVAT de forma rápida, segura
                            e sem burocracia.
                        </p>
                    </div>

                    <div className="mb-14 mt-20 max-w-5xl mx-auto px-6 md:px-0">
                        <h2 className="text-3xl font-semibold text-blue-600 mb-12 text-left">
                            O que oferecemos
                        </h2>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 text-xl font-medium text-gray-900 text-left pb-12">
                            <li className="before:content-['•'] before:mr-2 before:inline-block">
                                Indenização por morte
                            </li>
                            <li className="before:content-['•'] before:mr-2 before:inline-block">
                                Indenização por invalidez permanente
                            </li>
                            <li className="before:content-['•'] before:mr-2 before:inline-block">
                                Reembolso de despesas médicas
                            </li>
                            <li className="before:content-['•'] before:mr-2 before:inline-block">
                                Atendimento presencial ou domiciliar
                            </li>
                            <li className="before:content-['•'] before:mr-2 before:inline-block">
                                Mais de 20.000 clientes atendidos
                            </li>
                            <li className="before:content-['•'] before:mr-2 before:inline-block">
                                Acompanhamento completo até o recebimento
                            </li>
                        </ul>
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
                            Seguro de Vida
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
