# Assinatura eletrônica própria — mapa para IA
> Verificado em 2026-09-23 · Escopo: `app/_shared/lib/signature/**`, `app/assinar/[token]/**`, `app/verificar/[token]/**`, `app/api/signature/pdf/[token]/route.ts`, `app/_actions/signature/contracts.ts`, `templates-assinatura/**`, `docs/plano-assinatura-eletronica.md`, `tests/signature-*.smoke.test.ts`, `scripts/add-signature-anchors.mjs`, `scripts/gerar-vozes.mjs`

## TL;DR
- "ZapSign da casa": preenche o KIT (4 `.docx` → **1 PDF**), publica `/assinar/<token>` **sem login**, o cliente assina (dedo ou nome digitado) + **OTP de 6 dígitos no WhatsApp**, o PDF sai carimbado com rodapé + "Relatório de Assinaturas" + QR para `/verificar/<token>`, sobe 1 PDF por documento no card e devolve a conversa pra **fila para validação humana**.
- **ESTADO ATUAL: DESATIVADO desde 14/09/2026** (clientes não entendiam o site; coleta voltou pro WhatsApp). Três flags de código `false`: `CONTRACTS_TAB_ENABLED` (`app/nova-dash/page.tsx`), `CONTRACT_BLOCK_ENABLED` (`app/nova-dash/card-dialog/IntegrationsTab.tsx`), `SIGNATURE_CRON_ENABLED` (`app/_shared/lib/whatsapp/cron-tasks.ts`); o gatilho do bot depende de `SIGNATURE_AUTO_ENABLED=true`. Continuam vivos: páginas públicas, rota do PDF e o intercept em `app/_shared/lib/whatsapp/bot.ts` (roda a cada inbound).
- Duas portas, mesmo motor: **automática** (bot, após `qualify`, com confirmação do resumo pelo cliente) e **manual** (card/inbox, permissão `manage_contracts`). As duas passam por `validateExtraction` e terminam em `issueSignature`.
- O que mais quebra: (1) âncoras `<<assinatura_cliente>>` nos modelos — faltou âncora = página sem assinatura, **sem erro**; (2) o conteúdo do KIT vem de `doc_templates` (S3), não do disco — editar o `.docx` do repo pode não mudar nada; (3) ciclo de import `app/_shared/lib/signature/core.ts` ↔ `app/_shared/lib/whatsapp/bot.ts`; (4) OTP/lembrete dependem da linha do contato (template pausado / número inativo = não envia).

