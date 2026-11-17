// Formulários do WhatsApp (Meta "WhatsApp Flows"), T-7ZQH6 — regras PURAS,
// usadas no servidor (envio, webhook, edição) e no navegador (prévia, editor,
// bolha da thread). Sem banco, sem fetch.
//
// Não confundir com os "fluxos" do CRM (WhatsAppFlow / flow-runner.ts), que
// são sequências de textos pré-setados. Aqui é o formulário interativo da Meta:
// telas com campos que o cliente preenche dentro do WhatsApp.

// ─── Mensagem interativa gravada em WhatsAppMessage.interactive ──────────────

export interface WaFormField {
  key: string;
  label: string;
  value: string;
}

export interface WaFlowSent {
  kind: 'flow';
  formVersionId: string;
  metaFlowId: string;
  flowName: string;
  version: number;
  token: string;
  cta: string;
  header?: string | null;
  footer?: string | null;
  screen: string;
  /** "terms" = formulário de aceite que o BOT mandou (T-B40K0): o aceite leva à Fila. */
  purpose?: 'terms' | null;
  /** Motivo do `qualify` do cérebro, guardado para a nota da Fila quando o aceite chegar. */
  queueReason?: string | null;
  /** Saiu como TEMPLATE com botão de formulário (o corpo é o texto do template). */
  viaTemplate?: boolean | null;
}

export interface WaFlowReply {
  kind: 'flow_reply';
  token: string | null;
  formVersionId: string | null;
  flowName: string | null;
  fields: WaFormField[];
}

export type WaInteractive = WaFlowSent | WaFlowReply;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Lê o Json do banco (ou do DTO) sem confiar no formato. */
export function parseInteractive(raw: unknown): WaInteractive | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'flow') {
    const formVersionId = str(o.formVersionId);
    const metaFlowId = str(o.metaFlowId);
    const token = str(o.token);
    if (!formVersionId || !metaFlowId || !token) return null;
    return {
      kind: 'flow',
      formVersionId,
      metaFlowId,
      flowName: str(o.flowName) ?? 'Formulário',
      version: typeof o.version === 'number' ? o.version : 1,
      token,
      cta: str(o.cta) ?? '',
      header: str(o.header),
      footer: str(o.footer),
      screen: str(o.screen) ?? '',
      purpose: o.purpose === 'terms' ? 'terms' : null,
      queueReason: str(o.queueReason),
      viaTemplate: o.viaTemplate === true,
    };
  }
  if (o.kind === 'flow_reply') {
    const fields = Array.isArray(o.fields)
      ? o.fields.flatMap((f): WaFormField[] => {
        if (!f || typeof f !== 'object') return [];
        const r = f as Record<string, unknown>;
        const key = str(r.key);
        if (!key) return [];
        return [{ key, label: str(r.label) ?? humanizeKey(key), value: str(r.value) ?? '' }];
      })
      : [];
    return {
      kind: 'flow_reply',
      token: str(o.token),
      formVersionId: str(o.formVersionId),
      flowName: str(o.flowName),
      fields,
    };
  }
  return null;
}

// ─── Limites da mensagem que leva o Flow (Cloud API) ─────────────────────────

// CTA: a Meta recomenda até 30 caracteres; 20 cabe em qualquer celular sem
// cortar e evita a recusa ("flow_cta" longo demais) na frente do cliente.
export const FORM_MESSAGE_LIMITS = { body: 1024, cta: 20, header: 60, footer: 60 } as const;

export interface FormMessageInput {
  body: string;
  cta: string;
  header?: string | null;
  footer?: string | null;
}

