import { describe, expect, it } from "vitest";
import {
  COLLECT_REQUEST_CLEARED,
  COLLECT_REQUEST_MAX_CHARS,
  COLLECT_REQUEST_WINDOW_MS,
  appendListToRequest,
  attendantRequestForLog,
  buildAttendantRequestFact,
  collectOpenData,
  collectPresetFromFlow,
  collectRequestEndedData,
  collectSummary,
  flowListText,
  isCollectRequestLive,
  isListLikeRequest,
  normalizeCollectRequest,
  pickAttendantRequest,
  requestAnchor,
  requestNoteLine,
  sameCollectRequest,
} from "@/app/_shared/utils/collect-request";

// Pedido em aberto da IA (30/09/2026): a lista que o atendente mandou (ou que a
// IA mandou pelo fluxo) vira fato para o cérebro conferir item por item, em vez
// de transferir no primeiro arquivo. Detecção, âncora e limpeza são regra pura.

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-10-01T15:00:00.000Z");

// Passos reais do fluxo "LISTA DE DOCUMENTOS - INSS" (whatsapp_flows, 30/09/2026).
const INSS_FLOW_STEPS = [
  {
    kind: "text",
    body:
      "LISTA DE DOCUMENTOS\n\nPara achar os documentos, basta pesquisar o nome deles dentro do aplicativo do \"MEU INSS\"\n\n" +
      "- CNIS (Pegue especificamente a opção do meio \"Vinculos, Contribuições e Remunerações\")\n" +
      "- Declaração De Beneficiário \n- Carta de Concessão\n- Resultado da Pericia (Ou resultado do beneficio)\n" +
      "- Laudo (Se tiver)\n-Cópia do processo(Se tiver)\n" +
      "- Carteira de Trabalho Digital (A versão normal e a versão \"Outros vinculos\", essa pode ser encontrado no aplicativo \"CARTEIRA DE TRABALHO DIGITAL\")",
  },
  {
    kind: "text",
    body:
      "📲 Para localizar os documentos:\n\n1.Abra o aplicativo Meu INSS;\n2.Clique na 🔍 lupinha, no canto superior direito;\n" +
      "3.Pesquise pelo nome de cada documento;\n4.Baixe os documentos e nos encaminhe por aqui.",
  },
];

describe("isListLikeRequest", () => {
  it("a LISTA DE DOCUMENTOS - INSS do fluxo conta", () => {
    expect(isListLikeRequest(INSS_FLOW_STEPS[0].body)).toBe(true);
  });

  it("listas com ✅, •, traço e numeração contam", () => {
    expect(isListLikeRequest(
      "Lista de Documentos:\n✅ CNIS\n✅ Carta de Concessão\n✅ Declaração de Beneficiário\n✅ Laudos médicos (se tiver)\n✅ CAT (se tiver)",
    )).toBe(true);
    expect(isListLikeRequest("Ainda faltam:\n✅ *Declaração de Beneficiário*\n✅ *Carta de Concessão*")).toBe(true);
    expect(isListLikeRequest("Preciso destes:\n• Laudo\n• Atestado")).toBe(true);
    expect(isListLikeRequest("1. CNIS\n2. Carta de concessão")).toBe(true);
    expect(isListLikeRequest(
      "Agora para dar entrada e fazer seu contrato, vamos precisar de:\n- Foto ou Pdf RG ou CNH\n- Seu endereço\n- Estado civil e profissão",
    )).toBe(true);
  });

  it("termos sem acento e em maiúsculas também casam", () => {
    expect(isListLikeRequest("MANDA O CNIS, A CARTA DE CONCESSAO E O LAUDO")).toBe(true);
  });

  it("saudação, pergunta, pedido de 1 item e o passo a passo do app não contam", () => {
    expect(isListLikeRequest("Bom dia! Tudo bem?")).toBe(false);
    expect(isListLikeRequest("Podemos conversar?")).toBe(false);
    expect(isListLikeRequest("Podemos conversar rapidinho?")).toBe(false);
    expect(isListLikeRequest("O senhor possui acesso ao aplicativo MEU INSS?")).toBe(false);
    expect(isListLikeRequest("Poderia me enviar sua carteira de trabalho?")).toBe(false);
    expect(isListLikeRequest(INSS_FLOW_STEPS[1].body)).toBe(false);
  });

  it("o lembrete que só cita a lista não conta", () => {
    expect(isListLikeRequest("Oi, eu novamente 😊 conseguiu ver minha última mensagem com a lista de documentos?")).toBe(false);
  });

  it("mensagem do link da ZapSign nunca conta, mesmo com termos de documento", () => {
    expect(isListLikeRequest(
      "Para finalizar, estamos enviando alguns documentos para assinatura (procurações, declaração de beneficiário e comprovante de endereço): " +
      "https://app.zapsign.com.br/verificar/abc123def456",
    )).toBe(false);
    expect(isListLikeRequest(
      "Segue o link da assinatura das procurações. Depois mande o RG, a CNH e o comprovante de endereço.",
    )).toBe(false);
  });

  it("null, vazio e só espaço não contam", () => {
    expect(isListLikeRequest(null)).toBe(false);
    expect(isListLikeRequest(undefined)).toBe(false);
    expect(isListLikeRequest("")).toBe(false);
    expect(isListLikeRequest("   \n ")).toBe(false);
  });
});

