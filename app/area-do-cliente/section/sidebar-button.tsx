"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/app/_components/ui/button";
import Link from "next/link";

interface SidebarButtonProps {
  children: React.ReactNode;
  href: string;
  onClick?: () => void;
}

export default function SidebarButton({ href, children, onClick }: SidebarButtonProps) {
  const pathname = usePathname();
  return (
    <Button
      variant={pathname === href ? "terciario" : "ghost"}
      className="w-full justify-start gap-2"
      asChild
      onClick={onClick}
    >
      <Link href={href}>
        {children}
      </Link>
    </Button>
  );
}