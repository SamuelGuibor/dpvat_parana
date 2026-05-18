/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { Calendar, User, Clock, Share2, Facebook, Twitter, Linkedin, Mail, Tag, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from "react";

import { Footer } from '../../_components/landing_page/Footer';
import { Header } from '../../_components/landing_page/Header';

const exemploLines: { type: "large" | "small"; text: string }[] = [
    { type: "large", text: "Juliana trabalha como operadora de caixa em um supermercado e sustenta a casa junto com o marido." },
    { type: "large", text: "Durante a gravidez, ela continuou trabalhando normalmente para garantir a renda da família e se organizar para a chegada do bebê." },
    { type: "small", text: "Pouco antes do nascimento da filha, ela deu entrada no salário-maternidade. Como tem carteira assinada, teve direito à licença e continuou recebendo sua remuneração mensal durante o afastamento." },
    { type: "small", text: "Esse benefício foi essencial para que ela pudesse ficar em casa nos primeiros meses — cuidando da recuperação pós-parto e da nova rotina — sem abrir mão da renda da família." },
    { type: "small", text: "Durante os 120 dias de licença, o pagamento foi realizado normalmente junto ao salário, trazendo mais segurança financeira nesse período tão importante." },
    { type: "small", text: "Ao fim da licença-maternidade, Juliana retornou ao trabalho com todos os seus direitos trabalhistas e a estabilidade garantida por lei." },
];

function AnimatedLine({
    text,
    type,
    delay,
    triggered,
}: {
    text: string;
    type: "large" | "small";
    delay: number;
    triggered: boolean;
}) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!triggered) return;
        const t = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(t);
    }, [triggered, delay]);

    return (
        <div
            style={{
                position: "relative",
                overflow: "hidden",
                marginTop: type === "large" ? "0.9rem" : "0.7rem",
            }}
        >
            <span
                style={{
                    position: "absolute",
                    bottom: 2,
                    left: 0,
                    height: 2,
                    borderRadius: 1,
                    background: "#1d4ed8",
                    opacity: 0.16,
                    width: visible ? "100%" : "0%",
                    transition: "width 0.75s cubic-bezier(0.22,1,0.36,1)",
                }}
            />
            <p
                style={{
                    margin: 0,
                    paddingBottom: 5,
                    fontSize: type === "large" ? "1rem" : "0.93rem",
                    lineHeight: type === "large" ? "1.7" : "1.65",
                    color: type === "large" ? "#18181b" : "#3f3f46",
                    fontWeight: type === "large" ? 500 : 400,
                    transform: visible ? "translateY(0)" : "translateY(13px)",
                    opacity: visible ? 1 : 0,
                    transition: "transform 0.65s cubic-bezier(0.22,1,0.36,1), opacity 0.55s ease",
                }}
            >
                {text}
            </p>
        </div>
    );
}

