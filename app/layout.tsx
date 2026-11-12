import type { Metadata } from "next";
import "./globals.css";
import { Mulish } from "next/font/google";
import AuthProvider from "./_shared/providers/auth";
import { Toaster } from "./_shared/ui/sonner";
import { NotificationsProvider } from "./store/provider";

const mulish = Mulish({
  subsets: ["latin-ext"],
});

// Metadata única via API do Next (antes havia tags manuais no <head> DUPLICANDO
// e contradizendo este export — título/description/canonical divergentes no HTML
// final). Os scripts de marketing (GA/Pixel/RD Station) vivem no layout do
// (site): a equipe navegando no CRM não deve poluir o Analytics/Pixel.
export const metadata: Metadata = {
  metadataBase: new URL("https://brasilbeneficiosbr.com"),
  title: {
    default: "Brasil Benefícios e Indenizações - Indenização Rápida e Segura",
    template: "%s | Brasil Benefícios e Indenizações",
  },
  description:
    "Especialistas em indenizações de acidentes de trânsito e benefícios do INSS no Paraná. Atendemos vítimas de acidentes com rapidez e transparência.",
  authors: [{ name: "Brasil Benefícios e Indenizações" }],
  keywords:
    "seguro DPVAT, indenização DPVAT, auxílio-acidente INSS, benefício INSS, indenização acidente de trânsito, Brasil Benefícios e Indenizações, Curitiba DPVAT, advogado acidente de trânsito Paraná",
  robots: "index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Brasil Benefícios e Indenizações - Indenização Rápida e Segura",
    description:
      "Especialistas em indenizações de acidentes de trânsito e benefícios do INSS no Paraná. Atendimento rápido e transparente.",
    url: "https://brasilbeneficiosbr.com/",
    siteName: "Brasil Benefícios e Indenizações",
    images: [
      {
        url: "https://brasilbeneficiosbr.com/og-brasil-beneficios.png",
        width: 1200,
        height: 630,
        alt: "Brasil Benefícios e Indenizações - Indenização de Acidentes de Trânsito",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brasil Benefícios e Indenizações - Indenização Rápida de Acidentes de Trânsito",
    description:
      "Garantimos sua indenização de acidentes de trânsito com rapidez e transparência no Paraná. Entre em contato hoje!",
    images: ["https://brasilbeneficiosbr.com/og-brasil-beneficios.png"],
  },
  other: {
    "facebook-domain-verification": "1rkpryx50xubl50ps6z82tb2is9887",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${mulish.className} antialiased`}>
        <AuthProvider><NotificationsProvider>{children}</NotificationsProvider></AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
