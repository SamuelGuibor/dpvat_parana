import { ShieldCheck, HeartHandshake, Award, Users } from "lucide-react";
import Video from 'next-video';
import getStarted from '/videos/video.mp4';

const features = [
  {
    title: "Transparência",
    description: "Clareza em todas as etapas do seu seguro, sem letras miúdas.",
    icon: ShieldCheck,
  },
  {
    title: "Atendimento Humanizado",
    description: "Você fala com pessoas, não com robôs.",
    icon: HeartHandshake,
  },
  {
    title: "Especialistas em Seguros",
    description: "Equipe preparada para indicar a melhor solução para você.",
    icon: Award,
  },
  {
    title: "Confiança e Credibilidade",
    description: "Anos de experiência protegendo o que realmente importa.",
    icon: Users,
  },
];

export default function VideoSection() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto px-6 p-4">

            {/* VIDEO */}
            <div className="w-full aspect-video">
                <div className='w-full max-w-[720px] mx-auto'>
                    <Video src={getStarted} />
                </div>
            </div>

            <div className="space-y-10">
          <div>
            <h2 className="text-3xl font-semibold text-gray-900 mb-3">
              Por que escolher a Paraná Seguros?
            </h2>
            <p className="text-gray-600 max-w-md">
              Mais do que seguros, oferecemos tranquilidade, proximidade e confiança.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {features.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="group bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg  transition">
                    <Icon className="w-6 h-6 text-blue-700" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
    );
}
