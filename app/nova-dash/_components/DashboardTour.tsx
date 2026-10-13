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

  const steps: TourStep[] = [
    {
      emoji: '👋',
      title: 'Bem-vindo(a) ao CRM Seguros Paraná',
      description:
        'Em menos de 2 minutos você vai conhecer as áreas do sistema e onde cada tarefa do dia a dia acontece. Use as setas para avançar, pule quando quiser e reveja tudo depois pelo botão (?) no topo.',
    },
    {
      target: '[data-tour="tabs"]',
      emoji: '🧭',
      title: 'Navegação principal',
      description:
        'Cada aba é uma área do sistema. As abas visíveis dependem do seu cargo e das permissões liberadas pelo gestor — se faltar alguma de que você precisa, peça a liberação.',
      placement: 'bottom',
      onEnter: () => onNavigate('kanban'),
    },
    {
      target: '[data-tour="tab-kanban"]',
      emoji: '📋',
      title: 'Kanban Workflow',
      description:
        'O coração do CRM. Cada cartão é um cliente e cada coluna, uma etapa do processo (DPVAT/INSS). Arraste o cartão para avançar — toda movimentação fica registrada no histórico e pode disparar automações (comentários, documentos, mensagens no WhatsApp).',
      placement: 'bottom',
      onEnter: () => onNavigate('kanban'),
    },
    {
      emoji: '🗂️',
      title: 'Dentro do cartão',
      description:
        'Clique em um cartão para abrir a ficha completa: dados pessoais e do acidente, documentos organizados em pastas, comentários com @menções, etiquetas, prazos e o histórico de tudo o que aconteceu com o cliente.',
    },
    {
      target: '[data-tour="tab-workspace"]',
      emoji: '🏠',
      title: 'Espaço de Trabalho',
      description:
        'Seu painel pessoal com o resumo do seu trabalho. Gestores encontram aqui também a Visão do Gestor, com indicadores da equipe e dos setores.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="tab-mencoes"]',
      emoji: '📌',
      title: 'Menções e Tarefas',
      description:
        'Quando alguém te marca com @ em um comentário ou envia uma tarefa ao seu setor, ela chega aqui. Marque como vista ou concluída — o contador vermelho mostra o que ainda está pendente.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="tab-ponto"]',
      emoji: '⏱️',
      title: 'Controle de Ponto',
      description:
        'Registre entrada, pausas e saída e acompanhe seu banco de horas.',
      placement: 'bottom',
    },
    {
      emoji: '🔎',
      title: 'Busca rápida — Ctrl+K',
      description:
        'Em qualquer tela, aperte Ctrl+K e digite nome, número do cartão, CPF ou telefone para abrir o cliente na hora. Também serve para pular entre as abas.',
    },
    {
      target: '[data-tour="events"]',
      emoji: '📅',
      title: 'Eventos',
      description:
        'Compromissos e avisos da equipe (perícias, reuniões, datas importantes). O número indica os eventos que estão chegando.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="notifications"]',
      emoji: '🔔',
      title: 'Notificações',
      description:
        'Menções, prazos estourados e movimentações importantes chegam aqui. Clique em um aviso para ir direto ao cartão ou à conversa.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="user-menu"]',
      emoji: '👤',
      title: 'Seu perfil',
      description:
        'Altere seus dados, troque a foto e a senha ou saia da conta.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="dark-mode"]',
      emoji: '🌙',
      title: 'Modo escuro',
      description: 'Alterne entre o tema claro e o escuro quando quiser.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="help"]',
      emoji: '🎉',
      title: 'Tudo pronto!',
      description:
        'Você já conhece o essencial. Sempre que quiser rever este tour, clique aqui no botão (?). Bom trabalho!',
      placement: 'bottom',
    },
  ];

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


  return (
    <Tour
      area="dash"
      steps={steps}
      initialStep={Math.min(initialStep, steps.length - 1)}
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
