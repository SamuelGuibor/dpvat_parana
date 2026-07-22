import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auxílio-Acidente do INSS: quem tem direito e como pedir",
  description:
    "Sofreu um acidente e ficou com sequelas? Veja os requisitos do auxílio-acidente do INSS, documentos necessários e como a Paraná Seguros pode ajudar.",
  alternates: { canonical: "/blog-seguros-parana/inss" },
};

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
