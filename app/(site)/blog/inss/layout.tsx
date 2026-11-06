import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auxílio-Acidente do INSS: quem tem direito e como pedir",
  description:
    "Sofreu um acidente e ficou com sequelas? Veja os requisitos do auxílio-acidente do INSS, documentos necessários e como a Brasil Benefícios e Indenizações pode ajudar.",
  alternates: { canonical: "/blog/inss" },
};

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
