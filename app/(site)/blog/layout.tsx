import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Auxílio-Acidente e direitos de quem sofreu um acidente",
  description:
    "Artigos sobre o Auxílio-Acidente do INSS: quem tem direito, diferença para o auxílio-doença, acidente de trânsito, trabalhar recebendo o benefício e documentos.",
  alternates: { canonical: "/blog" },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
