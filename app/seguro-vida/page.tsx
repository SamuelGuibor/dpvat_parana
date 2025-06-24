"use client"

import { HeroHeader } from "../section/hero9-header"

export default function SeguroVida() {
    return (
        <>
            <HeroHeader />
            <div className="relative h-[450px]">
                <img
                    src="/imagemm.jpg"
                    alt="Imagem ilustrativa sobre o Seguro DPVAT"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-40 z-10" />
            </div>

            <main className="overflow-hidden bg-white text-gray-800">
                <section className="relative py-16 px-6 lg:px-32">
                    <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                        Assessoria para Seguro DPVAT em Curitiba
                    </h1>

                    <p className="mb-6 text-lg max-w-3xl mx-auto text-center">
                        Somos especialistas em auxiliar vítimas de acidentes de trânsito a
                        receberem suas indenizações do Seguro DPVAT de forma rápida, segura
                        e sem burocracia.
                    </p>

                    <div className="grid md:grid-cols-2 gap-12 mt-12">
                        <div>
                            <h2 className="text-2xl font-semibold text-blue-600 mb-4">
                                O que oferecemos
                            </h2>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>Indenização por morte</li>
                                <li>Indenização por invalidez permanente</li>
                                <li>Reembolso de despesas médicas</li>
                                <li>Atendimento presencial ou domiciliar em Curitiba</li>
                                <li>Mais de 20.000 clientes atendidos</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-blue-600 mb-4">
                                Fale Conosco
                            </h2>
                            <p className="mb-2">
                                📍 Av. República Argentina, 4391 (fundos) – Novo Mundo –
                                Curitiba/PR
                            </p>
                            <p className="mb-2">📞 (41) 3779-0026 / (41) 99540-0033</p>
                            <p className="mb-2">✉️ fernandonovadpvat@gmail.com</p>
                        </div>
                    </div>
                </section>
                <section className="relative mt-16">
                    <img
                        src="/car.jpg"
                        alt="Ajuda com seguro"
                        className="w-full h-[400px] object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center px-4 text-center text-white">
                        <h2 className="text-3xl font-bold mb-4">
                            Precisando de Ajuda com o Seguro DPVAT?
                        </h2>
                        <p className="mb-6 text-lg max-w-2xl">
                            Nossa equipe está pronta para te orientar em cada passo. Não perca
                            seu direito à indenização!
                        </p>
                        <a
                            href="/contato"
                            className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                        >
                            Fale com um Especialista
                        </a>
                    </div>
                </section>

                {/* FAQ */}
                <section className="relative py-16 px-6 lg:px-32">
                    <h2 className="text-2xl font-semibold text-blue-600 mb-4 text-center">
                        Perguntas Frequentes
                    </h2>
                    <div className="space-y-6 max-w-4xl mx-auto">
                        <div>
                            <p className="font-semibold">Quem pode receber o Seguro DPVAT?</p>
                            <p>
                                Qualquer vítima de acidente de trânsito, mesmo que não tenha CNH
                                ou que tenha sido responsável pelo acidente.
                            </p>
                        </div>
                        <div>
                            <p className="font-semibold">Quais documentos são necessários?</p>
                            <p>
                                Documentos pessoais, boletim de ocorrência, laudo médico, entre
                                outros. A assessoria te orienta em todos os passos.
                            </p>
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}
