'use client';

import { useState, type ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { registrarConferencia } from '@/app/_actions/dev-tickets/ticket-actions';
import { extractContacts } from '@/app/_shared/utils/contacts';
import type { Lote } from '@/app/_shared/lib/cerebro';

// Conferência humana da amostra de um lote (tela 3 do pré-layout): texto
// literal da automação × nota do redator, com os contatos destacados nos dois
// lados. A decisão vai para o card do lote (registrarConferencia).

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? 'Falha ao carregar o lote.');
  return j;
};

function marked(text: string, terms: string[]): ReactNode[] {
  const list = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return [text];
  const re = new RegExp(`(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).map((p, i) => (list.includes(p) ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{p}</mark> : p));
}

interface Props {
  loteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SampleReviewDialog({ loteId, open, onOpenChange }: Props) {
  const { mutate } = useSWRConfig();
  const { data: lote, error, isLoading } = useSWR<Lote>(open ? `/api/cerebro/lotes/${encodeURIComponent(loteId)}` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const [i, setI] = useState(0);
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const total = lote?.amostra.length ?? 0;
  const atual = lote?.amostra[Math.min(i, Math.max(0, total - 1))];
  const fonteContatos = atual ? extractContacts(atual.fonte) : { email: [], telefone: [], site: [] };
  const terms = [...fonteContatos.email, ...fonteContatos.telefone, ...fonteContatos.site];
  const notaTexto = atual ? Object.values(atual.secoes).join('\n') : '';
  const notaContatos = extractContacts(notaTexto);
  const termsNota = [...notaContatos.email, ...notaContatos.telefone, ...notaContatos.site];

  async function decidir(decisao: 'confere' | 'devolver') {
    if (!atual) return;
    if (decisao === 'devolver' && !obs.trim()) {
      toast.error('Diga o que está errado: a observação volta para o redator.');
      return;
    }
    setSaving(true);
    try {
      await registrarConferencia(loteId, atual.nota, decisao, obs);
      toast.success(decisao === 'confere' ? 'Conferida.' : 'Devolvida ao redator.');
      setObs('');
      void mutate('/api/dev-tickets');
      if (i + 1 < total) setI(i + 1);
      else onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg && !/Server Components render/.test(msg) ? msg : 'Não foi possível registrar a conferência.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-50 dark:bg-zinc-950">
        <DialogHeader className="text-left">
          <div className="text-xs font-bold text-gray-600">
            Lote {loteId}
            {lote ? ` · ${lote.aprovadas.length} aprovadas pela IA · ${lote.devolvidas.length} devolvidas · ${lote.pendentes.length} pendência humana` : ''}
          </div>
          <DialogTitle className="text-2xl font-black tracking-tight">
            Conferência da amostra{total ? ` — nota ${Math.min(i, total - 1) + 1} de ${total}` : ''}
          </DialogTitle>
          <DialogDescription>Compare a nota com o texto literal da automação. Se a amostra inteira conferir, o card do lote vai para Concluído.</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-10 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando o lote do S3…
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{String(error.message ?? error)}</p>}
        {lote && !total && <p className="rounded-xl bg-white p-4 text-sm">Este lote não tem amostra (nenhuma nota aprovada).</p>}

        {atual && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-800">Fonte · texto da automação (literal)</h3>
                <p className="mb-3 mt-1 text-xs text-gray-600">{atual.automacao ?? atual.hospital ?? atual.nota}</p>
                <div className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-3.5 font-mono text-[13px] leading-relaxed">
                  {marked(atual.fonte, terms)}
                </div>
              </section>
              <section className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-800">Nota escrita pelo redator</h3>
                <p className="mb-3 mt-1 font-mono text-xs text-gray-600">{atual.nota}</p>
                <div className="space-y-2.5 text-sm leading-relaxed">
                  {Object.entries(atual.secoes).map(([titulo, texto]) => (
                    <div key={titulo}>
                      <b>{titulo}</b>
                      <div className="whitespace-pre-wrap">{marked(texto, termsNota)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-800">O que as checagens já confirmaram</h3>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: 'Contatos idênticos à fonte',
                    detail: `${atual.contatos.telefone.length} telefone · ${atual.contatos.email.length} e-mail · ${atual.contatos.site.length} link`,
                  },
                  { label: 'Nada acrescentado', detail: 'o validador não achou informação fora da fonte' },
                  {
                    label: 'Frontmatter válido',
                    detail: `modo: ${atual.modo?.join(', ') || '—'} · procuração: ${atual.procuracao ? 'sim' : 'não citada'}`,
                  },
                  { label: 'Hospital', detail: atual.hospital ?? '—' },
                ].map((c) => (
                  <div key={c.label} className="flex gap-2.5 rounded-xl border border-gray-200 p-3">
                    <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">✓</span>
                    <div>
                      <div className="text-[13px] font-bold">{c.label}</div>
                      <div className="text-xs text-gray-600">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="min-w-[260px] flex-1">
                <Label htmlFor="conf-obs" className="text-[13px] font-bold">
                  Observação (obrigatória para devolver; volta para o redator)
                </Label>
                <Input
                  id="conf-obs"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex.: faltou dizer que o formulário vai preenchido"
                  className="mt-1.5 h-11 rounded-xl"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="icon" className="h-11 w-11" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Nota anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-11 w-11" disabled={i + 1 >= total} onClick={() => setI(i + 1)} aria-label="Próxima nota">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl border-red-300 font-bold text-red-800 hover:bg-red-50"
                  disabled={saving}
                  onClick={() => decidir('devolver')}
                >
                  Devolver ao redator
                </Button>
                <Button className="h-11 rounded-xl bg-emerald-700 font-bold hover:bg-emerald-800" disabled={saving} onClick={() => decidir('confere')}>
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Confere — próxima
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
