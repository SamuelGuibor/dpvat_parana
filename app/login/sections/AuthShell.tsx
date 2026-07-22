"use client";

// Moldura visual compartilhada do /login e /login/recuperar-senha:
// painel de marca à esquerda (desktop) + conteúdo à direita.

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { ShieldCheck, Clock3, MessagesSquare } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Acompanhamento seguro",
    text: "Seu processo protegido e acessível só com CPF e senha.",
  },
  {
    icon: Clock3,
    title: "Status em tempo real",
    text: "Veja em que etapa está a sua indenização, sem precisar ligar.",
  },
  {
    icon: MessagesSquare,
    title: "Suporte pelo WhatsApp",
    text: "Fale com a equipe sempre que precisar: (41) 99786-2323.",
  },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Painel da marca (desktop) */}
      <aside className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-700 lg:flex lg:flex-col lg:justify-between">
        {/* Elementos decorativos */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />

        <div className="relative z-10 p-10">
          <Link href="/" aria-label="Ir para o site">
            <Image
              src="/logo_text_white.png"
              width={190}
              height={56}
              alt="Paraná Seguros"
              className="drop-shadow-sm"
            />
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative z-10 px-10 pb-12"
        >
          <h2 className="max-w-md text-3xl font-black leading-tight text-white">
            Sua indenização, acompanhada de perto.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-blue-100/90">
            Entre com seu CPF para consultar o andamento do seu processo de
            indenização ou benefício do INSS.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((h, i) => (
              <motion.li
                key={h.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.12 }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <h.icon className="h-4.5 w-4.5 text-cyan-300" size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{h.title}</span>
                  <span className="block text-xs text-blue-100/80">{h.text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <div className="relative z-10 border-t border-white/10 px-10 py-5">
          <p className="text-[11px] text-blue-200/70">
            © {new Date().getFullYear()} Paraná Seguros · CNPJ 48.270.397/0001-68
          </p>
        </div>
      </aside>

      {/* Conteúdo (formulário) */}
      <main className="relative flex min-h-screen flex-1 flex-col bg-gray-50/60">
        {/* Logo no mobile */}
        <div className="flex justify-center pt-10 lg:hidden">
          <Link href="/" aria-label="Ir para o site">
            <Image src="/paranaseguros.png" width={170} height={50} alt="Paraná Seguros" />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-[440px]"
          >
            {children}
          </motion.div>
        </div>

        <p className="pb-6 text-center text-[11px] text-gray-400 lg:hidden">
          © {new Date().getFullYear()} Paraná Seguros
        </p>
      </main>
    </div>
  );
}
