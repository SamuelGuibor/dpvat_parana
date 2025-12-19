"use client";

import { Phone, LogOutIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/app/_components/ui/button";
import { Avatar, AvatarImage } from "@/app/_components/ui/avatar";
import { AiOutlineCar } from "react-icons/ai";
import { RxAvatar } from "react-icons/rx";
import { IoDocumentsOutline } from "react-icons/io5";
import { MdInsertChartOutlined } from "react-icons/md";
import { useSession, signOut } from "next-auth/react";

export function Header() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: session } = useSession();
  const toggleSheet = () => {
    setSheetOpen((prev) => !prev);
  };
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
    <>
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-1">

            <a href="/">
            <Image
              src="/paranaseguros.png"
              width={180}
              height={60}
              alt="Seguros Paraná"
            />
            </a>

            <nav className="hidden md:flex items-center gap-8">
              <a href="/" className="text-gray-700 hover:text-blue-600">Início</a>
              <a href="/#servicos" className="text-gray-700 hover:text-blue-600">Serviços</a>
              <a href="/#blog" className="text-gray-700 hover:text-blue-600">Blog</a>
              <a href="/nossa-equipe" className="text-gray-700 hover:text-blue-600">Equipe</a>
              <a href="/#contato" className="text-gray-700 hover:text-blue-600">Contato</a>
            </nav>

            <div className="flex items-center gap-4">
              <a
                href="tel:+5541997862323"
                className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700"
                aria-label="Ligar agora"
              >
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">Ligue Agora</span>
              </a>

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
        </div>
      </header>

      {sheetOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSheetOpen(false)}
        />
      )}

      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: sheetOpen ? "0%" : "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 h-screen w-80 bg-white z-50 shadow-xl flex flex-col justify-between"
      >
        <div className="p-6">
          <h2 className="text-lg font-bold mb-4">Menu</h2>

          <div className="flex flex-col gap-2">
            {menuOptions.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                className="justify-start gap-3"
                onClick={() => setSheetOpen(false)}
              >
                <Link href={item.href} className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => signOut()}
          >
            <LogOutIcon size={18} />
            Sair da Conta
          </Button>
        </div>
      </motion.aside>
    </>
  );
}
