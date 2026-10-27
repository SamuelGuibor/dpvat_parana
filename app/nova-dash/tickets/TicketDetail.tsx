'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/app/_shared/ui/badge';
import { Button } from '@/app/_shared/ui/button';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_shared/ui/select';
import { ArrowRight, ClipboardCopy, ListChecks, Trash2, UserPlus } from 'lucide-react';
import { isKnowledgeType, nextStatus, shortTicketId, statusesFor, type CerebroMeta, type Comparacao } from '@/app/_shared/utils/cerebro';
import { DevTicketDto, STATUS_META, TYPE_META, TicketStatus, ageLabel, initials, ticketImages } from './constants';
import { SampleReviewDialog } from './SampleReviewDialog';
import { TicketGallery, TicketZoom } from './TicketPhotos';

// Detalhe de QUALQUER card do Cérebro APP (ticket de desenvolvimento ou de
// conhecimento), no layout do pré-layout: cabeçalho com chips e ações, coluna
// principal (descrição/anexos ou conflito hoje × proposta, como implementar,
// histórico) e painel lateral estilo Jira (fase, responsável, datas, excluir;
// no conhecimento também checagens e ligações). Os dados de conhecimento vêm
// de DevTicket.meta (sugerirConhecimento / gerarCardsAutomaticos / registrarConferencia).

const SITUACAO: Record<Comparacao['situacao'], { label: string; cls: string }> = {
  igual: { label: 'igual', cls: 'bg-gray-100 text-gray-700' },
  novo: { label: 'novo', cls: 'bg-blue-100 text-blue-800' },
  conflito: { label: 'CONFLITO', cls: 'bg-orange-100 text-orange-800' },
  sem_mudanca: { label: 'sem mudança', cls: 'bg-gray-100 text-gray-600' },
};

