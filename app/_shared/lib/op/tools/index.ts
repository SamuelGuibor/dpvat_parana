// Catálogo da Etapa 1: só leitura (L1). Ferramenta nova = um arquivo aqui +
// entrada na lista + teste em tests/op-registry.test.ts.

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
];

const byName = new Map(OP_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): OpTool | undefined {
  return byName.get(name);
}
