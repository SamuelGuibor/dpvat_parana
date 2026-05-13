import { Calendar, User, Clock, Share2, Facebook, Twitter, Linkedin, Mail, Tag, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { Footer } from '../../_components/landing_page/Footer';
import { Header } from '../../_components/landing_page/Header';
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
                            <span className="text-gray-600">DPVAT</span>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-900">Como Funciona o Seguro DPVAT</span>
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
                                src="/fotodpvat.png"
                                alt="Seguro DPVAT"
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="p-8 lg:p-12">
                            {/* Category Badge */}
                            <div className="flex items-center gap-3 mb-6">
                                <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm flex items-center gap-2">
                                    <Tag className="w-4 h-4" />
                                    DPVAT
                                </span>
                            </div>

                            {/* Title */}
                            <h1 className="text-4xl lg:text-5xl text-gray-900 mb-6">
                                Como Funciona o Seguro DPVAT em 2025
                            </h1>

                            {/* Meta Information */}
                            <div className="flex flex-wrap items-center gap-6 text-gray-600 mb-8 pb-8 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <User className="w-5 h-5" />
                                    <span>Me Ajuda Dpvat</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-5 h-5" />
                                    <span>19 de dezembro de 2025</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    <span>5 min de leitura</span>
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
                                Somos a Nova SPVAT, especialistas em auxiliar vítimas de acidentes de trânsito a receberem suas indenizações do Seguro DPVAT de forma rápida, segura e sem burocracia. Com mais de 10 mil clientes atendidos, cuidamos de todo o processo para garantir seus direitos.
                            </p>

                            <p className="text-xl text-gray-700 leading-relaxed mb-8">
                                Se você já sofreu algum tipo de acidente de trânsito e está em dúvida sobre como funciona ou deseja entender melhor as regras atualizadas sobre esse seguro, continue lendo para conhecer todos os seus direitos.
                            </p>
                            {/* Article Content */}
                            <div className="prose prose-lg max-w-none">


                                {/* Section 1 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Como funciona o Seguro DPVAT
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    O Seguro DPVAT é uma proteção obrigatória para vítimas de acidentes de trânsito, cobrindo indenizações por morte, invalidez permanente e reembolso de despesas médicas e suplementares.
                                </p>
                                <ul className="list-disc mb-10 pl-10 text-gray-900 leading-relaxed mx-auto">
                                    <li>
                                        As coberturas do Seguro DPVAT incluem: Reembolso de Despesas Médicas, Invalidez Total ou Parcial e Morte.
                                    </li>
                                    <li>
                                        Ele se distingue de outros seguros por ser obrigatório e administrado pela CAIXA, garantindo indenizações independentemente de culpa no acidente.
                                    </li>
                                </ul>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Assim sendo, o Seguro DPVAT funciona como uma indenização para vítimas de acidentes de trânsito que resultem em danos pessoais, cobrindo despesas médicas, invalidez ou morte.
                                </p>

                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Quais são os requisitos do Seguro DPVAT?
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Para solicitar o Seguro DPVAT, a vítima ou beneficiários devem atender a alguns requisitos:
                                </p>
                                <ul className="list-disc mb-10 pl-10 text-gray-900 leading-relaxed mx-auto">
                                    <li>
                                        <strong>Ter sofrido um acidente de trânsito:</strong> envolvendo veículos automotores terrestres.
                                    </li>
                                    <li>
                                        <strong>Apresentar comprovantes:</strong> de despesas, invalidez ou morte decorrentes do acidente.
                                    </li>
                                    <li>
                                        <strong>Ser vítima ou beneficiário legal:</strong> qualquer pessoa envolvida no acidente, independentemente de ser motorista, passageiro ou pedestre.
                                    </li>
                                </ul>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Atenção: o Seguro DPVAT não exige contribuição prévia ou carência, sendo direito de todas as vítimas de acidentes de trânsito no Brasil.
                                </p>
                                {/* Highlight Box */}
                                <div className="bg-blue-50 border-l-4 border-blue-600 p-6 my-8 rounded-r-lg">
                                    <h3 className="text-xl text-blue-900 mb-3">
                                        ⚠️ Exemplo
                                    </h3>
                                    <p className="text-gray-800">
                                        Lucca sofreu um acidente de trânsito no final de semana e acabou tendo a mão amputada.
                                    </p>
                                    <br />
                                    <p className="text-gray-800">
                                        Após o tratamento, Lucca pode solicitar a indenização por invalidez permanente (IP), pois ficou com uma sequela definitiva.
                                    </p>
                                    <br />
                                    <p className="text-gray-800">
                                        Lucca também pode solicitar reembolso de despesas médicas (DAMS) comprovadas durante o tratamento.
                                    </p>
                                    <br />
                                    <p className="text-gray-800">
                                        Repare que o Seguro DPVAT é indenizatório, compensando os danos sofridos pela vítima.
                                    </p>
                                    <br />
                                    <p className="text-gray-800">
                                        Assim sendo, Lucca pode receber as indenizações correspondentes às coberturas aplicáveis.
                                    </p>
                                    <br />
                                </div>

                                {/* Section 2 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Quem tem direito ao Seguro DPVAT?
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Têm direito ao Seguro DPVAT as vítimas de acidentes de trânsito que preencham os requisitos, incluindo:
                                </p>
                                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                                    <li>
                                        <strong>Motoristas</strong>
                                    </li>
                                    <li>
                                        <strong>Passageiros</strong>
                                    </li>
                                    <li>
                                        <strong>Pedestres</strong>
                                    </li>
                                    <li>
                                        <strong>Beneficiários legais em caso de morte</strong>
                                    </li>
                                </ul>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Seguro DPVAT quem NÃO tem direito:
                                </p>
                                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                                    <li>
                                        <strong>Acidentes sem veículos automotores</strong>
                                    </li>
                                    <li>
                                        <strong>Danos materiais (apenas danos pessoais)</strong>
                                    </li>
                                    <li>
                                        <strong>Casos sem comprovação</strong>
                                    </li>
                                </ul>

                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Menores tem direito?
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Menores ou incapazes também têm direito à indenização, mas a solicitação deve ser feita por seu representante legal ou por procurador com procuração que atenda às características do modelo de procuração  da Caixa ou Líder.                </p>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Já os maiores não alfabetizados ou impossibilitados de assinar devem apresentar procuração por instrumento público emitida em cartório.
                                </p>


                                {/* Section 3 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Qual o valor da indenização?
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Os valores das indenizações do Seguro DPVAT são definidos por lei e variam conforme o tipo de cobertura.
                                </p>

                                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                                    <li>
                                        <strong>Morte: Até R$ 13.500,00</strong>
                                    </li>
                                    <li>
                                        <strong>Invalidez Permanente (IP): Até R$ 13.500,00</strong>
                                    </li>
                                    <li>
                                        <strong>Despesas de Assistência Médica e Suplementares (DAMS): Até R$ 2.700,00</strong>
                                    </li>
                                </ul>

                                {/* Table */}
                                <div className="overflow-x-auto my-8">
                                    <table className="w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                                        <thead className="bg-blue-600 text-white">
                                            <tr>
                                                <th className="px-6 py-4 text-left">Tipo</th>
                                                <th className="px-6 py-4 text-left">Valor Máximo</th>
                                                <th className="px-6 py-4 text-left">Descrição</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-gray-900">Morte</td>
                                                <td className="px-6 py-4 text-gray-700">Até R$ 13.500,00</td>
                                                <td className="px-6 py-4 text-gray-700">Indenização por falecimento</td>
                                            </tr>
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-gray-900">IP</td>
                                                <td className="px-6 py-4 text-gray-700">Até R$ 13.500,00</td>
                                                <td className="px-6 py-4 text-gray-700">Indenização por invalidez</td>
                                            </tr>
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-gray-900">DAMS</td>
                                                <td className="px-6 py-4 text-gray-700">Até R$ 2.700,00</td>
                                                <td className="px-6 py-4 text-gray-700">Reembolso de despesas médicas</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Tipos de Indenização
                                </h2>
                                <p className="text-gray-700 leading-relaxed font-bold mb-6">
                                    <span className='text-blue-600'>Morte:</span> <br />
                                    Quando há uma fatalidade e a pessoa acaba falecendo em um acidente. Indenização de R$ 13.500 para os herdeiros da vítima.
                                </p>
                                <p className="text-gray-700 leading-relaxed font-bold mb-6">
                                    <span className='text-blue-600'>Invalidez Permanente:</span> <br />
                                    Quando a pessoa sofre algum tipo de lesão grave e fica com alguma invalidez em sua saúde. Indenização de até R$ 13.500 para a vítima ou representante legal, sendo calculado de acordo com a gravidade da lesão.
                                </p>
                                
                                {/* Section 4 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Documentos Necessários
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Para solicitar o Seguro DPVAT, você precisará reunir a seguinte documentação:
                                </p>

                                {/* Document List with Icons */}
                                <div className="grid md:grid-cols-2 gap-4 my-8">
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <h4 className="text-gray-900 mb-2">📄 Documentos Pessoais</h4>
                                        <ul className="text-gray-700 text-sm space-y-1">
                                            <li>• RG/CNH e CPF</li>
                                            <li>• Comprovante de residência</li>
                                            <li>• Documento do veículo (Caso seja o condutor proprietário)</li>
                                        </ul>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <h4 className="text-gray-900 mb-2">🏥 Documentos Médicos</h4>
                                        <ul className="text-gray-700 text-sm space-y-1">
                                            <li>• Laudo do IML (Dando entrada com nossos parceiros, esse laudo não é necessário)</li>
                                        </ul>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <h4 className="text-gray-900 mb-2">🚗 Documentos do Acidente</h4>
                                        <ul className="text-gray-700 text-sm space-y-1">
                                            <li>• Boletim de Ocorrência (BO)</li>
                                            <li>• Documentação médica</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Section 5 */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Como Solicitar a Indenização
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Para receber a indenização SPVAT, é necessário apresentar a documentação exigida para cada tipo de indenização e garantir que ela seja legível e autêntica.
                                </p>

                                {/* Steps */}
                                <div className="space-y-6 my-8">
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            1
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Acesse o Aplicativo</h4>
                                            <p className="text-gray-700">
                                                Baixe o app CAIXA Tem ou acesse o site da CAIXA
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            2
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Cadastre-se</h4>
                                            <p className="text-gray-700">
                                                Realize o cadastramento com seus dados pessoais
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            3
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Envie Documentos</h4>
                                            <p className="text-gray-700">
                                                Anexe os documentos necessários para comprovação
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            4
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Aguarde Análise</h4>
                                            <p className="text-gray-700">
                                                A CAIXA analisará o pedido e pode agendar perícia se necessário
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            5
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Receba em Conta</h4>
                                            <p className="text-gray-700">
                                                O pagamento ocorre em Conta Poupança Social Digital CAIXA
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                            6
                                        </div>
                                        <div>
                                            <h4 className="text-gray-900 mb-2">Movimente via App</h4>
                                            <p className="text-gray-700">
                                                Use o CAIXA Tem para consultar e movimentar os valores
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    É importante separar toda a documentação de forma organizada, digitalizar e nomear corretamente cada arquivo.
                                </p>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    <strong>Para garantir a qualidade das fotos, é recomendável usar documentos originais, tirar da capinha e centralizar bem na foto. Além disso, é importante tirar a foto em um local bem iluminado e sem reflexos.</strong>
                                </p>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Para evitar ao deferimento do pedido, é necessário <strong>apresentar esclarecimentos ou documentação complementar, caso solicitado, no prazo de até 90 dias.</strong>
                                </p>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    As empresas de perícia podem analisar os documentos ou agendar uma perícia médica com a vítima, que pode ser realizada por tele chamada, presencialmente ou em domicílio.
                                </p>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    <strong>É fundamental verificar previamente se os arquivos/imagens estão completos, legíveis, sem cortes e sem rasuras, </strong>pois arquivos digitalizados e salvos em PDF, geralmente, apresentam melhor qualidade visual.
                                </p>


                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Prazo para dar entrada na indenização do SPVAT
                                </h2>
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <ul className="text-gray-700 text-sm space-y-1">
                                        <li>• <strong>DAMS:</strong> Até 3 anos, a contar da data do acidente</li>
                                        <li>• <strong>IP:</strong> Até 3 anos, a contar da data do acidente</li>
                                        <li>• <strong>Morte:</strong> Até 3 anos, contados a partir da data do óbito</li>
                                    </ul>
                                </div>

                                {/* Warning Box */}
                                <div className="bg-amber-50 border-l-4 border-amber-500 p-6 my-8 rounded-r-lg">
                                    <h3 className="text-xl text-amber-900 mb-3">
                                        ⏰ Atenção ao Prazo
                                    </h3>
                                    <p className="text-gray-800">
                                        O Seguro DPVAT deve ser solicitado em até 3 anos após o acidente. Não deixe para depois, pois pode perder o direito.
                                    </p>
                                </div>

                                {/* Conclusion */}
                                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                                    Conclusão
                                </h2>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    O Seguro DPVAT é um direito importante para vítimas de acidentes de trânsito. Conhecer seus direitos e reunir a documentação adequada aumenta significativamente as chances de sucesso no pedido.
                                </p>
                                <p className="text-gray-700 leading-relaxed mb-6">
                                    Se você está com dificuldades para obter a indenização ou teve seu pedido negado, considere buscar apoio profissional especializado. Nossa equipe está pronta para ajudar você em todas as etapas do processo.
                                </p>
                            </div>

                            {/* CTA Box */}
                            <div className="bg-gradient-to-br from-blue-900 to-blue-700 text-white p-8 rounded-xl mt-12">
                                <h3 className="text-2xl mb-4">Precisa de Ajuda com seu Seguro DPVAT?</h3>
                                <p className="text-blue-100 mb-6">
                                    Nossa equipe especializada pode orientar você em todo o processo de solicitação da indenização DPVAT, aumentando suas chances de sucesso.
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
                                    MA
                                </div>
                                <div>
                                    <h4 className="text-xl text-gray-900 mb-2">Me Ajuda Dpvat</h4>
                                    <p className="text-gray-600 mb-3">
                                        Fonte: https://meajudadpvat.com.br/quem-tem-direito-dpvat/                  
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
                                    date: "19 de Novembro, 2025",
                                    image: "https://images.unsplash.com/photo-1722336760994-8e33dc1c116a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmFmZmljJTIwYWNjaWRlbnQlMjBsYXd8ZW58MXx8fHwxNzY1OTc5OTY0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
                                    link: '/blog-seguros-parana/inss'
                                },
                                {
                                    title: "Documentos Necessários para Processos",
                                    category: "Documentação",
                                    date: "5 de Dezembro, 2025",
                                    image: "https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsZWdhbCUyMGRvY3VtZW50cyUyMG9mZmljZXxlbnwxfHx8fDE3NjU5ODEwNDd8MA&ixlib=rb-4.1.0&q=80&w=1080",
                                    link: '/blog-seguros-parana/documentacao'
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