## Onde fica
| Arquivo | Responsabilidade | Símbolos-chave |
|---|---|---|
| `app/_shared/lib/signature/core.ts` | Ciclo inteiro: gatilho do bot, validação, confirmação, geração/entrega, portas manuais, pós-assinatura, cron | `maybeStartSignatureFlow`, `handleSignatureClientReply`, `handleConfirmationReply`, `handleCollectionReply` (legado), `validateExtraction`, `isValidCPF`, `buildDados`, `createSignatureFromCard`, `createSignatureFromContact`, `activeCycle`, `markViewed`, `finalizeSignature`, `requestHumanHelp`, `runSignatureReminders`, `isAutoSignatureEnabled`, `isAutoSignatureActive`, `SIGNATURE_AUTO_PAUSE_KEY`, `CONTRACT_FIELD_KEYS`, `ExtractedFields`, `DeliveryMode`, `ManualSignatureResult` |
| `app/_shared/lib/signature/pdf.ts` | docx→PDF (docx-converter), merge, âncoras (pdfjs), carimbo, manifesto+QR, split por documento | `generateSignaturePdf`, `listSignatureTemplates`, `findAnchors`, `stampSignedPdf`, `buildSignedParts`, `assertSignaturePng`, `sha256`, `SignaturePart`, `EXPECTED_SIGNATURE_SPOTS`, `SIGNATURE_TEMPLATES` |
| `app/_shared/lib/signature/otp.ts` | Código de 6 dígitos (bcrypt, 10 min, 5 tentativas, reenvio 60s) | `sendOtp`, `verifyOtp`, `OTP_DEV` |
| `app/_shared/lib/signature/tokens.ts` | Token do link (32 bytes base64url, 7 dias), URLs públicas, lookup | `newSignatureToken`, `tokenExpiry`, `publicBaseUrl`, `signUrlFor`, `verifyUrlFor`, `loadByToken`, `TokenLookup` |
| `app/_shared/lib/signature/howto-flow.ts` | Fluxo "Como assinar (passo a passo)" (texto+áudio+vídeo) disparado após o link | `SIGNATURE_HOWTO_FLOW_NAME`, `SIGNATURE_HOWTO_MEDIA`, `buildHowtoFlowSteps` |
| `app/_shared/lib/signature/tutorial-content.json` | Texto do tutorial-chat das etapas 1–5 (fonte única da página e da voz) | `etapas` |
| `app/assinar/[token]/page.tsx` | Server page pública; telas amigáveis de vencido/cancelado/não encontrado | default `AssinarPage`, `Aviso` |
| `app/assinar/[token]/SignFlow.tsx` | Client: 5 telas, canvas, retomada em `localStorage` | `SignFlow` |
| `app/assinar/[token]/TutorialChat.tsx` | Tutorial em balões + voz MP3 (fallback `speechSynthesis`) | `TutorialChat`, `ReabrirTutorial`, `etapaDoTutorial`, `useVoz` |
| `app/assinar/[token]/SignTour.tsx` | Tour spotlight — **órfão, nada importa** | `SignTour` |
| `app/assinar/[token]/actions.ts` | Server actions públicas (token = credencial) + trilha | `registrarAbertura`, `registrarPasso`, `enviarCodigo`, `pedirAjuda`, `assinar` |
| `app/verificar/[token]/page.tsx` | Verificação pública (nome/CPF mascarados, hashes, download se assinado) | default `VerificarPage` |
| `app/api/signature/pdf/[token]/route.ts` | Stream do PDF (assinado se houver, senão o limpo); `?download=1` | `GET` |
| `app/_actions/signature/contracts.ts` | Ações da equipe (aba Contratos + card) | `gerarContratoDoCard`, `gerarContratoDoContato`, `listarContratos`, `detalharContrato`, `resolverCardDoContrato`, `validarContrato`, `cancelarContrato`, `reenviarLink`, `resumirProblemasContratos`, `excluirContrato`, `getAutomacaoAssinatura`, `setAutomacaoAssinaturaPausada` |
| `templates-assinatura/` | 4 `.docx` com âncoras (fallback em disco; fonte real = `doc_templates`) | KIT, Curitiba, Taynara, Hipossuficiência |
| `scripts/add-signature-anchors.mjs` | Gera variantes `*_ASSINATURA.docx` a partir de `templates/` e confere nº de âncoras | `EXPECTED`, `TEMPLATES` |
| `scripts/gerar-vozes.mjs` | TTS Gemini → `public/assinatura/voz/passo-N.mp3` (ffmpeg) | `npm run sign:voz` |
| `docs/plano-assinatura-eletronica.md` | Plano original — **desatualizado** em nº de arquivos/âncoras (fala 3 arquivos, 3+2+3) e em "presigned URL" (a rota faz stream) | — |

