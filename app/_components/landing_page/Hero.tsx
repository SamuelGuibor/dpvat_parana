'use client'
import { ArrowRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Image from "next/image";
import mixpanel from "@/app/_lib/mixpanel";
import { useEffect } from 'react';

export function Hero() {
    const { data: session } = useSession(); // Obter dados da sessão
    
    const consultProcessUrl = session?.user ? "/area-do-cliente" : "/login";
    useEffect(() => {
      if (!session?.user?.id) return;

      mixpanel.identify(session.user.id);

      mixpanel.people.set({
        $name: session.user.name,
        $email: session.user.email,
      });
    }, [session]);

  return (
    <section id="inicio" className="relative bg-gradient-to-br from-blue-900 to-blue-900 text-white">
      <div className="absolute inset-0 bg-black/20"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl lg:text-5xl mb-6">
              Receba a Indenização que Você Merece
            </h2>
            <p className="text-xl mb-8 text-blue-100">
              Especialistas em DPVAT, Auxílio-Acidente INSS e recuperação de danos causados por acidentes de trânsito. Sua justiça é nossa missão.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href={consultProcessUrl} className="bg-white text-blue-900 px-8 py-4 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                Consulte seu Processo
                <ArrowRight className="w-5 h-5" />
              </a>
              <a href="#servicos" className="border-2 border-white text-white px-8 py-4 rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center">
                Nossos Serviços
              </a>
            </div>
          </div>
          <div className="hidden lg:block">
            <Image src='/clientes.png' width={700} height={200} alt='' className='rounded-xl'/>
            {/* <ImageWithFallback 
              src="https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsZWdhbCUyMGNvbnN1bHRhdGlvbiUyMG9mZmljZXxlbnwxfHx8fDE3NjU5Nzk5NjR8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt="Consultoria jurídica"
              className="rounded-lg shadow-2xl"
            /> */}
          </div>
        </div>
      </div>
    </section>
  );
}


