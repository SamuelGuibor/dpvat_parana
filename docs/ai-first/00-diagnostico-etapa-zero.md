# AI-First Operations Platform — Etapa 0: diagnóstico técnico e plano (v2)

> Produzido em 2026-10-24 a partir dos mapas `docs/ai/*.md`, de três varreduras só-leitura do código e de consultas de leitura no banco de produção (colunas, tags, automações, contagens). Nada foi implementado. O que é hipótese está marcado **[a validar]**.
>
> **v2 (mesmo dia):** a interface de operação **não é uma aba no site**. O operador trabalha **dentro deste app (Claude Code / Claude desktop)**, conversando em linguagem natural. O CRM entra como camada de ferramentas autenticadas; o conhecimento da operação vive num **vault Obsidian versionado no repositório**; **todo prompt, ferramenta usada, aprovação e resultado é registrado no banco** para que o dashboard do site mostre o que foi feito. As seções 1 a 5 (arquitetura atual, dados, fluxos, reaproveitamento, riscos) continuam válidas; as seções 6 a 10 foram reescritas.

## 0. Resumo executivo

- O CRM já tem **quase toda a camada de aplicação** que a IA operacional precisa: busca de cards, movimentação com log e automações, comentários com @menção, tarefas por setor, tags, documentos no S3 com lixeira, geração de procuração/pedido hospitalar por `.docx`, WhatsApp proativo com anti-spam, SES, log de auditoria com snapshot de setor e contabilidade de tokens (Canto da IA). O trabalho é **expor isso como ferramentas tipadas para o app**, não reescrever.
- O que **não existe**: (1) uma API de operação autenticada por máquina (hoje tudo é server action/rota de sessão de navegador); (2) conhecimento operacional escrito e versionado (o único "prompt vivo" é o do bot de triagem do cliente); (3) registro de "quem pediu o quê à IA e o que foi executado" fora dos logs de domínio; (4) e-mail para terceiros com anexo; (5) catálogo de hospitais com contato real; (6) campo de responsável no card.
- O conhecimento **mais valioso já está no banco, em formato errado**: 283 automações na coluna "DISTRIBUIÇÃO DE SOLICITAÇÕES" (uma por hospital) escrevem como comentário o procedimento de pedido de prontuário (presencial × e-mail × WhatsApp, e-mail de contato, que procuração usar, planilha). É a semente do vault e do workflow "solicitar prontuário".
- Riscos estruturais: banco único de **produção** (sem staging); Vercel com teto de 300 s / 4,5 MB; `session.user.role` congelado no JWT (autorização tem que ler o banco); 30 permissões existentes, várias só de UI; mapas `docs/ai` com pontos desatualizados (Anexo A).

## 1. Mapa da arquitetura atual

```
Navegador (nova-dash, client components, SWR/polling)
   │  server actions (app/_actions/**)        route handlers (app/api/**)
   ▼                                           ▼
Next.js 14 App Router na Vercel Pro (região cle1, UTC, maxDuration ≤ 300 s, body ≤ 4,5 MB)
   │  requireTeam()/requirePermission()  ← lê User por e-mail + trava de IP (app_settings)
   │  db (Prisma 6, singleton)  → Neon Postgres (pooled)          S3 (us-east-1, presigned PUT/GET)
   │  createLog()/logWhatsAppEvent() → tabela logs (metadata.usage = tokens de IA)
   │  runAfterResponse() (waitUntil) para trabalho pós-resposta sem IA
   ├─ Anthropic SDK direto (4 pontos: auditoria IA, ficha IA, closing-judge, ensinar cérebro)
   ├─ Gemini SDK direto (Gerador IA de documento; protótipo órfão app/api/chat)
   ├─ fetch → Railway "cérebro do bot" (D:\Chatbot_whatsapp)
   ├─ fetch → Railway docx-converter (D:\docx-converter: /convert DOCX→PDF, IA do Roteiro)
   ├─ Meta WhatsApp Cloud API (multi-número, token cifrado por WhatsAppNumber)
   └─ AWS SES/SNS (reset de senha), Google Sheets, Meta CAPI
Crons (vercel.json, 8 jobs, CRON_SECRET): SLA/nudge/recovery do WhatsApp, automações por tempo, retenção, lixeira, custos
Dev: este repo já tem harness de IA (.claude/settings.json com hooks PreToolUse/Stop, skills /plano /validar /migration /mapa-atualizar, mapas docs/ai)
```

Pontos de entrada da equipe hoje: Kanban (`KanbanBoard` + `CardDialog`), Inbox WhatsApp (+ `CopilotPanel`), Menções e Tarefas, Espaço de Trabalho (Gestor, Custos, Números, Segurança, Revisão da IA), Ctrl+K. Rotas chamadas por máquina (cron, webhook, micro) seguem o padrão: allowlist em `middleware.ts` **e** segredo validado na rota.

## 2. Mapa das entidades e relações

