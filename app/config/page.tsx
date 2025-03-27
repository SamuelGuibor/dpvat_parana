"use client"

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../_components/ui/form";
import Sidebar from "../area-do-cliente/section/sidebar";
import { Input } from "../_components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../_components/ui/popover";
import { Button } from "../_components/ui/button";
import { Calendar } from "../_components/ui/calendar";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";

const Config = () => {
    const { data: session } = useSession();

    const form = useForm({
        defaultValues: {
            cpf: "",
            data_nasc: "",
            rua: "Rua",
            bairro: "",
            numero: "",
            cep: "",
        },
    });

    const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, ""); // Remove tudo que não for número
        if (value.length <= 8) {
            value =
                value.slice(0, 5) + (value.length > 5 ? "-" + value.slice(5, 8) : ""); // Formata o CEP
            form.setValue("cep", value); // Atualiza o valor do campo
        }
    };

    if (!session) return;

    return (
        <div className="flex flex-row h-screen">
            <Sidebar />
            <div className="m-8 mt-32 w-full overflow-auto rounded-lg bg-gray-100 p-8 md:mt-8">
                <h2 className="text-2xl font-semibold">Configurações</h2>
                <p className="text-sm font-semibold text-slate-500">Verifique as suas configurações</p>
                <Form {...form}>
                    <form
                        className="bg-muted m-auto h-fit w-full max-w-[600px] overflow-hidden rounded-lg border shadow-md"
                    >
                        <div className="bg-card p-8 pb-6">
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
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
};

export default Config;