'use client';

// Seção "IA de operação" do Espaço de Trabalho: interruptor por ferramenta de
// escrita da IA (Claude Code → /api/op). Desligada = some do catálogo do app e
// recusa com `ferramenta_desligada`; o efeito vale em até 15 s em todas as
// instâncias (cache do kill switch). Quem pode escrever continua sendo decidido
// pela permissão op_write de cada pessoa.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, Power, PowerOff } from 'lucide-react';
import { getOpSwitchPanel, setOpSwitchAction, type OpSwitchRow } from '@/app/_actions/op/switches';

const LABELS: Record<string, string> = {
  mover_card: 'Mover card',
  adicionar_tag: 'Marcar tag',
  remover_tag: 'Tirar tag',
  comentar_card: 'Comentar no card',
  notificar_pessoa: 'Avisar pessoa / tarefa de setor',
  arquivar_card: 'Arquivar / desarquivar',
  anexar_rascunho: 'Anexar documento preparado (procuração, pedido, KIT)',
  // Etapa 5 (envio para fora): o e-mail/WhatsApp só sai se o canal E o
  // "Enviar o aprovado" estiverem ligados e o operador digitar "aprovo <código>".
  preparar_email: 'E-mail para fora (hospital) — canal',
  preparar_whatsapp: 'WhatsApp ao cliente — canal',
  executar_aprovado: 'Enviar o que o operador aprovou (e-mail/WhatsApp)',
  // Etapa 6: só grava o progresso do fluxo (op_requests), nunca o card.
  // Desligada, /prontuario & cia. seguem sem poder retomar depois.
  salvar_progresso: 'Guardar o progresso dos fluxos (retomar com /retomar)',
};

export function OpSwitchesPanel() {
  const [rows, setRows] = useState<OpSwitchRow[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getOpSwitchPanel()
      .then((r) => { setRows(r.rows); setCanEdit(r.canEdit); })
      .catch((err) => {
        console.error(err);
        toast.error('Não foi possível carregar a IA de operação.');
        setRows([]);
      });
  }, []);
  useEffect(load, [load]);

  async function toggle(row: OpSwitchRow) {
    setBusy(row.name);
    try {
      await setOpSwitchAction(row.name, !row.on);
      toast.success(`${LABELS[row.name] ?? row.name}: ${row.on ? 'desligada' : 'ligada'}`);
      load();
    } catch (err) {
      console.error(err);
      // Erro de server action chega mascarado em produção: mensagem própria.
      toast.error('Não foi possível alterar. Só o Super Admin muda os interruptores.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">IA de operação</h2>
          <p className="text-sm text-gray-500">
            Ações que a IA pode fazer no CRM pelo app (Claude Code), sempre depois de mostrar a prévia e ouvir
            &quot;sim&quot; do operador. Desligada, a ação some do app de todo mundo em até 15 segundos.
            Quem pode usar cada ação depende da permissão &quot;IA altera o CRM&quot; da pessoa.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Envio para fora (e-mail, WhatsApp): só sai com o canal e &quot;Enviar o que o operador aprovou&quot; ligados,
            permissão &quot;Aprovar envios da IA&quot; e o operador digitando &quot;aprovo &lt;código&gt;&quot; no app.
          </p>
        </div>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {rows.map((row) => (
            <li key={row.name} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {LABELS[row.name] ?? row.name}
                  <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">{row.name}</span>
                </p>
                <p className="text-xs text-gray-500">{row.description}</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  7 dias: {row.calls7d} chamada(s), {row.ok7d} ok
                  {row.lastChange &&
                    ` · ${row.lastChange.on ? 'ligada' : 'desligada'} por ${row.lastChange.by} em ${new Date(row.lastChange.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`}
                </p>
              </div>
              <button
                type="button"
                disabled={!canEdit || busy === row.name}
                onClick={() => toggle(row)}
                title={canEdit ? undefined : 'Só o Super Admin altera'}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  row.on ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {busy === row.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : row.on ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                {row.on ? 'Ligada' : 'Desligada'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
