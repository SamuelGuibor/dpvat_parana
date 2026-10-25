// Catálogo da IA de operação. Etapas 1–2: leitura (L1). Etapa 3: escrita
// interna (L3, prévia + previa_hash + interruptor). Ferramenta nova = um
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
];

const byName = new Map(OP_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): OpTool | undefined {
  return byName.get(name);
}
