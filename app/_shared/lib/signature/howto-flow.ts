// Fluxo "como assinar" — a explicação que acompanha o link de assinatura.
//
// O conteúdo mora aqui (nome, textos e mídias) e é usado em dois lugares:
//   • `npm run sign:flow` (tests/signature-flow-seed.smoke.test.ts) sobe o
//     áudio e o vídeo pro S3 e cria/atualiza o WhatsAppFlow no banco — depois
//     disso a equipe também consegue dispará-lo à mão pelo composer do inbox,
//     e a IA pode escolhê-lo quando o cliente disser que não conseguiu assinar.
//   • `issueSignature` (core.ts) dispara o fluxo logo após enviar o link.
//
// As mídias originais estão versionadas em public/assinatura/ — o vídeo também
// é exibido direto na página /assinar/<token>.

export const SIGNATURE_HOWTO_FLOW_NAME = "Como assinar (passo a passo)";

export const SIGNATURE_HOWTO_FLOW_DESCRIPTION =
  "Explica como assinar os documentos pelo link de assinatura eletrônica: passo a passo em texto, " +
  "áudio explicando e vídeo mostrando a tela. Dispare quando o cliente recebeu o link de assinatura e " +
  "está com dúvida, diz que não conseguiu assinar ou pergunta como faz para assinar.";

/** Passo 1 — o passo a passo em texto simples (público que mal lê). */
export const SIGNATURE_HOWTO_TEXT = [
  "É bem fácil — olha o passo a passo:",
  "",
  "1️⃣ Toque no link que te mandei aqui em cima",
  "2️⃣ Veja os documentos com calma",
  "3️⃣ Assine com o dedo na tela (ou digite seu nome)",
  "4️⃣ Digite o código de 6 números que chega aqui no WhatsApp",
  "",
  "✅ Pronto! Depois disso a gente cuida de todo o resto.",
  "",
  "Vou te mandar um áudio e um vídeo mostrando direitinho como fazer. Qualquer dúvida, é só me chamar aqui. 😊",
].join("\n");

export const SIGNATURE_HOWTO_VIDEO_CAPTION =
  "👆 Esse vídeo mostra na prática, tela por tela, como assinar.";

/**
 * Mídias do fluxo: arquivo de origem no repositório e chave fixa no S3.
 * A chave PRECISA começar com "whatsapp/flows/" (regra do sanitizeSteps das
 * actions de fluxo — fora desse prefixo o passo é descartado ao salvar).
 */
export const SIGNATURE_HOWTO_MEDIA = {
  audio: {
    sourceFile: "public/assinatura/como-assinar-audio.mp4",
    mediaKey: "whatsapp/flows/assinatura-como-assinar-audio.mp4",
    mediaType: "audio/mp4", // AAC puro — chega como áudio tocável no chat
    fileName: "como-assinar-audio.mp4",
  },
  video: {
    sourceFile: "public/assinatura/como-assinar.mp4",
    mediaKey: "whatsapp/flows/assinatura-como-assinar-video.mp4",
    mediaType: "video/mp4", // H.264 + AAC, 8,6 MB (teto da Meta: 16 MB)
    fileName: "como-assinar.mp4",
  },
} as const;

/** Passos no formato do WhatsAppFlow.steps (mesmo shape das actions de fluxo). */
export function buildHowtoFlowSteps() {
  return [
    { kind: "text", body: SIGNATURE_HOWTO_TEXT, mediaKey: null, mediaType: null, fileName: null, delayMs: 0 },
    {
      kind: "audio",
      body: "",
      mediaKey: SIGNATURE_HOWTO_MEDIA.audio.mediaKey,
      mediaType: SIGNATURE_HOWTO_MEDIA.audio.mediaType,
      fileName: SIGNATURE_HOWTO_MEDIA.audio.fileName,
      delayMs: 2500,
    },
    {
      kind: "video",
      body: SIGNATURE_HOWTO_VIDEO_CAPTION,
      mediaKey: SIGNATURE_HOWTO_MEDIA.video.mediaKey,
      mediaType: SIGNATURE_HOWTO_MEDIA.video.mediaType,
      fileName: SIGNATURE_HOWTO_MEDIA.video.fileName,
      delayMs: 2500,
    },
  ];
}
