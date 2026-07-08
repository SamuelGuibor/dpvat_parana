import type { Metadata } from "next";
import { Header } from "@/app/_components/landing_page/Header";
import { Footer } from "@/app/_components/landing_page/Footer";

export const metadata: Metadata = {
  title: "Exclusão de Dados - Paraná Seguros",
  description: "Como solicitar a exclusão dos seus dados pessoais na Paraná Seguros.",
  alternates: { canonical: "https://www.segurosparana.com.br/exclusao-de-dados" },
  robots: { index: true, follow: true },
};

export default function DataDeletionPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Exclusão de Dados</h1>
        <p className="mb-8 text-sm text-gray-400">Última atualização: julho de 2026</p>

        <div className="space-y-6 text-gray-700 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_p]:leading-relaxed [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6">
          <p>
            Você pode solicitar a exclusão dos seus dados pessoais armazenados pela Paraná
            Seguros a qualquer momento, incluindo dados de cadastro, do seu processo e do
            histórico de conversas (WhatsApp, e-mail ou chat).
          </p>

          <h2>Como solicitar</h2>
          <ol>
            <li>
              Envie um pedido de exclusão pelo WhatsApp da nossa equipe ou pelo e-mail de
              contato disponível em nosso site, informando seu nome completo e CPF para
              localizarmos seu cadastro.
            </li>
            <li>
              Nossa equipe confirma o recebimento do pedido em até 2 dias úteis.
            </li>
            <li>
              Os dados são excluídos em até 15 dias úteis, exceto informações que a lei exige
              que mantenhamos por obrigação legal ou regulatória (por exemplo, registros
              vinculados a processos em andamento perante órgãos públicos ou seguradoras).
            </li>
          </ol>

          <h2>O que acontece com um processo em andamento</h2>
          <p>
            Se você tiver um processo de indenização ou benefício em andamento, alguns dados
            precisam ser mantidos até a conclusão do processo ou pelo prazo legal aplicável,
            mesmo após a solicitação de exclusão. Nesse caso, avisamos quais dados precisam
            permanecer e por quê.
          </p>

          <h2>Dúvidas</h2>
          <p>
            Qualquer dúvida sobre este processo pode ser tirada pelos mesmos canais de
            atendimento usados para solicitar a exclusão.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
