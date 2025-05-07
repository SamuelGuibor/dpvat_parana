"use client";

import { createUser } from "@/app/_actions/create-user";
import { Form } from "@/app/_components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caractéres")
})

type FormSchema = z.infer<typeof registerSchema>

export default function CreateAccountForm() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registerForm = useForm<FormSchema>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" }
  })
  const togglePasswordVisibility = () => {
    setPasswordVisible((prevState) => !prevState);
  };

  async function handleRegister(values: FormSchema) {
    setError(null)
    try {
      await createUser({
        name: values.name,
        email: values.email,
        password: values.password
      })
      toast.success("Usuário cadastrado!");
    } catch (error: any) {
      if (error.message.includes("Unique constraint failed")) {
        toast.error("O Email já está sendo usado!");
      } else {
        toast.error("Erro ao criar conta!");
      }
    }
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-white p-6 font-sans overflow-hidden">
      <div className="w-full max-w-md mt-100">
        <h1 className="text-2xl font-bold text-gray-800 mb-10 text-center">Criar nova conta</h1>
        <Form {...registerForm}>
          <form className="space-y-5" onSubmit={registerForm.handleSubmit(handleRegister)}>
            <div className="gap-5">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  id="firstName"
                  {...registerForm.register("name")}
                  required
                  className="w-full px-0 py-2 border-b border-gray-300 focus:outline-none focus:ring-0 focus:border-blue-500 focus:shadow-sm transition-all duration-200"                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                id="email"
                {...registerForm.register("email")}
                required
                className="w-full px-0 py-2 border-b border-gray-300 focus:outline-none focus:ring-0 focus:border-blue-500 transition-all duration-200"
              />
            </div>

            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type={passwordVisible ? "text" : "password"}
                id="password"
                {...registerForm.register("password")}
                required
                minLength={8}
                className="w-full px-0 py-2 border-b border-gray-300 focus:outline-none focus:ring-0 focus:border-blue-500 transition-all duration-200 pr-8"
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute top-1/2 right-0 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 mr-3"
                onClick={togglePasswordVisibility}
              >
                {passwordVisible ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" id="eyeIcon">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
              <p className="text-xs text-gray-500 mt-1">A senha deve ter no mínimo 8 caracteres</p>
            </div>

            <button
              type="submit"
              className="w-full bg-neutral-900 text-white py-3 px-4 font-medium hover:bg-neutral-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-700 rounded-md"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline-block"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                "Criar conta"
              )}
            </button>
          </form>
        </Form>
      </div>
    </div>
  );
}
