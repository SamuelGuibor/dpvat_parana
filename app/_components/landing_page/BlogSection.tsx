// import { ImageWithFallback } from './figma/ImageWithFallback';
import { Calendar, ArrowRight } from 'lucide-react';
import Image from 'next/image'
const blogPosts = [
  {
    id: 1,
    title: 'Como Funciona o Seguro DPVAT em 2025',
    excerpt: 'Entenda seus direitos e como solicitar a indenização do seguro obrigatório para vítimas de acidentes de trânsito.',
    image: '/dpvat_photo.jpeg',
    date: '15 de Dezembro, 2025',
    category: 'DPVAT',
    src: '/blog-seguros-parana/dpvat'
  },
  {
    id: 2,
    title: 'Auxílio-Acidente do INSS: Guia Completo',
    excerpt: 'Saiba quando você tem direito ao benefício e como dar entrada no pedido junto ao INSS.',
    image: '/inss_photo.jpeg',
    date: '10 de Dezembro, 2025',
    category: 'INSS',
    src: '/blog-seguros-parana/inss'
  },
  {
    id: 3,
    title: 'Documentos Necessários para Processos de Indenização',
    excerpt: 'Lista completa de documentos que você precisa reunir para agilizar seu processo de indenização.',
    image: '/documentation.jpeg',
    date: '5 de Dezembro, 2025',
    category: 'Documentação',
    src: '/blog-seguros-parana/documentacao'
  },
];

export function BlogSection() {
  return (
    <section id="blog" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl text-gray-900 mb-4">
            Blog e Artigos
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Informações atualizadas sobre seus direitos e processos de indenização
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post) => (
            <article key={post.id} className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow">
              <Image 
                src={post.image}
                alt={post.title}
                width={600}
                height={600}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <div className="flex items-center gap-4 mb-3">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                    {post.category}
                  </span>
                  <div className="flex items-center gap-1 text-gray-500 text-sm">
                    <Calendar className="w-4 h-4" />
                    {post.date}
                  </div>
                </div>
                <h3 className="text-xl text-gray-900 mb-3">{post.title}</h3>
                <p className="text-gray-600 mb-4">{post.excerpt}</p>
                <a href={post.src} className="text-blue-600 hover:text-blue-700 flex items-center gap-2 transition-colors">
                  Ler mais
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="text-center mt-12">
          <a href="/blog-seguros-parana" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors">
            Ver Todos os Artigos
          </a>
        </div>
      </div>
    </section>
  );
}
