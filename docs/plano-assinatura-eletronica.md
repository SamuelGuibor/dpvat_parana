# Plano de ação — Assinatura eletrônica própria ("ZapSign da casa")

> Objetivo: depois da triagem, o bot fecha os dados com o cliente, gera o
> **_KIT_PREV_CSS.docx** preenchido, publica uma página de assinatura no nosso
> próprio site, manda o link pelo WhatsApp, guia o cliente (inclusive quem não
> lê bem) até assinar, arquiva a procuração assinada no card e devolve a
> conversa pra fila para VALIDAÇÃO humana — tudo sem depender da ZapSign.

## Status (19/08/2026)

**Atualização 19/08:** o pacote de assinatura agora tem **3 arquivos** (KIT +
`-PROCURAÇÃO-ESPECÍFICA_CURITIBA` + `-PROCURAÇÃO-ESPECÍFICA-TAYNARA`) fundidos
em UM PDF com **8 linhas de assinatura** (3+2+3). As variantes `*_ASSINATURA.docx`
são geradas por `scripts/add-signature-anchors.mjs` (rode de novo se os
templates originais mudarem). O carimbo ganhou o bloco cinza de autenticação ao
lado da assinatura + nome em negrito embaixo da linha (o `[[name]]` foi
inserido no próprio KIT), todas as páginas ganharam rodapé de autenticação, e o
manifesto virou o "Relatório de Assinaturas" com logo, status e cartão do
signatário (estilo ZapSign). O `convertDocx` tem retry 3x (o LibreOffice do
docx-converter dá 500 esporádico).

| Fase | Situação |
|---|---|
| 1. Fundação (model + migration + tokens + core) | ✅ feita — tabela `signature_requests` já criada no Neon |
| 2. PDF (preencher, converter, carimbar, manifesto, QR) | ✅ feita — validada por smoke test |
| 3. Página `/assinar` + `/verificar` + rota do PDF + middleware | ✅ feita — testada ponta a ponta no navegador |
| 4. Manual (botão no card) | ✅ feita — aba Integrações do card, 3 formas de entrega; falta só o atalho no inbox |
| 5. Bot (gatilho + bloco no cérebro + endpoints da IA) | ✅ feita 20/08 — endpoints portados do engavetado pro micro (testados ao vivo), gatilho no qualify, intercept da confirmação, trava "já assinei" e bloco ASSINATURA EM ANDAMENTO; liga com SIGNATURE_AUTO_ENABLED=true + deploy do micro |
| 6. Pós-assinatura (card, fila, validar) | ✅ feita no `core.ts` (`finalizeSignature`) |
| 7. Aba Contratos | ✅ feita — lista por urgência, filtros, painel do cliente com histórico e trilha, validar/cancelar/reenviar |
| 8. Cron | ✅ feita — plugado na fase SLA (`/api/whatsapp/cron/sla`, 15min, sem IA) |
| 9. Testes + piloto | 🟡 2 smoke tests criados; piloto pendente |

**Como testar local:** ver seção 10.

---

## 0. O que já existe (não vamos reinventar)

| Peça | Onde | Estado |
|---|---|---|
| Template do KIT (procuração + contrato + declaração) | `templates/_KIT_PREV_CSS.docx` | pronto — 13 placeholders `[[...]]` |
| Preenchimento do docx | `app/_shared/utils/gerarProcuracao.ts` (docxtemplater, delimitadores `[[ ]]`) | pronto |
| DOCX → PDF | microserviço `D:\docx-converter` (`POST /convert`, LibreOffice) | pronto, em produção |
| Fluxo completo de assinatura (extração, validação, confirmação, lembretes, pós-assinatura) | `D:\dpvat_parana\_shelved_zapsign\crm\signature.ts` (1173 linhas) + commit `5d627e0` | **engavetado — 90% reaproveitável** |
| Endpoints de IA `/extract-contract-data` e `/confirm-contract-data` | `_shelved_zapsign\microservico\{bot.js,index.js}` | engavetados, precisam voltar pro `D:\Chatbot_whatsapp` |
| Modelo `WhatsAppSignatureRequest` + migration | commit `5d627e0` (`prisma/schema.prisma`) | engavetado |
| S3 + `Document` no card | `automation-executor.ts:334-350`, `client-documents.ts`, `client-info.ts:353` | pronto |
| Página pública sem login | `middleware.ts` (`PUBLIC_PAGE_PREFIXES` / `PUBLIC_ACTION_PAGES`) | é só adicionar o prefixo |
| `pdf-lib`, `pdfkit`, `jsonwebtoken` | `package.json` | já instalados |

