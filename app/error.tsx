"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

// Error boundary global das rotas: mensagem em pt-BR com a cara da marca e
// botão de recuperação — antes aparecia a tela genérica do Next em inglês.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP ERROR]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <Image src="/paranaseguros.png" width={180} height={60} alt="Paraná Seguros" />
      <h1 className="mt-8 text-xl font-semibold text-gray-800">Algo deu errado</h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        Ocorreu um erro inesperado. Tente novamente — se o problema continuar,
        fale com a gente pelo WhatsApp.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-gray-400">Código: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
        >
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
