// Portões de recarga (lista do inbox do WhatsApp e quem mais precisar).
//
// Por que existe (auditoria de 24/09/2026): o `mutate()` do SWR 2.3.8 NÃO
// deduplica — cada chamada descarta a busca em voo e começa outra. Com SSE,
// hash, ações e `onDiscarded` pedindo a lista inteira (1.000 conversas) ao
// mesmo tempo, as cargas empilhavam na fila serial de server actions do
// navegador, na frente do clique do atendente.
//
// Módulo puro (sem React, sem DOM): o chamador injeta `run` e `isHidden`, e os
// testes usam fake timers (tests/refresh-gate.test.ts).

const noop = () => { };

export interface SingleFlight<T> {
  trigger: () => Promise<T>;
}

/**
 * No máximo UMA execução de `run` em voo.
 *
 * Quem chama durante o voo marca "de novo" e recebe a promise da execução
 * EXTRA, encadeada depois da atual — nunca a em voo. Motivo: quem faz
 * `await refresh()` logo depois de uma mutação (ex.: excluir contato) não pode
 * receber uma carga que começou ANTES dela e ainda traz o dado velho.
 * Vários pedidos durante o mesmo voo viram uma única execução extra.
 */
export function createSingleFlight<T>(run: () => Promise<T>): SingleFlight<T> {
  let inFlight: Promise<T> | null = null;
  let queued: Promise<T> | null = null;

  const start = (): Promise<T> => {
    let p: Promise<T>;
    try {
      p = Promise.resolve(run());
    } catch (e) {
      p = Promise.reject(e);
    }
    inFlight = p;
    const clear = () => { if (inFlight === p) inFlight = null; };
    // Handler registrado ANTES do encadeamento do `queued`: quando a extra
    // começa, o voo anterior já foi limpo.
    p.then(clear, clear);
    return p;
  };

  const trigger = (): Promise<T> => {
    // Já existe extra na fila (ou o voo acabou e ela está para começar): junta.
    if (queued) return queued;
    if (!inFlight) return start();
    queued = inFlight.then(noop, noop).then(() => {
      queued = null;
      return start();
    });
    return queued;
  };

  return { trigger };
}

export interface Coalescer {
  /** Pede uma execução. Aba oculta: só marca "sujo". Timer pendente: ignora. */
  trigger: () => void;
  /** Se ficou "sujo" com a aba oculta, agenda UMA execução e limpa a marca. */
  flushIfDirty: () => void;
  /** Cancela o timer e ignora pedidos futuros (unmount). */
  dispose: () => void;
}

/**
 * Junta rajadas de pedidos numa execução só, `delayMs` depois do primeiro.
 *
 * Com a aba oculta não roda nada: guarda que houve pedido e só executa quando
 * alguém chama `flushIfDirty` (o `visibilitychange` de volta). O flush também
 * espera `delayMs`, para o primeiro clique de quem volta à aba entrar na fila
 * de actions antes da recarga pesada. Se a aba ficar oculta durante a espera,
 * a execução vira "sujo" de novo em vez de rodar escondida.
 */
export function createCoalescer(opts: {
  delayMs: number;
  isHidden?: () => boolean;
  run: () => unknown;
}): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let disposed = false;
  const hidden = () => (opts.isHidden ? opts.isHidden() : false);

  const fire = () => {
    timer = null;
    if (disposed) return;
    if (hidden()) {
      dirty = true;
      return;
    }
    try {
      const r = opts.run();
      // Ninguém espera o resultado de uma recarga coalescida: engole a rejeição
      // para não virar "unhandled rejection" no console.
      if (r && typeof (r as PromiseLike<unknown>).then === 'function') {
        (r as PromiseLike<unknown>).then(undefined, noop);
      }
    } catch {
      /* idem: falha de recarga não derruba quem pediu */
    }
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(fire, opts.delayMs);
  };

  return {
    trigger() {
      if (disposed) return;
      if (hidden()) {
        dirty = true;
        return;
      }
      schedule();
    },
    flushIfDirty() {
      if (disposed || !dirty) return;
      dirty = false;
      schedule();
    },
    dispose() {
      disposed = true;
      dirty = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