/** Destaca os contatos citados (literal) dentro do texto. */
function highlight(text: string, terms: string[], cls: string): ReactNode[] {
  const list = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return [text];
  const re = new RegExp(`(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).map((part, i) =>
    list.includes(part) ? (
      <mark key={i} className={`rounded px-0.5 ${cls}`}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-800 dark:text-zinc-200">{children}</h3>;
}

type Check = { label: string; detail: string; state: 'ok' | 'warn' | 'wait' };

function checksOf(ticket: DevTicketDto, m: CerebroMeta): Check[] {
  const done = ticket.status === 'CONCLUIDO';
  const validating = ticket.status === 'VALIDACAO_IA' || done;
  if (m.lote) {
    const decisoes = Object.values(m.lote.decisoes ?? {});
    return [
      { label: 'Redator + checagem de contatos', detail: `${m.lote.aprovadas} nota(s) passaram no vault-check`, state: 'ok' },
      { label: 'Validador IA', detail: `${m.lote.aprovadas} aprovadas · ${m.lote.devolvidas} devolvidas`, state: m.lote.devolvidas ? 'warn' : 'ok' },
      { label: 'Pendência humana', detail: `${m.lote.pendentes} nota(s) esperando uma pessoa`, state: m.lote.pendentes ? 'warn' : 'ok' },
      {
        label: 'Amostra humana (10%)',
        detail: `${decisoes.length} de ${m.lote.amostra.length} conferida(s)${decisoes.some((d) => d.decisao === 'devolver') ? ' · com devolução' : ''}`,
        state: decisoes.some((d) => d.decisao === 'devolver') ? 'warn' : decisoes.length === m.lote.amostra.length ? 'ok' : 'wait',
      },
    ];
  }
  const conflito = m.comparacao?.some((c) => c.situacao === 'conflito');
  const autos = m.automacoes?.length ?? 0;
  const out: Check[] = [];
  if (m.hospital) {
    out.push({
      label: 'Busca no vault e nas automações',
      detail: `${autos} automação(ões)${m.nota ? ' · 1 nota publicada' : ' · sem nota publicada'}`,
      state: autos || ticket.type === 'LACUNA' ? 'ok' : 'warn',
    });
  }
  if (m.comparacao) {
    out.push({
      label: conflito ? 'Conflito encontrado' : 'Sem conflito de contato',
      detail: conflito ? 'contato diferente do da automação ativa' : 'proposta não contradiz a automação',
      state: conflito ? 'warn' : 'ok',
    });
  }
  if (ticket.type === 'CONHECIMENTO') {
    out.push({ label: 'Evidência', detail: m.evidencia ? m.evidencia : 'nenhuma informada pelo operador', state: m.evidencia ? 'ok' : 'warn' });
  }
  out.push({ label: 'Checagem de contatos (script)', detail: validating ? 'vault-check passou' : 'roda na implementação', state: validating ? 'ok' : 'wait' });
  out.push({ label: 'Validador IA', detail: done ? 'aprovado e publicado' : validating ? 'em validação' : 'roda na implementação', state: done ? 'ok' : 'wait' });
  return out;
}

const CHECK_STYLE = {
  ok: { mark: '✓', cls: 'bg-emerald-100 text-emerald-800' },
  warn: { mark: '!', cls: 'bg-amber-100 text-amber-900' },
  wait: { mark: '·', cls: 'bg-gray-100 text-gray-600' },
};

/** Texto que o operador cola no Claude Code (a IA ainda não lê tickets). */
function commandFor(ticket: DevTicketDto, m: CerebroMeta): string {
  const id = shortTicketId(ticket.id, ticket.type);
  if (ticket.type === 'DESATUALIZADO' && m.nota) {
    return `/publicar-conhecimento docs/operacao/${m.nota}\n\n(${id}: a automação mudou depois da nota; rode o seed antes para trazer a Fonte nova.)`;
  }
  const linhas = [
    `/conhecimento implementar ${id}`,
    '',
    `Assunto: ${ticket.title}`,
    m.hospital ? `Hospital: ${m.hospital}` : null,
    m.proposta ? `Proposta: ${m.proposta}` : `Pedido: ${ticket.description}`,
    m.evidencia ? `Evidência: ${m.evidencia}` : null,
    `Aberto por: ${ticket.creatorName} em ${new Date(ticket.createdAt).toLocaleDateString('pt-BR')}`,
  ];
  return linhas.filter((l) => l !== null).join('\n');
}

function stepsFor(ticket: DevTicketDto, m: CerebroMeta): ReactNode[] {
  const id = shortTicketId(ticket.id, ticket.type);
  const code = (t: string) => <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] dark:bg-zinc-800">{t}</code>;
  if (ticket.type === 'DESATUALIZADO') {
    return [
      <>No Claude Code, traga a fonte nova: {code('node -r dotenv/config scripts/vault-seed-hospitais.mjs --apply')}</>,
      <>Republique a nota: {code(`/publicar-conhecimento docs/operacao/${m.nota ?? '…'}`)}</>,
      <>Sincronize: {code('node -r dotenv/config scripts/sync-vault-s3.mjs --apply')}</>,
      <>Mova este card para Concluído.</>,
    ];
  }
  if (ticket.type === 'LACUNA') {
    return [
      <>Confira se o nome do hospital no card está igual ao da automação (pode ser só digitação).</>,
      <>Se for hospital novo, crie a automação em DISTRIBUIÇÃO DE SOLICITAÇÕES no site; ou registre com {code(`/conhecimento implementar ${id}`)}.</>,
      <>Rode o seed e publique a nota nova pelo {code('/publicar-conhecimento')}.</>,
    ];
  }
  return [
    <>Quem tem permissão de conhecimento (ADMIN++) assume o card.</>,
    <>No Claude Code, cole o comando copiado ({code(`/conhecimento implementar ${id}`)}).</>,
    <>A IA grava a nota{m.nota ? <> {code(m.nota)}</> : null}, roda a checagem e o validador.</>,
    ...(m.comparacao?.some((c) => c.situacao === 'conflito')
      ? [<>Ajuste a automação no site (Kanban → Automações) com o mesmo texto — senão a nota nasce desatualizada.</>]
      : []),
    <>Publicado → o card vai para Concluído.</>,
  ];
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-1.5 text-[13px]">
      <span className="text-gray-600">{label}</span>
      <div className="min-w-0 text-gray-900 dark:text-zinc-100">{children}</div>
    </div>
  );
}

function Person({ name, empty }: { name: string | null; empty: string }) {
  if (!name) return <span className="text-gray-500">{empty}</span>;
  return (
    <span className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="bg-blue-700 text-[9px] font-bold text-white">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Linha do tempo do ticket comum (sem meta.historico): o que dá para saber das datas. */
function devTimeline(ticket: DevTicketDto): { texto: string; em: string; por?: string }[] {
  const out: { texto: string; em: string; por?: string }[] = [{ texto: `${ticket.creatorName} abriu o ticket`, em: ticket.createdAt }];
  if (ticket.assigneeName) out.push({ texto: `${ticket.assigneeName} assumiu`, em: ticket.updatedAt });
  if (ticket.concludedAt) out.push({ texto: 'Concluído', em: ticket.concludedAt });
  return out;
}

interface Props {
  ticket: DevTicketDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canAct: boolean;
  canDelete: boolean;
  busy: boolean;
  onAssume: () => void;
  onMove: (status: TicketStatus) => void;
  onDelete: () => void;
}

export function TicketDetail({ ticket, open, onOpenChange, canAct, canDelete, busy, onAssume, onMove, onDelete }: Props) {
  const [sampleOpen, setSampleOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const knowledge = isKnowledgeType(ticket.type);
  const m: CerebroMeta = ticket.meta ?? {};
  const meta = TYPE_META[ticket.type] ?? TYPE_META.OUTRO;
  const TypeIcon = meta.icon;
  const allowed = statusesFor(ticket.type);
  const status = (allowed.includes(ticket.status as TicketStatus) ? ticket.status : 'EM_DISTRIBUICAO') as TicketStatus;
  const st = STATUS_META[status];
  const next = nextStatus(ticket.type, status);
  const images = ticketImages(ticket);
  const conflitos = (m.comparacao ?? []).filter((c) => c.situacao === 'conflito');
  const hojeTerms = conflitos.flatMap((c) => c.hoje);
  const propTerms = (m.comparacao ?? []).filter((c) => c.situacao === 'conflito' || c.situacao === 'novo').flatMap((c) => c.proposta);
  const historico = knowledge ? [...(m.historico ?? [])].reverse() : [...devTimeline(ticket)].reverse();

  async function copy() {
    try {
      await navigator.clipboard.writeText(commandFor(ticket, m));
      toast.success('Comando copiado. Cole no Claude Code.');
    } catch {
      toast.error('Não consegui copiar; selecione o texto do pedido manualmente.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-50 p-0 dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-4 p-5">
          <DialogHeader className="space-y-0 rounded-2xl border border-gray-200 bg-white p-5 text-left dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`gap-1 border-none text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
                    <TypeIcon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 border-none text-[10px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </Badge>
                  <span className="text-xs font-bold text-gray-600">
                    {shortTicketId(ticket.id, ticket.type)} · aberto {ageLabel(ticket.createdAt) === 'agora' ? 'agora' : `há ${ageLabel(ticket.createdAt)}`} por {ticket.creatorName}
                  </span>
                </div>
                <DialogTitle className="text-2xl font-black leading-tight tracking-tight">{ticket.title}</DialogTitle>
                <DialogDescription className={knowledge ? 'whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-zinc-300' : 'sr-only'}>
                  {knowledge ? ticket.description : `Ticket de ${meta.label.toLowerCase()} aberto por ${ticket.creatorName}`}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAct && !ticket.assigneeId && status !== 'CONCLUIDO' && (
                  <Button variant="outline" className="h-11 rounded-xl font-bold" disabled={busy} onClick={onAssume}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> Assumir
                  </Button>
                )}
                {knowledge &&
                  (m.lote ? (
                    canAct && (
                      <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setSampleOpen(true)}>
                        <ListChecks className="mr-1.5 h-4 w-4" /> Conferir amostra
                      </Button>
                    )
                  ) : (
                    <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={copy}>
                      <ClipboardCopy className="mr-1.5 h-4 w-4" /> Copiar comando para minha IA
                    </Button>
                  ))}
                {canAct && next && (
                  <Button className="h-11 rounded-xl bg-blue-700 font-bold hover:bg-blue-800" disabled={busy} onClick={() => onMove(next)}>
                    {STATUS_META[next].label} <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-wrap items-start gap-4">
            <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
              {!knowledge && (
                <Panel title="Descrição">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-zinc-200">{ticket.description}</p>
                </Panel>
              )}
              {!knowledge && images.length > 0 && (
                <Panel title={`Anexos (${images.length})`}>
                  <TicketGallery images={images} onZoom={setZoomIndex} full />
                </Panel>
              )}

              {knowledge && (m.hoje || m.proposta) && (
                <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <SectionTitle>{conflitos.length ? 'Conflito com o que já existe' : 'Hoje × proposta'}</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={`rounded-xl border p-3.5 ${conflitos.length ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className={`text-[11px] font-black uppercase tracking-wide ${conflitos.length ? 'text-red-800' : 'text-gray-700'}`}>Hoje · automação ativa</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {m.automacoes?.length ? `DISTRIBUIÇÃO DE SOLICITAÇÕES · ${m.automacoes.map((a) => `"${a.nome}"`).join(', ')}` : 'Nenhuma automação ativa para este hospital'}
                      </div>
                      <div className="mt-2.5 whitespace-pre-wrap rounded-lg bg-white p-2.5 font-mono text-[13px] leading-relaxed text-gray-900">
                        {m.hoje ? highlight(m.hoje, hojeTerms, 'bg-red-200') : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-green-200 bg-green-50 p-3.5">
                      <div className="text-[11px] font-black uppercase tracking-wide text-green-800">Proposta</div>
                      <div className="mt-1 text-xs text-gray-600">{m.evidencia ? `Evidência: ${m.evidencia}` : 'Sem evidência informada'}</div>
                      <div className="mt-2.5 whitespace-pre-wrap rounded-lg bg-white p-2.5 font-mono text-[13px] leading-relaxed text-gray-900">
                        {m.proposta ? highlight(m.proposta, propTerms, 'bg-green-200') : '—'}
                      </div>
                    </div>
                  </div>
                  {!!m.comparacao?.length && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-gray-600">
                            <th className="py-1.5 pr-3 font-bold">Campo</th>
                            <th className="py-1.5 pr-3 font-bold">Hoje</th>
                            <th className="py-1.5 pr-3 font-bold">Proposta</th>
                            <th className="py-1.5 font-bold">Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.comparacao.map((c) => (
                            <tr key={c.campo} className="border-t border-gray-100">
                              <td className="py-1.5 pr-3 font-semibold">{c.campo}</td>
                              <td className="py-1.5 pr-3 font-mono text-[12px]">{c.hoje.join(', ') || '—'}</td>
                              <td className="py-1.5 pr-3 font-mono text-[12px]">{c.proposta.join(', ') || '—'}</td>
                              <td className="py-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SITUACAO[c.situacao].cls}`}>{SITUACAO[c.situacao].label}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!!conflitos.length && (
                    <p className="mt-3 text-[13px] text-gray-700">
                      Para publicar, a automação também precisa mudar no site — senão o CRM continua comentando o contato antigo no card e a nota fica <b>desatualizada</b>.
                    </p>
                  )}
                </section>
              )}

              {knowledge && m.lote && (
                <Panel title={`Amostra do lote ${m.lote.id}`}>
                  <ul className="space-y-1.5 text-sm">
                    {m.lote.amostra.map((n) => {
                      const d = m.lote?.decisoes?.[n];
                      return (
                        <li key={n} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12px]">{n}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              !d ? 'bg-gray-100 text-gray-700' : d.decisao === 'confere' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {!d ? 'a conferir' : d.decisao === 'confere' ? `confere · ${d.por}` : `devolvida · ${d.por}`}
                          </span>
                          {d?.obs && <span className="text-xs text-gray-600">“{d.obs}”</span>}
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              )}

              {knowledge && !m.lote && (
                <Panel title="Como implementar">
                  <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-900 dark:text-zinc-200">
                    {stepsFor(ticket, m).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </Panel>
              )}

              {historico.length > 0 && (
                <Panel title="Histórico">
                  <ul className="space-y-2.5">
                    {historico.map((h, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-gray-400'}`} />
                        <div>
                          <div className="text-[13px] text-gray-900 dark:text-zinc-200">
                            {h.por ? <b>{h.por}: </b> : null}
                            {h.texto}
                          </div>
                          <div className="text-xs text-gray-600">{dt(h.em)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </main>

            <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
              <Panel title="Detalhes">
                <Field label="Fase">
                  {canAct ? (
                    <Select value={status} onValueChange={(v) => v !== status && onMove(v as TicketStatus)} disabled={busy}>
                      <SelectTrigger className="h-9 rounded-lg" aria-label="Mudar a fase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowed.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    st.label
                  )}
                </Field>
                <Field label="Responsável">
                  <Person name={ticket.assigneeName} empty="Ninguém ainda" />
                </Field>
                <Field label="Criado por">
                  <Person name={ticket.creatorName} empty="—" />
                </Field>
                <Field label="Tipo">{meta.label}</Field>
                <Field label="Criado em">{dt(ticket.createdAt)}</Field>
                <Field label="Atualizado">{dt(ticket.updatedAt)}</Field>
                {ticket.concludedAt && <Field label="Concluído">{dt(ticket.concludedAt)}</Field>}
                {canDelete && (
                  <Button variant="ghost" className="mt-3 h-10 w-full justify-start rounded-lg text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy} onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir {knowledge ? 'card' : 'ticket'}
                  </Button>
                )}
              </Panel>

              {knowledge && (
                <Panel title="Checagens">
                  <ul className="space-y-2.5">
                    {checksOf(ticket, m).map((c) => (
                      <li key={c.label} className="flex items-start gap-2.5">
                        <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-xs font-black ${CHECK_STYLE[c.state].cls}`}>
                          {CHECK_STYLE[c.state].mark}
                        </span>
                        <div>
                          <div className="text-[13px] font-bold text-gray-900 dark:text-zinc-100">{c.label}</div>
                          <div className="text-xs text-gray-600">{c.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
              {knowledge && !m.lote && (
                <Panel title="Ligações">
                  <div className="space-y-2 text-[13px]">
                    {m.hospital && <div>Hospital: <b>{m.hospital}</b></div>}
                    <div>Nota: {m.nota ? <span className="font-mono text-[12px]">{m.nota}</span> : 'nenhuma publicada'}</div>
                    <div>Automação: {m.automacoes?.length ? m.automacoes.map((a) => a.nome).join(', ') : '—'}</div>
                    {typeof m.cardsAtivos === 'number' && <div>Cards ativos com esse hospital: <b>{m.cardsAtivos}</b></div>}
                  </div>
                </Panel>
              )}
              <Panel title="Quem pode">
                <p className="text-[13px] leading-relaxed text-gray-700 dark:text-zinc-300">
                  {knowledge ? (
                    <>Sugerir: qualquer operador. Implementar, publicar e conferir amostra: só quem tem <b>Base de conhecimento</b> (ADMIN++).</>
                  ) : (
                    <>Qualquer pessoa com acesso à aba abre ticket; os devs assumem e movem. Excluir: quem criou ou um ADMIN++.</>
                  )}
                </p>
              </Panel>
            </aside>
          </div>
        </div>
        {knowledge && m.lote && <SampleReviewDialog loteId={m.lote.id} open={sampleOpen} onOpenChange={setSampleOpen} />}
        <TicketZoom images={images} index={zoomIndex} onIndex={setZoomIndex} onClose={() => setZoomIndex(null)} />
      </DialogContent>
    </Dialog>
  );
}
