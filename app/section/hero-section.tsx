/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Button } from "@/app/_components/ui/button";
import { HeroHeader } from "./hero9-header";
import { ChevronRight } from "lucide-react";
import Image from "next/image";

export default function HeroSection() {
  return (
    <>
      <HeroHeader />
      <main className="overflow-x-hidden">
        <section>
          <div className="py-24 md:pb-32 lg:pb-36 lg:pt-72 relative">
            {/* Caixa escura cobrindo parte da tela */}
            <div className="absolute left-0 top-0 w-[550px] lg:w-[750px] h-full bg-black/80 -z-8" />

            <div className="relative mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12 bottom-16">
              <div className="mx-auto max-w-lg text-center lg:ml-0 lg:max-w-full lg:text-left mb-10">
                <h1 className="mt-8 max-w-2xl text-balance text-5xl md:text-6xl lg:mt-16 xl:text-6xl relative right-24 lg:right-32 text-white">
                  DPVAT Paraná
                </h1>
                <p className="mt-8 max-w-2xl text-balance text-lg relative right-24 lg:right-32 text-white">
                  Receba uma indenização pelas lesões do seu acidente
                </p>

                <div className="mt-12 flex flex-col items-center justify-center gap-2 sm:flex-row lg:justify-start relative right-24 lg:right-32">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 rounded-full pl-5 pr-3 text-base bg-green-500"
                  >
                    <Link href="#link">
                      <span className="text-nowrap">Fale Conosco</span>
                      <ChevronRight className="ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Imagem de fundo com gradiente */}
            <div className="absolute inset-0 -z-10">
              <Image
                src="/car.jpg"
                width={1920}
                height={1080}
                alt="car"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