| Conceito | Onde vive | Armadilha |
|---|---|---|
| **Cliente / processo / card** | `User` (card ativo = `role` não é ADMIN*/GHOST e `archiveStatus` null). `Process` existe (FK `userId`) mas tem **0 linhas em produção** (24/10). | O mesmo `User` é equipe (`role` ADMIN*) e hospital (`GHOST`, 249). Filtre sempre. |
| **Identificador humano** | `cardNumber` (`Int @unique`, `nextval('card_number_seq')`) = o "processo 2342". | `id` é cuid; actions recebem `(id, isProcess)`. CPF **não é único**, só dígitos. |
| **Coluna** | `Label` (`name` único, `order`, `timeLimitDays`); card aponta por `labelId`; `role` é cópia do nome. | Sem slug: resolver por nome normalizado e confirmar com `getLabels()`. |
| **Etapa do checklist** | `User.status` (`DPVAT_S1..S7`, `INSS_S1..S8`, genéricos) por `service`. | **Mudar `status` dispara WhatsApp ao cliente** (`notifyStatusProgress`). |
| **Tags** | `CardTag` m2m; 56 em produção (PRONTUÁRIO ANEXADO, FALTA SENHA, DOCUMENTO VENCIDO, NÃO MOVER…). | Atribuição manual não gera log. ≠ `WhatsAppTag` ≠ `Label`. |
| **Documentos** | `Document` (`key` S3, `category` ∈ 8 pastas, `deletedAt` lixeira 30 d, `userId` = dono). | Toda query filtra `deletedAt: null`. Key pode ser compartilhada com mídia do WhatsApp. |
| **Checklist administrativo** | `AdminChecklistItem` (COMERCIAL/ADM/MÉDICO, inclui "PRONTUÁRIOS"), fixo. | Não há lista de documentos exigidos por serviço. |
| **Histórico** | `Log` (`authorId` sem FK, `metadata` com diff/setor; `move`/`create`/`update`/`archive`/`status_change` eternos) + `Comment`. | Log de IA leva `metadata.usage`. |
| **Tarefas / menções** | `Mention` (PENDING/ACK/DONE, `groupId`) + `Notification` (volátil). `recordMentions`/`recordSectorTask`. | Não há "responsável do card". |
| **Hospital** | `User.hospital` (texto) + GHOST (nome, e-mail fake `@hospital.internal`) + 283 automações com o procedimento. | Sem contato estruturado. `migrate-hospitals`/`seed-hospitals` são destrutivos. |
| **Comunicação** | WhatsApp (`findLinkedCard` liga contato↔card); e-mail só `sendEmailAws` (1 destinatário, sem anexo). | Envio proativo só por `sendSystemWhatsApp`. |
| **Automações** | `Automation` JSON (comment, whatsapp, sheets, ai_audit, add_tag, move, file) por coluna + cron. | Executor inline/privado: extrair para virar ferramenta. |
| **Conhecimento do bot** | `WhatsAppInstructions`/`WhatsAppPlaybook` versionados (rascunho/publicado). | Exclusivo da triagem; a operação interna não tem equivalente. |

Colunas reais (24/10, 297 cards ativos): Filtro de Cartões (89) → COLHER-ASSINATURA (142) → FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL (14) → DISTRIBUIÇÃO DE SOLICITAÇÕES (5, 283 automações) → FALTA SENHA - SOLICITADO (31) → COM SENHA - SOLICITADO (67) → INSS/OAB/POUPA TEMPO (33) → AGENDAR PERÍCIA ADM (19) → AGUARDANDO SAIR DATA PERÍCIA INSS (16) → PERÍCIA INSS AGENDADA (1) → AFASTADOS (35) → DISTRIBUIÇÃO DE PROCESSOS (9) → AUDITORIA (43) → FAZER ROTEIRO PREV (12) → REVISÃO PRÉ-PASTA |UNI (13) → ENVIAR EMAIL UNI/CCS (4) → ENVIADOS P/ UNI/CCS (150) → EM ANALISE UNI (113) → COBRANÇA (11) → PENDÊNCIAS JUDICIAL (61). Não existe "Aguardando Documentos" nem "Em Análise" com esse nome: a IA mapeia e **confirma** quando ambíguo.

## 3. Fluxos operacionais (evidência: código + banco)

1. **Entrada** → bot de triagem → qualificado vira card em "Filtro de Cartões" + tarefa do setor `comercial` + ficha por IA.
2. **Contratação** → COLHER-ASSINATURA (assinatura eletrônica própria desligada; ZapSign colado na conversa).
3. **Prontuário** → FAZER PROTOCOLO → DISTRIBUIÇÃO DE SOLICITAÇÕES: a automação do hospital comenta o procedimento; 6 geram `.docx` (`PEDIDO_HOSPITALAR.docx`, tags `[[name]] [[rg]] [[cpf]] [[data_nascimento]] [[nome_mae]] [[hospital]] [[data_acidente]]`). O pedido em si é manual. Tags PRONTUÁRIO ANEXADO / PRONTUARIO PRONTO P/ RETIRAR marcam o resultado.
4. **INSS** → FALTA SENHA / COM SENHA (WhatsApp após 5 dias) → INSS/OAB/POUPA TEMPO → AGENDAR PERÍCIA ADM → AGUARDANDO SAIR DATA → PERÍCIA AGENDADA / AFASTADOS (avisos D-10/5/2/1/0 por `afastadoAte`) → AUDITORIA → FAZER ROTEIRO PREV → REVISÃO PRÉ-PASTA |UNI → ENVIAR EMAIL UNI/CCS → ENVIADOS → EM ANALISE UNI → `pagos_uni`/`pastas_negadas_uni`.
5. **Encerramentos** → `archiveStatus` (12 destinos, 3 destrutivos com confirmação).

