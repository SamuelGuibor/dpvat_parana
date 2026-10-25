// Catálogo da IA de operação. Etapas 1–2: leitura (L1). Etapa 3: escrita
// interna (L3, prévia + previa_hash + interruptor). Etapa 4: documentos
// (rascunho L2 em op-drafts/, anexar L3). Etapa 5: comunicação externa (L4,
// preparar → "aprovo <código>" digitado → executar). Etapa 6: progresso dos
// fluxos longos (salvar/retomar). Etapa 7: auditoria (gerar_relatorio, só
// gestor) e varredura de inconsistências, ambas L1. Ferramenta nova = um
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
import { executarAprovado, prepararEmail, prepararWhatsapp } from "./comunicacao";
import { fluxosAbertos, retomarFluxo, salvarProgresso } from "./fluxos";
import { gerarRelatorio } from "./relatorio";
import { varrerInconsistencias } from "./varredura";

export const OP_TOOLS: OpTool[] = [
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
];

const byName = new Map(OP_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): OpTool | undefined {
  return byName.get(name);
}
