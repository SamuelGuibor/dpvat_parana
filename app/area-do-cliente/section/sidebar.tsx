"use client";

import SidebarButton from "./sidebar-button";
import Link from "next/link";
import Image from "next/image";
import { AiOutlineCar } from "react-icons/ai";
import { IoDocumentsOutline } from "react-icons/io5";
import { GoGear } from "react-icons/go";

const Sidebar = () => {
  return (
    <div className="fixed w-full bg-gray-100 md:relative md:w-64">
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
          <AiOutlineCar style={{ width: 22, height: 22 }} /> Status
        </SidebarButton>

        <SidebarButton href="/products">
          <IoDocumentsOutline style={{ width: 22, height: 22 }} />
          Documentos
        </SidebarButton>

        <SidebarButton href="/sales">
          <GoGear style={{ width: 22, height: 22 }} />
          Configurações
        </SidebarButton>
      </div>
    </div>
  );
};

export default Sidebar;
