import { FaWhatsapp } from "react-icons/fa";
import { WHATSAPP_ANALISE_URL } from "./site-info";

/**
 * Botão do WhatsApp fixo no canto da tela, em todas as páginas do site.
 * z-30: fica por baixo do fundo escuro (z-40) e da gaveta (z-50) do menu do
 * Header, senão cobriria o menu aberto no celular.
 */
export function WhatsAppFloat() {
  return (
    <a
      href={WHATSAPP_ANALISE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Análise gratuita pelo WhatsApp"
      className="group fixed bottom-5 right-5 z-30 flex items-center gap-2"
    >
      <span className="hidden md:block rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-lg opacity-0 translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0">
        Análise gratuita
      </span>
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition-transform group-hover:scale-105">
        <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-40 animate-ping motion-reduce:hidden" />
        <FaWhatsapp className="relative h-8 w-8" />
      </span>
    </a>
  );
}
