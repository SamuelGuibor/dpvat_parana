import { Header } from '../app/_components/landing_page/Header';
import { Hero } from '../app/_components/landing_page/Hero';
import { Services } from '../app/_components/landing_page/Services';
import { BlogSection } from '../app/_components/landing_page/BlogSection';
import { Contact } from '../app/_components/landing_page/Contact';
import { Footer } from '../app/_components/landing_page/Footer';
import Stats from './section/stats';
import Video from './_components/landing_page/video';
import { Testimonials } from './_components/landing_page/feedback';

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