'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { MySpace } from '@/app/nova-dash/MySpace';
import { Chat } from './chat/Chat';
import { ManagerDashboard } from './manager/ManagerDashboard';
import { WorkspaceSidebar, type WorkspaceSection } from './WorkspaceSidebar';
import { useUnread } from '@/app/_shared/hooks/use-chat';
import { isManager } from '@/app/_shared/lib/managers';
import { StrategicDashboard } from '../StrategicDashboard';

export function Workspace() {
  const { data: session } = useSession();
  const manager = isManager(session?.user?.email);
  const { unread } = useUnread();
  const chatUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  const [section, setSection] = useState<WorkspaceSection>('meu-espaco');

  // Guarda extra: se não é gestor e cair em "gestao", volta para o início.
  const effective: WorkspaceSection = section === 'gestao' && !manager ? 'meu-espaco' : section;

  return (
    <div className="flex h-full min-h-0">
      <WorkspaceSidebar active={effective} onChange={setSection} isManager={manager} chatUnread={chatUnread} />
      <div className="min-w-0 flex-1 overflow-hidden">
        {effective === 'meu-espaco' && <div className="h-full overflow-y-auto"><MySpace /></div>}
        {effective === 'chat' && <div className="h-full p-4"><Chat /></div>}
        {effective === 'dashboard' && <div className="h-full overflow-y-auto"><StrategicDashboard /></div>}
        {effective === 'gestao' && <div className="h-full overflow-y-auto"><ManagerDashboard /></div>}
      </div>
    </div>
  );
}
