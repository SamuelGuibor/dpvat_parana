import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DPVAT: como funciona a indenização por acidente de trânsito",
  description:
    "Entenda quem tem direito à indenização DPVAT, os prazos, valores e o passo a passo para solicitar — guia completo da Paraná Seguros.",
  alternates: { canonical: "/blog-seguros-parana/dpvat" },
};

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
