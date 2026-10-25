# AI-First — Etapa 3: resultado (25/10/2026, implementada e validada localmente; deploy e teste manual pendentes)

> Plano: `docs/ai-first/03-plano-etapa-3.md`. Mapa técnico: `docs/ai/operacao-ia.md` (ferramentas L3, prévia, interruptor) e `docs/ai/kanban-cards.md` (libs de escrita no card). Próxima etapa: `docs/ai-first/04-plano-etapa-4.md`.

## Estado por passo do plano
| Passo | Estado | Onde |
|---|---|---|
| 0. Pendências | ⏳ | push de `de530d2` vai junto com este commit (o dono publica). **Card de teste e tag `TESTE IA` não foram criados** (nada foi gravado em produção nesta etapa) — criar antes do teste manual |
| 1. Libs de escrita | ✅ | `app/_shared/lib/cards/{types,move-card,tags,comment,archive}.ts`, `app/_shared/lib/notifications.ts`, `createSectorTask`/`loadSectorAudience` em `sector-tasks.ts`, `source: "op"` na Caixa de Menções (`mention-inbox.ts`, `mention-actions.ts`, `MentionsInbox.tsx`: filtro "IA", badge "IA de operação") |
| 1. Wrappers da UI | ✅ | `updateKanbanStatus`, `createComment` → `requireTeamWrite()`; `/api/card-tags/assign` → `teamRoute()` + log; `setArchiveStatus` → `setCardArchive` |
| 1. Executor de automações | ✅ | `comment`/`add_tag`/`move` pelas libs; `skipActionTypes` com log `automation_skip` |
| Revisão | ✅ | `revisor-regras`: 1 bloqueio (WhatsApp em cadeia de `move` escapava do "não manda") + 3 correções (comment_add de automação contando como atividade, menção escondida no texto, consulta do painel sem corte de data) — todos corrigidos |
| 2. Política, interruptor, prévia | ✅ | `OP_MAX_LEVEL = 3`, `ferramenta_desligada`; `op/switches.ts` (`op_l3_switches`, cache 15 s); `op/preview.ts` (`previewOrExecute`); rota passa `trace {sessionId, requestId}` e não grava `previa_hash` nos args |
| 2. Seção "IA de operação" | ✅ | Espaço de Trabalho → `app/nova-dash/workspace/operacao/OpSwitchesPanel.tsx` + `app/_actions/op/switches.ts` (ver: `manage_team`/`manager_dashboard`; alterar: `manage_team`) |
| 3. Ferramentas L3 | ✅ | `mover_card`, `adicionar_tag`, `remover_tag`, `comentar_card`, `notificar_pessoa`, `arquivar_card` — todas desligadas por padrão |
| 4. `meu_dia` + `/meu-dia` | ✅ | `tools/meu-dia.ts`, `app/_shared/utils/meu-dia.ts`, `.claude/skills/meu-dia/SKILL.md`; `meu_dia` no `allow` |
| 5. Skills com escrita guiada | ✅ | bloco "Regras de escrita" em `/cliente`, `/processo`, `/parados`, `/pendencias`, `/meu-dia` |
| 6. Registro/atribuição | ✅ | logs com `authorName "<nome> (via IA)"`, `metadata.source/op`; `scripts/op-relatorio.mjs` ganhou a seção "Escritas" |
| 7. Testes/validação/docs | ✅ local | ver Evidências; mapas `operacao-ia.md` e `kanban-cards.md` atualizados |
| 8. Liberar para a equipe | ⏳ dono | depois do aceite: `op_write: true` em `ROLE_DEFAULTS` de ADMIN/ADMIN+ |
| 9. Script de teste | ✅ | `scripts/op-testar-ferramenta.mjs` aceita L3 **só em prévia** (força `confirmar: false`) e `--usuario=<id>` |

## Evidências (25/10/2026)
- `npx tsc --noEmit` 0 erros · eslint nos arquivos alterados 0 · `npm test` 69 arquivos, **951 testes ok** (novos: `card-writes` 12, `op-preview` 7, `meu-dia` 2, `op-policy` +5, `op-registry` reescrito).
- Prévias contra o banco de produção, **só leitura** (script, card 4967 de cliente real, nada gravado):

