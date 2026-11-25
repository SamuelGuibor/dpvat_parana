'use client'
import { ArrowRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { FaWhatsapp } from 'react-icons/fa';
import { WHATSAPP_ANALISE_URL } from './site-info';

export function Hero() {
  const { data: session } = useSession();

  const consultProcessUrl = session?.user ? "/area-do-cliente" : "/login";

  return (
    // No desktop o hero ocupa a tela inteira abaixo do Header (68px: logo de
    // 60px + py-1), senão a faixa escura da seção seguinte aparecia embaixo.
    <section
      id="inicio"
      // Mesmo fundo do rodapé (bg-gray-900), sem véu por cima para a cor bater.
      className="relative bg-gray-900 text-white lg:flex lg:items-center lg:min-h-[calc(100svh_-_68px)]"
    >
      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-10">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl leading-tight mb-6">
              <strong className="font-bold">Sofreu um acidente e ficou com limitações?</strong>{" "}
              Você pode ter direito a uma indenização do INSS!
            </h1>
            <p className="text-lg lg:text-xl mb-8 text-blue-100 max-w-xl">
              Especialistas em Auxílio-Acidente INSS e recuperação de danos causados por acidentes de trânsito. Sua justiça é nossa missão.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href={consultProcessUrl} className="bg-white text-blue-900 px-8 py-4 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                Consulte seu Processo
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href={WHATSAPP_ANALISE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-500 text-white px-8 py-4 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2 font-semibold"
              >
                <FaWhatsapp className="w-5 h-5" />
                Análise Gratuita
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Vídeo de apresentação no topo da página (antes ficava abaixo dos
              serviços). Vertical 576x1024 (9:16), servido de public/ sem o
              Mux. No desktop a altura acompanha a tela (teto de 604px = 340px
              de largura), para caber inteiro em notebook de tela baixa. */}
          <video
            className="w-full max-w-[300px] h-auto aspect-[9/16] mx-auto rounded-2xl shadow-2xl ring-1 ring-white/20 bg-gray-900 lg:w-auto lg:max-w-none lg:h-[min(604px,calc(100svh_-_68px_-_5rem))]"
            src="/videos/apresentacao-brasil-beneficios.mp4"
            poster="/videos/apresentacao-brasil-beneficios.jpg"
            width={576}
            height={1024}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      </div>
    </section>
  );
}
