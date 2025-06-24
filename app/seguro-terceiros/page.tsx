"use client"

import { FaBalanceScale, FaMoneyBillWave, FaUserInjured } from "react-icons/fa"
import { HeroHeader } from "../section/hero9-header"

export default function Terceiros() {
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
                        href="/contato"
                        className="bg-red-600 hover:bg-red-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                    >
                        Fale com um Especialista
                    </a>
                </div>
            </div>
            <section className="bg-white py-12 px-6 text-center">
                <div className="flex flex-col md:flex-row justify-center gap-10">
                    <div>
                        <FaUserInjured className="text-red-600 text-5xl mx-auto mb-2" />
                        <p className="text-lg font-semibold">Dano Corporal</p>
                    </div>
                    <div>
                        <FaBalanceScale className="text-red-600 text-5xl mx-auto mb-2" />
                        <p className="text-lg font-semibold">Dano Moral</p>
                    </div>
                    <div>
                        <FaMoneyBillWave className="text-red-600 text-5xl mx-auto mb-2" />
                        <p className="text-lg font-semibold">Lucros Cessantes</p>
                    </div>
                </div>
            </section>
            <section className="bg-gray-100 py-16 px-6 text-center">
                <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-lg">
                    <p className="text-lg mb-4">
                        Se você sofreu algum tipo de acidente e o causador possui seguro de responsabilidade civil, nós podemos te ajudar a receber a indenização.
                    </p>
                    <div className="bg-red-600 text-white p-6 rounded-lg">
                        <h2 className="text-2xl font-bold mb-2">
                            Assessoria para acionar seguro contra terceiros
                        </h2>
                        <p>Com mais de 20 mil clientes atendidos</p>
                        <a
                            href="/contato"
                            className="mt-4 inline-block bg-white text-red-600 font-semibold px-6 py-3 rounded-lg hover:bg-gray-300 transition"
                        >
                            Entre em contato agora
                        </a>
                    </div>
                </div>
            </section>

            <section className="relative mt-16">
                <img
                    src="/car.jpg"
                    alt="Ajuda com seguro contra terceiros"
                    className="w-full h-[400px] object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center text-white text-center px-4">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        Atendimento Domiciliar
                    </h2>
                    <p className="text-lg mb-6 max-w-2xl">
                        Entre em contato agora mesmo e agende uma visita. Estamos aqui para ajudar!
                    </p>
                    <a
                        href="/contato"
                        className="bg-red-600 hover:bg-red-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                    >
                        Agendar Visita
                    </a>
                </div>
            </section>
        </>
    )
}
