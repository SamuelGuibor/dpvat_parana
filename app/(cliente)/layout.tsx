import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Área do Cliente",
  robots: "noindex, nofollow",
};

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
