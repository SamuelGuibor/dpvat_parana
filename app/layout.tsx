import type { Metadata } from "next";
import "./globals.css";
import { Mulish } from "next/font/google";
import AuthProvider from "./_providers/auth";
import { Toaster } from "./_components/ui/sonner";

const mulish = Mulish({
  subsets: ["latin-ext"],
});

export const metadata: Metadata = {
  title: "Paraná Seguros",
  description:
    "Paraná Seguros - Soluções de seguros para proteção e tranquilidade.",
  authors: [{ name: "Paraná Seguros" }],
  keywords:
    "seguros, seguro de vida, seguros para empresas, proteção, Paraná Seguros, seguros automotivos, seguros residenciais, seguros empresariais, seguro saúde, consultoria em seguros, planos de seguros, seguros no Paraná, seguros personalizados, proteção de bens, seguros acessíveis, consultoria de riscos, seguros de viagens, seguro de imóvel, seguros de responsabilidade civil, previdência privada, seguro de carro, seguro empresarial, melhores seguros de vida, seguro mais barato, proteção financeira, gestão de riscos",
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <title>Paraná Seguros - Indenização Rápida e Segura</title>
        <meta
          name="description"
          content="Especialistas em indenizações de acidentes de trânsito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná."
        />
        <meta
          name="keywords"
          content="DPVAT Paraná,seguro DPVAT,indenização DPVAT,Paraná Seguros,Curitiba DPVAT,Ponta Grossa DPVAT,Maringá DPVAT"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://www.segurosparana.com.br/" />
        <meta
          property="og:title"
          content="Paraná Seguros - Indenização Rápida e Segura com DPVAT"
        />
        <meta
          property="og:description"
          content="Especialistas em indenizações de Acidentes de Transito no Paraná. Atendemos vítimas de acidentes de trânsito com rapidez e transparência em todo o Paraná."
        />
        <meta property="og:url" content="https://www.segurosparana.com.br/" />
        <meta property="og:site_name" content="Paraná Seguros" />
        <meta
          property="og:image"
          content="https://www.segurosparana.com.br/paranaseguros.png"
        />
        <meta
          property="og:image:secure_url"
          content="https://www.segurosparana.com.br/paranaseguros.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="Paraná Seguros - Indenização de Acidentes de Transito"
        />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Paraná Seguros - Indenização Rápida de Acidentes de Transito"
        />
        <meta
          name="twitter:description"
          content="Garantimos sua indenização de Acidentes de Transito com rapidez e transparência no Paraná. Entre em contato hoje!"
        />
        <meta
          name="twitter:image"
          content="https://www.segurosparana.com.br/paranaseguros.png"
        />
        <meta
          name="robots"
          content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1"
        />
      </head>
      <body className={`${mulish.className} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Paraná Seguros",
              url: "https://www.segurosparana.com.br/",
              logo: "https://www.segurosparana.com.br/paranaseguros.png",
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "Customer Service",
                telephone: "+55 41 0000-0000",
                areaServed: "BR",
                availableLanguage: "Portuguese",
              },
              sameAs: [
                "https://www.facebook.com/paranadpvat/",
                "https://www.instagram.com/paranadpvat/",
              ],
            }),
          }}
        />
      </body>
    </html>
  );
}