**A única coisa que a ZapSign fazia e nós não temos:** a página de assinatura, a
verificação de identidade, a estampa da assinatura no PDF e a trilha de
auditoria. É exatamente o escopo novo deste plano.

---

## 1. Arquitetura da solução

```
QUALIFICAÇÃO (bot)
   └─> extrai dados do KIT (IA + visão sobre RG/CNH)   ← microserviço
   └─> valida em código (CPF, ViaCEP, confiança)
   └─> resumo no WhatsApp: "confere se está certo?"    ← handleConfirmationReply
        ├─ cliente corrige → revalida → reenvia resumo
        └─ cliente confirma "SIM"
             └─> gera KIT .docx → PDF (docx-converter) → S3
             └─> cria SignatureRequest + TOKEN público
             └─> manda o link + explicação no WhatsApp
                     │
        ┌────────────▼──────────────────────────────────┐
        │  segurosparana.com.br/assinar/<token>          │  ← PÁGINA NOVA
        │  1. boas-vindas + áudio                        │
        │  2. o que você vai assinar (3 cards)           │
        │  3. ler o documento (PDF embutido)             │
        │  4. desenhar/digitar a assinatura              │
        │  5. código de 6 dígitos no WhatsApp (OTP)      │
        │  6. pronto! ✅                                  │
        └────────────┬──────────────────────────────────┘
                     │
   └─> carimba assinatura nas 3 linhas + página de MANIFESTO (pdf-lib)
   └─> PDF assinado no S3 + `Document` no card (ou draftDocuments)
   └─> WhatsApp: "obrigado! agora um atendente continua com você"
   └─> conversa → FILA com tag "Validar contrato" + nota com o checklist
```

### 1.1 Onde cada arquivo vai morar

```
app/_shared/lib/signature/
  ├── core.ts          ← ex-signature.ts (extração, validação, confirmação, lembretes)
  ├── pdf.ts           ← NOVO: monta PDF, carimba assinatura, manifesto, hash
  ├── otp.ts           ← NOVO: gera/valida código de 6 dígitos por WhatsApp
  └── tokens.ts        ← NOVO: token público do link (assinar/verificar)
app/assinar/[token]/
  ├── page.tsx         ← server: valida token, carrega estado
  ├── SignFlow.tsx     ← client: wizard de 6 passos
  ├── SignaturePad.tsx ← canvas de desenho + modo "digitar nome"
  └── actions.ts       ← server actions: enviarCodigo, assinar, pedirAjuda
app/verificar/[token]/page.tsx           ← página pública de validação (hash + status)
app/api/signature/pdf/[token]/route.ts   ← stream do PDF (pré e pós assinatura)
prisma/schema.prisma                     ← model SignatureRequest
```

### 1.2 Modelo de dados

Base = o `WhatsAppSignatureRequest` do commit `5d627e0`, trocando os campos da
ZapSign por campos nossos:

```prisma
model SignatureRequest {
  id            String    @id @default(cuid())
  contactId     String
  // extracao_falhou | confirmando | aguardando | visualizado | assinado |
  // validado | recusado | expirado | erro
  status        String    @default("aguardando")

  // --- link público -------------------------------------------------------
  token         String    @unique          // 32 bytes base64url usados em /assinar/<token>
  expiresAt     DateTime                   // 7 dias
  // --- documento ----------------------------------------------------------
  extracted     Json?                      // campos + confidence + source (auditoria)
  missingFields Json?
  pdfKey        String?                    // PDF sem assinatura (S3)
  signedPdfKey  String?                    // PDF assinado + manifesto (S3)
  documentHash  String?                    // SHA-256 do PDF original (hex)
  signedHash    String?                    // SHA-256 do PDF assinado
  // --- identidade / prova -------------------------------------------------
  otpHash       String?                    // bcrypt do código de 6 dígitos
  otpExpiresAt  DateTime?
  otpAttempts   Int       @default(0)      // trava em 5
  otpSentAt     DateTime?
  signatureKey  String?                    // PNG da assinatura desenhada (S3)
  signatureMode String?                    // "desenho" | "digitado"
  audit         Json?                      // ver 1.3
  // --- ciclo --------------------------------------------------------------
  confirmRounds Int       @default(0)
  remindersSent Int       @default(0)
  nextReminderAt DateTime?
  sentAt        DateTime?
  viewedAt      DateTime?
  signedAt      DateTime?
  validatedAt   DateTime?
  validatedById String?
  refusedReason String?
  error         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  contact       WhatsAppContact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([status, nextReminderAt])
  @@index([contactId, createdAt])
  @@map("signature_requests")
}
```

