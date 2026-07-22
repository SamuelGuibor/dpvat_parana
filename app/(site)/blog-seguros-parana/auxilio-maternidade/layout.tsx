import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auxílio-Maternidade: guia completo do benefício",
  description:
    "Quem tem direito ao salário-maternidade, quanto tempo dura, como solicitar no INSS e quais documentos separar — guia da Paraná Seguros.",
  alternates: { canonical: "/blog-seguros-parana/auxilio-maternidade" },
};

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
