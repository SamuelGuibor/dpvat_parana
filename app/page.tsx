import { Faq } from "./section/faq";
import Footer from "./section/footer";
import Hero from "./section/hero-section";
import Objetivos from "./section/objetivos";
import Stats from "./section/stats";

export default function Home() {
  const faqItems = [
    {
      id: "faq-1",
      question: "O que é o seguro DPVAT?",
      answer:
        "É um seguro social que indeniza vítimas de acidentes de trânsito, sem apuração de culpa.",
    },
    {
      id: "faq-2",
      question: "Quem pode ser beneficiado pelo DPVAT?",
      answer:
        "Todas as pessoas que sofreram acidentes envolvendo um veículo automotor de via terrestre têm direito a pleitear indenização.",
    },
    {
      id: "faq-3",
      question: "Somente motoristas podem dar entrada no DPVAT?",
      answer:
        "Não. O seguro DPVAT é para motoristas, passageiros e pedestres envolvidos no acidente de trânsito.",
    },
    {
      id: "faq-4",
      question: "Menor de idade tem direito ao DPVAT?",
      answer:
        "Sim, nesse caso a indenização será paga ao representante legal da criança (pai, mãe ou tutor).",
    },
    {
      id: "faq-5",
      question: "Quais são os valores da indenização do DPVAT?",
      answer:
        "A tabela do DPVAT prevê indenização de até R$ 13.500 para casos de morte e invalidez permanente. Outros valores vão depender de acordo com a lesão e fratura no corpo",
    },
    {
      id: "faq-6",
      question: "Em quais regiões do Paraná o DPVAT presta acessoria?",
      answer:
        "Nossa consultoria DPVAT abrange as regiões de Curitiba, Ponta Grossa e Maringá.",
    },
    {
      id: "faq-7",
      question: "Qual é o prazo para recebimento?",
      answer:
        "O processo total dura em torno de 60 dias. Quanto antes você fizer contato, mais rápido vai sair sua indenização.",
    },
  ];

  return (
    <div>
      <Hero />
      <Stats />
      <Objetivos />
      <Faq
        heading="Perguntas Frequentes"
        description="Tudo o que você precisa saber sobre o DPVAT. Não encontrou a resposta que procura? Sinta-se à vontade para entrar em contato com nossa equipe de suporte"
        items={faqItems}
        supportHeading="Precisa de mais suporte?"
        supportDescription="Nossa equipe de suporte dedicada está aqui para ajudar você com qualquer dúvida ou preocupação. Entre em contato para assistência personalizada."
        supportButtonText="Contactar Suporte"
        supportButtonUrl=""
      />
      <Footer />
    </div>
  );
}
