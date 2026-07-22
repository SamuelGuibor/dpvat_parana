'use client';

/**
 * Tour de onboarding da área do cliente, com foco em mobile.
 *
 * Abre sozinho na primeira visita (User.onboarding.client.done = false) e
 * retoma do passo salvo. O botão "Ver tutorial" da página dispara o evento
 * 'start-tour-client' para rever quando quiser.
 */

import { useEffect, useState } from 'react';
import { Tour, TourStep, fetchOnboarding } from '@/app/_components/onboarding/Tour';

export const START_CLIENT_TOUR_EVENT = 'start-tour-client';

export function ClientTour() {
  const [open, setOpen] = useState(false);
  const [initialStep, setInitialStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchOnboarding().then((state) => {
      if (cancelled || !state) return;
      if (!state.client.done) {
        setInitialStep(state.client.step ?? 0);
        setOpen(true);
      }
    });
    const restart = () => { setInitialStep(0); setOpen(true); };
    window.addEventListener(START_CLIENT_TOUR_EVENT, restart);
    return () => {
      cancelled = true;
      window.removeEventListener(START_CLIENT_TOUR_EVENT, restart);
    };
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const steps: TourStep[] = [
    {
      emoji: '👋',
      title: 'Bem-vindo(a) à sua área do cliente!',
      description:
        'Aqui você acompanha seus processos de perto, sem precisar ligar para o escritório. Vamos fazer um tour rápido? Leva menos de 1 minuto.',
    },
    {
      target: '[data-tour="client-processos"]',
      emoji: '🚗',
      title: 'Seus processos',
      description:
        'Cada cartão aqui é um processo seu. Toque em "Ver status" para acompanhar em que etapa ele está — cada avanço aparece na hora para você.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="client-links"]',
      emoji: '⚡',
      title: 'Acesso rápido',
      description:
        'Atalhos para o que você mais usa: seus Documentos (arquivos do processo), a página de Dúvidas (FAQ) e o Início do site.',
      placement: 'top',
    },
    // O passo do menu só faz sentido no celular (no desktop a barra lateral já está aberta).
    ...(isMobile
      ? [{
          target: '[data-tour="client-menu"]',
          emoji: '📱',
          title: 'Menu de navegação',
          description:
            'Toque aqui para abrir o menu e navegar entre Início, Área do cliente, Documentos e Ajuda.',
          placement: 'bottom' as const,
        }]
      : [{
          target: '[data-tour="client-sidebar"]',
          emoji: '🧭',
          title: 'Menu de navegação',
          description:
            'Use este menu para navegar entre Início, Área do cliente, Documentos e Ajuda & FAQ.',
          placement: 'right' as const,
        }]),
    {
      emoji: '💚',
      title: 'Tudo pronto!',
      description:
        'Qualquer dúvida, fale com a gente pelo WhatsApp ou veja a página de Dúvidas (FAQ). Para rever este tutorial, toque em "Ver tutorial" no topo da página.',
    },
  ];

  return (
    <Tour
      area="client"
      steps={steps}
      initialStep={initialStep}
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
