import { Calendar, ArrowRight } from 'lucide-react';
import Image from 'next/image'
import { BLOG_POSTS, blogPostUrl } from './blog-posts';

export function BlogSection() {
  return (
    <section id="blog" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl text-gray-900 mb-4">
            Blog e Artigos
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Informações sobre o Auxílio-Acidente e os seus direitos depois de um acidente
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {BLOG_POSTS.slice(0, 3).map((post) => (
            <article key={post.slug} className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow">
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
                <a href={blogPostUrl(post)} className="text-blue-600 hover:text-blue-700 flex items-center gap-2 transition-colors">
                  Ler mais
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="text-center mt-12">
          <a href="/blog" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors">
            Ver Todos os Artigos
          </a>
        </div>
      </div>
    </section>
  );
}
