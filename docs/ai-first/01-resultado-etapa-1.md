# AI-First — Etapa 1: resultado (24/10/2026)

> Execução de `docs/ai-first/01-plano-etapa-1.md` na ordem do arquivo. Mapa técnico vivo: `docs/ai/operacao-ia.md`. Commit `ea0de1f`, publicado na Vercel e testado pelo dono em 24/10/2026 (ver "Evidências em produção"). Próxima etapa: `docs/ai-first/02-plano-etapa-2.md`.

## Resumo
- O operador já pode, **depois do deploy e de receber um token**, perguntar no Claude Code sobre clientes, processos, parados e pendências; as respostas vêm só de 10 ferramentas de **leitura** do CRM, que respeitam as permissões do banco.
- Cada prompt vai para `op_requests` e cada ferramenta para `op_tool_calls` (com operador, sessão, duração, resultado e cards tocados).
- Nenhuma ferramenta escreve no CRM. As únicas escritas novas são o registro em `op_*` e a criação/revogação de token na tela Equipe.

## O que foi feito, passo a passo

| # | Passo do plano | Feito | Onde |
|---|---|---|---|
| 0 | Mapas `auth-permissoes`, `kanban-cards`, `documentos-ia` (Anexo A) | ✅ | 30→34 chaves e 7 categorias; `assertCanWrite`/`requireTeamWrite`/`readOnlyBlock`; permissões só de UI; `setArchiveStatus`/`deleteCard` com permissão; `/api/logs` e `/api/board-state` pelo JWT; `Process` com 0 linhas; os 6 `.docx` de `templates/` e os campos de `gerarProcuracaoById`; `PEDIDO_HOSPITALAR.docx` sem chamador (as automações usam cópias no S3); fallback `procuracao.docx` inexistente; `/api/procuracao` só com `readOnlyBlock`; `sendEmailAws` 1 destinatário sem anexo; `gemini-3.6-flash` fora de `MODEL_PRICING`; protótipo `app/api/chat/modules` (não reaproveitar); SDK Anthropic 0.115 × 0.110. Também: GHOST sem contato no `data-model.md`; `/api/costs/sync` já liberado no middleware (o `infra-integracoes.md` e o `app/api/CLAUDE.md` diziam o contrário) |
| 1 | Schema `op_tables` via `/migration` | ✅ aplicada | `prisma/migrations/20261024170000_op_tables/` — só `CREATE TABLE/INDEX/FK` (o `DROP TABLE "discord"` do drift foi removido do SQL); `db execute` → `migrate resolve` → `generate` |
| 2 | Permissões | ✅ | categoria "Operação por IA": `op_use` (3 cargos), `op_write`/`op_approve`/`manage_knowledge` (só ADMIN++); `tests/permissions.test.ts` |
| 3 | Auth por token + tela Equipe | ✅ | `app/_shared/lib/op/auth.ts`; botão "Token do app" (`OperatorTokensDialog.tsx`); actions `operator-tokens.ts` |
| 4 | API `/api/op` | ✅ | `GET /api/op/tools`, `POST /api/op/tools/[tool]`, `POST /api/op/events`; `/api/op` em `PUBLIC_API_PREFIXES` |
| 5 | Registry, policy, resolve, 10 ferramentas | ✅ | `app/_shared/lib/op/` |
| 6 | MCP fino | ✅ | `tools/crm-mcp/index.mjs` + `.mcp.json` (+ `enabledMcpjsonServers` no `.claude/settings.json`) |
| 7 | Hooks | ✅ | `op-prompt.mjs` (UserPromptSubmit), `op-tool.mjs` (PostToolUse `mcp__crm-op__.*`), `guard-secrets.mjs` (Read/Grep), `guard-bash.mjs` reescrito sobre `bash-rules.mjs` |
| 8 | Skills | ✅ | `/cliente`, `/processo`, `/parados`, `/pendencias` |
| 9 | Testes, `/validar`, mapa | ✅ | 5 arquivos de teste novos; `docs/ai/operacao-ia.md` + linha no `CLAUDE.md` raiz |