## Fluxo principal
**Porta automática (bot)**
1. `app/_shared/lib/whatsapp/bot.ts`, `case "qualify"` → `signature.maybeStartSignatureFlow` (import dinâmico). Devolve `"queue"` (bot chama `qualifyToQueue`) se `isAutoSignatureActive()` falso, `CHATBOT_URL`/`CHATBOT_SECRET` vazios, card fora das colunas de cobrança, ou `activeCycle` existente.
2. `callExtract` → POST `${CHATBOT_URL}/extract-contract-data` (header `x-bot-secret`; últimas 40 msgs + `botMemory` + até 6 imagens/PDFs do cliente por presigned de 10 min; timeout 90s).
3. `validateExtraction` (UF sigla→extenso, `checkAndEnrichCep` no ViaCEP, `MIN_CONFIDENCE` por campo, `isValidCPF`, formato CEP). Pendência → `failToHuman` (status `extracao_falhou`, nota interna, sino) → fila.
4. Tudo ok → cria `SignatureRequest` `status:"confirmando"`, `origin:"bot"` → `sendSummaryOrCepQuestion` manda o resumo **ou** a pergunta "1 ou 2" se `detectCepMismatch` achar rua ≠ rua do CEP.
5. Próximas mensagens: o bot chama `handleSignatureClientReply` **antes do cérebro** → `handleConfirmationReply` → `handleCepChoiceReply` (se divergência) ou POST `/confirm-contract-data` → `confirmado | corrigir | atendente | nao_entendi` (`CONFIRM_MAX_ROUNDS` = 2, depois `failToHuman` + fila).
6. `confirmado` → `issueSignature(delivery:"bot")` → `qualifyToQueue` e zera `queuedAt/queueAlertAt` (quem dita o ritmo são os lembretes).

**Porta manual (equipe)**: `IntegrationsTab` → `gerarContratoDoCard` → `createSignatureFromCard` (dados do card via `fieldsFromRecord`; nacionalidade default "brasileiro(a)") · `gerarContratoDoContato` → `createSignatureFromContact` (card vinculado > `clientDraft`; sem UI chamando hoje) → `createSignatureForContact` (bloqueia com `activeCycle`, cria `status:"aguardando"`) → `issueSignature`.

**`issueSignature`**: grava `aguardando` + `extracted` ANTES de gerar (órfão é limpo pelo cron) → `generateSignaturePdf(buildDados(...))` → S3 `whatsapp/<contactId>/contrato-kit-<ts>.pdf` → grava `pdfKey`, `documentHash`, `parts`, `sentAt`, `deliveredBy`, `nextReminderAt` (+24h; null se `nao_enviado`) → copia campos pro `WhatsAppContact.clientDraft` → se `delivery !== "nao_enviado"`: `ensureCardForContact` (cria card `User` na coluna `order 0`) + 2 mensagens (texto + link) + `runFlowForContact(SIGNATURE_HOWTO_FLOW_NAME)` → nota interna + log `wa_signature`.

**Cliente na página**
7. `/assinar/<token>` → `loadByToken` → `SignFlow`: 1 boas-vindas (vídeo `public/assinatura/como-assinar.mp4`) · 2 documentos (iframe `/api/signature/pdf/<token>`) · 3 assinatura (canvas ou nome → PNG) · 4 código (`enviarCodigo` dispara ao entrar) · 5 assinado.
8. `assinar` (action): `guard` → `verifyOtp` → `assertSignaturePng` → baixa `pdfKey` do S3 e exige `sha256 === documentHash` → sobe PNG → `stampSignedPdf` → S3 `contrato-assinado-*.pdf` → `buildSignedParts` (best-effort; `parts[i].signedKey`) → `status:"assinado"` → `pushAudit("assinou")` → `finalizeSignature` em `Promise.race` com 12s.
9. `finalizeSignature`: `Document` por parte no card (ou `draftDocuments` do contato sem card) → conversa `queued` + `qualified:true` (se `human` com dono, só `qualified`) → nota com checklist dos 12 campos → sino → agradecimento. Equipe fecha com `validarContrato` (`assinado`→`validado`).

**Cron** (`app/_shared/lib/whatsapp/cron-tasks.ts`, `runSlaPhase` → `runSignatureReminders`, hoje desligado): órfão `aguardando` sem `pdfKey` 15 min → `erro`; `coletando/confirmando` parado 12h → `confirmacao_expirada` + fila; `expiresAt` vencido → `expirado`; lembretes 3x a cada 24h, 7h–21h BRT, template `lembrete_assinatura`; esgotou → fila + sino.