/** Erro de preenchimento em português, ou null se a mensagem pode sair. */
export function validateFormMessage(m: FormMessageInput): string | null {
  const body = m.body.trim();
  const cta = m.cta.trim();
  if (!body) return 'Escreva o texto da mensagem que leva o formulário.';
  if (body.length > FORM_MESSAGE_LIMITS.body) return `O texto da mensagem passa de ${FORM_MESSAGE_LIMITS.body} caracteres.`;
  if (!cta) return 'Escreva o texto do botão (ex.: "Abrir formulário").';
  if (cta.length > FORM_MESSAGE_LIMITS.cta) return `O texto do botão passa de ${FORM_MESSAGE_LIMITS.cta} caracteres.`;
  // A Meta recusa emoji no botão do Flow.
  if (/\p{Extended_Pictographic}/u.test(cta)) return 'O texto do botão não pode ter emoji.';
  if ((m.header ?? '').trim().length > FORM_MESSAGE_LIMITS.header) return `O cabeçalho passa de ${FORM_MESSAGE_LIMITS.header} caracteres.`;
  if ((m.footer ?? '').trim().length > FORM_MESSAGE_LIMITS.footer) return `O rodapé passa de ${FORM_MESSAGE_LIMITS.footer} caracteres.`;
  return null;
}

// ─── JSON do Flow ─────────────────────────────────────────────────────────────

export interface FlowComponent {
  type?: string;
  name?: string;
  [key: string]: unknown;
}

export interface FlowScreen {
  id: string;
  title?: string;
  terminal?: boolean;
  data?: Record<string, { type?: string; __example__?: unknown } | undefined>;
  layout?: { type?: string; children?: FlowComponent[] };
  [key: string]: unknown;
}

export interface FlowJson {
  version?: string;
  screens: FlowScreen[];
  [key: string]: unknown;
}

/** JSON do Flow com `screens` válido, ou null. */
export function readFlowJson(raw: unknown): FlowJson | null {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const screens = (v as { screens?: unknown }).screens;
  if (!Array.isArray(screens) || screens.length === 0) return null;
  if (!screens.every((s) => s && typeof s === 'object' && typeof (s as FlowScreen).id === 'string')) return null;
  return v as FlowJson;
}

/**
 * Filhos de um componente que também são componentes: `Form` (JSON antigo)
 * guarda em `children`, `If` em `then`/`else`, `Switch` em `cases`.
 */
function childLists(c: FlowComponent): { path: (string | number)[]; list: FlowComponent[] }[] {
  const out: { path: (string | number)[]; list: FlowComponent[] }[] = [];
  if (Array.isArray(c.children)) out.push({ path: ['children'], list: c.children as FlowComponent[] });
  if (Array.isArray(c.then)) out.push({ path: ['then'], list: c.then as FlowComponent[] });
  if (Array.isArray(c.else)) out.push({ path: ['else'], list: c.else as FlowComponent[] });
  if (c.cases && typeof c.cases === 'object' && !Array.isArray(c.cases)) {
    for (const [k, v] of Object.entries(c.cases as Record<string, unknown>)) {
      if (Array.isArray(v)) out.push({ path: ['cases', k], list: v as FlowComponent[] });
    }
  }
  return out;
}

/** Percorre todos os componentes de uma tela, com o caminho a partir da tela. */
export function walkComponents(
  screen: FlowScreen,
  visit: (c: FlowComponent, path: (string | number)[]) => void,
): void {
  const rec = (list: FlowComponent[], base: (string | number)[]) => {
    list.forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      const path = [...base, i];
      visit(c, path);
      for (const child of childLists(c)) rec(child.list, [...path, ...child.path]);
    });
  };
  rec(screen.layout?.children ?? [], ['layout', 'children']);
}

/** Telas que alguma ação `navigate` abre (não podem ser a tela de entrada). */
function navigateTargets(json: FlowJson): Set<string> {
  const targets = new Set<string>();
  const scan = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(scan); return; }
    const o = v as Record<string, unknown>;
    if (o.name === 'navigate' && o.next && typeof o.next === 'object') {
      const n = (o.next as { name?: unknown }).name;
      if (typeof n === 'string') targets.add(n);
    }
    Object.values(o).forEach(scan);
  };
  json.screens.forEach((s) => scan(s.layout));
  return targets;
}