## Validação (resultado real)
| etapa | resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| eslint nos arquivos alterados/novos | 0 erros |
| `npm test` | 64 arquivos, 904 testes passando (5 skipped, os smoke de assinatura) — inclui 47 testes novos de `op-*` e `guard-bash` |
| `npx prisma validate` | ok; migration correspondente criada e aplicada |
| `npm run docs:check` | 28 docs, 0 referência quebrada |
| Dev server local (`npm run dev`) | `GET /api/op/tools` sem token → 401 `sem_token`; token falso → 401 `token_invalido` (já consultando `operator_tokens`); `POST /api/op/tools/obter_card` e `/api/op/events` sem token → 401; sem erro no log do servidor |
| MCP por stdio | `initialize`, `tools/list` (só `diagnostico_crm` sem token) e `tools/call` respondem no formato JSON-RPC |
| Hook de segredo | ativo nesta própria sessão: barrou comandos que citavam `.env` |
| `revisor-regras` | nenhuma violação que bloqueie; 1 ponto de atenção corrigido (ver abaixo) |

### Revisão de regras (`revisor-regras`)
- **Corrigido — `dashboard_only`**: quem está em "Somente Dashboard" herdava `op_use` do cargo e poderia ler a ficha completa (CPF, RG, endereço) pelo `obter_card`. `canRun` agora recusa esse perfil (`sem_permissao`); teste em `tests/op-policy.test.ts`.
- ~~Telefone nos args mascarado~~ — corrigido na revisão e depois **revertido por decisão do dono** (CPF e telefone sem máscara; ver "Mudanças depois do teste").
- Sem ação: o botão "Token do app" já fica dentro do bloco `canManage` da tela Equipe (o revisor achou que aparecia para todos); `rateLimit` por instância (já documentado em `rate-limit.ts`; token de 32 bytes torna chute inviável); `session.json` único por máquina (desvio 9 abaixo).
- Conferido sem violação: as 3 rotas começam com `opAuth`; permissões lidas do banco; `password` nunca selecionado e `senha_inss` só vira booleano; as 10 ferramentas só leem; `$queryRaw` parametrizado; cortes de dia por `date-br`; `Document` com `deletedAt: null`; sem `distinct`+`orderBy` em tabela grande; único pós-resposta via `runAfterResponse`; hooks sempre saem 0; migration aditiva.

## Evidências em produção (24/10/2026)
- **Deploy**: push `b9c6c1d..ea0de1f` na `main`; a Vercel publicou em ~2 min. Sem token, `GET https://segurosparana.com.br/api/op/tools` → `{"ok":false,"code":"sem_token",…}` (a rota responde; o middleware não barra).
- **Antes do deploy**, `diagnostico_crm` com token configurado → `conectado: false`, `"O CRM respondeu 401"` (site ainda sem a rota). **Depois**: `conectado: true`, operador **Samuel Guibor (ADMIN++)**, as 10 ferramentas `permitido: true`.
- **Testes do dono numa sessão da aba Code** (pasta do repo): `/cliente`, `/processo`, `/parados`, `/pendencias`, pedido de alteração recusado — reportados ok.
- **Registro no banco** (`node -r dotenv/config scripts/op-relatorio.mjs --dias=2`, transação READ ONLY):

  | item | valor |
  |---|---|
  | tokens | 1 (Samuel, "Claude Code", criado 17:23, último uso 18:01) — **não revogado** |
  | sessões do app | 4 |
  | prompts (`op_requests`) | 9 — `/processo` 2, `/cliente` 1, `/parados` 1, `/pendencias` 1, texto livre 4 |
  | chamadas (`op_tool_calls`) | **11, todas ok, todas ligadas ao prompt que as pediu**; 94 cards distintos lidos |
  | por ferramenta | `verificar_pendencias` 3 (155 ms) · `obter_card` 2 (76 ms) · `listar_historico` 2 (129 ms) · `buscar_cliente` 1 (230 ms) · `listar_cards_parados` 1 (144 ms) · `listar_documentos` 1 (34 ms) · `consultar_conversa` 1 (58 ms) |
  | prompt contendo token (`crmop_…`) | nenhum |

- **Não aparece no banco, e é esperado**: recusa por token inválido/revogado (401 acontece antes de saber quem é o operador, não vira `op_tool_calls`); pedido de "mover card" (a skill recusa sem chamar ferramenta).
- **Lacuna da evidência**: o relatório mostra o único token **ativo**, então o teste de revogação não ficou registrado como revogação (ou foi feito com outro caminho). Ver pendências.

## Conclusões
1. **A arquitetura funciona ponta a ponta**: prompt → hook → `op_requests`; skill → MCP → `/api/op` → permissões do banco → ferramenta → `op_tool_calls`, com a ligação prompt↔ferramenta funcionando (11/11).
2. **Latência baixa** (34–230 ms por ferramenta): as consultas com `select` mínimo e `take` baixo não pesam no Neon.
3. **O ponto de atrito foi o ambiente, não o código**: skills e MCP só existem numa sessão da **aba Code aberta na pasta do repo**; na aba de chat o `/cliente` "não existe". Isso precisa estar no material de cada operador.
4. **O token é o elo sensível**: colado num chat, fica no histórico. O hook não gravou o token no banco (não estava ligado na hora), mas o token segue válido até ser revogado.
5. A Etapa 2 pode começar: a base de dados de leitura está provada; falta a base de **conhecimento** (como se faz), que é o vault.

