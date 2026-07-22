import type { Metadata } from "next";

// A página é client component — a metadata vive neste layout.
export const metadata: Metadata = {
  title: "Perguntas Frequentes — DPVAT e INSS",
  description:
    "Tire suas dúvidas sobre indenização DPVAT, auxílio-acidente do INSS, prazos, documentos necessários e como funciona o processo com a Paraná Seguros.",
  alternates: { canonical: "/faq" },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