Migration pelo caminho seguro do projeto (drift do Neon): `migrate diff` +
`db execute` + `migrate resolve` — nunca `migrate dev`.

### 1.3 Trilha de auditoria (`audit` Json) — é isto que dá valor jurídico

Assinatura eletrônica **simples** (MP 2.200-2/2001, art. 10 §2º + Lei
14.063/2020): vale entre as partes desde que haja consentimento e meios de
comprovar a autoria. Registramos, com timestamp UTC + BRT:

- `openedAt`, IP, `user-agent`, idioma, resolução da tela;
- aceite explícito do termo ("li e concordo"), guardando o texto exato exibido;
- telefone verificado por OTP (`otpVerifiedAt`) — prova de posse do celular;
- CPF informado na conversa e conferido pelo dígito verificador;
- `documentHash` (SHA-256 do PDF exibido) — prova de que o assinado é o lido;
- geolocalização aproximada por IP (só se o cliente permitir);
- horário de cada passo do wizard (mostra que a pessoa passou pelo documento);
- eventos espelhados no `Log` (`action: "signature"`), como o resto do sistema.

Tudo isso vai impresso na **página de manifesto** anexada ao PDF, com QR code
apontando para `/verificar/<token>`.

---

## 2. A página de assinatura (o coração do pedido)

Princípio: **uma decisão por tela, letra grande, voz em tudo, nada de jurídico
sem tradução.** O público inclui gente que mal lê.

### Passo 1 — Boas-vindas
> "Olá, **Maria**! 👋 Preparamos seus documentos. São **3 folhas** e leva
> **2 minutinhos**. Pode ir com calma."
- Botão gigante **▶ Ouvir explicação** (Web Speech API, voz pt-BR; upgrade
  futuro: MP3 gravado pela equipe, que soa melhor).
- Barra de progresso com 5 bolinhas.

### Passo 2 — O que você vai assinar
Três cards ilustrados, cada um com uma frase e um ícone:

| | Documento | Em português claro |
|---|---|---|
| 📄 | Procuração | "Autoriza o advogado a falar por você na Justiça." |
| 🤝 | Contrato | "Combina o serviço e quanto o advogado recebe **só se você ganhar**." |
| 📋 | Declaração | "Declara que você não tem condições de pagar as custas do processo." |

- Cada card abre um "saiba mais" com 3 bullets. Nada de parágrafo de lei.

### Passo 3 — Ler o documento
- PDF embutido (`<iframe>` do `/api/signature/pdf/<token>`), com botão
  **⬇ Baixar** e **🔍 Aumentar letra**.
- Checkbox grande: **"Eu li ou pedi para alguém ler pra mim"** — liberado após
  15s de rolagem, mas nunca bloqueia quem não consegue ler.

### Passo 4 — Sua assinatura
Três formas, escolha visual:
1. **✍️ Desenhar com o dedo** — canvas grande, botão "apagar e tentar de novo".
2. **⌨️ Digitar meu nome** — vira assinatura em fonte cursiva (preview em tempo real).
3. **🙋 Não consigo / quero ajuda** — não é erro: manda a conversa pro atendente
   com nota "cliente pediu ajuda na assinatura" e mostra "Já já alguém te chama
   no WhatsApp 😊".

Abaixo: nome completo, CPF e data preenchidos (só leitura) — "confere se é você".

### Passo 5 — Confirmação por código
> "Mandamos um código de 6 números no seu WhatsApp. Digite aqui."
- 6 caixinhas grandes, teclado numérico no celular, botão "reenviar" (60s).
- 5 tentativas erradas → bloqueia e joga pro atendente.
- Termo de aceite acima do botão: **"Ao confirmar, você assina os 3 documentos
  eletronicamente."**

### Passo 6 — Pronto
- Animação de check ✅, "Assinatura registrada às 14:32 de 18/08/2026".
- Botões: **Baixar meus documentos** / **Voltar ao WhatsApp** (deep link `wa.me`).
- Texto: "Guardamos uma cópia com código de verificação. Qualquer dúvida, é só
  chamar no WhatsApp."

