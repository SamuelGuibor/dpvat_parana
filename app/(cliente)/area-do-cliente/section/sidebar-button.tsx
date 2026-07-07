"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface SidebarButtonProps {
  children: React.ReactNode;
  href: string;
  onClick?: () => void;
}

export default function SidebarButton({ href, children, onClick }: SidebarButtonProps) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
        isActive
          ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
          : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
