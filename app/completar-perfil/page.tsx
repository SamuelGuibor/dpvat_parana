"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateUserProfile } from "../_actions/userActions";
import { Button } from "../_components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../_components/ui/form";
import { Input } from "../_components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../_components/ui/popover";
import { Calendar } from "../_components/ui/calendar";
import { z } from "zod";
import { isValidCpf } from "./helpers/cpf";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import Image from "next/image";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";

const formSchema = z.object({
  cpf: z
    .string()
    .trim()
    .min(1, { message: "O CPF é obrigatório!" })
    .refine((value) => isValidCpf(value), { message: "CPF inválido!" }),
  data_nasc: z.string().refine((value) => !isNaN(new Date(value).getTime()), {
    message: "Data de nascimento inválida!",
  }),
  rua: z
    .string()
    .trim()
    .min(1, { message: "A rua é obrigatória!" })
    .startsWith("Rua", { message: "A rua deve começar com 'Rua'" }),
  bairro: z.string().trim().min(1, { message: "O bairro é obrigatório!" }),
  numero: z
    .string()
    .trim()
    .regex(/^\d+$/, { message: "O número deve conter apenas dígitos!" })
    .min(1, { message: "O número é obrigatório!" }),
  cep: z
    .string()
    .trim()
    .regex(/^\d{5}-\d{3}$/, {
      message: "O CEP deve estar no formato 00000-000!",
    }),
});

type FormSchema = z.infer<typeof formSchema>;

export default function CompletarPerfil() {
  const { data: session } = useSession();
  const router = useRouter();

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
      data_nasc: "",
      rua: "Rua",
      bairro: "",
      numero: "",
      cep: "",
    },
  });

  const [loading, setLoading] = useState(false);
  const onSubmit = async (data: FormSchema) => {
    setLoading(true);
    try {
      const formattedData = {
        ...data,
        data_nasc: new Date(data.data_nasc).toISOString(),
      };
      console.log("Dados formatados para salvar:", formattedData);
      await updateUserProfile(formattedData);
      router.push("/");
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      form.setError("root", { message: "Erro ao atualizar o perfil." });
    } finally {
      setLoading(false);
    }
  };

  if (!session) return;

  return (
    <section className="flex min-h-screen bg-zinc-50 px-4 dark:bg-transparent py-5">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="bg-muted m-auto h-fit w-full max-w-[600px] overflow-hidden rounded-lg border shadow-md"
        >
          <div className="bg-card p-8 pb-6">
            <div className="flex justify-center relative bottom-4">
              <Image
                src="/logo.png"
                height={40}
                width={180}
                alt="DPVAT Paraná"
              />
            </div>
            <h1 className="text-center text-xl font-semibold">
              Complete seu Cadastro
            </h1>
            <p className="text-center text-sm mb-6">
              Bem-vindo, {session.user?.name}!
            </p>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite seu CPF" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
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
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite seu CEP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
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
                control={form.control}
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
                control={form.control}
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

            <Button type="submit" className="mt-6 w-full" disabled={loading}>
              {loading ? (
                <Loader2Icon className="animate-spin mr-2" />
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
