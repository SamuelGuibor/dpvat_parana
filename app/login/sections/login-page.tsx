"use client";

import { useState } from "react";
import { Button } from "@/app/_shared/ui/button";
import { Input } from "@/app/_shared/ui/input";
import { Label } from "@/app/_shared/ui/label";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, IdCard, LockKeyhole, ArrowRight, AlertCircle } from "lucide-react";
import { maskCpf } from "@/app/_shared/utils/format";
import { AuthShell } from "./AuthShell";

const loginSchema = z.object({
  cpf: z.string().min(11, "CPF deve conter pelo menos 11 caracteres"),
  password: z.string().min(7, "Obrigatório"),
});

type LoginForm = z.infer<typeof loginSchema>;

const AuthSection = () => {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const handleLogin = async (data: LoginForm) => {
    setSubmitting(true);
    try {
      setError(null);
      const cleanCpf = data.cpf.replace(/\D/g, "");
      const result = await signIn("credentials", {
        redirect: false,
        cpf: cleanCpf,
        password: data.password,
      });

      if (result?.error) {
        setError("CPF ou senha incorretos");
      } else {
        toast.success("Login realizado com sucesso!");
        // Cada perfil cai direto no seu destino: equipe no CRM, cliente na
        // área do cliente.
        const session = await getSession();
        const role = session?.user?.role ?? "";
        router.push(role.startsWith("ADMIN") ? "/nova-dash" : "/area-do-cliente");
      }
    } catch {
      toast.error("Ocorreu um erro ao tentar fazer login");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "h-12 rounded-xl border-gray-200 bg-white pl-11 text-[15px] shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-blue-500/60";

  return (
    <AuthShell>
      <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-blue-950/[0.06] sm:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-black tracking-tight text-gray-900">
            Acesse sua conta
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Consulte o andamento do seu processo com CPF e senha.
          </p>
        </div>

        <form onSubmit={handleSubmit(handleLogin)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="cpf" className="text-[13px] font-semibold text-gray-700">CPF</Label>
            <div className="relative">
              <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="cpf"
                {...register("cpf")}
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="username"
                onChange={(e) => setValue("cpf", maskCpf(e.target.value))}
                className={inputClass}
              />
            </div>
            {errors.cpf && (
              <p className="text-xs font-medium text-red-500">{errors.cpf.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[13px] font-semibold text-gray-700">Senha</Label>
              <Link
                href="/login/recuperar-senha"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                {...register("password")}
                type={showPassword ? "text" : "password"}
                placeholder="Sua senha"
                autoComplete="current-password"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs font-medium text-red-500">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="group h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-[15px] font-bold shadow-lg shadow-blue-600/25 transition-all hover:from-blue-800 hover:to-blue-700 hover:shadow-blue-600/35"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Entrar
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-8 border-t border-gray-100 pt-5 text-center">
          <p className="text-xs text-gray-400">
            Ainda não é cliente?{" "}
            <a
              href="https://wa.me/5541997862323"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-green-600 hover:underline"
            >
              Fale com a gente no WhatsApp
            </a>
          </p>
        </div>
      </div>
    </AuthShell>
  );
};

export default AuthSection;