### Regras de UX transversais
- Mobile-first (quase todo mundo abre no celular), fonte base 18px, alvos de
  toque ≥48px.
- Contraste AA, sem login, sem app, sem JS pesado.
- Estado salvo a cada passo (`audit`) — caiu a internet, volta de onde parou.
- Link expira em 7 dias; expirado mostra tela amigável + botão "quero um novo
  link" (dispara nota interna, não gera link sozinho).

---

## 3. Geração e carimbo do PDF (`signature/pdf.ts`)

1. `gerarProcuracao(dados, "_KIT_PREV_CSS.docx")` → buffer .docx.
2. `POST {DOCX_CONVERTER_URL}/convert` → PDF (caminho já usado hoje).
3. `sha256(pdf)` → `documentHash`; sobe pro S3 (`pdfKey`).
4. **Onde carimbar**: o KIT tem 3 linhas de assinatura (parágrafos 3, 16 e 24 —
   procuração, contrato e declaração). Estratégia recomendada: **âncoras
   invisíveis** — colocar `[[assin1..3]]` no template renderizados em branco 1pt
   (já existe uma base pronta: `_shelved_zapsign/crm/KIT_PREV_CSS-com-ancoras.docx`),
   localizar as coordenadas com `pdfjs-dist` (`getTextContent()` devolve o
   transform x/y de cada item) e desenhar o PNG da assinatura com `pdf-lib` logo
   acima da linha.
   *Fallback se der trabalho:* coordenadas fixas por página, medidas uma vez —
   funciona porque o template é estático; o risco é um nome muito longo quebrar
   linha e deslocar o resto (mitigado truncando o campo).
5. Sob cada assinatura, em 8pt: `Assinado eletronicamente por NOME — CPF — data — token`.
6. **Página de manifesto** (gerada por código com pdf-lib): dados do signatário,
   hash do documento, IP, telefone verificado, horário de cada passo, imagem da
   assinatura e QR code para `/verificar/<token>`.
7. `signedPdfKey` no S3 + `signedHash`.

`maxDuration = 60` na rota (conversão + carimbo levam segundos; o Vercel Pro
permite). O PDF nunca trafega pelo payload — sempre S3 presigned, por causa do
limite de 4,5MB.

---

## 4. Integração com o bot e o card

### 4.1 Gatilho
Reaproveitar o diff do `5d627e0` em `app/_shared/lib/whatsapp/bot.ts`:
- exportar `postInternalNote` e `qualifyToQueue`;
- no `case "qualify"`, chamar `maybeStartSignatureFlow` (import dinâmico, evita
  ciclo bot ↔ signature);
- interceptar a resposta do cliente com `handleConfirmationReply` antes do cérebro.

### 4.2 Microserviço (`D:\Chatbot_whatsapp`)
Voltar `extractContractData` e `confirmContractReply` do `bot.js` engavetado
(+ os dois endpoints no `index.js`). Atenção: o `bot.js` atual evoluiu ~520
linhas desde julho — **aplicar só os blocos das duas funções**, nunca copiar o
arquivo inteiro por cima.

### 4.3 Mensagens do WhatsApp (copy)
Ao enviar o link:
> "Perfeito, Maria! ✅ Preparei sua procuração e o contrato.
> É só assinar pelo celular, no link abaixo — leva 2 minutinhos.
> 👉 Vou te explicar: você vai **abrir o link**, **conferir seus dados**,
> **desenhar sua assinatura com o dedo** e **digitar um código** que eu mando
> aqui. Se travar em qualquer parte, me chama que eu te ajudo. 😊"
> `https://segurosparana.com.br/assinar/xxxx`

Depois de assinar:
> "Recebemos sua assinatura! ✅ Obrigado, Maria.
> A partir de agora um atendente da nossa equipe segue com você por aqui, para
> conferir seus documentos e dar entrada no seu pedido."

### 4.4 Passagem silenciosa pro atendente
Após `signedAt`:
- conversa → `queued` + tag **"Validar contrato"** (sem roubar o ticket de quem
  já estiver com a conversa, como no código engavetado);
- nota interna com **checklist de validação**: campo a campo com origem
  (documento/conversa/inferido) e confiança, lista dos documentos que o cliente
  enviou, link do PDF assinado e do manifesto;
- notificação no sino pra equipe do setor;
- botão **"Validar"** no card/inbox → `status = validado`, `validatedById`.
- O cliente não vê nada disso — só a mensagem de agradecimento.

