import { Faq } from "./section/faq";
import { FeatureSteps } from "./section/feature-section";
import Footer from "./section/footer";
import Hero from "./section/hero-section";
import Stats from "./section/stats";
import WhatsAppButton from "./section/whatsapp";
// import TeamSection from "./section/TeamSection"

export const metadata = {
  title: "Paraná Seguros - Indenização Rápida e Segura",
  description:
    "Saiba tudo sobre o seguro DPVAT e como podemos ajudar a garantir sua indenização rápida e sem burocracia.",
  alternates: {
    canonical: "https://www.segurosparana.com.br/",
  },
  openGraph: {
    title: "Paraná Seguros - Indenização Rápida e Segura com DPVAT",
    description:
      "Especialistas em indenizações de Acidentes de Transito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná.",
    url: "https://www.segurosparana.com.br/",
    siteName: "Paraná Seguros",
    images: [
      {
        url: "https://www.segurosparana.com.br/paranaseguros.png",
        secure_url: "https://www.segurosparana.com.br/paranaseguros.png",
        width: 1200,
        height: 630,
        alt: "Paraná Seguros - Indenização DPVAT",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Paraná Seguros - Indenização Rápida DPVAT",
    description:
      "Garantimos sua indenização DPVAT com rapidez e transparência no Paraná. Entre em contato hoje!",
    creator: "@ParanaSeguros",
    images: ["https://www.segurosparana.com.br/paranaseguros.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  viewport: "width=device-width, initial-scale=1",
};
export default function Home() {
  const phoneNumber = "5541997862323";
  const message =
    "Olá! Quero saber mais sobre as indenizações que tenho direito a receber!";
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
    message
  )}`;
  const faqItems = [
    {
      id: "faq-1",
      question: "O que é o seguro DPVAT?",
      answer:
        "É um seguro social que indeniza vítimas de acidentes de trânsito, sem apuração de culpa.",
    },
    {
      id: "faq-2",
      question: "Quem pode ser beneficiado pelo DPVAT?",
      answer:
        "Todas as pessoas que sofreram acidentes envolvendo um veículo automotor de via terrestre têm direito a pleitear indenização.",
    },
    {
      id: "faq-3",
      question: "Somente motoristas podem dar entrada no DPVAT?",
      answer:
        "Não. O seguro DPVAT é para motoristas, passageiros e pedestres envolvidos no acidente de trânsito.",
    },
    {
      id: "faq-4",
      question: "Menor de idade tem direito ao DPVAT?",
      answer:
        "Sim, nesse caso a indenização será paga ao representante legal da criança (pai, mãe ou tutor).",
    },
    {
      id: "faq-5",
      question: "Quais são os valores da indenização do DPVAT?",
      answer:
        "A tabela do DPVAT prevê indenização de até R$ 13.500 para casos de morte e invalidez permanente. Outros valores vão depender de acordo com a lesão e fratura no corpo",
    },
    {
      id: "faq-6",
      question: "Em quais regiões do Paraná o DPVAT presta acessoria?",
      answer:
        "Nossa consultoria DPVAT abrange as regiões de Curitiba, Ponta Grossa e Maringá.",
    },
    {
      id: "faq-7",
      question: "Qual é o prazo para recebimento?",
      answer:
        "O processo total dura em torno de 60 dias. Quanto antes você fizer contato, mais rápido vai sair sua indenização.",
    },
  ];

  const features = [
    {
      step: "Step 1",
      title: "Proteção dos Direitos dos Clientes",
      content:
        "Nos dedicamos a proteger os direitos e interesses dos nossos clientes com acordos extrajudiciais, garantindo uma justa e rápida indenização.",
      image: "/protect.jpg", // Kept for compatibility
    },
    {
      step: "Step 2",
      title: "Compromisso com Transparência e Ética",
      content:
        "Nosso compromisso é com a transparência, a ética e a eficácia, desburocratizando procedimentos administrativos de seguradoras.",
      image: "/transparencia.jpg", // Kept for compatibility
    },
    {
      step: "Step 3",
      title: "Acompanhamento Completo",
      content:
        "Acompanhamos o cliente desde a obtenção de documentos até a realização de perícia para garantir paz de espírito e resultados positivos.",
      image: "/conecg.jpg", // Kept for compatibility
    },
  ];

  return (
    <div>
      <head>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "Paraná Seguros",
            "description":
              "Especialistas em indenizações DPVAT no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em Curitiba, Ponta Grossa e Maringá.",
            "url": "https://www.segurosparana.com.br/",
            "telephone": "+5541997862323",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Curitiba",
              "addressRegion": "PR",
              "addressCountry": "BR",
            },
          })}
        </script>
        <title>Paraná Seguros - Indenização Rápida e Segura</title>
        <meta name="description" content="Especialistas em indenizações de acidentes de trânsito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná." />
        <meta name="keywords" content="DPVAT Paraná,seguro DPVAT,indenização DPVAT,Paraná Seguros,Curitiba DPVAT,Ponta Grossa DPVAT,Maringá DPVAT" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://www.segurosparana.com.br/" />
        <meta property="og:title" content="Paraná Seguros - Indenização Rápida e Segura com DPVAT" />
        <meta property="og:description" content="Especialistas em indenizações de Acidentes de Transito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná." />
        <meta property="og:url" content="https://www.segurosparana.com.br/" />
        <meta property="og:site_name" content="Paraná Seguros" />
        <meta property="og:image" content="https://www.segurosparana.com.br/paranaseguros.png" />
        <meta property="og:image:secure_url" content="https://www.segurosparana.com.br/paranaseguros.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Paraná Seguros - Indenização de Acidentes de Transito" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Paraná Seguros - Indenização Rápida de Acidentes de Transito " />
        <meta name="twitter:description" content="Garantimos sua indenização de Acidentes de Transito com rapidez e transparência no Paraná. Entre em contato hoje!" />
        <meta name="twitter:image" content="https://www.segurosparana.com.br/paranaseguros.png" />
        <meta name="robots" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />
      </head>
      <Hero />
      <WhatsAppButton />
      <Stats />
      {/* <TeamSection /> */}
      {/* <Objetivos /> */}
      <FeatureSteps
        features={features}
        title="Nossos Objetivos"
        imageHeight="h-[500px]"
        videoSrc="/video.mp4"
        className="z-30 bg-gradient-to-b from-[#0f0f0f] to-black transform translate-y-[-20px]"
      />
      <Faq
        heading="Perguntas Frequentes"
        description="Tudo o que você precisa saber sobre o DPVAT. Não encontrou a resposta que procura? Sinta-se à vontade para entrar em contato com nossa equipe de suporte"
        items={faqItems}
        supportHeading="Precisa de mais suporte?"
        supportDescription="Nossa equipe de suporte dedicada está aqui para ajudar você com qualquer dúvida ou preocupação. Entre em contato para assistência personalizada."
        supportButtonText="Contactar Suporte"
        supportButtonUrl={whatsappUrl}
      />
      <Footer />
    </div>
  );
}