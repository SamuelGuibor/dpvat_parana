'use client';

import { useState } from 'react';
import { Brain, Loader2, ArrowRight, AlertTriangle, Bot, Target, Lightbulb, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { analyzeBrainTeaching, applyBrainTeaching, type TeachResult } from '@/app/_actions/whatsapp/teach-brain';
import type { TeachKind } from '@/app/_shared/utils/teach-brain';

// "Ensinar o cérebro do bot" no Copiloto (permissão teach_bot): o atendente
// escreve a regra a partir da conversa aberta; a IA confere contra o playbook
// publicado e o que o bot fez aqui, e o popup mostra a trilha completa antes
// de publicar — regra ativa que o bot não seguiu vira reforço, não duplicata.

const KINDS: { key: TeachKind; label: string }[] = [
  { key: 'regra', label: 'Regra' },
  { key: 'sugestao', label: 'Sugestão' },
  { key: 'correcao', label: 'Correção' },
];

const RELATION_LABEL = { igual: 'igual', parecida: 'parecida', conflita: 'conflita' } as const;

export function TeachBrainCard({ contactId }: { contactId: string }) {
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<TeachKind>('regra');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<TeachResult | null>(null);
  const [proposed, setProposed] = useState('');
  const [applying, setApplying] = useState<null | 'reforcar' | 'nova' | 'fila'>(null);

  async function handleAnalyze() {
    if (analyzing) return;
    if (draft.trim().length < 8) { toast.error('Descreva a regra com um pouco mais de detalhe.'); return; }
    setAnalyzing(true);
    try {
      const r = await analyzeBrainTeaching({ contactId, request: draft, kind });
      setResult(r);
      setProposed(r.analysis.proposedText || draft.trim());
    } catch (e) {
      // Erro de server action chega mascarado em produção: mensagem própria.
      toast.error(e instanceof Error && e.message && !e.message.includes('Server Components')
        ? e.message : 'Não foi possível analisar a regra agora.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleApply(mode: 'reforcar' | 'nova' | 'fila') {
    if (!result || applying) return;
    setApplying(mode);
    try {
      const { message } = await applyBrainTeaching({
        contactId,
        mode,
        text: proposed,
        request: draft.trim(),
        targetRuleId: result.analysis.targetRuleId,
        playbookVersion: result.playbookVersion,
      });
      toast.success(message);
      setResult(null);
      setDraft('');
    } catch (e) {
      toast.error(e instanceof Error && e.message && !e.message.includes('Server Components')
        ? e.message : 'Não foi possível publicar no cérebro.');
    } finally {
      setApplying(null);
    }
  }

  const a = result?.analysis;
  const target = a?.targetRuleId ? a.existing.find((e) => e.id === a.targetRuleId) : undefined;

  return (
    <>
      <div className="rounded-xl border border-violet-200 bg-white p-2.5">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-violet-600">
          <Brain className="h-3 w-3" /> Ensinar o cérebro do bot
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Ex.: quando o cliente manda foto do BO, não pedir de novo a data do acidente"
          className="w-full resize-none rounded-lg border border-violet-100 bg-violet-50/40 p-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
        <div className="mt-1.5 flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                kind === k.key ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing || !draft.trim()}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
        >
          {analyzing
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo com o playbook…</>
            : <>Analisar com IA <ArrowRight className="h-3.5 w-3.5" /></>}
        </button>
      </div>

      <Dialog open={!!result} onOpenChange={(o) => { if (!o && !applying) setResult(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova regra para o cérebro</DialogTitle>
          </DialogHeader>
          {a && result && (
            <div className="flex flex-col gap-2.5 text-sm">
              <Section icon={<MessageSquare className="h-3.5 w-3.5" />} title="O que você pediu">
                <p className="text-gray-700">{a.request || draft}</p>
              </Section>

              <Section
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                title={a.existing.length
                  ? `Já existe no playbook${result.playbookVersion ? ` (v${result.playbookVersion})` : ''}`
                  : 'Nenhuma regra ativa cobre isso'}
                tone={a.existing.length ? 'amber' : 'gray'}
              >
                {a.existing.length === 0 && <p className="text-gray-500">O playbook publicado não tem regra sobre esse assunto.</p>}
                {a.existing.map((e) => (
                  <p key={e.id} className="mb-1 last:mb-0 text-amber-900">
                    <span className="mr-1 rounded bg-amber-100 px-1.5 text-[11px] font-bold">{e.id} · {RELATION_LABEL[e.relation]}</span>
                    <span className="text-[11px] text-amber-700">{e.section}</span>
                    <span className="block">{e.text}</span>
                  </p>
                ))}
              </Section>

              <Section icon={<Bot className="h-3.5 w-3.5" />} title="O que a IA fez nesta conversa">
                {a.botActions.length === 0 && <p className="text-gray-500">Nada nesta conversa tem a ver com o pedido.</p>}
                {a.botActions.map((b, i) => (
                  <p key={i} className="mb-1 flex flex-wrap items-center gap-1.5 text-gray-700 last:mb-0">
                    <span className="text-[11px] text-gray-400">{b.at}</span>
                    <span>{b.what}</span>
                    {b.verdict === 'contrariou' && (
                      <span className="rounded-full bg-red-100 px-2 text-[11px] font-bold text-red-700">
                        contrariou{b.ruleId ? ` ${b.ruleId}` : ''}
                      </span>
                    )}
                    {b.verdict === 'ok' && <span className="rounded-full bg-emerald-100 px-2 text-[11px] font-bold text-emerald-700">certo</span>}
                  </p>
                ))}
                {result.decisions.length > 0 && (
                  <details className="mt-1.5 text-[11px] text-gray-500">
                    <summary className="cursor-pointer">Regras citadas pelo bot em cada decisão ({result.decisions.length})</summary>
                    {result.decisions.map((d, i) => (
                      <p key={i}>
                        {d.at} · {d.outcome ?? 'decisão'} · {d.appliedRules === null ? 'sem o campo' : d.appliedRules.join(', ') || 'nenhuma regra'}
                      </p>
                    ))}
                  </details>
                )}
              </Section>

              <Section icon={<Target className="h-3.5 w-3.5" />} title="O que esperar">
                <p className="text-gray-700">{a.expected || '—'}</p>
              </Section>

              <Section icon={<Lightbulb className="h-3.5 w-3.5" />} title="Diagnóstico e proposta" tone="sky">
                <p className="text-sky-900">{a.diagnosis}</p>
                <p className="mt-1.5 text-[11px] font-bold text-sky-700">
                  {a.recommendation === 'reforcar' && `Proposta: reforçar ${a.targetRuleId}${target ? ` (${target.section})` : ''}`}
                  {a.recommendation === 'nova' && 'Proposta: regra nova no fim do playbook'}
                  {a.recommendation === 'nada' && 'Proposta: nada a mudar'}
                </p>
                <textarea
                  value={proposed}
                  onChange={(e) => setProposed(e.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-sky-200 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-sky-300"
                />
              </Section>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <ActionButton onClick={() => handleApply('fila')} busy={applying === 'fila'} disabled={!!applying}>
                  Só registrar na fila de revisão
                </ActionButton>
                {a.recommendation === 'reforcar' ? (
                  <>
                    <ActionButton onClick={() => handleApply('nova')} busy={applying === 'nova'} disabled={!!applying || !proposed.trim()}>
                      Criar regra nova mesmo assim
                    </ActionButton>
                    <ActionButton primary onClick={() => handleApply('reforcar')} busy={applying === 'reforcar'} disabled={!!applying || !proposed.trim()}>
                      Reforçar {a.targetRuleId} e publicar
                    </ActionButton>
                  </>
                ) : (
                  <ActionButton primary={a.recommendation === 'nova'} onClick={() => handleApply('nova')} busy={applying === 'nova'} disabled={!!applying || !proposed.trim()}>
                    Publicar regra nova
                  </ActionButton>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  icon, title, tone = 'gray', children,
}: { icon: React.ReactNode; title: string; tone?: 'gray' | 'amber' | 'sky'; children: React.ReactNode }) {
  const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50'
    : tone === 'sky' ? 'border-sky-200 bg-sky-50' : 'border-gray-200 bg-white';
  const head = tone === 'amber' ? 'text-amber-700' : tone === 'sky' ? 'text-sky-700' : 'text-gray-600';
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <p className={`mb-1 flex items-center gap-1.5 text-xs font-bold ${head}`}>{icon}{title}</p>
      {children}
    </div>
  );
}

function ActionButton({
  children, onClick, busy, disabled, primary,
}: { children: React.ReactNode; onClick: () => void; busy: boolean; disabled: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
        primary ? 'bg-sky-600 text-white hover:bg-sky-700' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
