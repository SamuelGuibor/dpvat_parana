import {
  FileCheck,
  Scale,
  AlertCircle,
  Users,
  Ban,
  Gavel,
  Cookie,
  Link as LinkIcon,
  Lock
} from 'lucide-react';
import { Header } from '../_components/landing_page/Header';
import { Footer } from '../_components/landing_page/Footer';

export default function TermsOfUse() {
  return (
    <>
      <Header />

      <div className="min-h-screen bg-gray-50">
        {/* HERO */}
        <div className="bg-gradient-to-br from-black to-black text-white py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-4">
              <FileCheck className="w-12 h-12" />
              <h1 className="text-4xl lg:text-5xl">Termos de Uso</h1>
            </div>
            <p className="text-xl text-blue-100">
              Válidos a partir de Dezembro de 2025
            </p>
          </div>
        </div>
        {/* CONTEÚDO */}
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="bg-white rounded-lg shadow-md p-8 prose max-w-none">

            <p className="text-lg text-gray-700">
              <strong>TERMOS DE USO — KARINA DIAS CAMARGO PREPARAÇÃO DE DOCUMENTOS LTDA</strong>
            </p>

            <p>
              KARINA DIAS CAMARGO PREPARAÇÃO DE DOCUMENTOS LTDA, pessoa jurídica
              de direito privado, descreve neste documento as regras de uso do
              site <strong>https://segurosparana.com.br</strong> e quaisquer outros
              sites, lojas ou aplicativos operados pelo proprietário.
            </p>

            <p className="font-semibold uppercase text-red-600">
              Ao navegar neste website, consideramos que você está de acordo com
              estes Termos de Uso.
            </p>
            <br />


            {/* SEÇÃO 1 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Users className="text-blue-600" />
                </div>
                <h2 className="text-2xl">1. Usuário</h2>
              </div>
              <p>
                A utilização deste website atribui automaticamente a condição de
                Usuário e implica a plena aceitação de todas as diretrizes destes Termos.
              </p>
            </section>
            <br />

            {/* SEÇÃO 2 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Scale className="text-blue-600" />
                </div>
                <h2 className="text-2xl">2. Adesão à Política de Privacidade</h2>
              </div>
              <p>
                A utilização deste website implica adesão integral aos presentes
                Termos de Uso e à versão mais atualizada da Política de Privacidade.
              </p>
            </section>
            <br />

            {/* SEÇÃO 3 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <FileCheck className="text-blue-600" />
                </div>
                <h2 className="text-2xl">3. Condições de Acesso</h2>
              </div>
              <ul>
                <li>Acesso gratuito, salvo áreas que exijam cadastro;</li>
                <li>Usuário deve fornecer informações verdadeiras;</li>
                <li>Login e senha são pessoais e intransferíveis;</li>
                <li>É proibida a publicação de conteúdo ilícito ou ofensivo.</li>
              </ul>

              <p>
                Qualquer conteúdo publicado concede licença não exclusiva,
                irrevogável e irretratável para uso pela empresa.
              </p>
            </section>
            <br />

            {/* SEÇÃO 4 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Cookie className="text-blue-600" />
                </div>
                <h2 className="text-2xl">4. Cookies</h2>
              </div>
              <p>
                Utilizamos cookies para melhorar a navegação, personalizar
                experiências e coletar dados estatísticos.
              </p>
              <p className="text-sm text-gray-600">
                A desativação de cookies pode impactar funcionalidades do site.
              </p>
            </section>
            <br />

            {/* SEÇÃO 5 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Lock className="text-blue-600" />
                </div>
                <h2 className="text-2xl">5. Propriedade Intelectual</h2>
              </div>
              <p>
                Todos os elementos do website são protegidos por direitos de
                propriedade intelectual. Nenhuma licença é concedida ao usuário.
              </p>
            </section>
            <br />

            {/* SEÇÃO 6 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <LinkIcon className="text-blue-600" />
                </div>
                <h2 className="text-2xl">6. Links para Terceiros</h2>
              </div>
              <p>
                Não nos responsabilizamos por políticas, práticas ou conteúdos
                de sites de terceiros acessados por links externos.
              </p>
            </section>
            <br />

            {/* SEÇÃO 7 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <AlertCircle className="text-blue-600" />
                </div>
                <h2 className="text-2xl">7. Prazos e Alterações</h2>
              </div>
              <p>
                O website possui prazo indeterminado e pode ser suspenso ou
                encerrado a qualquer momento, sem aviso prévio.
              </p>
            </section>
            <br />

            {/* SEÇÃO 8 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Scale className="text-blue-600" />
                </div>
                <h2 className="text-2xl">8. Dados Pessoais</h2>
              </div>
              <p>
                O tratamento de dados pessoais segue o disposto na Política de Privacidade.
              </p>
            </section>
            <br />

            {/* CONTATO */}
            <section className="bg-blue-50 p-6 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="text-blue-700" />
                <h2 className="text-2xl">9. Contato</h2>
              </div>
              <p>
                Dúvidas sobre os Termos de Uso:
              </p>
              <p>
                <strong>E-mail:</strong> <span className='text-[13px] lg:text-[16px]'>politica.privacidade@dpvatparana.com.br</span>
              </p>
            </section>
            <br />

          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
