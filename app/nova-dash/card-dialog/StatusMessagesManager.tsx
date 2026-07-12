/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send, ChevronDown, MessageSquare, Clock, RotateCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Badge } from '@/app/_shared/ui/badge';
import { Textarea } from '@/app/_shared/ui/textarea';
import { Checkbox } from '@/app/_shared/ui/checkbox';
import { Label } from '@/app/_shared/ui/label';
import { Separator } from '@/app/_shared/ui/separator';
import {
  listStatusMessages,
  saveStatusMessage,
  getCardWindowState,
  resendStatusMessage,
  type StatusMessageRow,
} from '@/app/_actions/whatsapp/status-messages';

interface Props {
  service?: string | null;
  currentStatus: string;
  phone?: string | null;
  clientName?: string | null;
}

/**
 * Painel dentro da aba "Progresso": gerencia as mensagens automáticas de
 * progressão de status enviadas ao cliente no WhatsApp — editar texto por
 * etapa, ligar/desligar o aviso, ver o estado da janela de 24h e reenviar a
 * mensagem da etapa atual sob demanda.
 */
export function StatusMessagesManager({ service, currentStatus, phone, clientName }: Props) {
  const [rows, setRows] = useState<StatusMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [window24h, setWindow24h] = useState<{ contactFound: boolean; windowOpen: boolean } | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [list, win] = await Promise.all([
          listStatusMessages(service, clientName),
          getCardWindowState(phone),
        ]);
        if (!alive) return;
        setRows(list.rows);
        setWindow24h(win);
      } catch (e) {
        if (alive) toast.error(e instanceof Error ? e.message : 'Falha ao carregar as mensagens.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [service, phone, clientName]);

  async function handleResend() {
    if (!phone) { toast.error('Este card não tem telefone cadastrado.'); return; }
    setResending(true);
    try {
      await resendStatusMessage({ phone, clientName, service, status: currentStatus });
      toast.success('Mensagem da etapa atual reenviada (respeitando a janela de 24h).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reenviar.');
    } finally {
      setResending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <Label className="text-sm font-semibold">Mensagens automáticas ao cliente</Label>
        </div>
        {window24h && (
          <Badge
            variant="outline"
            className={window24h.windowOpen
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'}
          >
            <Clock className="mr-1 h-3 w-3" />
            {window24h.windowOpen
              ? 'Janela de 24h aberta — texto livre'
              : window24h.contactFound
                ? 'Janela expirada — vai por template'
                : 'Cliente ainda não escreveu — vai por template'}
          </Badge>
        )}
      </div>

      <p className="text-xs leading-relaxed text-gray-500 dark:text-zinc-400">
        Ao avançar uma etapa, o cliente recebe esta mensagem no WhatsApp. Fora da janela de 24h da Meta,
        o texto livre não é aceito e o envio usa o template aprovado <code>atualizacao_status</code> —
        por isso o texto custom vale apenas dentro da janela. Use <code>{'{nome}'}</code> e{' '}
        <code>{'{etapa}'}</code> para personalizar.
      </p>

      {phone && (
        <Button variant="outline" size="sm" onClick={handleResend} disabled={resending} className="gap-1.5">
          {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
          Reenviar mensagem da etapa atual
        </Button>
      )}

      <Separator />

      <div className="space-y-2">
        {rows.map((row) => (
          <StatusMessageRowItem
            key={row.status}
            row={row}
            service={service}
            isCurrent={row.status === currentStatus}
          />
        ))}
      </div>
    </div>
  );
}

function StatusMessageRowItem({
  row, service, isCurrent,
}: { row: StatusMessageRow; service?: string | null; isCurrent: boolean }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(row.enabled);
  const [text, setText] = useState(row.customText ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = enabled !== row.enabled || (text.trim() || null) !== (row.customText?.trim() || null);

  async function save() {
    setSaving(true);
    try {
      await saveStatusMessage({ service, status: row.status, enabled, customText: text.trim() ? text : null });
      // Reflete o novo baseline localmente (evita re-fetch do painel inteiro).
      row.enabled = enabled;
      row.customText = text.trim() ? text : null;
      toast.success(`Etapa "${row.label}" atualizada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-lg border p-2.5 transition-colors ${
      isCurrent
        ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'
        : 'border-gray-200 dark:border-zinc-800'
    }`}>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`sm-${row.status}`}
          checked={enabled}
          onCheckedChange={(v) => setEnabled(!!v)}
          title={enabled ? 'Aviso ativo' : 'Aviso desligado'}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={`truncate text-sm font-medium ${enabled ? 'text-gray-800 dark:text-zinc-200' : 'text-gray-400 line-through'}`}>
            {row.label}
          </span>
          {isCurrent && (
            <Badge variant="outline" className="border-blue-300 text-[10px] text-blue-700 dark:text-blue-300">
              Etapa atual
            </Badge>
          )}
          {row.customText && (
            <Badge variant="outline" className="text-[10px] text-gray-500">personalizada</Badge>
          )}
          <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 pl-6">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={row.defaultText}
            rows={4}
            className="text-sm"
          />
          <p className="text-[11px] text-gray-400">
            Vazio = usa o texto padrão (mostrado acima como dica). Placeholders: {'{nome}'}, {'{etapa}'}.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={!dirty || saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