describe("pickAttendantRequest", () => {
  const list = (id: string, at: Date, body = "- CNIS\n- Carta de Concessão\n- Laudo") => ({ id, body, createdAt: at, authorId: "u1" });

  it("escolhe a lista mais recente depois da âncora, com a entrada fora de ordem", () => {
    const older = list("a", new Date(NOW.getTime() - 3 * DAY));
    const newer = list("b", new Date(NOW.getTime() - DAY), "Ainda faltam:\n✅ CNIS\n✅ Laudo");
    const chat = { id: "c", body: "Bom dia!", createdAt: new Date(NOW.getTime() - 60_000), authorId: "u1" };
    const got = pickAttendantRequest([newer, chat, older], new Date(NOW.getTime() - 5 * DAY));
    expect(got?.messageId).toBe("b");
    expect(got?.text).toBe("Ainda faltam:\n✅ CNIS\n✅ Laudo");
    expect(got?.at).toEqual(newer.createdAt);
    expect(got?.authorId).toBe("u1");
  });

  it("ignora lista igual ou anterior à âncora", () => {
    const at = new Date(NOW.getTime() - 2 * DAY);
    expect(pickAttendantRequest([list("a", at)], at)).toBeNull();
    expect(pickAttendantRequest([list("a", at)], new Date(at.getTime() + 1))).toBeNull();
  });

  it("sem mensagem com cara de lista (ou lista vazia) dá null", () => {
    expect(pickAttendantRequest([], new Date(0))).toBeNull();
    expect(pickAttendantRequest([{ id: "x", body: "Podemos conversar?", createdAt: NOW, authorId: null }], new Date(0))).toBeNull();
    expect(pickAttendantRequest([{ id: "x", body: null, createdAt: NOW, authorId: null }], new Date(0))).toBeNull();
  });
});

describe("requestAnchor e validade", () => {
  it("sem fim de pedido, a âncora é agora − 7 dias", () => {
    expect(requestAnchor(null, NOW).getTime()).toBe(NOW.getTime() - COLLECT_REQUEST_WINDOW_MS);
    expect(requestAnchor(undefined, NOW.getTime()).getTime()).toBe(NOW.getTime() - COLLECT_REQUEST_WINDOW_MS);
  });

  it("fim de pedido mais antigo que 7 dias não segura nada; recente vira a âncora", () => {
    expect(requestAnchor(new Date(NOW.getTime() - 30 * DAY), NOW).getTime()).toBe(NOW.getTime() - COLLECT_REQUEST_WINDOW_MS);
    const recent = new Date(NOW.getTime() - DAY);
    expect(requestAnchor(recent, NOW)).toEqual(recent);
  });

  it("pedido gravado vale por 7 dias", () => {
    expect(isCollectRequestLive(new Date(NOW.getTime() - 6 * DAY), NOW)).toBe(true);
    expect(isCollectRequestLive(new Date(NOW.getTime() - 8 * DAY), NOW)).toBe(false);
    expect(isCollectRequestLive(null, NOW)).toBe(false);
  });
});

describe("gravação: abrir, concluir, limpar", () => {
  it("abrir zera a cobrança automática", () => {
    expect(collectOpenData("- CNIS", "u1", "devolver", NOW)).toEqual({
      collectRequest: "- CNIS",
      collectRequestAt: NOW,
      collectRequestById: "u1",
      collectRequestSource: "devolver",
      collectNudgeAt: null,
      collectNudgeCount: 0,
    });
  });

  it("limpar NÃO grava o fim (a lista continua detectável); concluir grava", () => {
    expect("collectRequestEndedAt" in COLLECT_REQUEST_CLEARED).toBe(false);
    expect(COLLECT_REQUEST_CLEARED.collectRequest).toBeNull();
    const ended = collectRequestEndedData(NOW);
    expect(ended.collectRequestEndedAt).toEqual(NOW);
    expect(ended.collectRequest).toBeNull();
    expect(ended.collectNudgeCount).toBe(0);
  });
});

describe("texto do pedido", () => {
  it("normaliza espaços e quebras; vazio vira null; corta em 1500", () => {
    expect(normalizeCollectRequest("  - CNIS  \r\n\r\n\r\n\r\n - Laudo ")).toBe("- CNIS\n\n- Laudo");
    expect(normalizeCollectRequest("   ")).toBeNull();
    expect(normalizeCollectRequest(42)).toBeNull();
    const long = normalizeCollectRequest("x".repeat(3000));
    expect(Array.from(long ?? "").length).toBe(COLLECT_REQUEST_MAX_CHARS);
    expect(long?.endsWith("…")).toBe(true);
  });

  it("mesmo pedido compara o texto normalizado", () => {
    expect(sameCollectRequest(" - CNIS\n", "- CNIS")).toBe(true);
    expect(sameCollectRequest(null, "")).toBe(true);
    expect(sameCollectRequest("- CNIS", "- Laudo")).toBe(false);
  });
});

