// SIMULADOR LOCAL das respostas em áudio do bot (08/11/2026).
//
//   node scripts/simulador-voz.mjs        → http://localhost:3011
//
// O WhatsApp de verdade não chega ao computador local (a Meta manda o webhook
// para produção). Este simulador faz o papel do CRM numa conversa de mentira:
// monta o mesmo payload do bot.ts, chama o cérebro LOCAL (D:\Chatbot_whatsapp
// rodando com BRAIN_PROMPT_URL=http://localhost:3011), aplica o campo
// voiceReplies e gera a voz pela ElevenLabs com os mesmos parâmetros do
// tts.ts. Nada vai ao banco, ao S3 nem à Meta: a conversa vive na memória.
//
// Também serve /api/whatsapp/brain-prompt para o micro local: busca as
// instruções PUBLICADAS em produção (só leitura) e acrescenta a seção nova de
// docs/planos/instrucoes-respostas-em-audio.md, para testar a detecção antes
// de publicar.
//
// Envs lidas (sem imprimir valores): ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID /
// ELEVENLABS_MODEL do .env do CRM; BOT_SECRET e BRAIN_PROMPT_URL do .env do micro.

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

const RAIZ = process.cwd();
const MICRO_DIR = process.env.MICRO_DIR || "D:/Chatbot_whatsapp";
const PORT = Number(process.env.SIM_PORT || 3011);
const MICRO_URL = process.env.MICRO_URL || "http://localhost:3004";

const crmEnv = existsSync(path.join(RAIZ, ".env")) ? dotenv.parse(readFileSync(path.join(RAIZ, ".env"))) : {};
const microEnv = existsSync(path.join(MICRO_DIR, ".env")) ? dotenv.parse(readFileSync(path.join(MICRO_DIR, ".env"))) : {};
const env = (k) => (process.env[k] ?? crmEnv[k] ?? "").trim();

const ELEVEN_KEY = env("ELEVENLABS_API_KEY");
// Voz em uso: começa na configurada e pode ser trocada pela página (campo "ID
// da voz") para comparar vozes sem reiniciar.
let vozAtual = env("ELEVENLABS_VOICE_ID");
const ELEVEN_MODEL = env("ELEVENLABS_MODEL") || "eleven_multilingual_v2";
// Velocidade da fala (mesma regra de voiceSpeed em voice-text.ts): padrão 1,1,
// faixa 0,7–1,2. A página troca para comparar.
let velocidade = (() => {
  const n = Number(env("ELEVENLABS_SPEED").replace(",", "."));
  return env("ELEVENLABS_SPEED") && Number.isFinite(n) ? Math.min(1.2, Math.max(0.7, n)) : 1.1;
})();
// Segredo entre o micro LOCAL e este simulador (o do arquivo de config do micro).
const BOT_SECRET = (microEnv.BOT_SECRET || crmEnv.CHATBOT_SECRET || "").trim();
// Prompt publicado em produção: endereço do CRM (o micro local costuma ter o
// campo vazio) e o segredo de PRODUÇÃO (CHATBOT_SECRET do CRM).
const PROD_BRAIN = (process.env.SIM_PROD_URL || microEnv.BRAIN_PROMPT_URL || "https://www.brasilbeneficiosbr.com")
  .trim().replace(/\/$/, "");
const PROD_SECRET = (crmEnv.CHATBOT_SECRET || microEnv.BOT_SECRET || "").trim();
// Voz padrão da ElevenLabs (liberada no plano grátis): usada quando a voz
// escolhida é da biblioteca e o plano ainda não permite pela API.
const VOZ_PADRAO = "EXAVITQu4vr4xnSDxMaL";

// Seção nova das instruções (tudo depois do "---" do rascunho).
const RASCUNHO = path.join(RAIZ, "docs/planos/instrucoes-respostas-em-audio.md");
const SECAO_AUDIO = existsSync(RASCUNHO)
  ? readFileSync(RASCUNHO, "utf8").split(/\n---\n/).slice(1).join("\n---\n").trim()
  : "";

