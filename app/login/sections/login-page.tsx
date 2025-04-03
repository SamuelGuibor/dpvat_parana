"use client";

import { useState } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import Image from "next/image";
import Link from "next/link";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createUser } from "@/app/_actions/create-user";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export type FormSchema = z.infer<typeof formSchema>;

const AuthSection = () => {
  const [isRegister, setIsRegister] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormSchema) => {
    try {
      await createUser(data);
      toast.success("Usuário criado com sucesso!");
    } catch (error) {
      toast.error("Erro ao criar usuário");
      console.error(error);
    }
  };

  return (
    <section
      className={`flex min-h-screen bg-zinc-50 px-4 dark:bg-transparent ${
        isRegister ? "py-5" : ""
      }`}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-muted m-auto h-fit w-full max-w-[600px] overflow-hidden rounded-[calc(var(--radius)+.125rem)] border shadow-md shadow-zinc-950/5 dark:[--color-muted:var(--color-zinc-900)]"
      >
        <div className="bg-card -m-px rounded-[calc(var(--radius)+.125rem)] border p-8 pb-6">
          <div className="text-center">
            <Link href="/" aria-label="go home" className="mx-auto block w-fit">
              <Image
                src="/logo.png"
                height={20}
                width={140}
                alt="DPVAT Paraná"
              />
            </Link>
            <h1 className="mb-1 mt-4 text-xl font-semibold">
              {isRegister ? "Crie sua Conta" : "Faça Login em DPVAT Paraná"}
            </h1>
            <p className="text-sm">
              {isRegister
                ? "Preencha os campos para se cadastrar!"
                : "Faça o login para continuar!"}
            </p>
          </div>

          <div className="mt-6 space-y-6">
            {isRegister && (
              <>
                <Label htmlFor="name">Nome</Label>
                <Input {...register("name")} placeholder="Nome" />
                {errors.name && (
                  <p className="text-red-500 text-sm">{errors.name.message}</p>
                )}
              </>
            )}

            <Label htmlFor="email">Email</Label>
            <Input {...register("email")} type="email" placeholder="Email" />
            {errors.email && (
              <p className="text-red-500 text-sm">{errors.email.message}</p>
            )}

            <Label htmlFor="password">Senha</Label>
            <Input
              {...register("password")}
              type="password"
              placeholder="Senha"
            />
            {errors.password && (
              <p className="text-red-500 text-sm">{errors.password.message}</p>
            )}

            <Button type="submit" className="w-full">
              {isRegister ? "Cadastrar" : "Login"}
            </Button>
          </div>
        </div>

        <div className="p-3 text-center text-sm">
          {isRegister ? "Já tem uma conta?" : "Não tem uma conta?"}
          <Button
            variant="link"
            className="px-2"
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? "Faça Login" : "Criar Conta"}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default AuthSection;