Regras evidenciadas: mover = `labelId` + `role` + `statusStartedAt` + log `move` + automações; ação `move` terminal (profundidade 3); envio de WhatsApp sempre pelo `numberId` do contato; opt-out só por regex; mudança de etapa notifica o cliente; documento gerado recebe `category: inferCategory(name)` e log `document_add`; logs de ciclo de vida nunca purgados.

## 4. O que se reaproveita

| Capacidade | Já existe | Reaproveitamento |
|---|---|---|
| Localizar cliente | `GlobalSearch` (cliente, baixa o board inteiro), `searchArchivedCards`, `findDuplicateClient`, `findLinkedCard` | Query nova de servidor sobre `User` (+ arquivados) |
| Card completo | `fetchUserById`/`fetchProcessById`, `/api/comments`, `/api/logs`, `/api/card-tags`, `/api/admin-checklist` | Chamar os `fetch*` com `select` mínimo (sem `password`, `senha_inss`) |
| Mover | `updateKanbanStatus` (não idempotente, exige sessão) / `moveCardToLabelByName` (idempotente, sem chamador) | Extrair núcleo idempotente para lib |
| Arquivar | `setArchiveStatus` (`archive_cards`) | Chamar direto |
| Tag | `POST /api/card-tags/assign` (inline, sem log) | Extrair para lib + log |
| Comentário | `createComment` (log, Notification, `recordMentions`) | Chamar direto com autor = operador |
| Tarefa | `recordMentions`/`recordSectorTask` | Novo `kind` genérico |
| Procuração / pedido hospitalar | `gerarProcuracaoById` → docxtemplater → `/convert`; `PEDIDO_HOSPITALAR.docx` | Validar campos obrigatórios; salvar no S3 + `Document` em vez de devolver no body |
| Contrato | `gerarContratoDoCard` (`manage_contracts`, KIT; fluxo desligado) | PDF do KIT sem reativar assinatura **[a validar]** |
| WhatsApp proativo | `sendSystemWhatsApp` | Única porta de saída |
| E-mail | `sendEmailAws` (1 destinatário, sem anexo) | Estender para MIME com anexos e cc |
| Auditoria/custo | `createLog` + `metadata.usage` + Canto da IA | Novas `LogAction`; o dashboard lê tabela própria do assistente |
| Permissões | `requireTeam`/`requirePermission`/`requireTeamWrite` (30 chaves) | Operador do app mapeado para um `User` da equipe (ver §6) |
| Conhecimento | 283 automações, `docs/ai/*.md`, `D:\Chatbot_whatsapp\mapa-obsidian` (vault já existente do bot) | Vault da operação no repo, seed por script |
| Harness do app | `.claude/settings.json` (hooks PreToolUse/Stop), skills, `explorador-dominio`/`revisor-regras` | Skills de operação + hook `UserPromptSubmit` para registrar prompts |

Não reaproveitar: `app/api/chat/*` (protótipo Gemini + Windmill), `app/api/kanban/update-status`.

## 5. Lacunas e riscos

**Lacunas**: sem API de operação por máquina; sem cliente de IA compartilhado no Next (irrelevante para o app, relevante para auditoria/ficha); sem persistência de pedidos/execuções/aprovações; sem hospitais com contato; sem responsável no card; sem lista de documentos por serviço; sem e-mail com anexo; guardas fracas nas actions que as ferramentas vão envolver; `getVars` expõe `password`/`senha_inss`; mapas desatualizados.

**Riscos**: produção única (dry-run por padrão, card de teste); 300 s / 4,5 MB (ferramentas curtas, PDF no S3); autorização pelo banco e não pelo JWT; **conteúdo de comentários/documentos/mensagens entra no contexto do modelo** (injeção: resultado de ferramenta é dado, aprovação é humana e no app); LGPD (mascarar, nunca `senha_inss`, registrar quem perguntou); anti-spam da Meta; egress do Neon (`take` baixo, `select` mínimo).

**Risco novo da v2 — o app como interface**: (a) o operador do app não tem sessão NextAuth: a identidade vem de um token por pessoa, e o `authorId` dos logs precisa ser o `User` real dela; (b) o app roda na máquina do operador com `.env` de produção: o segredo da API e o `DATABASE_URL` não podem ser lidos pela IA (o hook `guard-env.mjs` já bloqueia edição; falta bloquear leitura de `.env*` e mascarar saídas); (c) tokens consumidos pelo próprio app não são visíveis ao CRM (assinatura Claude) → o dashboard mede pedidos, ferramentas, aprovações, duração e resultado, e o custo só das chamadas que o CRM faz; (d) sem a camada de ferramentas, o app já consegue hoje escrever direto no Neon via Prisma e scripts — a disciplina (skills + hooks + API) é o que impede isso de virar o caminho padrão.