## Mudanças depois do teste
- **CPF e telefone sem máscara** (decisão do dono, 24/10): `buscar_cliente` devolve CPF e telefone completos; `op_tool_calls.args` grava os args como vieram (só senha/credencial removidas por `stripSensitive`). `maskCpf`/`maskPhone`/`stripSensitiveArgs` saíram de `app/_shared/lib/op/policy.ts`; `parseCardRef` passou a usar o `isValidCpf` de `app/_shared/utils/format.ts` (era duplicado).
- `scripts/op-relatorio.mjs`: relatório de uso de `op_*` (só leitura), com alarme para prompt que contenha token.

## Pendências
- **Revogar o token colado no chat e gerar outro** (Equipe → Token do app) e trocar `CRM_OP_TOKEN`.
- Distribuir token para 1–2 operadores e orientar: aba Code + pasta do repo.
- Bug fora do escopo: `findLinkedCard` com `'\D'` (ver "Achados").

## Critérios de aceite (§9 do diagnóstico)
| # | Critério | Situação |
|---|---|---|
| 1 | CPF → cards ativos e arquivados (CPF mascarado no plano original) | ok em produção (`buscar_cliente` + `/cliente`); máscara removida depois, por decisão do dono |
| 2 | "Processo 2342: status atual" | implementado (`obter_card` + `listar_historico` 5–10) |
| 3 | Parados há mais de 7 dias, por coluna | implementado (`listar_cards_parados`, dias em Brasília) |
| 4 | Documentos que faltam, avisando que a lista oficial não existe | implementado (`verificar_pendencias`, campo `aviso`) |
| 5 | Nenhuma ferramenta de escrita; a skill recusa alteração | ok (`tests/op-registry.test.ts` exige todas L1; `OP_MAX_LEVEL = 2`; regra nas 4 skills) |
| 6 | Token revogado/de cliente → 401/403; `read_only` não muda L1 | ok em teste unitário (`op-auth`, `op-policy`); falta chamada real com token revogado |
| 7 | Prompt → `op_requests`, ferramenta → `op_tool_calls` | implementado; falta conferir no banco após o primeiro uso |
| 8 | Bloqueio de `.env*`, escrita direta, segredo na saída | ok (`guard-secrets`, `bash-rules` + `tests/guard-bash.test.ts`). "Mascarar segredo na saída" ficou como **bloqueio** de comandos que imprimem segredo, não como filtro de saída (hook não reescreve stdout) |
| 9 | `password`/`senha_inss` nunca saem | ok: nenhuma ferramenta devolve; `obter_card`/`verificar_pendencias` só dizem `senhaInssCadastrada`; `stripSensitive` como segunda barreira |
| 10 | Testes vitest + tsc/lint limpos | ok |

## Desvios do plano (e por quê)
1. **MCP sem `@modelcontextprotocol/sdk`**: JSON-RPC por stdio escrito à mão (~200 linhas). Motivo: nada de `npm install` na máquina de cada operador e nenhum `node_modules` extra dentro do repo (o `tsconfig` inclui `**/*.ts` e varreria a pasta). O protocolo usado é pequeno (`initialize`, `ping`, `tools/list`, `tools/call`).
2. **JSON Schema sem dependência nova**: `zod/v4` (`z.toJSONSchema`), que já vem no zod 3.25 do projeto, em vez de `zod-to-json-schema`.
3. **Skills em `.claude/skills/<nome>/`** (`cliente`, `processo`…), não `op-*`: o nome da pasta é o comando; com `op-` o operador teria de digitar `/op-cliente`.
4. **`operatorId` sem FK** em `op_sessions`/`op_requests`/`op_tool_calls` (o plano dizia FK para `User`): excluir um membro apagaria ou travaria a auditoria. Mesmo padrão de `Log.authorId`. `operator_tokens.userId` tem FK com cascade, como no plano.
5. **`op_tool_calls.sessionId` opcional**: chamada sem `X-Op-Session` (curl, teste) ainda é registrada.
6. **Quem gera token = só `manage_team`** (o plano pedia confirmar se cada membro gera o seu). Escolhi o mais restrito porque o token **dispensa a trava de IP**: deixar o membro gerar o próprio seria deixá-lo sair do escritório sozinho. Se quiser autoatendimento, é uma action a mais com `requireTeam()`.
7. **`verificar_pendencias` não semeia o checklist** (a rota da aba Arquivos semeia no primeiro GET): ferramenta de leitura não escreve; checklist sem linhas = itens padrão desmarcados, com `checklistNuncaAberto: true`.
8. **Ferramentas leem só `User`**: `Process` tem 0 linhas em produção; o ponto de extensão é `app/_shared/lib/op/cards.ts`.
9. **Sessão do Claude Code → MCP**: o app não passa o id da sessão ao MCP. O hook `op-prompt.mjs` grava o id em `~/.claude/crm-op/session.json` e o MCP o envia em `X-Op-Session` (fallback: `CLAUDE_SESSION_ID`, depois um uuid do processo). Com duas conversas abertas ao mesmo tempo, a ferramenta pode ser ligada ao prompt da conversa mais recente.
10. **Recusa de ferramenta no app não é registrada**: o Claude Code não dispara `PostToolUse` quando o operador recusa a chamada. As 10 ferramentas de leitura foram liberadas sem pergunta em `.claude/settings.json`, então isso só aconteceria com ferramenta futura.
11. Teste antigo que já falhava: `tests/permissions.test.ts` esperava `dashboard_only = true` no ADMIN++ (o código é `false`, é restrição). Corrigido no teste.

