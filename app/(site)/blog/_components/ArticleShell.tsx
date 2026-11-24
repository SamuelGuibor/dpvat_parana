import { Calendar, ChevronRight, Clock, Tag, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { FaWhatsapp } from 'react-icons/fa';
import { Footer } from '@/app/_components/landing_page/Footer';
import { Header } from '@/app/_components/landing_page/Header';
import { BLOG_POSTS, blogPostUrl } from '@/app/_components/landing_page/blog-posts';
import { WHATSAPP_ANALISE_URL } from '@/app/_components/landing_page/site-info';

function findPost(slug: string) {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Artigo "${slug}" não está em BLOG_POSTS (blog-posts.ts)`);
  return post;
}

/** "Leia também": os outros artigos da lista, na ordem dela. */
export function RelatedPosts({ slug, limit = 3 }: { slug: string; limit?: number }) {
  const related = BLOG_POSTS.filter((p) => p.slug !== slug).slice(0, limit);
  return (
    <div className="mt-16">
      <h3 className="text-2xl text-gray-900 mb-8">Leia também</h3>
      <div className="grid md:grid-cols-3 gap-6">
        {related.map((post) => (
          <Link
            key={post.slug}
            href={blogPostUrl(post)}
            className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow"
          >
            <Image
              width={500}
              height={300}
              src={post.image}
              alt={post.title}
              className="w-full h-48 object-cover"
            />
            <div className="p-4">
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                {post.category}
              </span>
              <h4 className="text-gray-900 mt-3 mb-2">{post.title}</h4>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {post.date}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Moldura dos artigos novos do blog: cabeçalho, imagem, metadados, CTA de
 * análise gratuita e "Leia também". Título, data, imagem e categoria vêm de
 * BLOG_POSTS pelo slug — o artigo só escreve o texto. O texto usa h2/h3/p/ul/
 * ol/table simples: o estilo vem das classes [&_x] do wrapper.
 */
export function ArticleShell({
  slug,
  readTime,
  children,
}: {
  slug: string;
  readTime: string;
  children: React.ReactNode;
}) {
  const post = findPost(slug);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/blog" className="text-gray-600 hover:text-blue-600">Blog</Link>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{post.category}</span>
            </nav>
          </div>
        </div>

        <article className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="w-full h-64 sm:h-96 relative">
              <Image
                fill
                priority
                sizes="(min-width: 1024px) 1024px, 100vw"
                src={post.image}
                alt={post.title}
                className="object-cover"
              />
            </div>

            <div className="p-6 sm:p-8 lg:p-12">
              <span className="inline-flex bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm items-center gap-2 mb-6">
                <Tag className="w-4 h-4" />
                {post.category}
              </span>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl text-gray-900 mb-6">{post.title}</h1>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-gray-600 mb-8 pb-8 border-b border-gray-200">
                <span className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  {post.author}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {post.date}
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {readTime} de leitura
                </span>
              </div>

              <div
                className={[
                  'text-gray-700 text-lg leading-relaxed',
                  '[&_p]:mb-6',
                  '[&_h2]:text-2xl sm:[&_h2]:text-3xl [&_h2]:text-gray-900 [&_h2]:mt-12 [&_h2]:mb-6',
                  '[&_h3]:text-xl [&_h3]:text-gray-900 [&_h3]:mt-8 [&_h3]:mb-4',
                  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:mb-8 [&_ol]:mb-8 [&_li]:mb-3',
                  '[&_strong]:text-gray-900',
                  '[&_a]:text-blue-600 [&_a]:underline',
                ].join(' ')}
              >
                {children}
              </div>

              <div className="bg-gradient-to-br from-blue-900 to-blue-700 text-white p-8 rounded-xl mt-12">
                <h3 className="text-2xl mb-4">Quer saber se você tem direito?</h3>
                <p className="text-blue-100 mb-6">
                  Conte o que aconteceu pelo WhatsApp. A nossa equipe analisa o seu caso sem custo e
                  explica os próximos passos.
                </p>
                <a
                  href={WHATSAPP_ANALISE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-green-500 text-white font-semibold px-8 py-3 rounded-lg hover:bg-green-600 transition-colors"
                >
                  <FaWhatsapp className="w-5 h-5" />
                  Análise Gratuita
                </a>
              </div>
            </div>
          </div>

          <RelatedPosts slug={slug} />
        </article>
      </div>
      <Footer />
    </>
  );
}

/** Caixa de destaque dentro do texto do artigo (children: texto corrido, sem <p>). */
export function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border-l-4 border-blue-600 p-6 my-8 rounded-r-lg">
      <div className="font-semibold text-blue-900 mb-2">{title}</div>
      <div className="text-gray-800 text-base">{children}</div>
    </div>
  );
}