### 4.5 Arquivo no card
- `findLinkedCard(contactId)` acha o card → `db.document.create({ userId/processId,
  key: signedPdfKey, name: "Procuração e contrato assinados.pdf" })`;
- sem card ainda → entra em `draftDocuments` do contato e migra sozinho quando o
  atendente clicar em "Adicionar cliente" (`client-info.ts:353`);
- também grava os campos no `clientDraft`, pré-preenchendo o cadastro.

### 4.6 Lembretes (cron de 15min)
`runSignatureReminders` do arquivo engavetado, **sem o polling** da ZapSign
(agora a fonte da verdade é nossa): até 3 lembretes, 24h de intervalo, só em
horário comercial (7h–21h BRT), template `lembrete_assinatura` para fora da
janela de 24h, mais a faxina de ciclos órfãos e de confirmação abandonada (12h).

### 4.7 Caminho MANUAL (a equipe no comando)

Nem todo contrato nasce do bot: o atendente precisa poder gerar e mandar na mão.
O botão já existia no commit engavetado (`IntegrationsTab.tsx` + `/api/zapsign/generate`)
— vira `/api/signature/generate` chamando `createSignatureFromCard`.

**Dois pontos de partida, mesmas travas:**

| Onde | Botão | O que faz |
|---|---|---|
| Card do kanban → aba **Integrações** | "Gerar contrato para assinatura" | Usa os dados do **card** (User/Process) |
| Inbox do WhatsApp → Copiloto / ficha | "Gerar contrato" | Usa os dados da **ficha do contato** (`clientDraft`), ou os do card se já estiver vinculado |

**Três formas de entregar** (escolha no próprio botão):
1. **Só me dá o link** — gera, mostra o link com botão "copiar" e **não manda nada**
   pro cliente. O atendente escreve a mensagem do jeito dele.
2. **Gerar e enviar pelo WhatsApp** — o sistema manda a mesma sequência de
   mensagens do fluxo automático (link + explicação passo a passo), mas
   assinada como **atendente**, não como bot.
3. **Gerar e baixar o PDF** — para imprimir/assinar presencialmente; o ciclo
   fica marcado como `origem: manual_offline` e não entra em lembretes.

