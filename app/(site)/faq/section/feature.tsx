'use client'

import { useMemo, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { LuSearch, LuCarFront, LuLandmark, LuUserRound } from "react-icons/lu";
import { Badge } from "@/app/_shared/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/app/_shared/ui/accordion";

// FAQ da área do cliente — conteúdo em DADOS (não em JSX solto) pra permitir
// busca, agrupamento por categoria e keys únicas (o formato antigo repetia
// `value="item-3"`, o que fazia perguntas abrirem/fecharem juntas).

interface FaqItem {
  id: string;
  q: string;
  a: React.ReactNode;
  /** Texto plano usado só pela busca (sem markup). */
  searchText: string;
}

interface FaqCategory {
  key: string;
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  items: FaqItem[];
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-bold text-blue-600">{i + 1}.</span>
          <span className="font-semibold">{item}</span>
        </li>
      ))}
    </ul>
  );
}

const CATEGORIES: FaqCategory[] = [
  {
    key: "direitos",
    title: "Meus direitos após o acidente",
    subtitle: "DPVAT, prazos e indenizações",
    Icon: LuCarFront,
    items: [
      {
        id: "direitos-gerais",
        q: "Sofri um acidente, quais são os meus direitos?",
        searchText: "direitos acidente indenização RCF DPVAT INSS seguro de vida",
        a: (
          <>
            Um acidente pode dar direito a mais de uma indenização ao mesmo tempo.
            As principais são:
            <List items={[
              "Ação indenizatória contra o causador (RCF)",
              "Seguro DPVAT",
              "Auxílios do INSS",
              "Seguro de vida",
            ]} />
            <p className="mt-2">
              Nossa equipe analisa o seu caso e indica quais desses caminhos se aplicam a você.
            </p>
          </>
        ),
      },
      {
        id: "prazo-dpvat",
        q: "Qual o prazo para solicitar o DPVAT?",
        searchText: "prazo DPVAT 3 anos prescrição menor de idade",
        a: (
          <>
            A vítima tem até <b>3 anos, contados da data do acidente</b>, para dar entrada.
            <p className="mt-2">
              <b>Detalhe importante:</b> se a vítima era menor de idade, o prazo de 3 anos
              só começa a contar quando ela completa 18 anos.
            </p>
          </>
        ),
      },
      {
        id: "quem-tem-direito",
        q: "Quem tem direito ao Seguro DPVAT?",
        searchText: "quem tem direito DPVAT veículo automotor categorias",
        a: (
          <>
            Toda vítima de acidente envolvendo veículo automotor tem direito ao DPVAT —
            motorista, passageiro ou pedestre. Fique atento às categorias de indenização,
            pois cada uma tem requisitos diferentes.
          </>
        ),
      },
      {
        id: "tipos-indenizacao",
        q: "Quais são os tipos de indenização do DPVAT?",
        searchText: "tipos indenização DAMS despesas médicas invalidez morte",
        a: (
          <>
            <p><b>Despesas de Assistência Médica e Suplementares (DAMS)</b></p>
            <p className="mt-1">
              Reembolso de gastos causados pelo acidente: despesas médico-hospitalares em
              caráter privado, fisioterapia, medicamentos, equipamentos ortopédicos, órteses e
              próteses — sempre comprovados por recibos e notas fiscais no nome do beneficiário.
            </p>
            <p className="mt-3"><b>Danos corporais ou invalidez</b></p>
            <p className="mt-1">
              Para quem ficou com fratura, perda ou redução da função de um membro ou órgão.
              A invalidez permanente pode ser total ou parcial, conforme a perícia médica.
            </p>
            <p className="mt-3"><b>Morte</b></p>
            <p className="mt-1">
              Indenização devida à família nos casos de falecimento da vítima em decorrência
              do acidente.
            </p>
          </>
        ),
      },
      {
        id: "danos-materiais",
        q: "Tive só danos materiais, o DPVAT cobre?",
        searchText: "danos materiais sem fratura DAMS medicamentos",
        a: (
          <>
            Não — o DPVAT não cobre danos materiais (como o conserto do veículo). Mas se você
            teve gastos com medicamentos ou tratamento, é possível acionar o <b>DAMS</b>.
          </>
        ),
      },
      {
        id: "sequelas-sem-fratura",
        q: "Fiquei com sequelas, mas sem fratura. Posso receber?",
        searchText: "lesões sem fratura sequelas documentação médica",
        a: (
          <>
            Sim, há possibilidade — desde que exista documentação médica comprovando a
            debilidade. Nossa equipe orienta você sobre quais laudos são necessários.
          </>
        ),
      },
      {
        id: "outras-lesoes",
        q: "Além de fraturas, que outras lesões o DPVAT cobre?",
        searchText: "lesões ligamentos tendão luxação baço traumatismo visão",
        a: (
          <>
            Não há uma lista fechada — é o perito quem avalia. Alguns exemplos de casos em que
            a indenização pode ser concedida:
            <List items={[
              "Lesão nos ligamentos",
              "Rompimento do tendão",
              "Luxação acromioclavicular com cirurgia",
              "Retirada do baço",
              "Traumatismo craniano grave",
              "Perda de visão",
            ]} />
          </>
        ),
      },
      {
        id: "sem-bo",
        q: "Ainda não fiz o Boletim de Ocorrência. Perdi o direito?",
        searchText: "boletim de ocorrência B.O. prazo",
        a: (
          <>
            Não. O B.O. é um requisito, mas não precisa ser feito na hora do acidente.
            Só é preciso respeitar o prazo de 3 anos para dar entrada — e o boletim pode ser
            elaborado dentro desse período.
          </>
        ),
      },
      {
        id: "sem-cnh",
        q: "Não tenho habilitação. Posso receber o DPVAT?",
        searchText: "sem CNH habilitação",
        a: <>Sim. Não é preciso ter CNH para receber o Seguro DPVAT.</>,
      },
      {
        id: "calculo-valor",
        q: "Como é calculado o valor a receber?",
        searchText: "cálculo valor indenização lesões parte do corpo",
        a: (
          <>
            O valor é calculado com base nas lesões sofridas: cada parte do corpo e o grau da
            sequela têm um percentual correspondente, definido em tabela oficial e confirmado
            pela perícia médica.
          </>
        ),
      },
    ],
  },
  {
    key: "inss",
    title: "Benefícios do INSS",
    subtitle: "Auxílios e aposentadoria",
    Icon: LuLandmark,
    items: [
      {
        id: "beneficios-inss",
        q: "Quais benefícios do INSS eu posso receber?",
        searchText: "benefícios INSS auxílio acidente doença aposentadoria invalidez",
        a: (
          <>
            Dependendo do seu caso, você pode ter direito a:
            <List items={[
              "Auxílio-Acidente",
              "Auxílio-Doença",
              "Aposentadoria por Invalidez",
            ]} />
          </>
        ),
      },
      {
        id: "auxilio-acidente",
        q: "O que é o Auxílio-Acidente?",
        searchText: "auxílio acidente sequelas redução capacidade trabalho",
        a: (
          <>
            É um benefício do INSS pago ao trabalhador que sofreu um acidente e ficou com
            <b> sequelas que reduzem a capacidade de trabalho</b>. Ele funciona como uma
            indenização mensal — dá até para continuar trabalhando enquanto recebe.
          </>
        ),
      },
      {
        id: "auxilio-doenca",
        q: "O que é o Auxílio-Doença?",
        searchText: "auxílio doença afastamento trabalho incapacidade temporária",
        a: (
          <>
            É o benefício para quem precisa <b>se afastar do trabalho temporariamente</b> por
            conta de uma doença ou acidente que impede as atividades do dia a dia.
          </>
        ),
      },
      {
        id: "aposentadoria-invalidez",
        q: "O que é a Aposentadoria por Invalidez?",
        searchText: "aposentadoria invalidez incapacidade total permanente",
        a: (
          <>
            É o benefício para quem <b>não consegue mais trabalhar</b> devido a doença ou
            acidente. A incapacidade precisa ser total e permanente, sem perspectiva de
            reabilitação para qualquer profissão.
          </>
        ),
      },
    ],
  },
  {
    key: "processo",
    title: "Área do cliente e meu processo",
    subtitle: "Etapas, prazos e acompanhamento",
    Icon: LuUserRound,
    items: [
      {
        id: "acompanhar-status",
        q: "Como acompanho o status do meu processo?",
        searchText: "acompanhar status etapas área do cliente tempo real",
        a: (
          <>
            Na área do cliente, cada processo tem uma linha do tempo com a etapa atual:
            Iniciado, Aguardando Assinatura, Solicitação de Documentos, Coleta de Documentos,
            Análise de Documentos, Fase Pericial, Aguardando Resultado Pericial ou Pagamento
            de Honorários. Cada avanço aparece para você assim que a etapa muda.
          </>
        ),
      },
      {
        id: "documentos-processo",
        q: "Preciso enviar ou organizar documentos?",
        searchText: "documentos enviar papelada equipe whatsapp",
        a: (
          <>
            Fique tranquilo: <b>quem cuida de toda a papelada é a nossa equipe</b> — buscamos
            prontuários, laudos e documentos direto nas instituições. Se precisarmos de algo
            que só você pode fornecer (como um documento pessoal), entraremos em contato pelo
            WhatsApp. Pela área do cliente você acompanha o andamento de cada etapa.
          </>
        ),
      },
      {
        id: "solicitacao-docs",
        q: "O que acontece na fase de Solicitação de Documentos?",
        searchText: "solicitação documentos prontuários hospitais bombeiros SIATE SAMU 30 60 dias",
        a: (
          <>
            Nossa equipe solicita prontuários, documentos hospitalares e laudos médicos em
            hospitais, clínicas ou, se for o caso, no Corpo de Bombeiros (atendimentos via
            SIATE ou SAMU). Como dependemos de terceiros, essa etapa costuma levar de
            <b> 30 a 60 dias</b>.
          </>
        ),
      },
      {
        id: "analise-docs",
        q: "Quanto tempo leva a análise de documentos?",
        searchText: "análise documentos seguradora 30 dias pendências",
        a: (
          <>
            Após o envio dos documentos à seguradora, a análise leva <b>até 30 dias</b> por
            leva de documentos. Se houver alguma pendência, nossa equipe avisa você.
          </>
        ),
      },
      {
        id: "fase-pericial",
        q: "O que é a Fase Pericial?",
        searchText: "perícia médica agendamento resultado 7 dias úteis levar laudos",
        a: (
          <>
            É a etapa final: uma perícia médica confirma as informações do processo. Assim que
            a data for agendada, você será avisado. O resultado sai em até <b>7 dias úteis</b>{" "}
            após a perícia.
            <p className="mt-2 font-semibold">
              ✔️ No dia, leve todos os seus documentos e laudos médicos.
            </p>
          </>
        ),
      },
      {
        id: "processo-concluido",
        q: "Como sei que meu processo foi concluído?",
        searchText: "processo concluído pagamento honorários finalizado",
        a: (
          <>
            Quando o processo chega à etapa de <b>Pagamento de Honorários</b>, significa que
            foi finalizado com sucesso. Você será notificado para combinar o pagamento dos
            honorários pelo nosso trabalho.
          </>
        ),
      },
    ],
  },
];

