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

  return (
    <>
      {/* Mobile Menu Button */}
      <div>
      <span className="md:hidden fixed top-5 left-1/2 transform -translate-x-1/2 p-2 rounded-md text-[20px]">
        Paraná Seguros
      </span>
      <button
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-gray-100 rounded-md"
        onClick={toggleSidebar}
      >
        {isOpen ? <HiX size={24} /> : <HiMenu size={24} />}
      </button>
      </div>
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-64 bg-gray-100 transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:relative md:translate-x-0 transition-transform duration-300 ease-in-out z-40 h-screen flex flex-col`}
      >
        {/* Logo */}
        <div className="px-8 py-6">
          <Link
            href="/"
            aria-label="home"
            className="flex items-center space-x-2"
            onClick={() => setIsOpen(false)}
          >
            <Image src="/paranaseguros.png" height={20} width={140} alt="DPVAT Paraná" />
          </Link>
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col flex-1 px-2 space-y-2">
          <SidebarButton href="/" onClick={() => setIsOpen(false)}>
            <PiHouseBold className="w-5 h-5" /> Inicio
          </SidebarButton>

          <SidebarButton href="/area-do-cliente" onClick={() => setIsOpen(false)}>
            <RxAvatar className="w-5 h-5" /> Area do cliente
          </SidebarButton>


          <SidebarButton href="/documents" onClick={() => setIsOpen(false)}>
            <IoDocumentsOutline className="w-5 h-5" /> Documentos
          </SidebarButton>
        </div>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-400 space-y-2">
          <SidebarButton href="/faq" onClick={() => setIsOpen(false)}>
            <FaRegQuestionCircle className="w-5 h-5" /> FAQ
          </SidebarButton>
        </div>
      </div>

      {/* Overlay for mobile when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
};

export default Sidebar;