## 6. Arquitetura proposta (v2): o app opera, o CRM expõe ferramentas e registra

```
┌ Claude Code / Claude desktop (operador)
│  prompt em PT-BR → skills de operação (.claude/skills/op-*/SKILL.md: workflows com passos, pré-condições, aprovações)
│  conhecimento: vault Obsidian em docs/operacao/ (markdown + frontmatter, wikilinks, versionado no git)
│  ferramentas: servidor MCP local `tools/crm-mcp/` (Node, fino) → HTTPS → API de operação do CRM
│  hooks (.claude/settings.json): UserPromptSubmit registra o prompt; PostToolUse registra cada ferramenta; PreToolUse barra Prisma/SQL direto fora de scripts aprovados
└──────────────────────────────────────────────────────────────────────────────────────
┌ CRM (Vercel)
│  app/api/op/**            API de operação: token por operador (`OperatorToken`, hash) → `User` da equipe → permissões do banco
│  app/_shared/lib/op/      registry de ferramentas (zod), policy (níveis, hash de aprovação), execução sobre as libs existentes
│  prisma                   op_sessions (uma por conversa do app), op_requests (prompt), op_tool_calls, op_approvals, op_drafts
│  app/nova-dash/workspace/ seção "Operação por IA": linha do tempo dos pedidos, ferramentas, aprovações, cards tocados, falhas
│  logs                     ações de domínio (move, comment_add, tag_add, document_add…) com metadata.via = "claude-app" + opRequestId
└──────────────────────────────────────────────────────────────────────────────────────
```

**6.1 Interface = o app.** O operador escreve no Claude Code. As **skills** (`/cliente`, `/processo`, `/prontuario`, `/procuracao`, `/pendencias`, `/parados`…) são os workflows: arquivos markdown versionados com passos explícitos, ferramentas permitidas por passo, dados obrigatórios e ponto de aprovação. A IA não inventa o procedimento: a skill manda ler a nota do vault e chamar a ferramenta. Pedidos fora de skill continuam possíveis, com as mesmas ferramentas e políticas.

**6.2 Ferramentas = API de operação do CRM, consumida por um MCP fino.** As regras ficam no CRM (uma implementação para app, site e automações). O MCP só traduz `tool call` → `POST /api/op/<ferramenta>` com o token do operador. Nenhuma ferramenta recebe SQL; o acesso direto ao Neon pelo app fica proibido por hook fora de `scripts/` com dry-run.
- Autenticação: header `Authorization: Bearer <token do operador>`; a rota resolve o `User` (token hash em tabela `operator_tokens`, revogável), aplica `resolvePermissions` do banco e a trava de IP **[a validar: bypass para operadores?]**. Rota entra em `PUBLIC_API_PREFIXES` do middleware e valida o token dentro (padrão cron/webhook do projeto).
- Contrato de toda ferramenta: args validados por zod; resposta `{ok, data, state}` onde `state` é o estado **relido** do banco depois da escrita; erro `{ok:false, code, message}`; nunca lança; `maxDuration` curto.
- Dentro do CRM cada ferramenta chama a lib do domínio (`createComment`, `setArchiveStatus`, núcleo de movimentação, docxtemplater, `sendSystemWhatsApp`, `sendEmailAws`) e grava o log de domínio com `authorId` = operador e `metadata.via = "claude-app"`, `opRequestId`.

**6.3 Níveis de autonomia (policy no CRM, confirmação no app).**
- L1 leitura — executa.
- L2 preparar (procuração, pedido hospitalar, e-mail, mensagem) — gera rascunho no S3 (`op_drafts`, URL assinada para o operador abrir) — executa.
- L3 interno reversível (mover, tag, comentar, tarefa, arquivar não destrutivo) — executa se o operador tem a permissão de domínio e a ferramenta está liberada em `AppSetting` (`op_level3_enabled`, começa desligado por ferramenta).
- L4 externo/sensível (enviar e-mail/WhatsApp, mudar `status` que avisa o cliente, arquivar destino destrutivo, editar cadastro) — a ferramenta de "preparar" devolve `approvalId` + hash SHA-256 do `{tool, args}` canônico; a skill mostra destinatário/assunto/conteúdo/anexos no app e pede "aprovo"; só então chama `executar({approvalId, hash})`. Argumento alterado = hash diferente = recusa. A aprovação fica registrada em `op_approvals` com o operador e o instante.
- L5 bloqueado — não existe ferramenta (excluir card, massa sem lista aprovada, equipe/permissões/números/instruções do bot/automações).

