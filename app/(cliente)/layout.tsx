import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Área do Cliente | Paraná Seguros",
  robots: "noindex, nofollow",
};

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
