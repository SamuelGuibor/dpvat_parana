import type { MetadataRoute } from "next";

// /robots.txt gerado pelo Next: libera o site público, bloqueia áreas
// privadas e aponta o sitemap (antes o robots.txt não apontava sitemap).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/nova-dash", "/api/", "/area-do-cliente", "/status", "/login"],
      },
    ],
    sitemap: "https://www.segurosparana.com.br/sitemap.xml",
  };
}
