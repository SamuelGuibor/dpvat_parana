import { describe, it, expect } from "vitest";
import {
  readFlowJson, entryScreen, entryScreenData, buildEntryData, suggestEntryValues,
  summarizeFlow, extractEditableFields, applyEditableFields, moveScreen,
  parseFlowReply, flowReplyBody, formFieldsToFicha, parseInteractive,
  validateFormMessage, isAdAutoForm, nextVersionName, describeFlowSendError, findTemplateFlowButton,
  type FlowJson,
} from "@/app/_shared/utils/wa-forms";

// Recorte do Flow "aceite_termos_servico" publicado na WABA principal
// (13/11/2026): tela de dados → autorização (terminal) → termo completo.
const ACEITE: FlowJson = {
  version: "7.3",
  screens: [
    {
      id: "CONFIRMAR_ACEITE",
      title: "Autorização · 2 de 2",
      terminal: true,
      data: { nome_completo: { type: "string", __example__: "Maria" }, cpf: { type: "string", __example__: "1" } },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "Falta só a sua autorização" },
          {
            type: "OptIn", name: "aceite_termos", required: true,
            label: "SIM, autorizo e aceito o Termo de Serviços, incluindo o uso dos meus dados de saúde (cláusula 6)",
            "on-click-action": { name: "navigate", next: { type: "screen", name: "TERMOS_SERVICO" }, payload: {} },
          },
          { type: "TextCaption", text: "`'Nome: ' ${data.nome_completo}`" },
          {
            type: "Footer", label: "Autorizar e enviar",
            "on-click-action": {
              name: "complete",
              payload: {
                nome_completo: "${data.nome_completo}", cpf: "${data.cpf}",
                aceite_termos: "${form.aceite_termos}", consentimento_dados_saude: "${form.aceite_termos}",
                versao_termos: "v1",
              },
            },
          },
        ],
      },
    },
    {
      id: "ACEITE_TERMOS",
      title: "Seus dados · 1 de 2",
      data: { nome: { type: "string", __example__: "Maria" } },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "`'Olá, ' ${data.nome} '!'`" },
          { type: "TextBody", text: "Falta pouco." },
          { type: "TextInput", name: "nome_completo", label: "Nome completo", required: true },
          { type: "TextInput", name: "cpf", label: "CPF", required: true, "helper-text": "Ex.: 123.456.789-00" },
          {
            type: "Footer", label: "Continuar",
            "on-click-action": { name: "navigate", next: { type: "screen", name: "CONFIRMAR_ACEITE" }, payload: {} },
          },
        ],
      },
    },
    {
      id: "TERMOS_SERVICO",
      title: "Termo",
      data: {},
      layout: { type: "SingleColumnLayout", children: [{ type: "RichText", text: ["# TERMO", "Versão v1"] }] },
    },
  ],
};

describe("JSON do Flow", () => {
  it("lê string ou objeto e recusa sem telas", () => {
    expect(readFlowJson(JSON.stringify(ACEITE))?.screens).toHaveLength(3);
    expect(readFlowJson({ screens: [] })).toBeNull();
    expect(readFlowJson("{lixo")).toBeNull();
  });

  it("tela de entrada é a que nenhum navigate abre, mesmo fora da 1ª posição", () => {
    expect(entryScreen(ACEITE).id).toBe("ACEITE_TERMOS");
    expect(entryScreenData(ACEITE)).toEqual([{ key: "nome", type: "string", example: "Maria" }]);
  });

  it("dados da entrada: sugestão pelo contato e conversão por tipo", () => {
    const data = entryScreenData(ACEITE);
    expect(suggestEntryValues(data, { name: "Maria da Silva" })).toEqual({ nome: "Maria" });
    const json = { screens: [{ id: "A", data: { n: { type: "number" }, ok: { type: "boolean" }, l: { type: "array", __example__: [1] } } }] };
    expect(buildEntryData(json, { n: "3,5", ok: "true" })).toEqual({ n: 3.5, ok: true, l: [1] });
  });

  it("prévia troca a expressão pelo nome do campo e marca obrigatório", () => {
    const [confirmar, dados] = summarizeFlow(ACEITE);
    expect(confirmar.terminal).toBe(true);
    expect(confirmar.items.find((i) => i.kind === "caption")?.text).toBe("Nome: «nome_completo»");
    expect(dados.items.filter((i) => i.kind === "input").map((i) => [i.text, i.required])).toEqual([["Nome completo", true], ["CPF", true]]);
  });
});

