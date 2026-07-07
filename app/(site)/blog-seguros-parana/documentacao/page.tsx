import { Calendar, User, Clock, Share2, Facebook, Twitter, Linkedin, Mail, Tag, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { Footer } from '@/app/_components/landing_page/Footer';
import { Header } from '@/app/_components/landing_page/Header';
import Link from 'next/link';

export default function BlogArticle() {
    return (
        <>
            <Header />
            <div className="min-h-screen bg-gray-50">
                {/* Breadcrumb */}
                <div className="bg-white border-b border-gray-200">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <nav className="flex items-center gap-2 text-sm">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">Documentacao</span>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-900">Documentos Necessários</span>
                        </nav>
                    </div>
                </div>

                {/* Article Header */}
                <article className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                        {/* Featured Image */}
                        <div className="w-full h-96 relative">
                            <Image
                                width={1000}
                                height={1000}
                                src="https://images.unsplash.com/photo-1603796846097-bee99e4a601f?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                                alt="Auxílio-Acidente do INSS"
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="p-8 lg:p-12">
                            {/* Category Badge */}
                            <div className="flex items-center gap-3 mb-6">
                                <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm flex items-center gap-2">
                                    <Tag className="w-4 h-4" />
                                    Documentação
                                </span>
                            </div>

                            {/* Title */}
                            <h1 className="text-4xl lg:text-5xl text-gray-900 mb-6">
                                Documentos Necessários para Processos de Indenização
                            </h1>

                            {/* Meta Information */}
                            <div className="flex flex-wrap items-center gap-6 text-gray-600 mb-8 pb-8 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <User className="w-5 h-5" />
                                    <span>Seguros Paraná</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-5 h-5" />
                                    <span>19 de dezembro de 2025</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    <span>2 min de leitura</span>
                                </div>
                            </div>

                            {/* Share Buttons */}
                            <div className="flex items-center gap-2 mb-10 pb-8 border-b border-gray-200">
                                <span className="text-gray-700 flex items-center gap-2">
                                    <Share2 className="w-5 h-5" />
                                    Compartilhar:
                                </span>
                                <button className="p-2 rounded-full hover:bg-blue-50 text-blue-600 transition-colors">
                                    <Facebook className="w-5 h-5" />
                                </button>
                                <button className="p-2 rounded-full hover:bg-blue-50 text-blue-400 transition-colors">
                                    <Twitter className="w-5 h-5" />
                                </button>
                                <button className="p-2 rounded-full hover:bg-blue-50 text-blue-700 transition-colors">
                                    <Linkedin className="w-5 h-5" />
                                </button>
                                <button className="p-2 rounded-full hover:bg-gray-50 text-gray-600 transition-colors">
                                    <Mail className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Introduction */}
                            <p className="text-xl text-gray-700 leading-relaxed mb-8">
                                Para dar entrada no seu processo de indenização por acidente de trânsito, é importante reunir algumas informações e documentos. Mas fique tranquilo: somos uma empresa especializada e cuidamos de tudo para você, inclusive da busca de documentos caso você não os tenha em mãos.
                            </p>

                            <p className="text-xl text-gray-700 leading-relaxed mb-8">
                                Nosso objetivo é facilitar todo o processo, garantindo agilidade, segurança e o melhor resultado possível para o seu caso.
                            </p>
                            {/* Article Content */}
                            <div className="prose prose-lg max-w-none">


                                {/* Section 1 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Processos relacionados ao INSS
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Quando o acidente gera direito a benefícios previdenciários ou indenizações ligadas ao INSS, são necessários:
                                </p>
                                <ul className="list-disc mb-10 pl-10 text-gray-900 leading-relaxed mx-auto">
                                    <li>
                                        Acesso ao Meu INSS: Muito importante para analisarmos seu histórico previdenciário, verificarmos direitos e calcularmos corretamente os valores da indenização.
                                    </li>
                                    <li>
                                        Acesso à Carteira de Trabalho Digital: Utilizada para confirmar vínculos empregatícios e informações essenciais ao processo.
                                    </li>
                                </ul>
                                <p className="text-gray-700 leading-relaxed mb-6 font-bold">
                                    👉 Caso tenha dificuldades com acessos, nós auxiliamos em todo o passo a passo.
                                </p>

                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Processos contra terceiros (RCF – contra o causador do acidente)
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Nos casos em que a indenização é solicitada contra o responsável pelo acidente, são necessários:
                                </p>
                                <ul className="list-disc mb-10 pl-10 text-gray-900 leading-relaxed mx-auto">
                                    <li>
                                        Fotos das lesões
                                    </li>
                                    <li>
                                        Boletim de Ocorrência (B.O.)
                                    </li>
                                </ul>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Esses documentos ajudam a comprovar a responsabilidade do causador e fortalecem o pedido de indenização.
                                </p>

                                {/* Section 3 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    🤝 Conte Conosco
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Nossa equipe atua de forma completa
                                </p>

                                {/* Table */}
                                <div className="overflow-x-auto my-8">
                                    <table className="w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                                        <thead className="bg-blue-600 text-white">
                                            <tr>
                                                <th className="px-6 py-4 text-left">Análise</th>
                                                <th className="px-6 py-4 text-left">Documentos</th>
                                                <th className="px-6 py-4 text-left">Acompanhar o Processo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-gray-900">Análise do seu caso</td>
                                                <td className="px-6 py-4 text-gray-700">Levantamento e organização dos documentos</td>
                                                <td className="px-6 py-4 text-gray-700">Acompanhamento de todo o processo até a indenização</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Section 4 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Documentos Necessários
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Para cadastrarmos no sistema são necessários documentos básicos:
                                </p>

                                {/* Document List with Icons */}
                                <div className="grid md:grid-cols-2 gap-4 my-8">
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <h4 className="text-gray-900 mb-2">📄 Documentos Pessoais</h4>
                                        <ul className="text-gray-700 text-sm space-y-1">
                                            <li>• RG e CPF</li>
                                        </ul>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <h4 className="text-gray-900 mb-2">🏥 Documentos INSS</h4>
                                        <ul className="text-gray-700 text-sm space-y-1">
                                            <li>• Acesso ao MEU INSS , muito importante para conseguirmos infomrações previdenciárias e calcular os valores da indenização.</li>
                                            <li>• Acesso a Carteira de Trabalho Digital</li>
                                        </ul>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <h4 className="text-gray-900 mb-2">🚗 Processos de Tercerios RCF (Contra Causadores do Acidente)</h4>
                                        <ul className="text-gray-700 text-sm space-y-1">
                                            <li>• Fotos das lesões</li>
                                            <li>• Boletim de ocôrrencia</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Section 5 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Como Solicitar o Nosso Serviço
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    O processo de solicitação pode ser feito da seguinte maneira:
                                </p>

                                {/* Steps */}
                                <div className="space-y-6 my-8">
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            1
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Contate-nós</h4>
                                            <p className="text-gray-700">
                                                Entre em contato com nossa equipe para iniciarmos a análise do seu caso e dar entrada no processo de indenização.
                                            </p>

                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            2
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Coleta de Informações</h4>
                                            <p className="text-gray-700">
                                                Coletamos seus dados e documentos necessários para entender o ocorrido e verificar todos os seus direitos.
                                            </p>

                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            3
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Preparação do Protocolo do Pedido</h4>
                                            <p className="text-gray-700">
                                                Nossa equipe prepara e registra o protocolo do pedido, organizando toda a documentação exigida.
                                            </p>

                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            4
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Assinatura dos termos</h4>
                                            <p className="text-gray-700">
                                                Você realiza a assinatura dos termos de forma simples e segura para autorizarmos a condução do processo.
                                            </p>

                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            5
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Aguardar o andamento do Processo</h4>
                                            <p className="text-gray-700">
                                                Após a abertura, acompanhamos todo o andamento do processo até a conclusão e liberação da indenização.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-blue-50 border-l-4 border-blue-600 p-6 my-8 rounded-r-lg">
                                        <h3 className="text-xl text-blue-900 mb-3">
                                            ⚠️ Atenção
                                        </h3>
                                        <p className="text-gray-800">
                                            <strong>Nossa Equipe entrará em contato com você sempre que o seu processo tiver movimentação por meio dos nossos contatos oficiais.</strong>
                                        </p>
                                        <br />
                                        <p className="text-gray-700 leading-relaxed mb-6">
                                            Você pode verificar o andamento do seu processo por meio do nosso site, na <a href="/area-do-cliente" className='text-blue-700 font-bold'>Área do Cliente</a>
                                        </p>
                                    </div>

                                </div>
                            </div>

                            {/* CTA Box */}
                            <div className="bg-gradient-to-br from-blue-900 to-blue-700 text-white p-8 rounded-xl mt-12">
                                <h3 className="text-2xl mb-4">Precisa de Ajuda com seu Benefício?</h3>
                                <p className="text-blue-100 mb-6">
                                    Nossa equipe especializada pode orientar você em todo o processo de solicitação do auxílio-acidente, aumentando suas chances de sucesso.
                                </p>
                                <a
                                    href="/#contato"
                                    className="inline-block bg-white text-blue-900 px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
                                >
                                    Falar com Especialista
                                </a>
                            </div>

                            {/* Author Box */}
                            <div className="bg-gray-50 p-6 rounded-lg mt-8 flex items-start gap-6">
                                <div className="flex-shrink-0 w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl">
                                    SP
                                </div>
                                <div>
                                    <h4 className="text-xl text-gray-900 mb-2">Seguros Paraná</h4>
                                    <p className="text-gray-600 mb-3">
                                        Fonte: http://segurosparana.com.br/blog-seguros-parana/documentacao    
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Related Articles */}
                    <div className="mt-16">
                        <h3 className="text-2xl text-gray-900 mb-8">Artigos Relacionados</h3>
                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                {
                                    title: "Auxílio-acidente: como solicitar e regras atualizadas",
                                    category: "INSS",
                                    date: "19 de Dezembro, 2025",
                                    image: "https://images.unsplash.com/photo-1722336760994-8e33dc1c116a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmFmZmljJTIwYWNjaWRlbnQlMjBsYXd8ZW58MXx8fHwxNzY1OTc5OTY0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
                                    link: '/blog-seguros-parana/inss'
                                },
                                {
                                    title: "Como Funciona o Seguro DPVAT em 2025",
                                    category: "DPVAT",
                                    date: "15 de Dezembro, 2025",
                                    image: "https://images.unsplash.com/photo-1637763723578-79a4ca9225f7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBhY2NpZGVudCUyMGluc3VyYW5jZXxlbnwxfHx8fDE3NjU4OTY4OTd8MA&ixlib=rb-4.1.0&q=80&w=1080",
                                    link: '/blog-seguros-parana/dpvat'
                                }
                            ].map((article, index) => (
                                <div key={index} className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow cursor-pointer">
                                    <Link href={article.link}>
                                        <Image
                                            width={500}
                                            height={500}
                                            src={article.image}
                                            alt={article.title}
                                            className="w-full h-48 object-cover"
                                        />
                                    </Link>
                                    <div className="p-4">
                                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                                            {article.category}
                                        </span>
                                        <h4 className="text-gray-900 mt-3 mb-2">{article.title}</h4>
                                        <p className="text-sm text-gray-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {article.date}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </article>
            </div>
            <Footer />
        </>
    );
}