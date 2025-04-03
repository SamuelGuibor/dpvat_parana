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
    <html lang="en">
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
              url: "https://dpvat-parana.vercel.app/",
              logo: "https://dpvat-parana.vercel.app/logo.png",
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