export interface FirstScreenData {
  key: string;
  type: string;
  example: unknown;
}

/**
 * Tela que abre o formulário: a 1ª, na ordem do JSON, que nenhuma outra abre
 * por `navigate` (a Meta exige uma tela de entrada no `flow_action_payload`).
 */
export function entryScreen(json: FlowJson): FlowScreen {
  const targets = navigateTargets(json);
  return json.screens.find((s) => !targets.has(s.id)) ?? json.screens[0];
}

/**
 * Dados que uma tela espera receber no envio (`data` da tela). Sem `screenId`
 * (ou id que não existe), a tela de entrada; o template com botão de
 * formulário diz a tela no `navigate_screen`.
 */
export function entryScreenData(json: FlowJson, screenId?: string | null): FirstScreenData[] {
  const screen = (screenId ? json.screens.find((s) => s.id === screenId) : null) ?? entryScreen(json);
  return Object.entries(screen.data ?? {}).map(([key, d]) => ({
    key,
    type: typeof d?.type === 'string' ? d.type : 'string',
    example: d?.__example__,
  }));
}

/**
 * Monta o `data` do envio a partir do que o atendente preencheu. Tipos
 * simples são convertidos; lista/objeto usa o exemplo do próprio JSON (a Meta
 * recusa a mensagem se faltar uma chave declarada na tela).
 */
export function buildEntryData(json: FlowJson, values: Record<string, string>, screenId?: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of entryScreenData(json, screenId)) {
    const raw = (values[d.key] ?? '').trim();
    if (d.type === 'number') out[d.key] = Number(raw.replace(',', '.')) || 0;
    else if (d.type === 'boolean') out[d.key] = raw === 'true' || raw === 'sim';
    else if (d.type === 'string') out[d.key] = raw;
    else out[d.key] = d.example ?? (d.type === 'array' ? [] : {});
  }
  return out;
}

/**
 * Sugestão para os dados da tela de entrada a partir do contato/card: nome,
 * primeiro nome, CPF e telefone pelos nomes de chave mais comuns.
 */
export function suggestEntryValues(
  data: FirstScreenData[],
  known: { name?: string | null; cpf?: string | null; phone?: string | null },
): Record<string, string> {
  const fullName = (known.name ?? '').trim();
  const first = fullName.split(/\s+/)[0] ?? '';
  const out: Record<string, string> = {};
  for (const d of data) {
    const k = normalizeKey(d.key);
    if (/^(nome_?completo|full_?name)$/.test(k)) out[d.key] = fullName;
    else if (/^(nome|name|primeiro_?nome|first_?name|cliente)$/.test(k)) out[d.key] = first;
    else if (k === 'cpf') out[d.key] = onlyDigits(known.cpf ?? '');
    else if (/^(telefone|phone|celular|whatsapp)$/.test(k)) out[d.key] = onlyDigits(known.phone ?? '');
    else if (d.type === 'string' && typeof d.example === 'string') out[d.key] = '';
  }
  return out;
}

// ─── Prévia (resumo das telas) ───────────────────────────────────────────────

export type PreviewItemKind = 'heading' | 'subheading' | 'text' | 'caption' | 'input' | 'choice' | 'optin' | 'button' | 'link' | 'image' | 'other';

export interface PreviewItem {
  kind: PreviewItemKind;
  text: string;
  required?: boolean;
}

export interface PreviewScreen {
  id: string;
  title: string;
  terminal: boolean;
  items: PreviewItem[];
}

const INPUT_TYPES = new Set(['TextInput', 'TextArea', 'DatePicker', 'CalendarPicker', 'PhotoPicker', 'DocumentPicker']);
const CHOICE_TYPES = new Set(['Dropdown', 'RadioButtonsGroup', 'CheckboxGroup', 'ChipsSelector', 'NavigationList']);

