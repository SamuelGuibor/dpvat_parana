import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/app/_shared/lib/prisma";
import {
  SIGNATURE_HOWTO_FLOW_NAME,
  SIGNATURE_HOWTO_FLOW_DESCRIPTION,
  SIGNATURE_HOWTO_MEDIA,
  buildHowtoFlowSteps,
} from "@/app/_shared/lib/signature/howto-flow";

// SEED do fluxo "Como assinar (passo a passo)": sobe o áudio e o vídeo de
// public/assinatura/ pro S3 (chaves fixas em whatsapp/flows/) e cria/atualiza
// o WhatsAppFlow no banco. Rodar contra o banco/bucket de PRODUÇÃO:
//
//   npm run sign:flow
//
// Idempotente — rodar de novo REESCREVE mídia e passos com o conteúdo deste
// repo (edições feitas na tela de Fluxos do inbox são sobrescritas; o texto
// oficial mora em app/_shared/lib/signature/howto-flow.ts).

const ativo =
  process.env.SIGNATURE_FLOW_SEED === "1" || process.env.npm_lifecycle_event === "sign:flow";

describe.skipIf(!ativo)("seed do fluxo de como assinar", () => {
  it("sobe as mídias pro S3 e cria/atualiza o WhatsAppFlow", async () => {
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    for (const media of Object.values(SIGNATURE_HOWTO_MEDIA)) {
      const body = await readFile(path.join(process.cwd(), media.sourceFile));
      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: media.mediaKey,
        Body: body,
        ContentType: media.mediaType,
      }));
      console.log(`  S3 ok: ${media.mediaKey} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);
    }

    const steps = buildHowtoFlowSteps();
    const flow = await db.whatsAppFlow.upsert({
      where: { name: SIGNATURE_HOWTO_FLOW_NAME },
      update: { description: SIGNATURE_HOWTO_FLOW_DESCRIPTION, steps },
      create: { name: SIGNATURE_HOWTO_FLOW_NAME, description: SIGNATURE_HOWTO_FLOW_DESCRIPTION, steps },
    });
    console.log(`  Fluxo "${flow.name}" salvo (${steps.length} passos).`);
    expect(flow.id).toBeTruthy();
  }, 120_000);
});
