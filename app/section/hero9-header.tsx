"use client";
import Link from "next/link";
import { LogOutIcon, Menu, X } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import React from "react";
import { useScroll, motion } from "framer-motion";
import { cn } from "../_lib/utils";
import Image from "next/image";
import { FaFacebook, FaInstagram } from "react-icons/fa";
import { Avatar, AvatarImage } from "../_components/ui/avatar";
import { signOut, useSession } from "next-auth/react";

const menuItems = [
  { name: "Inicio", href: "#link" },
  { name: "Sobre", href: "#link" },
  { name: "Duvidas Frequentes", href: "#link" },
];

export const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const { scrollYProgress } = useScroll();
  const { data: session } = useSession();
  const handleLogoutClick = () => signOut();

  // Monitora o scroll para o estado "scrolled"
  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      setScrolled(latest > 0.05);
    });
    return () => unsubscribe();
  }, [scrollYProgress]);

  // Função para abrir/fechar o sheet
  const toggleSheet = () => {
    setSheetOpen((prev) => !prev);
  };

  return (
    <header className="relative">
      <nav
        data-state={menuState && "active"}
        className="fixed z-20 w-full pt-2"
      >
        <div
          className={cn(
            "mx-auto max-w-7xl rounded-3xl px-6 transition-all duration-300 lg:px-12",
            scrolled && "bg-background/50 backdrop-blur-2xl"
          )}
        >
          <motion.div
            key={1}
            className={cn(
              "relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6",
              scrolled && "lg:py-4"
            )}
          >
            <div className="flex w-full items-center justify-between gap-12 lg:gap-80 lg:w-auto">
              <Link
                href="/"
                aria-label="home"
                className="flex items-center space-x-2"
              >
                <Image
                  src={scrolled ? "/logo.png" : "/logo_text_white.png"}
                  height={20}
                  width={140}
                  alt="DPVAT Paraná"
                />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? "Close Menu" : "Open Menu"}
                className={`${scrolled ? "text-black" : "text-white"} relative z-20 -m-2.5 -mr-4 block p-2.5 lg:hidden`}
              >
                <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>

              <div className="hidden lg:block">
                <ul className="flex gap-8 text-md">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-accent-foreground block duration-150"
                      >
                        <span className={scrolled ? "text-black" : "text-white"}>
                          {item.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div
              className={cn(
                "bg-background mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent",
                menuState && "block"
              )}
            >
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-accent-foreground block duration-150"
                      >
                        <span className="text-[20px]">{item.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit justify-center items-center">
                <div className="relative flex gap-4">
                  <Link
                    href="https://www.facebook.com/paranadpvat/"
                    aria-label="Veja nosso Facebook"
                  >
                    <FaFacebook
                      size={30}
                      className={scrolled ? "text-black" : "lg:text-white text-black"}
                    />
                  </Link>
                  <Link
                    href="https://www.instagram.com/paranadpvat/"
                    aria-label="Veja nosso Instagram"
                  >
                    <FaInstagram
                      size={30}
                      className={scrolled ? "text-black" : "lg:text-white text-black"}
                    />
                  </Link>
                </div>
                {!session?.user ? (
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/login">
                        <span>Login</span>
                      </Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href="/login">
                        <span>Sign Up</span>
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Avatar onClick={toggleSheet} className="cursor-pointer">
                    <AvatarImage
                      src={session?.user?.image || "https://i.pravatar.cc/300"}
                      alt="Avatar"
                    />
                  </Avatar>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </nav>

      {/* Sheet movido para fora da div que usa o scrolled */}
      {session?.user && sheetOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSheetOpen(false)}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: sheetOpen ? "0%" : "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-screen w-80 bg-white shadow-xl p-6 z-50"
          >
            <h2 className="text-lg font-bold">Meu Sheet</h2>
            <p>Conteúdo do sheet aqui...</p>
            <Button onClick={() => setSheetOpen(false)} className="mt-4">
              Fechar
            </Button>
            <div className="flex flex-col gap-2 py-5">
              <Button
                variant="ghost"
                className="justify-start gap-2"
                onClick={handleLogoutClick}
              >
                <LogOutIcon size={18} />
                Sair da Conta
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </header>
  );
};