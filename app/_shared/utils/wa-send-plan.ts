// WhatsApp preparado pela IA de operação (Etapa 5): decide, ANTES de criar a
// aprovação, se o sendSystemWhatsApp vai mandar e por onde — mesma régua dele
// (opt-out, cooldown de proativa, janela de 24 h, opt-in, template APPROVED da
// WABA do contato, sem variável no cabeçalho, mídia do cabeçalho) mais a linha
// ativa e a pausa de templates (`templatesPaused`, que o sendTemplate aplica).
// Puro: o chamador lê o banco; testado em tests/wa-send-plan.test.ts.
// Não afrouxa nada: o envio continua passando por todas as travas de novo.

export interface WaPlanTemplate {
  name: string;
  status: string;
  /** UTILITY | MARKETING | AUTHENTICATION (categoria na Meta). */
  category: string;
  headerText: string | null;
  headerFormat: string | null;
  headerMediaKey: string | null;
  bodyVars: number;
  /** Texto de referência do corpo; sem ele não dá para mostrar nem mandar como texto. */
  bodyPreview: string | null;
}

export interface WaPlanInput {
  contact: { optedOut: boolean; optedInAt: Date | null };
  /** Linha que envia (a do contato ou a padrão); null = nenhuma linha cadastrada (envs). */
  number: { active: boolean; templatesPaused: boolean } | null;
  inCooldown: boolean;
  windowOpen: boolean;
  mode: "texto" | "template";
  /** Template achado no catálogo da WABA da linha do contato (null = não existe lá). */
  template?: WaPlanTemplate | null;
  varsCount?: number;
}

export type WaPlanBlock =
  | "opt_out"
  | "linha_inativa"
  | "cooldown"
  | "janela_fechada"
  | "sem_opt_in"
  | "template_nao_encontrado"
  | "template_nao_aprovado"
  | "templates_pausados"
  | "template_cabecalho_variavel"
  | "template_sem_midia"
  | "variaveis_erradas"
  | "template_sem_texto"
  | "template_categoria";

export type WaPlan =
  | { ok: true; via: "text" | "template"; aviso?: string }
  | { ok: false; code: WaPlanBlock; message: string };

const MIDIA = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

export function planWhatsAppSend(i: WaPlanInput): WaPlan {
  if (i.contact.optedOut) return { ok: false, code: "opt_out", message: "O cliente pediu para não receber mensagens (opt-out). Nada pode sair." };
  if (i.number && !i.number.active) return { ok: false, code: "linha_inativa", message: "A linha do contato está desativada (somente leitura). Nada sai por ela." };
  if (i.inCooldown) {
    return {
      ok: false,
      code: "cooldown",
      message: "Já saiu mensagem automática para este contato nas últimas horas (intervalo anti-spam). Tente depois ou fale pelo inbox.",
    };
  }

  if (i.mode === "texto") {
    if (!i.windowOpen) {
      return { ok: false, code: "janela_fechada", message: "Janela de 24 h fechada: texto livre não sai. Só um template aprovado da linha do contato." };
    }
    return { ok: true, via: "text" };
  }

  // Template: tem que existir e estar APPROVED na WABA da linha do contato,
  // mesmo dentro da janela (é o mesmo template que sairia fora dela).
  const t = i.template;
  if (!t) return { ok: false, code: "template_nao_encontrado", message: "Este template não existe no catálogo da linha do contato (o catálogo é por WABA)." };
  if (t.status !== "APPROVED") return { ok: false, code: "template_nao_aprovado", message: `O template "${t.name}" está ${t.status} na Meta; só APPROVED sai.` };
  // Qualquer categoria sai com aprovação do operador (decisão 10 do dono,
  // 26/10), menos AUTHENTICATION: é código de verificação de login, não
  // mensagem ao cliente (provisória). MARKETING sai com aviso na prévia —
  // foi a causa nº 1 do aviso de spam nas duas WABAs (auditoria 24/08/2026);
  // opt-out, cooldown, janela, opt-in e pausa continuam valendo abaixo.
  if (t.category === "AUTHENTICATION") {
    return { ok: false, code: "template_categoria", message: `O template "${t.name}" é AUTHENTICATION (código de verificação); a IA não manda esse tipo.` };
  }
  const avisoCategoria =
    t.category === "MARKETING"
      ? `Template MARKETING: foi o tipo que gerou o aviso de spam da Meta nas duas linhas. Mande só se o cliente espera esta mensagem.`
      : undefined;
  if ((i.varsCount ?? 0) !== t.bodyVars) {
    return { ok: false, code: "variaveis_erradas", message: `O template "${t.name}" tem ${t.bodyVars} variável(is) no corpo; vieram ${i.varsCount ?? 0}.` };
  }
  if (!t.bodyPreview?.trim()) {
    return { ok: false, code: "template_sem_texto", message: `O template "${t.name}" não tem o texto do corpo no cadastro (sincronize com a Meta): a prévia não mostraria o que sai.` };
  }
  if (i.windowOpen) {
    // sendSystemWhatsApp manda TEXTO dentro da janela: o texto do template preenchido.
    return { ok: true, via: "text", aviso: juntar("Janela de 24 h aberta: sai como texto com o conteúdo do template preenchido.", avisoCategoria) };
  }
  if (!i.contact.optedInAt) return { ok: false, code: "sem_opt_in", message: "Fora da janela e o contato não tem opt-in registrado: a Meta exige o aceite." };
  if (i.number?.templatesPaused) return { ok: false, code: "templates_pausados", message: "Templates estão pausados nesta linha (tela Números). Nada de template sai por ela." };
  if (/\{\{\s*\d+\s*\}\}/.test(t.headerText ?? "")) {
    return { ok: false, code: "template_cabecalho_variavel", message: `O template "${t.name}" tem variável no cabeçalho; envio automático não preenche cabeçalho.` };
  }
  if (t.headerFormat && MIDIA.has(t.headerFormat) && !t.headerMediaKey) {
    return { ok: false, code: "template_sem_midia", message: `O template "${t.name}" tem cabeçalho de mídia sem mídia definida (Templates → Gerenciar).` };
  }
  return { ok: true, via: "template", ...(avisoCategoria ? { aviso: avisoCategoria } : {}) };
}

function juntar(...partes: (string | undefined)[]): string {
  return partes.filter(Boolean).join(" ");
}

/** "5541999990000" / "(41) 99999-0000" → { ddd: "41", last8: "99990000" }; sem DDD → null. */
function phoneParts(raw: string | null | undefined): { ddd: string; last8: string } | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  return { ddd: d.slice(0, 2), last8: d.slice(-8) };
}

/**
 * O telefone do contato é o do card (mesmo DDD e mesmos 8 últimos dígitos —
 * o 9º dígito do celular varia entre cadastros)? O vínculo automático do inbox
 * casa só os 8 últimos: para ENVIAR, sem vínculo manual, exige também o DDD.
 */
export function samePhoneBR(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = phoneParts(a);
  const y = phoneParts(b);
  return !!x && !!y && x.ddd === y.ddd && x.last8 === y.last8;
}