## Dados
- **`SignatureRequest`** (`@@map("signature_requests")`), FK `contactId` → `WhatsAppContact` com `onDelete: Cascade`. Índices `[status, nextReminderAt]`, `[contactId, createdAt]`.
- **`status`** (string livre): `coletando` (LEGADO), `confirmando`, `extracao_falhou`, `confirmacao_expirada`, `aguardando`, `visualizado`, `assinado`, `validado`, `expirado`, `erro`, `cancelado`; `recusado` só é lido (nenhum código grava). `activeCycle` = `coletando|confirmando|aguardando|visualizado|assinado` — **inclui `assinado`**.
- `token` `@unique`: é o link, o sufixo do botão do template e o QR de `/verificar` (mesmo token). `expiresAt` = +7 dias; `loadByToken` ignora vencimento de ciclo já assinado/validado.
- `origin`: `bot | manual_card | manual_inbox` (schema cita `manual_offline`, código não grava). `deliveredBy`: `bot | atendente | nao_enviado`.
- `extracted`: `Record<ContractFieldKey, {value, confidence 0..1, source: documento|conversa|inferido|ausente}>` + chave extra `_ruaConfirmadaPeloCliente` (fora de `CONTRACT_FIELD_KEYS`, inerte em `buildDados`, sem migration). `source:"inferido"` = veio do ViaCEP.
- `CONTRACT_FIELD_KEYS` (12): `name, nacionalidade, estado_civil, profissao, rg, cpf, rua, numero, bairro, cep, cidade, estado`; `buildDados` acrescenta `data` (dd/mm/aaaa BRT). São as tags `[[campo]]` dos `.docx`.
- `missingFields`: `MissingField[]` `{key, label, reason}` (key pode ser `"confirmacao"`). `error`: motivo curto exibido na aba Contratos.
- `parts`: `SignaturePart[]` `{slug, label, fileName, pageStart, pageCount, signedKey?}` — fronteiras no PDF único; slugs builtin `kit`, `proc-curitiba`, `proc-taynara`, `decl-hipossuficiencia`; custom = `customSignatureSlug`.
- `audit`: `AuditEvent[]` `{at, passo, detalhe?, ip?, ua?}`, append-only, capado em 60 (`slice(-60)`). Passos: `abriu_o_link`, `codigo_enviado`, `pediu_ajuda`, `codigo_bloqueado`, `assinou`, `retomou`, `tutorial_entendi|fechou|ouviu`, `assinatura_desenho|digitado`, `concluiu`…
- `confirmRounds`: rodadas da **sub-etapa atual** (zera ao escolher a rua do CEP e ao sair da coleta legada). `otpAttempts`: **nunca zera** (nem no reenvio) — 5 erros travam o ciclo. `remindersSent` ≤ 3.
- Outros: `app_settings.signature_auto_paused` (`"true"` = pausado); `DocTemplate` `kind:"assinatura"` (`sortOrder` = ordem no PDF, `hidden`, `s3Key`); `WhatsAppContact.clientDraft`/`draftDocuments`; `Document.category` via `inferCategory`; `WhatsAppFlow` com nome `SIGNATURE_HOWTO_FLOW_NAME`; log `action:"wa_signature"` com `metadata.stage`.
- S3: `whatsapp/<contactId>/{contrato-kit,contrato-assinado,assinado-<slug>}-<ts>.pdf`, `assinatura-<ts>.png`; mídias do fluxo nas keys S3 `whatsapp/flows/assinatura-como-assinar-{audio,video}.mp4` (prefixo `whatsapp/flows/` é obrigatório).
- Templates Meta: `codigo_assinatura` (AUTHENTICATION, botão copiar = 1ª var) e `lembrete_assinatura` (UTILITY, botão URL `<base>/assinar/{{1}}`).
- Env: `SIGNATURE_AUTO_ENABLED`, `SIGNATURE_OTP_DEV`, `SIGNATURE_BASE_URL` (senão `NEXTAUTH_URL`), `CHATBOT_URL`, `CHATBOT_SECRET`, `DOCX_CONVERTER_URL`, `CONVERTER_API_KEY`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`; script de voz: `GOOGLE_API_KEY` (lido do `.env`), `SIGN_VOZ_MODELO`, `SIGN_VOZ_NOME`, `SIGN_VOZ_ESTILO`.

## Regras invioláveis e armadilhas
- **Reativar = 3 flags + env + deploy.** `SIGNATURE_AUTO_ENABLED` é a chave-mestra do gatilho; `signature_auto_paused` só barra gatilhos NOVOS (ciclo em curso e botão manual seguem). Sem o cron, nada expira no banco nem recebe lembrete.
- **Nunca import estático de `app/_shared/lib/signature/core.ts` em `app/_shared/lib/whatsapp/bot.ts`** — o core importa o bot (`sendBotReply`, `postInternalNote`, `qualifyToQueue`, `findLinkedCard`); ciclo de módulos. Use `await import(...)`.
- **Token é a única credencial** das rotas públicas: nada de CPF/telefone/id na URL; actions de `app/assinar` nunca aceitam id de banco do navegador; key do S3 nunca vai pro cliente (a rota faz stream). Toda action pública passa por `guard` (`rateLimit` em memória por lambda + `loadByToken`).
- `middleware.ts` precisa manter `/assinar` e `/verificar` em `PUBLIC_PAGE_PREFIXES`, `/assinar` em `PUBLIC_ACTION_PAGES` e `/api/signature/pdf` em `PUBLIC_GET_API_PREFIXES` — senão o cliente cai no login.
- **Nunca carimbar bytes vindos do navegador**: `assinar` relê o PDF do S3 e compara `sha256` com `documentHash`. Trilha só é escrita no servidor (`pushAudit`), nunca sobrescrita.
- **Âncoras**: todo modelo do KIT precisa de `<<assinatura_cliente>>` (run branco 6pt) em cada linha do cliente e tags com delimitador `[[ ]]`. `stampSignedPdf` não confere a contagem; `EXPECTED_SIGNATURE_SPOTS = 8` (2 KIT + 2 Curitiba + 3 Taynara + 1 hipossuficiência) só é checado em `sign:pdf` e no script. `findAnchors` precisa de uma régua `_____` na linha ou até 40pt acima pra centralizar.
- **Fonte do KIT é o banco**: `listSignatureTemplates` → `listVisibleDocTemplates("assinatura")` → `loadDocTemplateBuffer` (S3 se `s3Key`; disco só p/ não migrado). Ocultar/enviar modelo na tela Modelos muda o que o cliente assina; grupo vazio faz `listSignatureTemplates` lançar.
- `scripts/add-signature-anchors.mjs` grava a Curitiba como `-PROCURAÇÃO-ESPECÍFICA_CURITIBA_ASSINATURA.docx` (hífen inicial), mas `BUILTIN_SIGNATURE_TEMPLATES` e o disco usam **sem** hífen — renomear após rodar (a Taynara mantém o hífen nos dois lados). O script também reescreve o KIT in place (`[[name]]` sob as linhas). Depois, reenviar o `.docx` pela tela Modelos, senão o S3 segue com o antigo.
- **Envio pela linha do contato**: OTP, lembrete e reenvio usam `sendSystemWhatsApp` com `contactId` do ciclo — nunca re-resolver por telefone (há 2 contatos por telefone, um por WABA). OTP é `transactional: true` (pula o cooldown anti-spam de 6h). `templatesPaused` no número bloqueia `sendTemplate` e número inativo não envia → OTP fora da janela falha e vira nota interna.
- **Exceção multi-número na porta do card**: `createSignatureFromCard` acha o contato por `findOrCreateContactByPhone(phone, name)` **sem** `wantedNumberId` → pega o primeiro gêmeo com `numberId` (pode ser a linha 2323, somente leitura). O ciclo inteiro (link, OTP, lembretes) passa a sair por essa linha. Revisar antes de reativar.
- **`SIGNATURE_OTP_DEV=true` devolve o código ao navegador** — nunca em produção.
- **Coleta de dados é do cérebro (micro)**, não do código: pendência na validação final → `failToHuman` + fila. `coletando`/`handleCollectionReply`/`askMissingMessage` são LEGADO — não criar ciclo novo nesse status.
- Endereço: `checkAndEnrichCep` só preenche campo vazio/fraco; divergência de rua é `detectCepMismatch` (pergunta 1/2 antes do resumo). `_ruaConfirmadaPeloCliente` evita loop e é apagada quando o cliente corrige `rua`/`cep`. Portas manuais não perguntam (o atendente confere). ViaCEP fora do ar nunca trava (`lookupCep` → null; cache 10 min).
- Cobrança (gatilho + lembretes) só com card nas colunas `SIGN_NAG_ALLOWED_COLUMNS` ("COLHER ASSINATURA", "FILTRO DE CARTOES", comparadas por `normalizeColumnName`; no banco são "COLHER-ASSINATURA" e "Filtro de Cartões"). Usar `Label.name` cru (`contactCardColumn`), **não** `findLinkedCard().etapa`. Sem card = permitido. `reenviarLink` ignora o filtro de propósito.
- `activeCycle` inclui `assinado`: contrato assinado e não validado bloqueia nova geração, e `cancelarContrato` recusa assinado → validar ou `excluirContrato` (motivo obrigatório se assinado/validado; apaga só a linha, PDFs ficam no S3).
- **Apagar a linha mata o QR**: `/verificar/<token>` busca `SignatureRequest` pelo token — depois de `excluirContrato`, ou de excluir o contato (`deleteWhatsAppContact`, FK com `onDelete: Cascade`), o QR impresso num PDF assinado passa a mostrar "Documento não encontrado".
- `finalizeSignature` **não move o card** (chamada a `moveCardToLabelByName`/`PROTOCOLO_HOSPITAL_LABEL` está comentada) e não rouba ticket: conversa `human` com dono só ganha `qualified:true`. Já `requestHumanHelp` (ajuda/OTP bloqueado/falha no `assinar`) e o fim dos lembretes forçam `queued` + `assignedToId: null` (tiram o dono).
- `delivery:"atendente"` **também manda o link pelo WhatsApp**: `issueSignature` só testa `!== "nao_enviado"` (a UI diz "copie e mande do seu jeito"). Só `deliveredBy` e a nota mudam.
- `assinar` solta a tela após 12s de `finalizeSignature`; na Vercel o resto não tem garantia de terminar (sem `waitUntil`) — anexos/fila podem ficar pela metade (não verificado em produção). O teto da action é o `maxDuration = 60` de `app/assinar/[token]/page.tsx` (reler S3 + carimbo + split + uploads + 12s cabem nele; não aumentar o trabalho síncrono sem rever).
- Datas impressas e horário comercial usam `America/Sao_Paulo`/offset BRT explícito — a Vercel roda em UTC.
- `convertDocx` é sequencial com 3 tentativas (4xx não repete) — não paralelizar (o LibreOffice do docx-converter soluça com rajada).
- Manifesto/selo: só a própria marca citando MP 2.200-2/2001 e Lei 14.063/2020 — nunca inventar certificadora nem alegar ICP-Brasil.
- Coluna nova em `SignatureRequest`: nunca `prisma migrate dev` (drift no Neon → propõe reset); usar `migrate diff` + `db execute` + `migrate resolve --applied`.
- Editou `app/_shared/lib/signature/tutorial-content.json` → rodar `npm run sign:voz`, senão o MP3 fala o texto antigo.
- Retomada em `SignFlow` nunca passa da etapa 3 e nunca guarda assinatura/código (prova de vontade tem que ser feita na hora).
- Links `wa.me` hardcoded em `Aviso` (`app/assinar/[token]/page.tsx`) e em `app/assinar/[token]/SignFlow.tsx` apontam para a linha 2323, desativada em 18/09 — revisar antes de reativar.
- `lembrete_assinatura` grava a base URL na Meta na criação — trocar de domínio exige recriar o template (`sign:templates` recusa `localhost`).

## Receitas
- **Reativar o domínio** → `CONTRACTS_TAB_ENABLED`, `CONTRACT_BLOCK_ENABLED`, `SIGNATURE_CRON_ENABLED` = `true`; automático: env `SIGNATURE_AUTO_ENABLED=true` na Vercel · cuidado: wa.me da 2323, contato resolvido por telefone na porta do card, `templatesPaused`, endpoints do micro no ar · valide: `npm run sign:seed` + caminho completo no navegador.
- **Novo campo no contrato** → `CONTRACT_FIELD_KEYS`, `FIELD_LABELS`, `MIN_CONFIDENCE`, `fieldsFromRecord`, `summaryMessage` (`app/_shared/lib/signature/core.ts`) + tag `[[campo]]` nos modelos + extrator do micro · cuidado: `Record<ContractFieldKey,…>` obriga preencher todos os mapas · valide: `npx tsc --noEmit` + `npm run sign:pdf`.
- **Trocar/adicionar documento do KIT** → tela Modelos (grupo assinatura) ou `BUILTIN_SIGNATURE_TEMPLATES` (`app/_shared/lib/doc-templates.ts`) + `EXPECTED` do script + `EXPECTED_SIGNATURE_SPOTS` · cuidado: âncoras e nome sem hífen · valide: `sign:pdf` (conta âncoras e régua).
- **Carimbo/rodapé/manifesto** → `stampSignedPdf`, `drawFooter`, `appendManifest`, `drawBrandSeal`, `buildSignedParts` (`app/_shared/lib/signature/pdf.ts`) · valide: `sign:pdf` e abrir o `-assinado.pdf` impresso no console.
- **Texto/telas da página** → `app/assinar/[token]/SignFlow.tsx` + `app/_shared/lib/signature/tutorial-content.json` (+ `sign:voz`) · cuidado: 1 decisão por tela, botões grandes, público que lê mal; `PASSO_A_PASSO` · valide: `npm run dev` + `sign:seed` com `SIGNATURE_OTP_DEV=true`.
- **Regras de lembrete/expiração** → `runSignatureReminders`, `SIGN_REMINDER_MAX/GAP_MS/RETRY_MS`, `REMINDER_TEXTS`, `nextBusinessSlot`, `SIGN_NAG_ALLOWED_COLUMNS` · cuidado: `maxReminders: 3` duplicado no `signatureContext` de `app/_shared/lib/whatsapp/bot.ts`.
- **Validação de endereço/CPF** → `validateExtraction`, `checkAndEnrichCep`, `detectCepMismatch`, `sameStreet`, `normStreet`, `parseCepChoice`, `isValidCPF` (mesmo algoritmo do micro) · cuidado: `parseCepChoice` é conservador de propósito.
- **Nova ação da equipe sobre um ciclo** → `app/_actions/signature/contracts.ts` com `requirePermission("manage_contracts")` + `createLog`/`logWhatsAppEvent` + `revalidatePath("/nova-dash")` · UI em `app/nova-dash/contratos/ContractsPanel.tsx`.
- **OTP** → `app/_shared/lib/signature/otp.ts` (`OTP_TTL_MS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_MS`, `OTP_TEMPLATE`) · cuidado: manter `transactional: true` e `contactId`.
- **Comportamento do bot com contrato na rua** → `app/_shared/lib/whatsapp/bot.ts` (intercept `handleSignatureClientReply`, trava "já assinei" → `handoffToQueue`, `signatureContext` no payload) + bloco "ASSINATURA EM ANDAMENTO" no micro (fora deste repo).

## Testes e validação
- Não há teste unitário do domínio; `npm test` pula os 4 smoke (`describe.skipIf`), que só rodam pelo script npm (ou `SIGNATURE_SMOKE/SEED/TEMPLATES/FLOW_SEED=1`).
- `npm run sign:pdf` (`tests/signature-pdf.smoke.test.ts`): precisa do docx-converter; confere 8 âncoras com régua, carimbo em 8 e split por parte; grava PDFs no temp. Assume os 4 builtins visíveis (`SIGNATURE_TEMPLATES.length`). **Assert desatualizado**: `expect(separados.length).toBe(3)` — com 4 partes o smoke falha nesse ponto (depois de gerar/carimbar); corrigir para `parts.length` antes de confiar no verde.
- `npm run sign:seed` (`tests/signature-seed.smoke.test.ts`): **escreve no banco e S3 do `.env`**; contato "ZZ TESTE — assinatura", cancela o ciclo anterior, `delivery:"nao_enviado"`, imprime o link. `SEED_PHONE` no formato wa_id.
- `npm run sign:templates`: cria os 2 templates **na Meta de verdade** por WABA (idempotente). `npm run sign:flow`: sobe mídias pro S3 e faz upsert do `WhatsAppFlow`.
- Manual local: `.env` com `SIGNATURE_OTP_DEV=true` e `SIGNATURE_BASE_URL=http://localhost:3000` → `npm run dev` → `sign:seed` → abrir link → assinar (código aparece na tela) → conferir `/verificar/<token>` e o PDF baixado.
- CI (`.github/workflows/ci.yml`): `npx tsc --noEmit`, `npm run lint`, `npm test`. `next build` local morre por OOM — validar com tsc + lint.

