"use client";

import { Disclosure } from "@headlessui/react";
import { ChevronUpIcon } from "lucide-react";
import { FaBalanceScale, FaMoneyBillWave, FaUserInjured } from "react-icons/fa";
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

export default function Terceiros() {
    const whatsappUrl =
        "https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20seguro%20contra%20terceiros!";

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
                        Assessoria para Acionar Seguro Contra Terceiros (RCF)
                    </h1>
                    <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                    >
                        Fale com um Especialista
                    </a>
                </div>
            </div>

            <section className="bg-white pt-12 pb-4 px-6 text-center">
                <div className="flex flex-col md:flex-row justify-center gap-10">
                    <div>
                        <FaUserInjured className="text-blue-600 text-5xl mx-auto mb-2" />
                        <p className="text-lg font-semibold">Dano Corporal</p>
                    </div>
                    <div>
                        <FaBalanceScale className="text-blue-600 text-5xl mx-auto mb-2" />
                        <p className="text-lg font-semibold">Dano Moral</p>
                    </div>
                    <div>
                        <FaMoneyBillWave className="text-blue-600 text-5xl mx-auto mb-2" />
                        <p className="text-lg font-semibold">Lucros Cessantes</p>
                    </div>
                </div>
            </section>

            <section className="py-16 px-6 text-center">
                <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-lg">
                    <p className="text-lg mb-4">
                        Se você sofreu algum tipo de acidente e o causador possui seguro de responsabilidade civil, nós podemos te ajudar a receber a indenização.
                    </p>
                    <div className="bg-blue-600 text-white p-6 rounded-lg">
                        <h2 className="text-2xl font-bold mb-2">
                            Assessoria para acionar seguro contra terceiros
                        </h2>
                        <p>Com mais de 20 mil clientes atendidos</p>
                        <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-block bg-white text-blue-600 font-semibold px-6 py-3 rounded-lg hover:bg-gray-300 transition"
                        >
                            Entre em contato agora
                        </a>
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
                            Atendimento Domiciliar
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

            <section className="bg-white py-20 px-6 lg:px-32">
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
            <Footer />
        </>
    );
}
