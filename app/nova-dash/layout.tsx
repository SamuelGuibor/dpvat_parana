import type { Metadata } from "next";

// O CRM tem título próprio e fica fora dos buscadores — antes herdava o
// título/keywords de SEO do site institucional.
export const metadata: Metadata = {
  title: "CRM | Paraná Seguros",
  robots: "noindex, nofollow",
};

export default function NovaDashLayout({ children }: { children: React.ReactNode }) {
  return children;
}
