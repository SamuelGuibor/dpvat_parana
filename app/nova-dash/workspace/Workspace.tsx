'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MySpace } from '@/app/nova-dash/MySpace';
import { Chat } from './chat/Chat';
import { AIReview } from './whatsapp/AIReview';
import { countPendingReviews } from '@/app/_actions/whatsapp/reviews';
import { ManagerDashboard } from './manager/ManagerDashboard';
import { CostsPanel } from './costs/CostsPanel';
import { NumbersPanel } from './numbers/NumbersPanel';
import { SecurityPanel } from './security/SecurityPanel';
import { WorkspaceSidebar, type WorkspaceSection } from './WorkspaceSidebar';
import { useUnread } from '@/app/_shared/hooks/use-chat';
import { isManager } from '@/app/_shared/lib/managers';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';
import { StrategicDashboard } from '../StrategicDashboard';

export function Workspace() {
  const { data: session } = useSession();
  // Permissão resolvida no servidor (cargo + override + allowlist de e-mails);
  // enquanto carrega, cai no fallback por e-mail para não piscar o menu.
  const { perms, loading: permsLoading } = usePermissions();
  const manager = permsLoading ? isManager(session?.user?.email) : perms.manager_dashboard;
  const { unread } = useUnread();
  const chatUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  const canReviewAi = !permsLoading && perms.review_ai;
  const canViewCosts = !permsLoading && perms.view_costs;
  const canManageNumbers = !permsLoading && perms.manage_wa_numbers;
  const canManageSecurity = !permsLoading && perms.manage_team;

  // A aba Chatbot do dashboard resolve a própria allowlist na carga única
  // (get-strategic-dashboard) — nada a pré-buscar aqui.
  const [section, setSection] = useState<WorkspaceSection>('meu-espaco');

  // Badge da Revisão da IA: contagem leve, só para quem tem a permissão.
  // Sem polling agressivo — a fila só cresce quando um atendimento encerra.
  const [reviewPending, setReviewPending] = useState(0);
  useEffect(() => {
    if (!canReviewAi) return;
    let alive = true;
    const tick = () => {
      countPendingReviews()
        .then((n) => alive && setReviewPending(n))
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 120_000);
    return () => { alive = false; clearInterval(id); };
  }, [canReviewAi, section]);

  // O WhatsApp saiu do Espaço de Trabalho: agora é aba própria da nova-dash.
  // A notificação clicada troca a aba lá em page.tsx; nada a fazer aqui.

  // Menção do chat clicada na caixa de Menções: page.tsx traz para cá, aqui
  // abrimos a seção do Chat (o canal em si o Chat lê do sessionStorage).
  useEffect(() => {
    const openChat = () => setSection('chat');
    window.addEventListener('open-chat-channel', openChat);
    return () => window.removeEventListener('open-chat-channel', openChat);
  }, []);

  // Guarda extra: sem a permissão, cair numa seção restrita volta para o início.
  const effective: WorkspaceSection =
    (section === 'gestao' && !manager)
    || (section === 'revisao-ia' && !canReviewAi)
    || (section === 'custos' && !canViewCosts)
    || (section === 'numeros' && !canManageNumbers)
    || (section === 'seguranca' && !canManageSecurity)
      ? 'meu-espaco'
      : section;

  return (
    // Mobile: navegação em barra no topo (coluna); desktop: sidebar à esquerda.
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <WorkspaceSidebar active={effective} onChange={setSection} isManager={manager} canReviewAi={canReviewAi} canViewCosts={canViewCosts} canManageNumbers={canManageNumbers} canManageSecurity={canManageSecurity} chatUnread={chatUnread} reviewPending={reviewPending} />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {effective === 'meu-espaco' && <div className="h-full overflow-y-auto"><MySpace /></div>}
        {effective === 'chat' && <div className="h-full p-1.5 sm:p-4"><Chat /></div>}
        {effective === 'revisao-ia' && <div className="h-full p-2 sm:p-4"><AIReview /></div>}
        {effective === 'dashboard' && <div className="h-full overflow-y-auto"><StrategicDashboard /></div>}
        {effective === 'gestao' && <div className="h-full overflow-y-auto"><ManagerDashboard /></div>}
        {effective === 'custos' && <div className="h-full overflow-y-auto"><CostsPanel /></div>}
        {effective === 'numeros' && <div className="h-full overflow-y-auto"><NumbersPanel /></div>}
        {effective === 'seguranca' && <div className="h-full overflow-y-auto"><SecurityPanel /></div>}
      </div>
    </div>
  );
}