describe("editor de textos", () => {
  it("lista textos fixos e deixa expressão de fora", () => {
    const fields = extractEditableFields(ACEITE);
    const texts = fields.map((f) => f.value);
    expect(texts).toContain("Falta pouco.");
    expect(texts).not.toContain("`'Olá, ' ${data.nome} '!'`");
    expect(fields.find((f) => f.label === 'Obrigatório "cpf"')?.value).toBe(true);
  });

  it("aplica edição sem mexer no original; RichText volta a ser lista", () => {
    const fields = extractEditableFields(ACEITE);
    const body = fields.find((f) => f.value === "Falta pouco.")!;
    const rich = fields.find((f) => f.label.startsWith("Texto longo"))!;
    const req = fields.find((f) => f.label === 'Obrigatório "cpf"')!;
    const out = applyEditableFields(ACEITE, { [body.key]: "Quase lá.", [rich.key]: "# TERMO\nVersão v2", [req.key]: false });
    expect(out.screens[1].layout!.children![1].text).toBe("Quase lá.");
    expect(out.screens[2].layout!.children![0].text).toEqual(["# TERMO", "Versão v2"]);
    expect(out.screens[1].layout!.children![3].required).toBe(false);
    expect(ACEITE.screens[1].layout!.children![1].text).toBe("Falta pouco.");
  });

  it("reordena telas sem mudar a entrada calculada", () => {
    const out = moveScreen(ACEITE, 1, 0);
    expect(out.screens.map((s) => s.id)).toEqual(["ACEITE_TERMOS", "CONFIRMAR_ACEITE", "TERMOS_SERVICO"]);
    expect(entryScreen(out).id).toBe("ACEITE_TERMOS");
  });
});

describe("resposta do cliente (nfm_reply)", () => {
  const raw = JSON.stringify({
    flow_token: "crm.abc", nome_completo: "Maria da Silva", cpf: "123.456.789-09",
    aceite_termos: true, consentimento_dados_saude: true, versao_termos: "v1",
  });

  it("separa o token e rotula pelos campos do Flow", () => {
    const { token, fields } = parseFlowReply(raw, ACEITE);
    expect(token).toBe("crm.abc");
    expect(fields.map((f) => [f.label, f.value])).toEqual([
      ["Nome completo", "Maria da Silva"],
      ["CPF", "123.456.789-09"],
      ["Aceite termos", "Sim"],
      ["Consentimento dados saude", "Sim"],
      ["Versao termos", "v1"],
    ]);
  });

  it("sem o JSON do Flow cai na chave legível; JSON quebrado não lança", () => {
    expect(parseFlowReply(raw, null).fields[0].label).toBe("Nome completo");
    expect(parseFlowReply("{x", null)).toEqual({ token: null, fields: [] });
  });

  it("opção de lista vira o título", () => {
    const json: FlowJson = { screens: [{ id: "A", layout: { children: [{ type: "Dropdown", name: "uf", label: "Estado", "data-source": [{ id: "pr", title: "Paraná" }] }] } }] };
    expect(parseFlowReply({ uf: "pr" }, json).fields).toEqual([{ key: "uf", label: "Estado", value: "Paraná" }]);
  });

  it("texto legível com o nome do formulário", () => {
    const { fields } = parseFlowReply(raw, ACEITE);
    expect(flowReplyBody("aceite", fields).split("\n").slice(0, 2)).toEqual(["📋 Formulário respondido — aceite", "• Nome completo: Maria da Silva"]);
  });
});

