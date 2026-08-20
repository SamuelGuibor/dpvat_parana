import { withNextVideo } from "next-video/process";

// Security headers aplicados a todas as respostas. CSP completa fica de fora
// por enquanto (o app usa scripts inline do Next + darkreader; exigiria nonce
// em tudo) — estes headers cobrem clickjacking, MIME-sniffing e downgrade.
const securityHeaders = [
  // Força HTTPS por 2 anos (inclui subdomínios). Só tem efeito em produção.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Impede o site de ser embutido em iframe de terceiros (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // Navegador não tenta "adivinhar" content-type (bloqueia MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não vaza URL completa em navegação para outros domínios.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // APIs de hardware que o app não usa ficam bloqueadas para qualquer script.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // O pdfjs (usado para achar as âncoras de assinatura no PDF) carrega o
  // próprio worker por caminho de arquivo. Empacotado pelo webpack ele procura
  // o worker dentro de .next/ e quebra ("Cannot find module pdf.worker.mjs") —
  // externalizado, o Node o resolve direto do node_modules e funciona.
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
    // Os .docx de templates/ são lidos em runtime com nome de arquivo dinâmico
    // (gerarProcuracao) — o file tracing da Vercel não enxerga essa leitura e
    // deixava a pasta fora do bundle das funções: ENOENT em
    // /var/task/templates/*.docx ao gerar contrato/procuração em produção.
    outputFileTracingIncludes: {
      "/**": ["./templates/**/*.docx"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextVideo(nextConfig);
