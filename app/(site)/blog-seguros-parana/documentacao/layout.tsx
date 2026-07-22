import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentos para indenização de acidente de trânsito",
  description:
    "Lista completa de documentos para pedir indenização DPVAT e benefícios do INSS: boletim de ocorrência, laudos, prontuários e mais.",
  alternates: { canonical: "/blog-seguros-parana/documentacao" },
};

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
