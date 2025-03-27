"use client";

import React from "react";
import { useSession } from "next-auth/react";
import {
  UsersIcon,
  DatabaseIcon,
  ClipboardListIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/app/_components/ui/sidebar";
import Image from "next/image";
import Link from "next/link";
import { NavUser } from "./nav-user";
import { NavMain } from "./nav-main";
import { NavChats } from "./nav-chat";
import { NavDocuments } from "./nav-documents"; // Importar o NavDocuments ajustado
import { MdInsertChartOutlined } from "react-icons/md";
import { HiOutlineChatAlt2 } from "react-icons/hi";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: MdInsertChartOutlined,
    },
    {
      title: "Equipe",
      url: "/team",
      icon: UsersIcon,
    },
  ],
  documents: [
    {
      name: "Documentos",
      url: "/document",
      icon: DatabaseIcon,
    },
    {
      name: "Status",
      url: "/stats",
      icon: ClipboardListIcon,
    },
  ],
  chats: [
    {
      name: "Chats",
      url: "/chats",
      icon: HiOutlineChatAlt2, 
    }
  ]
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session, status } = useSession();

  const userData = session?.user
    ? {
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image,
    }
    : {
      name: session?.user.name,
      email: session?.user.email,
      avatar: session?.user.image,
    };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/"
              aria-label="home"
              className="flex items-center space-x-2"
            >
              <Image src="/logo.png" height={20} width={140} alt="DPVAT Paraná" />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavChats items={data.chats}/>
      </SidebarContent>
      <SidebarFooter>
          <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}