describe("aplicar ao cadastro", () => {
  it("CPF e CEP só com dígitos; descarta CPF inválido e nome sem sobrenome", () => {
    const out = formFieldsToFicha([
      { key: "nome_completo", label: "Nome", value: "  Maria   da Silva " },
      { key: "cpf", label: "CPF", value: "123.456.789-09" },
      { key: "CEP", label: "CEP", value: "80.000-000" },
      { key: "Endereço", label: "Endereço", value: "Rua X" },
      { key: "uf", label: "UF", value: "pr" },
      { key: "aceite_termos", label: "Aceite", value: "Sim" },
    ]);
    expect(out.map((u) => [u.field, u.value])).toEqual([
      ["name", "Maria da Silva"], ["cpf", "12345678909"], ["cep", "80000000"], ["rua", "Rua X"], ["estado", "PR"],
    ]);
    expect(formFieldsToFicha([{ key: "cpf", label: "", value: "123" }, { key: "nome_completo", label: "", value: "Maria" }])).toEqual([]);
  });
});

describe("mensagem e catálogo", () => {
  it("interactive do banco: aceita o formato e recusa lixo", () => {
    expect(parseInteractive({ kind: "flow", formVersionId: "v", metaFlowId: "m", token: "t" })?.kind).toBe("flow");
    expect(parseInteractive({ kind: "flow_reply", fields: [{ key: "cpf", value: "1" }, 3] })).toMatchObject({ fields: [{ key: "cpf", label: "Cpf", value: "1" }] });
    expect(parseInteractive({ kind: "flow" })).toBeNull();
    expect(parseInteractive("x")).toBeNull();
  });

  it("valida corpo e botão da mensagem", () => {
    expect(validateFormMessage({ body: "Oi", cta: "Abrir" })).toBeNull();
    expect(validateFormMessage({ body: "", cta: "Abrir" })).toMatch(/texto da mensagem/);
    expect(validateFormMessage({ body: "Oi", cta: "Um botão comprido demais" })).toMatch(/20/);
    expect(validateFormMessage({ body: "Oi", cta: "Abrir 👉" })).toMatch(/emoji/);
  });

  it("formulário automático de anúncio e nome da versão", () => {
    expect(isAdAutoForm("Padrão CTWA_eed61")).toBe(true);
    expect(isAdAutoForm("aceite_termos_servico")).toBe(false);
    expect(nextVersionName("aceite_termos_servico v2", 3)).toBe("aceite_termos_servico v3");
  });

  it("botão de formulário do template (aceite_termos_v2) e dados da tela que ele abre", () => {
    const components = [
      { type: "BODY", text: "Olá, *{{1}}*!" },
      { type: "BUTTONS", buttons: [
        { type: "URL", text: "Site" },
        { type: "FLOW", text: "Ler e aceitar", flow_id: 2989776964703903, flow_action: "NAVIGATE", navigate_screen: "ACEITE_TERMOS" },
      ] },
    ];
    expect(findTemplateFlowButton(components)).toEqual({ index: 1, flowId: "2989776964703903", screen: "ACEITE_TERMOS", text: "Ler e aceitar" });
    expect(findTemplateFlowButton([{ type: "BUTTONS", buttons: [{ type: "URL" }] }])).toBeNull();
    expect(findTemplateFlowButton(null)).toBeNull();
    // A tela pedida pelo botão vence a de entrada; id que não existe cai na de entrada.
    expect(entryScreenData(ACEITE, "CONFIRMAR_ACEITE").map((d) => d.key)).toEqual(["nome_completo", "cpf"]);
    expect(entryScreenData(ACEITE, "NAO_EXISTE").map((d) => d.key)).toEqual(["nome"]);
    expect(buildEntryData(ACEITE, { nome: "Maria" }, "ACEITE_TERMOS")).toEqual({ nome: "Maria" });
  });

  it("erro da Meta em português", () => {
    expect(describeFlowSendError(131047, "Re-engagement")).toMatch(/24 h/);
    expect(describeFlowSendError(100, "Invalid flow")).toMatch(/publicado/);
  });
});
