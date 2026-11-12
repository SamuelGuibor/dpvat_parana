import { Header } from '@/app/_components/landing_page/Header';
import { Hero } from '@/app/_components/landing_page/Hero';
import { Services } from '@/app/_components/landing_page/Services';
import { BlogSection } from '@/app/_components/landing_page/BlogSection';
import { Contact } from '@/app/_components/landing_page/Contact';
import { Footer } from '@/app/_components/landing_page/Footer';
import Stats from './section/stats';
import Video from '@/app/_components/landing_page/video';
import { Testimonials } from '@/app/_components/landing_page/feedback';
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { absolute: "Brasil Benefícios e Indenizações - Indenização Rápida e Segura" },
  description:
    "Saiba tudo sobre o seguro DPVAT e como podemos ajudar a garantir sua indenização rápida e sem burocracia.",
  alternates: {
    canonical: "https://www.brasilbeneficiosbr.com/",
  },
  openGraph: {
    title: "Brasil Benefícios e Indenizações - Indenização Rápida e Segura com DPVAT",
    description:
      "Especialistas em indenizações de Acidentes de Transito no Paraná.",
    url: "https://www.brasilbeneficiosbr.com/",
    siteName: "Brasil Benefícios e Indenizações",
    images: [
      {
        url: "https://www.brasilbeneficiosbr.com/og-brasil-beneficios.png",
        width: 1200,
        height: 630,
        alt: "Brasil Benefícios e Indenizações - Indenização DPVAT",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brasil Benefícios e Indenizações - Indenização Rápida DPVAT",
    description:
      "Garantimos sua indenização DPVAT com rapidez e transparência no Paraná. Entre em contato hoje!",
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
      <Services />
      <Video />
      <Stats />
      <BlogSection />
      <Testimonials />
      <Contact />
      <Footer />
    </div>
  );
}