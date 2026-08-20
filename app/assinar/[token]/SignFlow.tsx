"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assinar, enviarCodigo, pedirAjuda, registrarAbertura, registrarPasso } from "./actions";

// Assistente de assinatura em 6 telas.
//
// Regras de desenho que valem pra TUDO aqui: uma decisão por tela, fonte
// grande, botão de 56px, nada de jargão jurídico e um botão de áudio em cada
// passo — parte do nosso público não lê bem, e assinar não pode depender de
// leitura. Quem travar tem sempre a saída "não consigo, quero ajuda", que
// chama um atendente em vez de deixar a pessoa presa.

// Mensagem de último recurso: nenhuma tela pode ficar sem explicação quando
// algo falha — o cliente precisa saber pra onde ir.
const FALHA_GENERICA =
  "Deu um probleminha aqui. Tente de novo em instantes ou chame a gente no WhatsApp.";

const TERMO_ACEITE =
  "Li ou pedi para me lerem os documentos e concordo em assiná-los eletronicamente.";

const DOCUMENTOS = [
  {
    emoji: "📄",
    titulo: "Procuração",
    resumo: "Autoriza o advogado a falar por você na Justiça.",
    detalhes: [
      "Sem ela, o advogado não pode entrar com o pedido no seu nome.",
      "Vale só para o seu caso do INSS.",
      "Você pode cancelar quando quiser, é só avisar a gente.",
    ],
  },
  {
    emoji: "🤝",
    titulo: "Contrato",
    resumo: "Combina o serviço e quanto o advogado recebe — e ele só recebe se você ganhar.",
    detalhes: [
      "Você não paga nada agora, nem para começar.",
      "O pagamento sai de uma parte do que você receber, se ganhar.",
      "Se não ganhar, você não paga honorários ao escritório.",
    ],
  },
  {
    emoji: "📋",
    titulo: "Declaração",
    resumo: "Declara que hoje você não tem condições de pagar as custas do processo.",
    detalhes: [
      "É o que permite entrar com o processo sem pagar taxas.",
      "É uma declaração comum, feita por quase todo mundo.",
      "Baseia-se no que você já nos contou sobre sua situação.",
    ],
  },
  {
    emoji: "📁",
    titulo: "Procurações para buscar documentos",
    resumo: "Autorizam a equipe a pedir seus papéis no hospital, na delegacia e no INSS por você.",
    detalhes: [
      "Sem elas, cada documento teria que ser buscado por você mesmo.",
      "Valem só para os documentos do seu caso.",
      "A equipe paga as taxas de cópia quando houver.",
    ],
  },
];

const NARRACAO: Record<number, string> = {
  1: "Olá! Preparamos seus documentos para assinar. São quatro tipos de documento e leva cerca de dois minutos. Pode ir com calma. Toque no botão verde para continuar.",
  2: "Você vai assinar quatro tipos de documento. A procuração autoriza o advogado a falar por você na Justiça. O contrato combina o serviço, e o advogado só recebe se você ganhar. A declaração diz que hoje você não tem condições de pagar as custas do processo. E as procurações específicas autorizam a equipe a buscar seus documentos no hospital e no INSS por você.",
  3: "Aqui você pode ler os documentos completos. Se preferir, pode pedir para alguém de confiança ler com você. Quando estiver pronto, toque em continuar.",
  4: "Agora é a sua assinatura. Você pode assinar desenhando com o dedo na tela, ou digitando o seu nome. Se não conseguir, toque em quero ajuda e um atendente vai falar com você.",
  5: "Enviamos um código de seis números no seu WhatsApp. Digite esse código aqui para confirmar que é você mesmo.",
  6: "Pronto! Sua assinatura foi registrada. Obrigado. Um atendente vai continuar com você pelo WhatsApp.",
};

type Modo = "desenho" | "digitado";

