/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
import { GoogleGenerativeAI, FunctionCall } from "@google/generative-ai";
import { getToolsForRole, toolDefinitions } from "./chat.tools.schema";
import { runWindmillJob } from "./windmill.controller";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

type ToolArgs = {
  name?: string;
  telefone?: string;
  process?: boolean;
};

const SENSITIVE_FIELDS = [
  "password", "email", "cpf", "rg", "cpf_res", "rg_res",
  "nome_mae", "data_nasc", "documents",
];

function filterSensitiveData(data: any, userRole: string): any {
  if (userRole === "ADMIN") return data;

  if (Array.isArray(data)) {
    return data.map((item: any) => filterSensitiveData(item, userRole));
  }

  if (data && typeof data === "object") {
    const filtered = { ...data };
    for (const field of SENSITIVE_FIELDS) {
      delete filtered[field];
    }
    return filtered;
  }

  return data;
}

function createToolExecutors(userRole: string) {
  return {
    getDadosCards: async (args: ToolArgs) => {
      const result = await runWindmillJob("f/u/samuel/get-dados-usuarios", {
        name: args.name,
        telefone: args.telefone,
        process: args.process,
      });
      return {
        ...result,
        data: filterSensitiveData(result.data, userRole),
      };
    },
  };
}

export async function handleChat(
  pergunta: string,
  userId: string,
  userName: string,
  userRole: string
) {
  const isAdmin = userRole === "ADMIN";
  const toolExecutors = createToolExecutors(userRole);
  const allowedTools = getToolsForRole(userRole);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: allowedTools.length > 0 ? [{ functionDeclarations: allowedTools }] : undefined,
    systemInstruction: `
      Você é um assistente inteligente do sistema DPVAT Paraná.
      O usuário logado é ${userName}.
      Nível de acesso: ${isAdmin ? "ADMINISTRADOR (acesso total)" : "USUÁRIO COMUM (acesso restrito)"}.

      Seu papel é:
      - Entender a pergunta do usuário
      - Usar a ferramenta correta para buscar dados
      - Analisar os dados retornados
      - Gerar uma resposta clara, amigável e objetiva

      Regras:
      - NUNCA invente dados. Só responda com base nos resultados das ferramentas.
      - SEMPRE use ferramentas quando a pergunta envolver dados de clientes.
      - Responda sempre em português.
      - Seja direto e amigável.
      - Nunca retorne JSON. Converta tudo em texto legível.
      ${!isAdmin ? `
      RESTRIÇÃO CRÍTICA (usuário não-admin):
      - Você NÃO tem acesso a ferramentas de busca de dados de clientes.
      - Se o usuário pedir informações de clientes, dados pessoais, CPF, RG, documentos, etapas, processos ou qualquer dado do sistema, responda APENAS: "Desculpe, você não tem permissão para acessar dados de clientes. Entre em contato com um administrador."
      - NUNCA invente, fabrique ou simule dados de clientes. Você não tem acesso a essas informações.
      - Você só pode responder perguntas gerais sobre o sistema DPVAT que não envolvam dados de clientes específicos.
      ` : ""}

      Sobre os dados retornados:
      - Cada cliente tem informações pessoais, endereço, dados do acidente, serviço e observações.
      - Cada cliente pode ter documentos vinculados (nome do arquivo, data de upload).
      - O campo "role" do cliente indica a etapa/etiqueta no kanban (ex: "Solicitar Prontuário").
      - O campo "service" indica o tipo de serviço (DPVAT, SPVAT, INSS, etc.).

      Formato da resposta:
      - Resuma os dados principais primeiro.
      - Liste documentos se houver (somente admin).
      - Se não encontrar resultados, avise de forma amigável.
      `
  });

  const chat = model.startChat();
  let result = await chat.sendMessage(pergunta);
  let response = result.response;

  while (true) {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const functionCall: FunctionCall | undefined = parts.find(
      (p) => p.functionCall != null
    )?.functionCall;

    if (!functionCall) return response.text();

    const { name, args } = functionCall;

    const toolDef = toolDefinitions.find((t) => t.name === name);
    if (toolDef?.adminOnly && userRole !== "ADMIN") {
      result = await chat.sendMessage([
        {
          functionResponse: {
            name,
            response: {
              result: { error: "Acesso negado. Você não tem permissão para usar esta funcionalidade." },
            },
          },
        },
      ]);
      response = result.response;
      continue;
    }

    const executor = toolExecutors[name as keyof typeof toolExecutors];
    if (!executor) throw new Error(`Tool não encontrada: ${name}`);

    const toolResult = await executor(args as ToolArgs);

    result = await chat.sendMessage([
      {
        functionResponse: {
          name,
          response: { result: toolResult },
        },
      },
    ]);
    response = result.response;
  }
}