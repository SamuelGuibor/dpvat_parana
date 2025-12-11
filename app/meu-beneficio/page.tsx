/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "../_components/ui/button";
import { ContactUsers } from "@/app/_actions/createContact";


export default function MeuBeneficio() {
    const [step, setStep] = useState(0);
    const [completed, setCompleted] = useState(false);

    const [formData, setFormData] = useState<{
        nome: string;
        telefone: string;
        tempoAcidente: string;
        sequelas: string;
        advogado: string;
        detalhesSequelas: string;
        afastado: string;
    }>({
        nome: '',
        telefone: '',
        tempoAcidente: '',
        sequelas: '',
        advogado: '',
        detalhesSequelas: '',
        afastado: ''
    });

    const handleChange = (e: any) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleInput = (name: any, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const isElegivel = () => {
        const { sequelas, afastado, tempoAcidente, advogado } = formData;

        return (
            sequelas === 'sim' &&
            afastado === 'sim' &&
            advogado === 'nao' &&
            tempoAcidente === 'nao'
        );
    };

    const formatTelefone = (value: string) => {
        const numbers = value.replace(/\D/g, "");

        if (numbers.length <= 2) {
            return `(${numbers}`;
        }

        if (numbers.length <= 7) {
            return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
        }

        return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
    };


    const getImage = () => {
        if (!completed) return "/ana_paula.PNG";
        return isElegivel() ? "/ana_paula_feliz.png" : "/ana_paula_triste.png";
    };

    const getStepKeys = () => {
        const keys = ['tempoAcidente', 'sequelas', 'afastado', 'advogado'];
        if (isElegivel()) {
            keys.push('nome');
            keys.push('telefone');
        }
        return keys;
    };

    const isStepValid = () => {
        const keys = getStepKeys();
        const currentKey = keys[step];
        if (!currentKey) return true;

        switch (currentKey) {
            case 'tempoAcidente':
            case 'sequelas':
            case 'afastado':
            case 'advogado':
            case 'nome':
            case 'telefone':
                return formData[currentKey].trim() !== '';
            default:
                return true;
        }
    };

    const handleNext = async (e?: any) => {
        if (e) e.preventDefault();
        if (!isStepValid()) return;

        const keys = getStepKeys();
        const next = step + 1;

        // 👉 se completou o formulário
        if (next >= keys.length) {

            // só envia pro banco se for elegível
            if (isElegivel()) {
                const contactForm = new FormData();
                contactForm.append("name", formData.nome);
                contactForm.append("number", formData.telefone);

                await ContactUsers({}, contactForm);
            }

            setCompleted(true);
            return;
        }

        setStep(next);
    };


    const getSteps = () => {
        const stepDataAcidente = (
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">
                    Faz mais de 15 anos o seu acidente? 
                </label>

                <div className="flex items-center mb-4">
                    <label className="mr-4">
                        <input type="radio" name="tempoAcidente" value="sim" checked={formData.tempoAcidente === 'sim'} onChange={handleChange} /> Sim
                    </label>
                    <label>
                        <input type="radio" name="tempoAcidente" value="nao" checked={formData.tempoAcidente === 'nao'} onChange={handleChange} /> Não
                    </label>
                </div>
            </div>
        );

        const stepFratura = (
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">Houve Fratura?</label>
                <div className="flex items-center mb-4">
                    <label className="mr-4">
                        <input type="radio" name="sequelas" value="sim" checked={formData.sequelas === 'sim'} onChange={handleChange} /> Sim
                    </label>
                    <label>
                        <input type="radio" name="sequelas" value="nao" checked={formData.sequelas === 'nao'} onChange={handleChange} /> Não
                    </label>
                </div>
            </div>
        );

        const stepAfastado = (
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">Ficou afastado pelo INSS?</label>
                <div className="flex items-center mb-4">
                    <label className="mr-4">
                        <input type="radio" name="afastado" value="sim" checked={formData.afastado === 'sim'} onChange={handleChange} /> Sim
                    </label>
                    <label>
                        <input type="radio" name="afastado" value="nao" checked={formData.afastado === 'nao'} onChange={handleChange} /> Não
                    </label>
                </div>
            </div>
        );

        const stepAdvogado = (
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">Chegou a dar entrada com o advogado contra o INSS?</label>
                <div className="flex items-center mb-4">
                    <label className="mr-4">
                        <input type="radio" name="advogado" value="sim" checked={formData.advogado === 'sim'} onChange={handleChange} /> Sim
                    </label>
                    <label>
                        <input type="radio" name="advogado" value="nao" checked={formData.advogado === 'nao'} onChange={handleChange} /> Não
                    </label>
                </div>
            </div>
        );

        const stepNome = (
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">Qual seu nome?</label>
                <input
                    type="text"
                    value={formData.nome}
                    onChange={(e) => handleInput('nome', e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
            </div>
        );

        const stepTelefone = (
            <div className="mt-6">
                <label className="block text-sm font-medium mb-2">Telefone para contato</label>
                <input
                    type="tel"
                    value={formData.telefone}
                    maxLength={16}
                    onChange={(e) => {
                        const formatted = formatTelefone(e.target.value);
                        handleInput("telefone", formatted);
                    }}
                    className="w-full p-2 border rounded"
                    placeholder="(99) 9 9999-9999"
                    required
                />
            </div>
        );

        const steps = [stepDataAcidente, stepFratura, stepAfastado, stepAdvogado];

        if (isElegivel()) {
            steps.push(stepNome, stepTelefone);
        }

        return steps;
    };

    const renderContent = () => {
        const steps = getSteps();

        if (completed) {
            return (
                <div className="mt-6 text-center">
                    {isElegivel() ? (
                        <>
                            <p className="text-lg font-semibold">🎉 Parabéns!</p>
                            <p className="text-md mb-6">Logo iremos entrar em contato com você.</p>
                        </>
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-red-600">Puxa, que pena!</p>
                            <p className="text-md px-4 mb-6">
                                Parece que você não se enquadra nos requisitos. <br />
                                Mas você pode visitar nosso site e saber mais sobre como funciona a indenização de acidentes.
                            </p>
                        </>
                    )}

                    <Link href="/" className="mx-auto block w-fit mt-6">
                        <Button>Acessar o site</Button>
                    </Link>
                </div>
            );
        }

        return steps.slice(0, step + 1).map((content, index) => (
            <div key={index} className={`mt-6 ${index === step ? 'animate-fadeIn' : ''}`}>
                {content}
            </div>
        ));
    };

    const steps = getSteps();
    const atLastStep = step >= steps.length - 1;



    return (
        <section className="flex min-h-screen bg-zinc-50 px-4 overflow-hidden dark:bg-transparent">

            {/* FOTO COM TAMANHOS PERSONALIZADOS */}
            <Image
                src={getImage()}
                width={200}
                height={200}
                alt="boneca ana paula"
                className="absolute right-0 sm:right-44 pt-[450px] sm:pt-44 
                   w-40 sm:w-44 md:w-64 lg:w-64"
            />

            <form className="mx-auto py-10 w-full max-w-[800px] h-full">
                <div className="bg-card h-[85vh] rounded-lg border flex flex-col">

                    {/* HEADER FIXO */}
                    <div className="p-8 pb-0 text-center sticky top-0 bg-card z-10">
                        <Link href="/" aria-label="go home" className="mx-auto block w-fit">
                            <Image src="/paranaseguros.png" height={20} width={140} alt="DPVAT Paraná" />
                        </Link>
                        <h1 className="mb-1 mt-4 text-xl font-semibold">Conte-nos sobre você</h1>
                    </div>

                    {/* ÁREA COM SCROLL INTERNO */}
                    <div className="overflow-y-auto flex-1 px-8 pb-6">
                        {renderContent()}

                        {!completed && (
                            <div className="mt-6 text-center">
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={!isStepValid()}
                                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
                                >
                                    {atLastStep ? 'Concluir' : 'Próximo'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </form>

            <style jsx>{`
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-in-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </section>
    );
}
