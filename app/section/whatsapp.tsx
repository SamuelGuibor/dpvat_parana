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
      className="fixed bottom-4 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-300 sm:h-14 sm:w-14"
    >
      <FaWhatsapp className="h-8 w-8 sm:h-9 sm:w-9 "/>
    </a>
  );
}