## Fronteiras
- **Bot WhatsApp** — `app/_shared/lib/whatsapp/bot.ts`: `signUrlFor`; import dinâmico de `handleSignatureClientReply`, `activeCycle`, `maybeStartSignatureFlow`; fornece `sendBotReply`, `postInternalNote`, `qualifyToQueue`, `findLinkedCard`; `SYSTEM_SOURCE_LABELS` rotula `signature_otp/reminder/resend`.
- **Envio** — `app/_shared/lib/whatsapp/outbound.ts` (`sendSystemWhatsApp`, `findOrCreateContactByPhone`); `app/_shared/lib/whatsapp/client.ts` (`sendTemplate` com `buttonVar`, `createMetaTemplate`).
- **Cron** — `app/_shared/lib/whatsapp/cron-tasks.ts` (`runSlaPhase` → `runSignatureReminders`). **Fluxos** — `app/_shared/lib/whatsapp/flow-runner.ts` (`runFlowForContact`). **Sino** — `whatsappRecipients` (`app/_shared/lib/whatsapp/service.ts`).
- **Modelos .docx** — `app/_shared/lib/doc-templates.ts`, `app/_shared/utils/gerarProcuracao.ts`, `app/_actions/templates/doc-templates.ts`; `app/api/procuracao/templates/route.ts` lista só `kind:"procuracao"` (as variantes do KIT nunca aparecem no "Gerar Procuração"); `deleteDocTemplate` impede excluir o último modelo ativo do grupo assinatura.
- **Kanban** — `ensureCardForContact` cria card `User` (coluna `order 0`, `card_number_seq`); `runAutomations` só via `moveCardToLabelByName` (hoje sem chamada); `inferCategory` (`app/_shared/lib/document-categories.ts`).
- **Permissões/logs** — `requirePermission`/`getSessionPermissions` (`app/_shared/lib/permissions-server.ts`), chave `manage_contracts` (`app/_shared/lib/permissions.ts`); `logWhatsAppEvent`/`createLog` (`app/_shared/lib/log.ts`).
- **UI da equipe** — `app/nova-dash/contratos/ContractsPanel.tsx`, `app/nova-dash/card-dialog/IntegrationsTab.tsx`. **Middleware** — `middleware.ts`.
- **Externos** — microserviço do bot (`/extract-contract-data`, `/confirm-contract-data`), docx-converter (`/convert`), ViaCEP, Meta Cloud API, S3.