describe("fato ao cérebro", () => {
  const at = new Date(NOW.getTime() - DAY);

  it("returnedToBot só quando o Devolver veio no instante do pedido ou depois", () => {
    const base = { text: "- CNIS", source: "lista_atendente" as const, at, docsSinceOpened: 2, nudges: 1 };
    expect(buildAttendantRequestFact({ ...base, returnedToBotAt: at }).returnedToBot).toBe(true);
    expect(buildAttendantRequestFact({ ...base, returnedToBotAt: new Date(at.getTime() + 1) }).returnedToBot).toBe(true);
    expect(buildAttendantRequestFact({ ...base, returnedToBotAt: new Date(at.getTime() - 1) }).returnedToBot).toBe(false);
    expect(buildAttendantRequestFact({ ...base, returnedToBotAt: null }).returnedToBot).toBe(false);
  });

  it("formato do contrato: at em ISO, contagens inteiras, flowName só em fluxo_ia", () => {
    const fact = buildAttendantRequestFact({
      text: "- CNIS", source: "lista_atendente", at, returnedToBotAt: null, docsSinceOpened: 2.4, nudges: -1,
    });
    expect(fact).toEqual({
      text: "- CNIS", source: "lista_atendente", at: at.toISOString(), returnedToBot: false, docsSinceOpened: 2, nudges: 0,
    });
    const flow = buildAttendantRequestFact({
      text: "- CNIS", source: "fluxo_ia", at, returnedToBotAt: null, docsSinceOpened: 0, nudges: 0,
      flowName: "LISTA DE DOCUMENTOS - INSS",
    });
    expect(flow.flowName).toBe("LISTA DE DOCUMENTOS - INSS");
  });

  it("o log leva o texto cortado em 200", () => {
    const fact = buildAttendantRequestFact({
      text: "y".repeat(1000), source: "devolver", at, returnedToBotAt: null, docsSinceOpened: 0, nudges: 0,
    });
    expect(fact.text.length).toBe(1000);
    expect(Array.from(attendantRequestForLog(fact)?.text ?? "").length).toBe(200);
    expect(attendantRequestForLog(null)).toBeNull();
  });
});

describe("fluxos", () => {
  it("só o passo com cara de lista vira o pedido (o passo a passo do app fica fora)", () => {
    const text = flowListText(INSS_FLOW_STEPS);
    expect(text).toContain("CNIS");
    expect(text).toContain("Carta de Concessão");
    expect(text).not.toContain("lupinha");
    expect(flowListText([{ kind: "text", body: "Olá! Tudo bem?" }])).toBeNull();
    expect(flowListText(null)).toBeNull();
  });

  it("botão rápido do Devolver: título + um item por linha, sem marcador", () => {
    const preset = collectPresetFromFlow(INSS_FLOW_STEPS);
    expect(preset?.split("\n")[0]).toBe("Lista de documentos do INSS (Meu INSS):");
    expect(preset).toContain("- Laudo (Se tiver)");
    expect(preset).toContain("- Cópia do processo(Se tiver)");
    expect(preset?.split("\n").filter((l) => l.startsWith("- ")).length).toBe(7);
    expect(collectPresetFromFlow([])).toBeNull();
  });

  it("pedido vago ganha a lista do fluxo no fim", () => {
    const list = flowListText(INSS_FLOW_STEPS) ?? "";
    const merged = appendListToRequest("ver se tem Meu INSS", list);
    expect(merged.startsWith("ver se tem Meu INSS\n\n")).toBe(true);
    expect(isListLikeRequest(merged)).toBe(true);
  });
});

describe("resumo e nota da Fila", () => {
  it("resumo curto com os primeiros itens e o (+N) do resto", () => {
    const summary = collectSummary("- CNIS\n- Carta de Concessão\n- Declaração de Beneficiário\n- Laudo (se tiver)", 40);
    expect(summary).toMatch(/^CNIS, Carta de Concessão/);
    expect(summary).toMatch(/\(\+\d\)$/);
    expect(collectSummary("ver se tem Meu INSS e pedir o CNIS")).toBe("ver se tem Meu INSS e pedir o CNIS");
  });

  it("linha da nota diz se a transferência concluiu ou manteve o pedido", () => {
    const req = { text: "- CNIS\n- Laudo", source: "lista_atendente" };
    expect(requestNoteLine(req, { concluded: true })).toBe(
      "📋 Pedido que a IA estava recolhendo (lista mandada pelo atendente):\n- CNIS\n- Laudo",
    );
    expect(requestNoteLine(req, { concluded: false })).toMatch(/^📋 Pedido em aberto \(lista mandada pelo atendente\) — continua valendo/);
    expect(requestNoteLine({ text: "  ", source: "devolver" }, { concluded: true })).toBeNull();
    expect(requestNoteLine(null, { concluded: true })).toBeNull();
  });
});