**6.4 Conhecimento = vault Obsidian no repo (`docs/operacao/`).**
- Uma nota por hospital (`hospitais/<slug>.md`: modo de solicitação, e-mail/WhatsApp, procuração exigida, prazos, observações), por etapa/coluna (`etapas/<coluna>.md`: o que precisa para entrar e sair), por serviço (`servicos/inss.md`, `dpvat.md`: documentos obrigatórios), por modelo de comunicação (`modelos/email-prontuario.md`), por regra (`regras/*.md`) e um `Mapa da Operação.md` com wikilinks, como o vault do bot em `D:\Chatbot_whatsapp\mapa-obsidian`.
- Frontmatter obrigatório: `kind: oficial | extraido_do_codigo | sugestao_ia`, `status: rascunho | publicado`, `fonte` (id da automação, arquivo, pessoa), `revisado_por`, `atualizado_em`. A IA só age sobre `publicado`; `sugestao_ia` é o que ela propõe e um humano promove.
- Seed por script com dry-run: 283 automações → 283 notas `extraido_do_codigo`; regras dos mapas `docs/ai` relevantes à operação; colunas e etapas atuais.
- Busca: Grep/Read do próprio app (já funciona); espelho no banco (`op_knowledge`, sincronizado por script/CI) para o site exibir e para busca full-text se precisar **[a validar]**.
- Versionamento: git (histórico, PR de revisão). Edição: pelo Obsidian ou pelo app, com `revisor-regras` conferindo frontmatter antes do commit.

**6.5 Registro de tudo (banco) e dashboard (site).**
- Hook `UserPromptSubmit` → `POST /api/op/events {type:"prompt", sessionId, text, cwd}` (token do operador; falha do hook nunca bloqueia o app).
- Cada ferramenta grava `op_tool_calls` (sessão, pedido, ferramenta, args sem PII sensível, resultado resumido, duração, nível, aprovação).
- Hook `PostToolUse` no MCP completa o que o CRM não vê (ferramenta recusada pelo usuário no app, por exemplo).
- Seção "Operação por IA" no Espaço de Trabalho: por dia/operador: pedidos, ferramentas, aprovações concedidas/recusadas, cards tocados (link abre o card), rascunhos gerados, falhas; por card: aba Logs já mostra as ações com `via: claude-app`. Custo: só o das chamadas de IA feitas pelo CRM (Canto da IA); o consumo do app fica fora, declarado como limitação.

**6.6 Identidade e segurança.**
- Um token por operador, criado na tela Equipe (`manage_team`), guardado em `~/.claude` ou em variável de ambiente do usuário, **nunca no repo nem no `.env` do projeto**. Revogação imediata (hash no banco).
- Hooks novos: bloquear `Read/Bash` sobre `.env*` e sobre `DATABASE_URL`; bloquear `node -e`/`prisma`/`psql` que escrevam fora de `scripts/` com `--apply`; mascarar segredos na saída (`mask-secrets.ts` já existe).
- LGPD: respostas de ferramenta mascaram CPF em listas, nunca devolvem `password`/`senha_inss`; `op_requests.text` guarda o prompt (pode conter CPF): retenção 180 d como os `wa_*` **[a validar]**.
- Injeção: conteúdo de comentário/documento/mensagem volta ao modelo como dado; nenhuma ferramenta L3+ executa por instrução vinda de conteúdo; L4 sempre com aprovação digitada pelo operador no app.

## 7. Catálogo inicial de ferramentas (API `/api/op/*`, expostas pelo MCP)

| Ferramenta | Nível | Permissão do operador | Reaproveita |
|---|---|---|---|
| `buscar_cliente({cpf?, nome?, telefone?, cardNumber?})` | L1 | equipe | query nova sobre `User` (+ `searchArchivedCards`) |
| `obter_card({cardNumber|id})` | L1 | equipe | `fetchUserById` com select próprio |
| `listar_historico({card, limite})` | L1 | equipe | `db.log` + `db.comment` |
| `listar_documentos({card, pasta?})` | L1 | equipe | `db.document` + `trySignGetUrl` |
| `listar_colunas()` / `listar_tags()` | L1 | equipe | `getLabels`, `db.cardTag` |
| `listar_cards_parados({coluna?, diasMin})` | L1 | equipe | `statusStartedAt`, `timeLimitDays` |
| `listar_cards_coluna({coluna, filtros})` | L1 | equipe | `fetchUsers` |
| `verificar_pendencias({card})` | L1 | equipe | pastas vazias × checklist × tags × campos da procuração (regra oficial a definir) |
| `consultar_conversa({card})` | L1 | view_whatsapp | `findLinkedCard` + últimas mensagens |
| `consultar_hospital({nome})` | L1 | equipe | vault/`op_knowledge` + GHOST |
| `preparar_procuracao({card, modelo})` | L2 | equipe | `gerarProcuracaoById` + `/convert` → S3 + `Document` rascunho |
| `preparar_pedido_prontuario({card})` | L2 | equipe | `PEDIDO_HOSPITALAR.docx` |
| `preparar_contrato({card})` | L2 | manage_contracts | KIT sem assinatura **[a validar]** |
| `preparar_email({card, hospital|destinatario, assunto, corpo, anexos[]})` | L2 → aprovação | equipe | modelo do vault; destinatário só de hospital cadastrado |
| `preparar_whatsapp({card, texto|template})` | L2 → aprovação | view_whatsapp | templates da WABA do número |
| `mover_card({card, coluna})` | L3 | op_write | núcleo idempotente de movimentação |
| `adicionar_tag` / `remover_tag` | L3 | op_write | lib extraída de `/api/card-tags/assign` |
| `comentar_card({card, texto, mencoes[]})` | L3 | op_write | `createComment` |
| `criar_tarefa({setor|usuario, texto, card})` | L3 | op_write | `recordMentions`/`recordSectorTask` |
| `arquivar_card({card, destino})` | L3 (destrutivo = L4) | archive_cards | `setArchiveStatus` |
| `executar_aprovado({approvalId, hash})` | L4 | op_approve | despacha e-mail (`sendEmailAws` estendido), WhatsApp (`sendSystemWhatsApp`), `updateUser`, arquivar destrutivo |
| `registrar_evento({tipo, payload})` | — | token | usado pelos hooks (prompt, recusa no app) |
| `gerar_relatorio({tipo, filtros})` | L1 | manager_dashboard | actions de analytics (Etapa 7) |

