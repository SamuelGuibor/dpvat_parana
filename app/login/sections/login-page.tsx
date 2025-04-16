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
import { createUser } from "@/app/_actions/create-user";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Obrigatório"),
});

const registerSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

type FormSchema = z.infer<typeof registerSchema> | z.infer<typeof loginSchema>;

const AuthSection = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormSchema>({
    resolver: zodResolver(isRegister ? registerSchema : loginSchema),
  });

  const handleLogin = async (data: FormSchema) => {
    setError(null);
    console.log("handleLogin - Tentando login com:", data);
    const result = await signIn("credentials", {
      redirect: false,
      email: data.email,
      password: data.password,
    });

    console.log("handleLogin - Resultado do signIn:", result);
    if (result?.error) {
      setError(result.error);
    } else {
      toast.success("Login realizado com sucesso!");
      router.push("/");
    }
  };

  const handleRegister = async (data: FormSchema) => {
    setError(null);
    console.log("handleRegister - Tentando registrar com:", data);
    try {
      const user = await createUser({
        name: (data as any).name,
        email: data.email,
        password: data.password,
      });
      console.log("handleRegister - Usuário criado:", user);

      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      });
      console.log("handleRegister - Resultado do signIn após registro:", result);

      if (result?.error) {
        setError("Erro ao iniciar sessão após cadastro: " + result.error);
      } else {
        toast.success("Usuário cadastrado e logado com sucesso!");
        router.push("/");
      }
    } catch (error: any) {
      console.error("handleRegister - Erro:", error);
      if (error.message?.includes("Unique constraint failed")) {
        setError("E-mail já está sendo usado! Tente outro.");
      } else {
        setError("Erro ao criar conta. Tente novamente.");
      }
    }
  };

  const onSubmit = (data: FormSchema) => {
    if (isRegister) {
      handleRegister(data);
    } else {
      handleLogin(data);
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
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input {...register("name")} placeholder="Nome" />
              </div>
            )}

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
              {isRegister ? "Cadastrar" : "Login"}
            </Button>
          </div>

          {!isRegister && (
            <>
              <div className="my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <hr className="border-dashed" />
                <span className="text-muted-foreground text-xs">
                  Ou continue com
                </span>
                <hr className="border-dashed" />
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={() =>
                    signIn("google", { callbackUrl: "/" })
                  }
                  type="button"
                  variant="outline"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="0.98em"
                    height="1em"
                    viewBox="0 0 256 262"
                  >
                    <path
                      fill="#4285f4"
                      d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
                    />
                    <path
                      fill="#34a853"
                      d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
                    />
                    <path
                      fill="#fbbc05"
                      d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
                    />
                    <path
                      fill="#eb4335"
                      d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
                    />
                  </svg>
                  <span>Google</span>
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="p-3 text-center text-sm">
          {isRegister ? "Já tem uma conta?" : "Não tem uma conta?"}
          <Button
            variant="link"
            className="px-2"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
              reset();
            }}
          >
            {isRegister ? "Faça Login" : "Criar Conta"}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default AuthSection;