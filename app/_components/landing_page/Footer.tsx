import { Facebook, Instagram, Linkedin } from 'lucide-react';
import Image from 'next/image'
export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div>
                <Image src={'/logo_sem_fundo.png'} height={200} width={200} alt='Logo Parana Seguros' />
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Defendendo os direitos de vítimas de acidentes de trânsito desde 2010.
            </p>
          </div>

          <div>
            <h4 className="text-white mb-4">Serviços</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/#servicos" className="hover:text-blue-400 transition-colors">Seguro DPVAT</a></li>
              <li><a href="/#servicos" className="hover:text-blue-400 transition-colors">Auxílio-Acidente INSS</a></li>
              <li><a href="/#servicos" className="hover:text-blue-400 transition-colors">Danos Materiais</a></li>
              <li><a href="/#servicos" className="hover:text-blue-400 transition-colors">Pensão por Morte</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white mb-4">Institucional</h4>
            <ul className="space-y-2 text-sm">
              {/* <li><a href="#" className="hover:text-blue-400 transition-colors">Sobre Nós</a></li> */}
              <li><a href="/nossa-equipe" className="hover:text-blue-400 transition-colors">Nossa Equipe</a></li>
              <li><a href="/termos-de-uso" className="hover:text-blue-400 transition-colors">Termos de Uso</a></li>
              <li><a href="/politica-privacidade" className="hover:text-blue-400 transition-colors">Política de Privacidade</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white mb-4">Redes Sociais</h4>
            <div className="flex gap-4">
              <a href="#" className="bg-gray-800 p-2 rounded-lg hover:bg-blue-600 transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="bg-gray-800 p-2 rounded-lg hover:bg-blue-600 transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="bg-gray-800 p-2 rounded-lg hover:bg-blue-600 transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 text-sm text-center">
          <p>&copy; 2025 Paraná Seguros. Todos os direitos reservados.</p>
          <p className="mt-2">
            Paraná seguros e previdência
            CNPJ:  59.600.345/0001-29
          </p>
          <p>
            Susep 221140431
            @paranasegurospr
          </p>
          <p className="text-gray-500 mt-2">
            Desenvolvido por: Samuel Henrique Guibor
          </p>
        </div>
      </div>
    </footer>
  );
}
