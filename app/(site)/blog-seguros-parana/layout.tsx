import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Seguros e Benefícios no Paraná",
  description:
    "Artigos sobre indenização DPVAT, auxílio-acidente do INSS, auxílio-maternidade e documentação para vítimas de acidente de trânsito no Paraná.",
  alternates: { canonical: "/blog-seguros-parana" },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
