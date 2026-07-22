'use client';

/**
 * Tour de onboarding genérico com spotlight.
 *
 * - Cada passo aponta para um elemento via seletor CSS (normalmente
 *   [data-tour="..."]) e mostra um pop-up explicativo ao lado dele.
 *   Passos sem `target` viram um cartão centralizado (boas-vindas/fim).
 * - O progresso é salvo em User.onboarding via /api/onboarding, então o
 *   usuário retoma de onde parou e "Pular" marca como concluído (done).
 * - Desktop: pop-up flutuante perto do elemento. Mobile: cartão fixo na
 *   parte de baixo da tela (mais confortável no celular).
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';

export interface TourStep {
  /** Seletor CSS do elemento destacado; sem ele o passo é centralizado. */
  target?: string;
  title: string;
  description: string;
  /** Emoji/adorno opcional mostrado no cabeçalho do pop-up. */
  emoji?: string;
  /** Chamado ao entrar no passo (ex.: trocar de aba antes de medir). */
  onEnter?: () => void;
  /** Preferência de posição do pop-up no desktop. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export type TourArea = 'dash' | 'client';

interface AreaState { step: number; done: boolean }

/** Busca o estado salvo do tour; null em erro (aí não abrimos nada sozinhos). */
export async function fetchOnboarding(): Promise<Record<TourArea, AreaState> | null> {
  try {
    const res = await fetch('/api/onboarding', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function saveOnboarding(area: TourArea, step: number, done: boolean) {
  fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area, step, done }),
  }).catch(() => { /* melhor perder o progresso do que travar o tour */ });
}

interface TourProps {
  area: TourArea;
  steps: TourStep[];
  /** Passo inicial (retomada de onde o usuário parou). */
  initialStep?: number;
  open: boolean;
  onClose: () => void;
}

const PAD = 8; // respiro entre o elemento e o recorte do spotlight

export function Tour({ area, steps, initialStep = 0, open, onClose }: TourProps) {
  const [index, setIndex] = useState(Math.min(initialStep, steps.length - 1));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (open) {
      setIndex(Math.min(initialStep, steps.length - 1));
      // pequeno delay para a animação de entrada
      const t = setTimeout(() => setVisible(true), 30);
      return () => clearTimeout(t);
    }
    setVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Mede o elemento alvo do passo atual (e re-mede em scroll/resize).
  const measure = useCallback(() => {
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector(step.target);
    if (!el) { setRect(null); return; }
    setRect(el.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    step.onEnter?.();
    // Espera um frame (a aba/elemento pode ter acabado de aparecer).
    let raf = requestAnimationFrame(() => {
      const el = step.target ? document.querySelector(step.target) : null;
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      raf = requestAnimationFrame(measure);
    });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, index, step, measure]);

  // Posiciona o pop-up perto do recorte (desktop). No mobile fica fixo embaixo.
  useLayoutEffect(() => {
    if (!open || isMobile) { setPopPos(null); return; }
    const pop = popRef.current;
    if (!pop) return;
    const pw = pop.offsetWidth || 340;
    const ph = pop.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect) {
      setPopPos({ top: vh / 2 - ph / 2, left: vw / 2 - pw / 2 });
      return;
    }
    const margin = 14;
    const placement =
      step?.placement ??
      (rect.bottom + ph + margin < vh ? 'bottom' : rect.top - ph - margin > 0 ? 'top' : 'right');

    let top = 0; let left = 0;
    if (placement === 'bottom') { top = rect.bottom + margin; left = rect.left + rect.width / 2 - pw / 2; }
    else if (placement === 'top') { top = rect.top - ph - margin; left = rect.left + rect.width / 2 - pw / 2; }
    else if (placement === 'right') { top = rect.top + rect.height / 2 - ph / 2; left = rect.right + margin; }
    else { top = rect.top + rect.height / 2 - ph / 2; left = rect.left - pw - margin; }

    top = Math.min(Math.max(12, top), vh - ph - 12);
    left = Math.min(Math.max(12, left), vw - pw - 12);
    setPopPos({ top, left });
  }, [open, rect, isMobile, step, index]);

  const finish = useCallback((skipped: boolean) => {
    saveOnboarding(area, skipped ? index : steps.length - 1, true);
    setVisible(false);
    setTimeout(onClose, 200);
  }, [area, index, steps.length, onClose]);

  const goTo = useCallback((next: number) => {
    if (next < 0) return;
    if (next >= steps.length) { finish(false); return; }
    setIndex(next);
    saveOnboarding(area, next, false);
  }, [area, steps.length, finish]);

  // Navegação por teclado: setas e Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(true);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') goTo(index + 1);
      else if (e.key === 'ArrowLeft') goTo(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, goTo, finish]);

  if (!open || !step) return null;

  const hasSpot = !!rect;
  const spot = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  return (
    <div
      className={`fixed inset-0 z-[200] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      aria-modal="true"
      role="dialog"
      aria-label={`Tutorial: ${step.title}`}
    >
      {/* Overlay: escurece tudo, com "buraco" no elemento destacado. */}
      {hasSpot && spot ? (
        <div
          className="absolute rounded-xl transition-all duration-300 ease-out"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
            border: '2px solid rgba(96, 165, 250, 0.9)',
            pointerEvents: 'none',
          }}
        >
          {/* pulso decorativo em volta do recorte */}
          <div className="absolute -inset-1 animate-pulse rounded-xl border-2 border-blue-400/40" />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(15,23,42,0.72)' }} />
      )}
      {/* Camada que bloqueia cliques na página durante o tour. */}
      <div className="absolute inset-0" onClick={() => { /* clique fora não fecha: evita pular sem querer */ }} />

      {/* Pop-up do passo */}
      <div
        ref={popRef}
        className={
          isMobile
            ? 'fixed inset-x-3 bottom-3 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/10'
            : 'fixed w-[340px] rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/10'
        }
        style={!isMobile && popPos ? { top: popPos.top, left: popPos.left } : undefined}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg">
              {step.emoji ?? <Sparkles className="h-4 w-4 text-blue-600" />}
            </span>
            <h3 className="text-[15px] font-bold leading-tight text-gray-900">{step.title}</h3>
          </div>
          <button
            onClick={() => finish(true)}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-gray-600">{step.description}</p>

        {/* Barra de progresso */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Rodapé: progresso + navegação */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400">
              {index + 1}/{steps.length}
            </span>
            <button
              onClick={() => finish(true)}
              className="text-xs font-medium text-gray-400 underline-offset-2 transition-colors hover:text-gray-600 hover:underline"
            >
              Pular tutorial
            </button>
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={() => goTo(index - 1)}
                className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </button>
            )}
            <button
              onClick={() => goTo(index + 1)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
            >
              {isLast ? (
                <>Concluir <CheckCircle2 className="h-4 w-4" /></>
              ) : (
                <>Próximo <ArrowRight className="h-3.5 w-3.5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
