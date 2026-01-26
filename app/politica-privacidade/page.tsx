import {
  ShieldCheck,
  Database,
  Lock,
  Users,
  Cookie,
  FileText,
  Scale,
  Mail
} from 'lucide-react';
import { Header } from '../_components/landing_page/Header';
import { Footer } from '../_components/landing_page/Footer';

export default function PrivacyPolicy() {
  return (
    <>
      <Header />

      <div className="min-h-screen bg-gray-50">
        {/* HERO */}
        <div className="bg-gradient-to-br from-black to-black text-white py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="w-12 h-12" />
              <h1 className="text-4xl lg:text-5xl">Política de Privacidade</h1>
            </div>
            <p className="text-xl text-blue-100">
              Válida a partir de Dezembro de 2025
            </p>
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="bg-white rounded-lg shadow-md p-8 prose max-w-none">

            <p className="text-lg text-gray-700 font-semibold">
              POLÍTICA DE PRIVACIDADE — PARANÁ CONSULTORIA EM SEGUROS
            </p>

            <p>
              A <strong>PARANÁ CONSULTORIA EM SEGUROS</strong>,
              pessoa jurídica de direito privado, leva a sua privacidade a sério
              e se compromete com a transparência no tratamento de dados pessoais
              dos usuários do site <strong>https://segurosparana.com.br</strong>.
            </p>

            <p className="text-red-600 font-semibold uppercase">
              Ao utilizar este website, você concorda com esta Política de Privacidade.
            </p>
            <br />
            {/* SEÇÃO 1 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Users className="text-blue-600" />
                </div>
                <h2 className="text-2xl">1. Usuários</h2>
              </div>
              <p>
                Esta Política se aplica a todos os usuários que acessam ou utilizam
                as funcionalidades do website.
              </p>
            </section>
            <br />

            {/* SEÇÃO 2 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Database className="text-blue-600" />
                </div>
                <h2 className="text-2xl">2. Dados Coletados</h2>
              </div>
              <ul>
                <li>Dados de identificação (nome, e-mail, telefone);</li>
                <li>Dados de navegação (IP, data e hora, dispositivo);</li>
                <li>Dados fornecidos voluntariamente em formulários.</li>
              </ul>
            </section>
            <br />
            

            {/* SEÇÃO 3 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <FileText className="text-blue-600" />
                </div>
                <h2 className="text-2xl">3. Finalidade do Tratamento</h2>
              </div>
              <p>Os dados pessoais são tratados para:</p>
              <ul>
                <li>Prestar serviços e responder solicitações;</li>
                <li>Melhorar a experiência do usuário;</li>
                <li>Cumprir obrigações legais e regulatórias.</li>
              </ul>
            </section>
            <br />

            {/* SEÇÃO 4 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Scale className="text-blue-600" />
                </div>
                <h2 className="text-2xl">4. Base Legal</h2>
              </div>
              <p>
                O tratamento de dados ocorre com base no consentimento do titular,
                cumprimento de obrigação legal ou legítimo interesse, conforme
                a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
              </p>
            </section>
            <br />

            {/* SEÇÃO 5 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Lock className="text-blue-600" />
                </div>
                <h2 className="text-2xl">5. Segurança dos Dados</h2>
              </div>
              <p>
                Adotamos medidas técnicas e organizacionais para proteger os dados
                pessoais contra acessos não autorizados, vazamentos ou perdas.
              </p>
            </section>
            <br />

            {/* SEÇÃO 6 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Cookie className="text-blue-600" />
                </div>
                <h2 className="text-2xl">6. Cookies</h2>
              </div>
              <p>
                Utilizamos cookies para melhorar o desempenho e a experiência
                de navegação. O usuário pode desativá-los no navegador.
              </p>
            </section>
            <br />
            {/* SEÇÃO 7 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <ShieldCheck className="text-blue-600" />
                </div>
                <h2 className="text-2xl">7. Direitos do Titular</h2>
              </div>
              <ul>
                <li>Confirmação e acesso aos dados;</li>
                <li>Correção de dados incompletos ou desatualizados;</li>
                <li>Exclusão ou anonimização;</li>
                <li>Revogação do consentimento.</li>
              </ul>
            </section>
            <br />
            {/* SEÇÃO 8 */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Scale className="text-blue-600" />
                </div>
                <h2 className="text-2xl">8. Alterações</h2>
              </div>
              <p>
                Esta Política pode ser atualizada a qualquer momento, sendo
                recomendada a consulta periódica.
              </p>
            </section>
            <br />
            {/* CONTATO */}
            <section className="bg-blue-50 p-6 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="text-blue-700" />
                <h2 className="text-2xl">9. Contato</h2>
              </div>
              <p>
                Para exercer seus direitos ou tirar dúvidas:
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
