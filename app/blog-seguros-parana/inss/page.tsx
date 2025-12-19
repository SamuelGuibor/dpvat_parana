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
              <span className="text-gray-600">INSS</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900">Auxílio-Acidente</span>
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
                src="https://images.unsplash.com/photo-1722336760994-8e33dc1c116a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmFmZmljJTIwYWNjaWRlbnQlMjBsYXd8ZW58MXx8fHwxNzY1OTc5OTY0fDA&ixlib=rb-4.1.0&q=80&w=1080"
                alt="Auxílio-Acidente do INSS"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-8 lg:p-12">
              {/* Category Badge */}
              <div className="flex items-center gap-3 mb-6">
                <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  INSS
                </span>
              </div>

              {/* Title */}
              <h1 className="text-4xl lg:text-5xl text-gray-900 mb-6">
                Auxílio-acidente: como solicitar e regras atualizadas
              </h1>

              {/* Meta Information */}
              <div className="flex flex-wrap items-center gap-6 text-gray-600 mb-8 pb-8 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  <span>Dr. Hilário Bocchi Neto</span>
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
                O auxílio-acidente é um benefício do INSS para trabalhadores que sofreram acidentes
                e que, em razão disso, ficaram com sequelas que reduzem sua capacidade de trabalho.
              </p>

              <p className="text-xl text-gray-700 leading-relaxed mb-8">
                Se você já sofreu algum tipo de acidente e está em dúvida sobre como funciona ou
                deseja entender melhor as regras atualizadas sobre esse benefício, continue lendo
                para conhecer todos os seus direitos.
              </p>
              {/* Article Content */}
              <div className="prose prose-lg max-w-none">


                {/* Section 1 */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Como funciona o auxílio-acidente
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  O Auxílio-acidente INSS funciona como uma compensação financeira para o segurado pela redução de sua capacidade de trabalhar devido a um acidente, seja de trabalho ou não.
                </p>
                <ul className="list-disc mb-10 pl-10 text-gray-900 leading-relaxed mx-auto">
                  <li>
                    Diferentemente do auxílio-doença (benefício por incapacidade temporária), que tem duração limitada, o auxílio-acidente é contínuo e geralmente cessa apenas com a aposentadoria do trabalhador.
                  </li>
                  <li>
                    Ele se distingue também da aposentadoria por invalidez (benefício por incapacidade permanente), pois quem recebe auxílio-acidente pode seguir trabalhando e auferindo salário.
                  </li>
                </ul>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Assim sendo, o auxílio-acidente funciona como uma espécie de indenização mensal paga pelo INSS ao trabalhador que tenha sofrido acidente que deixa sequelas definitivas que reduzem sua capacidade de exercer alguma atividade.
                </p>

                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Quais são os requisitos do auxílio-acidente?
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Para solicitar o auxílio-acidente, o trabalhador deve atender a alguns requisitos:
                </p>
                <ul className="list-disc mb-10 pl-10 text-gray-900 leading-relaxed mx-auto">
                  <li>
                    <strong>Ter sofrido um acidente:</strong> pode ser qualquer tipo de acidente, não é necessário que seja um acidente do trabalho
                  </li>
                  <li>
                    <strong>Ficar com sequelas</strong> que dificultam ou reduzem a capacidade de trabalho
                  </li>
                  <li>
                    <strong>Ter qualidade de segurado no momento do acidente:</strong> estar contribuindo com o INSS ou estar no período de graça
                  </li>
                </ul>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Atenção: para ter direito ao auxílio-acidente não é preciso ter um número mínimo de contribuições (não exige carência).
                </p>
                {/* Highlight Box */}
                <div className="bg-blue-50 border-l-4 border-blue-600 p-6 my-8 rounded-r-lg">
                  <h3 className="text-xl text-blue-900 mb-3">
                    ⚠️ Exemplo
                  </h3>
                  <p className="text-gray-800">
                    Lucca trabalha como empregado, com carteira assinada, em uma fábrica de móveis.
                    Ele sofreu um acidente de trânsito no final de semana, quando estava de folga do trabalho e acabou tendo a mão amputada.
                  </p>
                  <br />
                  <p className="text-gray-800">
                    Lucca ficou afastado do trabalho, devido ao acidente, recebendo auxílio-doença (benefício por incapacidade temporária) até que tivesse condições de retornar ao trabalho.
                  </p>
                  <br />
                  <p className="text-gray-800">
                    Após a cessação do benefício por incapacidade temporária, Lucca retornou ao trabalho e poderá receber o auxílio-acidente, pois, em razão do acidente, ele ficou com uma sequela definitiva, que diminuiu sua capacidade para o trabalho.
                  </p>
                  <br />
                  <p className="text-gray-800">
                    Repare que o auxílio-acidente é um benefício indenizatório, que tem por objetivo “compensar” a redução da capacidade para o trabalho.
                  </p>
                  <br />
                  <p className="text-gray-800">
                    Assim sendo, Lucca pode voltar ao trabalho e, ao mesmo tempo, receber uma indenização mensal em razão de suas limitações.
                  </p>
                  <br />
                </div>

                {/* Section 2 */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Quem tem direito ao Auxílio-Acidente?
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Têm direito ao auxílio-acidente os segurados que preencham os seguintes requisitos:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                  <li>
                    <strong>Empregado (celetista)</strong>
                  </li>
                  <li>
                    <strong>Trabalhador rural e segurado especial</strong>
                  </li>
                  <li>
                    <strong>Empregada doméstica</strong>
                  </li>
                  <li>
                    <strong>Trabalhador avulso</strong>
                  </li>
                </ul>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Auxílio acidente quem NÃO tem direito:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                  <li>
                    <strong>Contribuintes individuais</strong>
                  </li>
                  <li>
                    <strong>MEI (Microempreendedor individual)</strong>
                  </li>
                  <li>
                    <strong>Segurados facultativos</strong>
                  </li>
                </ul>

                {/* Section 3 */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Qual o valor do benefício?
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  O valor do auxílio-acidente corresponde a 50% do salário de benefício, que é calculado com base na média das contribuições do trabalhador ao INSS.
                </p>

                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                  <li>
                    <strong>Determine o salário de benefício: Some todos os salários do trabalhador desde julho de 1994 e divida pelo número de meses utilizados para o cálculo.</strong>
                  </li>
                  <li>
                    <strong>Calcule 50% do salário de benefício: O valor final do auxílio-acidente será a metade do salário de benefício calculado.</strong>
                  </li>
                </ul>

                {/* Table */}
                <div className="overflow-x-auto my-8">
                  <table className="w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                    <thead className="bg-blue-600 text-white">
                      <tr>
                        <th className="px-6 py-4 text-left">Média</th>
                        <th className="px-6 py-4 text-left">Percentual</th>
                        <th className="px-6 py-4 text-left">Base de Cálculo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-900">Um trabalhador com média de salários de R$ 3.000,00</td>
                        <td className="px-6 py-4 text-gray-700">50% de R$ 3.000,00 = R$ 1.500,00</td>
                        <td className="px-6 py-4 text-gray-700">Auxílio acidente valor: R$ 1.500,00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Quem recebe auxílio-acidente recebe décimo terceiro?
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  O auxílio-acidente não tem pagamento de décimo terceiro, isso porque o benefício tem caráter indenizatório.
                </p>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Diferente do auxílio-doença ou qualquer tipo de aposentadoria, quem têm décimo terceiro salário por se tratarem de benefícios que têm a natureza de serem substitutos da renda (salarial).
                </p>
                {/* Section 4 */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Documentos Necessários
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Para solicitar o auxílio-acidente, você precisará reunir a seguinte documentação:
                </p>

                {/* Document List with Icons */}
                <div className="grid md:grid-cols-2 gap-4 my-8">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-gray-900 mb-2">📄 Documentos Pessoais</h4>
                    <ul className="text-gray-700 text-sm space-y-1">
                      <li>• RG e CPF</li>
                      <li>• Comprovante de residência</li>
                      <li>• Carteira de trabalho</li>
                    </ul>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-gray-900 mb-2">🏥 Documentos Médicos</h4>
                    <ul className="text-gray-700 text-sm space-y-1">
                      <li>• Laudos e exames médicos</li>
                      <li>• Receitas</li>
                      <li>• Atestados que comprovem as sequelas do acidente.</li>
                    </ul>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-gray-900 mb-2">🚗 Documentos do Acidente</h4>
                    <ul className="text-gray-700 text-sm space-y-1">
                      <li>• Se o acidente ocorreu no trabalho (auxílio acidente de trabalho)</li>
                      <li>• CAT (se acidente de trabalho)</li>
                      <li>• Testemunhas (se houver)</li>
                    </ul>
                  </div>
                </div>

                {/* Section 5 */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Como Solicitar o Benefício
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  O processo de solicitação do auxílio-acidente pode ser feito pelo telefone 135, seguindo os seguintes passos:
                </p>

                {/* Steps */}
                <div className="space-y-6 my-8">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      1
                    </div>
                    <div>
                      <h4 className="text-gray-900 mb-2">Ligue para a Central</h4>
                      <p className="text-gray-700">
                        Ligue para a Central de Atendimento do INSS pelo número 135
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      2
                    </div>
                    <div>
                      <h4 className="text-gray-900 mb-2">Selecione o serviço</h4>
                      <p className="text-gray-700">
                        Quando solicitado, digite pausadamente o número do seu CPF
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      3
                    </div>
                    <div>
                      <h4 className="text-gray-900 mb-2">Anote o Protocolo</h4>
                      <p className="text-gray-700">
                        Anote o número do seu protocolo de atendimento que será ditado
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      4
                    </div>
                    <div>
                      <h4 className="text-gray-900 mb-2">Digite 0</h4>
                      <p className="text-gray-700">
                        Depois aguarde na Linha e quando solicitado, digite o número 0 (zero) para falar com um atendente
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      5
                    </div>
                    <div>
                      <h4 className="text-gray-900 mb-2">Solicite o Pedido</h4>
                      <p className="text-gray-700">
                        Pronto, agora basta explicar para o atendente que quer fazer o pedido de auxílio-acidente.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      6
                    </div>
                    <div>
                      <h4 className="text-gray-900 mb-2">Comparecer a Agência</h4>
                      <p className="text-gray-700">
                        No dia e hora marcados, compareça à agência do INSS, levando seus documentos de identificação e todos os documentos médicos (atestado, laudo ou relatório) e exames originais.
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-6">
                    Você pode acompanhar o andamento do seu pedido de auxílio-acidente pelo site ou aplicativo Meu INSS na opção “Consultar pedidos” ou pelo telefone 135.
                  </p>
                  <p className="text-gray-700 leading-relaxed mb-6">
                    <strong>Atenção:</strong> Não existe a opção específica de requerimento de auxílio-acidente pelo Meu INSS, mas algumas pessoas agendam a perícia como se fosse benefício por incapacidade.
                  </p>
                </div>

                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Quem recebe auxílio-acidente passa por perícia?
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Sim, é necessário passar por perícia médica no INSS para o perito médico avaliar se de fato o trabalhador tem direito ao auxílio-acidente, ou seja, se tem uma limitação definitiva para o trabalho em razão de acidente.
                </p>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <ul className="text-gray-700 text-sm space-y-1">
                    <li>• O andamento da solicitação e o resultado da perícia podem ser acompanhados pelo Meu INSS, em “Consultar Pedidos”.</li>
                    <li>• Se o pedido for negado é possível solicitar uma nova perícia na Justiça.</li>
                    <li>• <strong>Pente fino do INSS no Auxílio-acidente</strong> <br />
                      Quem recebe auxílio-acidente pode passar pelo pente-fino do INSS, ou seja, ser chamado pelo INSS para uma nova perícia e reavaliação das suas limitações.Uma Lei de 2022 autorizou essa reavaliação.
                      <br />
                      <strong>Mas atenção:</strong> quem já recebe o Auxílio-acidente há mais de 10 anos está isento do pente fino.</li>
                  </ul>
                </div>

                {/* Warning Box */}
                <div className="bg-amber-50 border-l-4 border-amber-500 p-6 my-8 rounded-r-lg">
                  <h3 className="text-xl text-amber-900 mb-3">
                    ⏰ Atenção ao Prazo
                  </h3>
                  <p className="text-gray-800">
                    O auxílio-acidente deve ser solicitado logo após a alta do auxílio-doença (quando houver) ou após a consolidação das lesões. Não deixe para depois, pois os valores atrasados podem ser limitados.
                  </p>
                </div>

                {/* Section 6 */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Benefício Negado? Saiba o que fazer
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Se o seu pedido de auxílio-acidente foi negado pelo INSS, não desista. Você tem direito a recorrer da decisão através de:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-3 text-gray-700">
                  <li>
                    <strong>Recurso Administrativo:</strong> Apresentado dentro de 30 dias após a negativa, sem necessidade de advogado
                  </li>
                  <li>
                    <strong>Ação Judicial:</strong> Se o recurso administrativo também for negado, é possível entrar com ação na Justiça Federal
                  </li>
                  <li>
                    <strong>Nova Perícia:</strong> Em juízo, você terá direito a uma nova perícia médica, desta vez realizada por perito nomeado pelo juiz
                  </li>
                </ul>

                {/* Conclusion */}
                <h2 className="text-3xl text-gray-900 mt-12 mb-6">
                  Conclusão
                </h2>
                <p className="text-gray-700 leading-relaxed mb-6">
                  O auxílio-acidente é um direito importante para trabalhadores que sofreram acidentes e ficaram com sequelas permanentes. Conhecer seus direitos e reunir a documentação adequada aumenta significativamente as chances de sucesso no pedido.
                </p>
                <p className="text-gray-700 leading-relaxed mb-6">
                  Se você está com dificuldades para obter o benefício ou teve seu pedido negado, considere buscar apoio profissional especializado. Nossa equipe está pronta para ajudar você em todas as etapas do processo.
                </p>
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
                  HB
                </div>
                <div>
                  <h4 className="text-xl text-gray-900 mb-2">Hilário Bocchi Neto (Tico)</h4>
                  <p className="text-gray-600 mb-3">
                    OAB/SP 331.392 – Advogado e Jornalista especialista em Previdência. Gestor pela USP e pela PUC. Autor do Livro Manual do Advogado Previdenciário. Adora estudar e ficar com a família.                  </p>
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
                  title: "Como Funciona o Seguro DPVAT em 2025",
                  category: "DPVAT",
                  date: "15 de Dezembro, 2025",
                  image: "https://images.unsplash.com/photo-1637763723578-79a4ca9225f7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBhY2NpZGVudCUyMGluc3VyYW5jZXxlbnwxfHx8fDE3NjU4OTY4OTd8MA&ixlib=rb-4.1.0&q=80&w=1080",
                  link: '/blog-seguros-parana/dpvat'
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