**Regras que valem para os três:**
- Passa pelas **mesmas validações** do fluxo automático (obrigatoriedade, CPF por
  dígito verificador, CEP no ViaCEP com enriquecimento). Faltou dado → **não gera
  documento nenhum**: devolve a lista campo a campo ("CPF: dígito verificador
  inválido", "CEP pertence a Curitiba, mas o cadastro diz Pinhais").
- Já existe ciclo ativo pro mesmo cliente → **não duplica**: devolve o link
  atual e avisa em que status ele está.
- O ciclo de acompanhamento (lembretes, expiração, arquivamento no card, fila de
  validação) roda **igual ao automático** — quem gerou não muda o que vem depois.
- Tudo fica registrado: `createdBy` (id + nome do atendente), `origin`
  (`bot` | `manual_card` | `manual_inbox` | `manual_offline`) e nota interna na
  conversa ("Fulano gerou o contrato e enviou pelo WhatsApp às 14h32").

Campos novos no model para isso: `origin String @default("bot")`,
`createdById String?`, `createdByName String?`, `deliveredBy String?`
(`bot` | `atendente` | `nao_enviado`).

### 4.8 A IA precisa SABER que tem contrato na rua

Sem isso o bot atropela: recomeça a triagem, pede os dados de novo ou gera um
segundo link enquanto o cliente está com o primeiro aberto. Três camadas:

**Camada 1 — trava em código (não depende da IA acertar).**
Antes de qualquer coisa, `handleIncomingWhatsApp` consulta o ciclo ativo do
contato. Existindo ciclo em `aguardando`/`visualizado`/`assinado`:
- `maybeStartSignatureFlow` **nunca** dispara de novo (já é assim no código
  engavetado — a checagem de ciclo ativo fica valendo também para o manual);
- se o cliente disser alguma variação de "**já assinei**" e o status **não** for
  `assinado`, o bot não discute: confere o banco, responde "deixa eu verificar
  aqui pra você 😊" e **passa pro atendente** com nota "cliente afirma que
  assinou, mas o ciclo está em `<status>` — conferir".

**Camada 2 — bloco de contexto no cérebro.**
Junto do `priorOutcome` que já é enviado ao microserviço, entra um bloco novo:

```
ASSINATURA EM ANDAMENTO
- Documento: procuração + contrato + declaração (KIT previdenciário)
- Enviado por: ATENDENTE Marina (não foi você) em 18/08 às 14h32
- Status: aguardando assinatura (cliente abriu o link há 10 min)
- Lembretes enviados: 1 de 3
- Link: https://segurosparana.com.br/assinar/xxxx
REGRAS:
- NÃO recomece a triagem e NÃO peça dados de novo — já estão no documento.
- NÃO gere outro link. Se ele perdeu, reenvie ESTE link.
- Pode explicar o documento em linguagem simples e tirar dúvidas.
- Se disser que assinou, que não conseguiu, que não sabe mexer, que quer
  desistir ou pedir alguém: passe para o atendente imediatamente.
```

O "**Enviado por: ATENDENTE**" é o detalhe que você pediu: a IA precisa saber que
a mensagem saiu de um humano, para não repetir a explicação nem se contradizer.

**Camada 3 — o que o cliente vê.** Enquanto há contrato na rua, o bot responde
dúvidas do documento e **nada mais**; qualquer outro assunto vira handoff. O
histórico da conversa continua inteiro pro atendente.

---

## 5. Aba "Contratos" (visão da equipe)

Aba nova na nova-dash (`activeTab === 'contratos'`, ao lado de Kanban/WhatsApp/
Menções), em `app/nova-dash/contratos/`. Não é relatório: é a mesa de trabalho de
quem cobra assinatura.

**Topo — contadores clicáveis (filtram a lista):**
`Aguardando assinatura · Visualizado (abriu e não assinou) · Assinado, falta validar ·
Validado · Precisou de humano · Recusado/Expirado`

**Lista (uma linha por ciclo):**

| Cliente | Telefone | Status | Origem | Enviado | Abriu | Assinou | Lembretes | Validado por |
|---|---|---|---|---|---|---|---|---|
| Maria Silva | (41) 9…| 🟡 aguardando | 🤖 bot | 18/08 14:32 | 15:10 | — | 1/3 | — |
| João Souza | (41) 9…| 🟢 assinado | 👤 Marina | 17/08 09:12 | 09:20 | 09:31 | 0/3 | *validar* |

- Ordenação padrão: **o que precisa de ação primeiro** (assinado sem validar →
  aguardando há mais tempo → o resto).
- Busca por nome/telefone/CPF; filtro por período e por atendente.
- Alerta visual em quem está parado há 48h+ sem abrir o link.

**Ao clicar — painel do cliente** (é aqui que fica "todos os contratos de cada
cliente" separadamente):
- **Histórico completo daquele cliente**: todos os ciclos, inclusive os que
  falharam ou expiraram, em ordem cronológica — dá pra ver que o contrato foi
  gerado 3x até o cliente conseguir assinar.
- Por ciclo: PDF original, PDF assinado, **trilha de auditoria** completa (IP,
  horário de cada passo, telefone verificado, hash), dados extraídos campo a
  campo com origem e confiança, e nota de quem gerou.
- Ações: **copiar link**, **reenviar pelo WhatsApp**, **cancelar ciclo**,
  **marcar como validado**, **abrir a conversa no inbox**, **abrir o card**.
- Botão **Validar** exige conferência dupla: marca `validatedAt`/`validatedById`,
  fecha a tag "Validar contrato" e registra no `Log`.

**Permissão:** visível para ADMIN+ e para o setor comercial (mesma régua de
`requirePermission()` usada no resto); atendente comum vê só os contratos dos
contatos dele.

---

## 6. Segurança

- Token de 32 bytes aleatórios (`crypto.randomBytes`), único por ciclo, expira em
  7 dias — **nunca CPF/telefone na URL**.
- Rate limit na página e nas actions (`app/_shared/lib/rate-limit.ts`).
- OTP: 6 dígitos, hash bcrypt, 10 min de validade, 5 tentativas, reenvio a cada 60s.
- Middleware: `/assinar` e `/verificar` em `PUBLIC_PAGE_PREFIXES` **e**
  `PUBLIC_ACTION_PAGES`; `/api/signature/pdf` em `PUBLIC_GET_APIS` (o token é
  validado dentro da própria rota).
- PDF servido por presigned URL de 10 min; a key do S3 nunca aparece pro cliente.
- LGPD: aviso de tratamento na página + link da política; auditoria guardada
  enquanto durar a relação contratual.

---

## 7. Fases de execução

| Fase | Entrega | Arquivos | Esforço |
|---|---|---|---|
| **1. Fundação** | Model `SignatureRequest` (+ `origin`/`createdBy`/`deliveredBy`) + migration + `tokens.ts` + `core.ts` (port do engavetado sem ZapSign) | `prisma/schema.prisma`, `app/_shared/lib/signature/*` | 1 dia |
| **2. PDF** | `pdf.ts`: preencher → converter → hash → carimbar → manifesto + QR; script local que cospe um PDF de exemplo pra conferir | `signature/pdf.ts`, template com âncoras | 1–1,5 dia |
| **3. Página** | `/assinar/[token]` completa (6 passos, voz, canvas, OTP), `/verificar/[token]`, rota do PDF, middleware | `app/assinar/**`, `app/verificar/**`, `middleware.ts` | 2 dias |
| **4. Manual** | Botão no card + no inbox, as 3 formas de entrega, validação com pendências campo a campo, registro de quem gerou | `api/signature/generate`, `IntegrationsTab.tsx`, inbox | 0,5–1 dia |
| **5. Bot** | Gatilho no `qualify`, intercept de confirmação, **bloco "ASSINATURA EM ANDAMENTO"** no cérebro + travas de código, endpoints de IA de volta no microserviço | `whatsapp/bot.ts`, `D:\Chatbot_whatsapp\{bot,index}.js` | 1–1,5 dia |
| **6. Pós-assinatura** | Documento no card, fila + tag + checklist, notificação, botão "Validar" | `signature/core.ts`, inbox/card-dialog | 0,5–1 dia |
| **7. Aba Contratos** | Aba nova, contadores, lista com ordenação por urgência, painel por cliente com histórico e trilha, ações (reenviar/cancelar/validar) | `app/nova-dash/contratos/**`, `_actions/signature/*` | 1,5 dia |
| **8. Cron + resiliência** | Lembretes, expiração, órfãos, alertas de falha, tabela de erros da seção 8 | `api/whatsapp/cron/route.ts` | 0,5 dia |
| **9. Testes + piloto** | Vitest do validador (CPF/CEP/confiança) e do hash; teste ponta a ponta no seu número; piloto com 5 clientes reais antes de ligar pra todo mundo | `tests/` | 1 dia |

**Total ≈ 9–11 dias de trabalho.** As fases 1–4 já entregam valor sozinhas: a
equipe gera e manda contrato na mão, com página de assinatura funcionando, antes
mesmo de o bot encostar nisso.

### Chave de desligamento
`SIGNATURE_AUTO_ENABLED` em `app_settings` (ou env): desligado, a qualificação
segue o fluxo atual (fila humana) — mesmo papel do antigo `isZapSignConfigured()`.
Ligar primeiro só o **botão manual no card**, depois o automático.

---

## 8. Tratamento de erros (regra de ouro: nada morre em silêncio)

Toda falha faz **as três coisas**: registra no ciclo (`status`/`error`), escreve
**nota interna** na conversa dizendo o que fazer, e **avisa um humano** (sino +
tag). Nenhuma delas manda documento errado pro cliente.

| O que dá errado | O que o sistema faz | O que o cliente vê |
|---|---|---|
| IA não fecha os dados do KIT | Ciclo `extracao_falhou` com as pendências campo a campo + nota + notificação; lead vai pra fila | Nada — segue no atendimento normal |
| CPF com dígito inválido / CEP inexistente | Bloqueia a geração e lista o motivo ("CEP pertence a Curitiba, cadastro diz Pinhais") | Nada (ou o bot pergunta de novo, se ainda estiver na confirmação) |
| Cliente corrige dados 2x sem fechar | Para de insistir, chama atendente com tudo anotado | "Vou pedir pra um atendente conferir com você 😊" |
| `docx-converter` fora do ar / timeout | Ciclo vira `erro`, nota "gerar manualmente", alerta pra equipe; **nenhuma** mensagem sai | Nada |
| Função morre no meio da criação (sem token) | Cron faz a faxina em 15min: `erro` + nota | Nada |
| Cliente some depois do resumo (12h) | Ciclo `confirmacao_expirada`, vai pra fila | Nada |
| Cliente não assina | 3 lembretes em horário comercial; depois disso, resgate manual com nota e link | Lembretes gentis, o último avisando que é o último |
| Link expirado (7 dias) | Tela amigável "esse link venceu" + nota interna; **não** gera link novo sozinho | "Já já alguém te chama no WhatsApp pra te mandar um novo" |
| OTP errado 5x | Bloqueia o ciclo, passa pro atendente | "Vou pedir ajuda de um atendente pra você, tá bom?" |
| WhatsApp fora da janela de 24h | Usa o template aprovado; sem template, adia 6h sem gastar tentativa | Nada |
| Cliente clica em "não consigo assinar" | Nota "cliente pediu ajuda na assinatura" + fila com prioridade | "Já já alguém te chama por aqui 😊" |
| Cliente diz que assinou mas o status não bateu | Bot confere o banco, não discute e passa pro humano | "Deixa eu verificar aqui pra você" |
| Falha ao anexar o PDF no card | O PDF **já está** no S3; nota com o link direto + alerta pra anexar na mão | Nada (ele já assinou com sucesso) |
| Atendente tenta gerar 2º contrato | Devolve o link do ciclo ativo com o status atual, sem duplicar | Nada |

Todo evento também vai pro `Log` com `action: "signature"`, então a auditoria
aparece no histórico do card como o resto do sistema.

---

## 9. Riscos e decisões em aberto

| Risco | Mitigação |
|---|---|
| Carimbo sair fora do lugar | Âncoras + `pdfjs-dist`; conferir visualmente os 3 documentos antes do piloto |
| `docx-converter` fora do ar | Já é dependência de hoje; se falhar, vira nota interna + atendente (nunca manda documento quebrado) |
| Template `lembrete_assinatura` não aprovado na Meta | Criado em 20/08 nas duas WABAs via `npm run sign:templates` (PENDING; `codigo_assinatura` já APPROVED). Botão de URL leva direto pro `/assinar/<token>` |
| Cliente contestar a assinatura | Manifesto + hash + OTP + trilha; vale uma revisão de 30min com o Dr. Caíque antes do piloto |
| IA extrair dado errado | Já há validação de CPF/CEP, confirmação com o cliente e validação humana no fim |

**Decisões que preciso de você:**
1. **OTP por WhatsApp** — recomendo manter (é a prova de autoria mais forte que
   temos e custa 1 mensagem). Alternativa: só aceite + IP, com menos atrito.
2. **Selfie/foto do documento na hora de assinar** — dá mais robustez, mas
   aumenta muito o abandono. Minha recomendação: **não** na v1 (o RG/CNH já vem
   na triagem).
3. **Assinatura do advogado no contrato** — hoje o carimbo é só do cliente; a
   contratada assina depois manualmente. Se quiser assinatura dupla automática,
   é +0,5 dia (imagem fixa da assinatura do Dr. Caíque).

---

## 10. Como testar na sua máquina (sem subir nada)

Tudo roda local contra o banco e o S3 de sempre. Nada é enviado por WhatsApp.

**1. Ligue o modo de teste** (já está no seu `.env`):

```bash
grep SIGNATURE .env
```

`SIGNATURE_OTP_DEV=true` faz o código de 6 dígitos aparecer NA TELA em vez de ir
pro WhatsApp, e `SIGNATURE_BASE_URL=http://localhost:3000` faz o link apontar
pro dev server. `SIGNATURE_AUTO_ENABLED` continua desligado, então o bot em
produção não dispara nada disso.

**2. Só o motor do PDF** (gera o KIT, acha as 3 âncoras, carimba e imprime o
caminho dos PDFs pra você abrir):

```bash
npm run sign:pdf
```

**3. Um contrato de teste completo** (cria o contato fictício "ZZ TESTE",
gera o documento de verdade, sobe pro S3 e imprime o link):

```bash
npm run sign:seed
```

**4. Abra o link no navegador** com o dev rodando (`npm run dev`) e faça o
caminho do cliente: começar → ler → assinar com o dedo → código na tela →
assinar. Pode rodar o seed quantas vezes quiser: ele cancela o ciclo anterior
e cria um novo.

**5. Confira o resultado**: a página `/verificar/<token>` mostra o status e os
hashes, e o botão "Baixar meus documentos" traz o PDF com as 3 assinaturas
carimbadas e o manifesto de auditoria na última página.

Para testar com o SEU número de verdade (aí o código chega no WhatsApp), tire o
`SIGNATURE_OTP_DEV` do `.env` e defina o telefone antes de rodar o seed. No
PowerShell não existe prefixo de variável inline (`VAR=1 comando` é erro) — é:

```bash
$env:SEED_PHONE = "5541999999999"; npm run sign:seed
```
