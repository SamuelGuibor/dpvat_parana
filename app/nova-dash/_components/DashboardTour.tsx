'use client';

/**
 * Tour de onboarding da nova-dash (equipe), com foco em desktop.
 *
 * Abre sozinho na primeira visita (User.onboarding.dash.done = false) e
 * retoma do passo salvo. Pode ser reaberto a qualquer momento pelo botão
 * de ajuda do cabeçalho, que dispara o evento 'start-tour-dash'.
 */

import { useEffect, useState } from 'react';
import { Tour, TourStep, fetchOnboarding } from '@/app/_components/onboarding/Tour';

export const START_DASH_TOUR_EVENT = 'start-tour-dash';

interface Props {
  /** Troca a aba ativa da dashboard (alguns passos apontam elementos de abas). */
  // eslint-disable-next-line no-unused-vars
  onNavigate: (tab: string) => void;
}

export function DashboardTour({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [initialStep, setInitialStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchOnboarding().then((state) => {
      if (cancelled || !state) return;
      if (!state.dash.done) {
        setInitialStep(state.dash.step ?? 0);
        setOpen(true);
      }
    });
    const restart = () => { setInitialStep(0); setOpen(true); };
    window.addEventListener(START_DASH_TOUR_EVENT, restart);
    return () => {
      cancelled = true;
      window.removeEventListener(START_DASH_TOUR_EVENT, restart);
    };
  }, []);

  const steps: TourStep[] = [
    {
      emoji: '👋',
      title: 'Bem-vindo(a) ao CRM DPVAT Paraná!',
      description:
        'Este é um tour rápido pela plataforma. Vamos mostrar onde fica cada coisa e o que ela faz. Você pode pular quando quiser e rever depois pelo botão de ajuda (?) no topo.',
    },
    {
      target: '[data-tour="tabs"]',
      emoji: '🧭',
      title: 'Navegação principal',
      description:
        'Estas abas são as áreas da plataforma. Dependendo das suas permissões você verá mais ou menos abas — o essencial é o Kanban (processos) e o Espaço de Trabalho (chat e WhatsApp).',
      placement: 'bottom',
      onEnter: () => onNavigate('kanban'),
    },
    {
      target: '[data-tour="tab-kanban"]',
      emoji: '📋',
      title: 'Kanban Workflow',
      description:
        'O coração do CRM: cada cartão é um cliente/processo e cada coluna é uma etapa do fluxo. Arraste os cartões entre colunas para avançar o processo e clique em um cartão para abrir todos os detalhes (dados, arquivos, comentários e histórico).',
      placement: 'bottom',
      onEnter: () => onNavigate('kanban'),
    },
    {
      target: '[data-tour="tab-workspace"]',
      emoji: '💬',
      title: 'Espaço de Trabalho',
      description:
        'Aqui ficam o chat interno da equipe, o inbox do WhatsApp com os clientes e a Visão do Gestor (para quem tem acesso). O número vermelho mostra mensagens não lidas.',
      placement: 'bottom',
    },
    {
      emoji: '🔎',
      title: 'Busca global (Ctrl+K)',
      description:
        'Pressione Ctrl+K em qualquer tela para buscar cartões por nome, número, CPF ou telefone e navegar rapidamente pela plataforma. É o jeito mais rápido de achar um cliente.',
    },
    {
      target: '[data-tour="notifications"]',
      emoji: '🔔',
      title: 'Notificações',
      description:
        'Avisos de menções, prazos estourados, mensagens e movimentações importantes chegam aqui. Clique para ver a lista e ir direto ao cartão ou conversa.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="user-menu"]',
      emoji: '👤',
      title: 'Seu perfil',
      description:
        'Clique no seu avatar para editar o perfil, trocar a foto e sair da conta.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="dark-mode"]',
      emoji: '🌙',
      title: 'Modo escuro',
      description:
        'Prefere trabalhar com tema escuro? É só clicar aqui para alternar entre claro e escuro.',
      placement: 'bottom',
    },
    {
      emoji: '🎉',
      title: 'Pronto! Bom trabalho',
      description:
        'Você já conhece o essencial. Explore com calma — e se quiser rever este tutorial, clique no botão de ajuda (?) no topo da tela a qualquer momento.',
    },
  ];

  return (
    <Tour
      area="dash"
      steps={steps}
      initialStep={initialStep}
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
