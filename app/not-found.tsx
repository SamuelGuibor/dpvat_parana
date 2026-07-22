import Link from "next/link";
import Image from "next/image";

// 404 com a identidade da marca — antes era a tela padrão do Next em inglês.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <Image src="/paranaseguros.png" width={180} height={60} alt="Paraná Seguros" />
      <p className="mt-8 text-6xl font-black text-blue-900">404</p>
      <h1 className="mt-2 text-xl font-semibold text-gray-800">Página não encontrada</h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        O endereço que você acessou não existe ou foi movido. Confira o link ou
        volte para a página inicial.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Voltar para o início
        </Link>
        <a
          href="https://wa.me/5541997862323"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-green-600 px-6 py-3 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50"
        >
          Falar no WhatsApp
        </a>
      </div>
    </main>
  );
}
