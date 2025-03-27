'use client'

import { Check } from "lucide-react";
import { Badge } from "@/app/_components/ui/badge";
import Image from "next/image";

function Feature() {
  return (
    <div className="w-full pt-10">
      <div className="container mx-auto">
        <div className="container p-8 grid grid-cols-1 gap-8 items-center lg:grid-cols-2">
          {/* Left Side: Text Content */}
          <div className="flex gap-10 flex-col">
            <div className="flex gap-4 flex-col">
              <div>
                <Badge variant="outline">Chatbot</Badge>
              </div>
              <div className="flex gap-2 flex-col">
                <h2 className="text-3xl lg:text-5xl tracking-tighter max-w-xl text-left font-regular">
                  Chatbot
                </h2>
                <p className="text-lg leading-relaxed tracking-tight text-muted-foreground max-w-xl text-left">
                  Para automatizar processos e melhorar a eficiência
                </p>
              </div>
            </div>
            <div className="grid lg:pl-6 grid-cols-1 sm:grid-cols-3 items-start lg:grid-cols-1 gap-6">
              <div className="flex flex-row gap-6 items-start">
                <Check className="w-4 h-4 mt-2 text-primary" />
                <div className="flex flex-col gap-1">
                  <p>Fácil de usar</p>
                  <p className="text-muted-foreground text-sm">
                    Desenvolvemos uma solução simples e intuitiva.
                  </p>
                </div>
              </div>
              <div className="flex flex-row gap-6 items-start">
                <Check className="w-4 h-4 mt-2 text-primary" />
                <div className="flex flex-col gap-1">
                  <p>Rápido e confiável</p>
                  <p className="text-muted-foreground text-sm">
                    Respostas instantâneas para atender seus clientes.
                  </p>
                </div>
              </div>
              <div className="flex flex-row gap-6 items-start">
                <Check className="w-4 h-4 mt-2 text-primary" />
                <div className="flex flex-col gap-1">
                  <p>Moderno e eficiente</p>
                  <p className="text-muted-foreground text-sm">
                    Uma ferramenta atual que otimiza o atendimento.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Right Side: Image */}
          <div className="flex justify-center items-center">
            <Image src="/chatbot.jpg" width={600} height={200} alt="robot" />
          </div>
        </div>
      </div>
    </div>
  );
}

export { Feature };