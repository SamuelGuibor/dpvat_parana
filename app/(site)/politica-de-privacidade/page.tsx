import type { Metadata } from "next";
import { Header } from "@/app/_components/landing_page/Header";
import { Footer } from "@/app/_components/landing_page/Footer";

export const metadata: Metadata = {
  title: "Política de Privacidade - Paraná Seguros",
  description: "Política de privacidade e tratamento de dados da Paraná Seguros.",
  alternates: { canonical: "https://www.segurosparana.com.br/politica-de-privacidade" },
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Política de Privacidade</h1>
        <p className="mb-8 text-sm text-gray-400">Última atualização: julho de 2026</p>

        <div className="space-y-6 text-gray-700 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          <p>
            A Paraná Seguros (&quot;nós&quot;) respeita a privacidade das pessoas que atendemos e é
            transparente sobre como coleta, usa e protege os dados pessoais no contexto dos
            serviços de acompanhamento de indenizações DPVAT/SPVAT e benefícios do INSS.
          </p>

          <h2>Quais dados coletamos</h2>
          <ul>
            <li>Dados de identificação: nome, CPF, RG, data de nascimento, estado civil, filiação.</li>
            <li>Dados de contato: telefone, WhatsApp, e-mail, endereço.</li>
            <li>Dados do caso: informações sobre o acidente, hospital de atendimento, lesões, andamento do processo.</li>
            <li>Documentos enviados por você para instruir o seu processo.</li>
            <li>Mensagens trocadas com nossa equipe, inclusive pelo WhatsApp.</li>
          </ul>

          <h2>Como usamos os dados</h2>
          <ul>
            <li>Para dar andamento ao seu processo de indenização/benefício.</li>
            <li>Para entrar em contato sobre o status do seu atendimento (telefone, e-mail, WhatsApp).</li>
            <li>Para gerar os documentos necessários ao seu processo.</li>
            <li>Para cumprir obrigações legais e regulatórias aplicáveis ao serviço prestado.</li>
          </ul>

          <h2>Com quem compartilhamos</h2>
          <p>
            Não vendemos seus dados. Compartilhamos apenas com órgãos e entidades estritamente
            necessários ao andamento do seu processo (ex.: seguradoras, INSS, cartórios), e com
            prestadores de serviço que operam a nossa infraestrutura (hospedagem, armazenamento
            de documentos, envio de mensagens), sempre sob obrigação de confidencialidade.
          </p>

          <h2>WhatsApp</h2>
          <p>
            Se você conversa conosco pelo WhatsApp, as mensagens trocadas (texto e anexos) são
            armazenadas para dar continuidade ao seu atendimento e podem ser respondidas por um
            atendente humano ou por um assistente automatizado. Você pode pedir para falar com um
            atendente humano a qualquer momento.
          </p>

          <h2>Seus direitos</h2>
          <p>
            Você pode solicitar a qualquer momento a confirmação, correção ou exclusão dos seus
            dados pessoais, conforme a Lei Geral de Proteção de Dados (LGPD). Veja como em nossa{" "}
            <a href="/exclusao-de-dados" className="text-blue-600 underline">
              página de exclusão de dados
            </a>
            .
          </p>

          <h2>Contato</h2>
          <p>
            Dúvidas sobre esta política ou sobre o tratamento dos seus dados podem ser enviadas
            pelos canais de atendimento disponíveis em nosso site.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
