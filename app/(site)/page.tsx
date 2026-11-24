import { Header } from '@/app/_components/landing_page/Header';
import { Hero } from '@/app/_components/landing_page/Hero';
import { AuxilioAcidente } from '@/app/_components/landing_page/AuxilioAcidente';
import { WhyChooseUs } from '@/app/_components/landing_page/WhyChooseUs';
import { BlogSection } from '@/app/_components/landing_page/BlogSection';
import { Contact } from '@/app/_components/landing_page/Contact';
import { Footer } from '@/app/_components/landing_page/Footer';
import Stats from './section/stats';
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { absolute: "Brasil Benefícios e Indenizações - Indenização Rápida e Segura" },
  description:
    "Sofreu um acidente e ficou com sequelas? Você pode ter direito ao Auxílio-Acidente do INSS. Faça a análise gratuita do seu caso pelo WhatsApp.",
  alternates: {
    canonical: "https://www.brasilbeneficiosbr.com/",
  },
  openGraph: {
    title: "Brasil Benefícios e Indenizações - Auxílio-Acidente do INSS",
    description:
      "Especialistas em Auxílio-Acidente do INSS e indenizações de acidentes de trânsito.",
    url: "https://www.brasilbeneficiosbr.com/",
    siteName: "Brasil Benefícios e Indenizações",
    images: [
      {
        url: "https://www.brasilbeneficiosbr.com/og-brasil-beneficios.png",
        width: 1200,
        height: 630,
        alt: "Brasil Benefícios e Indenizações",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brasil Benefícios e Indenizações - Auxílio-Acidente do INSS",
    description:
      "Sofreu um acidente e ficou com sequelas? Faça a análise gratuita do seu caso pelo WhatsApp.",
    images: ["https://www.brasilbeneficiosbr.com/og-brasil-beneficios.png"],
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Hero />
      <AuxilioAcidente />
      <WhyChooseUs />
      <Stats />
      <BlogSection />
      <Contact />
      <Footer />
    </div>
  );
}