| caso | resultado |
|---|---|
| `adicionar_tag` AFASTADOS | prévia `antes [COM SENHA] → depois [AFASTADOS, COM SENHA]`, aviso de card arquivado, `previa_hash` |
| `adicionar_tag` "afast" | `ambiguo` com AFASTADOS / AFASTOU INSS / NÃO AFASTOU (nunca escolhe) |
| `comentar_card` com `[[AI_AUDIT…]]` e `confirmar: true` | script ignorou o `confirmar`; texto saiu sanitizado `[ [AI_AUDIT…` |
| `arquivar_card` DESISTIRAM EXPRESSAMENTE | `requer_aprovacao` |
| `arquivar_card` VOLTAR UM DIA | prévia DESCARTADOS ANÁLISE INTERNA → VOLTAR UM DIA |
| `notificar_pessoa` "comercial" | tarefa de setor para 6 pessoas, `tarefaCompartilhada: true` |

- `listar_colunas`/`mover_card` não rodam pelo script (`fetchLabels` usa `unstable_cache`, só existe dentro do Next) — testar pelo app depois do deploy.

## Decisões tomadas na implementação
- **Automações do mover rodam via `runAfterResponse`** (antes: promise solta). Mesmo comportamento no site, sem o risco de a Vercel congelar a função.
- **Soltar o card na mesma coluna agora é noop** (antes zerava o timer e rodava as automações de novo). Os callers da UI já filtravam; agora a lib garante.
- **Log de tag do site passou a existir** (`tag_add`/`tag_remove`); para não inflar "tarefas" da Visão do Gestor, os dois entraram em `NON_ACTIVITY_LOG_ACTIONS` (a automação `add_tag` antes contava como atividade de quem moveu).
- **Comentário de automação continua sem `comment_add`** (o autor do log seria quem moveu e contaria como atividade dele) e nunca lança (try/catch). Autor de sistema (`"system"` do cron de prazo) vai com `authorId` nulo na FK do `Comment` — antes a FK provavelmente recusava e a ação abortava o cron.
- **`enviar_whatsapp` fora do `previa_hash`**: a prévia já mostra o texto e pergunta "mandar também?" junto do "Confirma?"; assim o operador responde as duas coisas de uma vez.
- **Mover pela IA bloqueia WhatsApp de automação por padrão** (achado do `revisor-regras`): só sai com `enviar_whatsapp: true`. A prévia não segue cadeias de `move` nem é amarrada às automações; pular sempre fecha esse buraco.
- **`@[Nome](id)` dentro do texto do comentário da IA vira texto** (achado do revisor): menção só pelos nomes que a prévia mostrou.
- **O servidor prova que houve prévia, não que o operador disse "sim"** — quem garante o "sim" são as skills + o pedido de permissão do Claude Code por chamada L3 + interruptores desligados por padrão. Limitação de arquitetura; a aprovação digitada no app é da Etapa 5 (L4).
- **Comentário repetido** (mesmo texto, mesmo operador, ≤ 10 min) = `noop`, para o modelo não duplicar ao reenviar a confirmação.
- **Arquivo com mesmo destino = noop** (não troca a data que alimenta as planilhas Caique/UNI).
- **Nome de pessoa**: igual ao nome completo, ou primeiro nome que casa com uma pessoa só (≥ 3 letras); a prévia mostra o nome completo. Mais de uma → `ambiguo`.

## Para o dono validar (ordem sugerida)
1. Publicar (push da `main` → Vercel). Conferir o site: arrastar card, marcar/tirar tag (aparece no histórico), comentar com @menção, arquivar/desfazer — tudo igual a antes.
2. Criar o card de teste "TESTE IA — não mexer" numa coluna sem automação de WhatsApp e a tag `TESTE IA`.
3. Espaço de Trabalho → **IA de operação** → ligar as 6 ações.
4. Reiniciar o Claude Code (catálogo novo) e rodar os casos do passo 7 do plano no card de teste: prévia sem escrita → "sim" → estado relido; repetir = noop; mexer no site entre prévia e "sim" → `estado_mudou`; coluna com automação de comentário; tag add/remove; comentário com menção; notificar setor; arquivar não destrutivo/desarquivar; destino destrutivo recusado; desligar o interruptor → some do catálogo; ADMIN sem `op_write` → `sem_permissao`.
5. `node -r dotenv/config scripts/op-relatorio.mjs --dias=1` → seção "Escritas".
6. OK → passo 8 (liberar `op_write` para ADMIN/ADMIN+).

## Pendências e riscos conhecidos
- `docs/ai/workspace-equipe.md` tem mudanças locais do dono (Cérebro APP) e **não foi editado**: falta registrar lá a origem `op` da Caixa de Menções e a seção "IA de operação" (já descritas em `operacao-ia.md`).
- `notificar_pessoa` não grava `Log` (não há card obrigatório); o rastro fica em `op_tool_calls` + `Mention`/`Notification`.
- Executor de automações migrado: validar no site com uma coluna que tenha automação de comentário e de tag (o comentário agora aparece também no histórico).