Permissões novas em `PERMISSION_DEFS`/`ROLE_DEFAULTS`: `op_use` (L1/L2), `op_write` (L3), `op_approve` (aprovar L4), `manage_knowledge` (publicar notas do vault no espelho do banco). `read_only` bloqueia L3/L4.

## 8. Plano de implementação priorizado (v2)

| Etapa | Entrega | Onde | Aceite | Risco |
|---|---|---|---|---|
| **0** | Diagnóstico v2, decisões | `docs/ai-first/00-*.md` | Aprovação | — |
| **1** App + leitura | API `/api/op/*` com token por operador (tabela `operator_tokens`, tela Equipe); registry/policy; 10 ferramentas L1; MCP fino `tools/crm-mcp/` registrado em `.mcp.json`; skills `/cliente`, `/processo`, `/parados`, `/pendencias`; tabelas `op_sessions`, `op_requests`, `op_tool_calls`; hooks `UserPromptSubmit`/`PostToolUse`; hook que bloqueia `.env*` e escrita direta no banco | `app/api/op/`, `app/_shared/lib/op/`, `tools/crm-mcp/`, `.claude/skills/op-*/`, `.claude/settings.json`, `permissions.ts`, migration | Perguntas 1, 2, 7, 9 da visão respondidas no app só com dados reais; nenhuma escrita; token revogado → 401; cada prompt e cada ferramenta aparecem em `op_*` | identidade; vazamento de segredo local |
| **2** Vault + S3 | `docs/operacao/` com seed das 283 automações, etapas, serviços, modelos; sincronização do vault para o S3 (`operacao-vault/`, dry-run); `consultar_hospital`; skill `/conhecimento` para propor nota `sugestao_ia`; `revisor-regras` valida frontmatter | `docs/operacao/`, `scripts/seed-vault-hospitais.mjs` (dry-run), `scripts/sync-vault-s3.mjs` | "Como pedir prontuário no Hospital X" responde com a nota e a fonte; nota não publicada não é usada | quem revisa |
| **3** Escrita interna | `mover_card`, tags, `comentar_card`, `criar_tarefa`, `notificar_pessoa`, `arquivar_card`; skill `/meu-dia`; libs extraídas; `op_write`; interruptor L3 por ferramenta em `AppSetting`; automações passam a usar as mesmas libs | `app/_shared/lib/kanban/move-card.ts`, `card-tags.ts`, `sector-tasks.ts`, `automation-executor.ts` | Nome ambíguo pede confirmação; estado relido; automações disparam; log com `via: claude-app`; teste com card de teste | produção única |
| **4** Documentos | `preparar_procuracao`, `preparar_pedido_prontuario`, `preparar_contrato`; campos obrigatórios por modelo; S3 + `Document` rascunho + URL de prévia; skill `/procuracao` | `gerarProcuracaoById.ts`, `op/drafts.ts`, migration `op_drafts` | Campo faltando → lista, nunca `undefined`; prévia abre; nada no body | converter serial |
| **4b** Contrato via ZapSign | skill `/contrato`: KIT em PDF pela ferramenta → Claude in Chrome (ou VM) no ZapSign logado pela pessoa → link de assinatura → colar na conversa com aprovação; registro em `op_tool_calls` | `.claude/skills/op-contrato/`, `preparar_contrato`, `preparar_whatsapp` | Link gerado aparece no card (comentário + log); o Claude nunca digita senha; falha no navegador não deixa estado pela metade | dependência do navegador; mudanças na UI do ZapSign |
| **5** Comunicação aprovada | colunas `hospital_*` nos GHOST; `preparar_email`/`preparar_whatsapp` → `op_approvals` com hash; `executar_aprovado`; `sendEmailAws` com anexos/cc; skill `/prontuario` (13 passos) | `aws-messaging.ts`, `op/policy.ts`, migrations | Alterar conteúdo invalida a aprovação; envio só com hash igual; WhatsApp respeita opt-out/cooldown; dashboard mostra quem aprovou | remetente SES; base de destinatários |
| **6** Workflows com retomada | estado do workflow em `op_requests.state` (passo atual, dados coletados, bloqueio); skills leem/gravam o estado via `op_sessions`; `/retomar` | `op/runner.ts`, skills | Interromper por dado faltante e retomar sem repetir; falha não apaga progresso | estado |
| **7** Dashboard + proativo | Seção "Operação por IA" no Espaço de Trabalho (por operador: pedidos, dúvidas, ferramentas, aprovações, cards conduzidos, falhas, tempo); skill `/auditoria-operacao` sobre `op_*`; `gerar_relatorio`; skill `/varredura` (parados, inconsistências, duplicados) com evidências | `app/nova-dash/workspace/operacao/`, `app/_actions/op/metrics.ts` | Toda sugestão cita card/log/regra; nenhuma regra oficial alterada pela IA | ruído |
| **8** Autonomia gradual | Abrir L3 por ferramenta/operador com base nas métricas; avaliar L4 sem confirmação só onde política permitir | `policy.ts`, Segurança | Decisão por dados | — |

