"use client";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import React from "react";
import { useScroll, motion } from "framer-motion";
import { cn } from "../_lib/utils";
import Image from "next/image";
// import { FaInstagram } from "react-icons/fa";
import { Avatar, AvatarImage } from "../_components/ui/avatar";
import { signOut, useSession } from "next-auth/react";
import { AiOutlineCar } from "react-icons/ai";
import { RxAvatar } from "react-icons/rx";
import { IoDocumentsOutline } from "react-icons/io5";
import { MdInsertChartOutlined } from "react-icons/md";

export const HeroHeader = () => {
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

  // Definir as opções do menu com base na role
  const menuOptions = session?.user?.role === "ADMIN"
    ? [
        { href: "/area-do-cliente", label: "Aréa dos Clientes", icon: <RxAvatar style={{ width: 22, height: 22 }} /> },
        { href: "/dashboard", label: "Dashboard", icon: <MdInsertChartOutlined style={{ width: 22, height: 22 }} /> },
        { href: "/area-do-cliente", label: "Status", icon: <AiOutlineCar style={{ width: 22, height: 22 }} /> },
        { href: "/documents", label: "Documentos", icon: <IoDocumentsOutline style={{ width: 22, height: 22 }} /> },
      ]
    : [
        { href: "/area-do-cliente", label: "Aréa dos Clientes", icon: <RxAvatar style={{ width: 22, height: 22 }} /> },
        { href: "/area-do-cliente", label: "Status", icon: <AiOutlineCar style={{ width: 22, height: 22 }} /> },
        { href: "/documents", label: "Documentos", icon: <IoDocumentsOutline style={{ width: 22, height: 22 }} /> },
      ];

  return (
    <header className="relative">
      <nav className="fixed z-20 w-full pt-2">
        <div
          className={cn(
            "mx-auto max-w-7xl rounded-3xl px-6 transition-all duration-300 lg:px-12",
            scrolled && "bg-background/50 backdrop-blur-2xl"
          )}
        >
          <motion.div
            key={1}
            className={cn(
              "relative flex items-center justify-between gap-4 py-3 duration-200 lg:gap-0 lg:py-6",
              scrolled && "lg:py-4"
            )}
          >
            <Link
              href="/"
              aria-label="home"
              className="flex items-center space-x-2 flex-shrink-0"
            >
              <Image
                src={scrolled ? "/paranaseguros.png" : "/logo_text_white.png"}
                height={20}
                width={140}
                alt="DPVAT Paraná"
              />
            </Link>

            <div
              className={cn(
                "flex items-center justify-end gap-4 flex-grow lg:gap-6",
                scrolled && "bg-transparent"
              )}
            >
              <div className="flex items-center space-x-2 sm:space-x-3">
                {/* <div className="flex gap-4">
                  <Link
                    href="https://www.instagram.com/paranasegurospr?igsh=bGJsN2UyZDhic2Fu&utm_source=qr"
                    aria-label="Veja nosso Instagram"
                  >
                    <FaInstagram
                      size={35}
                      className={scrolled ? "text-black" : "lg:text-white text-white"}
                    />
                  </Link>
                </div> */}
                {!session?.user ? (
                  <div>

                  </div>
                ) : (
                  <>
                    <Avatar onClick={toggleSheet} className="cursor-pointer">
                      <AvatarImage
                        src={session?.user?.image || "/homem.png"}
                        alt="Avatar"
                      />
                    </Avatar>
                  </>
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
                {menuOptions.map((option) => (
                  <Button key={option.href} className="justify-start gap-2" variant="ghost">
                    <Link href={option.href} className="flex items-center gap-2">
                      {option.icon} {option.label}
                    </Link>
                  </Button>
                ))}
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