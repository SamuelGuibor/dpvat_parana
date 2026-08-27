// Gera a NARRAÇÃO do tutorial da página de assinatura com voz humana.
//
//   npm run sign:voz
//
// Por que gerar arquivo em vez de chamar a API na hora: o texto do tutorial é
// FIXO (mora em app/_shared/lib/signature/tutorial-content.json). Gerando uma
// vez, o cliente ouve na hora, sem espera, sem custo por play e sem depender de
// chave de API em produção. A página cai na voz robótica do próprio celular
// (speechSynthesis) só se o arquivo faltar.
//
// Editou o texto do tutorial? RODE ISTO DE NOVO, senão a voz fica desatualizada.
//
// Usa a GOOGLE_API_KEY que o projeto já tem (a mesma do Gemini) — não precisa
// ativar nada no console nem assinar outro serviço. A API devolve PCM cru, que
// aqui vira WAV e depois MP3 (ffmpeg).

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const RAIZ = process.cwd();
const CONTEUDO = path.join(RAIZ, "app/_shared/lib/signature/tutorial-content.json");
const SAIDA = path.join(RAIZ, "public/assinatura/voz");

// Voz e modelo dão pra trocar sem mexer no código.
const MODELO = process.env.SIGN_VOZ_MODELO ?? "gemini-3.1-flash-tts-preview";
const VOZ = process.env.SIGN_VOZ_NOME ?? "Sulafat";
// Instrução de ATUAÇÃO: é isto que tira o tom de robô. O modelo obedece o
// estilo pedido antes de ler o texto.
const ESTILO =
  process.env.SIGN_VOZ_ESTILO ??
  "Leia como uma atendente brasileira simpática e paciente falando com uma pessoa mais velha " +
  "que tem dificuldade com celular. Tom caloroso e tranquilo, ritmo pausado, sem pressa e sem " +
  "soar como robô. Fale naturalmente, como numa conversa de WhatsApp";

function lerChave() {
  const env = readFileSync(path.join(RAIZ, ".env"), "utf8");
  const linha = env.split(/\r?\n/).find((l) => l.startsWith("GOOGLE_API_KEY="));
  const chave = linha?.slice("GOOGLE_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!chave) throw new Error("GOOGLE_API_KEY não encontrada no .env");
  return chave;
}

/** PCM cru (L16 24kHz mono) → WAV, que o ffmpeg entende. */
function pcmParaWav(pcm, taxa = 24000) {
  const cabecalho = Buffer.alloc(44);
  cabecalho.write("RIFF", 0);
  cabecalho.writeUInt32LE(36 + pcm.length, 4);
  cabecalho.write("WAVE", 8);
  cabecalho.write("fmt ", 12);
  cabecalho.writeUInt32LE(16, 16);
  cabecalho.writeUInt16LE(1, 20); // PCM
  cabecalho.writeUInt16LE(1, 22); // mono
  cabecalho.writeUInt32LE(taxa, 24);
  cabecalho.writeUInt32LE(taxa * 2, 28); // byte rate (16 bits mono)
  cabecalho.writeUInt16LE(2, 32); // block align
  cabecalho.writeUInt16LE(16, 34); // bits por amostra
  cabecalho.write("data", 36);
  cabecalho.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cabecalho, pcm]);
}

async function sintetizar(texto, chave) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${chave}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${ESTILO}:\n\n${texto}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const dados = await res.json();
  const parte = dados?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!parte) throw new Error("resposta sem áudio");
  const taxa = Number(/rate=(\d+)/.exec(parte.inlineData.mimeType ?? "")?.[1] ?? 24000);
  return pcmParaWav(Buffer.from(parte.inlineData.data, "base64"), taxa);
}

function temFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const chave = lerChave();
const conteudo = JSON.parse(readFileSync(CONTEUDO, "utf8"));
mkdirSync(SAIDA, { recursive: true });
const mp3 = temFfmpeg();
if (!mp3) console.warn("⚠ ffmpeg não encontrado — vou salvar em WAV (arquivo maior).");

for (const [etapa, dados] of Object.entries(conteudo.etapas)) {
  // A voz lê EXATAMENTE os balões da etapa: o que está escrito é o que se ouve.
  const texto = dados.mensagens.join(" ");
  process.stdout.write(`etapa ${etapa} (${dados.titulo})… `);
  const wav = await sintetizar(texto, chave);

  const destinoWav = path.join(SAIDA, `passo-${etapa}.wav`);
  writeFileSync(destinoWav, wav);
  if (mp3) {
    const destinoMp3 = path.join(SAIDA, `passo-${etapa}.mp3`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", destinoWav, "-b:a", "64k", destinoMp3]);
    unlinkSync(destinoWav);
    const kb = Math.round(readFileSync(destinoMp3).length / 1024);
    console.log(`ok → passo-${etapa}.mp3 (${kb} KB)`);
  } else {
    console.log(`ok → passo-${etapa}.wav`);
  }
}

console.log(`\nPronto. Voz "${VOZ}" (${MODELO}) em public/assinatura/voz/.`);
if (!existsSync(path.join(SAIDA, "passo-1.mp3")) && mp3) {
  console.warn("⚠ passo-1.mp3 não foi gerado — confira os erros acima.");
}
