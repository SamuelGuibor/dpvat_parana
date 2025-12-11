import { Cards } from "./section/cards";
import { Faq } from "./section/faq";
import { FeatureSteps } from "./section/feature-section";
import Footer from "./section/footer";
import Hero from "./section/hero-section";
import { ClientReviews } from "./section/reviews";
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
  const demoReviews = [
    {
      rating: 5,
      reviewer: "Joao Pedro Ferreira da Silva",
      roleReviewer: "",
      review:
        "Uma empresa super profissional, ótima de ser atendido e deve ser muito boa de trabalhar. Indico muito essa empresa, muito boa, se pudesse dar 1000 estrelas daria, mas como a melhor é 5, dei 5 mesmo kkkkk",
      date: "2025-02-01"
    },
    {
      rating: 5,
      reviewer: "Jose Junior",
      roleReviewer: "Local Guide",
      review:
        "Ótimo atendimento, excelência no trabalho.",
      date: "2025-11-20"
    },
    {
      rating: 5,
      reviewer: "KABULOZA",
      roleReviewer: "Local Guide",
      review:
        "Simplesmente perfeito 👍 o atendimento tudo corretamente organizado e resolvido!!",
      date: "2024-12-01"
    },
    {
      rating: 5,
      reviewer: "Tibianos Um começo",
      roleReviewer: "",
      review:
        "Ótimo atendimento, me ajudaram muito. Recomendo!!!",
      date: "2025-05-01"
    },
    {
      rating: 5,
      reviewer: "Robson",
      roleReviewer: "",
      review:
        "Nunca me senti tão seguro e confortável! Atendimento excelente e agradável, tudo muito bem higienizado e exemplar. Voltarei mais vezes.",
      date: "2024-12-01"
    },
    {
      rating: 5,
      reviewer: "Wilson Trovao",
      roleReviewer: "",
      review:
        "Serviço sério com respeito. 5 estrelas bem merecido, graças a Deus e ao trabalho da equipe. Obrigado.",
      date: "2025-06-01"
    },
    {
      rating: 5,
      reviewer: "Gelson Lima",
      roleReviewer: "",
      review:
        "Foi muito bom contar com o apoio desta equipe pois me ajudou muito e facilitou para receber o seguro. O processo é demorado e precisa de tempo para fazer. Eu recomendo para quem precise deste tipo de trabalho.",
      date: "2024-12-01"
    },
    {
      rating: 5,
      reviewer: "Kalebe Herrero Rodrigues",
      roleReviewer: "",
      review:
        "Muito bom, atendimento muito ótimo. Obrigado por serem respeitosos.",
      date: "2024-12-01"
    },
    {
      rating: 5,
      reviewer: "Alfeu Alves",
      roleReviewer: "",
      review:
        "Empresa séria, com profissionais bem qualificados, me ajudaram muito. Obrigado.",
      date: "2025-05-01"
    },
    {
      rating: 5,
      reviewer: "Keivison Oliveira",
      roleReviewer: "",
      review:
        "Foi muito bom o atendimento, nota 10 👌🏻",
      date: "2025-02-01"
    },
    {
      rating: 5,
      reviewer: "Patricia Cavalin",
      roleReviewer: "",
      review:
        "São profissionais ágeis, sérios, realmente vale a pena. Resolvem mesmo sem que a gente precise se incomodar ou se preocupar! Parabéns a esse escritório e essa equipe top.",
      date: "2025-11-25"
    },
    {
      rating: 5,
      reviewer: "Kauan Fernandes",
      roleReviewer: "",
      review:
        "Uma empresa muito séria e confiável. Resolveu meu problema, achei incrível o atendimento. Recomendo demais.",
      date: "2025-10-15"
    },
    {
      rating: 5,
      reviewer: "Isadora Bittencourt",
      roleReviewer: "Local Guide",
      review:
        "Empresa abençoada. Graças a eles resgatei depois de 3 anos, após um acidente, meu seguro DPVAT. Nem tinha mais esperanças. Empresa confiável e atendentes muito atenciosos. Nota 10.",
      date: "2025-07-01"
    }
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
      <Cards />
      <Stats />
      <ClientReviews reviews={demoReviews} />
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

