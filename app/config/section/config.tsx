/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */

"use client";

import { Avatar, AvatarImage } from "@/app/_components/ui/avatar";
import { Button } from "@/app/_components/ui/button";
import { Calendar } from "@/app/_components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/ui/form";
import { Input } from "@/app/_components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/_components/ui/popover";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { getUser } from "@/app/_actions/get-user";

interface FormData {
  cpf: string;
  data_nasc: string;
  rua: string;
  bairro: string;
  numero: string;
  cep: string;
}

const Configuracao = () => {
  const { data: session } = useSession();
  // eslint-disable-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(true);

  const form = useForm<FormData>({
    defaultValues: {
      cpf: "",
      data_nasc: "",
      rua: "",
      bairro: "",
      numero: "",
      cep: "",
    },
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (!session) return;

      try {
        setLoading(true);
        const userData = await getUser({} as any);
        form.setValue("cpf", userData.cpf);
        form.setValue("data_nasc", userData.data_nasc);
        form.setValue("rua", userData.rua);
        form.setValue("bairro", userData.bairro);
        form.setValue("numero", userData.numero);
        form.setValue("cep", userData.cep);
      } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [session, form]);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ""); // Remove tudo que não for número
    if (value.length <= 8) {
      value =
        value.slice(0, 5) + (value.length > 5 ? "-" + value.slice(5, 8) : ""); // Formata o CEP
      form.setValue("cep", value); // Atualiza o valor do campo
    }
  };

  return (
    <div className="container py-5">
      <Form {...form}>
        <form className="bg-muted m-auto h-fit w-full overflow-hidden rounded-lg border shadow-md">
          <div className="bg-card p-8 pb-6">
            <div className="relative flex flex-row items-center gap-4 pb-5">
              <Avatar>
                <AvatarImage
                  src={session?.user?.image || "https://i.pravatar.cc/300"}
                  alt="Avatar"
                />
              </Avatar>
              <h2 className="text-lg font-semibold">{session?.user.name}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Digite seu CPF"
                        {...field}
                        maxLength={14}
                        disabled
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="data_nasc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Nascimento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full">
                          {field.value
                            ? format(new Date(field.value), "dd/MM/yyyy")
                            : "Selecione a data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full mt-2">
                        <Calendar
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onDayClick={(date: Date) => {
                            const formattedDate = format(date, "yyyy-MM-dd");
                            field.onChange(formattedDate);
                          }}
                          disabled
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Digite seu CEP"
                        {...field}
                        maxLength={10}
                        onChange={handleCepChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="rua"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rua</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Digite sua rua"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.startsWith("Rua")) {
                            field.onChange(value);
                          } else {
                            field.onChange("Rua");
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="bairro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite seu bairro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite o número" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="relative pt-10">
              <Button>Salvar</Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default Configuracao;