export default function BlogArticle() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const [sectionTriggered, setSectionTriggered] = useState(false);

    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setSectionTriggered(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <Header />

            {/* Breadcrumb */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <nav className="flex items-center gap-2 text-sm">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">INSS</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">Como funciona o auxílio maternidade</span>
                    </nav>
                </div>
            </div>

            <article className="bg-zinc-50">
                {/* HERO */}
                <section className="max-w-7xl mx-auto px-6 lg:px-12 pt-20 pb-16">
                    <div className="mb-16">
                        <span className="uppercase tracking-[0.3em] text-sm text-blue-700">
                            INSS • BENEFÍCIOS
                        </span>
                        <h1 className="text-5xl lg:text-7xl leading-none text-zinc-900 mt-6 max-w-4xl">
                            O que é a licença maternidade?
                        </h1>
                    </div>

                    <div className="grid lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-9">
                            <Image
                                width={1600}
                                height={1000}
                                src="https://images.unsplash.com/photo-1489760176169-fd3d32805239?q=80&w=1740&auto=format&fit=crop"
                                alt="Licença maternidade"
                                className="w-full h-[500px] object-cover rounded-xl"
                            />
                        </div>

                        <div className="lg:col-span-3">
                            <p className="text-2xl leading-tight text-zinc-900 font-semibold uppercase">
                                Entenda quem possui direito ao benefício e como funciona a licença-maternidade no Brasil.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 mt-10 text-sm text-zinc-500">
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Seguros Paraná
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            12 de maio de 2026
                        </div>
                    </div>
                </section>

                <section className="max-w-6xl mx-auto py-12 px-6 lg:px-12">
                    <div className="grid lg:grid-cols-12 gap-12">
                        <div className="lg:col-span-4">
                            <h2 className="text-3xl leading-tight text-zinc-900">
                                O auxílio-maternidade garante estabilidade financeira durante os primeiros meses após o nascimento da criança.
                            </h2>
                        </div>

                        <div className="lg:col-span-8 space-y-8 text-lg leading-9 text-zinc-700">
                            <p>O auxílio-maternidade é um dos direitos mais importantes para mulheres que precisam se afastar do trabalho durante a gestação, parto ou adoção.</p>
                            <p>O benefício garante que a segurada continue recebendo sua renda durante o período de licença, oferecendo mais segurança financeira para a família nesse momento tão importante.</p>
                            <p>Além da proteção à mãe, o benefício também ajuda no desenvolvimento saudável da criança, permitindo que os primeiros meses sejam dedicados aos cuidados e adaptação da nova rotina familiar.</p>
                        </div>
                    </div>
                </section>

                <section className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
                    <Image
                        width={1600}
                        height={900}
                        src="https://images.unsplash.com/photo-1560707854-fb9a10eeaace?q=80&w=1740&auto=format&fit=crop"
                        alt="Mãe com bebê"
                        className="w-full h-[600px] object-cover rounded-xl"
                    />
                </section>

                <section className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-10 py-16 border-l-4 border-blue-700 bg-white">
                    <div className="max-w-3xl">
                        <h2 className="text-3xl lg:text-4xl text-zinc-900 leading-tight mb-10">
                            Quem tem direito ao benefício?
                        </h2>

                        {/* Lista de direitos */}
                        <div className="mb-12">
                            <span className="block uppercase text-blue-700 text-xs tracking-widest font-medium mb-4">
                                Têm direito ao salário-maternidade:
                            </span>
                            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-base text-zinc-700">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 mt-1.5">•</span>
                                    Trabalhadoras com carteira assinada
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 mt-1.5">•</span>
                                    Trabalhadoras domésticas
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 mt-1.5">•</span>
                                    MEIs e autônomas
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 mt-1.5">•</span>
                                    Seguradas facultativas
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 mt-1.5">•</span>
                                    Trabalhadoras rurais
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600 mt-1.5">•</span>
                                    Pessoas que adotarem ou obtiverem guarda judicial
                                </li>
                            </ul>
                        </div>

                        {/* Exemplo Real */}
                        <div>
                            <span className="block uppercase text-blue-700 mb-4 text-xs tracking-widest font-medium">
                                Exemplo real
                            </span>

                            {exemploLines.map((line, i) => (
                                <AnimatedLine
                                    key={i}
                                    text={line.text}
                                    type={line.type}
                                    delay={i * 220}
                                    triggered={true}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* TWO COLUMN SECTION */}
                <section className="max-w-6xl mx-auto px-6 lg:px-12 py-12 border-t border-zinc-200">
                    <div className="grid lg:grid-cols-2 gap-20">
                        <div>
                            <h2 className="text-4xl text-zinc-900 mb-8">Quanto tempo dura?</h2>
                            <p className="text-lg leading-9 text-zinc-700">
                                Na maioria dos casos, a licença-maternidade possui duração de 120 dias...
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Durante esse período, a trabalhadora pode permanecer afastada do trabalho para cuidar do bebê, realizar consultas médicas, se recuperar do parto e adaptar a nova rotina familiar sem perder sua fonte de renda.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Em algumas empresas participantes do programa Empresa Cidadã, o prazo pode ser ampliado para 180 dias, totalizando seis meses de licença-maternidade.
                            </p>
                        </div>

                        <div>
                            <h2 className="text-4xl text-zinc-900 mb-8">
                                Como é feito o cálculo?
                            </h2>

                            <p className="text-lg leading-9 text-zinc-700">
                                Trabalhadoras com carteira assinada normalmente recebem o valor integral do salário durante o período da licença-maternidade.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Já para contribuintes individuais, autônomas, MEIs e seguradas facultativas, o cálculo costuma ser realizado com base na média das contribuições feitas ao INSS ao longo dos últimos meses.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                O valor do benefício pode variar conforme o histórico de pagamentos previdenciários, o tempo de contribuição e a categoria em que a segurada está enquadrada.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Em casos de desemprego, ainda pode existir direito ao salário-maternidade, desde que a pessoa mantenha a chamada “qualidade de segurada” perante o INSS.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Por isso, é importante realizar uma análise individual do caso para verificar corretamente o valor do benefício e quais documentos serão necessários para solicitar o pagamento.
                            </p>
                        </div>

                    </div>
                </section>
                <section className="max-w-6xl mx-auto px-5 lg:px-10 py-16">
                    <div className="grid lg:grid-cols-[320px_1fr] gap-10 lg:gap-14 items-start">

                        {/* Imagem lateral */}
                        <div className="hidden lg:block relative h-full min-h-[520px]">
                            <Image
                                src="https://images.unsplash.com/photo-1544652406-55174175da25?q=80&w=687&auto=format&fit=crop"
                                alt="Mãe com bebê"
                                fill
                                className="object-cover rounded-lg"
                            />
                        </div>

                        {/* Conteúdo */}
                        <div>

                            <span className="tracking-[0.35em] uppercase text-blue-700 text-xs">
                                Solicitação
                            </span>

                            <h2 className="text-4xl lg:text-5xl leading-tight text-zinc-900 mt-5 max-w-2xl">
                                Como solicitar o benefício?
                            </h2>

                            <div className="mt-10 space-y-7 text-base lg:text-lg leading-8 text-zinc-700">

                                <p>
                                    O pedido do salário-maternidade pode ser realizado de forma totalmente online,
                                    diretamente pelos canais oficiais do INSS. Atualmente, a maioria das solicitações
                                    é feita pelo aplicativo Meu INSS ou pelo site oficial da Previdência Social.
                                </p>

                                <p>
                                    Em alguns casos, principalmente quando existem dúvidas sobre contribuições,
                                    vínculos empregatícios ou períodos de carência, pode ser necessário complementar
                                    informações ou apresentar documentos adicionais.
                                </p>

                                <p>
                                    Também é possível realizar a solicitação pela central telefônica 135
                                    ou com auxílio de profissionais especializados que acompanham todo o processo.
                                </p>

                            </div>

                            {/* Cards */}
                            <div className="grid md:grid-cols-2 gap-6 mt-12">

                                <div className="border border-zinc-200 p-7 lg:p-8 rounded-lg bg-white">
                                    <h3 className="text-2xl lg:text-3xl text-zinc-900 mb-6">
                                        Documentos pessoais
                                    </h3>

                                    <ul className="space-y-5 text-base lg:text-lg text-zinc-700 leading-8">
                                        <li>• Documento com foto</li>
                                        <li>• CPF</li>
                                        <li>• Carteira de trabalho</li>
                                        <li>• Comprovantes de contribuição</li>
                                    </ul>
                                </div>

                                <div className="border border-zinc-200 p-7 lg:p-8 rounded-lg bg-white">
                                    <h3 className="text-2xl lg:text-3xl text-zinc-900 mb-6">
                                        Documentos da criança
                                    </h3>

                                    <ul className="space-y-5 text-base lg:text-lg text-zinc-700 leading-8">
                                        <li>• Certidão de nascimento</li>
                                        <li>• Termo de adoção</li>
                                        <li>• Guarda judicial</li>
                                        <li>• Documentos médicos, se necessário</li>
                                    </ul>
                                </div>

                            </div>

                        </div>
                    </div>
                </section>
                {/* NEGADO + CONCLUSÃO */}
                <section className="max-w-6xl mx-auto px-6 lg:px-12 py-24 border-t border-zinc-200">

                    <div className="grid lg:grid-cols-2 gap-20">

                        <div>
                            <span className="uppercase tracking-[0.3em] text-sm text-blue-700">
                                Negativa
                            </span>

                            <h2 className="text-4xl text-zinc-900 mt-6 mb-8">
                                O que fazer caso o benefício seja negado?
                            </h2>

                            <p className="text-lg leading-9 text-zinc-700">
                                Infelizmente, muitas pessoas acabam tendo o pedido negado pelo INSS por falta de documentos, erros cadastrais ou problemas relacionados às contribuições previdenciárias.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Nesses casos, é importante analisar cuidadosamente o motivo da negativa para verificar se ainda existe possibilidade de recurso ou apresentação de novos documentos.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Dependendo da situação, a segurada pode conseguir reverter a decisão administrativa e garantir o recebimento do benefício de forma retroativa.
                            </p>
                        </div>

                        <div>
                            <span className="uppercase tracking-[0.3em] text-sm text-blue-700">
                                Conclusão
                            </span>

                            <h2 className="text-4xl text-zinc-900 mt-6 mb-8">
                                Entenda seus direitos
                            </h2>

                            <p className="text-lg leading-9 text-zinc-700">
                                O salário-maternidade é um direito fundamental que garante mais proteção financeira e estabilidade durante um dos momentos mais importantes da vida familiar.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Conhecer as regras do benefício, entender quem possui direito e saber quais documentos são necessários pode evitar atrasos e dificuldades durante a solicitação.
                            </p>

                            <p className="text-lg leading-9 text-zinc-700 mt-6">
                                Caso existam dúvidas sobre o processo ou problemas relacionados ao pedido junto ao INSS, buscar orientação especializada pode fazer toda a diferença para garantir seus direitos de forma segura e mais rápida.
                            </p>

                        </div>
                    </div>
                </section>
                {/* CTA FINAL */}
                <section className="max-w-7xl mx-auto px-6 lg:px-12 pb-24">

                    <div className="relative overflow-hidden border border-zinc-200 bg-zinc-900">

                        {/* BACKGROUND IMAGE */}
                        <div className="absolute inset-0 opacity-20">
                            <Image
                                src="https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=1740&auto=format&fit=crop"
                                alt="Família feliz"
                                fill
                                className="object-cover"
                            />
                        </div>

                        {/* CONTENT */}
                        <div className="relative grid lg:grid-cols-12 gap-12 p-10 lg:p-20">

                            {/* LEFT */}
                            <div className="lg:col-span-4">
                                <span className="uppercase tracking-[0.3em] text-sm text-blue-400">
                                    Atendimento
                                </span>

                                <h2 className="text-5xl leading-tight text-white mt-6">
                                    Precisa de ajuda com seu benefício?
                                </h2>
                            </div>

                            {/* RIGHT */}
                            <div className="lg:col-span-8">

                                <p className="text-xl leading-10 text-zinc-300 max-w-3xl">
                                    Nossa equipe especializada pode auxiliar em todo o processo de solicitação do salário-maternidade,
                                    desde a análise inicial até o acompanhamento completo do pedido junto ao INSS.
                                </p>

                                <p className="text-lg leading-9 text-zinc-400 mt-8 max-w-3xl">
                                    Em muitos casos, erros simples, falta de documentação ou problemas no cadastro acabam atrasando
                                    o recebimento do benefício. Por isso, contar com orientação especializada pode ajudar a evitar
                                    dificuldades e tornar o processo muito mais rápido e seguro.
                                </p>

                                <div className="mt-12">
                                    <a
                                        href="/#contato"
                                        className="inline-flex items-center justify-center border border-white text-white px-10 py-4 text-lg hover:bg-white hover:text-zinc-900 transition-all duration-300"
                                    >
                                        Falar com especialista
                                    </a>
                                </div>

                            </div>

                        </div>
                    </div>

                </section>
                {/* ARTIGOS RELACIONADOS */}
                <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24 border-t border-zinc-200">

                    <div className="flex items-end justify-between mb-14">
                        <div>
                            <span className="uppercase tracking-[0.3em] text-sm text-blue-700">
                                Blog
                            </span>

                            <h2 className="text-5xl text-zinc-900 mt-4">
                                Artigos relacionados
                            </h2>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-10">
                        {[
                            {
                                title: "Como Funciona o Seguro DPVAT em 2025",
                                category: "DPVAT",
                                date: "15 de Dezembro, 2025",
                                image: "https://images.unsplash.com/photo-1637763723578-79a4ca9225f7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBhY2NpZGVudCUyMGluc3VyYW5jZXxlbnwxfHx8fDE3NjU4OTY4OTd8MA&ixlib=rb-4.1.0&q=80&w=1080",
                                link: '/blog-seguros-parana/dpvat'
                            },
                            {
                                title: "Documentos Necessários para Processos",
                                category: "Documentação",
                                date: "5 de Dezembro, 2025",
                                image: "https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHxsZWdhbCUyMGRvY3VtZW50cyUyMG9mZmljZXxlbnwxfHx8fDE3NjU5ODEwNDd8MA&ixlib=rb-4.1.0&q=80&w=1080",
                                link: '/blog-seguros-parana/documentacao'
                            },
                            {
                                title: "Auxílio-acidente: quem tem direito?",
                                category: "INSS",
                                date: "20 de Novembro, 2025",
                                image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?q=80&w=1740&auto=format&fit=crop",
                                link: '/blog-seguros-parana/auxilio-acidente'
                            }
                        ].map((article, index) => (
                            <Link
                                key={index}
                                href={article.link}
                                className="group block"
                            >
                                <div className="overflow-hidden bg-white">

                                    {/* IMAGEM */}
                                    <div className="overflow-hidden">
                                        <Image
                                            width={700}
                                            height={500}
                                            src={article.image}
                                            alt={article.title}
                                            className="w-full h-[320px] object-cover group-hover:scale-105 transition-transform duration-700"
                                        />
                                    </div>

                                    {/* CONTEÚDO */}
                                    <div className="pt-6">

                                        <span className="uppercase tracking-[0.25em] text-xs text-blue-700">
                                            {article.category}
                                        </span>

                                        <h3 className="text-2xl leading-tight text-zinc-900 mt-4 group-hover:text-blue-700 transition-colors">
                                            {article.title}
                                        </h3>

                                        <div className="flex items-center gap-2 mt-6 text-sm text-zinc-500">
                                            <Calendar className="w-4 h-4" />
                                            {article.date}
                                        </div>

                                    </div>

                                </div>
                            </Link>
                        ))}
                    </div>

                </section>
            </article>
            <Footer />
        </>
    );
}