import type { MetadataRoute } from "next";

const BASE = "https://www.segurosparana.com.br";

// Sitemap gerado pelo Next em /sitemap.xml — só as páginas públicas do site.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/blog-seguros-parana", priority: 0.9, changeFrequency: "weekly" },
    { path: "/blog-seguros-parana/dpvat", priority: 0.8, changeFrequency: "monthly" },
    { path: "/blog-seguros-parana/inss", priority: 0.8, changeFrequency: "monthly" },
    { path: "/blog-seguros-parana/auxilio-maternidade", priority: 0.8, changeFrequency: "monthly" },
    { path: "/blog-seguros-parana/documentacao", priority: 0.8, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
    { path: "/nossa-equipe", priority: 0.6, changeFrequency: "monthly" },
    { path: "/politica-de-privacidade", priority: 0.3, changeFrequency: "yearly" },
    { path: "/termos-de-uso", priority: 0.3, changeFrequency: "yearly" },
  ];

  return pages.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
