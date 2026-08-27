"use client";

/**
 * Tutorial da página de assinatura — mesmo desenho do tour de onboarding da
 * nova-dash e da área do cliente (spotlight recortando o overlay + cartão
 * explicativo, barra de progresso, voltar/próximo), com três diferenças que a
 * página pública exige:
 *
 *  1. NÃO persiste progresso. O Tour genérico salva em User.onboarding via
 *     /api/onboarding, que precisa de sessão — aqui não há login (a credencial
 *     é o token do link). Por isso ele ABRE SEMPRE, a cada visita, em vez de
 *     ser opcional como nas áreas logadas.
 *  2. Fonte e botões grandes, como o resto do fluxo de assinatura: boa parte
 *     do nosso público lê com dificuldade.
 *  3. Cada passo tem "ouvir" (leitura em voz) pelo mesmo motivo — nenhuma
 *     explicação daqui pode depender só de leitura.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface SignTourStep {
  /** Seletor CSS do elemento destacado; sem ele o cartão fica centralizado. */
  target?: string;
  emoji: string;
  title: string;
  description: string;
}

const PAD = 8; // respiro entre o elemento e o recorte do spotlight

export function SignTour({
  steps,
  open,
  onClose,
}: {
  steps: SignTourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [falando, setFalando] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    setIndex(0);
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ---- Leitura em voz do passo atual ---------------------------------------
  const parar = useCallback(() => {
    window.speechSynthesis?.cancel();
    setFalando(false);
  }, []);

  const ouvir = useCallback(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(`${step.title}. ${step.description}`);
    fala.lang = "pt-BR";
    fala.rate = 0.95;
    fala.onend = () => setFalando(false);
    fala.onerror = () => setFalando(false);
    setFalando(true);
    window.speechSynthesis.speak(fala);
  }, [step]);

  // Trocar de passo (ou fechar) nunca deixa a voz falando por cima.
  useEffect(() => {
    parar();
  }, [index, parar]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // ---- Spotlight ------------------------------------------------------------
  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    // Mede JÁ: o recorte precisa existir no primeiro quadro do passo. Adiar a
    // primeira medição para dentro de um requestAnimationFrame deixava o
    // spotlight sem buraco quando a limpeza do efeito cancelava o quadro.
    measure();
    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    // O scroll é suave: re-mede enquanto ele acontece (o listener de scroll
    // cobre o percurso, e este timer garante a posição final).
    const t = setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, index, step, measure]);

  // No desktop o cartão flutua perto do recorte; no celular fica fixo embaixo.
  useLayoutEffect(() => {
    if (!open || isMobile) {
      setPopPos(null);
      return;
    }
    const pop = popRef.current;
    if (!pop) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Nunca posicionar por um cartão mais largo que a tela: o clamp devolveria
    // uma coordenada negativa e o cartão sairia pela esquerda.
    const pw = Math.min(pop.offsetWidth || 380, vw - 24);
    const ph = pop.offsetHeight || 260;

    if (!rect) {
      setPopPos({ top: vh / 2 - ph / 2, left: vw / 2 - pw / 2 });
      return;
    }
    const margin = 16;
    // Cabe à direita do recorte? Senão embaixo, senão em cima.
    let top: number;
    let left: number;
    if (rect.right + pw + margin < vw) {
      top = rect.top + rect.height / 2 - ph / 2;
      left = rect.right + margin;
    } else if (rect.bottom + ph + margin < vh) {
      top = rect.bottom + margin;
      left = rect.left + rect.width / 2 - pw / 2;
    } else {
      top = rect.top - ph - margin;
      left = rect.left + rect.width / 2 - pw / 2;
    }
    setPopPos({
      top: Math.min(Math.max(12, top), vh - ph - 12),
      left: Math.min(Math.max(12, left), vw - pw - 12),
    });
  }, [open, rect, isMobile, index]);

  const fechar = useCallback(() => {
    parar();
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose, parar]);

  const irPara = useCallback(
    (proximo: number) => {
      if (proximo < 0) return;
      if (proximo >= steps.length) {
        fechar();
        return;
      }
      setIndex(proximo);
    },
    [steps.length, fechar],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "ArrowRight" || e.key === "Enter") irPara(index + 1);
      else if (e.key === "ArrowLeft") irPara(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, irPara, fechar]);

  if (!open || !step) return null;

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  return (
    <div
      className={`fixed inset-0 z-[200] transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Tutorial: ${step.title}`}
    >
      {spot ? (
        <div
          className="absolute rounded-2xl transition-all duration-300 ease-out"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.72)",
            border: "3px solid rgba(16, 185, 129, 0.95)",
            pointerEvents: "none",
          }}
        >
          <div className="absolute -inset-1 animate-pulse rounded-2xl border-2 border-emerald-400/40" />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(15,23,42,0.72)" }} />
      )}

      {/* Bloqueia cliques na página enquanto o tutorial está aberto. */}
      <div className="absolute inset-0" />

      <div
        ref={popRef}
        className={
          isMobile
            ? "fixed inset-x-3 bottom-3 rounded-3xl bg-white p-5 shadow-2xl"
            : "fixed w-[min(380px,calc(100vw-24px))] rounded-3xl bg-white p-5 shadow-2xl"
        }
        style={!isMobile && popPos ? { top: popPos.top, left: popPos.left } : undefined}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-2xl" aria-hidden>
            {step.emoji}
          </span>
          <h2 className="flex-1 pt-1 text-xl font-bold leading-tight text-slate-900">{step.title}</h2>
        </div>

        <p className="mt-3 text-lg leading-relaxed text-slate-600">{step.description}</p>

        <button
          type="button"
          onClick={falando ? parar : ouvir}
          className="mt-3 h-12 w-full rounded-2xl border-2 border-emerald-600 text-base font-semibold text-emerald-700 active:scale-[0.98] transition"
        >
          {falando ? "⏸ Parar" : "▶ Ouvir explicação"}
        </button>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-400">
            {index + 1}/{steps.length}
          </span>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => irPara(index - 1)}
                className="h-12 rounded-2xl border-2 border-slate-300 px-4 text-base font-semibold text-slate-600 active:scale-95 transition"
              >
                ← Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => irPara(index + 1)}
              className="h-12 rounded-2xl bg-emerald-600 px-5 text-base font-bold text-white shadow-sm active:scale-95 transition"
            >
              {isLast ? "Entendi! ✅" : "Próximo →"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={fechar}
          className="mt-3 w-full text-sm font-medium text-slate-400 underline underline-offset-2"
        >
          Pular tutorial
        </button>
      </div>
    </div>
  );
}