// Mesmo número usado no login e na página 404.
const WHATSAPP_URL = "https://wa.me/5541997862323";

function Feature() {
  const [search, setSearch] = useState("");

  // Filtra pergunta + texto de busca; categoria some quando fica vazia.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return CATEGORIES;
    return CATEGORIES
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            i.q.toLowerCase().includes(term) ||
            i.searchText.toLowerCase().includes(term),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [search]);

  const totalItems = CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="w-full py-5 lg:py-8">
      <div className="mx-auto max-w-4xl">
        {/* Cabeçalho + busca */}
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">
              Perguntas frequentes · {totalItems} respostas
            </Badge>
            <h4 className="mt-3 max-w-xl text-left text-3xl font-semibold tracking-tighter text-slate-900 md:text-4xl">
              Tire suas dúvidas
            </h4>
            <p className="mt-2 max-w-2xl text-left text-base leading-relaxed text-muted-foreground">
              Reunimos aqui as dúvidas mais comuns sobre seus direitos, os benefícios do INSS
              e o acompanhamento do seu processo na área do cliente.
            </p>
          </div>

          <label className="relative block max-w-md">
            <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar uma dúvida... (ex.: perícia, prazo, INSS)"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-shadow focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        {/* Categorias */}
        {visible.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
            <p className="font-semibold text-slate-600">
              Nenhuma resposta encontrada para “{search}”.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Tente outra palavra ou fale direto com a gente pelo WhatsApp aqui embaixo.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {visible.map((cat) => (
              <section key={cat.key}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <cat.Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h5 className="font-semibold leading-tight text-slate-900">{cat.title}</h5>
                    <p className="text-xs text-slate-400">{cat.subtitle}</p>
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {cat.items.map((item) => (
                    <AccordionItem key={item.id} value={item.id}>
                      <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                      <AccordionContent className="leading-relaxed text-slate-600">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}
          </div>
        )}

        {/* CTA: não achou → WhatsApp */}
        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-emerald-900">Não encontrou sua dúvida?</p>
            <p className="text-sm text-emerald-700">
              Fale com a nossa equipe pelo WhatsApp — respondemos rapidinho.
            </p>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <FaWhatsapp className="h-4 w-4" />
            Chamar no WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

export { Feature };
