"use client";

/**
 * Tutorial da página de assinatura em forma de CHAT.
 *
 * Em vez de um bloco de texto (que este público não lê) ou de um overlay
 * cobrindo a tela, a explicação chega como mensagens de WhatsApp: balõezinhos
 * curtos, um de cada vez, com o "digitando…" no meio. É o formato que a pessoa
 * já sabe usar.
 *
 * - PROGRESSIVO: a cada tela do fluxo entra a conversa daquela tela, dizendo o
 *   que fazer ali e onde tocar.
 * - VOZ HUMANA: o áudio vem pronto de public/assinatura/voz/passo-N.mp3
 *   (gerado por `npm run sign:voz`). Se o arquivo faltar, cai na voz do próprio
 *   celular, que é robótica mas garante que ninguém fique sem ouvir.
 * - RASTREADO: "Entendi" e o X viram evento na trilha de auditoria do ciclo, e
 *   aparecem na aba Contratos.
 *
 * O texto mora em app/_shared/lib/signature/tutorial-content.json — mesma fonte
 * que o gerador de voz lê, pra nunca falar uma coisa e escrever outra.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import conteudo from "@/app/_shared/lib/signature/tutorial-content.json";

interface Etapa {
  emoji: string;
  titulo: string;
  mensagens: string[];
}

const ETAPAS = conteudo.etapas as unknown as Record<string, Etapa>;

export function etapaDoTutorial(etapa: number): Etapa | null {
  return ETAPAS[String(etapa)] ?? null;
}

/** Intervalo do "digitando…" antes de cada balão. */
const DIGITANDO_MS = 850;

/**
 * Voz da etapa: MP3 pronto (humano) com queda para a voz do celular.
 * Devolve o que a tela precisa: se está tocando e como ligar/desligar.
 */
export function useVoz(etapa: number, aoOuvir?: () => void) {
  const [tocando, setTocando] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const parar = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    window.speechSynthesis?.cancel();
    setTocando(false);
  }, []);

  // Trocou de tela (ou saiu da página): nada de voz falando por cima.
  useEffect(() => () => parar(), [etapa, parar]);

  const vozDoCelular = useCallback((texto: string) => {
    if (!window.speechSynthesis) {
      setTocando(false);
      return;
    }
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = "pt-BR";
    fala.rate = 0.95;
    fala.onend = () => setTocando(false);
    fala.onerror = () => setTocando(false);
    window.speechSynthesis.speak(fala);
  }, []);

  const alternar = useCallback(() => {
    if (tocando) {
      parar();
      return;
    }
    const dados = etapaDoTutorial(etapa);
    if (!dados) return;
    setTocando(true);
    aoOuvir?.();

    const audio = new Audio(`/assinatura/voz/passo-${etapa}.mp3`);
    audioRef.current = audio;
    audio.onended = () => setTocando(false);
    // Arquivo ausente/corrompido ou formato não suportado → voz do celular.
    audio.onerror = () => vozDoCelular(dados.mensagens.join(" "));
    audio.play().catch(() => vozDoCelular(dados.mensagens.join(" ")));
  }, [tocando, etapa, parar, vozDoCelular, aoOuvir]);

  return { tocando, alternar };
}

export function TutorialChat({
  etapa,
  onEntendi,
  onFechar,
  onOuvir,
  children,
}: {
  etapa: number;
  onEntendi: () => void;
  onFechar: () => void;
  onOuvir?: () => void;
  /** Conteúdo extra dentro da conversa (o vídeo, na tela 1). */
  children?: React.ReactNode;
}) {
  const dados = etapaDoTutorial(etapa);
  const total = dados?.mensagens.length ?? 0;
  const [visiveis, setVisiveis] = useState(0);
  const { tocando, alternar } = useVoz(etapa, onOuvir);

  // Os balões entram um a um, como numa conversa de verdade.
  useEffect(() => {
    setVisiveis(0);
    if (!total) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= total; i++) {
      timers.push(setTimeout(() => setVisiveis(i), DIGITANDO_MS * i));
    }
    return () => timers.forEach(clearTimeout);
  }, [etapa, total]);

  if (!dados) return null;
  const terminou = visiveis >= total;

  return (
    <section
      aria-label={`Explicação: ${dados.titulo}`}
      className="rounded-3xl border-2 border-emerald-200 bg-emerald-50/70 p-3 space-y-2"
    >
      <div className="flex items-center gap-2 px-1">
        <span className="flex-none w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-base" aria-hidden>
          {dados.emoji}
        </span>
        <span className="flex-1 text-sm font-bold text-emerald-900">{dados.titulo}</span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar explicação"
          className="flex-none w-8 h-8 rounded-full text-emerald-700/60 text-lg font-bold active:scale-90 transition"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        {dados.mensagens.slice(0, visiveis).map((m) => (
          <p
            key={m}
            className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-base leading-snug text-slate-700 shadow-sm"
          >
            {m}
          </p>
        ))}

        {!terminou && (
          // "digitando…" — o mesmo sinal que a pessoa já conhece do WhatsApp.
          <div className="w-16 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm" aria-label="digitando">
            <span className="flex gap-1">
              {[0, 1, 2].map((n) => (
                <span
                  key={n}
                  className="h-2 w-2 rounded-full bg-emerald-300 animate-bounce"
                  style={{ animationDelay: `${n * 150}ms` }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {terminou && (
        <>
          {children}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={alternar}
              className="flex-1 h-12 rounded-2xl border-2 border-emerald-600 bg-white text-emerald-700 text-base font-semibold active:scale-[0.98] transition"
            >
              {tocando ? "⏸ Parar" : "▶ Ouvir"}
            </button>
            <button
              type="button"
              onClick={onEntendi}
              className="flex-1 h-12 rounded-2xl bg-emerald-600 text-white text-base font-bold active:scale-[0.98] transition"
            >
              Entendi 👍
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Linha discreta que devolve a conversa depois do "Entendi"/X. */
export function ReabrirTutorial({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-11 rounded-xl border-2 border-slate-200 text-slate-500 text-sm font-semibold active:scale-[0.98] transition"
    >
      💬 Ver a explicação de novo
    </button>
  );
}
