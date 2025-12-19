/* eslint-disable no-unused-vars */
'use client';
import { Calendar, User, ArrowRight, Search, Tag } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Footer } from '../_components/landing_page/Footer';
import { Header } from '../_components/landing_page/Header';
const blogPosts = [
    {
        id: 1,
        title: 'Como Funciona o Seguro DPVAT em 2025',
        excerpt: 'Entenda seus direitos e como solicitar a indenização do seguro obrigatório para vítimas de acidentes de trânsito. Saiba quais documentos reunir e os prazos.',
        image: 'https://images.unsplash.com/photo-1637763723578-79a4ca9225f7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBhY2NpZGVudCUyMGluc3VyYW5jZXxlbnwxfHx8fDE3NjU4OTY4OTd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        date: '15 de Dezembro, 2025',
        category: 'DPVAT',
        author: 'Me Ajuda DPVAT',
        link: '/blog-seguros-parana/dpvat'
    },
    {
        id: 2,
        title: 'Auxílio-Acidente do INSS: Guia Completo',
        excerpt: 'Saiba quando você tem direito ao benefício e como dar entrada no pedido junto ao INSS. Conheça os requisitos e valores atualizados para 2025.',
        image: 'https://images.unsplash.com/photo-1722336760994-8e33dc1c116a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmFmZmljJTIwYWNjaWRlbnQlMjBsYXd8ZW58MXx8fHwxNzY1OTc5OTY0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        date: '19 de dezembro de 2025',
        category: 'INSS',
        author: 'Dr. Hilário Bocchi Neto',
        link: '/blog-seguros-parana/inss'
    },
    {
        id: 3,
        title: 'Documentos Necessários para Processos de Indenização',
        excerpt: 'Lista completa de documentos que você precisa reunir para agilizar seu processo de indenização. Organize-se e evite atrasos no seu processo.',
        image: 'https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsZWdhbCUyMGRvY3VtZW50cyUyMG9mZmljZXxlbnwxfHx8fDE3NjU5ODEwNDd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        date: '5 de Dezembro, 2025',
        category: 'Documentação',
        author: 'Dr. Paulo Mendes',
        link: '/blog-seguros-parana/documentacao'
    },
    // {
    //     id: 4,
    //     title: 'Danos Morais em Acidentes de Trânsito: Quando Pedir',
    //     excerpt: 'Descubra em quais situações você pode solicitar indenização por danos morais e como calcular o valor justo da sua reparação.',
    //     image: 'https://images.unsplash.com/photo-1759762866177-f068428eb20f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmFmZmljJTIwc2FmZXR5JTIwbGF3fGVufDF8fHx8MTc2NjAzMzk4N3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    //     date: '1 de Dezembro, 2025',
    //     category: 'Danos Morais',
    //     author: 'Dr. Carlos Silva',
    // },
    // {
    //     id: 5,
    //     title: 'Pensão por Morte: Direitos dos Dependentes',
    //     excerpt: 'Entenda como funciona a pensão por morte em casos de acidentes fatais e quais são os direitos dos dependentes da vítima.',
    //     image: 'https://images.unsplash.com/photo-1734328819658-0c3ceef27c46?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbnN1cmFuY2UlMjBjbGFpbSUyMHBhcGVyd29ya3xlbnwxfHx8fDE3NjYwMzM5ODd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    //     date: '28 de Novembro, 2025',
    //     category: 'INSS',
    //     author: 'Dra. Ana Santos',
    // },
    // {
    //     id: 6,
    //     title: 'Prazos Legais: Não Perca Seu Direito à Indenização',
    //     excerpt: 'Conheça os prazos prescricionais para diferentes tipos de indenização e garanta que você não perca seus direitos por falta de atenção.',
    //     image: 'https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsZWdhbCUyMGRvY3VtZW50cyUyMG9mZmljZXxlbnwxfHx8fDE3NjU5ODEwNDd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    //     date: '22 de Novembro, 2025',
    //     category: 'Legislação',
    //     author: 'Dr. Paulo Mendes',
    // },
];

const categories = [
    { name: 'DPVAT', count: 1 },
    { name: 'INSS', count: 1 },
    { name: 'Documentação', count: 1 },
    // { name: 'Danos Morais', count: 15 },
    // { name: 'Legislação', count: 10 },
];

const popularPosts = [
    {
        title: 'Como Funciona o Seguro DPVAT em 2025',
        date: '15 de Dezembro, 2025',
        link: '/blog-seguros-parana/dpvat'
    },
    {
        title: 'Auxílio-Acidente do INSS: Guia Completo',
        date: '19 de dezembro de 2025',
        link: '/blog-seguros-parana/inss'
    },
    {
        title: 'Documentos Necessários para Processos de Indenização',
        date: '1 de Dezembro, 2025',
        link: '/blog-seguros-parana/documentacao'
    },
];

