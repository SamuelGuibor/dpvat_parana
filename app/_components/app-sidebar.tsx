"use client";

import React from "react";
import { useSession } from "next-auth/react";
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
import { MdInsertChartOutlined } from "react-icons/md";
import { HiOutlineChatAlt2 } from "react-icons/hi";
import { RxAvatar } from "react-icons/rx";
import { NavCreate } from "./nav-create";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: MdInsertChartOutlined,
    },
  ],
  chats: [
    // {
    //   name: "Chats",
    //   url: "/chats",
    //   icon: HiOutlineChatAlt2, 
    // },
    {
      name: "Mensagens Automaticas",
      url: "/mensagens",
      icon: HiOutlineChatAlt2, 
    }
  ],
  options: [
    {
      name: "Criar Conta",
      url: "/create",
      icon: RxAvatar
    }
  ]
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();

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
              <Image src="/paranaseguros.png" height={20} width={140} alt="DPVAT Paraná" />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavChats items={data.chats}/>
        <NavCreate items={data.options}/>
      </SidebarContent>
      <SidebarFooter>
          <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}