/** Texto de exibição: tira a crase das expressões e o `${...}` vira «campo». */
function displayText(v: unknown): string {
  const raw = Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('\n') : typeof v === 'string' ? v : '';
  const ref = /\$\{(?:data|form)\.(\w+)\}/g;
  // Expressão entre crases: sequência de 'literais' e ${data.x} (ex.:
  // `'Nome: ' ${data.nome}`) — junta os pedaços na ordem.
  if (raw.startsWith('`') && raw.endsWith('`')) {
    const parts: string[] = [];
    const token = /'((?:[^'\\]|\\.)*)'|\$\{(?:data|form)\.(\w+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = token.exec(raw))) parts.push(m[1] !== undefined ? m[1] : `«${m[2]}»`);
    return parts.join('').trim();
  }
  return raw.replace(ref, '«$1»').trim();
}

/** Resumo legível das telas do Flow (a prévia do modal; não é o render da Meta). */
export function summarizeFlow(json: FlowJson): PreviewScreen[] {
  return json.screens.map((s) => {
    const items: PreviewItem[] = [];
    walkComponents(s, (c) => {
      const t = c.type ?? '';
      if (t === 'TextHeading') items.push({ kind: 'heading', text: displayText(c.text) });
      else if (t === 'TextSubheading') items.push({ kind: 'subheading', text: displayText(c.text) });
      else if (t === 'TextBody' || t === 'RichText') items.push({ kind: 'text', text: displayText(c.text) });
      else if (t === 'TextCaption') items.push({ kind: 'caption', text: displayText(c.text) });
      else if (INPUT_TYPES.has(t)) items.push({ kind: 'input', text: displayText(c.label) || c.name || t, required: c.required === true });
      else if (CHOICE_TYPES.has(t)) items.push({ kind: 'choice', text: displayText(c.label) || c.name || t, required: c.required === true });
      else if (t === 'OptIn') items.push({ kind: 'optin', text: displayText(c.label), required: c.required === true });
      else if (t === 'Footer') items.push({ kind: 'button', text: displayText(c.label) });
      else if (t === 'EmbeddedLink') items.push({ kind: 'link', text: displayText(c.text) });
      else if (t === 'Image') items.push({ kind: 'image', text: displayText(c['alt-text']) || 'Imagem' });
    });
    return { id: s.id, title: s.title ?? s.id, terminal: s.terminal === true, items: items.filter((i) => i.text) };
  });
}

// ─── Editor de textos ────────────────────────────────────────────────────────

export type EditableKind = 'text' | 'multiline' | 'bool';

export interface EditableField {
  /** Caminho a partir da raiz do JSON, serializado (chave estável do editor). */
  key: string;
  path: (string | number)[];
  screenIndex: number;
  label: string;
  kind: EditableKind;
  value: string | boolean;
  /** RichText guardado como lista de linhas: volta a ser lista ao aplicar. */
  asLines?: boolean;
}

const TEXT_PROP: Record<string, string> = {
  TextHeading: 'Título', TextSubheading: 'Subtítulo', TextBody: 'Texto', TextCaption: 'Legenda',
};

/** Texto com expressão (`${data.x}`, crase) não é editável aqui: só no JSON avançado. */
function isDynamic(v: unknown): boolean {
  return typeof v === 'string' && (v.includes('${') || v.startsWith('`'));
}

export function pathKey(path: (string | number)[]): string {
  return path.join('.');
}

/**
 * Campos de texto editáveis do Flow (títulos de tela, textos, rótulos, ajuda,
 * obrigatório, botões). Expressões dinâmicas ficam de fora.
 */
