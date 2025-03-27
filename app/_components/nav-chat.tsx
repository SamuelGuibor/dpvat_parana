"use client";

import React from "react";
import { type LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/app/_components/ui/sidebar";
import SidebarButton from "@/app/area-do-cliente/section/sidebar-button"; // Importar o SidebarButton

export function NavChats({
  items,
}: {
  items: {
    name: string;
    url: string;
    icon: LucideIcon | React.ComponentType<{ className?: string }>;
  }[];
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarButton href={item.url} icon={item.icon}>
              {item.name}
            </SidebarButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}