Cada etapa: `/validar`, teste manual com card de teste, `/mapa-atualizar`, documento `docs/ai-first/0N-*.md`.

## 9. Critérios de aceite da primeira versão funcional (Etapa 1)

1. Operador com token válido abre o Claude Code neste repo e pergunta "encontre o cliente de CPF X e mostre os processos"; o MCP responde com os cards (ativos e arquivados), número, coluna, etapa, serviço; CPF mascarado na lista.
2. "Processo 2342: status atual" → coluna, dias na coluna, etapa, tags, últimas 5 ações.
3. "Processos parados há mais de 7 dias" → lista por coluna com `statusStartedAt`, paginada.
4. "Quais documentos faltam" → pastas vazias e checklist não marcado, dizendo que a lista oficial por serviço ainda não existe.
5. Nenhuma ferramenta de escrita no MCP da Etapa 1; a skill recusa alteração e diz o que virá.
6. Token revogado ou de cliente → 401/403; `read_only` não muda nada em L1.
7. Cada prompt vira `op_requests` e cada ferramenta vira `op_tool_calls` (sessão, operador, duração, resultado); visível por consulta até a Etapa 7 montar a tela.
8. Hooks: `Read`/`Bash` sobre `.env*` bloqueados; escrita direta via Prisma/SQL fora de `scripts/*.mjs --apply` bloqueada; saída com segredo mascarada.
9. `password`/`senha_inss` nunca saem de nenhuma ferramenta.
10. Testes vitest: schemas zod ↔ JSON Schema do MCP, policy (níveis, hash canônico), máscara de PII, parser "processo 2342 / #2342 / CPF", normalização de coluna, validação de token; `tsc`/lint limpos.

## 10. Decisões (respostas do dono em 24/10/2026)

### Decididas
| # | Tema | Decisão | Efeito no plano |
|---|---|---|---|
| 1 | Interface | Claude Code/desktop neste repo (skills + MCP). Site só ganha dashboard "Operação por IA" e tela de tokens. | Mantido. |
| 2 | Quem opera | **Cada membro com token próprio**, mapeado ao `User` dele; o que ele pode fazer vem do cargo e das permissões do banco. | Tela Equipe ganha "Token do app" (gerar/revogar); toda ferramenta checa `resolvePermissions` do operador; log com `authorId` = pessoa. |
| 3 | Trava de IP | **Bypass por token + banco**: se a permissão do operador no banco libera, o Claude executa; se não libera, o Claude não prossegue e não devolve dados. | Rota `/api/op` não aplica a trava de IP; aplica permissão por ferramenta; recusa = resposta `{ok:false, code:"sem_permissao"}` e a skill para. |
| 4 | Vault | Dentro do repo (`docs/operacao/`). | Mantido. |
| 7 | Prompts | Gravar o **texto completo** do prompt; quem acessa são gestores (`manager_dashboard`). | `op_requests.text` completo; leitura só com `manager_dashboard`; retenção a definir depois (padrão: não purgar). |
| 8 | Custo | Medir pedidos/ferramentas/duração; consumo do app fica fora. | Mantido. |
| 10 | Serviços | **O sistema não atende mais DPVAT.** Só INSS (e os demais que existirem). | Ferramentas, notas do vault e lista de documentos só para INSS; etapas `DPVAT_S*` ficam como legado em cards antigos, sem ferramenta nova. |
| 11 | E-mail / plano por pessoa | Mapeamento de e-mail fica para depois. O chat pode dizer "de quem, para quem". **Cada pessoa terá seu próprio plano de trabalho e os agentes do Claude trabalham em conjunto (Cowork) para cumprir.** | Nova skill `/meu-dia` (cards do operador, pendências, próximos passos) na Etapa 3; e-mail segue na Etapa 5 com destinatário informado no chat até o cadastro existir. |
| 13 | Contrato | Contrato continua no **ZapSign**: o Claude, pelo navegador da pessoa (Claude in Chrome) ou numa VM, entra no ZapSign, sobe os documentos, preenche os dados e gera o link de assinatura. | Nova **Etapa 4b** (ver §8): skill `/contrato` que gera o KIT em PDF pela ferramenta, abre o ZapSign no navegador logado pela pessoa, preenche e devolve o link; o link é colado na conversa pela ferramenta de WhatsApp com aprovação. Limites: o Claude não digita senha nem cria conta (a pessoa faz o login); a integração por API do ZapSign foi removida em 30/07 por exigir plano próprio. |
| 14 | Mudança de etapa | **Aprovação por chat.** A equipe conduz a IA; a IA sugere os próximos passos. | `status` entra como L4 (preparar → mostrar → "aprovo" → executar). Toda skill termina com "Próximos passos sugeridos". |
| 15 | Migrations | Aprovadas (aditivas, via `/migration`). | Mantido. |
| 16 | Mapas | Aprovado rodar `/mapa-atualizar auth-permissoes kanban-cards documentos-ia` antes da Etapa 1. | Primeira tarefa da Etapa 1. |

