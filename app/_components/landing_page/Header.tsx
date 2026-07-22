"use client";

import { Phone, LogOutIcon, X, Menu, LogIn, Home, Briefcase, Newspaper, Users, Mail } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/_shared/ui/avatar";
import { AiOutlineCar } from "react-icons/ai";
import { RxAvatar } from "react-icons/rx";
import { IoDocumentsOutline } from "react-icons/io5";
import { MdInsertChartOutlined } from "react-icons/md";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/app/_shared/lib/utils";

export function Header() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const toggleSheet = () => {
    setSheetOpen((prev) => !prev);
  };
  const isAdmin =
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "ADMIN+" ||
    session?.user?.role === "ADMIN++";

  const userName = session?.user?.name?.trim() || "Usuário";
  // Iniciais do nome no avatar — antes todo usuário via a foto genérica /homem.png.
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const menuOptions = isAdmin
    ? [
        { href: "/area-do-cliente", label: "Área do Cliente", icon: <RxAvatar style={{ width: 22, height: 22 }} /> },
        { href: "/nova-dash", label: "Dashboard", icon: <MdInsertChartOutlined style={{ width: 22, height: 22 }} /> },
        { href: "/area-do-cliente", label: "Status", icon: <AiOutlineCar style={{ width: 22, height: 22 }} /> },
        { href: "/documents", label: "Documentos", icon: <IoDocumentsOutline style={{ width: 22, height: 22 }} /> },
      ]
    : [
        { href: "/area-do-cliente", label: "Área do Cliente", icon: <RxAvatar style={{ width: 22, height: 22 }} /> },
        { href: "/area-do-cliente", label: "Status", icon: <AiOutlineCar style={{ width: 22, height: 22 }} /> },
        { href: "/documents", label: "Documentos", icon: <IoDocumentsOutline style={{ width: 22, height: 22 }} /> },
      ];

  // Links do site para o menu mobile do visitante (mesma nav do desktop, que
  // ficava inacessível no celular — não havia hambúrguer para deslogados).
  const siteLinks = [
    { href: "/", label: "Início", icon: <Home size={20} /> },
    { href: "/#servicos", label: "Serviços", icon: <Briefcase size={20} /> },
    { href: "/#blog", label: "Blog", icon: <Newspaper size={20} /> },
    { href: "/nossa-equipe", label: "Equipe", icon: <Users size={20} /> },
    { href: "/#contato", label: "Contato", icon: <Mail size={20} /> },
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

              {session?.user ? (
                <button
                  type="button"
                  onClick={toggleSheet}
                  className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-gray-100 transition-colors"
                  aria-label="Abrir menu do usuário"
                >
                  <Avatar className="cursor-pointer ring-2 ring-blue-100">
                    {session.user.image && <AvatarImage src={session.user.image} alt="Avatar" />}
                    <AvatarFallback className="bg-blue-600 text-white text-sm font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-semibold text-gray-700 max-w-[120px] truncate">
                    {userName.split(" ")[0]}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleSheet}
                  className="md:hidden rounded-lg p-2 text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Abrir menu de navegação"
                >
                  <Menu className="h-6 w-6" />
                </button>
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
        transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: "transform" }}
        className="fixed right-0 top-0 h-screen w-[320px] bg-white z-50 shadow-xl flex flex-col"
      >
        {/* Cabeçalho: usuário logado OU navegação do site (visitante mobile) */}
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-6 text-white">
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>

          {session?.user ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 ring-2 ring-white/40">
                {session.user.image && <AvatarImage src={session.user.image} alt="Avatar" />}
                <AvatarFallback className="bg-white/20 text-white font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-blue-100">Olá,</p>
                <p className="font-bold text-lg leading-tight truncate">{userName}</p>
                <span className="mt-1 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  {isAdmin ? "Administrador" : "Cliente"}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-bold text-lg leading-tight">Paraná Seguros</p>
              <p className="text-xs text-blue-100 mt-1">Indenização rápida e segura</p>
            </div>
          )}
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {(session?.user ? menuOptions : siteLinks).map((item, i) => {
            const active = pathname === item.href;
            return (
              <Link
                key={i}
                href={item.href}
                onClick={() => setSheetOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                    active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sair (logado) / Entrar (visitante) */}
        <div className="border-t p-4">
          {session?.user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 shrink-0">
                <LogOutIcon size={18} />
              </span>
              Sair da Conta
            </button>
          ) : (
            <Link
              href="/login"
              onClick={() => setSheetOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 shrink-0">
                <LogIn size={18} />
              </span>
              Área do Cliente — Entrar
            </Link>
          )}
        </div>
      </motion.aside>
    </>
  );
}
