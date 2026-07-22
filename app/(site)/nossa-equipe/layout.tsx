import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nossa Equipe",
  description:
    "Conheça a equipe da Paraná Seguros: especialistas em indenizações de acidentes de trânsito e benefícios do INSS no Paraná.",
  alternates: { canonical: "/nossa-equipe" },
};

export default function EquipeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