### Fechadas na segunda rodada (24/10)
| # | Tema | Decisão | Efeito no plano |
|---|---|---|---|
| 5 | Vault × site | **Sem tabela espelho.** O vault (`docs/operacao/`) é sincronizado como arquivos para o S3 (prefixo `operacao-vault/`); quando o site precisar de uma nota, lê de lá. O que o dono quer ver no site é o **rendimento de cada pessoa, as dúvidas que fizeram, o que pode melhorar e uma auditoria posterior** — isso vem das tabelas `op_*`, não do vault. | Etapa 2: script `sync-vault-s3.mjs` (dry-run, só sobe o que mudou). Etapa 7: dashboard por operador (pedidos, dúvidas, ferramentas, aprovações, tempo, cards tocados) + skill `/auditoria-operacao` que lê `op_*` e gera relatório com evidências. |
| 6 | Automações + parceria | As automações continuam. Além disso o Claude deve **ler o que está no card** (comentários, notas, menções) e **agir como parceiro**: se a nota marca a pessoa X, sugerir "falar com X / enviar para Y — quer que eu notifique?" e, com o "sim", criar a tarefa/menção. | Toda skill termina com "Próximos passos sugeridos"; nova ferramenta L3 `notificar_pessoa({usuario|setor, texto, card})` sobre `recordMentions` (aparece na caixa de Menções e no sino); sugestão nunca executa sozinha, só após o "sim" no chat. |
| 9 | Hospitais | **Colunas nos próprios registros GHOST** (`hospital_email`, `hospital_telefone`, `hospital_modo` presencial/e-mail/whatsapp, `hospital_obs`), sem tabela nova; preenchidas a partir das notas do vault. | Etapa 5: migration aditiva em `User` (nullable); `consultar_hospital` lê GHOST + nota. `migrate-hospitals`/`seed-hospitals` continuam proibidos (apagariam as colunas). |
| 12 | "Responsável" | **Não é campo fixo.** Responsável = **quem está conduzindo a IA naquele momento no card**; o card passa por várias pessoas. | Já coberto pelo registro por operação: `op_requests`/`op_tool_calls` guardam operador + card + instante, e o log de domínio leva `authorId` da pessoa. O card mostra "última condução por IA: fulano, data" (aba Logs) e o dashboard mostra quem conduziu cada card e quando. `/meu-dia` = cards que a pessoa conduziu recentemente + tarefas dela. |

**Todas as 16 decisões estão tomadas. A Etapa 1 pode começar.**

## Anexo A — divergências entre mapas e código
- `docs/ai/auth-permissoes.md`: 23 chaves → o código tem 30 (`teach_bot`, `view_security`, `view_ai_brain`, `view_whatsapp`, `read_only`, `dashboard_only`, `export_leads_csv`); faltam `assertCanWrite`, `requireTeamWrite`, `readOnlyBlock`.
- `docs/ai/kanban-cards.md`: `setArchiveStatus` já exige `archive_cards`; `/api/logs` confere `TEAM_ROLES` pelo JWT; várias actions usam `assertCanWrite`.
- `docs/ai/documentos-ia.md`: não cita os 6 `.docx` de `templates/` (inclusive `PEDIDO_HOSPITALAR.docx`); `/api/procuracao` usa `readOnlyBlock()`; fallback `"procuracao.docx"` não existe; `sendEmailAws` só 1 destinatário sem anexo; Gerador IA roda `gemini-3.6-flash`, ausente de `MODEL_PRICING`.
- `docs/ai/data-model.md`: GHOST tem e-mail fake e nenhum contato; `Process` com 0 linhas em 24/10/2026.
- Nenhum mapa documenta `app/api/chat/modules/*` nem a divergência de versão do SDK Anthropic entre Next (0.115) e micro (0.110).
