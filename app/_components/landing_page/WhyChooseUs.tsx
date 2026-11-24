import { ShieldCheck, HeartHandshake, Award, Users } from "lucide-react";

const features = [
  {
    title: "Transparência",
    description: "Clareza em todas as etapas do seu processo, sem letras miúdas.",
    icon: ShieldCheck,
  },
  {
    title: "Atendimento Humanizado",
    description: "Você fala com pessoas, não com robôs.",
    icon: HeartHandshake,
  },
  {
    title: "Especialistas em Benefícios e Indenizações",
    description: "Equipe preparada para indicar a melhor solução para você.",
    icon: Award,
  },
  {
    title: "Confiança e Credibilidade",
    description: "Mais de 15 anos de experiência protegendo o que realmente importa.",
    icon: Users,
  },
];

// O vídeo que dividia esta seção subiu para o hero; aqui ficam só os
// diferenciais, centralizados.
export function WhyChooseUs() {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-semibold text-gray-900 mb-3">
            Por que escolher a Brasil Benefícios e Indenizações?
          </h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Mais do que um processo, oferecemos tranquilidade, proximidade e confiança.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {features.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-blue-50 shrink-0">
                  <Icon className="w-6 h-6 text-blue-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
