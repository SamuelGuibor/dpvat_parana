"use client";

import React, { useState } from "react";
import SidebarButton from "./sidebar-button";
import Link from "next/link";
import Image from "next/image";
import { IoDocumentsOutline } from "react-icons/io5";
import { PiHouseBold } from "react-icons/pi";
import { RxAvatar } from "react-icons/rx";
import { FaRegQuestionCircle } from "react-icons/fa";
import { HiMenu, HiX } from "react-icons/hi";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const close = () => setIsOpen(false);

  return (
    <>
      {/* Botão do menu no mobile */}
      <button
        className="md:hidden fixed top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 active:scale-95"
        onClick={toggleSidebar}
        aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
      >
        {isOpen ? <HiX size={22} /> : <HiMenu size={22} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-72 max-w-[80%] transform flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out md:relative md:w-64 md:max-w-none md:translate-x-0 ${
          isOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-6 py-7">
          <Link
            href="/"
            aria-label="home"
            className="flex items-center"
            onClick={close}
          >
            <Image src="/paranaseguros.png" height={22} width={150} alt="DPVAT Paraná" />
          </Link>
        </div>

        {/* Navegação */}
        <nav className="flex flex-1 flex-col gap-1 px-3">
          <p className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Menu
          </p>

          <SidebarButton href="/" onClick={close}>
            <PiHouseBold className="h-5 w-5" /> Início
          </SidebarButton>

          <SidebarButton href="/area-do-cliente" onClick={close}>
            <RxAvatar className="h-5 w-5" /> Área do cliente
          </SidebarButton>

          <SidebarButton href="/documents" onClick={close}>
            <IoDocumentsOutline className="h-5 w-5" /> Documentos
          </SidebarButton>
        </nav>

        {/* Rodapé */}
        <div className="border-t border-slate-200 p-3">
          <SidebarButton href="/faq" onClick={close}>
            <FaRegQuestionCircle className="h-5 w-5" /> Ajuda &amp; FAQ
          </SidebarButton>
        </div>
      </aside>

      {/* Overlay no mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
};

export default Sidebar;
