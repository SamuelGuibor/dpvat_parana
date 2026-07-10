'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MySpace } from '@/app/nova-dash/MySpace';
import { Chat } from './chat/Chat';
import { WhatsAppInbox } from './whatsapp/WhatsAppInbox';
import { ManagerDashboard } from './manager/ManagerDashboard';
import { WorkspaceSidebar, type WorkspaceSection } from './WorkspaceSidebar';
import { useUnread } from '@/app/_shared/hooks/use-chat';
import { useWhatsAppUnread } from '@/app/_shared/hooks/use-whatsapp';
import { isManager } from '@/app/_shared/lib/managers';
import { StrategicDashboard } from '../StrategicDashboard';

export function Workspace() {
  const { data: session } = useSession();
  const manager = isManager(session?.user?.email);
  const { unread } = useUnread();
  const chatUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const whatsappUnread = useWhatsAppUnread();

  const [section, setSection] = useState<WorkspaceSection>('meu-espaco');

  // Notificação de WhatsApp clicada → troca pra seção do inbox. Se o clique
  // aconteceu antes deste componente montar, o sinal fica no sessionStorage.
  useEffect(() => {
    function openWhatsApp() {
      setSection('whatsapp');
    }
    if (sessionStorage.getItem('wa-open-contact')) setSection('whatsapp');
    window.addEventListener('open-whatsapp-conversation', openWhatsApp);
    return () => window.removeEventListener('open-whatsapp-conversation', openWhatsApp);
  }, []);

  // Guarda extra: se não é gestor e cair em "gestao", volta para o início.
  const effective: WorkspaceSection = section === 'gestao' && !manager ? 'meu-espaco' : section;

  return (
    <div className="flex h-full min-h-0">
      <WorkspaceSidebar active={effective} onChange={setSection} isManager={manager} chatUnread={chatUnread} whatsappUnread={whatsappUnread} />
      <div className="min-w-0 flex-1 overflow-hidden">
        {effective === 'meu-espaco' && <div className="h-full overflow-y-auto"><MySpace /></div>}
        {effective === 'chat' && <div className="h-full p-4"><Chat /></div>}
        {effective === 'whatsapp' && <div className="h-full p-4"><WhatsAppInbox /></div>}
        {effective === 'dashboard' && <div className="h-full overflow-y-auto"><StrategicDashboard /></div>}
        {effective === 'gestao' && <div className="h-full overflow-y-auto"><ManagerDashboard /></div>}
      </div>
    </div>
  );
}
