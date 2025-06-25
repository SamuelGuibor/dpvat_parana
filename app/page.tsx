// import { Cards } from "./section/cards";
import { Faq } from "./section/faq";
import { FeatureSteps } from "./section/feature-section";
import Footer from "./section/footer";
import Hero from "./section/hero-section";
import Stats from "./section/stats";
import WhatsAppButton from "./section/whatsapp";

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

  const features = [
    {
      step: "Step 1",
      title: "Proteção dos Direitos dos Clientes",
      content:
        "Nos dedicamos a proteger os direitos e interesses dos nossos clientes com acordos extrajudiciais, garantindo uma justa e rápida indenização.",
      image: "/protect.jpg",
    },
    {
      step: "Step 2",
      title: "Compromisso com Transparência e Ética",
      content:
        "Nosso compromisso é com a transparência, a ética e a eficácia, desburocratizando procedimentos administrativos de seguradoras.",
      image: "/transparencia.jpg",
    },
    {
      step: "Step 3",
      title: "Acompanhamento Completo",
      content:
        "Acompanhamos o cliente desde a obtenção de documentos até a realização de perícia para garantir que tudo seja feito da meneira correta.",
      image: "/conecg.jpg",
    },
  ];

  return (
    <>
      <Hero />
      <WhatsAppButton />
      <FeatureSteps
        features={features}
        title="Conheça Nossas Soluções"
        imageHeight="h-[500px]"
        videoSrc="/video.mp4"
        className="z-30 bg-gradient-to-b from-[#0f0f0f] to-black transform translate-y-[-20px]"
      />
      {/* <Cards /> */}
      <Stats />
      <Faq
        heading="Perguntas Frequentes"
        description="Tudo o que você precisa saber sobre o DPVAT. Não encontrou a resposta que procura? Sinta-se à vontade para entrar em contato com nossa equipe de suporte"
        supportHeading="Precisa de mais suporte?"
        supportDescription="Nossa equipe de suporte dedicada está aqui para ajudar você com qualquer dúvida ou preocupação. Entre em contato para assistência personalizada."
        supportButtonText="Contactar Suporte"
        supportButtonUrl=""
      />
      <Footer />
    </>
  );
}