export function extractEditableFields(json: FlowJson): EditableField[] {
  const out: EditableField[] = [];
  json.screens.forEach((s, si) => {
    const base: (string | number)[] = ['screens', si];
    const push = (path: (string | number)[], label: string, kind: EditableKind, value: string | boolean, asLines?: boolean) => {
      const full = [...base, ...path];
      out.push({ key: pathKey(full), path: full, screenIndex: si, label, kind, value, ...(asLines ? { asLines } : {}) });
    };
    if (typeof s.title === 'string' && !isDynamic(s.title)) push(['title'], 'Título da tela', 'text', s.title);
    walkComponents(s, (c, path) => {
      const t = c.type ?? '';
      if (TEXT_PROP[t] && typeof c.text === 'string' && !isDynamic(c.text)) {
        push([...path, 'text'], TEXT_PROP[t], t === 'TextBody' ? 'multiline' : 'text', c.text);
      } else if (t === 'RichText') {
        if (Array.isArray(c.text) && c.text.every((x) => typeof x === 'string')) {
          push([...path, 'text'], 'Texto longo (uma linha por parágrafo)', 'multiline', (c.text as string[]).join('\n'), true);
        } else if (typeof c.text === 'string' && !isDynamic(c.text)) {
          push([...path, 'text'], 'Texto longo', 'multiline', c.text);
        }
      } else if (INPUT_TYPES.has(t) || CHOICE_TYPES.has(t) || t === 'OptIn') {
        const nome = c.name ? ` "${c.name}"` : '';
        if (typeof c.label === 'string' && !isDynamic(c.label)) {
          push([...path, 'label'], t === 'OptIn' ? `Caixa de autorização${nome}` : `Rótulo do campo${nome}`, t === 'OptIn' ? 'multiline' : 'text', c.label);
        }
        if (typeof c['helper-text'] === 'string' && !isDynamic(c['helper-text'])) {
          push([...path, 'helper-text'], `Ajuda do campo${nome}`, 'text', c['helper-text'] as string);
        }
        if (typeof c.required === 'boolean') push([...path, 'required'], `Obrigatório${nome}`, 'bool', c.required);
      } else if (t === 'Footer' && typeof c.label === 'string' && !isDynamic(c.label)) {
        push([...path, 'label'], 'Botão da tela', 'text', c.label);
      } else if (t === 'EmbeddedLink' && typeof c.text === 'string' && !isDynamic(c.text)) {
        push([...path, 'text'], 'Link', 'text', c.text);
      }
    });
  });
  return out;
}

function setAtPath(root: unknown, path: (string | number)[], value: unknown): void {
  let cur = root as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const next = cur?.[path[i]];
    if (!next || typeof next !== 'object') return;
    cur = next as Record<string | number, unknown>;
  }
  if (cur && typeof cur === 'object') cur[path[path.length - 1]] = value;
}

/** Cópia do JSON com as edições aplicadas (chave = `EditableField.key`). */
export function applyEditableFields(json: FlowJson, edits: Record<string, string | boolean>): FlowJson {
  const copy = structuredClone(json);
  for (const f of extractEditableFields(json)) {
    if (!(f.key in edits)) continue;
    const v = edits[f.key];
    if (f.kind === 'bool') setAtPath(copy, f.path, v === true);
    else if (f.asLines) setAtPath(copy, f.path, String(v).split('\n'));
    else setAtPath(copy, f.path, String(v));
  }
  return copy;
}

/** Cópia do JSON com a tela `from` levada para a posição `to`. */
export function moveScreen(json: FlowJson, from: number, to: number): FlowJson {
  const copy = structuredClone(json);
  if (from < 0 || from >= copy.screens.length || to < 0 || to >= copy.screens.length || from === to) return copy;
  const [s] = copy.screens.splice(from, 1);
  copy.screens.splice(to, 0, s);
  return copy;
}

// ─── Resposta do cliente (webhook nfm_reply) ─────────────────────────────────

export function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