## Achados durante a etapa (fora do escopo, não corrigidos)
- **`findLinkedCard` (`app/_shared/lib/whatsapp/bot.ts`) usa `'\D'` dentro de `Prisma.sql`**: o template literal "cozinha" para `'D'`, então o `regexp_replace` tira a letra D em vez dos não-dígitos. A busca do card pelo telefone (últimos 8 dígitos) falha quando o telefone do card está gravado com máscara ("(41) 99786-2323"). As queries novas usam `'\\D'`, como `find-duplicate.ts`. Correção de uma linha em duas queries; afeta o vínculo conversa↔card do bot.
- Mapas: `docs/ai/infra-integracoes.md` e `app/api/CLAUDE.md` diziam que `/api/costs/sync` estava fora do middleware; já estava dentro (corrigido nos mapas).
- `prisma@6.5.0` × `@prisma/client@6.6.0` (aviso no `generate`, pré-existente).

## Riscos
- **Token = acesso fora do escritório.** Mitigação: só o Super Admin emite; revogação imediata; `lastUsedAt` na tela; log `update` com `metadata.stage = "operator_token"`.
- **Prompt completo pode ter CPF/dado pessoal** (decisão 7). Sem retenção definida; leitura futura só por `manager_dashboard`.
- **Prompts de desenvolvimento também são registrados** se o desenvolvedor tiver `CRM_OP_TOKEN` no ambiente (o hook roda em todo prompt neste repo).
- **Injeção por conteúdo**: comentários, nomes de arquivo e mensagens de cliente entram no contexto. Nesta etapa o dano máximo é uma resposta errada (não há ferramenta de escrita); a regra está nas skills e nas `instructions` do MCP.
- **Guard de segredo por texto** pode dar falso positivo (comando que só *cita* `.env`, inclusive em mensagem de commit). Preferi errar para o lado do bloqueio.
- **Banco único de produção**: as ferramentas usam `select` mínimo e `take` baixo; `listar_cards_parados` carrega os ~300 cards ativos de uma vez (barato hoje; revisar se o board passar de alguns milhares).

## Como colocar no ar
1. Revisar e commitar (`Operação por IA: Etapa 1 — API de leitura, MCP, hooks e skills`) e deixar a Vercel publicar a `main`.
2. Logado como ADMIN++: Equipe → membro → **Token do app** → Gerar → copiar.
3. No computador da pessoa: variável de ambiente do **usuário** `CRM_OP_TOKEN` = token (nunca no `.env` do projeto). Reiniciar o Claude Code e abrir este repositório; aprovar o MCP `crm-op` se pedir.
4. Rodar `diagnostico_crm` → deve mostrar o operador e as 10 ferramentas.
5. Teste com card de teste: `/cliente <nº do card de teste>`, `/parados 7`, `/pendencias <nº>`; conferir as linhas em `op_requests`/`op_tool_calls`; revogar o token e ver o 401.

## Fora desta etapa (mantido)
Ferramentas L3+ (mover, tag, comentar, tarefa), vault `docs/operacao/`, colunas `hospital_*`, e-mail com anexo, ZapSign, dashboard "Operação por IA" no site, `/meu-dia`, retomada de workflow.
