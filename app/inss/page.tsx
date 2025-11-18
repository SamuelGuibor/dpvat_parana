/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { HeroHeader } from "../section/hero9-header";
import Footer from "../section/footer";
import { Disclosure } from "@headlessui/react";
import { ChevronUpIcon } from "lucide-react";
import { Input } from "../_components/ui/input";
import { Textarea } from "../_components/ui/textarea";
import { Button } from "@/app/_components/ui/button";
import { FaUser } from "react-icons/fa";
import { FaPhoneAlt } from "react-icons/fa";
import { FaWhatsapp } from "react-icons/fa";
import { ContactUsers } from "@/app/_actions/createContact";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

const faqList = [
    {
        question: "Quem pode receber o Seguro DPVAT?",
        answer:
            "Qualquer vítima de acidente de trânsito, mesmo que não tenha CNH ou que tenha sido responsável pelo acidente.",
    },
    {
        question: "Quais documentos são necessários?",
        answer:
            "Documentos pessoais, boletim de ocorrência, laudo médico, entre outros. Nossa equipe te orienta em todos os passos.",
    },
    {
        question: "Preciso pagar algo pelo atendimento?",
        answer: "Não. A primeira análise é totalmente gratuita e sem compromisso.",
    },
    {
        question: "Quanto tempo demora para receber o valor?",
        answer:
            "O tempo pode variar, mas normalmente o processo leva entre 30 a 90 dias, dependendo da documentação.",
    },
    {
        question: "Acidentes antigos ainda têm direito?",
        answer:
            "Sim, em muitos casos há direito até 3 anos após a data do acidente. Entre em contato para verificar seu caso.",
    },
];


function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button
            type="submit"
            className="w-full h-12 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-md font-semibold mt-2"
            disabled={pending}
        >
            <FaWhatsapp /> {pending ? 'Enviando...' : 'Enviar Mensagem'}
        </Button>
    );
}

