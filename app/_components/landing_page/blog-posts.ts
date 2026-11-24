// Lista única dos artigos do blog. A home (BlogSection), o índice /blog, o
// "Leia também" dos artigos e o sitemap leem daqui — antes eram três listas
// copiadas à mão que já tinham divergido (título, data, imagem e autor).
//
// Ordem = ordem de exibição; a home mostra os 3 primeiros.

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  /** Imagem de public/ ou de images.unsplash.com (remotePatterns do next.config). */
  image: string;
  date: string;
  category: string;
  author: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "inss",
    title: "Auxílio-Acidente do INSS: Guia Completo",
    excerpt:
      "Saiba quando você tem direito ao benefício e como dar entrada no pedido junto ao INSS. Conheça os requisitos, o valor e o que fazer se o pedido for negado.",
    image:
      "https://images.unsplash.com/photo-1516069677018-378515003435?q=80&w=1829&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fA%3D%3D",
    date: "19 de dezembro de 2025",
    category: "Auxílio-Acidente",
    author: "Brasil Benefícios e Indenizações",
  },
  {
    slug: "auxilio-acidente-transito",
    title: "Acidente de trânsito dá direito ao Auxílio-Acidente?",
    excerpt:
      "Batida de carro, queda de moto ou atropelamento: veja quando a sequela do acidente de trânsito garante o benefício do INSS e quem fica de fora.",
    image: "/moto.jpg",
    date: "24 de novembro de 2026",
    category: "Auxílio-Acidente",
    author: "Brasil Benefícios e Indenizações",
  },
  {
    slug: "auxilio-acidente-ou-auxilio-doenca",
    title: "Auxílio-Acidente ou auxílio-doença: qual é a diferença?",
    excerpt:
      "Um é pago enquanto você não pode trabalhar; o outro, depois que você volta com uma sequela. Entenda a diferença e por que muita gente perde o segundo.",
    image: "/mulhera.jpg",
    date: "24 de novembro de 2026",
    category: "Auxílio-Acidente",
    author: "Brasil Benefícios e Indenizações",
  },
  {
    slug: "trabalhar-e-receber-auxilio-acidente",
    title: "Posso trabalhar e receber o Auxílio-Acidente ao mesmo tempo?",
    excerpt:
      "Pode. Veja por que o benefício não atrapalha o seu emprego, o que acontece se você trocar de trabalho e quando ele termina.",
    image: "/auxilio.jpg",
    date: "24 de novembro de 2026",
    category: "Auxílio-Acidente",
    author: "Brasil Benefícios e Indenizações",
  },
  {
    slug: "documentacao",
    title: "Documentos para pedir o Auxílio-Acidente",
    excerpt:
      "Lista do que reunir para pedir o benefício: documentos pessoais, do acidente, do tratamento e da sequela. Organize-se e evite atrasos no seu processo.",
    image: "/documentation.jpeg",
    date: "24 de novembro de 2026",
    category: "Documentação",
    author: "Brasil Benefícios e Indenizações",
  },
];

export function blogPostUrl(post: BlogPost): string {
  return `/blog/${post.slug}`;
}
