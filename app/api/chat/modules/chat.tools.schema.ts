/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

export interface ToolDefinitionWithAccess extends FunctionDeclaration {
  adminOnly?: boolean;
}

export const toolDefinitions: ToolDefinitionWithAccess[] = [
  {
    name: "getDadosCards",
    adminOnly: true,
    description: `
        Busca dados completos de um cliente no sistema, incluindo documentos.

        Retorna: informações pessoais, endereço, dados do acidente, etiqueta/etapa atual,
        serviço vinculado, observações e lista de documentos.

        Use quando o usuário perguntar sobre:
        - Dados de um cliente (nome, CPF, telefone, endereço, etc.)
        - Documentos de um cliente
        - Em qual etiqueta/etapa um cliente está
        - Informações de um processo

        Exemplos:
        - "Busca os dados do João Silva"
        - "Qual o telefone da Maria?"
        - "Quais documentos o José tem?"
        - "Em qual etapa está o Carlos?"
        - "Puxa o processo do Pedro"
        `,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          description: "Nome ou parte do nome do cliente para buscar",
        },
        telefone: {
          type: SchemaType.STRING,
          description: "Telefone do cliente (alternativa ao nome)",
        },
        process: {
          type: SchemaType.BOOLEAN,
          description: "Se true, busca na tabela de Processos. Se false ou omitido, busca na tabela de Usuários.",
        },
      },
      required: [],
    },
  },
];

export function getToolsForRole(role: string): FunctionDeclaration[] {
  const isAdmin = role?.startsWith("ADMIN") ?? false;
  return toolDefinitions
    .filter((t) => !t.adminOnly || isAdmin)
    .map(({ adminOnly, ...tool }) => tool);
}
