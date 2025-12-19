import { Car, ShieldCheck, FileText, Users } from 'lucide-react';

const services = [
  {
    icon: Car,
    title: 'Seguro DPVAT',
    description: 'Assessoria completa para obtenção de indenização do seguro obrigatório para vítimas de acidentes de trânsito.',
  },
  {
    icon: ShieldCheck,
    title: 'Auxílio-Acidente INSS',
    description: 'Ajudamos você a conseguir o benefício do INSS para sequelas permanentes causadas por acidentes.',
  },
  {
    icon: FileText,
    title: 'Danos Materiais e Morais',
    description: 'Recuperação de valores por danos ao veículo, despesas médicas e sofrimento causado pelo acidente.',
  },
  {
    icon: Users,
    title: 'Pensão por Morte',
    description: 'Assistência jurídica para familiares de vítimas fatais de acidentes de trânsito.',
  },
];

export function Services() {
  return (
    <section id="servicos" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl text-gray-900 mb-4">
            Nossos Serviços
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Oferecemos suporte completo em todas as etapas do processo de indenização
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow">
                <div className="bg-blue-100 w-14 h-14 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl text-gray-900 mb-3">{service.title}</h3>
                <p className="text-gray-600">{service.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
