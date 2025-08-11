/* eslint-disable @next/next/no-img-element */
/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FileTextIcon } from "@radix-ui/react-icons";
import { FaRegQuestionCircle } from "react-icons/fa";
import { PiHouseBold } from "react-icons/pi";
import { AiOutlineCar } from "react-icons/ai";
import { BentoCard, BentoGrid } from "./bento-grid";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/app/_components/ui/button";
import { getStatusProcess } from "@/app/_actions/getStatusProcess";
import { getStatus } from "@/app/_actions/getStatusUser";

interface userProcess {
  id: string;
  service: string | null;
  type: string | null;
}

interface userStatus {
  id: string;
  service: string | null;
}

const features = [
  {
    Icon: FileTextIcon,
    name: "Verifique os arquivos",
    description: "Verifique os seus arquivos do processo.",
    href: "/documents",
    cta: "Veja mais",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
  },
  {
    Icon: AiOutlineCar,
    name: "Status",
    description: "Verifique os status do seu processo",
    href: "/status",
    cta: "Veja mais",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:row-start-1 lg:row-end-4 lg:col-start-1 lg:col-end-2",
  },
  {
    Icon: FaRegQuestionCircle,
    name: "FAQ da Area do Cliente",
    description: "Verifique sobre tudo da aréa do cliente.",
    href: "/",
    cta: "Veja mais",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2",
  },
  {
    Icon: PiHouseBold,
    name: "Inicio",
    description: "Volte para a página inicial.",
    href: "/",
    cta: "Veja mais",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-4",
  },
];

function BentoDemo() {
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<userProcess[]>([]);
  const [dataUser, setDataUser] = useState<userStatus[]>([]);
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    async function fetchData() {
      try {
        if (!session?.user?.id) {
          console.error("Usuário não está logado");
          setData([]);
          setDataUser([]);
          setIsLoading(false);
          return;
        }

        const processes = await getStatusProcess(session.user.type, session.user.id, session.user.service);
        const userStatus = await getStatus(session.user.id, session.user.service);

        setData(processes);
        setDataUser(userStatus);
      } catch (error) {
        console.error("Erro ao carregar os dados:", error);
        setData([]);
        setDataUser([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [session]);

  const handleStatusClick = () => {
    if (data.length > 0) {
      setIsStatusDialogOpen(true); // Abre dialog se há múltiplos processos
    } else {
      router.push("/status"); // Redireciona para status geral se não há processos
    }
  };

  return (
    <div className="container pt-10">
      <BentoGrid className="lg:grid-rows-3">
        {features.map((feature) => (
          <BentoCard
            key={feature.name}
            {...feature}
            onStatusClick={feature.href === "/status" ? handleStatusClick : undefined}
          />
        ))}
      </BentoGrid>

      <Dialog.Root open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-lg max-w-xl w-full"
          >
            <Dialog.Title className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
              Status do Processo
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-neutral-400">
              Qual status você deseja verificar?
            </Dialog.Description>
            <div className="mt-3 flex flex-wrap gap-3">
              {dataUser.map((userStatus) => (
                <Button
                  key={userStatus.id}
                  onClick={() => router.push("/status")} // Status geral do usuário
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl shadow-md hover:bg-blue-700 transition-colors duration-200"
                >
                  {userStatus.service} - Status Geral
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {data.map((process) => (
                <Button
                  key={process.id}
                  onClick={() => router.push(`/status/${process.id}`)} // Processo específico
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl shadow-md hover:bg-blue-700 transition-colors duration-200"
                >
                  {process.service} - {process.type || "Processo"}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Dialog.Close asChild>
                <Button variant="ghost">Fechar</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export { BentoDemo };