function normalizeKey(key: string): string {
  return key.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** Rótulo curto de cada campo do Flow (`name` → `label`) e o título das opções. */
function fieldCatalog(json: FlowJson | null): { labels: Map<string, string>; options: Map<string, Map<string, string>>; aliases: Map<string, string> } {
  const labels = new Map<string, string>();
  const options = new Map<string, Map<string, string>>();
  const aliases = new Map<string, string>();
  if (!json) return { labels, options, aliases };
  for (const s of json.screens) {
    walkComponents(s, (c) => {
      if (typeof c.name === 'string' && typeof c.label === 'string' && !isDynamic(c.label)) {
        // OptIn tem uma frase inteira como rótulo: fica o nome do campo.
        const label = c.label.trim();
        if (label.length <= 48 && c.type !== 'OptIn') labels.set(c.name, label);
      }
      if (typeof c.name === 'string' && Array.isArray(c['data-source'])) {
        const m = new Map<string, string>();
        for (const o of c['data-source'] as { id?: unknown; title?: unknown }[]) {
          if (typeof o?.id === 'string' && typeof o.title === 'string') m.set(o.id, o.title);
        }
        if (m.size) options.set(c.name, m);
      }
      // Payload do `complete`: chave → campo de origem (`${form.cpf}`).
      const action = c['on-click-action'] as { name?: unknown; payload?: unknown } | undefined;
      if (action?.name === 'complete' && action.payload && typeof action.payload === 'object') {
        for (const [k, v] of Object.entries(action.payload as Record<string, unknown>)) {
          const m = typeof v === 'string' ? /^\$\{(?:form|data)\.(\w+)\}$/.exec(v) : null;
          if (m && m[1] !== k) aliases.set(k, m[1]);
        }
      }
    });
  }
  return { labels, options, aliases };
}

function formatValue(v: unknown, opts?: Map<string, string>): string {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => formatValue(x, opts)).filter(Boolean).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v).trim();
  return opts?.get(s) ?? s;
}

/**
 * Lê o `response_json` do `nfm_reply`: tira o `flow_token` e devolve os campos
 * com rótulo (do JSON do Flow, quando há; senão a chave legível) e valor
 * formatado (booleano = Sim/Não, opção = título).
 */
export function parseFlowReply(responseJson: unknown, flowJson: FlowJson | null): { token: string | null; fields: WaFormField[] } {
  let obj: unknown = responseJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return { token: null, fields: [] }; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { token: null, fields: [] };
  const { labels, options, aliases } = fieldCatalog(flowJson);
  let token: string | null = null;
  const fields: WaFormField[] = [];
  for (const [key, raw] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'flow_token') { token = typeof raw === 'string' ? raw : null; continue; }
    // A chave do payload pode vir de outro campo (`consentimento: ${form.aceite}`):
    // as opções (id → título) são as do campo de origem; o rótulo, o da própria
    // chave (o de origem pode ser outra pergunta).
    const source = aliases.get(key) ?? key;
    const label = labels.get(key) ?? humanizeKey(key);
    fields.push({ key, label, value: formatValue(raw, options.get(source)) });
  }
  return { token, fields };
}

/** Texto legível da resposta: prévia da lista, histórico do bot e busca. */
export function flowReplyBody(flowName: string | null, fields: WaFormField[]): string {
  const head = `📋 Formulário respondido${flowName ? ` — ${flowName}` : ''}`;
  const lines = fields.filter((f) => f.value).map((f) => `• ${f.label}: ${f.value}`);
  const body = [head, ...lines].join('\n');
  return body.length > 1500 ? `${body.slice(0, 1497)}...` : body;
}

/** Texto legível do Flow enviado (o cliente vê o corpo + o botão). */
export function flowSentBody(flowName: string, body: string, cta: string): string {
  return `📋 Formulário enviado — ${flowName}\n${body.trim()}\n[botão: ${cta.trim()}]`;
}

// ─── "Aplicar ao cadastro" ───────────────────────────────────────────────────

