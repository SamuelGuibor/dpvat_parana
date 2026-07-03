"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FaArrowRight, FaRegQuestionCircle } from "react-icons/fa";
import { PiHouseBold } from "react-icons/pi";
import { AiOutlineCar } from "react-icons/ai";
import { IoDocumentsOutline } from "react-icons/io5";
import { getStatusProcess } from "@/app/_actions/getStatusProcess";
import { getStatus } from "@/app/_actions/getStatusUser";

interface UserProcess {
  id: string;
  service: string | null;
  type: string | null;
}

interface UserStatus {
  id: string;
  service: string | null;
}

// Cada "processo" do cliente vira um card clicável direto — o usuário pode ter
// mais de um acidente/processo em andamento, então listamos todos de uma vez em
// vez de esconder tudo atrás de um diálogo.
interface StatusEntry {
  key: string;
  href: string;
  accident: number;
  subtitle: string;
}

const quickLinks = [
  {
    href: "/documents",
    name: "Documentos",
    description: "Veja os arquivos do seu processo.",
    Icon: IoDocumentsOutline,
  },
  {
    href: "/faq",
    name: "Dúvidas (FAQ)",
    description: "Tudo sobre a área do cliente.",
    Icon: FaRegQuestionCircle,
  },
  {
    href: "/",
    name: "Início",
    description: "Voltar para a página inicial.",
    Icon: PiHouseBold,
  },
];

function BentoDemo() {
  const [isLoading, setIsLoading] = useState(true);
  const [processes, setProcesses] = useState<UserProcess[]>([]);
  const [userStatus, setUserStatus] = useState<UserStatus[]>([]);
  const { data: session } = useSession();

  const firstName = session?.user?.name?.trim().split(" ")[0] || "Cliente";

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setProcesses([]);
          setUserStatus([]);
          setIsLoading(false);
        }
        return;
      }
      try {
        const [proc, usr] = await Promise.all([
          getStatusProcess(session.user.id),
          getStatus(session.user.id),
        ]);
        if (!cancelled) {
          setProcesses(proc);
          setUserStatus(usr);
        }
      } catch (error) {
        console.error("Erro ao carregar os dados:", error);
        if (!cancelled) {
          setProcesses([]);
          setUserStatus([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Junta o status do próprio usuário (Acidente 1) com os processos extras
  // (Acidente 2, 3...) numa lista única de cards.
  const entries = useMemo<StatusEntry[]>(() => {
    const fromUser: StatusEntry[] = userStatus.map((u) => ({
      key: `user-${u.id}`,
      href: "/status",
      accident: 1,
      subtitle: u.service?.trim() || "Processo",
    }));
    const fromProcesses: StatusEntry[] = processes.map((p, i) => ({
      key: `proc-${p.id}`,
      href: `/status/${p.id}`,
      accident: i + 2,
      subtitle: [p.service?.trim(), p.type?.trim()].filter(Boolean).join(" · ") || "Processo",
    }));
    return [...fromUser, ...fromProcesses];
  }, [userStatus, processes]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Saudação */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          Olá, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Acompanhe seus processos e acesse seus documentos em um só lugar.
        </p>
      </div>

      {/* Meus Processos */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <AiOutlineCar className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Meus Processos</h2>
          {!isLoading && entries.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
              {entries.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="h-12 w-12 rounded-xl bg-gray-100" />
                <div className="mt-4 h-5 w-2/3 rounded bg-gray-100" />
                <div className="mt-2 h-4 w-1/3 rounded bg-gray-100" />
                <div className="mt-5 h-4 w-1/4 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <AiOutlineCar className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-semibold text-gray-600">Nenhum processo ativo</p>
            <p className="text-sm text-gray-400">
              Assim que um processo for aberto, ele aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((e) => (
              <Link
                key={e.key}
                href={e.href}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <AiOutlineCar className="h-6 w-6" />
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    Acidente {e.accident}
                  </h3>
                  <p className="text-sm text-gray-500">{e.subtitle}</p>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-blue-600">
                  Ver status
                  <FaArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Acesso rápido */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Acesso rápido</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickLinks.map((q) => (
            <Link
              key={q.name}
              href={q.href}
              className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                <q.Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{q.name}</p>
                <p className="truncate text-xs text-gray-400">{q.description}</p>
              </div>
              <FaArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-blue-500" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export { BentoDemo };
