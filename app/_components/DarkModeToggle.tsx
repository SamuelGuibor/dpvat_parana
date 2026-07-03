'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/app/_utils/utils';

const STORAGE_KEY = 'dpvat-darkreader';

// Configuração do Dark Reader (mesma engine da extensão open source
// https://darkreader.org). Valores neutros que preservam bordas e contraste.
const DR_THEME = { brightness: 100, contrast: 90, sepia: 0 } as const;

// ===== Store compartilhado: fonte única de verdade do modo escuro, para que
// o botão e outros elementos (ex.: logo) reajam juntos. =====
let darkState = false;
let initialized = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function applyDarkReader(on: boolean) {
  try {
    const dr = await import('darkreader');
    if (on) {
      // Permite ao Dark Reader buscar CSS externo (fontes, etc.) para inverter certo.
      dr.setFetchMethod(window.fetch);
      dr.enable(DR_THEME);
    } else {
      dr.disable();
    }
  } catch (err) {
    console.error('[DarkReader] falha ao alternar tema:', err);
  }
}

// Aplica a preferência salva uma única vez no cliente.
function ensureInit() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  let on = false;
  try { on = localStorage.getItem(STORAGE_KEY) === 'on'; } catch { /* ignore */ }
  if (on) {
    darkState = true;
    applyDarkReader(true);
    emit();
  }
}

// Aplicar o Dark Reader recalcula os estilos da página inteira. O "travamento"
// vinha de cada elemento com `transition`/`transition-all` (centenas de cards,
// botões e badges no board) animar a troca de cor ao mesmo tempo. Desligamos
// todas as transições/animações enquanto o Dark Reader repinta e as devolvemos
// no frame seguinte — assim a troca de tema é instantânea em vez de arrastada.
function setDark(on: boolean) {
  darkState = on;
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    const killTransitions = document.createElement('style');
    killTransitions.textContent =
      '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(killTransitions);
    applyDarkReader(on).finally(() => {
      // Dois frames: garante que o Dark Reader já pintou antes de reativar as
      // transições (senão o primeiro hover/foco re-anima a mudança de cor).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => killTransitions.remove()),
      );
    });
  } else {
    applyDarkReader(on);
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Estado compartilhado do modo escuro (Dark Reader). Retorna se está ativo e a
 * função para alternar. Vários componentes podem usar — ficam sincronizados.
 */
export function useDarkMode() {
  useEffect(() => { ensureInit(); }, []);
  const isDark = useSyncExternalStore(subscribe, () => darkState, () => false);
  const toggle = useCallback(() => setDark(!darkState), []);
  return { isDark, toggle };
}

/**
 * Botão de modo escuro. Usa a biblioteca Dark Reader para inverter o tema claro
 * dinamicamente (em vez das classes `dark:` do Tailwind). A preferência fica no
 * navegador (localStorage).
 */
export function DarkModeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Desativar modo escuro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className={cn(
        'relative h-9 w-16 rounded-full border transition-colors shrink-0',
        isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-100 border-gray-300',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-1 flex h-7 w-7 items-center justify-center rounded-full shadow transition-all duration-300',
          isDark ? 'left-8 bg-indigo-500 text-white' : 'left-1 bg-white text-amber-500',
        )}
      >
        {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </span>
    </button>
  );
}