/** Campos da ficha (CLIENT_FIELDS em copilot-data.ts) que uma resposta pode preencher. */
export type FichaFieldFromForm =
  | 'name' | 'cpf' | 'rg' | 'email' | 'data_nasc' | 'nome_mae' | 'estado_civil' | 'profissao'
  | 'cep' | 'rua' | 'numero' | 'bairro' | 'cidade' | 'estado';

export const FICHA_FIELD_LABELS: Record<FichaFieldFromForm, string> = {
  name: 'Nome', cpf: 'CPF', rg: 'RG', email: 'E-mail', data_nasc: 'Data de nascimento',
  nome_mae: 'Nome da mãe', estado_civil: 'Estado civil', profissao: 'Profissão',
  cep: 'CEP', rua: 'Rua', numero: 'Número', bairro: 'Bairro', cidade: 'Cidade', estado: 'Estado',
};

const FICHA_KEY_RULES: [RegExp, FichaFieldFromForm][] = [
  [/^(nome_?completo|full_?name|nome_?cliente)$/, 'name'],
  [/^cpf$/, 'cpf'],
  [/^rg$/, 'rg'],
  [/^e_?mail$/, 'email'],
  [/^(data_?(de_)?nasc(imento)?|nascimento|birth_?date)$/, 'data_nasc'],
  [/^(nome_?(da_)?mae|mae)$/, 'nome_mae'],
  [/^estado_?civil$/, 'estado_civil'],
  [/^(profissao|ocupacao)$/, 'profissao'],
  [/^cep$/, 'cep'],
  [/^(rua|logradouro|endereco)$/, 'rua'],
  [/^(numero|num|n)$/, 'numero'],
  [/^bairro$/, 'bairro'],
  [/^(cidade|municipio)$/, 'cidade'],
  [/^(estado|uf)$/, 'estado'],
];

export interface FichaUpdate {
  field: FichaFieldFromForm;
  label: string;
  value: string;
  sourceKey: string;
}

/**
 * Campos da resposta que viram campo da ficha/card. CPF e CEP vão só com
 * dígitos (decisão de 24/10: cadastro sem máscara); CPF fora de 11 dígitos e
 * CEP fora de 8 não entram. Nome precisa de nome e sobrenome.
 */
