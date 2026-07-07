"use client";

import { useRouter } from "next/navigation";
import { FaChevronLeft } from "react-icons/fa";

interface BackButtonProps {
  label?: string;
  className?: string;
}

/**
 * Botão "Voltar" padrão da área do cliente.
 * Visual discreto (link), com bom alvo de toque no mobile.
 */
export default function BackButton({ label = "Voltar", className = "" }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`group inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 active:scale-[0.98] ${className}`}
    >
      <FaChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      {label}
    </button>
  );
}
