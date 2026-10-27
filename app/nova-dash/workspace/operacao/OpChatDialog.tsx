'use client';

// Um chat da IA de operação em balões (27/10): o pedido da pessoa, as ações
// que o app fez no CRM e a resposta do app. Gestor abre qualquer chat; o
// operador, só os próprios (a action confere no servidor). O texto só carrega
// ao abrir. Resposta existe só para chats depois do hook op-response.mjs.

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { getOpChatAction } from '@/app/_actions/op/metrics';
import type { OpChatView } from '@/app/_shared/lib/op/metrics';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { fmtDateTime, openCard } from './op-ui';

// Nome curto de cada ferramenta para a linha de ação (o resto aparece cru).
const TOOL_LABEL: Record<string, string> = {
  buscar_cliente: 'Buscou cliente',
  obter_card: 'Abriu o card',
  panorama_card: 'Panorama do card',
  listar_cards_coluna: 'Listou a coluna',
  listar_cards_parados: 'Listou parados',
  listar_documentos: 'Listou documentos',
  listar_historico: 'Leu o histórico',
  verificar_pendencias: 'Conferiu pendências',
  consultar_hospital: 'Consultou o hospital',
  consultar_conversa: 'Leu a conversa',
  analisar_documentos: 'Leu os documentos com IA',
  preparar_procuracao: 'Preparou procuração',
  preparar_pedido_prontuario: 'Preparou pedido de prontuário',
  preparar_contrato: 'Preparou contrato',
  anexar_rascunho: 'Anexou documento',
  mover_card: 'Moveu o card',
  comentar_card: 'Comentou no card',
  editar_cadastro: 'Editou o cadastro',
  adicionar_tag: 'Marcou tag',
  remover_tag: 'Tirou tag',
  arquivar_card: 'Arquivou',
  notificar_pessoa: 'Avisou a equipe',
  preparar_email: 'Preparou e-mail',
  preparar_whatsapp: 'Preparou WhatsApp',
  executar_aprovado: 'Enviou o aprovado',
  meu_dia: 'Montou o dia',
  gerar_relatorio: 'Gerou relatório',
};

export function OpChatDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const [chat, setChat] = useState<OpChatView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let vivo = true;
    setChat(null);
    setError(null);
    setLoading(true);
    getOpChatAction({ sessionId })
      .then((c) => vivo && setChat(c))
      .catch((err) => {
        console.error(err);
        // Produção mascara o erro da action: mensagem própria.
        if (vivo) setError('Não foi possível abrir este chat. Só o gestor ou quem fez o chat pode ler.');
      })
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [sessionId]);

  const cardLabel = (id: string) => {
    const c = chat?.cardsInfo[id];
    return c ? `#${c.cardNumber ?? '?'}${c.nome ? ` ${c.nome.split(' ')[0]}` : ''}` : 'card';
  };

  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-gray-100 px-5 py-4">
          <DialogTitle className="text-base">{chat ? `Chat de ${chat.operador}` : 'Chat'}</DialogTitle>
          <DialogDescription className="text-xs">
            {chat ? `${fmtDateTime(chat.inicio)} → ${fmtDateTime(chat.ultimo)} · ${chat.mensagens.length} pedido(s)` : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-gray-50/60 px-5 py-4">
          {loading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo o chat…</div>}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {chat?.cortado && (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" /> Chat muito longo: mostrando o começo.</p>
          )}
          {chat && !chat.mensagens.length && <p className="text-sm text-gray-400">Este chat não tem pedidos registrados.</p>}

          {chat?.mensagens.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {/* Pedido da pessoa */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm text-white">
                  <p className="whitespace-pre-wrap break-words">{msg.texto}</p>
                  <p className="mt-1 text-right text-[10px] text-indigo-200">{fmtDateTime(msg.criadoEm)}</p>
                </div>
              </div>

              {/* O que o app fez no CRM */}
              {!!msg.acoes.length && (
                <div className="space-y-1 pl-1">
                  {msg.acoes.map((a) => (
                    <div key={a.id} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                      {a.ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />}
                      <span className="min-w-0">
                        <span className="font-medium text-gray-700">{TOOL_LABEL[a.tool] ?? a.tool}</span>
                        {a.code && !a.ok && <span className="text-rose-600"> · {a.code}</span>}
                        {a.summary && <span> · {a.summary}</span>}
                        {a.cardIds.slice(0, 3).map((id) => (
                          <button key={id} type="button" onClick={() => openCard(id)} className="ml-1 rounded bg-white px-1 text-indigo-700 ring-1 ring-gray-200 hover:underline">
                            {cardLabel(id)}
                          </button>
                        ))}
                        {a.cardIds.length > 3 && <span> +{a.cardIds.length - 3}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Resposta do app */}
              <div className="flex justify-start">
                {msg.resposta ? (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-800">
                    <p className="whitespace-pre-wrap break-words">{msg.resposta}</p>
                    {msg.respondidoEm && <p className="mt-1 text-[10px] text-gray-400">{fmtDateTime(msg.respondidoEm)}</p>}
                  </div>
                ) : (
                  <p className="pl-1 text-[11px] italic text-gray-400">Resposta não registrada (chat de antes de 27/10 ou app sem atualizar).</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
