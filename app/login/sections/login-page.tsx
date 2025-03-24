'use client'

import { useState } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import Image from "next/image";
import Link from "next/link";

const AuthSection = () => {
    const [isRegister, setIsRegister] = useState(false);

    return (
        <section className={`flex min-h-screen bg-zinc-50 px-4 dark:bg-transparent ${isRegister ? "py-5" : ""}`}>
        <form className="bg-muted m-auto h-fit w-full max-w-[600px] overflow-hidden rounded-[calc(var(--radius)+.125rem)] border shadow-md shadow-zinc-950/5 dark:[--color-muted:var(--color-zinc-900)]">
                <div className="bg-card -m-px rounded-[calc(var(--radius)+.125rem)] border p-8 pb-6">
                    <div className="text-center">
                        <Link href="/" aria-label="go home" className="mx-auto block w-fit">
                            <Image src="/logo.png" height={20} width={140} alt="DPVAT Paraná" />
                        </Link>
                        <h1 className="mb-1 mt-4 text-xl font-semibold">
                            {isRegister ? "Crie sua Conta" : "Faça Login em DPVAT Paraná"}
                        </h1>
                        <p className="text-sm">
                            {isRegister ? "Preencha os campos para se cadastrar!" : "Faça o login para continuar!"}
                        </p>
                    </div>

                    <div className="mt-6 space-y-6">
                        {isRegister && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="block text-sm">Nome</Label>
                                    <Input type="text" required name="name" id="name" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="cpf" className="block text-sm">CPF</Label>
                                    <Input type="text" required name="cpf" id="cpf" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="data_nasc" className="block text-sm">Data de Nascimento</Label>
                                    <Input type="date" required name="data_nasc" id="data_nasc" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="telefone" className="block text-sm">Telefone</Label>
                                    <Input type="text" required name="telefone" id="telefone" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="telefone" className="block text-sm">CEP</Label>
                                    <Input type="text" required name="telefone" id="telefone" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="telefone" className="block text-sm">Rua</Label>
                                    <Input type="text" required name="telefone" id="telefone" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="telefone" className="block text-sm">Bairro</Label>
                                    <Input type="text" required name="telefone" id="telefone" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="telefone" className="block text-sm">Numero</Label>
                                    <Input type="text" required name="telefone" id="telefone" />
                                </div>


                                <div className="space-y-2">
                                    <Label htmlFor="email" className="block text-sm">Email</Label>
                                    <Input type="email" required name="email" id="email" />
                                </div>

                                <div className="space-y-0.5">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="pwd" className="text-title text-sm">Senha</Label>
                                    </div>
                                    <Input type="password" required name="pwd" id="pwd" className="input sz-md variant-mixed" />
                                </div>
                            </div>
                        )}

                    {!isRegister && (
                        <>
                        <div className="space-y-2">
                            <Label htmlFor="email" className="block text-sm">Email</Label>
                            <Input type="email" required name="email" id="email" />
                        </div>

                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="pwd" className="text-title text-sm">Senha</Label>
                                {!isRegister && (
                                    <Button asChild variant="link" size="sm">
                                        <Link href="#" className="link intent-info variant-ghost text-sm">
                                            Esqueceu sua senha?
                                        </Link>
                                    </Button>
                                )}
                            </div>
                            <Input type="password" required name="pwd" id="pwd" className="input sz-md variant-mixed" />
                        </div>
                        </>
                        )}
                        <Button className="w-full">
                            {isRegister ? "Cadastrar" : "Login"}
                        </Button>
                    </div>

                    {!isRegister && (
                        <>
                            <div className="my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                <hr className="border-dashed" />
                                <span className="text-muted-foreground text-xs">Ou continue com</span>
                                <hr className="border-dashed" />
                            </div>

                            <div className="flex justify-center">
                                <Button type="button" variant="outline">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="0.98em" height="1em" viewBox="0 0 256 262">
                                        <path fill="#4285f4" d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"></path>
                                        <path fill="#34a853" d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"></path>
                                        <path fill="#fbbc05" d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"></path>
                                        <path fill="#eb4335" d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"></path>
                                    </svg>
                                    <span>Google</span>
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-3">
                    <p className="text-accent-foreground text-center text-sm">
                        {isRegister ? "Já tem uma conta?" : "Não tem uma conta?"}
                        <Button asChild variant="link" className="px-2" onClick={() => setIsRegister(!isRegister)}>
                            <Link href="#">{isRegister ? "Faça Login" : "Criar Conta"}</Link>
                        </Button>
                    </p>
                </div>
            </form>
        </section>
    );
}

export default AuthSection;
