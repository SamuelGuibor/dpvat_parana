"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateUserProfile } from "../_actions/userActions";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import Image from "next/image";
import { Calendar } from "@/app/_components/ui/calendar"; 
import { Popover, PopoverTrigger, PopoverContent } from "@/app/_components/ui/popover"; 
import { format } from "date-fns"; 

export default function CompletarPerfil() {
  const { data: session } = useSession();
  const router = useRouter();

  const [formData, setFormData] = useState({
    cpf: "",
    data_nasc: "",
    rua: "Rua", 
    bairro: "",
    numero: "",
    cep: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!session) return ;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "cpf") {
      let formattedCpf = value.replace(/\D/g, "");
      formattedCpf = formattedCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      setFormData({ ...formData, cpf: formattedCpf });
    }
      else if (name === "cep") {
      let formattedCep = value.replace(/\D/g, ""); 
      formattedCep = formattedCep.replace(/(\d{5})(\d{3})/, "$1-$2");
      setFormData({ ...formData, cep: formattedCep });
    }
    else if (name === "numero") {
      const formattedNumero = value.replace(/\D/g, ""); 
      setFormData({ ...formData, numero: formattedNumero });
    }
    else if (name !== "rua") { 
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formattedDataNasc = new Date(formData.data_nasc).toISOString();

    const updatedData = {
      ...formData,
      data_nasc: formattedDataNasc, 
    };

    try {
      await updateUserProfile(updatedData);
      router.push("/");
    } catch (err) {
      setError("Erro ao atualizar perfil." + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex min-h-screen bg-zinc-50 px-4 dark:bg-transparent py-5">
      <form
        onSubmit={handleSubmit}
        className="bg-muted m-auto h-fit w-full max-w-[600px] overflow-hidden rounded-lg border shadow-md"
      >
        <div className="bg-card p-8 pb-6">
          <div className="flex justify-center relative bottom-4">
            <Image src="/logo.png" height={40} width={180} alt="DPVAT Paraná" />
          </div>
          <h1 className="text-center text-xl font-semibold">Complete seu Cadastro</h1>
          <p className="text-center text-sm mb-6">Bem-vindo, {session.user?.name}!</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF </Label>
              <Label className="text-gray-500 text-[12px]">Apenas numeros</Label>
              <Input
                type="text"
                name="cpf"
                value={formData.cpf}
                onChange={handleChange}
                required
                maxLength={14} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nasc">Data de Nascimento</Label>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full">
                    {formData.data_nasc ? format(new Date(formData.data_nasc), "dd/MM/yyyy") : "Selecione a data"}
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="w-full mt-2">
                  <Calendar
                    selected={formData.data_nasc ? new Date(formData.data_nasc) : undefined}
                    onDayClick={(date: Date) => {
                      const formattedDate = format(date, "yyyy-MM-dd");
                      setFormData({ ...formData, data_nasc: formattedDate });
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cep">CEP </Label>
              <Label className="text-gray-500 text-[12px]">Apenas numeros</Label>
              <Input
                type="text"
                name="cep"
                value={formData.cep}
                onChange={handleChange}
                required
                maxLength={10}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rua">Rua</Label>
              <Input
                type="text"
                name="rua"
                value={formData.rua}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const inputValue = e.target.value;
                  if (inputValue.startsWith("Rua")) {
                    setFormData({ ...formData, rua: inputValue });
                  } else {
                    setFormData({ ...formData, rua: "Rua" });
                  }
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input
                type="text"
                name="bairro"
                value={formData.bairro}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numero">Número</Label>
              <Input
                type="text"
                name="numero"
                value={formData.numero}
                onChange={handleChange}
                required
                maxLength={6} 
              />
            </div>
          </div>

          <Button type="submit" className="mt-6 w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>

          {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
        </div>
      </form>
    </section>
  );
}
