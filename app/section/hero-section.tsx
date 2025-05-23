"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/_components/ui/button";
import { HeroHeader } from "./hero9-header";
import { ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react"; // Importar useSession

export default function HeroSection() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const { data: session } = useSession(); // Obter dados da sessão

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = window.innerHeight;
      const progress = Math.min(scrollY / maxScroll, 1);
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const phoneNumber = "5541997862323";
  const message = "Olá! Quero saber mais sobre as indenizações que tenho direito a receber!";
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
  
  // Determinar o destino do botão com base na sessão
  const consultProcessUrl = session?.user ? "/area-do-cliente" : "/login";

  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden">
        <section className="relative h-screen flex items-center">
          <div
            id="parallax-background"
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage: "url('/imagemm.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              height: "100%",
              transform: `translateY(${scrollProgress * 250}px)`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />
          </div>

          <div
            className="py-24 md:pb-32 lg:pb-36 lg:pt-72 relative h-full transition-transform duration-500 ease-out"
            style={{
              transform: `translateX(-${scrollProgress * 100}%)`,
              opacity: 1 - scrollProgress,
            }}
          >
            <div className="absolute left-0 top-0 w-[550px] lg:max-w-4xl h-full bg-black/80 -z-8" />
            <div className="relative mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12 top-28 lg:top-[-80px]">
              <div className="mx-auto max-w-lg text-center lg:ml-0 lg:max-w-full lg:text-left mb-10">
                <h1 className="mt-8 max-w-2xl text-balance text-5xl md:text-6xl lg:mt-16 xl:text-6xl text-white">
                  Paraná Seguros
                </h1>
                <p className="mt-8 max-w-2xl text-balance text-lg relative text-white">
                  Receba uma indenização pelas lesões do seu acidente
                </p>

                <div className="mt-12 flex flex-col items-center justify-center gap-4 lg:items-start">
                  <Button
                    asChild
                    size="lg"
                    className="w-[250px] h-12 pl-5 pr-3 text-base bg-[#2e5e3d] hover:bg-[#3c694a]"
                  >
                    <Link href={whatsappUrl}>
                      <span className="text-white text-[17px]">Receba Sua Indenização</span>
                      <ChevronRight className="ml-1 text-white" />
                    </Link>
                  </Button>
                  <span className="text-gray-300 lg:pl-[100px] relative">
                    Ou
                  </span>
                  <Button
                    asChild
                    size="lg"
                    className="w-[250px] h-12 pl-5 pr-3 text-base bg-red-600 hover:bg-red-500"
                  >
                    <Link href={consultProcessUrl}>
                      <span className="text-white text-[17px]">Consulte seu Processo</span>
                      <ChevronRight className="ml-1 text-white" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}