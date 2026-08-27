"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PenLine, Search, RefreshCw, Copy, ExternalLink, CheckCircle2, XCircle,
  Send, Clock, AlertTriangle, FileText, Loader2, ChevronRight, SquareKanban,
  Trash2, Stethoscope, ChevronDown,
} from "lucide-react";
import { Button } from "@/app/_shared/ui/button";
import {
  listarContratos, detalharContrato, validarContrato, cancelarContrato, reenviarLink,
  getAutomacaoAssinatura, setAutomacaoAssinaturaPausada, resolverCardDoContrato,
  resumirProblemasContratos, excluirContrato,
  type AutomacaoAssinaturaStatus, type ContractRow, type ContractDetail,
  type ContractProblemSummary, type ContractProblemCase,
} from "@/app/_actions/signature/contracts";
import { CardDialog } from "@/app/nova-dash/CardDialog";
import type { ExtendedKanbanCard } from "@/app/nova-dash/card-dialog/types";

// Aba CONTRATOS — mesa de trabalho de quem cobra e valida assinatura.
//
// A ordem da lista NÃO é cronológica: vem primeiro o que precisa de gente
// (assinado esperando validação), depois o que está parado há mais tempo. Quem
// abre esta aba quer saber "o que eu faço agora", não "o que aconteceu".

const STATUS_INFO: Record<string, { rotulo: string; cor: string; icone: React.ReactNode }> = {
  assinado: { rotulo: "Assinado — validar", cor: "bg-emerald-100 text-emerald-800 border-emerald-200", icone: <CheckCircle2 className="w-3.5 h-3.5" /> },
  validado: { rotulo: "Validado", cor: "bg-emerald-200 text-emerald-800 border-emerald-300", icone: <CheckCircle2 className="w-3.5 h-3.5" /> },
  aguardando: { rotulo: "Aguardando assinatura", cor: "bg-amber-100 text-amber-800 border-amber-200", icone: <Clock className="w-3.5 h-3.5" /> },
  visualizado: { rotulo: "Abriu, não assinou", cor: "bg-orange-100 text-orange-800 border-orange-200", icone: <Clock className="w-3.5 h-3.5" /> },
  confirmando: { rotulo: "Confirmando dados", cor: "bg-sky-100 text-sky-800 border-sky-200", icone: <Clock className="w-3.5 h-3.5" /> },
  coletando: { rotulo: "Bot pedindo dados", cor: "bg-sky-100 text-sky-800 border-sky-200", icone: <Clock className="w-3.5 h-3.5" /> },
  confirmacao_expirada: { rotulo: "Não confirmou", cor: "bg-rose-100 text-rose-800 border-rose-200", icone: <AlertTriangle className="w-3.5 h-3.5" /> },
  extracao_falhou: { rotulo: "Precisou de humano", cor: "bg-rose-100 text-rose-800 border-rose-200", icone: <AlertTriangle className="w-3.5 h-3.5" /> },
  erro: { rotulo: "Erro técnico", cor: "bg-red-100 text-red-800 border-red-200", icone: <AlertTriangle className="w-3.5 h-3.5" /> },
  expirado: { rotulo: "Link vencido", cor: "bg-zinc-100 text-zinc-600 border-zinc-200", icone: <XCircle className="w-3.5 h-3.5" /> },
  recusado: { rotulo: "Recusado", cor: "bg-zinc-100 text-zinc-600 border-zinc-200", icone: <XCircle className="w-3.5 h-3.5" /> },
  cancelado: { rotulo: "Cancelado", cor: "bg-zinc-100 text-zinc-600 border-zinc-200", icone: <XCircle className="w-3.5 h-3.5" /> },
};

const ORIGEM_ROTULO: Record<string, string> = {
  bot: "🤖 bot",
  manual_card: "👤 card",
  manual_inbox: "👤 inbox",
  manual_offline: "👤 offline",
};

/** Cor do bloco de diagnóstico por tipo de problema. */
const COR_PROBLEMA: Record<string, string> = {
  erro: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200",
  extracao_falhou: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200",
  confirmacao_expirada: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
  parado: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200",
};

const FILTROS = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "assinado", rotulo: "Assinado, falta validar" },
  { chave: "aguardando", rotulo: "Aguardando assinatura" },
  { chave: "visualizado", rotulo: "Abriu e não assinou" },
  { chave: "extracao_falhou", rotulo: "Precisou de humano" },
  { chave: "validado", rotulo: "Validado" },
  { chave: "expirado", rotulo: "Vencido" },
];

