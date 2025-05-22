"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/_components/ui/button";
import { HeroHeader } from "./hero9-header";
import { ChevronRight } from "lucide-react";

export default function HeroSection() {
  const [scrollProgress, setScrollProgress] = useState(0);

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

  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden">
        <section className="relative h-screen flex items-center">
          <div
            id="parallax-background"
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage: "url('/moto.jpg')",
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
                    className="w-[250px] h-12 rounded-full pl-5 pr-3 text-base bg-[#6d997a]  hover:bg-slate-200"
                  >
                    <Link href="#link">
                      <span className="text-black">Fale Conosco</span>
                      <ChevronRight className="ml-1 text-black" />
                    </Link>
                  </Button>
                  <span className="text-gray-300 lg:pl-[100px] relative">
                    Ou
                  </span>
                  <Button
                    asChild
                    size="lg"
                    className="w-[250px] h-12 rounded-full pl-5 pr-3 text-base bg-[#84abaa] hover:bg-slate-200"
                  >
                    <Link href="/login">
                      <span className="text-black">Consulte seu processo</span>
                      <ChevronRight className="ml-1 text-black" />
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