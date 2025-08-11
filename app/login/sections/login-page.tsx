/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(7, "Obrigatório"),
});

type LoginForm = z.infer<typeof loginSchema>;

const AuthSection = () => {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const handleLogin = async (data: LoginForm) => {
    setError(null);
    const result = await signIn("credentials", {
      redirect: false,
      email: data.email,
      password: data.password,
    });

    if (result?.error) {
      setError("Email ou senha incorretos");
    } else {
      toast.success("Login realizado com sucesso!");
      router.push("/");
    }
  };

  return (
    <section className="flex min-h-screen bg-zinc-50 px-4 dark:bg-transparent">
      <form
        onSubmit={handleSubmit(handleLogin)}
        className="bg-muted m-auto h-fit w-full max-w-[600px] overflow-hidden rounded-[calc(var(--radius)+.125rem)] border shadow-md shadow-zinc-950/5 dark:[--color-muted:var(--color-zinc-900)]"
      >
        <div className="bg-card -m-px rounded-[calc(var(--radius)+.125rem)] border p-8 pb-6">
          <div className="text-center">
            <Link href="/" aria-label="go home" className="mx-auto block w-fit">
              <Image
                src="/paranaseguros.png"
                height={20}
                width={140}
                alt="DPVAT Paraná"
              />
            </Link>
            <h1 className="mb-1 mt-4 text-xl font-semibold">
              Faça Login Para Consultar Seu Processo
            </h1>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input {...register("email")} type="email" placeholder="Email" />
              {errors.email && (
                <p className="text-red-500 text-sm">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                {...register("password")}
                type="password"
                placeholder="Senha"
              />
              {errors.password && (
                <p className="text-red-500 text-sm">
                  {errors.password.message}
                </p>
              )}
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <Button type="submit" className="w-full">
              Login
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
};

export default AuthSection;