// Como o cliente usou o TUTORIAL da página de assinatura. Serve pra saber quem
// pulou a explicação e travou depois — esse é caso de ligar, não de insistir no
// lembrete automático.
const ROTULOS_DA_TRILHA: Record<string, string> = {
  tutorial_entendi: "✅ entendeu a explicação",
  tutorial_fechou: "✖️ fechou a explicação (pulou)",
  tutorial_ouviu: "🔊 ouviu a explicação em voz",
  abriu_o_link: "abriu o link",
  retomou: "↩️ voltou e continuou de onde parou",
  leu_o_documento: "viu o documento",
  codigo_enviado: "código enviado",
  codigo_bloqueado: "errou o código 5x (bloqueado)",
  pediu_ajuda: "🙋 pediu ajuda",
  assinou: "✍️ assinou",
};

function rotuloDoPasso(passo: string): string {
  return ROTULOS_DA_TRILHA[passo] ?? passo.replace(/_/g, " ");
}

function data(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function ContractsPanel() {
  const [linhas, setLinhas] = useState<ContractRow[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<ContractDetail | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Raio-X do que deu errado (bloco do topo) + linha marcada pra excluir.
  const [problemas, setProblemas] = useState<ContractProblemSummary | null>(null);
  const [abrirProblemas, setAbrirProblemas] = useState(false);
  const [excluindo, setExcluindo] = useState<ContractRow | null>(null);
  // Trava de segurança da automação (null = ainda carregando).
  const [automacao, setAutomacao] = useState<AutomacaoAssinaturaStatus | null>(null);
  const [alternandoTrava, setAlternandoTrava] = useState(false);
  // Cartão do kanban aberto a partir de um contrato (o CardDialog recarrega
  // o card completo sozinho a partir do id — stub mínimo basta).
  const [cardAberto, setCardAberto] = useState<{ id: string; isProcess: boolean; ownerId: string; titulo: string } | null>(null);
  const [abrindoCard, setAbrindoCard] = useState<string | null>(null);

  const abrirCard = async (contractId: string, contactId: string, cliente: string) => {
    if (abrindoCard) return;
    setAbrindoCard(contractId);
    try {
      const res = await resolverCardDoContrato(contactId);
      if (res) {
        setDetalhe(null); // não empilhar o drawer com o dialog
        setCardAberto({ id: res.id, isProcess: res.isProcess, ownerId: res.ownerId, titulo: res.nome ?? cliente });
      } else {
        toast.error("Nenhum cartão do kanban vinculado a este cliente.");
      }
    } catch {
      toast.error("Falha ao localizar o cartão do cliente.");
    } finally {
      setAbrindoCard(null);
    }
  };

  const carregarAutomacao = useCallback(async () => {
    try {
      setAutomacao(await getAutomacaoAssinatura());
    } catch {
      // Sem permissão/erro: o controle simplesmente não aparece.
    }
  }, []);
  useEffect(() => { carregarAutomacao(); }, [carregarAutomacao]);

  const alternarTrava = async () => {
    if (!automacao || alternandoTrava) return;
    const pausar = automacao.ativa;
    if (pausar && !window.confirm(
      "Pausar a automação? O bot PARA de gerar contratos sozinho na hora e volta a mandar os leads qualificados direto pra fila (como era antes). O botão manual e os contratos já em andamento continuam funcionando.",
    )) return;
    setAlternandoTrava(true);
    try {
      const res = await setAutomacaoAssinaturaPausada(pausar);
      if (res.ok) {
        toast.success(pausar ? "Automação PAUSADA — o bot voltou ao fluxo antigo." : "Automação retomada.");
        await carregarAutomacao();
      } else {
        toast.error(res.erro ?? "Não deu certo.");
      }
    } finally {
      setAlternandoTrava(false);
    }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await listarContratos({ status, busca });
      setLinhas(res.linhas);
      setContagem(res.contagem);
      // O raio-X é global (não segue filtro nem busca): é a foto do que travou.
      resumirProblemasContratos().then(setProblemas).catch(() => setProblemas(null));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar os contratos.");
    } finally {
      setCarregando(false);
    }
  }, [status, busca]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirDetalhe = async (id: string) => {
    setOcupado(id);
    try {
      setDetalhe(await detalharContrato(id));
    } finally {
      setOcupado(null);
    }
  };

  const acao = async (id: string, fn: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) => {
    setOcupado(id);
    try {
      const res = await fn();
      if (res.ok) {
        toast.success(sucesso);
        await carregar();
        if (detalhe?.id === id) setDetalhe(await detalharContrato(id));
      } else {
        toast.error(res.erro ?? "Não deu certo.", { duration: 8000 });
      }
    } finally {
      setOcupado(null);
    }
  };

  const confirmarExclusao = async (motivo: string) => {
    if (!excluindo) return;
    const alvo = excluindo;
    setOcupado(alvo.id);
    try {
      const res = await excluirContrato(alvo.id, motivo);
      if (res.ok) {
        toast.success("Contrato excluído da lista.");
        setExcluindo(null);
        if (detalhe?.id === alvo.id) setDetalhe(null);
        await carregar();
      } else {
        toast.error(res.erro ?? "Não deu certo.", { duration: 8000 });
      }
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 grid place-items-center">
            <PenLine className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100">Contratos</h2>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400">
              Assinatura eletrônica — o que precisa de você aparece primeiro
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Trava de segurança: pausa a automação do bot NA HORA (sem deploy).
              Só aparece quando a chave-mestra do ambiente está ligada. */}
          {automacao?.envLigada && (
            <button
              onClick={alternarTrava}
              disabled={alternandoTrava}
              title={automacao.ativa
                ? "O bot está gerando contratos sozinho. Clique para PAUSAR na hora — ele volta a mandar os leads pra fila, como antes."
                : "Automação pausada pela equipe — o bot está no fluxo antigo (fila). Clique para retomar."}
              className={`h-10 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors ${
                automacao.ativa
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700"
                  : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${automacao.ativa ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              {alternandoTrava ? "Salvando..." : automacao.ativa ? "Automação do bot: ATIVA — pausar" : "Automação PAUSADA — retomar"}
            </button>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="nome ou telefone"
              className="h-10 w-56 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 text-sm"
            />
          </div>
          <Button onClick={carregar} variant="outline" className="h-10 rounded-xl">
            <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            onClick={() => setStatus(f.chave)}
            className={`h-9 rounded-full border px-3 text-xs font-bold transition ${
              status === f.chave
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-zinc-700"
            }`}
          >
            {f.rotulo}
            {contagem[f.chave] !== undefined && (
              <span className="ml-1.5 opacity-70">{contagem[f.chave]}</span>
            )}
          </button>
        ))}
      </div>

      {problemas && problemas.total > 0 && (
        <section className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20">
          <button
            onClick={() => setAbrirProblemas((v) => !v)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <Stethoscope className="w-5 h-5 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-rose-900 dark:text-rose-100">
                {problemas.total} contrato(s) travaram e precisaram (ou precisam) de gente
              </h3>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                {problemas.porTipo.map((t) => `${t.quantidade} ${t.rotulo.toLowerCase()}`).join(" · ")}
                {problemas.recuperados30d > 0 &&
                  ` · ${problemas.recuperados30d} desses clientes acabaram assinando (30d)`}
              </p>
            </div>
            <ChevronDown
              className={`ml-auto w-4 h-4 shrink-0 text-rose-600 transition-transform ${abrirProblemas ? "rotate-180" : ""}`}
            />
          </button>

          {abrirProblemas && (
            <div className="space-y-3 border-t border-rose-200 dark:border-rose-900 p-4">
              <div>
                <h4 className="mb-2 text-[11px] font-black uppercase text-rose-700/80">
                  Por que travou (causas mais repetidas)
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {problemas.motivos.map((m) => (
                    <span
                      key={m.motivo}
                      className="rounded-full border border-rose-200 dark:border-rose-900 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-zinc-300"
                    >
                      {m.motivo}
                      <span className="ml-1.5 font-black text-rose-600">{m.quantidade}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                {problemas.casos.map((c) => (
                  <CasoProblema
                    key={c.id}
                    caso={c}
                    onAbrir={() => abrirDetalhe(c.id)}
                    onAbrirCard={() => abrirCard(c.id, c.contactId, c.cliente)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {carregando && linhas.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> carregando…
        </div>
      ) : linhas.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 dark:text-zinc-400">Nenhum contrato neste filtro.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 dark:bg-zinc-900 text-left text-[11px] uppercase text-gray-500 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold">Situação</th>
                <th className="px-4 py-3 font-bold">Origem</th>
                <th className="px-4 py-3 font-bold">Enviado</th>
                <th className="px-4 py-3 font-bold">Abriu</th>
                <th className="px-4 py-3 font-bold">Assinou</th>
                <th className="px-4 py-3 font-bold">Lembretes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
              {linhas.map((l) => {
                const info = STATUS_INFO[l.status] ?? {
                  rotulo: l.status, cor: "bg-gray-100 text-gray-700 border-gray-200", icone: null,
                };
                const parado = (l.horasParado ?? 0) >= 48;
                return (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-zinc-900/60">
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900 dark:text-zinc-100">{l.cliente}</div>
                      <div className="text-[11px] text-gray-400">+{l.telefone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${info.cor}`}>
                        {info.icone} {info.rotulo}
                      </span>
                      {parado && (
                        <div className="mt-1 text-[10px] font-bold text-orange-600">
                          parado há {l.horasParado}h
                        </div>
                      )}
                      {/* O motivo importa mais que o rótulo: quem abre esta aba
                          quer saber o que deu errado sem clicar em nada. */}
                      {(l.erro || l.pendencias.length > 0) && (
                        <div className="mt-1 max-w-[260px] text-[10px] leading-snug text-rose-600 dark:text-rose-300">
                          {l.erro ?? `Faltou: ${l.pendencias.map((p) => p.label).join(", ")}`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-zinc-400">
                      {ORIGEM_ROTULO[l.origem] ?? l.origem}
                      {l.criadoPor && <div className="text-[10px] text-gray-400">{l.criadoPor}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-zinc-400">{data(l.enviadoEm)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-zinc-400">{data(l.abriuEm)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-zinc-400">{data(l.assinadoEm)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-zinc-400">{l.lembretes}/3</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {l.status === "assinado" && (
                          <Button
                            size="sm"
                            disabled={ocupado === l.id}
                            onClick={() => acao(l.id, () => validarContrato(l.id), "Contrato validado!")}
                            className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Validar
                          </Button>
                        )}
                        {["aguardando", "visualizado"].includes(l.status) && (
                          <>
                            <Button
                              size="sm" variant="outline" className="h-8 rounded-lg text-xs"
                              onClick={() => { navigator.clipboard.writeText(l.signUrl); toast.success("Link copiado!"); }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="outline" className="h-8 rounded-lg text-xs"
                              disabled={ocupado === l.id}
                              onClick={() => acao(l.id, () => reenviarLink(l.id), "Link reenviado no WhatsApp!")}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm" variant="outline" className="h-8 rounded-lg text-xs"
                          title="Abrir cartão do cliente no kanban"
                          disabled={abrindoCard === l.id}
                          onClick={() => abrirCard(l.id, l.contactId, l.cliente)}
                        >
                          {abrindoCard === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SquareKanban className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          size="sm" variant="outline" className="h-8 rounded-lg text-xs"
                          disabled={ocupado === l.id}
                          onClick={() => abrirDetalhe(l.id)}
                        >
                          {ocupado === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-8 rounded-lg text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Excluir esta linha da lista de contratos"
                          disabled={ocupado === l.id}
                          onClick={() => setExcluindo(l)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalhe && (
        <PainelDetalhe
          detalhe={detalhe}
          ocupado={ocupado === detalhe.id}
          abrindoCard={abrindoCard === detalhe.id}
          onFechar={() => setDetalhe(null)}
          onValidar={() => acao(detalhe.id, () => validarContrato(detalhe.id), "Contrato validado!")}
          onCancelar={(motivo) => acao(detalhe.id, () => cancelarContrato(detalhe.id, motivo), "Contrato cancelado.")}
          onAbrirOutro={abrirDetalhe}
          onAbrirCard={() => abrirCard(detalhe.id, detalhe.contactId, detalhe.cliente)}
        />
      )}

      {excluindo && (
        <DialogExcluir
          linha={excluindo}
          ocupado={ocupado === excluindo.id}
          onFechar={() => setExcluindo(null)}
          onConfirmar={confirmarExclusao}
        />
      )}

      {cardAberto && (
        <CardDialog
          card={{
            id: cardAberto.id, title: cardAberto.titulo,
            description: "", assignee: "", timer: 0, comments: [], attachments: [],
            observations: "", checklistItems: [], createdAt: new Date(), updatedAt: new Date(),
            isProcess: cardAberto.isProcess,
          } as ExtendedKanbanCard}
          open
          onClose={() => setCardAberto(null)}
          onUpdate={() => { carregar(); }}
          cardId={cardAberto.id}
          isProcess={cardAberto.isProcess}
          ownerId={cardAberto.ownerId}
        />
      )}
    </div>
  );
}

/** Painel do cliente: este ciclo em detalhe + TODOS os contratos dele. */
function PainelDetalhe({
  detalhe, ocupado, abrindoCard, onFechar, onValidar, onCancelar, onAbrirOutro, onAbrirCard,
}: {
  detalhe: ContractDetail;
  ocupado: boolean;
  abrindoCard: boolean;
  onFechar: () => void;
  onValidar: () => void;
  onCancelar: (motivo: string) => void;
  onAbrirOutro: (id: string) => void;
  onAbrirCard: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white dark:bg-zinc-950 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-zinc-100">{detalhe.cliente}</h3>
            <p className="text-xs text-gray-500">+{detalhe.telefone} · situação: {detalhe.status}</p>
          </div>
          <Button variant="outline" onClick={onFechar} className="rounded-xl">Fechar</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {detalhe.temPdf && (
            <a
              href={`${detalhe.pdfUrl}?download=1`}
              target="_blank" rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 dark:border-zinc-700 px-3 text-sm font-bold"
            >
              <FileText className="w-4 h-4" /> {detalhe.temAssinado ? "PDF assinado" : "PDF do contrato"}
            </a>
          )}
          <a
            href={detalhe.verifyUrl} target="_blank" rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 dark:border-zinc-700 px-3 text-sm font-bold"
          >
            <ExternalLink className="w-4 h-4" /> Página de verificação
          </a>
          <Button
            variant="outline" onClick={onAbrirCard} disabled={abrindoCard}
            className="h-10 rounded-xl font-bold"
            title="Abrir cartão do cliente no kanban"
          >
            {abrindoCard ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <SquareKanban className="w-4 h-4 mr-1.5" />}
            Cartão do cliente
          </Button>
          {detalhe.status === "assinado" && (
            <Button onClick={onValidar} disabled={ocupado} className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Validar contrato
            </Button>
          )}
        </div>

        <section>
          <h4 className="text-xs font-black uppercase text-gray-500 mb-2">Dados usados no contrato</h4>
          <div className="rounded-2xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800">
            {detalhe.dados.map((d) => (
              <div key={d.campo} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-32 shrink-0 text-xs text-gray-500">{d.campo}</span>
                <span className="flex-1 font-medium text-gray-900 dark:text-zinc-100">{d.valor}</span>
                <span className="text-[10px] text-gray-400">
                  {d.origem}{d.confianca !== null ? ` · ${Math.round(d.confianca * 100)}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            &quot;documento&quot; = lido do RG/CNH pela IA · &quot;conversa&quot; = o cliente falou ·
            &quot;inferido&quot; = completado pelo CEP dos Correios
          </p>
        </section>

        <section>
          <h4 className="text-xs font-black uppercase text-gray-500 mb-2">Trilha de auditoria</h4>
          {detalhe.trilha.length === 0 ? (
            <p className="text-sm text-gray-400">O cliente ainda não abriu o link.</p>
          ) : (
            <ol className="space-y-1.5">
              {detalhe.trilha.map((e, i) => (
                <li key={i} className="flex gap-3 text-xs">
                  <span className="w-28 shrink-0 text-gray-400">{data(e.at)}</span>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">{rotuloDoPasso(e.passo)}</span>
                  {e.detalhe && <span className="text-gray-400">— {e.detalhe}</span>}
                  {e.ip && <span className="ml-auto text-gray-300">{e.ip}</span>}
                </li>
              ))}
            </ol>
          )}
          {(detalhe.documentHash || detalhe.signedHash) && (
            <div className="mt-3 rounded-xl bg-gray-50 dark:bg-zinc-900 p-3 space-y-1">
              {detalhe.documentHash && (
                <p className="break-all font-mono text-[10px] text-gray-500">documento: {detalhe.documentHash}</p>
              )}
              {detalhe.signedHash && (
                <p className="break-all font-mono text-[10px] text-gray-500">assinado: {detalhe.signedHash}</p>
              )}
            </div>
          )}
        </section>

        <section>
          <h4 className="text-xs font-black uppercase text-gray-500 mb-2">
            Todos os contratos deste cliente ({detalhe.historico.length})
          </h4>
          <div className="space-y-1.5">
            {detalhe.historico.map((h) => (
              <button
                key={h.id}
                onClick={() => onAbrirOutro(h.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs ${
                  h.id === detalhe.id
                    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-gray-200 dark:border-zinc-800"
                }`}
              >
                <span className="w-28 text-gray-400">{data(h.criadoEm)}</span>
                <span className="font-bold text-gray-800 dark:text-zinc-200">
                  {STATUS_INFO[h.status]?.rotulo ?? h.status}
                </span>
                <span className="text-gray-400">{ORIGEM_ROTULO[h.origem] ?? h.origem}</span>
                {h.assinadoEm && <span className="ml-auto text-emerald-600">assinado {data(h.assinadoEm)}</span>}
              </button>
            ))}
          </div>
        </section>

        {!["assinado", "validado"].includes(detalhe.status) && (
          <section className="rounded-2xl border border-red-200 dark:border-red-900 p-4">
            <h4 className="text-xs font-black uppercase text-red-700 mb-2">Cancelar este contrato</h4>
            <p className="text-xs text-gray-500 mb-3">
              O link para de funcionar na hora. Use quando os dados estiverem errados e for preciso gerar de novo.
            </p>
            {confirmandoCancelamento ? (
              <div className="flex gap-2">
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="motivo (aparece na conversa)"
                  className="h-10 flex-1 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                />
                <Button
                  disabled={ocupado}
                  onClick={() => onCancelar(motivo)}
                  className="h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  Confirmar
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirmandoCancelamento(true)} className="h-10 rounded-xl border-red-300 text-red-700">
                <XCircle className="w-4 h-4 mr-1.5" /> Cancelar contrato
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Uma linha do raio-X: o que aconteceu + o que fazer. */
function CasoProblema({
  caso, onAbrir, onAbrirCard,
}: {
  caso: ContractProblemCase;
  onAbrir: () => void;
  onAbrirCard: () => void;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${COR_PROBLEMA[caso.tipo] ?? "border-gray-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black">{caso.cliente}</span>
        <span className="text-[10px] opacity-70">+{caso.telefone}</span>
        <span className="rounded-full bg-white/70 dark:bg-zinc-900/60 px-2 py-0.5 text-[10px] font-bold">
          {caso.rotulo}
        </span>
        <span className="text-[10px] opacity-70">{data(caso.quando)}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onAbrirCard}
            title="Abrir cartão do cliente"
            className="rounded-lg border border-current/20 bg-white/70 dark:bg-zinc-900/60 px-2 py-1 text-[10px] font-bold"
          >
            <SquareKanban className="w-3 h-3" />
          </button>
          <button
            onClick={onAbrir}
            className="rounded-lg border border-current/20 bg-white/70 dark:bg-zinc-900/60 px-2 py-1 text-[10px] font-bold"
          >
            abrir
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-snug">{caso.oQueAconteceu}</p>
      {caso.pendencias.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {caso.pendencias.map((p, i) => (
            <li key={i} className="text-[10px] opacity-80">
              • <b>{p.label}</b> — {p.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] font-bold opacity-90">→ {caso.acaoSugerida}</p>
    </div>
  );
}

/**
 * Exclusão da linha. Ciclo quebrado sai com um clique; contrato já assinado é
 * documento — exige motivo escrito, que vai para o Log e para a conversa.
 */
function DialogExcluir({
  linha, ocupado, onFechar, onConfirmar,
}: {
  linha: ContractRow;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const assinado = ["assinado", "validado"].includes(linha.status);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onFechar}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-red-100 dark:bg-red-950 grid place-items-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-zinc-100">Excluir este contrato?</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              {linha.cliente} · situação &quot;{STATUS_INFO[linha.status]?.rotulo ?? linha.status}&quot;
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-600 dark:text-zinc-400">
          A linha some da aba Contratos e não volta. O PDF continua guardado e a exclusão fica
          registrada no Log com seu nome.
        </p>

        {assinado && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
              Este contrato JÁ FOI ASSINADO. Escreva o motivo — ele vai para o Log e para a conversa
              do cliente.
            </p>
          </div>
        )}

        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={assinado ? "motivo (obrigatório)" : "motivo (opcional)"}
          className="h-10 w-full rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar} className="h-10 rounded-xl">Voltar</Button>
          <Button
            disabled={ocupado || (assinado && !motivo.trim())}
            onClick={() => onConfirmar(motivo)}
            className="h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
          >
            {ocupado ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}