export function SignFlow({
  token,
  jaAssinado,
  assinadoEm,
  cliente,
}: {
  token: string;
  jaAssinado: boolean;
  assinadoEm: string | null;
  cliente: { nome: string; cpf: string; endereco: string };
}) {
  const [passo, setPasso] = useState(jaAssinado ? 6 : 1);
  const [modo, setModo] = useState<Modo>("desenho");
  const [temAssinatura, setTemAssinatura] = useState(false);
  // A imagem é congelada ao SAIR do passo 4: no passo 5 o canvas já não existe
  // mais no DOM, e ler dele ali devolveria vazio (a assinatura "sumia").
  const [assinaturaPng, setAssinaturaPng] = useState<string | null>(null);
  const [nomeDigitado, setNomeDigitado] = useState(cliente.nome);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [falando, setFalando] = useState(false);
  const [ajudaPedida, setAjudaPedida] = useState(false);
  const [rolouODocumento, setRolouODocumento] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);

  // ---- Voz -----------------------------------------------------------------
  const falar = useCallback((texto: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setAviso("Seu celular não tem leitura em voz. Se precisar, chame a gente no WhatsApp que a gente lê com você.");
      return;
    }
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = "pt-BR";
    fala.rate = 0.95;
    fala.onend = () => setFalando(false);
    fala.onerror = () => setFalando(false);
    setFalando(true);
    window.speechSynthesis.speak(fala);
  }, []);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // ---- Abertura + trilha ---------------------------------------------------
  useEffect(() => {
    if (jaAssinado) return;
    registrarAbertura(token, { largura: window.innerWidth, altura: window.innerHeight }).then((r) => {
      if (!r.ok) setErro(r.erro ?? FALHA_GENERICA);
    });
  }, [token, jaAssinado]);

  const irPara = useCallback(
    (proximo: number, nomeDoPasso: string) => {
      window.speechSynthesis?.cancel();
      setErro(null);
      setAviso(null);
      setPasso(proximo);
      registrarPasso(token, nomeDoPasso).catch(() => {});
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [token],
  );

  // ---- Canvas da assinatura -------------------------------------------------
  const prepararCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * ratio) {
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      ctx?.scale(ratio, ratio);
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }
    return ctx;
  }, []);

  useEffect(() => {
    if (passo === 4 && modo === "desenho") prepararCanvas();
  }, [passo, modo, prepararCanvas]);

  const pontoDoEvento = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const comecarTraco = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = prepararCanvas();
    if (!ctx) return;
    desenhando.current = true;
    const { x, y } = pontoDoEvento(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const seguirTraco = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pontoDoEvento(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setTemAssinatura(true);
  };

  const terminarTraco = () => {
    desenhando.current = false;
  };

  const limparAssinatura = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemAssinatura(false);
  };

  /** PNG final: o desenho do canvas ou o nome digitado renderizado em cursiva. */
  const montarAssinaturaPng = (): string | null => {
    if (modo === "desenho") {
      const canvas = canvasRef.current;
      if (!canvas || !temAssinatura) return null;
      return canvas.toDataURL("image/png").split(",")[1] ?? null;
    }
    const nome = nomeDigitado.trim();
    if (nome.length < 3) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let tamanho = 90;
    do {
      ctx.font = `italic ${tamanho}px "Brush Script MT", "Segoe Script", cursive`;
      tamanho -= 4;
    } while (ctx.measureText(nome).width > 840 && tamanho > 28);
    ctx.fillText(nome, 450, 120);
    return canvas.toDataURL("image/png").split(",")[1] ?? null;
  };

  // ---- Ações ---------------------------------------------------------------
  const pedirCodigo = async () => {
    setOcupado(true);
    setErro(null);
    const res = await enviarCodigo(token);
    setOcupado(false);
    if (!res.ok) {
      setErro(res.erro ?? FALHA_GENERICA);
      return;
    }
    if (res.devCode) setAviso(`Modo de teste — seu código é ${res.devCode}`);
    else setAviso("Código enviado no seu WhatsApp!");
  };

  const irParaCodigo = async () => {
    const png = montarAssinaturaPng();
    if (!png) {
      setErro(modo === "desenho" ? "Faça sua assinatura no quadro branco." : "Digite seu nome completo.");
      return;
    }
    setAssinaturaPng(png);
    irPara(5, `assinatura_${modo}`);
    await pedirCodigo();
  };

  const confirmar = async () => {
    const png = assinaturaPng;
    if (!png) {
      setErro("Sua assinatura se perdeu. Volte um passo e faça de novo, por favor.");
      return;
    }
    if (codigo.replace(/\D/g, "").length !== 6) {
      setErro("Digite os 6 números que chegaram no seu WhatsApp.");
      return;
    }
    setOcupado(true);
    setErro(null);
    const res = await assinar(token, {
      codigo,
      assinaturaPng: png,
      modo,
      aceite: TERMO_ACEITE,
    });
    setOcupado(false);
    if (!res.ok) {
      setErro(res.erro ?? FALHA_GENERICA);
      if (res.bloqueado) setAjudaPedida(true);
      return;
    }
    irPara(6, "concluiu");
  };

  /** Volta pro passo da assinatura: o canvas remonta vazio, então zeramos. */
  const refazerAssinatura = () => {
    setAssinaturaPng(null);
    setTemAssinatura(false);
    setCodigo("");
    irPara(4, "voltou_para_refazer_a_assinatura");
  };

  const chamarAjuda = async (motivo: string) => {
    setOcupado(true);
    await pedirAjuda(token, motivo);
    setOcupado(false);
    setAjudaPedida(true);
  };

  // ---- Pedaços de UI --------------------------------------------------------
  const BotaoVoz = ({ passoAtual }: { passoAtual: number }) => (
    <button
      type="button"
      onClick={() => (falando ? window.speechSynthesis.cancel() : falar(NARRACAO[passoAtual]))}
      className="w-full h-14 rounded-2xl border-2 border-emerald-600 text-emerald-700 text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition"
    >
      {falando ? "⏸ Parar" : "▶ Ouvir explicação"}
    </button>
  );

  const Avancar = ({ onClick, texto = "Continuar" }: { onClick: () => void; texto?: string }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-xl font-bold shadow-lg shadow-emerald-200 active:scale-[0.98] transition disabled:opacity-60"
    >
      {ocupado ? "Só um instante…" : texto}
    </button>
  );

  if (ajudaPedida) {
    return (
      <Tela>
        <div className="text-center">
          <div className="text-6xl mb-4" aria-hidden>🙋</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Sem problema!</h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            Já avisamos nossa equipe. Em instantes alguém vai te chamar no WhatsApp
            para assinar junto com você, com calma.
          </p>
          <a
            href="https://wa.me/5541997862323"
            className="mt-8 inline-flex items-center justify-center w-full h-14 rounded-2xl bg-emerald-600 text-white text-lg font-semibold"
          >
            Abrir o WhatsApp
          </a>
        </div>
      </Tela>
    );
  }

  return (
    <Tela>
      {passo < 6 && <Progresso passo={passo} />}

      {erro && (
        <p role="alert" className="rounded-2xl bg-red-50 border-2 border-red-200 text-red-800 text-base p-4 leading-relaxed">
          {erro}
        </p>
      )}
      {aviso && !erro && (
        <p className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-800 text-base p-4">
          {aviso}
        </p>
      )}

      {passo === 1 && (
        <>
          <div className="text-center">
            <div className="text-6xl mb-3" aria-hidden>👋</div>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">
              Olá{cliente.nome ? `, ${cliente.nome.split(" ")[0]}` : ""}!
            </h1>
            <p className="mt-4 text-xl text-slate-600 leading-relaxed">
              Preparamos seus documentos para assinar.
              <br />
              São <strong>4 tipos de documento</strong> e leva <strong>2 minutinhos</strong>.
            </p>
            <p className="mt-3 text-lg text-slate-500">Pode ir com calma. 😊</p>
          </div>
          <BotaoVoz passoAtual={1} />
          <Avancar onClick={() => irPara(2, "viu_boas_vindas")} texto="Começar" />
        </>
      )}

      {passo === 2 && (
        <>
          <h1 className="text-2xl font-bold text-slate-900">O que você vai assinar</h1>
          <div className="space-y-3">
            {DOCUMENTOS.map((doc) => (
              <details key={doc.titulo} className="rounded-2xl border-2 border-slate-200 bg-white p-4 open:border-emerald-300">
                <summary className="flex items-start gap-3 cursor-pointer list-none">
                  <span className="text-3xl" aria-hidden>{doc.emoji}</span>
                  <span className="flex-1">
                    <span className="block text-lg font-bold text-slate-900">{doc.titulo}</span>
                    <span className="block text-base text-slate-600 leading-snug">{doc.resumo}</span>
                    <span className="mt-1 block text-sm text-emerald-700 font-semibold">toque para saber mais</span>
                  </span>
                </summary>
                <ul className="mt-3 space-y-2 pl-11">
                  {doc.detalhes.map((d) => (
                    <li key={d} className="text-base text-slate-600 leading-snug list-disc">{d}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          <BotaoVoz passoAtual={2} />
          <Avancar onClick={() => irPara(3, "viu_explicacao")} />
        </>
      )}

      {passo === 3 && (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Os documentos completos</h1>
          <p className="text-lg text-slate-600">
            Se quiser, pode pedir para alguém de confiança ler com você.
          </p>
          <div className="rounded-2xl overflow-hidden border-2 border-slate-200 bg-white">
            <iframe
              src={`/api/signature/pdf/${token}`}
              title="Documentos para assinar"
              className="w-full h-[55vh]"
              onLoad={() => setRolouODocumento(true)}
            />
          </div>
          <a
            href={`/api/signature/pdf/${token}?download=1`}
            className="w-full h-14 rounded-2xl border-2 border-slate-300 text-slate-700 text-lg font-semibold flex items-center justify-center active:scale-[0.98] transition"
          >
            ⬇ Baixar para ler depois
          </a>
          <BotaoVoz passoAtual={3} />
          <Avancar
            onClick={() => {
              if (!rolouODocumento) setAviso("Pode continuar — o documento fica sempre disponível para baixar.");
              irPara(4, "leu_o_documento");
            }}
            texto="Já vi, continuar"
          />
        </>
      )}

      {passo === 4 && (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Sua assinatura</h1>

          <div className="rounded-2xl bg-slate-100 p-4 space-y-1">
            <p className="text-base text-slate-500">Confere se é você:</p>
            <p className="text-lg font-bold text-slate-900">{cliente.nome || "—"}</p>
            {cliente.cpf && <p className="text-base text-slate-600">CPF {cliente.cpf}</p>}
            {cliente.endereco && <p className="text-base text-slate-600">{cliente.endereco}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setModo("desenho"); setErro(null); }}
              className={`h-14 rounded-2xl text-base font-bold border-2 transition ${
                modo === "desenho" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              ✍️ Com o dedo
            </button>
            <button
              type="button"
              onClick={() => { setModo("digitado"); setErro(null); }}
              className={`h-14 rounded-2xl text-base font-bold border-2 transition ${
                modo === "digitado" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              ⌨️ Digitar nome
            </button>
          </div>

          {modo === "desenho" ? (
            <div className="space-y-2">
              <p className="text-lg text-slate-600">Assine no quadro branco abaixo:</p>
              <canvas
                ref={canvasRef}
                onPointerDown={comecarTraco}
                onPointerMove={seguirTraco}
                onPointerUp={terminarTraco}
                onPointerLeave={terminarTraco}
                className="w-full h-52 rounded-2xl bg-white border-2 border-dashed border-slate-300 touch-none"
              />
              <button
                type="button"
                onClick={limparAssinatura}
                className="w-full h-12 rounded-xl border-2 border-slate-300 text-slate-600 text-base font-semibold"
              >
                🧽 Apagar e fazer de novo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="nome" className="block text-lg text-slate-600">
                Digite seu nome completo:
              </label>
              <input
                id="nome"
                value={nomeDigitado}
                onChange={(e) => setNomeDigitado(e.target.value)}
                className="w-full h-16 rounded-2xl border-2 border-slate-300 px-4 text-xl"
                autoComplete="name"
              />
              <div className="rounded-2xl bg-white border-2 border-dashed border-slate-300 h-28 flex items-center justify-center px-4">
                <span className="text-4xl text-slate-900 italic truncate" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
                  {nomeDigitado || "sua assinatura"}
                </span>
              </div>
            </div>
          )}

          <BotaoVoz passoAtual={4} />
          <Avancar onClick={irParaCodigo} texto="Continuar" />
          <button
            type="button"
            onClick={() => chamarAjuda("cliente tocou em 'não consigo assinar'")}
            className="w-full h-14 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-800 text-lg font-semibold"
          >
            🙋 Não consigo — quero ajuda
          </button>
        </>
      )}

      {passo === 5 && (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Confirme que é você</h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            Mandamos <strong>6 números</strong> no seu WhatsApp. Digite aqui:
          </p>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="w-full h-20 rounded-2xl border-2 border-slate-300 text-center text-4xl tracking-[0.4em] font-bold"
          />
          <button
            type="button"
            onClick={pedirCodigo}
            disabled={ocupado}
            className="w-full h-12 rounded-xl border-2 border-slate-300 text-slate-600 text-base font-semibold"
          >
            🔄 Não chegou? Reenviar código
          </button>

          <p className="rounded-2xl bg-slate-100 p-4 text-base text-slate-600 leading-relaxed">
            {TERMO_ACEITE}
          </p>

          <BotaoVoz passoAtual={5} />
          <Avancar onClick={confirmar} texto="✍️ Assinar agora" />
          <button
            type="button"
            onClick={refazerAssinatura}
            className="w-full h-12 rounded-xl border-2 border-slate-300 text-slate-600 text-base font-semibold"
          >
            ← Voltar e fazer a assinatura de novo
          </button>
          <button
            type="button"
            onClick={() => chamarAjuda("cliente pediu ajuda na etapa do código")}
            className="w-full h-14 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-800 text-lg font-semibold"
          >
            🙋 Não consigo — quero ajuda
          </button>
        </>
      )}

      {passo === 6 && (
        <div className="text-center space-y-6">
          <div className="text-7xl" aria-hidden>✅</div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Assinado!</h1>
            <p className="mt-3 text-xl text-slate-600 leading-relaxed">
              Obrigado{cliente.nome ? `, ${cliente.nome.split(" ")[0]}` : ""}! Recebemos sua assinatura
              {assinadoEm ? ` em ${new Date(assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : ""}.
            </p>
            <p className="mt-3 text-lg text-slate-500 leading-relaxed">
              A partir de agora um atendente da nossa equipe segue com você pelo WhatsApp.
            </p>
          </div>
          <a
            href={`/api/signature/pdf/${token}?download=1`}
            className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-lg font-bold flex items-center justify-center"
          >
            ⬇ Baixar meus documentos
          </a>
          <a
            href="https://wa.me/5541997862323"
            className="w-full h-14 rounded-2xl border-2 border-slate-300 text-slate-700 text-lg font-semibold flex items-center justify-center"
          >
            Voltar ao WhatsApp
          </a>
          <button
            type="button"
            onClick={() => falar(NARRACAO[6])}
            className="text-emerald-700 text-base font-semibold underline"
          >
            ▶ ouvir
          </button>
        </div>
      )}
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="mx-auto w-full max-w-md px-5 py-8 space-y-5">
        <p className="text-center text-sm font-bold tracking-wide text-emerald-700 uppercase">
          Paraná Seguros
        </p>
        {children}
        <p className="pt-4 text-center text-xs text-slate-400 leading-relaxed">
          Assinatura eletrônica com validade jurídica (MP 2.200-2/2001 e Lei 14.063/2020).
          Seus dados são usados apenas para elaborar seus documentos.
        </p>
      </div>
    </main>
  );
}

function Progresso({ passo }: { passo: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Passo ${passo} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-2.5 rounded-full transition-all ${
            n === passo ? "w-8 bg-emerald-600" : n < passo ? "w-2.5 bg-emerald-400" : "w-2.5 bg-slate-300"
          }`}
        />
      ))}
    </div>
  );
}
