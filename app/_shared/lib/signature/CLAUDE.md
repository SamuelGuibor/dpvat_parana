# signature/ — motor da assinatura eletrônica própria (ciclo, PDF, OTP, token)

Mapa completo: docs/ai/assinatura.md

**Estado:** DESATIVADO desde 14/09/2026 por flags `CONTRACTS_TAB_ENABLED` (app/nova-dash/page.tsx), `CONTRACT_BLOCK_ENABLED` (app/nova-dash/card-dialog/IntegrationsTab.tsx), `SIGNATURE_CRON_ENABLED` (app/_shared/lib/whatsapp/cron-tasks.ts) + env `SIGNATURE_AUTO_ENABLED`. Páginas públicas e o intercept do bot continuam rodando para ciclos existentes.

## Regras para quem edita aqui
- Não importe `core.ts` estaticamente em `app/_shared/lib/whatsapp/bot.ts`: `core.ts` importa o bot (ciclo de módulos). No bot, só `await import(...)`.
- O token é a única credencial das rotas públicas: nunca ponha CPF/telefone/id em URL, nunca exponha key do S3, nunca aceite id de banco vindo do navegador.
- Nunca carimbe bytes vindos do navegador: o PDF é relido do S3 e conferido com `documentHash` (sha256) antes de `stampSignedPdf`.
- `audit` é append-only e escrito só no servidor.
- Todo modelo do KIT precisa da âncora `<<assinatura_cliente>>` em cada linha do cliente e de tags `[[campo]]`. `stampSignedPdf` NÃO valida a contagem; mudou modelo → atualize `EXPECTED_SIGNATURE_SPOTS` (hoje 8) e rode `npm run sign:pdf`.
- O conteúdo do KIT vem de `doc_templates` (S3) via `listSignatureTemplates`; `templates-assinatura/` é só fallback. Editar o `.docx` no repo não basta: reenvie pela tela Modelos.
- `scripts/add-signature-anchors.mjs` gera a Curitiba com hífen inicial no nome; `BUILTIN_SIGNATURE_TEMPLATES` usa sem hífen — renomeie.
- Envios (OTP, lembrete, reenvio) sempre por `sendSystemWhatsApp` com o `contactId` do ciclo; OTP mantém `transactional: true`. Nunca re-resolver por telefone. Exceção hoje: `createSignatureFromCard` resolve o contato por `findOrCreateContactByPhone` sem linha (pode cair num gêmeo de outra WABA).
- `/verificar/<token>` depende da linha em `signature_requests`: `excluirContrato` ou excluir o contato (cascade) invalida o QR de PDFs já assinados.
- `SIGNATURE_OTP_DEV=true` devolve o código ao navegador: nunca em produção.
- A coleta de dados é do cérebro (micro). Pendência → `failToHuman` + fila. Não crie ciclo novo em `coletando` (legado).
- Cobrança só nas colunas de `SIGN_NAG_ALLOWED_COLUMNS`, lidas de `Label.name` cru (não `findLinkedCard().etapa`).
- `activeCycle` inclui `assinado`: um contrato assinado e não validado bloqueia nova geração.
- `delivery: "atendente"` também envia o link pelo WhatsApp (só `nao_enviado` não envia). Não "corrija" sem alinhar a UI do card.
- Datas impressas e horário comercial: `America/Sao_Paulo`/BRT explícito (Vercel roda em UTC).
- `convertDocx` é sequencial com retry 3x; não paralelize.
- Manifesto: só a própria marca + MP 2.200-2/2001 e Lei 14.063/2020. Nunca invente certificadora nem alegue ICP-Brasil.
- Mudou `tutorial-content.json` → rode `npm run sign:voz`.
- Coluna nova em `SignatureRequest`: nunca `prisma migrate dev`. Use `migrate diff` + `db execute` + `migrate resolve --applied`.

## Validação
- `npx tsc --noEmit` e `npm run lint` (o `next build` local morre por OOM).
- `npm run sign:pdf`: precisa do docx-converter (`DOCX_CONVERTER_URL`); confere âncoras, carimbo e split. O assert `separados.length === 3` está desatualizado (são 4 partes) e derruba o smoke.
- `npm run sign:seed`: ciclo completo SEM WhatsApp, mas grava no banco e no S3 do `.env`. Use com `SIGNATURE_OTP_DEV=true` + `SIGNATURE_BASE_URL=http://localhost:3000` + `npm run dev` e percorra `/assinar/<token>`.
- `npm run sign:templates` e `npm run sign:flow` mexem na Meta/S3 de verdade: só rode se pedirem.