// ---------------------------------------------------------------------------
// Cópia de app/_shared/utils/voice-text.ts (o script roda sem TypeScript).
// ---------------------------------------------------------------------------
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F\u20E3]/gu;
function needsTextCompanion(text) {
  return /\b(?:https?:\/\/|www\.)\S+/i.test(text) || /\bSAIR\b/.test(text);
}
function toSpeechText(text) {
  const lines = text
    .replace(/```/g, "").replace(URL_RE, "").replace(EMOJI_RE, "").replace(/[*_~]/g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•▪►➡→]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.map((l) => (/[.!?:;,]$/.test(l) ? l : `${l}.`)).join(" ")
    .replace(/\s+([.!?,;:])/g, "$1").replace(/([.!?])\.+/g, "$1").trim();
}

async function sintetizar(texto, voz = vozAtual) {
  if (!ELEVEN_KEY || !voz) throw new Error("ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID não estão configuradas no CRM");
  const t0 = Date.now();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=opus_48000_64`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/ogg" },
      body: JSON.stringify({
        text: texto,
        model_id: ELEVEN_MODEL,
        ...(/v2_5|flash|turbo|v3/.test(ELEVEN_MODEL) ? { language_code: "pt" } : {}),
        voice_settings: { speed: velocidade },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    const detalhe = (await res.text().catch(() => "")).slice(0, 200);
    // Voz da biblioteca no plano grátis: repete com a voz padrão e avisa.
    if (res.status === 402 && /paid_plan_required/.test(detalhe) && voz !== VOZ_PADRAO) {
      const v = await sintetizar(texto, VOZ_PADRAO);
      return { ...v, vozPadrao: true };
    }
    throw new Error(`ElevenLabs HTTP ${res.status}: ${detalhe}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ogg = buf.subarray(0, 4).toString("latin1") === "OggS";
  return { buf, ms: Date.now() - t0, chars: texto.length, ogg, vozPadrao: false };
}

// ---------------------------------------------------------------------------
// Estado da conversa simulada (memória do processo).
// ---------------------------------------------------------------------------
const midias = new Map(); // id → { buf, mime }
let conversa;
function novaConversa() {
  conversa = { history: [], memory: null, state: null, failCount: 0, voiceReplies: false, chars: 0 };
}
novaConversa();

function businessHours() {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const greeting = hour >= 5 && hour < 12 ? "bom dia" : hour >= 12 && hour < 18 ? "boa tarde" : "boa noite";
  const d = { "dom.": 0, "seg.": 1, "ter.": 2, "qua.": 3, "qui.": 4, "sex.": 5, "sáb.": 6 }[weekday] ?? 1;
  const open = (d >= 1 && d <= 5 && hour >= 8 && hour < 18) || (d === 6 && hour >= 8 && hour < 12);
  return { open, reopens: open ? "" : "no próximo horário comercial", greeting };
}

async function turno({ texto, audioId }) {
  const mediaList = audioId
    ? [{ id: audioId, url: `http://localhost:${PORT}/midia/${audioId}`, mimeType: "audio/wav", fileName: null }]
    : undefined;
  const payload = {
    contact: { name: "Cliente Teste", phone: "5541900000000" },
    processInfo: null,
    flows: [],
    history: conversa.history.slice(-30),
    message: texto || "",
    media: mediaList ? { url: mediaList[0].url, mimeType: "audio/wav" } : null,
    mediaList,
    memory: conversa.memory,
    state: conversa.state,
    failCount: conversa.failCount,
    priorOutcome: { qualified: conversa.prior?.qualified ?? null, closeCategory: conversa.prior?.closeCategory ?? null, returnedByAttendant: false, returnedAt: null },
    conversationFacts: {
      docsReceived: 0, registeredClient: false, recentAttendant: false, docsThisTurn: 0,
      burstTruncated: false, cardColumn: null, contractPending: null, attendantRequest: null,
      voiceReplies: conversa.voiceReplies,
    },
    business: businessHours(),
    signature: null,
  };
  const t0 = Date.now();
  const res = await fetch(`${MICRO_URL}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bot-secret": BOT_SECRET, "x-bot-budget-ms": "57000" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok || !d) throw new Error(`cérebro respondeu HTTP ${res.status}${d?.error ? `: ${d.error}` : ""}`);
  const cerebroMs = Date.now() - t0;

  // Mensagem do cliente no histórico, como o CRM grava (áudio = transcrição).
  const transcricao = d.transcripts?.find((t) => t.id === audioId)?.transcript ?? null;
  const clienteTxt = audioId
    ? `[anexo: áudio${transcricao ? ` — transcrição: ${transcricao}` : ""}]`
    : texto;
  conversa.history.push({ role: "client", source: null, text: clienteTxt });

  // Campo novo: a IA ligou/desligou o áudio (antes do 1º bloco, como no bot.ts).
  let mudouVoz = null;
  if (d.voiceReplies === "ligar" && !conversa.voiceReplies) mudouVoz = true;
  if (d.voiceReplies === "desligar" && conversa.voiceReplies) mudouVoz = false;
  if (mudouVoz !== null) conversa.voiceReplies = mudouVoz;

  conversa.memory = d.memory || conversa.memory;
  conversa.state = d.state || conversa.state;
  conversa.failCount = d.understood === false ? conversa.failCount + 1 : 0;

  const saidas = Array.isArray(d.replies) && d.replies.length ? d.replies : d.reply ? [d.reply] : [];
  const blocos = [];
  for (const texto of saidas) {
    const fala = conversa.voiceReplies ? toSpeechText(texto) : "";
    let audio = null;
    let erroVoz = null;
    if (fala) {
      try {
        const v = await sintetizar(fala);
        const id = randomUUID();
        midias.set(id, { buf: v.buf, mime: "audio/ogg" });
        conversa.chars += v.chars;
        audio = { url: `/midia/${id}`, ms: v.ms, chars: v.chars, ogg: v.ogg, vozPadrao: v.vozPadrao };
      } catch (err) {
        erroVoz = String(err.message || err);
      }
    }
    blocos.push({ texto, fala, audio, erroVoz, textoJunto: !!audio && needsTextCompanion(texto) });
    conversa.history.push({
      role: "bot", source: null,
      text: audio ? `[anexo: áudio — transcrição: ${texto}]` : texto,
    });
  }

  return {
    blocos,
    transcricao,
    decisao: {
      action: d.action, state: d.state, voiceReplies: d.voiceReplies, mudouVoz,
      closeCategory: d.closeCategory, handoffReason: d.handoffReason, silent: d.silent,
      rationale: d.rationale, brain: d.brain, cerebroMs,
    },
    voiceReplies: conversa.voiceReplies,
    charsTotal: conversa.chars,
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function lerCorpo(req, limite = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on("data", (c) => { total += c.length; if (total > limite) { reject(new Error("corpo grande demais")); req.destroy(); } else partes.push(c); });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}
const json = (res, status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGINA);
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, {
        voz: !!(ELEVEN_KEY && vozAtual), vozId: vozAtual, modelo: ELEVEN_MODEL, velocidade,
        cerebro: MICRO_URL, segredo: !!BOT_SECRET, secaoAudio: !!SECAO_AUDIO, voiceReplies: conversa.voiceReplies,
      });
    }
    // Prompt para o micro local: o publicado em produção + a seção do áudio.
    if (req.method === "GET" && url.pathname === "/api/whatsapp/brain-prompt") {
      if (!BOT_SECRET || req.headers["x-bot-secret"] !== BOT_SECRET) return json(res, 403, { error: "forbidden" });
      if (!PROD_BRAIN) {
        console.log("[SIM] sem URL de produção do prompt (BRAIN_PROMPT_URL do micro vazio)");
        return json(res, 502, { error: "BRAIN_PROMPT_URL do micro vazio" });
      }
      const r = await fetch(`${PROD_BRAIN}/api/whatsapp/brain-prompt`, {
        headers: { "x-bot-secret": PROD_SECRET }, signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) {
        console.log(`[SIM] prompt de produção respondeu HTTP ${r.status}`);
        return json(res, 502, { error: `produção respondeu HTTP ${r.status}` });
      }
      const data = await r.json();
      // Rascunho igual ao publicado: não duplica. Diferente: o rascunho entra
      // como ADENDO no fim (testar a regra nova antes de publicar).
      const ultimaFrase = SECAO_AUDIO.split(/\n/).filter(Boolean).at(-1) ?? "";
      const jaPublicado = SECAO_AUDIO.split(/\n\n/).every((par) => data?.instructions?.rendered?.includes(par.trim().slice(0, 80)));
      if (SECAO_AUDIO && ultimaFrase && typeof data?.instructions?.rendered === "string" && !jaPublicado) {
        data.instructions.rendered = `${data.instructions.rendered}\n\n${SECAO_AUDIO}`;
      }
      console.log(`[SIM] prompt de produção entregue ao micro${SECAO_AUDIO ? " + seção do áudio" : ""}`);
      return json(res, 200, data);
    }
    if (req.method === "GET" && url.pathname.startsWith("/midia/")) {
      const m = midias.get(url.pathname.slice("/midia/".length));
      if (!m) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": m.mime, "Content-Length": m.buf.length });
      return res.end(m.buf);
    }
    if (req.method === "POST" && url.pathname === "/api/voz") {
      const { texto } = JSON.parse((await lerCorpo(req)).toString("utf8") || "{}");
      const fala = toSpeechText(String(texto || ""));
      if (!fala) return json(res, 400, { error: "texto vazio" });
      const v = await sintetizar(fala);
      const id = randomUUID();
      midias.set(id, { buf: v.buf, mime: "audio/ogg" });
      return json(res, 200, { url: `/midia/${id}`, fala, ms: v.ms, chars: v.chars, ogg: v.ogg, vozPadrao: v.vozPadrao });
    }
    if (req.method === "POST" && url.pathname === "/api/turno") {
      const corpo = JSON.parse((await lerCorpo(req)).toString("utf8") || "{}");
      let audioId = null;
      if (corpo.audioWavBase64) {
        audioId = randomUUID();
        midias.set(audioId, { buf: Buffer.from(corpo.audioWavBase64, "base64"), mime: "audio/wav" });
      }
      if (!corpo.texto && !audioId) return json(res, 400, { error: "mande texto ou áudio" });
      return json(res, 200, await turno({ texto: String(corpo.texto || ""), audioId }));
    }
    // Vozes da conta (padrão da ElevenLabs + as adicionadas/clonadas).
    if (req.method === "GET" && url.pathname === "/api/vozes") {
      const r = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": ELEVEN_KEY }, signal: AbortSignal.timeout(10_000),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return json(res, r.status, { error: j?.detail?.message ?? j?.detail ?? `HTTP ${r.status}` });
      return json(res, 200, {
        vozes: (j?.voices ?? []).map((v) => ({
          id: v.voice_id, nome: v.name, categoria: v.category,
          genero: v.labels?.gender ?? null, sotaque: v.labels?.accent ?? null,
          idade: v.labels?.age ?? null, estilo: v.labels?.descriptive ?? v.labels?.description ?? null,
          uso: v.labels?.use_case ?? null, amostra: v.preview_url ?? null,
        })),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/velocidade") {
      const { valor } = JSON.parse((await lerCorpo(req)).toString("utf8") || "{}");
      const n = Number(valor);
      if (Number.isFinite(n)) velocidade = Math.min(1.2, Math.max(0.7, n));
      return json(res, 200, { velocidade });
    }
    if (req.method === "POST" && url.pathname === "/api/voz-id") {
      const { id } = JSON.parse((await lerCorpo(req)).toString("utf8") || "{}");
      if (typeof id === "string" && /^[A-Za-z0-9]{10,40}$/.test(id.trim())) vozAtual = id.trim();
      return json(res, 200, { vozId: vozAtual });
    }
    // Reproduzir uma conversa real: começa com este histórico (papéis client/bot).
    if (req.method === "POST" && url.pathname === "/api/semear") {
      const { historico, voiceReplies, arquivoContexto } = JSON.parse((await lerCorpo(req)).toString("utf8") || "{}");
      novaConversa();
      // Contexto exportado por scripts/diag-voz-contexto.mjs (ficha, etapa,
      // desfecho anterior), lido do disco para não passar pela página.
      if (typeof arquivoContexto === "string" && arquivoContexto.endsWith(".json") && existsSync(arquivoContexto)) {
        const ctx = JSON.parse(readFileSync(arquivoContexto, "utf8"));
        conversa.memory = ctx?.botMemory ?? null;
        conversa.state = ctx?.botState ?? null;
        conversa.prior = { qualified: ctx?.qualified ?? null, closeCategory: ctx?.closeCategory ?? null };
      }
      conversa.history = (Array.isArray(historico) ? historico : [])
        .filter((h) => (h?.role === "client" || h?.role === "bot") && typeof h.text === "string")
        .map((h) => ({ role: h.role, source: null, text: h.text }));
      conversa.voiceReplies = !!voiceReplies;
      return json(res, 200, { ok: true, turnos: conversa.history.length });
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      novaConversa();
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/modo-audio") {
      const { ligado } = JSON.parse((await lerCorpo(req)).toString("utf8") || "{}");
      conversa.voiceReplies = !!ligado;
      return json(res, 200, { voiceReplies: conversa.voiceReplies });
    }
    res.writeHead(404); res.end();
  } catch (err) {
    console.error("[SIM]", err);
    json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`[SIM] simulador em http://localhost:${PORT}`);
  console.log(`[SIM] voz ElevenLabs: ${ELEVEN_KEY && vozAtual ? `configurada (${ELEVEN_MODEL})` : "FALTANDO no .env do CRM"}`);
  console.log(`[SIM] cérebro: ${MICRO_URL} · segredo: ${BOT_SECRET ? "ok" : "FALTANDO"} · seção do áudio: ${SECAO_AUDIO ? "ok" : "não achada"}`);
});

// ---------------------------------------------------------------------------
// Página (um arquivo só, sem dependência externa).
// ---------------------------------------------------------------------------
const PAGINA = /* html */ `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simulador de voz do bot</title>
<style>
  :root{--bg:#efeae2;--card:#fff;--me:#d9fdd3;--txt:#111b21;--sub:#667781;--acc:#008069;--warn:#b45309;--vio:#6d28d9}
  *{box-sizing:border-box} body{margin:0;font:15px/1.4 system-ui,Segoe UI,sans-serif;background:#d1d7db;color:var(--txt)}
  .wrap{max-width:900px;margin:0 auto;display:grid;grid-template-columns:1fr 300px;gap:12px;padding:12px;min-height:100vh}
  @media (max-width:820px){.wrap{grid-template-columns:1fr}}
  .chat{background:var(--bg);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;min-height:80vh}
  header{background:var(--acc);color:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px}
  header b{flex:1} .pill{background:#ffffff33;border-radius:999px;padding:2px 10px;font-size:12px}
  .pill.on{background:#ede9fe;color:var(--vio);font-weight:700}
  #msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:6px}
  .b{max-width:78%;padding:7px 10px;border-radius:8px;background:var(--card);box-shadow:0 1px .5px #0002;white-space:pre-wrap;word-break:break-word}
  .b.me{align-self:flex-end;background:var(--me)} .b.sys{align-self:center;background:#fff8c5;font-size:13px;color:#5c4400}
  .b audio{width:250px;display:block;margin:2px 0}
  .b details{font-size:12px;color:var(--sub);margin-top:3px} .meta{font-size:11px;color:var(--sub);margin-top:2px}
  .comp{display:flex;gap:6px;padding:8px;background:#f0f2f5}
  .comp input{flex:1;border:0;border-radius:8px;padding:10px 12px;font-size:15px}
  button{border:0;border-radius:8px;padding:9px 12px;font-weight:600;cursor:pointer;background:var(--acc);color:#fff}
  button.sec{background:#fff;color:var(--txt);border:1px solid #ccd}
  button.rec{background:#dc2626} button:disabled{opacity:.5;cursor:default}
  aside{display:flex;flex-direction:column;gap:12px}
  .box{background:#fff;border-radius:10px;padding:12px} .box h3{margin:0 0 8px;font-size:14px}
  .box textarea{width:100%;min-height:80px;border:1px solid #ccd;border-radius:8px;padding:8px;font:inherit}
  .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px} small{color:var(--sub)}
  .dec{font-size:12px;color:var(--sub);white-space:pre-wrap;max-height:260px;overflow:auto}
  .ok{color:#15803d} .bad{color:#b91c1c}
</style></head><body>
<div class="wrap">
  <div class="chat">
    <header><b>Cliente Teste (simulação)</b><span id="modo" class="pill">Responde por texto</span></header>
    <div id="msgs"><div class="b sys">Converse como se fosse o cliente. Diga, por exemplo, "não sei ler, manda áudio" para a IA ligar o modo áudio.</div></div>
    <div class="comp">
      <input id="txt" placeholder="Mensagem do cliente…" autocomplete="off">
      <button id="enviar">Enviar</button>
      <button id="gravar" class="rec" title="Gravar áudio do cliente">🎤</button>
    </div>
  </div>
  <aside>
    <div class="box"><h3>Ambiente</h3><div id="st"><small>carregando…</small></div></div>
    <div class="box"><h3>Modo áudio (como o menu ⋮ do inbox)</h3>
      <div class="row"><button class="sec" id="liga">Ligar</button><button class="sec" id="desliga">Desligar</button><button class="sec" id="reset">Nova conversa</button></div>
      <div class="row"><small id="chars"></small></div>
    </div>
    <div class="box"><h3>Testar só a voz</h3>
      <div class="row"><input id="vozId" placeholder="ID da voz" style="flex:1;border:1px solid #ccd;border-radius:8px;padding:7px"><button class="sec" id="vozIdBtn">Usar</button></div>
      <div class="row"><small>Velocidade</small><input id="vel" type="range" min="0.7" max="1.2" step="0.05" value="1.1" style="flex:1"><b id="velTxt">1,10</b></div>
      <div class="row"><select id="vozLista" style="flex:1;border:1px solid #ccd;border-radius:8px;padding:7px">
        <option value="">— vozes padrão (plano grátis) —</option>
        <optgroup label="Femininas">
          <option value="XrExE9yKIg1WjnnlVkGX">Matilda (calorosa)</option>
          <option value="EXAVITQu4vr4xnSDxMaL">Sarah (suave)</option>
          <option value="FGY2WhTYpPnrIDTdsKH5">Laura (jovem, animada)</option>
          <option value="cgSgspJ2msm6clMCkdW9">Jessica (expressiva)</option>
          <option value="Xb7hH8MSUJpSbSDYk0k2">Alice (britânica)</option>
          <option value="pFZP5JQG7iQjIQuC4Bku">Lily (britânica, calorosa)</option>
        </optgroup>
        <optgroup label="Masculinas">
          <option value="cjVigY5qzO86Huf0OWal">Eric (calmo)</option>
          <option value="TX3LPaxmHKxFdv7VOQHJ">Liam (jovem)</option>
          <option value="bIHbv24MWmeRgasZH58o">Will (amigável)</option>
          <option value="iP95p4xoKVk53GoZ742B">Chris (descontraído)</option>
          <option value="CwhRBWXzGAHq8TQ4Fs17">Roger (confiante)</option>
          <option value="nPczCjzI2devNBz1zQrb">Brian (grave)</option>
          <option value="pNInz6obpgDQGcFmaJgB">Adam (grave)</option>
          <option value="JBFqnCBsd6RMkjVDRZzb">George (britânico, maduro)</option>
          <option value="onwK4e9ZLuTAKqWW03F9">Daniel (britânico, locutor)</option>
          <option value="IKne3meq5aSn9XLyUdCD">Charlie (australiano)</option>
          <option value="N2lVS1w4EtoT3dr4eOWO">Callum (rouco)</option>
        </optgroup>
        <optgroup label="Neutra">
          <option value="SAz9YHcvj6GT2YYXdXww">River (calma)</option>
        </optgroup>
      </select></div>
      <small>Plano grátis: só as vozes padrão da ElevenLabs funcionam pela API. Cada teste gasta uns 150 caracteres.</small>
      <textarea id="vozTxt">Oi, tudo bem? Aqui é da Brasil Benefícios. Pode deixar que vou te explicar tudo por áudio, tá bom? Me fala, quando foi o seu acidente?</textarea>
      <div class="row"><button id="vozBtn">Gerar voz</button><small id="vozInfo"></small></div>
      <div id="vozOut"></div>
    </div>
    <div class="box"><h3>Última decisão da IA</h3><div id="dec" class="dec">—</div></div>
  </aside>
</div>
<script>
const $ = (id) => document.getElementById(id);
const msgs = $("msgs");
function bolha(cls, html){ const d=document.createElement("div"); d.className="b "+cls; d.innerHTML=html; msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; return d; }
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function setModo(on){ const m=$("modo"); m.textContent = on ? "🔊 Responde em áudio" : "Responde por texto"; m.className = "pill"+(on?" on":""); }

async function status(){
  const s = await fetch("/api/status").then(r=>r.json());
  $("st").innerHTML = [
    "Voz ElevenLabs: " + (s.voz ? '<b class="ok">ok</b> ('+esc(s.modelo)+')' : '<b class="bad">falta a chave/voz no .env</b>'),
    "Cérebro local: " + esc(s.cerebro) + (s.segredo ? "" : ' <b class="bad">(sem segredo)</b>'),
    "Regra nova do áudio: " + (s.secaoAudio ? '<b class="ok">incluída</b>' : '<b class="bad">não achada</b>'),
  ].join("<br>");
  setModo(s.voiceReplies);
  if (!$("vozId").value) $("vozId").value = s.vozId || "";
}
status();
const velFmt = (v) => Number(v).toFixed(2).replace(".", ",");
$("vel").oninput = () => { $("velTxt").textContent = velFmt($("vel").value); };
$("vel").onchange = async () => {
  const r = await fetch("/api/velocidade",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({valor:Number($("vel").value)})}).then(r=>r.json());
  $("vel").value = r.velocidade; $("velTxt").textContent = velFmt(r.velocidade);
};
fetch("/api/status").then(r=>r.json()).then(s=>{ if (s.velocidade) { $("vel").value = s.velocidade; $("velTxt").textContent = velFmt(s.velocidade); } });
$("vozLista").onchange = () => { if ($("vozLista").value) { $("vozId").value = $("vozLista").value; $("vozIdBtn").click(); } };
$("vozIdBtn").onclick = async () => {
  const r = await fetch("/api/voz-id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:$("vozId").value})}).then(r=>r.json());
  $("vozId").value = r.vozId; bolha("sys","Voz em uso: "+esc(r.vozId));
};

function mostrarResposta(r){
  if (r.transcricao) bolha("sys", "Transcrição do seu áudio: " + esc(r.transcricao));
  const d = r.decisao;
  if (d.mudouVoz === true) bolha("sys", "🔊 A IA LIGOU o modo áudio");
  if (d.mudouVoz === false) bolha("sys", "A IA desligou o modo áudio (volta ao texto)");
  if (!r.blocos.length) bolha("sys", "(o bot não mandou mensagem: " + esc(d.action) + (d.silent?", silêncio":"") + ")");
  for (const b of r.blocos){
    if (b.audio){
      bolha("", '<audio controls src="'+b.audio.url+'"></audio><details><summary>texto falado</summary>'+esc(b.texto)+'</details><div class="meta">voz em '+b.audio.ms+' ms · '+b.audio.chars+' caracteres'+(b.audio.ogg?'':' · <b class="bad">não é ogg</b>')+(b.audio.vozPadrao?' · <b class="bad">voz padrão (a sua exige plano pago)</b>':'')+'</div>');
      if (b.textoJunto) bolha("", esc(b.texto) + '<div class="meta">texto junto (tem link ou SAIR)</div>');
    } else {
      bolha("", esc(b.texto) + (b.erroVoz ? '<div class="meta bad">voz falhou, foi texto: '+esc(b.erroVoz)+'</div>' : ""));
    }
  }
  const audios = msgs.querySelectorAll("audio"); const ult = r.blocos.filter(b=>b.audio).length;
  if (ult) { const lista=[...audios].slice(-ult); let i=0; const tocar=()=>{ if(i<lista.length){ const a=lista[i++]; a.onended=tocar; a.play().catch(()=>{}); } }; tocar(); }
  setModo(r.voiceReplies);
  $("chars").textContent = "Caracteres de voz nesta conversa: " + r.charsTotal;
  $("dec").textContent = "ação: "+d.action+"\\netapa: "+d.state+"\\nvoiceReplies: "+d.voiceReplies+
    (d.closeCategory?"\\ncategoria: "+d.closeCategory:"")+(d.handoffReason?"\\nmotivo: "+d.handoffReason:"")+
    "\\ncérebro: "+d.cerebroMs+" ms"+(d.brain?" · prompt "+d.brain.source+(d.brain.instructionsVersion?" v"+d.brain.instructionsVersion:""):"")+
    "\\n\\nraciocínio: "+(d.rationale||"—");
}

async function turno(corpo){
  $("enviar").disabled = $("gravar").disabled = true;
  const pensando = bolha("sys", "o bot está pensando…");
  try {
    const r = await fetch("/api/turno", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(corpo) });
    const j = await r.json(); pensando.remove();
    if (!r.ok) bolha("sys", "Erro: " + esc(j.error)); else mostrarResposta(j);
  } catch (e) { pensando.remove(); bolha("sys", "Erro: " + esc(e.message)); }
  finally { $("enviar").disabled = $("gravar").disabled = false; }
}
$("enviar").onclick = () => { const t=$("txt").value.trim(); if(!t) return; bolha("me", esc(t)); $("txt").value=""; turno({ texto:t }); };
$("txt").onkeydown = (e) => { if (e.key==="Enter") $("enviar").click(); };

// Gravação: MediaRecorder → WAV mono 16 kHz (formato que o Gemini aceita).
let rec=null, pedacos=[];
$("gravar").onclick = async () => {
  if (rec) { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    rec = new MediaRecorder(stream); pedacos=[];
    rec.ondataavailable = (e) => pedacos.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t=>t.stop()); rec=null; $("gravar").textContent="🎤";
      const blob = new Blob(pedacos, { type: pedacos[0]?.type || "audio/webm" });
      const wav = await paraWav(blob);
      const url = URL.createObjectURL(new Blob([wav], { type:"audio/wav" }));
      bolha("me", '<audio controls src="'+url+'"></audio><div class="meta">seu áudio</div>');
      let bin=""; const u8=new Uint8Array(wav); for (let i=0;i<u8.length;i+=0x8000) bin+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
      turno({ audioWavBase64: btoa(bin) });
    };
    rec.start(); $("gravar").textContent="⏹ Parar";
  } catch (e) { bolha("sys", "Microfone indisponível: " + esc(e.message)); }
};
async function paraWav(blob){
  const ctx = new AudioContext(); const dec = await ctx.decodeAudioData(await blob.arrayBuffer());
  const alvo = 16000; const off = new OfflineAudioContext(1, Math.ceil(dec.duration*alvo), alvo);
  const src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + pcm.length*2); const v = new DataView(buf);
  const w = (o,s) => [...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,"RIFF"); v.setUint32(4,36+pcm.length*2,true); w(8,"WAVE"); w(12,"fmt "); v.setUint32(16,16,true);
  v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,alvo,true); v.setUint32(28,alvo*2,true);
  v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,"data"); v.setUint32(40,pcm.length*2,true);
  for (let i=0;i<pcm.length;i++){ const s=Math.max(-1,Math.min(1,pcm[i])); v.setInt16(44+i*2, s<0?s*0x8000:s*0x7fff, true); }
  ctx.close(); return buf;
}

$("liga").onclick = async () => { const r=await fetch("/api/modo-audio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ligado:true})}).then(r=>r.json()); setModo(r.voiceReplies); bolha("sys","Modo áudio ligado na mão"); };
$("desliga").onclick = async () => { const r=await fetch("/api/modo-audio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ligado:false})}).then(r=>r.json()); setModo(r.voiceReplies); bolha("sys","Modo áudio desligado na mão"); };
$("reset").onclick = async () => { await fetch("/api/reset",{method:"POST"}); msgs.innerHTML=""; bolha("sys","Conversa nova."); setModo(false); $("chars").textContent=""; $("dec").textContent="—"; };
$("vozBtn").onclick = async () => {
  $("vozBtn").disabled = true; $("vozInfo").textContent = "gerando…";
  try {
    const r = await fetch("/api/voz",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({texto:$("vozTxt").value})});
    const j = await r.json();
    if (!r.ok) { $("vozInfo").textContent = "Erro: " + j.error; return; }
    $("vozInfo").textContent = j.ms+" ms · "+j.chars+" caracteres"+(j.ogg?"":" · NÃO é ogg")+(j.vozPadrao?" · voz padrão (a sua exige plano pago)":"");
    $("vozOut").innerHTML = '<audio controls autoplay src="'+j.url+'" style="width:100%;margin-top:6px"></audio>';
  } finally { $("vozBtn").disabled = false; }
};
</script></body></html>`;
