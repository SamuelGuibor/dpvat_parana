import { ArrowRight } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { WHATSAPP_ANALISE_URL } from "./site-info";

const destaques = [
  {
    title: "Você continua trabalhando",
    description:
      "Não é aposentadoria: o benefício é pago junto com o seu salário, sem precisar parar de trabalhar.",
  },
  {
    title: "Vale para qualquer acidente",
    description:
      "No trânsito, no trabalho, em casa ou no lazer: a lei fala em acidente de qualquer natureza.",
  },
  {
    title: "O que conta é a sequela",
    description:
      "O direito depende da limitação que ficou depois do fim do tratamento, não só da gravidade do acidente.",
  },
];

const situacoes = [
  {
    title: "Acidente de trânsito",
    description: "Batidas de carro ou moto e atropelamentos que deixaram alguma sequela permanente.",
  },
  {
    title: "Acidente de trabalho",
    description: "Acidentes no serviço, no caminho de ida ou volta, ou doenças ligadas ao trabalho.",
  },
  {
    title: "Fraturas com sequela",
    description: "Ossos que consolidaram de forma irregular, dor crônica ou perda de movimento.",
  },
  {
    title: "Lesões na coluna",
    description: "Hérnias, fraturas de vértebras e sequelas que limitam esforço e postura.",
  },
  {
    title: "Perda parcial de movimentos",
    description: "Rigidez ou limitação em braços, mãos, pernas, pés ou articulações.",
  },
  {
    title: "Perda de força",
    description: "Menos força ou resistência física, a ponto de não conseguir trabalhar como antes.",
  },
  {
    title: "Amputações",
    description: "Perda de dedos, de um membro ou de parte dele, mesmo com o uso de prótese.",
  },
  {
    title: "Outras sequelas permanentes",
    description: "Perda de audição ou de visão, cicatrizes que limitam movimentos e outras sequelas definitivas.",
  },
];

/** Logo abaixo do hero: o que é o Auxílio-Acidente e quem costuma ter direito. */
export function AuxilioAcidente() {
  return (
    <>
      <section id="auxilio-acidente" className="bg-slate-950 text-white py-16 lg:py-20 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-400 mb-2">
            Em poucas palavras
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">O que é o Auxílio-Acidente</h2>
          <p className="text-lg text-slate-300 max-w-2xl">
            É um benefício mensal pago pelo INSS a quem sofreu um acidente e ficou com uma sequela
            permanente que reduz a capacidade para o trabalho que fazia antes.
          </p>

          <div className="grid gap-5 md:grid-cols-3 mt-10">
            {destaques.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-300 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>

          <a
            href="/blog/inss"
            className="inline-flex items-center gap-2 mt-8 text-blue-400 underline underline-offset-4 hover:text-blue-300"
          >
            Entenda o Auxílio-Acidente em detalhes
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      <section id="quem-tem-direito" className="bg-slate-900 text-white py-16 lg:py-20 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-400 mb-2">
            Quem pode ter direito
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4 max-w-xl">
            Situações que costumam dar direito ao benefício
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl">
            A lista é só uma referência. Quem confirma o direito é a análise do seu caso, com os
            documentos e o histórico médico.
          </p>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mt-10">
            {situacoes.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-white/10 bg-blue-900/40 p-6">
            <p className="text-lg flex-1">
              Se identificou com alguma dessas situações? Fazemos a análise do seu caso sem custo.
            </p>
            <a
              href={WHATSAPP_ANALISE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-500 px-6 py-3 font-semibold text-white hover:bg-green-600 transition-colors"
            >
              <FaWhatsapp className="w-5 h-5" />
              Análise Gratuita
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
