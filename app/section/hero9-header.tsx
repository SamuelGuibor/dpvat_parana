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
import { AiOutlineCar } from "react-icons/ai";
import { RxAvatar } from "react-icons/rx";
import { IoDocumentsOutline } from "react-icons/io5";
import { GoGear } from "react-icons/go";
import { MdInsertChartOutlined } from "react-icons/md";
import { HiOutlineChatAlt2 } from "react-icons/hi";



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

            </div>
            <div
              className={cn(
                "bg-background mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent",
                menuState && "block"
              )}
            >
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit justify-center items-center">
                <div className="relative flex gap-4">
                  <Link
                    href="https://www.facebook.com/paranadpvat/"
                    aria-label="Veja nosso Facebook"
                  >
                    <FaFacebook
                      size={35}
                      className={scrolled ? "text-black" : "lg:text-white text-black"}
                    />
                  </Link>
                  <Link
                    href="https://www.instagram.com/paranadpvat/"
                    aria-label="Veja nosso Instagram"
                  >
                    <FaInstagram
                      size={35}
                      className={scrolled ? "text-black" : "lg:text-white text-black"}
                    />
                  </Link>
                </div>
                {!session?.user ? (
                  <>
                    <Button variant={scrolled ? "default" : "outline"} asChild size="sm">
                      <Link href="/login">
                        <span>Login</span>
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
            className="fixed right-0 top-0 h-screen w-80 bg-white shadow-xl p-6 z-50 flex flex-col justify-between"
          >
            <div>
              <div className="flex flex-col gap-2 border-b border-solid pb-3">
                <h2 className="text-lg font-bold">Menu</h2>
              </div>
              <div className="flex flex-col gap-2 border-b border-solid py-5">
                <Button className="justify-start gap-2" variant="ghost">
                  <Link href="/area-do-cliente" className="flex items-center gap-2">
                    <RxAvatar style={{ width: 22, height: 22 }} /> Aréa dos Clientes
                  </Link>
                </Button>
                <Button className="justify-start gap-2" variant="ghost">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <MdInsertChartOutlined style={{ width: 22, height: 22 }} />Dashboard
                  </Link>
                </Button>
                <Button className="justify-start gap-2" variant="ghost">
                  <Link href="/chats" className="flex items-center gap-2">
                    <HiOutlineChatAlt2 style={{ width: 22, height: 22 }} />Chat
                  </Link>
                </Button>
                <Button className="justify-start gap-2" variant="ghost">
                  <Link href="/status" className="flex items-center gap-2">
                    <AiOutlineCar style={{ width: 22, height: 22 }} /> Status
                  </Link>
                </Button>
                <Button className="justify-start gap-2" variant="ghost">
                  <Link href="/documents" className="flex items-center gap-2">
                    <IoDocumentsOutline style={{ width: 22, height: 22 }} />Documentos
                  </Link>
                </Button>
                <Button className="justify-start gap-2" variant="ghost">
                  <Link href="/config" className="flex items-center gap-2">
                    <GoGear style={{ width: 22, height: 22 }} />Configurações
                  </Link>
                </Button>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full p-4 bg-white shadow-inner">
              <Button onClick={() => setSheetOpen(false)} className="w-full mb-2">
                Fechar
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
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