export function formFieldsToFicha(fields: WaFormField[]): FichaUpdate[] {
  const out: FichaUpdate[] = [];
  const seen = new Set<FichaFieldFromForm>();
  for (const f of fields) {
    const rule = FICHA_KEY_RULES.find(([re]) => re.test(normalizeKey(f.key)));
    if (!rule) continue;
    const field = rule[1];
    if (seen.has(field)) continue;
    let value = f.value.trim();
    if (!value) continue;
    if (field === 'cpf') {
      value = onlyDigits(value);
      if (value.length !== 11) continue;
    } else if (field === 'cep') {
      value = onlyDigits(value);
      if (value.length !== 8) continue;
    } else if (field === 'name') {
      value = value.replace(/\s+/g, ' ');
      if (value.split(' ').length < 2) continue;
    } else if (field === 'estado') {
      value = value.toUpperCase();
    }
    seen.add(field);
    out.push({ field, label: FICHA_FIELD_LABELS[field], value, sourceKey: f.key });
  }
  return out;
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

/** Versão de um formulário (linha de WhatsAppFormVersion) para a tela. */
export interface FormVersionDTO {
  id: string;
  familyId: string;
  metaFlowId: string;
  version: number;
  name: string;
  status: string;
  active: boolean;
  bodyText: string | null;
  cta: string | null;
  headerText: string | null;
  footerText: string | null;
  createdByName: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Família = as versões do mesmo formulário (a ativa sai no envio). */
export interface FormFamilyDTO {
  familyId: string;
  name: string;
  adAuto: boolean;
  active: FormVersionDTO | null;
  draft: FormVersionDTO | null;
  versions: FormVersionDTO[];
}

/** GET /api/whatsapp/forms?contactId= */
export interface FormCatalogResponse {
  wabaId: string | null;
  families: FormFamilyDTO[];
  /** A Meta não respondeu: o catálogo é o último sincronizado. */
  syncError: string | null;
  canEdit: boolean;
}

export interface FlowValidationError {
  message: string;
  line?: number | null;
}

/** GET /api/whatsapp/forms?versionId=&contactId= */
export interface FormDetailResponse {
  version: FormVersionDTO;
  flowJson: FlowJson | null;
  jsonError: string | null;
  previewUrl: string | null;
  entryScreen: string | null;
  entryData: FirstScreenData[];
  suggested: Record<string, string>;
  versions: FormVersionDTO[];
  canEdit: boolean;
}

/**
 * Flows que a Meta cria sozinha para formulário de anúncio Click-to-WhatsApp
 * ("Padrão CTWA_xxxxx", dezenas por WABA): ficam escondidos atrás de um botão.
 */
export function isAdAutoForm(name: string): boolean {
  return /^padr[aã]o ctwa[_ ]/i.test(name.trim());
}

/** Nome da versão nova na Meta: "<base> vN" (tira um " vN" que já exista). */
export function nextVersionName(baseName: string, version: number): string {
  return `${baseName.replace(/\s+v\d+$/i, '').trim()} v${version}`;
}

export interface TemplateFlowButton {
  /** Posição do botão entre os botões do template (o `index` do componente de envio). */
  index: number;
  flowId: string;
  /** Tela que o botão abre (`navigate_screen`); null = a de entrada. */
  screen: string | null;
  text: string;
}

/**
 * Botão de FORMULÁRIO de um template, lido dos `components` da Meta. Template
 * com botão FLOW só é aceito no envio com o componente `button`/`flow`
 * (token + dados da tela) — sem ele a Meta recusa.
 */
export function findTemplateFlowButton(components: unknown): TemplateFlowButton | null {
  if (!Array.isArray(components)) return null;
  const block = components.find((c) => c && typeof c === 'object' && String((c as { type?: unknown }).type).toUpperCase() === 'BUTTONS') as { buttons?: unknown } | undefined;
  const buttons = Array.isArray(block?.buttons) ? block!.buttons as Record<string, unknown>[] : [];
  const index = buttons.findIndex((b) => String(b?.type).toUpperCase() === 'FLOW');
  if (index < 0) return null;
  const b = buttons[index];
  if (b.flow_id == null) return null;
  return {
    index,
    flowId: String(b.flow_id),
    screen: typeof b.navigate_screen === 'string' ? b.navigate_screen : null,
    text: typeof b.text === 'string' ? b.text : 'Abrir formulário',
  };
}

/** Erro do envio do Flow em português, a partir do código da Graph API. */
export function describeFlowSendError(code: number | undefined, metaMessage: string | undefined): string {
  const detail = metaMessage ? ` (Meta: ${metaMessage})` : '';
  switch (code) {
    case 131047:
      return 'Fora da janela de 24 h: o cliente precisa ter escrito nas últimas 24 horas. Mande um template antes.';
    case 131026:
      return 'A Meta não conseguiu entregar: o número não tem WhatsApp ou o app do cliente está desatualizado.';
    case 131050:
      return 'O cliente bloqueou mensagens desta empresa.';
    case 131009:
    case 100:
      return `A Meta recusou o formulário: confira se ele está publicado nesta conta e se os dados da 1ª tela estão preenchidos${detail}.`;
    case 130429:
    case 131048:
    case 131056:
      return `A Meta limitou os envios agora. Tente de novo em alguns minutos${detail}.`;
    default:
      return `A Meta recusou o envio do formulário${detail}.`;
  }
}

/** Situação da versão na tela. */
export const FORM_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  DEPRECATED: 'Desativado',
  BLOCKED: 'Bloqueado pela Meta',
  THROTTLED: 'Limitado pela Meta',
  DISCARDED: 'Descartado',
};