function Categories({
    categories,
    selectedCategory,
    setSelectedCategory,
}: {
    categories: { name: string; count: number }[];
    selectedCategory: string | null;
    setSelectedCategory: (value: string | null) => void;
}) {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl text-gray-900 mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-blue-600" />
                Categorias
            </h3>

            <ul className="space-y-3">
                {categories.map((category) => (
                    <li key={category.name}>
                        <button
                            onClick={() =>
                                setSelectedCategory(
                                    selectedCategory === category.name ? null : category.name
                                )
                            }
                            className={`w-full flex items-center justify-between text-left transition-colors
                ${selectedCategory === category.name
                                    ? 'text-blue-600 font-semibold'
                                    : 'text-gray-700 hover:text-blue-600'
                                }
              `}
                        >
                            <span>{category.name}</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-sm">
                                {category.count}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}


export default function BlogPage() {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const filteredPosts = useMemo(() => {
        return blogPosts.filter((post) => {
            const matchesSearch =
                post.title.toLowerCase().includes(search.toLowerCase()) ||
                post.excerpt.toLowerCase().includes(search.toLowerCase()) ||
                post.author.toLowerCase().includes(search.toLowerCase());

            const matchesCategory =
                !selectedCategory || post.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    }, [search, selectedCategory]);
    return (
        <>
            <Header />
            <div className="min-h-screen bg-gray-50">
                <div className="bg-gradient-to-br from-blue-900 to-blue-900 text-white py-16">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <h1 className="text-4xl lg:text-5xl mb-4">Blog Seguros Paraná</h1>
                        <p className="text-xl text-blue-100 max-w-3xl">
                            Artigos, guias e informações sobre seus direitos em casos de acidentes de trânsito
                        </p>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="grid lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2">
                            <div className="bg-white p-4 rounded-lg shadow-md mb-8">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Buscar artigos..."
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    />

                                </div>
                            </div>
                            <div className="mb-8 lg:hidden">
                                <Categories
                                    categories={categories}
                                    selectedCategory={selectedCategory}
                                    setSelectedCategory={setSelectedCategory}
                                />
                            </div>

                            {selectedCategory && (
                                <div className="mb-6">
                                    <button
                                        onClick={() => setSelectedCategory(null)}
                                        className="bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm hover:bg-blue-200"
                                    >
                                        {selectedCategory} ✕
                                    </button>
                                </div>
                            )}

                            <div className="space-y-8">
                                {filteredPosts.length > 0 ? (
                                    filteredPosts.map((post) => (
                                        <article
                                            key={post.id}
                                            className="bg-white rounded-lg shadow overflow-hidden"
                                        >
                                            <div className="md:flex">
                                                <div className="md:w-2/5">
                                                    <Image
                                                        src={post.image}
                                                        alt={post.title}
                                                        width={400}
                                                        height={300}
                                                        className="w-full h-64 object-cover"
                                                    />
                                                </div>

                                                <div className="p-6 md:w-3/5">
                                                    <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                                                        {post.category}
                                                    </span>

                                                    <h2 className="text-2xl mt-3 mb-2">
                                                        {post.title}
                                                    </h2>

                                                    <p className="text-gray-600 mb-4">
                                                        {post.excerpt}
                                                    </p>

                                                    <div className="flex gap-4 text-sm text-gray-500 mb-4">
                                                        <span className="flex items-center gap-1">
                                                            <User className="w-4 h-4" />
                                                            {post.author}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" />
                                                            {post.date}
                                                        </span>
                                                    </div>

                                                    <a
                                                        href={post.link}
                                                        className="text-blue-600 flex items-center gap-2 hover:text-blue-700"
                                                    >
                                                        Ler artigo
                                                        <ArrowRight className="w-4 h-4" />
                                                    </a>
                                                </div>
                                            </div>
                                        </article>
                                    ))
                                ) : (
                                    <div className="bg-white p-8 rounded-lg text-center text-gray-600">
                                        Nenhum artigo encontrado para sua busca.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="hidden lg:block">
                                <Categories
                                    categories={categories}
                                    selectedCategory={selectedCategory}
                                    setSelectedCategory={setSelectedCategory}
                                />
                            </div>

                            {/* <div className="bg-white p-6 rounded-lg shadow-md">
                                <h3 className="text-xl text-gray-900 mb-4 flex items-center gap-2">
                                    <Tag className="w-5 h-5 text-blue-600" />
                                    Categorias
                                </h3>
                                <ul className="space-y-3">
                                    {categories.map((category, index) => (
                                        <li key={index}>
                                            <button
                                                onClick={() =>
                                                    setSelectedCategory(
                                                        selectedCategory === category.name ? null : category.name
                                                    )
                                                }
                                                className={`w-full flex items-center justify-between text-left transition-colors
                                                    ${selectedCategory === category.name
                                                        ? 'text-blue-600 font-semibold'
                                                        : 'text-gray-700 hover:text-blue-600'
                                                    }
                                            `}
                                            >
                                                <span>{category.name}</span>
                                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-sm">
                                                    {category.count}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div> */}

                            <div className="bg-white p-6 rounded-lg shadow-md">
                                <h3 className="text-xl text-gray-900 mb-4">Posts Populares</h3>
                                <ul className="space-y-4">
                                    {popularPosts.map((post, index) => (
                                        <li key={index} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                                            <a href={post.link} className="block hover:text-blue-600 transition-colors">
                                                <h4 className="text-gray-900 mb-2">{post.title}</h4>
                                                <p className="text-sm text-gray-500 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {post.date}
                                                </p>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="bg-gradient-to-br from-blue-900 to-blue-700 text-white p-6 rounded-lg shadow-md">
                                <h3 className="text-2xl mb-3">Precisa de Ajuda?</h3>
                                <p className="mb-6 text-blue-100">
                                    Agende uma consulta gratuita com nossos especialistas
                                </p>
                                <a
                                    href="/#contato"
                                    className="block w-full bg-white text-blue-900 px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors text-center"
                                >
                                    Falar com Especialista
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </>
    );
}