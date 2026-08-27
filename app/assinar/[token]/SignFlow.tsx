"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assinar, enviarCodigo, pedirAjuda, registrarAbertura, registrarPasso } from "./actions";
import { TutorialChat, ReabrirTutorial, etapaDoTutorial } from "./TutorialChat";

// Assistente de assinatura em 5 telas:
//   1 boas-vindas · 2 documentos · 3 assinatura · 4 código · 5 assinado.
//
// O TUTORIAL é PROGRESSIVO e mora DENTRO da página: cada tela abre com um
// bloco explicando o que fazer ali (e só ali), sempre visível — nada de
// sobrepor a tela do cliente com um overlay, e nada de depender de o cliente
// descobrir um botão de ajuda. O vídeo entra no bloco da tela 1.
//
// Regras de desenho que valem pra TUDO aqui: uma decisão por tela, fonte
// grande, botão de 56px, nada de jargão jurídico e explicação em áudio/vídeo
// em cada passo — parte do nosso público não lê bem, e assinar não pode
// depender de leitura. Quem travar tem sempre a saída "não consigo, quero
// ajuda", que chama um atendente em vez de deixar a pessoa presa.

// Mensagem de último recurso: nenhuma tela pode ficar sem explicação quando
// algo falha — o cliente precisa saber pra onde ir.
const FALHA_GENERICA =
  "Deu um probleminha aqui. Tente de novo em instantes ou chame a gente no WhatsApp.";

const TERMO_ACEITE =
  "Li ou pedi para me lerem os documentos e concordo em assiná-los eletronicamente.";

// Resumo do caminho mostrado na tela 1. A ORDEM É A DAS TELAS de verdade
// (documentos → assinatura → código): o código só é enviado depois que a
// assinatura é capturada, então prometer o contrário confundiria o cliente.
const PASSO_A_PASSO = [
  { emoji: "📄", texto: "Veja o que você vai assinar" },
  { emoji: "🔢", texto: "Digite o código de 6 números que chega no seu WhatsApp" },
  { emoji: "✍️", texto: "Assine com o dedo na tela (ou digite seu nome)" },
  { emoji: "✅", texto: "Pronto! A gente cuida do resto" },
];

