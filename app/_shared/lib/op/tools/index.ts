// Catálogo da IA de operação. Etapas 1–2: leitura (L1). Etapa 3: escrita
// interna (L3, prévia + previa_hash + interruptor). Etapa 4: documentos
// (rascunho L2 em op-drafts/, anexar L3). Etapa 5: comunicação externa (L4,
// preparar → "aprovo <código>" digitado → executar). Etapa 6: progresso dos
// fluxos longos (salvar/retomar). Etapa 7: auditoria (gerar_relatorio, só
// gestor) e varredura de inconsistências, ambas L1. Ajustes de 26/10: editar
// cadastro, documentos, comentário/tarefa (L3), ação irreversível (L4) e
// quem_pediu (L1). Ferramenta nova = um
// arquivo aqui + entrada na lista + teste em tests/op-registry.test.ts.

import type { OpTool } from "../registry";
import { buscarCliente } from "./buscar-cliente";
import { obterCard } from "./obter-card";
import { listarHistorico } from "./listar-historico";
import { listarDocumentos } from "./listar-documentos";
import { listarColunas } from "./listar-colunas";
import { listarTags } from "./listar-tags";
import { listarCardsParados } from "./listar-cards-parados";
import { listarCardsColuna } from "./listar-cards-coluna";
import { verificarPendencias } from "./verificar-pendencias";
import { consultarConversa } from "./consultar-conversa";
import { consultarHospital } from "./consultar-hospital";
import { minhasPermissoes } from "./minhas-permissoes";
import { moverCard } from "./mover-card";
import { adicionarTag, removerTag } from "./tags-card";
import { comentarCard } from "./comentar-card";
import { notificarPessoa } from "./notificar-pessoa";
import { arquivarCard } from "./arquivar-card";
import { meuDia } from "./meu-dia";
import { anexarRascunho, listarModelos, prepararContrato, prepararPedidoProntuario, prepararProcuracao } from "./documentos";
import { executarAprovado, prepararAcaoIrreversivel, prepararEmail, prepararMembroEquipe, prepararWhatsapp } from "./comunicacao";
import { criarCard, criarTicketDevTool } from "./criar";
import { fluxosAbertos, retomarFluxo, salvarProgresso } from "./fluxos";
import { gerarRelatorio } from "./relatorio";
import { varrerInconsistencias } from "./varredura";
import { editarCadastro } from "./editar-cadastro";
import { gerenciarDocumento } from "./gerenciar-documento";
import { atualizarTarefa, editarComentario } from "./comentario-tarefa";
import { quemPediu } from "./quem-pediu";
import { analisarDocumentos } from "./analisar-documentos";
import { panoramaCard } from "./panorama-card";
import { iniciarLote, resultadoLote } from "./lotes";
import { atualizarTicket, criarTicket, lerTicket, listarTickets } from "./tickets";
import { analisarRegraBot, aplicarRegraBot } from "./cerebro-bot";

export const OP_TOOLS: OpTool[] = [
  // Item O (27/10): lote em segundo plano (op_jobs + cron /api/op/jobs/run).
  iniciarLote,
  resultadoLote,
  buscarCliente,
  obterCard,
  listarHistorico,
  listarDocumentos,
  listarColunas,
  listarTags,
  listarCardsParados,
  listarCardsColuna,
  verificarPendencias,
  consultarConversa,
  // Etapa 2: base de conhecimento (vault docs/operacao + automações vivas).
  consultarHospital,
  minhasPermissoes,
  // Etapa 3: plano do dia (L1).
  meuDia,
  // Etapa 3: escrita interna (L3), desligadas por padrão (op/switches.ts).
  moverCard,
  adicionarTag,
  removerTag,
  comentarCard,
  notificarPessoa,
  arquivarCard,
  // Etapa 4: documentos. Modelos (L1), rascunho no S3 sem tocar o card (L2),
  // anexar ao card (L3, desligada por padrão).
  listarModelos,
  prepararProcuracao,
  prepararPedidoProntuario,
  prepararContrato,
  anexarRascunho,
  // Etapa 5: e-mail/WhatsApp para fora (L4), desligadas por padrão; envio só
  // com "aprovo <código>" digitado pelo operador (op/approvals.ts).
  prepararEmail,
  prepararWhatsapp,
  executarAprovado,
  // Etapa 6: fluxos longos com retomada (registro em op_requests.state, nunca
  // no card). salvar_progresso nasce com interruptor desligado.
  salvarProgresso,
  fluxosAbertos,
  retomarFluxo,
  // Etapa 7: auditoria da operação (manager_dashboard; sem texto de prompt)
  // e varredura de inconsistências dos cards ativos (só leitura).
  gerarRelatorio,
  varrerInconsistencias,
  // Ajustes de 26/10 (docs/ai-first/09-decisoes-dono-26-10.md): "IA faz quase
  // tudo". Escritas reversíveis em L3 e irreversíveis em L4 (aprovo <código>),
  // todas com interruptor desligado; quem_pediu é leitura.
  editarCadastro,
  gerenciarDocumento,
  editarComentario,
  atualizarTarefa,
  prepararAcaoIrreversivel,
  quemPediu,
  // Decisão do dono (27/10): leitura dos documentos do card em lote com IA,
  // devolvendo divergências e sugestões prontas para editar_cadastro (L1).
  analisarDocumentos,
  // 27/10: ficha + histórico + documentos + pendências + conversa numa chamada.
  panoramaCard,
  // Cérebro APP (docs/ai-first/11-plano-cerebro-app.md): tickets de
  // conhecimento lidos/criados/atualizados pela IA e a frente "bot" (playbook)
  // com o núcleo do "Ensinar o cérebro".
  listarTickets,
  lerTicket,
  criarTicket,
  atualizarTicket,
  analisarRegraBot,
  aplicarRegraBot,
  // Decisão do dono (30/10): criar pela IA — card de cliente (L3), ticket DEV
  // (L3, confirmação exigida) e membro da equipe (L4, "aprovo <código>").
  criarCard,
  criarTicketDevTool,
  prepararMembroEquipe,
];

const byName = new Map(OP_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): OpTool | undefined {
  return byName.get(name);
}
