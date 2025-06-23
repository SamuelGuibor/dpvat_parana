"use client";

import { HeroHeader } from "../section/hero9-header";
import { MdAttachMoney } from "react-icons/md"; // Ícone para Reembolso
import { FaUserSlash } from "react-icons/fa"; // Ícone para Invalidez
import { FaRibbon } from "react-icons/fa"; // Ícone para Morte

export default function SeguroDpvat() {
  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden bg-white text-gray-800">
        <section className="relative min-h-[300px]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "url('/imagemm.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />
          </div>
        </section>

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

            <div className="flex justify-center gap-12 mb-10">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-gray-500 rounded-full p-3 text-white">
                  <MdAttachMoney size={24} />
                </div>
                <p className="text-lg font-medium">Reembolso de Despesas Médicas</p>
              </div>

              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-gray-500 rounded-full p-3 text-white">
                  <FaUserSlash size={24} />
                </div>
                <p className="text-lg font-medium">
                  Invalidez Total ou Parcial
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 text-center">
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
                  📍 Av. República Argentina, 4391 (fundos) – Novo Mundo –
                  Curitiba/PR
                </p>
                <p className="mb-2">📞 (41) 3779-0026 / (41) 99540-0033</p>
                <p className="mb-2">✉️ fernandonovadpvat@gmail.com</p>
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

            <div className="mt-16">
              <h2 className="text-2xl font-semibold text-blue-600 mb-4 text-center">
                Perguntas Frequentes
              </h2>
              <div className="space-y-6 max-w-4xl mx-auto">
                <div>
                  <p className="font-semibold">
                    Quem pode receber o Seguro DPVAT?
                  </p>
                  <p>
                    Qualquer vítima de acidente de trânsito, independentemente de
                    possuir CNH ou ser responsável pelo acidente.
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Quais documentos são necessários?</p>
                  <p>
                    Documentos pessoais, boletim de ocorrência e laudo médico.
                    Nossa equipe orienta você em cada etapa.
                  </p>
                </div>
                <div>
                  <p className="font-semibold">
                    Além do DPVAT, quais outros serviços oferecem?
                  </p>
                  <p>
                    Oferecemos assessoria para seguros de vida, terceiros,
                    motoristas de aplicativo, danos morais, estéticos e lucros
                    cessantes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}