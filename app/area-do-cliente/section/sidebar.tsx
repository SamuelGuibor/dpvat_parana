"use client";

import SidebarButton from "./sidebar-button";
import Link from "next/link";
import Image from "next/image";
import { AiOutlineCar } from "react-icons/ai";
import { IoDocumentsOutline } from "react-icons/io5";
import { GoGear } from "react-icons/go";
import { PiHouseBold } from "react-icons/pi";
import { RxAvatar } from "react-icons/rx";

const Sidebar = () => {
  return (
    <div className="fixed w-full bg-gray-100 md:relative md:w-64 h-screen">
      {/* IMAGEM */}
      <div className="px-8 py-1 md:py-6">
        <Link
          href="/"
          aria-label="home"
          className="flex items-center space-x-2"
        >
          <Image src="/logo.png" height={20} width={140} alt="DPVAT Paraná" />
        </Link>
      </div>
      {/* BOTOES */}
      <div className="flex flex-row gap-2 p-2 md:flex-col">

        <SidebarButton href="/">
          <PiHouseBold style={{ width: 22, height: 22 }} /> Inicio
        </SidebarButton>

        <SidebarButton href="/area-do-cliente">
          <RxAvatar style={{ width: 22, height: 22 }} /> Area do cliente
        </SidebarButton>

        <SidebarButton href="/status">
          <AiOutlineCar style={{ width: 22, height: 22 }} /> Status
        </SidebarButton>

        <SidebarButton href="/documents">
          <IoDocumentsOutline style={{ width: 22, height: 22 }} />
          Documentos
        </SidebarButton>

        <div className="absolute bottom-0 left-0 w-full p-4 border-gray-400 border-t">
        <SidebarButton href="/config">
          <GoGear style={{ width: 22, height: 22 }} />
          Configurações
        </SidebarButton>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
