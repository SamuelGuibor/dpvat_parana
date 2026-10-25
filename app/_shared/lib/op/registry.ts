// Registro das ferramentas da IA de operação. Cada ferramenta declara nome,
// descrição (lida pelo modelo no Claude Code), nível, permissão e schema zod
// dos argumentos. O catálogo (GET /api/op/tools) converte o zod em JSON Schema
// para o MCP fino montar as ferramentas — o schema é um só, no CRM.
//
// zod/v4: o projeto está no zod 3.25, que já traz a API v4 (com toJSONSchema)
// no subcaminho — sem dependência nova.

import { z } from "zod/v4";
import type { PermissionKey } from "../permissions";
import type { OpLevel } from "./policy";
import type { OperatorContext } from "./auth";
import type { OpTrace } from "../cards/types";

export interface OpToolResult {
  data: unknown;
  /** Resumo para op_tool_calls (≤ 300 chars, sem CPF). */
  summary: string;
  /** Cards tocados/lidos — o dashboard liga a chamada ao card. */
  cardIds?: string[];
}

export interface OpTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  level: OpLevel;
  permission: PermissionKey;
  schema: S;
  /** `trace` liga a escrita (metadata.op do Log) à linha de op_tool_calls. */
  run(ctx: { op: OperatorContext; trace: OpTrace }, args: z.output<S>): Promise<OpToolResult>;
}

/** Erro esperado de ferramenta (card não achado, coluna ambígua…): vira {ok:false, code, message}. */
export class OpToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 422,
    public details?: unknown,
  ) {
    super(message);
    this.name = "OpToolError";
  }
}

export function defineTool<S extends z.ZodType>(tool: OpTool<S>): OpTool<S> {
  return tool;
}

export interface OpToolCatalogEntry {
  name: string;
  description: string;
  level: OpLevel;
  permission: PermissionKey;
  inputSchema: Record<string, unknown>;
}

/** JSON Schema dos argumentos (entrada: campos com default ficam opcionais). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function catalogEntry(tool: OpTool): OpToolCatalogEntry {
  return {
    name: tool.name,
    description: tool.description,
    level: tool.level,
    permission: tool.permission,
    inputSchema: toJsonSchema(tool.schema),
  };
}

/** Mensagem curta em português a partir dos erros de validação do zod. */
export function describeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}
