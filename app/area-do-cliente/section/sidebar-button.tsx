"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/app/_components/ui/button";
import Link from "next/link";

interface SidebarButtonProps {
  children: React.ReactNode;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export default function SidebarButton({ href, children, icon: Icon }: SidebarButtonProps) {
  const pathname = usePathname();
  return (
    <Button
      variant={pathname === href ? "terciario" : "ghost"}
      className="w-full justify-start gap-2"
      asChild
    >
      <Link href={href}>
        {Icon && <Icon className="h-5 w-5" />}
        {children}
      </Link>
    </Button>
  );
}