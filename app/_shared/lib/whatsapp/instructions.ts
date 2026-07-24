import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/app/_shared/lib/prisma';

// INSTRUÇÕES BASE do bot — o que era um template literal de 21.000 caracteres
// escondido dentro do bot.js, agora em seções versionadas e editáveis pela tela.
//
// Fluxo, idêntico ao do playbook:
//   editar (rascunho) → publicar → S3 + banco → microserviço lê e injeta
//
// O microserviço mantém o texto original hardcoded como FALLBACK. Se este
// registro sumir, se a rota cair ou se o S3 falhar, o bot atende com o prompt
// antigo em vez de ficar sem instrução nenhuma — o pior cenário possível seria
// um bot sem identidade conversando com cliente.

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const INSTRUCTIONS_CURRENT_KEY = 'whatsapp-brain/instructions/current.json';

export interface InstructionSection {
  id: string;
  title: string;
  content: string;
  order: number;
  /** Desligar uma seção a tira do prompt sem apagar o texto. */
  enabled: boolean;
}

/** Slug estável a partir do título — vira o id da seção. */
export function sectionId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug || `secao_${index}`;
}

/**
 * Converte o prompt cru (texto único com separadores ═══) em seções.
 *
 * O formato no bot.js é sempre três linhas: uma régua ═══, o título, outra
 * régua. Tudo antes da primeira régua é a introdução (identidade e tom).
 */
export function parseRawPrompt(raw: string): { intro: string; sections: InstructionSection[] } {
  const lines = raw.split('\n');
  const isRule = (l?: string) => !!l && /^═+$/.test(l.trim());

  const sections: InstructionSection[] = [];
  let intro = '';
  let current: { title: string; body: string[] } | null = null;
  const introLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Cabeçalho = régua, título, régua.
    if (isRule(lines[i]) && lines[i + 1] && !isRule(lines[i + 1]) && isRule(lines[i + 2])) {
      if (current) {
        sections.push({
          id: sectionId(current.title, sections.length),
          title: current.title,
          content: current.body.join('\n').trim(),
          order: sections.length + 1,
          enabled: true,
        });
      }
      current = { title: lines[i + 1].trim(), body: [] };
      i += 2;
      continue;
    }
    if (current) current.body.push(lines[i]);
    else introLines.push(lines[i]);
  }
  if (current) {
    sections.push({
      id: sectionId(current.title, sections.length),
      title: current.title,
      content: current.body.join('\n').trim(),
      order: sections.length + 1,
      enabled: true,
    });
  }
  intro = introLines.join('\n').trim();

  return { intro, sections };
}

/**
 * Remonta o texto do prompt a partir das seções.
 *
 * ⚠️ Precisa ser DETERMINÍSTICO: o resultado vira o bloco cacheado do system
 * prompt na Anthropic, e o cache é casamento de prefixo byte a byte. Ordenar
 * sempre por `order` e usar a mesma régua garante que duas montagens do mesmo
 * conteúdo produzam exatamente os mesmos bytes.
 */
export function renderInstructions(intro: string, sections: InstructionSection[]): string {
  const RULE = '═'.repeat(39);
  const body = [...sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)
    .map((s) => `${RULE}\n${s.title}\n${RULE}\n\n${s.content}`)
    .join('\n\n');
  return `${intro}\n\n${body}\n`;
}

export function charCountOf(intro: string, sections: InstructionSection[]): number {
  return renderInstructions(intro, sections).length;
}

/** Versão publicada (a que o bot usa). */
export async function getPublishedInstructions() {
  return db.whatsAppInstructions.findFirst({
    where: { status: 'publicado' },
    orderBy: { version: 'desc' },
  });
}

/**
 * Publica um rascunho: vira a versão ativa e o arquivo que o bot lê.
 * Grava o S3 ANTES do banco — se o S3 falhar, nada é marcado como publicado.
 */
export async function publishInstructions(id: string, publishedBy: string): Promise<void> {
  const draft = await db.whatsAppInstructions.findUnique({ where: { id } });
  if (!draft) throw new Error('Versão não encontrada.');
  if (draft.status === 'publicado') throw new Error('Esta versão já está publicada.');

  const sections = draft.sections as unknown as InstructionSection[];
  const payload = JSON.stringify(
    {
      version: draft.version,
      generatedAt: new Date().toISOString(),
      intro: draft.intro,
      sections,
      // Texto já montado: o microserviço não precisa reimplementar a montagem,
      // e assim não há risco de os dois lados divergirem num detalhe de
      // formatação e quebrarem o cache de prompt.
      rendered: renderInstructions(draft.intro, sections),
    },
    null,
    2,
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: INSTRUCTIONS_CURRENT_KEY,
      Body: payload,
      ContentType: 'application/json',
    }),
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `whatsapp-brain/instructions/v${draft.version}.json`,
      Body: payload,
      ContentType: 'application/json',
    }),
  );

  await db.whatsAppInstructions.updateMany({
    where: { status: 'publicado' },
    data: { status: 'descartado' },
  });
  await db.whatsAppInstructions.update({
    where: { id },
    data: { status: 'publicado', publishedAt: new Date(), publishedBy },
  });
}