export default function Inss() {
    const initialState = { success: false, message: 'Erro ao enviar Contato' };
    const whatsappUrl =
        "https://wa.me/5541997862323?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20seguro%20DPVAT";
    const formRef = useRef<HTMLFormElement>(null);
    const [state, formAction] = useFormState(ContactUsers, initialState);
    const [value, setValue] = useState("");


    const formatPhone = (raw: string) => {
        // Remove qualquer coisa que não seja número
        raw = raw.replace(/\D/g, "");

        // Limita a 11 dígitos
        raw = raw.slice(0, 11);

        // (99)
        if (raw.length <= 2) return `(${raw}`;

        // (99) 9
        if (raw.length <= 3) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;

        // (99) 9XXXX
        if (raw.length <= 7)
            return `(${raw.slice(0, 2)}) ${raw.slice(2, 3)}${raw.slice(3)}`;

        // (99) 9XXXX-XXXX
        return `(${raw.slice(0, 2)}) ${raw.slice(2, 3)}${raw.slice(3, 7)}-${raw.slice(7)}`;
    };

    const handleChange = (e: any) => {
        const input = e.target.value;
        const formatted = formatPhone(input);
        setValue(formatted);
    };

    useEffect(() => {
        if (state.success) {
            toast.success('Enviado com sucesso');
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } else if (state.message) {
            toast.error("Erro ao enviar Contato");
        }
    }, [state]);
    return (
        <>
            <HeroHeader />
            <main className="overflow-hidden bg-white text-gray-800">
                <div className="relative h-[500px]">
                    <img
                        src="/mulhera.jpg"
                        alt="Seguro contra terceiros"
                        className="absolute w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col pt-24 items-center text-center px-4 z-10">
                        {/* <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Assessoria para o INSS
                        </h1> */}

                        <div className="mx-auto w-[320px] sm:w-[480px] bg-white rounded-3xl p-6 shadow-lg">
                            <h1 className="text-center text-md font-light leading-tight">
                                Proteja <span className="font-bold">Seus Direitos</span> com <span className="font-bold">Especialistas em Seguros</span>
                            </h1>


                            <form
                                ref={formRef}
                                className="mt-5 space-y-4"
                                action={formAction}
                            >
                                <div className="relative">
                                    <span className="absolute left-3 top-4 text-gray-500">
                                        <FaUser />
                                    </span>

                                    <Input
                                        name="name"
                                        placeholder="Nome"
                                        className="pl-10 h-12 rounded-xl bg-gray-100 border-0 shadow-inner"
                                        required
                                    />
                                </div>

                                <div className="relative">
                                    <span className="absolute left-3 top-4 text-gray-500">
                                        <FaPhoneAlt />
                                    </span>

                                    <Input
                                        name="number"
                                        placeholder="Telefone | WhatsApp"
                                        className="pl-10 h-12 rounded-xl bg-gray-100 border-0 shadow-inner"
                                        value={value}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div>
                                    <Textarea
                                        name="desc"
                                        placeholder="Comente um pouco sobre seu acidente | (opcional)"
                                        className="h-24 rounded-xl bg-gray-100 border-0 shadow-inner mt-1"
                                    />
                                </div>

                                <SubmitButton />
                            </form>
                        </div>

                        {/* <a
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                        >
                            Fale com um Especialista
                        </a> */}
                    </div>
                </div>

                <section className="py-16 px-6 lg:px-32">
                    <div>
                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Assessoria Especializada em Auxílio Acidente
                        </h1>

                        <p className="mb-10 text-lg max-w-3xl mx-auto text-center">
                            O auxílio-acidente é um suporte oferecido pelo INSS a trabalhadores que passaram por acidentes, resultando em sequelas que afetam sua capacidade laboral.
                        </p>

                        <p className="mb-10 text-lg max-w-3xl mx-auto text-center">
                            Caso você tenha enfrentado um acidente e esteja inseguro sobre seu funcionamento ou queira compreender melhor as normas atualizadas desse benefício, prossiga na leitura para descobrir todos os seus direitos.
                        </p>
                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Como funciona o auxílio-acidente
                        </h1>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            O Auxílio-acidente do INSS serve como uma compensação financeira para o segurado cuja habilidade de trabalhar foi reduzida por causa de um acidente, independentemente de ser ou não laboral.
                        </p>

                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>
                                Diferentemente do auxílio-doença (benefício por incapacidade temporária), que tem duração limitada, o auxílio-acidente é contínuo e geralmente cessa apenas com a aposentadoria do trabalhador.
                            </li>
                            <li>
                                Ele se distingue também da aposentadoria por invalidez (benefício por incapacidade permanente), pois quem recebe auxílio-acidente pode seguir trabalhando e auferindo salário.
                            </li>
                        </ul>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Dessa forma, o auxílio-acidente atua como uma indenização mensal concedida pelo INSS a quem sofreu um acidente com sequelas permanentes que diminuem sua aptidão para atividades laborais.
                        </p>

                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Quem tem direito ao auxílio-acidente?
                        </h1>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Nem todos os trabalhadores afiliados ao INSS têm acesso ao auxílio-acidente; veja a seguir quem pode fazer jus a esse benefício:
                        </p>

                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Auxílio-acidente: quem pode receber:
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Empregado (celetista)</li>
                            <li>Trabalhador rural e segurado especial</li>
                            <li>Empregada doméstica</li>
                            <li>Trabalhador avulso</li>
                        </ul>

                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Auxílio-acidente: quem não pode receber:
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Contribuintes individuais</li>
                            <li>MEI (Microempreendedor individual)</li>
                            <li>Segurados facultativos</li>
                        </ul>

                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Quais são os requisitos do auxílio-acidente?
                        </h1>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Para requerer o auxílio-acidente, o trabalhador precisa cumprir certos critérios:
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Ter passado por um acidente: pode ser qualquer tipo de evento, não exige que seja relacionado ao trabalho</li>
                            <li>Apresentar sequelas que comprometam ou diminuam a capacidade laboral</li>
                            <li>Possuir qualidade de segurado na data do acidente: estar contribuindo para o INSS ou estar no período de graça</li>
                            <li>Atenção: o direito ao auxílio-acidente não depende de um número mínimo de contribuições (não há carência).</li>
                        </ul>

                        <div className="pb-10 px-6 lg:px-32">
                            <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-6 shadow-md">
                                <h2 className="text-xl font-bold mb-4 text-center">Exemplo</h2>
                                <p className="text-lg text-gray-700 text-left">
                                    Lucca trabalha como empregado registrado em uma fábrica de móveis. Ele sofreu um acidente de trânsito no fim de semana, durante seu período de folga, e acabou perdendo uma mão.
                                </p>
                                <br />
                                <p className="text-lg text-gray-700 text-left">
                                    Lucca ficou afastado do emprego devido ao acidente, recebendo auxílio-doença (benefício por incapacidade temporária) até estar apto a voltar ao trabalho.
                                </p>
                                <br />
                                <p className="text-lg text-gray-700 text-left">
                                    Após o término do benefício por incapacidade temporária, Lucca retornou ao trabalho e poderá receber o auxílio-acidente, pois o acidente deixou uma sequela permanente que reduziu sua capacidade laboral.
                                </p>
                                <br />
                                <p className="text-lg text-gray-700 text-left">
                                    Note que o auxílio-acidente é um benefício indenizatório, com a função de “compensar” a diminuição da capacidade para o trabalho.
                                </p>
                                <br />
                                <p className="text-lg text-gray-700 text-left">
                                    Assim, Lucca pode retomar suas atividades e, ao mesmo tempo, receber uma indenização mensal devido às suas limitações.
                                </p>
                            </div>
                        </div>

                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Qual é o valor do auxílio-acidente?
                        </h1>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            O valor do auxílio-acidente equivale a 50% do salário de benefício, calculado a partir da média das contribuições do trabalhador ao INSS.
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Essa média considera todos os salários de contribuição desde julho de 1994. Ressalta-se que, por ser de natureza indenizatória, o benefício é pago mesmo que o trabalhador volte a trabalhar e receba salário.
                        </p>
                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Como calcular o valor do auxílio-acidente?
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Para determinar o valor do auxílio-acidente, siga estas etapas:
                        </p>
                        <ol className="list-decimal mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Defina o salário de benefício: Some todos os salários do trabalhador desde julho de 1994 e divida pelo total de meses usados no cálculo.</li>
                            <li>Calcule 50% do salário de benefício: O valor final do auxílio-acidente será metade do resultado obtido.</li>
                        </ol>

                        <div className="pb-10 px-6 lg:px-32">
                            <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-6 shadow-md">
                                <h2 className="text-xl font-bold mb-4 text-center">Exemplo</h2>
                                <p className="text-lg text-gray-700 text-center">
                                    Um trabalhador com média salarial de R$ 3.000,00
                                </p>
                                <p className="text-lg text-gray-700 text-left">
                                    - 50% de R$ 3.000,00 = R$ 1.500,00
                                </p>
                                <p className="text-lg text-gray-700 text-left">
                                    - <span className="font-bold">Valor do auxílio-acidente:</span> R$ 1.500,00
                                </p>
                            </div>
                        </div>
                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Quem recebe auxílio-acidente tem direito a décimo terceiro?
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            O auxílio-acidente não inclui o pagamento de décimo terceiro, uma vez que possui caráter indenizatório. Diferentemente do auxílio-doença ou de qualquer aposentadoria, que oferecem décimo terceiro por serem benefícios que substituem a renda salarial.
                        </p>

                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Como solicitar o auxílio-acidente?
                        </h1>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            A solicitação do auxílio-acidente pode ser feita pelo telefone 135, seguindo os passos a seguir:
                        </p>
                        <ol className="list-decimal mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Entre em contato com a Central de Atendimento do INSS pelo número 135</li>
                            <li>Quando solicitado, informe lentamente o número do seu CPF</li>
                            <li>Registre o número do protocolo de atendimento que será fornecido</li>
                            <li>Espere na linha e, ao ser orientado, pressione 0 (zero) para falar com um atendente</li>
                            <li>Agora, basta comunicar ao atendente que deseja solicitar o auxílio-acidente.</li>
                            <li>Compareça à agência do INSS na data e horário agendados, levando documentos de identificação e todos os relatórios médicos (atestado, laudo ou relatório) e exames originais.</li>
                            <li>Você pode verificar o progresso do seu pedido pelo site ou aplicativo Meu INSS, na seção “Consultar pedidos”, ou pelo telefone 135.</li>
                        </ol>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            <strong>Atenção:</strong> Não há uma opção específica para requerer o auxílio-acidente no Meu INSS; algumas pessoas agendam a perícia como se fosse um benefício por incapacidade.
                        </p>
                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Quem recebe auxílio-acidente precisa de perícia?
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Sim, é obrigatório passar por uma perícia médica no INSS para que o perito avalie se o trabalhador realmente tem direito ao auxílio-acidente, ou seja, se possui uma limitação permanente para o trabalho devido a um acidente. O acompanhamento do pedido e o resultado da perícia podem ser verificados no Meu INSS, em “Consultar Pedidos”. Caso o pedido seja recusado, é possível pedir uma nova avaliação judicial.
                        </p>

                        <div className="pb-10 px-6 lg:px-32">
                            <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-6 shadow-md">
                                <h2 className="text-xl font-bold mb-4 text-center">Pente fino do INSS no Auxílio-acidente</h2>
                                <p className="text-lg text-gray-700 text-center">
                                    Quem recebe auxílio-acidente pode ser submetido ao pente-fino do INSS, ou seja, ser convocado pelo INSS para uma nova perícia e reexame de suas limitações. Uma lei de 2022 permitiu essa reavaliação.
                                </p>
                                <p className="text-lg text-blue-900 font-semibold mt-4 text-center">
                                    <span className="font-bold">Mas atenção: </span> quem já recebe o Auxílio-acidente por mais de 10 anos está dispensado do pente fino.
                                </p>
                            </div>
                        </div>

                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Documentos necessários para solicitar o auxílio-acidente
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Documento oficial de identificação com foto (RG ou CNH)</li>
                            <li>CPF</li>
                            <li>Comprovante de endereço</li>
                            <li>Carteira de trabalho, contracheques ou outro comprovante de vínculo empregatício</li>
                            <li>Laudos médicos, exames, receitas e atestados que atestem as sequelas do acidente</li>
                            <li>Comunicado de Acidente de Trabalho (CAT), se o acidente ocorreu no ambiente laboral (auxílio-acidente de trabalho)</li>
                        </ul>

                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            Como funciona o pagamento do auxílio-acidente?
                        </h1>

                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            A legislação estabelece que o pagamento do auxílio-acidente deve iniciar logo após o término do auxílio-doença (seja previdenciário ou acidentário).
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            A ideia é a seguinte: quando alguém sofre um acidente, geralmente fica afastado pelo INSS, mas, mesmo voltando ao trabalho, pode manter sequelas que dificultem as tarefas anteriores. Assim, o INSS deveria, de maneira automática, começar a pagar o auxílio-acidente para compensar a perda de capacidade laboral.
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Contudo, é raro que o INSS reconheça esse direito e inicie o pagamento por conta própria, sendo comum que seja necessário recorrer à Justiça.
                        </p>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            <strong>Atenção:</strong> Não é obrigatório que o trabalhador tenha pedido ou recebido auxílio-doença (afastamento) no momento do acidente para ter direito ao auxílio-acidente. Basta requerer o benefício no INSS e aguardar a decisão.
                        </p>

                        <div className="w-full h-1 bg-red-600 mx-auto max-w-4xl mb-10"></div>

                        <h1 className="text-4xl font-bold mb-6 text-center text-blue-700">
                            É possível acumular auxílio-acidente com outros benefícios?
                        </h1>

                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            É permitido acumular o auxílio-acidente com os seguintes benefícios do INSS:
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Pensão por morte</li>
                            <li>Salário-maternidade</li>
                            <li>Auxílio-reclusão</li>
                            <li>Auxílio-doença, desde que não esteja ligado à mesma sequela que originou o Auxílio-acidente</li>
                        </ul>
                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Não é permitido acumular auxílio-acidente com os benefícios:
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Qualquer tipo de aposentadoria do INSS</li>
                            <li>Outro auxílio-acidente</li>
                            <li>Auxílio-doença, quando decorrente da mesma causa ou acidente</li>
                        </ul>

                        <div className="pb-10 px-6 lg:px-32">
                            <div className="max-w-4xl mx-auto bg-white border border-gray-300 rounded-lg p-6 shadow-md">
                                <p className="text-lg text-gray-700 text-center">
                                    <span className="font-bold">Atenção:</span> o auxílio-acidente é concedido como compensação e, por isso, pode ser combinado com o salário do trabalhador.
                                </p>
                            </div>
                        </div>

                        <p className="mb-4 text-lg max-w-5xl mx-auto font-bold text-center">
                            Quando o auxílio-acidente é interrompido?
                        </p>
                        <ul className="list-disc mb-10 text-lg max-w-4xl mx-auto pl-10">
                            <li>Quando o trabalhador se aposenta</li>
                            <li>Quando solicitar a Certidão de Tempo de Contribuição (CTC) para fins de transferência a um Regime Próprio de Previdência Social (RPPS)</li>
                            <li>Se a incapacidade parcial e permanente para o trabalho deixar de existir (será avaliado por perícia médica no INSS)</li>
                            <li>Em caso de falecimento do beneficiário</li>
                        </ul>
                        <p className="mb-10 text-lg max-w-5xl mx-auto text-center">
                            Se o seu benefício for suspenso ou negado de forma injustificada, você pode apelar diretamente no INSS ou buscar seus direitos na Justiça.
                        </p>
                    </div>
                </section>


                <section className="relative mt-10">
                    <img
                        src="/auxilio2.png"
                        alt="Ajuda com seguro contra terceiros"
                        className="w-full h-[270px] object-cover object-[center_-630px]"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center text-white text-center px-4">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Assesoria de Auxilio Acidente
                        </h2>
                        <p className="text-lg mb-6 max-w-2xl">
                            Entre em contato agora mesmo e agende uma visita. Estamos aqui para ajudar!
                        </p>
                        <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-lg text-white font-semibold"
                        >
                            Agendar Visita
                        </a>
                    </div>
                </section>
                <section className="relative py-16 px-6 lg:px-32">
                    <h2 className="text-2xl font-semibold text-blue-600 mb-8 text-center">
                        Perguntas Frequentes
                    </h2>

                    <div className="space-y-4 max-w-4xl mx-auto">
                        {faqList.map((item, idx) => (
                            <Disclosure key={idx}>
                                {({ open }) => (
                                    <div className="border rounded-lg p-4">
                                        <Disclosure.Button className="flex justify-between w-full text-left font-medium text-gray-900">
                                            {item.question}
                                            <ChevronUpIcon
                                                className={`w-5 h-5 transition-transform ${open ? "rotate-180" : ""
                                                    }`}
                                            />
                                        </Disclosure.Button>
                                        <Disclosure.Panel className="mt-2 text-gray-700">
                                            {item.answer}
                                        </Disclosure.Panel>
                                    </div>
                                )}
                            </Disclosure>
                        ))}
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}