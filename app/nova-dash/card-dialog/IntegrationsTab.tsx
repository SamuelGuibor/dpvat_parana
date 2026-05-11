import { Button } from '@/app/_components/ui/button';
import { Mail, MessageCircle } from 'lucide-react';
import { IoIosDocument } from 'react-icons/io';
import type { ExtendedKanbanCard } from './types';

interface Props {
  editedCard: ExtendedKanbanCard;
  isProcess: boolean;
}

function IntegrationCard({
  icon, iconBg, hoverBorder, title, subtitle, description,
  buttonClass, buttonIcon, buttonLabel, onClick, disabled,
}: {
  icon: React.ReactNode;
  iconBg: string;
  hoverBorder: string;
  title: string;
  subtitle: string;
  description: React.ReactNode;
  buttonClass: string;
  buttonIcon: React.ReactNode;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`bg-white border border-gray-100 rounded-2xl p-5 transition-all shadow-sm ${hoverBorder}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>{icon}</div>
        <div>
          <h5 className="font-bold text-gray-900 text-sm">{title}</h5>
          <p className="text-[10px] text-gray-400 font-bold uppercase">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
          <p className="text-[11px] text-gray-500 leading-tight">{description}</p>
        </div>
        <Button onClick={onClick} disabled={disabled} className={`w-full text-white font-bold rounded-lg ${buttonClass}`} size="sm">
          {buttonIcon} {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsTab({ editedCard, isProcess }: Props) {
  async function generateProcuracao() {
    const res = await fetch('/api/procuracao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editedCard.id, type: isProcess ? 'process' : 'user' }),
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procuracao-${editedCard.title}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="grid grid-cols-1 gap-4">
        <div className="group bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-6 hover:shadow-xl hover:shadow-indigo-100/50 transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/20 rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <IoIosDocument className="w-7 h-7 text-white" />
            </div>
            <h4 className="text-lg font-black text-indigo-950">Geração de Procuração</h4>
          </div>
          <Button onClick={generateProcuracao} className="bg-indigo-800 hover:bg-indigo-950 text-white font-bold h-12 rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 w-full">
            <IoIosDocument className="w-4 h-4 mr-2" /> Gerar Procuração
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IntegrationCard
            icon={<Mail className="w-5 h-5 text-blue-600" />}
            iconBg="bg-blue-50" hoverBorder="hover:border-blue-400"
            title="Gestão de Prontuários" subtitle="Via Gmail / Outlook"
            description="Envia uma solicitação formal de prontuário para o cliente/unidade."
            buttonClass="bg-blue-600 hover:bg-blue-700"
            buttonIcon={<Mail className="w-4 h-4 mr-2" />}
            buttonLabel="Solicitar Prontuário"
            onClick={() => alert('Solicitando Prontuário por Email...')}
            disabled
          />
          <IntegrationCard
            icon={<MessageCircle className="w-5 h-5 text-green-600" />}
            iconBg="bg-green-50" hoverBorder="hover:border-green-400"
            title="WhatsApp Inteligente" subtitle={`Status: ${editedCard.status}`}
            description={<>Envia mensagem baseada na etapa: <span className="font-bold text-green-700">{editedCard.status}</span></>}
            buttonClass="bg-green-600 hover:bg-green-700"
            buttonIcon={<MessageCircle className="w-4 h-4 mr-2" />}
            buttonLabel="Enviar Status Atual"
            onClick={() => alert(`Enviando WhatsApp para etapa: ${editedCard.status}`)}
            disabled
          />
        </div>
      </div>
    </div>
  );
}