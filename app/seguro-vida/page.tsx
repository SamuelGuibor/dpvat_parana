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
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) return null;

    return (
        <>
            <HeroHeader />
            <section className="relative h-screen">
                <div
                    className="fixed inset-0 bg-center bg-cover bg-no-repeat -z-10"
                    style={{ backgroundImage: "url('/car.jpg')" }}
                >
                    <div className="absolute inset-0 bg-black bg-opacity-50" />
                </div>

                <div className="relative z-10 flex flex-col items-start justify-center h-full px-6 lg:px-32 text-left text-white">
                    <h2 className="text-5xl font-extrabold mb-10 leading-tight max-w-3xl">
                        Precisando de ajuda com o seguro DPVAT?
                    </h2>
                    <a
                        href="https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20seguro%20DPVAT!"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                    >
                        Fale com um Especialista
                    </a>

                </div>
            </section>

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

                    <div className="text-center mt-20">
                        <div className="flex flex-col md:flex-row justify-center items-center gap-20 text-lg text-gray-800">
                            <p>📍 Av. República Argentina, 4391 – Curitiba/PR</p>
                            <p>📞 (41) 3779-0026 / (41) 99540-0033</p>
                            <p>✉️ fernandonovadpvat@gmail.com</p>
                        </div>
                    </div>
                </section>
                <section className="relative mt-10 h-[380px]">
                    <img
                        src="/imagemm.jpg"
                        alt="Imagem ilustrativa sobre o Seguro DPVAT"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-60" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4">
                        <h2 className=" text-white text-3xl md:text-4xl font-bold mb-4">Ficou com alguma dúvida?</h2>
                        <p className="text-white text-lg mb-6 max-w-2xl">
                            Entre em contato agora mesmo!
                        </p>
                        <a
                            href="https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20seguro%20DPVAT!"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white text-black hover:text-white px-6 py-3 rounded-lg font-semibold hover:bg-black transition-all duration-800"
                        >
                            Entrar em contato
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
