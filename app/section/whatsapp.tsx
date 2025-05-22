"use client";

import { FaWhatsapp } from "react-icons/fa";

export default function WhatsAppButton() {
  const phoneNumber = "5541997862323"; 
  const message = "Olá! Quero saber mais sobre as indenizações que tenho direito a receber!"; 
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Abrir conversa no WhatsApp"
      className="fixed bottom-4 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-300 sm:h-14 sm:w-14"
    >
      <FaWhatsapp className="h-6 w-6 sm:h-7 sm:w-7 " />
    </a>
  );
}