// O TEXTO do tutorial (e a narração) mora em
// app/_shared/lib/signature/tutorial-content.json — fonte única, lida tanto por
// TutorialChat.tsx quanto pelo gerador de voz (`npm run sign:voz`).

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
  const [passo, setPasso] = useState(jaAssinado ? 5 : 1);
  const [modo, setModo] = useState<Modo>("desenho");
  const [temAssinatura, setTemAssinatura] = useState(false);
  // A imagem é congelada ao SAIR do passo 3: no passo 4 o canvas já não existe
  // mais no DOM, e ler dele ali devolveria vazio (a assinatura "sumia").
  const [assinaturaPng, setAssinaturaPng] = useState<string | null>(null);
  const [nomeDigitado, setNomeDigitado] = useState(cliente.nome);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ajudaPedida, setAjudaPedida] = useState(false);
  // Telas em que o cliente já deu "Entendi" (ou fechou no X): a conversa some
  // e vira uma linha discreta pra reabrir. Cada tela nova traz a sua de volta.
  const [tutorialResolvido, setTutorialResolvido] = useState<number[]>([]);
  const [rolouODocumento, setRolouODocumento] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);

  // ---- Tutorial: trilha de auditoria ---------------------------------------
  // A equipe precisa saber COMO o cliente usou a explicação — quem pulou tudo e
  // travou depois é caso de ligar. Estes eventos aparecem na aba Contratos.
  const registrarTutorial = useCallback(
    (evento: "entendi" | "fechou" | "ouviu", etapa: number) => {
      const nome = etapaDoTutorial(etapa)?.titulo ?? "?";
      registrarPasso(token, `tutorial_${evento}`, `etapa ${etapa} — ${nome}`).catch(() => {});
    },
    [token],
  );

  const resolverTutorial = useCallback(
    (evento: "entendi" | "fechou", etapa: number) => {
      registrarTutorial(evento, etapa);
      setTutorialResolvido((atual) => (atual.includes(etapa) ? atual : [...atual, etapa]));
    },
    [registrarTutorial],
  );

  /** Props do chat de tutorial da tela atual (ou null quando já foi resolvido). */
  const propsTutorial = (etapa: number) => ({
    etapa,
    onEntendi: () => resolverTutorial("entendi", etapa),
    onFechar: () => resolverTutorial("fechou", etapa),
    onOuvir: () => registrarTutorial("ouviu", etapa),
  });

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
    if (passo === 3 && modo === "desenho") prepararCanvas();
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

  /**
   * Preenche o código sem digitação. O código chega pelo WHATSAPP, então a
   * Web OTP API (que só lê SMS) não resolve sozinha — a área de transferência
   * é o caminho real: o cliente copia na conversa e toca aqui.
   */
  const colarCodigo = async () => {
    try {
      const texto = await navigator.clipboard.readText();
      const numeros = (texto.match(/\d/g) ?? []).join("").slice(-6);
      if (numeros.length === 6) {
        setCodigo(numeros);
        setErro(null);
        setAviso("Código colado! Agora toque em Assinar agora. ✅");
        return;
      }
      setAviso("Não achei um código de 6 números copiado. Copie o código na conversa do WhatsApp e toque aqui de novo.");
    } catch {
      setAviso("Seu celular não deixou a gente ler o que você copiou. Pode digitar os 6 números aqui mesmo. 😊");
    }
  };

  const irParaCodigo = async () => {
    const png = montarAssinaturaPng();
    if (!png) {
      setErro(modo === "desenho" ? "Faça sua assinatura no quadro branco." : "Digite seu nome completo.");
      return;
    }
    setAssinaturaPng(png);
    irPara(4, `assinatura_${modo}`);
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
    irPara(5, "concluiu");
  };

  /** Volta pros documentos: o canvas remonta vazio, então zeramos a assinatura. */
  const refazerAssinatura = () => {
    setAssinaturaPng(null);
    setTemAssinatura(false);
    setCodigo("");
    irPara(2, "voltou_para_refazer_a_assinatura");
  };

  const chamarAjuda = async (motivo: string) => {
    setOcupado(true);
    await pedirAjuda(token, motivo);
    setOcupado(false);
    setAjudaPedida(true);
  };

  // ---- Pedaços de UI --------------------------------------------------------
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
      {passo < 5 && <Progresso passo={passo} />}

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
            {/* <div className="text-6xl mb-3" aria-hidden>👋</div> */}
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">
              Olá{cliente.nome ? `, ${cliente.nome.split(" ")[0]}` : ""}! 👋
            </h1>
            <p className="mt-4 text-xl text-slate-600 leading-relaxed">
              Preparamos seus documentos para assinar.
            </p>
          </div>

          <Avancar onClick={() => irPara(2, "viu_boas_vindas")} texto="Começar" />

          {/* Tela 1: a conversa traz o vídeo junto, no último balão. */}
          {tutorialResolvido.includes(1) ? (
            <ReabrirTutorial onClick={() => setTutorialResolvido((a) => a.filter((n) => n !== 1))} />
          ) : (
            <TutorialChat {...propsTutorial(1)}>
              <video
                src="/assinatura/como-assinar.mp4"
                controls
                playsInline
                preload="metadata"
                className="mx-auto w-full max-w-[280px] rounded-2xl border-2 border-emerald-200 bg-slate-900"
              />
            </TutorialChat>
          )}


          {/* Passo a passo sempre à vista — ninguém precisa "abrir" nada. */}
          <ol className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3">
            {PASSO_A_PASSO.map((p, i) => (
              <li key={p.texto} className="flex items-start gap-3">
                <span className="flex-none w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-base font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1 text-base text-slate-700 leading-snug pt-1">
                  <span className="mr-1" aria-hidden>{p.emoji}</span>
                  {p.texto}
                </span>
              </li>
            ))}
          </ol>

        </>
      )}

      {passo === 2 && (
         <>
          <h1 className="text-2xl font-bold text-slate-900">Os documentos completos</h1>
          {tutorialResolvido.includes(2) ? (
            <ReabrirTutorial onClick={() => setTutorialResolvido((a) => a.filter((n) => n !== 2))} />
          ) : (
            <TutorialChat {...propsTutorial(2)} />
          )}
          <Avancar
            onClick={() => {
              if (!rolouODocumento) setAviso("Pode continuar — o documento fica sempre disponível para baixar.");
              irPara(3, "leu_o_documento");
            }}
            texto="Já vi, continuar"
          />
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
        </>
      )}

      {passo === 4 && (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Confirme que é você</h1>
          {tutorialResolvido.includes(4) ? (
            <ReabrirTutorial onClick={() => setTutorialResolvido((a) => a.filter((n) => n !== 4))} />
          ) : (
            <TutorialChat {...propsTutorial(4)} />
          )}
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
            onClick={colarCodigo}
            className="w-full h-14 rounded-2xl border-2 border-emerald-600 text-emerald-700 text-lg font-semibold active:scale-[0.98] transition"
          >
            📋 Colar código copiado
          </button>
          <a
            href="https://wa.me/5541997862323"
            className="w-full h-12 rounded-xl border-2 border-slate-300 text-slate-600 text-base font-semibold flex items-center justify-center"
          >
            💬 Abrir o WhatsApp para copiar
          </a>
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

          <Avancar onClick={confirmar} texto="✍️ Assinar agora" />
          <button
            type="button"
            onClick={refazerAssinatura}
            className="w-full h-12 rounded-xl border-2 border-slate-300 text-slate-600 text-base font-semibold"
          >
            ← Voltar e rever o documento
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

      {passo === 3 && (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Sua assinatura</h1>
          {tutorialResolvido.includes(3) ? (
            <ReabrirTutorial onClick={() => setTutorialResolvido((a) => a.filter((n) => n !== 3))} />
          ) : (
            <TutorialChat {...propsTutorial(3)} />
          )}

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
    <div className="flex items-center justify-center gap-2" aria-label={`Passo ${passo} de 4`}>
      {[1, 2, 3, 4].map((n) => (
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
