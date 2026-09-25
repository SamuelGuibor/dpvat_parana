# Plano de correção — auditoria do WhatsApp IA (24–25/09/2026)

## Resumo em palavras simples (revisado em 25/09)

**O que muda para quem usa:** o WhatsApp do CRM responde na hora ao clique (tag, assumir, encerrar, enviar) e para de recarregar sozinho. Os documentos do cliente param de sumir e ficam fáceis de achar e anexar. O bot para de atropelar o atendente. E o chefe ganha números que mostram de verdade como a IA está indo.

**Saiu do plano:**
- **Calendário de pagamentos (antigo PR10):** é trabalho seu em andamento. Atenção: a migration dele já está aplicada no banco de produção. Por isso, toda migration nova deste plano (PR11, PR52, PR56) vai sugerir apagar as tabelas do calendário. Apague essas linhas à mão antes de aplicar, como já se faz com o `DROP TABLE "discord"`.
- **Antigo PR04 (tirar o atraso da resposta do bot):** o atraso fica como está.

**Fase 0 — arrumar a casa**
- PR00: levar o harness (mapas, /migration, /validar) para a `main`. Decidir o que fazer com o commit "a", que põe um e-mail fixo na lista de revisores da IA.

**Fase 1 — consertos urgentes e rápidos**
- PR01: renomear um documento que veio do WhatsApp não apaga mais o arquivo da conversa. A limpeza da lixeira também não.
- PR02: colocar o servidor na mesma região do banco. Hoje cada consulta paga ~70 ms de "viagem".
- PR03: o inbox para de recarregar a lista inteira quando você volta para a aba e a cada 2 minutos.
- PR05: o bot não manda mais "vou encerrar seu atendimento" de madrugada.
- PR06: dois bugs do painel do chefe (com um número selecionado, mostra todos; caixa de erro na "Origem dos leads").
- PR07 a PR09: tempo limite no download de mídia, upload do card mais leve e um relatório (só leitura) de quais mídias já quebraram.

**Fase 2 — inbox rápido (a principal queixa)**
- PR11: índices no banco, aplicados fora do horário comercial.
- PR12: a contagem de "não lidas" fica ~9 vezes mais rápida.
- PR13: tirar uma camada extra na conexão com o banco (troca de variável de ambiente, feita por você).
- PR14: fotos e áudios da conversa carregam juntos, não um por um.
- PR15: a tag aparece no clique, e clicar duas vezes não apaga mais.
- PR16: tela de "carregando" em vez de "Nenhuma conversa ainda".
- PR17: "não lida" só quando o cliente escreve (não quando você envia), e abrir a conversa não recarrega a lista.
- PR18 e PR19: mensagens não somem depois de "carregar anteriores", e a mensagem nova sempre aparece na tela.
- PR20: assumir, devolver, encerrar e enviar aparecem na hora.
- PR21: trocar de aba e voltar mantém a conversa aberta.
- PR22 a PR24: menos consultas por clique; abrir a conversa de um cliente com card não espera a IA; consertar as mídias quebradas, com seu OK.

**Fase 3 — comportamento do bot**
- PR25: o bot para de achar que o cliente "mandou documento" quando ele só mandou áudio, ou mandou há meses.
- PR26: se a IA demorar ou der erro, a conversa não é tirada do atendente que já assumiu. O bot também para de falar se a conversa saiu do modo bot, ou se chegou mensagem nova do cliente antes do envio. Nesse caso ele responde uma vez só, já com tudo o que o cliente disse.
- PR27: o robô de inatividade confere de novo antes de encerrar. Hoje ele pode encerrar justo quando o cliente acabou de perguntar algo.
- PR28: "devolver ao bot" lembra quem era o atendente. Se o cliente voltar, a conversa volta para ele.
- PR29: menos notificações, e só para quem é responsável. O gestor recebe um aviso extra quando um lead passa 48 h sem atendimento.
- PR30: toda conversa encerrada ganha a tag do desfecho; há uma pasta para churn; o KPI de contratados deixa de contar churn.

**Fase 4 — painéis e medição da IA**
- PR31 a PR35: os painéis do gestor abrem mais rápido e não carregam a mesma coisa 2 ou 3 vezes.
- PR36: passa a registrar quanto a IA demora e quanto custam a transcrição e a ficha. O microserviço do bot é atualizado antes.
- PR37: o microserviço ganha prazo, e os áudios são transcritos em paralelo, sem mexer na espera que junta as mensagens.
- PR38: instruções novas do bot: responder "como está meu processo?" sem mandar para a fila, perguntas obrigatórias antes de qualificar e pedir para repetir o áudio que não entendeu. Precisa do OK do chefe.

**Fase 5 — mudanças maiores**
- PR39 a PR44: tirar as consultas da "fila única" do navegador (o principal motivo de o clique esperar) e atualizar a lista só com o que mudou.
- PR45: consertar o tempo real, depois das proteções.
- PR46: os filtros de tag e data procuram no banco todo e mostram o total certo.
- PR47 a PR49: documentos com nome legível; a aba Arquivos mostra todas as mídias do cliente e deixa anexar várias de uma vez; "tentar de novo" na mídia que falhou.
- PR50: "abrir conversa" pelo card na mesma aba, e o site carrega menos código.
- PR51 a PR53: números novos da IA para o chefe (devoluções ao bot, transferências fechadas sem resposta etc.) e confirmação ao fechar uma transferência sem responder o cliente.
- PR54: lista e conversa mais leves: só desenha o que aparece na tela.
- PR55 e PR56 (mais para frente): juntar fotos num PDF e a IA dizer o tipo do documento.

**Decisões suas antes de começar**
1. Levar o harness para a `main` e decidir sobre o commit "a".
2. Vercel: conferir a região atual das funções e informar a região do Railway e do S3; depois, trocar a variável do banco (PR13).
3. Aprovar a biblioteca nova `@vercel/functions`, ou usar a alternativa sem ela.
4. Produto: "Não lidas" conta conversas encerradas? Quando tirar a tag "Qualificada"? Quem vê métricas por atendente? O chefe aprova a regra nova do bot (PR38)?
5. OK para o script de reparo das mídias (primeiro só o relatório, depois a correção).

**Cuidados**
- Depois de alguns deploys (PR15, PR20, PR40), a equipe precisa apertar F5.
- Nas migrations, apagar à mão as linhas que apagam o calendário e a tabela "discord".
- Testes em produção só com contato e card de teste; disparar o robô de inatividade à mão só fora dos horários agendados.
- Mudanças no bot: o microserviço é atualizado antes do CRM, e nada mexe nas travas anti-spam.
- O `middleware.ts` tem uma mudança sua não commitada (do calendário): não misturar com os PRs.

**Como saber que melhorou:** tirar uma "foto" dos números antes (banco + gravação do navegador no PC do chefe) e comparar depois de cada PR:
- lista recarregada por mensagem: 3 hoje;
- "não lidas": 83 ms → ~10 ms;
- tag no clique: < 0,2 s;
- passo de fluxo manual: ~4 s → ~1 s;
- filtro "Contratados": 124 de 276 → 276 de 276;
- fotos chamadas "midia.jpeg": 1.650 → 0.


---

# Detalhe técnico por PR

> Gerado a partir da auditoria de 24/09 (código + banco de produção, só leitura) e das specs por onda revisadas contra as regras do `CLAUDE.md`. Linhas conferidas em 25/09 — **confirme com Grep antes de editar** (hotspots mudam a cada PR). Cada PR sai de `git worktree add ../wt-<nome> -b <branch> main`, rodando `/validar` + `npm run docs:check` + `/mapa-atualizar` antes do merge.

## Ações que só o usuário faz
- Fazer o merge do harness (PR00) na main e decidir o commit 1a8f22d, que adiciona um e-mail em HARDCODED_AI_REVIEW_EMAILS (ai-review-access.ts): manter no PR, mover para a env AI_REVIEW_EMAILS ou tirar.
- payment_schedule: conferido em 25/09 que a migration 20260924010000_payment_schedule JÁ está aplicada no Neon. O calendário continua fora deste plano (trabalho em andamento do usuário). Enquanto ele não estiver na main, toda migration gerada a partir da main propõe DROP de payment_schedules e das colunas de project_costs: apagar essas linhas à mão antes do db execute.
- Aprovar a aplicação das migrations em produção: A6 (fora do horário comercial), E2b (mais o backfill, em --dry-run primeiro) e, na fase 2, C5c.
- Painel da Vercel: conferir a Function Region atual e o Fluid Compute. Criar o DATABASE_URL de Preview sem pgbouncer=true e, depois de validado, trocar o de Production em horário de baixo movimento. Configurar NEXTAUTH_URL/NEXTAUTH_SECRET com escopo Preview e liberar o preview na Deployment Protection. Testar o preview do escritório (trava de IP) com login por credenciais.
- Informar a região do Railway (cérebro e relay) e a do bucket S3 (AWS_REGION) antes do PR02.
- Aprovar a dependência nova @vercel/functions (B5/C6) ou escolher a alternativa sem ela, com a rota POST /api/whatsapp/summary.
- C1b: dar OK para o dry-run (lê banco e S3 de produção). Confirmar se o bucket tem versionamento e se a credencial tem s3:ListBucket, s3:GetBucketVersioning e s3:GetObjectVersion. Revisar o CSV e aprovar explicitamente o --apply.
- Decisões de produto: (a) a pill 'Não lidas' exclui encerradas? (A3); (b) quando a tag 'Qualificada' é removida no encerramento (D8); (c) acesso às métricas por atendente, allowlist ou manager_dashboard (E2a/E2b); (d) aprovação do chefe para a regra (b) do D11 e o escopo INSS/DPVAT.
- D7: conferir na aba Setores quem está no setor 'comercial' e a lista de gestores (manager_dashboard + MANAGER_EMAILS) que recebe o degrau de 48 h.
- Deploy do D:\Chatbot_whatsapp no Railway ANTES do CRM em D9, D10 (primeiro staging, com Node ≥ 20.3), D11 e C5c. Publicar as instruções v21 pela aba Instruções depois de testar em staging.
- B6: ler logs e envs do relay no Railway (ALLOWED_ORIGIN, CHAT_RELAY_SECRET, réplicas), abrir o DevTools no navegador do chefe e confirmar se o texto das mensagens pode sair do log do relay (index.js:97 diz que o log foi pedido).
- Antes do PR03, gravar a linha de base: um snapshot de pg_stat_statements (calls, mean_exec_time, shared_blks_hit+read por queryid) numa janela fixa de dia útil, e uma gravação de Network (Next-Action) no PC do chefe abrindo o inbox, aplicando tag e encerrando. Repetir o snapshot na mesma janela depois de cada PR, comparando deltas sem reset.
- Depois dos deploys que mudam a assinatura de actions (PR15 A1, PR20 A2, PR40 B2-2), pedir à equipe um F5 nas abas abertas.
- Coordenar o merge das tarefas separadas: requireTeam em updateDocumentName junto com o PR01, e o cron /api/maintenance/retention (middleware). O middleware.ts tem mudança não commitada do calendário (/api/costs/sync): não misturar. Os avisos de 180 dias do E2a dependem do cron de retenção voltar a rodar.

## Conflitos entre ondas (ordem obrigatória)
- conversations.ts (735 linhas): mexem A6 (getWhatsAppInboxVersion), A5 (loadConversations), A3 (countWhatsAppUnread e markConversationRead), A2 (assume/return/close/syncCloseTag), B5 (markConversationRead e convContact), D5 (returnConversationToBot), D8 (closeConversation; syncCloseTag vai para a lib), B2-2 (extrai as leituras para inbox-data.ts), B3 (loadConversationsSince), E3 (queryWhatsAppConversations), E2b (convContact/assume/close) e E2c (closeConversation). Ordem única: A6 → A5 → A3 → A2 → B5 → D5 → D8 → B2-2 (só move, com a lógica final do A já dentro) → B3 → E3 → E2b → E2c. O E3 deixa de criar a action nova e entra como parâmetro da rota GET do B2-2 (inbox-data.ts).
- use-whatsapp.ts (170 linhas): mexem A4 (foco e rede de segurança), C3 (tipo WhatsAppThreadMessage com mediaUrl), A1 (onDiscarded), E4a (isLoading), A3 (revalidateOnFocus do unread), E4c (reescreve useWhatsAppMessages), B2-1 (jsonFetcher em todos os hooks), B2-2/B3 (lista via GET e delta), C4 (useWhatsAppContactFiles) e C9 (tipo). Armadilha: o fetcher atual (L44) faz r.json() sem olhar o status. Qualquer 403 novo vira dado e quebra data.messages.length (L128). Por isso o C3 NÃO troca o guard de /api/whatsapp/messages. A troca vai no B2-1, junto com o jsonFetcher e no mesmo deploy.
- WhatsAppInbox.tsx (2.726 linhas, hotspot): recebe A4, C3, A1, E4a, A3, E4c/E4e/E4d, A2, E4b, D8 (pastas), B2-2, B2-4, B3, B4 (WaAudioBubble), E3, C5, C4, C9, E2c e E4f. Os PRs aqui são estritamente sequenciais: rebase na main antes de abrir cada um e faixas do hotspots.md atualizadas por /mapa-atualizar em cada PR. O E4f (virtualização) fica por último porque reestrutura o render da lista e da thread.
- handleSendText/handleSendMedia: A2 (await mutateMessages + removePending em finally), E4e (upsertById no cache da thread com revalidate:false) e C9 (sendOneMedia/retry) disputam o mesmo trecho. Resolução: E4e entra antes e o método dele fica. O A2 só acrescenta patchConversation(sentMessagePatch) na lista. O C9 vem depois dos dois.
- /api/whatsapp/messages GET: o C3 assina mediaUrl e o B2-1 troca o guard do JWT (L19-22) por teamRoute lendo o banco. O C3 entra primeiro com o guard atual. O ajuste do C3 'requireTeam que lança vira 403' passa para o B2-1.
- getClientInfo/addClientFromConversation (client-info.ts): o C6 (resumo de vínculo em segundo plano), o B4 (que também propunha isso) e o B2-4 (move a lógica para copilot-data.ts) se sobrepõem. O dono é o C6+C7, e o B4 tira esse item. C6/C7 entram antes do B2-4, que só move a lógica já final.
- Usage de IA na ficha (ficha-ai.ts) e na transcrição (assist.ts + micro /transcribe): B4 e D9 especificam as duas coisas. O dono é o D9, com o micro primeiro. O B4 grava só durationMs de resumo e sugestão e referencia o D9.
- closeConversation mais rápido (DUR-3): B5 e D8. O dono é o D8, que já reescreve closeConversation/syncCloseTag: Promise.all(convContact, closeReason) + syncCloseTag e log wa_close via o runAfterResponse criado no B5. O B5 sai sem essa parte.
- get-chatbot-analytics.ts: o A1 exclui wa_tag_* das estatísticas por atendente no laço JS atual, o E1 reescreve em SQL e remove o bloco team, o D9 filtra noop/bySystem e lê conversationAgeMs ?? durationMs, e o E2a usa ChatbotAnalytics.bot. Ordem: A1 → E1 → D9 → E2a. O D9 edita o SQL do E1, não o laço JS. O A1 precisa da exclusão também em get-team-analytics.ts:76 e get-collaborator-detail.ts:14 no mesmo PR, senão os logs novos inflam as métricas de equipe já no deploy.
- Union LogAction (log.ts) e PURGEABLE_LOG_ACTIONS (retention.ts): A1 (wa_tag_add/remove), C10 (wa_media_fail), D2 (critical_error), D9 (wa_bot_discarded), E2b (wa_queued) e B5 (at?: Date + cache do setor). Os conflitos são triviais, mas cada PR decide explicitamente se a action nova é purgável e a registra em ACTION_META/OPERATION_LABELS quando aparece no feed.
- bot.ts (1.507 linhas): D4 → D2 → D3 → D5 → D7 → D8 → D9 → D10 → D11 → E2b → C5c, sem PR paralelo. handoffToQueue/qualifyToQueue ganham UM objeto opts no D2 ({ onlyIfStatus }), que é estendido depois: dono no D5, audiência no D7, extraNote no D11 e queueEntryData no E2b. Os chamadores de signature/core.ts ficam sem opts (a assinatura eletrônica está desligada).
- cron-tasks.ts (1.244 linhas), runNudgePhase/finalizeClose: D6 → D3 → D5 → D7 (QUEUE_ALERT_STEPS) → D8 (tag de desfecho no finalizeClose). O D8 depende do finalizeClose(conv, { fromStatus }) do D3.
- service.ts: C10 (bloco de mídia) → B5 (broadcast depois da resposta) → D5 (reabertura com dono) → D7 (alertDeliveryFailure) → D8 (opt-out com tag) → E2b (import BotConversa → fila).
- D5 'recentAttendant' (fato para o cérebro) exige deploy do micro. Para manter o D5 só no CRM, esse fato vai para o D11, que já faz deploy do micro e da instrução.
- Chave SWR 'wa-number-options': o E4b cria e o E1c reaproveita, então o E4b entra antes do E1c.
- CopilotPanel.tsx (1.260 linhas): C1 (handleDownload) → C3 (mediaUrlCache) → B2-4 (SWR de docs) → B4 (handlers de IA) → C5 → C4 → C5b.
- CardDialog.tsx e nova-dash/page.tsx: E4g → E4h no mesmo PR, e o B2-3 (badges em page.tsx) entra antes do E4h (imports dinâmicos das abas em page.tsx).
- middleware.ts: o working tree tem /api/costs/sync não commitado, a tarefa separada do cron /api/maintenance/retention também altera as allowlists, e o B2 só confere que as rotas novas NÃO entram em allowlist. O PR de custos entra primeiro e os outros fazem rebase.
- Medição B1 × B5: a métrica create→log (wa_text p50 419 ms) só vale enquanto o log é gravado no caminho da resposta. O B1(i) precisa ser medido ANTES do B5, que passa os logs para depois da resposta.
- Migrations (A6, E2b, C5c) × payment_schedule não commitada: o migrate diff a partir de uma branch limpa da main propõe DROP de payment_schedules e das colunas de project_costs se elas já existirem no Neon. O PR de custos (ou a confirmação só leitura em _prisma_migrations) vem antes de qualquer migration das ondas.
- updateDocumentName: o C1 (rename sem mexer no S3) e a tarefa separada do requireTeam alteram a mesma função. Fazer o merge da tarefa antes ou no mesmo deploy, com rebase trivial.

## Notas do sequenciador
Sequência verificada agora, só leitura, contra o repo. A main está 4 commits atrás de chore/ai-harness (fb8a249, f264ff0, 6e3a67e, 1a8f22d), então docs/ai, skills e hooks não existem na main: o PR00 é obrigatório. O working tree tem a feature de custos não commitada: schema.prisma, a migration 20260924010000_payment_schedule (CREATE payment_schedules + colunas em project_costs) e middleware.ts, que adiciona /api/costs/sync à allowlist. Essa linha provavelmente explica o 'cost sync parado desde 14/09', mas é trabalho do usuário e fora das ondas. Todo PR sai de `git worktree add ../wt-<nome> -b <branch> main`, para não misturar esse trabalho.

Tamanho dos hotspots confirmado: WhatsAppInbox.tsx 2.726, bot.ts 1.507, CopilotPanel.tsx 1.260, cron-tasks.ts 1.244, get-chatbot-analytics.ts 753, conversations.ts 735, use-whatsapp.ts 170 linhas.

Riscos confirmados:
- use-whatsapp.ts:44 usa `fetch(...).then(r => r.json())` sem checar o status, e /api/whatsapp/messages (L19-22) decide o acesso pelo role do JWT.
- @vercel/functions não é dependência hoje (precisa de aprovação); react-virtuoso já é.
- O CI roda tsc e npm test, mas não roda docs:check. Por isso /validar + `npm run docs:check` + /mapa-atualizar vão em cada PR.

Trilhas: a ordem numerada é a de merge. Quatro trilhas podem andar em paralelo, desde que respeitem os pontos de sincronização:
- Inbox: PR03, 11-12, 14-21, 39-46, 49, 54.
- Bot: PR05, 25-30, 36-38.
- Documentos: PR01, 07-09, 23-24, 47-48.
- Painéis: PR06, 31-35, 51-53.

Pontos de sincronização:
- A2 (PR20) antes de D5 e D8.
- E1 (PR31) antes de D9.
- B5 (PR22) antes de C6 e D8.
- C6/C7 (PR23) antes do B2-4 (PR42).
- E4b (PR21) antes do E1c (PR33).
- Toda a onda A antes do B2-2 (PR40).
- Migrations (PR11, PR52, PR56): a migration do calendário já está no Neon; apagar à mão os DROP de pagamento gerados pelo migrate diff.

Dentro de cada trilha a ordem é estritamente sequencial, por causa dos hotspots.

Donos definidos para itens que estavam em mais de uma onda:
- Assinatura de URL de mídia (THR-1/FE-6/DOC-3): C3.
- Usage da ficha e da transcrição: D9.
- Resumo de vínculo em segundo plano: C6.
- closeConversation rápido (DUR-3): D8.
- Transferências fechadas sem resposta (MISSED bot_eficacia): E2c.
- reportCriticalError persistido: D2.
- Fato recentAttendant: D11.
- Interruptores por env da órfã e do dono pegajoso: D3/D5.

Cada PR de medição depende de uma janela comparável. Usar deltas de pg_stat_statements na mesma faixa de dia útil (sem reset, que exige privilégio) e evitar dois PRs que mexem na mesma métrica no mesmo dia: B1(i) × B5; A4 × A3 × A2, que medem cargas por mensagem, em dias separados.

Correções de mapa a aplicar pelos PRs:
- whatsapp-bot.md:67 já tem wa_contact; faltam wa_document, wa_media e wa_signature.
- O comentário em WhatsAppInbox.tsx:190 diz 'capada em 200'.
- queuedAt também é zerado em cron-tasks.ts:478 e 516.
- data-model.md:102: a regra da purga passa a considerar mediaKey, flows e templates.
- infra-integracoes.md:23/182: purgeExpiredTrash muda de arquivo.
- hotspots.md:28/124: faixas e símbolos.

Fora do escopo, conforme pedido: requireTeam em getUsers, updateDocumentName, POST /api/documents e getSectorAnalytics, e o cron /api/maintenance/retention. Aparecem aqui só como coordenação de merge.

## Ordem de PRs
| PR | itens | por que agora |
|---|---|---|
| PR00 Harness de IA na main (pré-requisito) | merge dos 4 commits já existentes em chore/ai-harness (fb8a249, f264ff0, 6e3a67e, 1a8f22d), sem o working tree | A main não tem docs/ai, .claude/skills (/migration, /validar, /mapa-atualizar), hooks nem scripts/check-ai-docs.mjs, e todo PR abaixo sai da main e depende deles. Não tem efeito em runtime. |
| PR01 Documentos: renomear e purgar não apagam mídia (hotfix) | C1; C2 | É perda de dados em andamento. Cada renomeação de anexo vindo do WhatsApp apaga o objeto que a mensagem usa (DOC-1), e a purga diária (06:00 UTC) apaga mídia ainda referenciada (DOC-6). Esforço P+P, sem migration, e nada depende de outro item. |
| PR02 Infra: função da Vercel em cle1 (região do Neon) | B1 parte (i): "regions": ["cle1"] no vercel.json + decisão "fluid" (vercel.json ou painel) + registro no vercel/pro-checklist.md | É uma linha de config e beneficia toda ida e volta em série (cerca de 10 por carga da lista e 5 por envio). Precisa ser medido já, antes do B5, que invalida a métrica create→log. |
| PR03 Inbox: desarmar recargas automáticas | A4 | Esforço P e sem dependência. Corta cerca de 25% das cargas completas da lista (foco ~17% + rede de 120 s ~8%), desarma a recarga por evento SSE (GR-4) antes de qualquer conserto do relay e cria o refresh-gate.ts (single-flight/coalescer) que o A1 e o A2 usam. |
| PR05 Bot WhatsApp: nudge e despedida só das 7h às 21h (BRT) | D6 | Esforço P e independente. Acaba com a despedida de madrugada (EF-3). As funções novas ficam em date-br.ts, com teste. Precisa entrar antes de D3/D5/D8, que mexem no mesmo runNudgePhase. |
| PR06 Painéis: aba Chatbot respeita o número e 'Origem dos leads' sem caixa de erro | E1e; E1f (+ mensagem própria em ChatbotDashboard.tsx:145 e AiCorner.tsx:126) | São dois bugs de esforço P que o gestor vê hoje: métricas de todos os números com um número selecionado, e erro na aba padrão para quem está fora da allowlist. |
| PR07 WhatsApp: timeout no download de mídia da Meta + log wa_media_fail | C10 | Esforço P e independente. Hoje o webhook sem timeout segura a função. O log obrigatório cria a linha de base de mídia perdida. |
| PR08 Card: upload com o File direto, key única e checagem do registro | C8 | Esforço P, isolado em FilesTab.tsx/upload-s3.ts. Tira a conversão para base64 do navegador e o 'subiu mas não registrou'. Vem depois do PR01, que também mexe no FilesTab (saveName). |
| PR09 Script: diagnóstico de mídias quebradas (dry-run) | C1b (só dry-run) | Com o hotfix no ar, o script mede o estrago (rename_pareavel, purgado, doc_quebrado, ambiguo) e responde se o bucket tem versionamento, que é a única forma de recuperar o que a purga apagou. |
| PR11 Banco: índices do hash do inbox e do sino | A6 | Esforço P. Hoje o hash faz seq scan de 130 mil linhas em cada poll de 15 s por aba (9,5% do tempo do banco). O índice do sino vai na mesma migration. |
| PR12 Inbox: lista mais leve no banco (não lidas por LATERAL, etapas em paralelo) | A5 | A query de não lidas é 44-48,5% do tempo do banco (83 ms; a reescrita testada leva 8-16 ms). É o maior ganho de Neon e de latência num PR só. Precisa entrar antes do A3 e da extração do B2-2 (mesmo loadConversations). |
| PR13 Infra: DATABASE_URL sem pgbouncer=true | B1 parte (ii) + roteiro de rollback no vercel/pro-checklist.md | Hoje 71% dos comandos no banco são BEGIN/DEALLOCATE ALL/COMMIT do modo pgbouncer (1.302/min). Não exige código. Entra depois do PR02 já medido, para não misturar os efeitos. |
| PR14 Inbox: link de mídia pronto na thread (sem action por anexo) | C3 (com onError → 'Arquivo indisponível' na bolha, no áudio e no DocRow) | Cada abertura de conversa enfileira de 3 a 11 server actions só para assinar URL (THR-1/FE-6/DOC-3). É a causa de 'imagens carregam uma por uma' e trava a fila serial. Também é o fallback de UI para o resíduo do C1b. |
| PR15 Inbox: tag na hora, idempotente e com log | A1 | É queixa direta do chefe: a tag demora e o 2º clique desfaz. Depende só do refresh-gate do PR03. |
| PR16 Inbox: skeleton de carregamento e erro com 'Tentar novamente' | E4a | Esforço P. Hoje a 1ª carga mostra 'Nenhuma conversa ainda' (FE-8), e o chefe lê isso como 'não carrega'. Entra depois do A1 porque os dois mexem no menu de tags. |
| PR17 Inbox: 'não lida' só por mensagem recebida; markRead sem recarregar a lista | A3 | 86% dos envios humanos disparam markRead do próprio autor, e cada markRead vira escrita + recarga completa (cerca de 19% das cargas). Também corrige o markMessageRead sem numberId, que cai no número default, inclusive na linha 2323 inativa. |
| PR18 Thread: 'carregar anteriores' não some mensagem e o envio não pisca | E4c; E4e | Corrige um bug de mensagem sumindo da tela (THR-5) e a bolha que pisca (THR-10), os dois de esforço P. Precisa vir ANTES do A2, porque ambos reescrevem handleSendText/handleSendMedia e o método do E4e é o que fica. |
| PR19 Thread: auto-scroll pela última mensagem + chip 'Nova mensagem ↓' | E4d | É um MISSED de severidade alta: em conversa com mais de 50 mensagens, a mensagem nova do cliente não aparece. Depende do E4c. |
| PR20 Inbox: Assumir/Devolver/Encerrar/Enviar refletem na hora | A2 | Cerca de 670 recargas completas por dia são disparadas direto por ação, e o passo de fluxo manual leva 3,7-4,3 s a mais que o do bot. Precisa entrar antes de D5/D8, que mexem em returnConversationToBot/closeConversation. |
| PR21 Inbox: conversa, pasta, busca e filtros sobrevivem à troca de aba | E4b | THR-4/LISTA-9: toda troca de aba da nova-dash perde a conversa aberta. Este PR cria a chave SWR 'wa-number-options' que o E1c reaproveita. |
| PR22 Menos custo por ação: setor do log em cache, broadcast e logs depois da resposta | B5 (sem a parte DUR-3 de closeConversation, que vai para o D8); parte CRM do B6: log de res.status/delivered no broadcastToRelay | Hoje cada ação gasta 2 queries só para carimbar o setor, e o envio espera o broadcast ao relay (~50-120 ms). Entra depois do PR02 medido e do A3 (markConversationRead). |
| PR23 Ficha: vínculo por telefone sem esperar o resumo por IA + rascunhos migrados | C6; C7 | Abrir a conversa de um cliente com card pode travar a ficha e a fila atrás de uma chamada de IA (THR-6). O C7 fecha os drafts órfãos no mesmo ramo. Usa o runAfterResponse do PR22. |
| PR24 Script: reparo das mídias renomeadas (--apply) | C1b (--apply) | Só depois da revisão do CSV do PR09 e com o fallback onError do PR14 no ar, para o resíduo não reparável aparecer como 'Arquivo indisponível'. |
| PR25 Bot WhatsApp: docsReceived só com foto/PDF do atendimento atual | D4 | Esforço P e isolado. O cérebro lê 'arquivo nesta conversa', mas recebe a contagem da vida inteira do contato, incluindo áudio (DOC-5/EF-4). É pré-requisito do D11. |
| PR26 Bot WhatsApp: handoff de erro não rouba conversa, bot para ao sair do modo bot e erros críticos ficam registrados | D2; faltou-D: reportCriticalError grava Log 'critical_error' com contactId | Hoje o timeout tira a conversa do atendente que já tinha assumido, e o bot continua falando depois de transferir. É a base de D3/D5/D9/D11 (mesmo laço de envio e mesmos helpers de fila). |
| PR27 Bot WhatsApp: cron de silêncio relê a conversa antes de encerrar; órfã vai para a Fila | D3 (+ interruptor env WA_ORPHAN_TO_QUEUE) | Corrige a corrida cron × mensagem nova, que encerra conversa com pergunta sem resposta (BOT-5), e a órfã escondida (BOT-4). O critério de órfã é 'o bot não decidiu' (nenhum wa_bot depois da última inbound), não 'o bot ficou calado', o que respeita a regra do cérebro. |
| PR28 Bot WhatsApp: dono pegajoso (devolver, reabrir e transferir mantêm o último atendente) | D5 (+ interruptor env WA_HUMAN_HOLD_DAYS; sem o fato recentAttendant, que vai para o D11) | EF-1 (crítico→alto): devolver ao bot fecha, reabre no bot e manda de volta à fila sem dono. Depende de A2, D2 e D3. |
| PR29 Notificações: por dono/setor, escalada de 48 h ao gestor, LEAD QUALIFICADO em destaque | D7 | Cerca de 2 mil notificações por dia afogam o 'LEAD QUALIFICADO' (EF-10), e o cron para de alertar em 24 h (LAT-4). Depende do dono do D5. |
| PR30 Encerramento: tag de desfecho em todo caminho, pasta Churn e KPI Contratados por nome exato | D8; DUR-3 mínimo: Promise.all(convContact, closeReason) + syncCloseTag/log wa_close via runAfterResponse; blockWhatsAppContact com captureConversation | Hoje as tags 'Transferidos', 'Perguntas' e 'Sem resposta' ficam vazias no filtro, e o KPI Contratados conta churn. Depende de A2 (patch), B5 (runAfterResponse) e D3 (finalizeClose). |
| PR31 Painel Chatbot: agregação em SQL + 'Origem dos leads' separada | E1 | Hoje o painel puxa todos os logs wa_% do período para contar (PAINEL-1). Precisa entrar ANTES de D9 e E2a, para que eles editem SQL, e depois do A1. |
| PR32 Canto da IA: agregação em SQL | E1b | Esforço P. Hoje cada abertura traz cerca de 22 mil linhas e 9,5 MB de metadata só para somar tokens. |
| PR33 Gestão Estratégica: sem chamadas duplicadas | E1c | Hoje a mesma análise roda 2 vezes ao abrir e 3 ao trocar o período, e o loadCohort 2 a 3 vezes. Depende do E1 e do E4b (chave 'wa-number-options'). |
| PR34 Gestão: ramos mortos fora e loadCohort sem ILIKE | E1g; E1h | Os dois são de esforço P e dependem do E1c: tiram 5 de 8 ramos da carga única e o seq scan com ILIKE em whatsapp_messages. |
| PR35 Gestão: abas controladas, overlay na troca de período e cache curto | E1d | Hoje trocar o período devolve o gestor para a aba Analytics e refaz tudo (PAINEL-4). Depende do E1c. |
| PR36 Bot/IA: telemetria real (latência, descartes, custo da ficha e da transcrição) | D9; faltou-D: callClaudeStructured acumula o usage de todas as tentativas no micro | Hoje não existe métrica de latência (o durationMs é a idade da conversa), e a transcrição e parte da ficha não gravam usage (regra inviolável). É a base para medir D10, D11 e E2a. |
| PR37 Bot: prazo e aborto no micro, áudios em paralelo e transcrição antecipada | D10 | Hoje o áudio soma cerca de 7 s e o pior caso passa do maxDuration sem handoff (BOT-4/8/10). Depende da telemetria do D9 para provar a melhora. |
| PR38 Bot: instruções v21 + fatos do atendimento + nota com transcrição | D11; fato recentAttendant (vindo do D5) | Trata a regra 'cadastrado nunca é resolve' (que manda dúvida de cliente da casa para a fila), a qualificação que a equipe desfaz e o áudio que dobra o 'não entendi'. Depende de D2 e D4. |
| PR39 Leituras fora da fila (1/4): teamRoute, jsonFetcher e thread com requireTeam lendo o banco | B2: route-guards.ts puro + tests/route-guards.test.ts, route-auth.ts (teamRoute/sameOrigin/noStoreJson), AccessError em requireTeam, fetch-json.ts, jsonFetcher em TODOS os hooks de use-whatsapp.ts, /api/whatsapp/messages com teamRoute, GET /api/presence com teamRoute ou removido | Base dos PRs 40-44. Fecha a decisão de acesso pelo JWT na thread e a lista da equipe exposta a cliente logado por CPF. |
| PR40 Leituras fora da fila (2/4): lista, hash e busca do inbox via GET | B2: inbox-types.ts (só tipos), inbox-data.ts (extração sem mudar lógica), rotas /api/whatsapp/inbox/{conversations,version,search}, hooks e busca/fetchedActive do WhatsAppInbox | Tira a lista de 1.000 conversas e o hash da fila serial de server actions (FE-1 crítico): o clique deixa de esperar o poll. Entra depois de toda a onda A em conversations.ts. |
| PR41 Leituras fora da fila (3/4): badges do cabeçalho numa rota só e fim dos polls órfãos | B2: /api/team/badges { whatsappUnread, mentionsPending, devAlerts, eventsSoon }, use-header-badges, page.tsx, UserMenu, useUnread atrás de CHAT_ENABLED, use-mentions | O chat desligado ainda é consultado a cada 20 s (BACK-11), e o foco enfileira 3-4 actions na frente do clique. |
| PR42 Leituras fora da fila (4/4): Copiloto (ficha + documentos) num GET | B2: copilot-data.ts, /api/whatsapp/inbox/copilot/[contactId], SWR no WhatsAppInbox e no CopilotPanel, apagar ClientInfoModal.tsx (conferir com knip) | Hoje abrir a conversa faz 2 actions em série e refaz a busca por telefone a cada vez (THR-9). Depende de C6/C7 (lógica de vínculo já final). |
| PR43 Inbox: sincronização da lista por delta | B3 | Troca a recarga de ~1,3 MB por um delta pequeno a cada mudança de hash. Depende de B2-2, A4 e do toque de updatedAt na mutação de tag do A1. |
| PR44 IA do Copiloto via POST fora da fila, com durationMs | B4 (5 chamadores, incluindo WhatsAppComposer.tsx:634; sem usage de ficha/transcrição, que é do D9; sem o resumo de vínculo, que é do C6) | Hoje resumo, sugestão e transcrição são actions de 2-4 s que seguram a fila da aba (DUR-4). Depende do PR39 (route-auth/sameOrigin) e do B5. |
| PR45 Relay SSE: diagnóstico e log sem texto no relay | B6 (parte do relay D:\chat_site + roteiro de diagnóstico; o log do CRM já entrou no PR22) | O tempo real não entrega (regressão de 0,01 recarga por evento). Só é seguro religar depois da guarda do A4, do delta do B3 e do log do B5. |
| PR46 Inbox: filtros de tag, data e coluna no servidor, com total real | E3 | Hoje o filtro de tag e o de data mentem: a tag Contratados mostra 124 de 276 e 'Este mês' mostra 861 de 1.608. Entra sobre a rota GET do B2-2 e depois do A5. |
| PR47 Mídia da conversa com nome legível | C5 | Esforço P e pré-requisito do C4. Acaba com os anexos chamados 'midia.jpeg'. |
| PR48 Copiloto: Arquivos e Notas de todas as mídias do contato, com seleção múltipla | C4; deleteClientDocument com deletedBy + log document_remove | Hoje 31% dos documentos recebidos ficam fora da janela de 50 mensagens, e só 2,7% das fotos recebidas chegam ao card. Depende de C1, C3 e C5. |
| PR49 Envio de mídia: 'tentar de novo' e preview na bolha pendente | C9 | Hoje a falha de mídia não tem retry (DOC-9). Vem depois de E4e e C3 (mesmo trecho de pending/envio). |
| PR50 nova-dash: 'Abrir conversa' na mesma aba e imports sob demanda | E4g; E4h | Os dois são de esforço P e mexem no CardDialog.tsx. Tiram pdf-lib, docxtemplater, pizzip e recharts do bundle de quem só usa o inbox. Depende do PR41 (page.tsx). |
| PR51 Métricas de eficácia real da IA | E2a | Hoje o painel mede errado e esconde o problema (EF-7). Depende do E1 e, de preferência, do D9 (latência e desfecho efetivo). |
| PR52 Fila: marco durável de entrada (lastQueuedAt + evento wa_queued) | E2b | Mede a espera real da fila e as transferências fechadas sem resposta por atendente. Depende do E2a e dos helpers de fila já finais (D2/D5/D7). |
| PR53 Encerrar transferência sem nenhuma resposta pede confirmação | E2c | Hoje a equipe fecha ou descarta transferências sem responder, inclusive leads reais (MISSED bot_eficacia). Depende de E2b e D8. |
| PR54 Inbox: lista e thread memoizadas e virtualizadas | E4f | É o último PR do hotspot: reestrutura o render e precisa das pastas e filtros finais do E3. react-virtuoso já está no package.json. |
| PR55 (fase 2) Juntar fotos selecionadas num PDF com nome padrão | C5b | Só depois do C4 validado em produção. |
| PR56 (fase 2) Tipo do documento vindo do cérebro (docType) | C5c | Só depois da onda de latência do bot (D9/D10), medindo outputTokens antes e depois em staging. |

---

## PR00 Harness de IA na main (pré-requisito)
**Por que agora:** A main não tem docs/ai, .claude/skills (/migration, /validar, /mapa-atualizar), hooks nem scripts/check-ai-docs.mjs, e todo PR abaixo sai da main e depende deles. Não tem efeito em runtime.

**Deploy:** O 1a8f22d ('a') NÃO é harness: ele adiciona um e-mail em HARDCODED_AI_REVIEW_EMAILS (ai-review-access.ts). O usuário confirma se é intencional, ou tira esse commit e usa a env AI_REVIEW_EMAILS. Daqui em diante, cada PR sai de `git worktree add ../wt-<nome> -b <branch> main`, para não tocar o working tree com o trabalho de custos.

### merge dos 4 commits já existentes em chore/ai-harness (fb8a249, f264ff0, 6e3a67e, 1a8f22d), sem o working tree

## PR01 Documentos: renomear e purgar não apagam mídia (hotfix)
**Por que agora:** É perda de dados em andamento. Cada renomeação de anexo vindo do WhatsApp apaga o objeto que a mensagem usa (DOC-1), e a purga diária (06:00 UTC) apaga mídia ainda referenciada (DOC-6). Esforço P+P, sem migration, e nada depende de outro item.

**Deploy:** Não precisa de migration nem de micro. isKeyStillReferenced consulta sem filtro de contactId. purgeExpiredTrash vai para app/_shared/lib/trash-purge.ts (sem 'use server') e a rota de purga passa a usar isCronAuthorized. ensureDocExtension tira \r, \n e ';'. O merge da tarefa separada de requireTeam em updateDocumentName entra antes ou junto. Rodar /mapa-atualizar documentos-ia (data-model.md:102, infra-integracoes.md:23/182).

**Medir antes/depois:**
- PR01 (C1+C2): Documents com key whatsapp/ sem nenhuma whatsapp_messages.mediaKey apontando, criados depois do deploy = 0. Logs document_purge com metadata.s3Kept=true aparecem na 1ª purga. Rodar de novo o dry-run do C1b uma semana depois deve mostrar 0 casos novos de rename_pareavel.

### C1 — Renomear documento troca só o nome (não move nem apaga o objeto S3)
Onda C_documentos · esforço P · depende de C2 · migration: não · micro: não · refs: DOC-1, [MISSED documentos] Renomear e registrar documento sem checar equipe (só o comportamento S3; o guard é outra tarefa)

**Impacto:** Renomear no card ou no Copiloto não quebra mais a foto ou o PDF da conversa, nem o vídeo de um fluxo do bot. A mídia deixa de voltar para a lista 'não anexada', e o download sai com o nome novo.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/documents/update-name-doc.ts` | updateDocumentName | 21-80 (S3 em 42-72; update em 74-79; S3Client/imports em 3, 6-14) | Remover CopyObject e DeleteObject, o S3Client e o BUCKET. Passa a ser `db.document.update({ where: { id }, data: { name: ensureDocExtension(newName, doc.key) }, select: { id, name, key } })`. O retorno mantém a mesma forma, com a key inalterada (FilesTab lê `updated.key`). |
| `app/_shared/utils/doc-name.ts` | ensureDocExtension (novo) | novo arquivo | `ensureDocExtension(newName: string, key: string): string`. Extrai a lógica das L16-19 e 35-40: preserva a extensão da key e remove aspas, barras, contrabarra e caracteres de controle, que quebrariam o `filename="…"` do Content-Disposition. |
| `app/_actions/whatsapp/client-documents.ts` | renameClientDocument | 154-178 | Só o comentário (L154-159), que hoje diz 'copia a chave no S3': passa a dizer que só troca o nome de exibição, porque a key pode ser compartilhada com a mensagem. |
| `app/nova-dash/card-dialog/FilesTab.tsx` | saveName | 328-342 | Ajustar o comentário da L332 (a key não muda mais). A lógica continua igual. |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | ArquivosTab.handleDownload / getMediaUrl | 875-879 e 44-52 | O 'Baixar' do Copiloto hoje assina com fileName = último segmento da KEY (L47-48). Com a key fixa, o arquivo baixaria com o nome antigo. Trocar para `downloadFileFromS3(doc.key, doc.name, false)`. |
| `docs/ai/documentos-ia.md` | tabela Onde fica (updateDocumentName) + armadilha da key compartilhada | 16, 95 | Via /mapa-atualizar: registrar que o rename troca só o `name`. |

**Passos:**
1. Confirmado: o download usa `name` no Content-Disposition em FilesTab (handleDownload L257-262 com doc.name, preview L275), download-all (uniqueEntryName(doc.name…)) e downloadFileFromS3 (L69). Exceções: o Copiloto (getMediaUrl usa a key) e a bolha do inbox (fileNameFromKey). Por isso o passo do CopilotPanel entra neste item.
2. Criar doc-name.ts com ensureDocExtension, mais o teste.
3. Reescrever updateDocumentName só com o update de name.
4. Corrigir o 'Baixar' do Copiloto para usar doc.name.
5. Atualizar os comentários, e o mapa via /mapa-atualizar.

**Regras tocadas:**
- Arquivo "use server" só exporta funções async: o helper novo vai em app/_shared/utils
- Comentários explicam o porquê (key compartilhada com WhatsAppMessage.mediaKey e com fluxos)

**Riscos:**
- A tarefa separada que põe requireTeam() em updateDocumentName mexe na mesma função. Combinar a ordem dos merges.
- Uploads antigos ficam com a key refletindo o nome antigo. Nada lê o nome pela key de uploads/ (o roteiro só usa como fallback).
- Nome com acento no Content-Disposition segue o comportamento de hoje. C3 traz o `filename*` UTF-8.

**Testes:**
- tests/doc-name.test.ts: ensureDocExtension('RG frente', 'whatsapp/c/1-midia.jpeg') = 'RG frente.jpeg'; ('rg.JPEG', '...jpeg') não duplica; key sem extensão devolve o nome limpo; ('a"b/c', 'x.pdf') = 'abc.pdf'.

**Validação manual:** Com contato e card de TESTE: anexar a foto da conversa, renomear pelo card e pelo Copiloto. A imagem continua abrindo na thread e não volta para 'não anexada'. 'Baixar' no card e no Copiloto sai com o nome novo. No banco (só leitura), Document.key igual a WhatsAppMessage.mediaKey.

**Revisão: ok**
- problema: Conferido: update-name-doc.ts:21-80 (Copy/Delete em 47-63, update em 74-79), FilesTab.tsx:328-342 (L333 lê updated.key), client-documents.ts:154-178 e CopilotPanel.tsx:44-52 e 875-879. O Copiloto baixa com o nome tirado da key.
- problema: O 'depends_on C2' não é dependência real: C1 roda sozinho e é o que causa as 173 quebras em 30 dias. Não pode ficar esperando C2.
- problema: Trocar o handleDownload do Copiloto para `inline=false` muda o comportamento: hoje abre em nova aba, depois vai baixar. Confirmar se o rótulo do botão é 'Baixar'.
- ajuste: Remover C2 de depends_on e marcar C1+C2 como o mesmo PR de hotfix.
- ajuste: ensureDocExtension: remover também \r, \n e ';', que quebram o header.
- ajuste: Combinar a ordem de merge com a tarefa separada do requireTeam em updateDocumentName (mesma função).

### C2 — Purga da lixeira preserva o objeto S3 ainda usado por mensagem, fluxo ou template
Onda C_documentos · esforço P · depende de — · migration: não · micro: não · refs: DOC-6

**Impacto:** A foto ou o PDF do cliente não some mais da conversa semanas depois de alguém tirar o arquivo do card. Vídeos e áudios dos fluxos do bot também ficam protegidos.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/documents/trash.ts` | hardDelete | 135-151 | Antes do DeleteObject, chamar `if (await isKeyStillReferenced(key, docId))` e, se der true, pular o S3. A linha do Document é sempre apagada. Novo helper NÃO exportado `isKeyStillReferenced(key: string, docId: string): Promise<boolean>`, que devolve true em qualquer destes casos: (1) outro Document com a mesma key (qualquer estado, como já é hoje); (2) `isSharedLibraryKey(key)`; (3) `db.whatsAppMessage.findFirst({ where: { mediaKey: key, ...(cid ? { contactId: cid } : {}) }, select: { id: true } })` com `cid = contactIdFromWhatsAppKey(key)`, para usar o índice (contactId, createdAt). |
| `app/_actions/documents/trash.ts` | purgeExpiredTrash | 114-133 | Contar `kept` (linha apagada, objeto preservado), devolver `{ purged, failed, kept }` e dar console.info do resumo. Hoje a purga não deixa rastro, e a auditoria teve de inferir a execução pelo deletedAt mais antigo. Opcional: mover a função para um módulo sem "use server" (ex.: app/_shared/lib/trash-purge.ts). Exportada de arquivo "use server" e sem guard, ela hoje é endpoint de action invocável por qualquer sessão (impacto baixo: só purga o que já passou de 30 dias). |
| `app/_shared/utils/s3-keys.ts` | isSharedLibraryKey, contactIdFromWhatsAppKey (novo) | novo arquivo | Funções puras. `isSharedLibraryKey(key): boolean` testa `whatsapp/flows/` ou `whatsapp/templates/`: são mídias reusadas por todas as mensagens de fluxo (flow-runner.ts:149 grava `step.mediaKey` na mensagem) e pelos cabeçalhos de template. `contactIdFromWhatsAppKey(key): string | null` devolve o segundo segmento de `whatsapp/<cid>/...`, exceto para flows e templates. |
| `app/api/documents/trash/purge/route.ts` | GET / isCronAuthorized local | 8-14, 21-32 | Já repassa o `result` inteiro, então o `kept` sai sem mudança. Opcional: trocar o `isCronAuthorized` copiado pelo de app/api/whatsapp/cron/auth.ts, como manda app/api/CLAUDE.md. |

**Passos:**
1. Criar app/_shared/utils/s3-keys.ts com isSharedLibraryKey e contactIdFromWhatsAppKey. O arquivo é compartilhado com C1b, C3 e C8.
2. Em trash.ts, implementar isKeyStillReferenced e aplicá-lo em hardDelete. Comentar o porquê: mídia do WhatsApp compartilhada com a conversa e mídia de fluxo usada por todos os leads.
3. Fazer purgeExpiredTrash devolver `kept` e logar o resumo.
4. Subir ANTES de ~02/10: 17 dos 36 itens da lixeira com key compartilhada vencem os 30 dias até lá.

**Regras tocadas:**
- Document: lixeira de 30 dias (deletedAt) e purga pelo cron
- S3 sem cliente central: reusar o s3Client do módulo
- Rota de cron: isCronAuthorized compartilhado (opcional)

**Riscos:**
- Objetos que nenhum registro usa mais podem sobrar no bucket (custo desprezível). Não apagar é o comportamento seguro.
- Key fora de `whatsapp/<cid>/` (uploads/, flows) faz a busca em whatsapp_messages.mediaKey sem índice: ~30ms num seq scan de 130k linhas, por item purgado. Só roda na purga (≈1 por dia), então aceitável sem índice novo.
- Mensagem apagada só na thread (deletedAt) continua preservando o objeto. É conservador de propósito.

**Testes:**
- tests/s3-keys.test.ts: isSharedLibraryKey('whatsapp/flows/1-v.mp4') = true, ('whatsapp/abc/1-midia.jpeg') = false; contactIdFromWhatsAppKey('whatsapp/cmabc/1-midia.jpeg') = 'cmabc', ('whatsapp/cmabc/docs/1-x.pdf') = 'cmabc', ('whatsapp/flows/1-v.mp4') = null, ('uploads/user_x/1-a.pdf') = null.

**Validação manual:** Com contato e card de TESTE: anexar uma mídia da conversa no card, excluir pela ficha, abrir a lixeira do card e usar 'Excluir de vez' (purgeDoc usa o mesmo hardDelete). A imagem ainda abre na conversa, e o log document_purge sai. Apagar o card e o contato de teste no fim.

**Revisão: ajustar**
- problema: Símbolos e linhas conferidos: hardDelete em trash.ts:140-151 (doc 135-139), purgeExpiredTrash em 114-133, isCronAuthorized copiado em purge/route.ts:8-14. flow-runner.ts:149, flows.ts:159 e templates.ts:153 confirmam as bibliotecas compartilhadas whatsapp/flows/ e whatsapp/templates/.
- problema: O filtro por contactId tirado da key é otimização frágil. Ele supõe que nenhuma mensagem de outro contato usa `whatsapp/<cid>/...`. O código atual garante isso (send-message.ts:394), mas o banco pode ter mensagens de contato mesclado ou movido por SQL avulso, como na limpeza dos 231 telefones duplicados. Um falso negativo apaga do S3 a mídia de uma conversa. Sem o filtro, a busca custa ~30 ms de seq scan e roda só na purga (8 vencidos por dia).
- problema: A urgência está mal estimada. O cron roda todo dia às 06:00 UTC (vercel.json:24-25), então os 17 itens com key compartilhada somem aos poucos desde 24/09, e não de uma vez em 02/10. Cada dia de atraso perde mídia sem volta, a menos que o bucket tenha versionamento.
- problema: O 'Excluir de vez' manual passa a manter o objeto sem avisar. O log document_purge não registra isso.
- ajuste: isKeyStillReferenced: fazer `db.whatsAppMessage.findFirst({ where: { mediaKey: key }, select: { id: true } })` SEM o filtro de contactId. contactIdFromWhatsAppKey continua só para C1b.
- ajuste: Subir C2 junto com C1 como hotfix, na frente do resto da onda.
- ajuste: purgeDoc: acrescentar `s3Kept: boolean` no metadata do log document_purge, e hardDelete passa a devolver esse boolean.
- ajuste: Recomendado (não opcional): mover purgeExpiredTrash para app/_shared/lib/trash-purge.ts (sem "use server"). Assim ele deixa de ser endpoint de action sem guard. Atualizar docs/ai/infra-integracoes.md:23/182 e data-model.md:21.
- ajuste: Na rota de purga, usar isCronAuthorized de app/api/whatsapp/cron/auth.ts, que app/api/CLAUDE.md:9 exige.

## PR02 Infra: função da Vercel em cle1 (região do Neon)
**Por que agora:** É uma linha de config e beneficia toda ida e volta em série (cerca de 10 por carga da lista e 5 por envio). Precisa ser medido já, antes do B5, que invalida a métrica create→log.

**Deploy:** Antes do deploy, o usuário confere no painel a Function Region atual e informa a região do Railway (cérebro e relay) e do bucket S3. A rota diag/db-latency, se usada, fica só na branch de preview, com requirePermission('manage_team') e fora das allowlists.

**Medir antes/depois:**
- PR02 (B1 i): logs wa_text, create da mensagem → log, p50 419 ms / p90 478 (n=4.842), esperado ≤ ~300 ms. Template p50 178 ms também deve cair. Medir ANTES do PR22. No preview, a rota diag mede o RTT de SELECT 1.

### B1 — Fixar a função da Vercel em cle1 (região do Neon) e testar DATABASE_URL sem pgbouncer=true
Onda B_leituras_infra · esforço P · depende de — · migration: não · micro: não · refs: BACK-7, BACK-5, BACK-6, LISTA-8

Escopo neste PR: B1 parte (i): "regions": ["cle1"] no vercel.json + decisão "fluid" (vercel.json ou painel) + registro no vercel/pro-checklist.md

**Impacto:** Tudo que toca o banco fica mais rápido. Hoje cada operação Prisma custa p50 72 ms (piso de 60 ms), o que prova que a função não está junto do Neon. Na mesma região AWS o RTT fica em ~1-2 ms. Estimativas: recarga da lista (~10-12 etapas em série) de ~0,8 s para ~0,1 s; encerrar (~17 queries) de ~1,2 s para ~0,2-0,3 s; envio de texto perde ~0,2-0,3 s.

**Ação do usuário:** Painel Vercel: conferir Function Region e Fluid Compute (Settings → Functions). Criar um DATABASE_URL com escopo Preview sem pgbouncer=true. Depois de validado, trocar o DATABASE_URL de Production e fazer Redeploy. Informar em que região estão o Railway (cérebro e relay) e o bucket S3 (AWS_REGION).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `vercel.json` | (raiz) — só "crons" | 1-36 (não há "regions") | Adicionar "regions": ["cle1"] antes de "crons". Cleveland fica na AWS us-east-2, a mesma do host do Neon. JSON não aceita comentário: o porquê vai no pro-checklist e no commit. |
| `vercel/pro-checklist.md` | §2 Fluid Compute + memória | 19-28 | Novo item "Function Region = cle1". Documentar os passos de DATABASE_URL sem pgbouncer=true (Preview, depois Production) e a receita de medição antes/depois. |
| `app/api/diag/db-latency/route.ts` | GET (novo, temporário) | novo | dynamic='force-dynamic'. try { await requirePermission('manage_team') } catch → 403. Roda em série 10× db.$queryRaw`SELECT 1` e 10× db.whatsAppConversation.findFirst({select:{id:true}}). Devolve { region: process.env.VERCEL_REGION, selectP50, selectP90, prismaP50, prismaP90 }. Sem URL nem segredo na resposta. Remover depois da medição. |

**Passos:**
1. (Usuário) Painel Vercel → Settings → Functions: anotar a Function Region atual e se o Fluid Compute está ligado. Anotar se o DATABASE_URL de Production/Preview tem pgbouncer=true (o .env local tem pgbouncer=true&connection_limit=25&pool_timeout=30, pooler us-east-2).
2. Linha de base ANTES de qualquer deploy desta onda (e obrigatoriamente antes da B5, que muda o horário do log). Rodar só leitura as SQLs da auditoria: (a) delta entre creates consecutivos de Notification nos loops bot.ts:524/712, cron-tasks.ts:972 e service.ts:645, com p10/p50/p90 em 7 dias (hoje 60/72/148 ms); (b) whatsapp_messages.createdAt → logs.createdAt do wa_text (p50 419 ms); (c) pg_stat_statements: BEGIN + DEALLOCATE ALL + COMMIT ÷ statements de app (hoje ~71% dos comandos).
3. Código: adicionar "regions": ["cle1"] no vercel.json e a rota /api/diag/db-latency. Deploy de PREVIEW da branch.
4. (Usuário) Environment Variables: criar DATABASE_URL com escopo Preview (só a branch), igual à atual sem pgbouncer=true. Manter o host -pooler, connection_limit e pool_timeout. A IA não edita .env (hook bloqueia).
5. No preview: conferir o header x-vercel-id (formato <borda>::cle1::<id>) e GET /api/diag/db-latency. Smoke manual com contato e card de TESTE: abrir inbox e conversa, tag, encerrar e reabrir, ficha, mover card no Kanban. Atenção: o preview grava no banco de PRODUÇÃO.
6. Produção em dois passos, para separar região de pgbouncer (a auditoria não conseguiu separar os dois): (i) merge com regions=cle1, mantendo pgbouncer=true, e medir 24h úteis; (ii) (usuário) trocar o DATABASE_URL de Production para a versão sem pgbouncer=true, fazer Redeploy e medir mais 24h. Rollback: remover "regions" ou voltar a env.
7. (Usuário) Ligar o Fluid Compute se estiver desligado. Ele reaproveita instância e pool de conexão, e deixa barato o waitUntil da B5.
8. Remover a rota de diagnóstico. Rodar /mapa-atualizar infra (região + pgbouncer) e atualizar o pro-checklist.

**Regras tocadas:**
- .env não pode ser editado pela IA: a troca de DATABASE_URL é do usuário no painel
- Teste manual roda contra PRODUÇÃO: usar card e contato de teste e apagar ao final
- Nunca hardcode segredo ou dado pessoal (a rota diag não devolve URL nem credencial)
- Crons continuam em UTC e maxDuration continua igual (região não muda isso)

**Riscos:**
- Sem pgbouncer=true, se o pooler do Neon recusar prepared statements nomeados, aparecem erros 'prepared statement "s0" already exists/does not exist'. Por isso o teste vai primeiro ao preview. Rollback = voltar a env e redeployar.
- Região única, sem failover (multi-região com failover é Enterprise). Hoje, em iad1, é igual.
- Serviços fora de us-east-2 (S3 e Railway, se estiverem em sa-east-1, us-east-1 ou us-west) ganham ou perdem alguns ms por chamada. É desprezível perto do ganho no banco, mas vale conferir.
- O preview usa o banco de produção: toda escrita de teste é real.
- A métrica wa_text create→log deixa de medir latência depois da B5 (o log vai para depois da resposta). Medir a B1 antes, ou usar só os loops de notificação.
- Conferir no painel se o preço de CPU/GB-h de cle1 é igual ao de iad1.

**Testes:**
- Sem teste automatizado (é config de plataforma).
- npx tsc --noEmit e npx eslint app/api/diag/db-latency/route.ts.

**Validação manual:** 1) x-vercel-id com ::cle1:: no preview e depois em produção. 2) /api/diag/db-latency: SELECT 1 com p50 < 10 ms (hoje ~60 ms estimados). 3) SQL dos loops de notificação: p50 de 72 ms para < 15 ms após (i) e para menos ainda após (ii). 4) pg_stat_statements: DEALLOCATE ALL para de crescer após (ii). 5) Vercel Observability: p50 das POST /nova-dash (server actions) e do GET /api/whatsapp/messages caem.

**Revisão: ajustar**
- problema: Símbolos e linhas conferem: vercel.json não tem "regions" (1-36); nenhum preferredRegion no código; §2 do pro-checklist fica em 19-28.
- problema: O smoke test no preview não prova que tirar pgbouncer=true é seguro. Os erros 'prepared statement "sX" already exists/does not exist' costumam aparecer só com concorrência real, quando várias conexões Prisma passam pelo mesmo PgBouncer. O preview tem tráfego quase nulo, então o risco se concentra no passo (ii), em produção.
- problema: Falta prever como logar no preview. O NEXTAUTH_URL de Preview pode apontar para o domínio de produção, e o redirect do Google OAuth não aceita *.vercel.app. Ainda há a Deployment Protection da Vercel e a trava de IP (requirePermission aplica). Se nada disso for tratado, a rota /api/diag e o smoke manual não abrem.
- problema: Existe caminho mais simples para o Fluid Compute: dá para declarar "fluid": true no vercel.json, versionado e revisável, em vez de depender de um clique no painel. Ele define o maxDuration padrão, e B4/B5 dependem disso.
- problema: A mudança não piora a latência do Brasil de forma relevante (gru1→cle1 fica ~10-15 ms acima de gru1→iad1), mas o ganho só existe se a região atual não for us-east-2. A rota diag mede isso antes do merge. O item está correto.
- ajuste: No passo (ii): trocar o DATABASE_URL de Production em horário de baixo movimento e, nas primeiras 2 h, filtrar os logs da Vercel por 'prepared statement'. Aparecendo 1 ocorrência que seja, fazer rollback (voltar a env e Redeploy). Escrever isso no pro-checklist.
- ajuste: Nos pré-requisitos do preview: conferir NEXTAUTH_URL/NEXTAUTH_SECRET com escopo Preview, usar login por credenciais (o Google OAuth não aceita o domínio do preview), testar do escritório (trava de IP) e liberar o preview na Deployment Protection. Sem isso, os passos 5 e 'validar no preview' de B2, B4 e B5 não rodam.
- ajuste: Avaliar "fluid": true no vercel.json no mesmo PR do "regions": ["cle1"] (se o usuário preferir o painel, manter como está). Registrar no pro-checklist qual das duas formas vale.
- ajuste: Manter a rota diag com requirePermission('manage_team') e fora das allowlists; o arquivo pode ficar fora do merge na main (commit só na branch de preview).

**Em aberto:**
- Qual a Function Region atual? A auditoria infere iad1 pelo piso de 60 ms, mas o painel é que decide.
- O Fluid Compute está ligado? Isso muda o maxDuration padrão das server actions e a eficiência do waitUntil (B5/B4).
- Em que região estão o Railway (cérebro /reply e /assist, relay SSE) e o bucket S3?

## PR03 Inbox: desarmar recargas automáticas
**Por que agora:** Esforço P e sem dependência. Corta cerca de 25% das cargas completas da lista (foco ~17% + rede de 120 s ~8%), desarma a recarga por evento SSE (GR-4) antes de qualquer conserto do relay e cria o refresh-gate.ts (single-flight/coalescer) que o A1 e o A2 usam.

**Deploy:** Só frontend. Testes vitest para createSingleFlight/createCoalescer (quem chama durante o voo só resolve depois da 2ª execução). Limitação a documentar: voltar de aba oculta ainda recarrega se o hash mudou (resolve no B3).

**Medir antes/depois:**
- PR03 (A4): cargas completas por mensagem (calls da query da lista ÷ mensagens na janela) 3,0 → ~2,2. A parcela de foco/montagem (~17%) cai para ~0 e a rede de 120 s (~8%) passa para 10 min. Medição por pg_stat_statements na mesma janela de dia útil.

### A4 — Desarmar recargas automáticas: sem revalidateOnFocus na lista/total, rede de segurança de 10 min, single-flight e guarda no onStream (oculta/coalescida)
Onda A_sync_inbox · esforço P · depende de — · migration: não · micro: não · refs: GR-4, GR-5, GR-8, BACK-1, [MISSED backend] Voltar o foco à aba enfileira 3-4 server actions, [MISSED frontend] O SSE recarrega a lista mesmo com a aba em segundo plano, FE-2

**Impacto:** Voltar do WhatsApp Web ou do celular para o CRM não baixa mais a lista inteira na frente do primeiro clique. As recargas pedidas ao mesmo tempo viram uma só, em vez de empilhar na fila de actions. Se alguém consertar o relay SSE, o inbox não passa a recarregar a lista a cada mensagem de qualquer contato em todas as abas: a 'bomba latente' fica desarmada.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/utils/refresh-gate.ts (novo)` | createSingleFlight, createCoalescer | arquivo novo | `createSingleFlight(run: () => Promise<unknown>)` → `trigger()`: se já há execução em voo, marca 'de novo' e devolve a promise em voo; ao terminar, roda UMA vez mais se foi marcado. Motivo: o mutate() do SWR 2.3.8 não deduplica (index.mjs:542). `createCoalescer({ delayMs, isHidden, run })` → `{ trigger, flushIfDirty, dispose }`: com a aba oculta só marca 'sujo'; com timer pendente ignora; senão agenda run em delayMs. |
| `app/_shared/hooks/use-whatsapp.ts` | useWhatsAppConversations, useWhatsAppConversationsTotal, comentários | 46-54 e 93-103 (comentários desatualizados); 55-75 (lista 56-62, versão 63-67, effect 68-73, retorno 74); 81-88 (total, opções em 85) | Lista: `{ refreshInterval: 600_000, revalidateOnFocus: false, shouldRetryOnError: false }` (antes 120s + foco). Versão: `revalidateOnFocus: true`, então no foco só o hash barato é consultado e ele decide se recarrega. O effect do hash e o retorno `refreshConversations` passam pelo single-flight, instanciado com useRef/useMemo sobre o `mutate`. Total: `revalidateOnFocus: false`, `refreshInterval: 300_000`. Corrigir os comentários: a thread faz poll de 8s, não 5s; a lista tem 1.000, não 200; e explicar por que o foco não recarrega a lista (auditoria de 24/09: ~17% das cargas vinham do foco). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | onStream / useChatStream | 515-522 | Criar o coalescer com useRef (delay de 2500 ms, `isHidden: () => document.hidden`, run = refreshConversations do single-flight). onStream: continua ignorando canal que não é 'whatsapp:'; `if (channelId === whatsapp:${activeContactId} && !document.hidden) mutateMessages()`; depois `coalescer.trigger()`. Effect com listener de `visibilitychange` que chama `flushIfDirty()` quando a aba volta a ficar visível; no unmount, `dispose()` e remover o listener. Comentário: o SSE não entrega em produção hoje (GR-3); o guarda tem que entrar ANTES de alguém consertar o relay. |

**Passos:**
1. Criar app/_shared/utils/refresh-gate.ts com createSingleFlight e createCoalescer, puros e testáveis com fake timers.
2. Em use-whatsapp.ts: mudar as opções do SWR da lista, da versão e do total; fazer o refresh e o effect do hash passarem pelo single-flight; corrigir os comentários desatualizados.
3. Em WhatsAppInbox.tsx: pôr o guarda no onStream (coalescer, document.hidden, flush no visibilitychange).
4. Rodar /validar e /mapa-atualizar whatsapp-bot ('Onde fica': lista 10 min sem foco; Fluxo 10).

**Regras tocadas:**
- Board/inbox atualizam por polling com hash (sem revalidatePath): mantido, só com menos gatilhos
- Comentários explicam o porquê

**Riscos:**
- Rede de segurança mais lenta: mudança fora do hash (ex.: nome do card editado no Kanban) pode levar até 10 min em horário calmo. No expediente o hash muda em ~55% das janelas de 15s, então na prática isso aparece em segundos.
- Evento SSE passa a atualizar a lista com até 2,5s de atraso. Hoje o SSE nem entrega.
- Aba oculta que recebeu eventos faz uma recarga ao voltar (flushIfDirty), igual ao foco antigo, mas só quando houve evento.
- O single-flight precisa sobreviver a re-render. Instanciar com useRef e ligar ao mutate estável do SWR; se for recriado a cada render, a proteção some.

**Testes:**
- tests/refresh-gate.test.ts: single-flight com 3 triggers durante uma execução gera 2 execuções no total (a em voo + 1).
- tests/refresh-gate.test.ts: coalescer com 5 triggers em 1s gera 1 run depois de delayMs (vi.useFakeTimers).
- tests/refresh-gate.test.ts: com isHidden=true, trigger não roda e flushIfDirty roda uma vez e limpa o sujo; um segundo flushIfDirty não faz nada.

**Validação manual:** `npm run dev` com o .env de produção, só leitura: (1) Abrir o inbox, alternar para outra janela e voltar 5 vezes: no Network aparece no máximo o getWhatsAppInboxVersion (Next-Action), e a listagem só roda se o hash mudou. (2) Deixar a aba parada por 3 min em horário calmo: nenhum POST da lista por intervalo, só o hash a cada 15s. (3) Com o relay conectado, se estiver de pé, ou simulando: chamar onStream várias vezes pelo React DevTools ou mandar 3 mensagens seguidas do celular de teste deve gerar 1 recarga, e nenhuma com a aba oculta até ela voltar a ficar visível.

**Revisão: ajustar**
- problema: Linhas conferidas: use-whatsapp.ts 46-54, 55-75 (lista 56-62 com revalidateOnFocus true e 120s; versão 63-67; effect 68-73; retorno 74), 77-80, 81-88 (opções em 85) e 93-103. Inbox onStream 516-522. SWR 2.3.8 instalado; mutate() sem dedupe confirmado.
- problema: createSingleFlight 'devolve a promise em voo': quem ainda faz `await refreshConversations()` (handleDeleteContact L895 e, se sobrar, block/unblock) recebe o resultado de uma carga que começou ANTES da própria mutação e pode ver dado velho. A execução extra ('de novo') não é aguardada.
- problema: Com a rede de segurança em 10 min, a perda de atualização por fetch descartado (ver A1/A2) deixa de ser coberta em até 2 min e passa a ficar até 10 min em horário calmo. O item precisa do onDiscarded.
- problema: O impacto está superestimado. Com a aba oculta, o SWR não faz o poll da versão (refreshWhenHidden=false). Ao voltar depois de >15s em horário comercial, o hash quase sempre mudou (55-72% das janelas de 15s) e a lista inteira recarrega de qualquer jeito, na frente do primeiro clique. O ganho real é no alt-tab com a janela ainda visível. Só o delta da próxima onda resolve o resto.
- problema: O enunciado pede revalidateOnFocus false na lista e no total; a spec cumpre isso. Subir o intervalo do total para 300s é extra, mas inofensivo (count barato).
- ajuste: createSingleFlight.trigger(): se já houver execução em voo, marcar como sujo e devolver a promise da execução EXTRA (encadeada), não a em voo. Teste: 'awaiter chamado durante o voo só resolve depois da 2ª execução'.
- ajuste: Na lista: `onDiscarded: () => gate.trigger()`, com gate = single-flight dentro de um coalescer de ~2s, para não entrar em laço com cliques em sequência.
- ajuste: Opcional e barato: fazer o mutate disparado pelo hash (effect 68-73) passar pelo mesmo coalescer de 1,5-2,5s. Assim o primeiro clique depois de voltar à aba entra na fila de actions antes da recarga completa.
- ajuste: Corrigir o user_impact para 'no alt-tab com a janela visível; voltar de aba oculta ainda recarrega se o hash mudou (resolve no delta)'.

**Em aberto:**
- O useChatStream (use-chat.ts:153-157) reconecta a cada 3s fixos quando o EventSource falha, e cada tentativa chama GET /api/chat/token (invocação na Vercel). Colocar backoff exponencial até ~60s junto com este item? É fora do inbox, mas afeta a conta da Vercel se o relay estiver recusando conexões.

## PR05 Bot WhatsApp: nudge e despedida só das 7h às 21h (BRT)
**Por que agora:** Esforço P e independente. Acaba com a despedida de madrugada (EF-3). As funções novas ficam em date-br.ts, com teste. Precisa entrar antes de D3/D5/D8, que mexem no mesmo runNudgePhase.

**Deploy:** Só CRM. Na validação manual, não disparar /api/whatsapp/cron/nudge durante a execução agendada (:00/:15/:30/:45), porque roda a fase para todos os clientes de produção.

**Medir antes/depois:**
- PR05 (D6): nudges e despedidas enviados entre 21h e 7h BRT (hora via date-br) = 0 por dia.

### D6 — [CÓDIGO CRM] Nudge e despedida por silêncio só das 7h às 21h (BRT)
Onda D_bot_ia · esforço P · depende de — · migration: não · micro: não · refs: EF-3

**Impacto:** Cliente: não recebe mais 'vou encerrar seu atendimento' às 23h (41% das despedidas saíam à noite); a conversa fica aberta até o horário comercial. Chefe: menos mensagem proativa de madrugada (bom para a qualidade da conta na Meta), sem mexer em teto nem cooldown.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/utils/date-br.ts` | BR_BUSINESS_START_H, BR_BUSINESS_END_H, isBrBusinessHour, nextBrBusinessSlot (novos) | novo (após L160) | export function isBrBusinessHour(ts: number): boolean; export function nextBrBusinessSlot(ts: number): Date — mesmo algoritmo de cron-tasks.ts 271-286 (7h-21h, todos os dias) |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | isBusinessHours / nextBusinessSlot | 270-286 | trocar pelas funções de date-br.ts (comportamento idêntico); businessMinutesBetween pode ficar ou ir junto |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | runNudgePhase | 601-607 | if (!isBrBusinessHour(now)) { console.log(`[WHATSAPP CRON] nudge adiado até ${nextBrBusinessSlot(now).toISOString()} (fora do horário)`); return results; } |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | runNudgePhase — consultas | 609-618, 680-688 | orderBy: { lastMessageAt: 'asc' } e { botNudge30At: 'asc' } para escoar primeiro o acúmulo da noite |

**Passos:**
1. [CÓDIGO CRM] Levar o horário comercial do cron (7h-21h BRT, todos os dias) para date-br.ts como funções puras: é regra inviolável que todo corte por hora passe por date-br.ts, e hoje ele está com offset fixo dentro do cron-tasks.
2. runNudgePhase: fora do horário, sair da fase inteira (nudge, decideFollowup/IA, despedida e encerramentos silenciosos) e logar o próximo slot. 'Adiar com nextBusinessSlot' = a próxima rodada do cron (a cada 15 min) dentro do horário processa.
3. Ordenar as duas consultas (lastMessageAt/botNudge30At asc) para que o acúmulo da noite saia na ordem certa às 7h, respeitando o marcapasso existente (sem mudar RUN_BUDGET_MS, gaps nem take).
4. Não mexer em recuperação (já usa isBusinessHours), cooldown, tetos nem marcapasso. Não unificar com businessHours() do bot.ts (seg-sex 8-18/sáb 8-12, que vai ao cérebro e tem outro propósito). Registrar a divergência no mapa.
5. A cópia de nextBusinessSlot em signature/core.ts:1725 fica (feature desligada).

**Regras tocadas:**
- fuso via date-br.ts
- não afrouxar cooldown/tetos/marcapasso (só reduz envio)
- comentários explicam o porquê

**Riscos:**
- Às 7h há um acúmulo (nudges de quem ficou calado entre ~20h30 e 7h). Com take 25 e o marcapasso (~16 a 30 envios por rodada de 240 s), escoa em 30 a 60 min.
- Conversas ficam em 'bot' a noite toda (pasta Bot mais cheia de manhã).
- Nudge às 7h para uma pergunta do bot das 21h: tom aceitável; a janela de 24h continua checada (isWindowOpen).
- A órfã noturna do D3 só vai à Fila às 7h.

**Testes:**
- tests/date-br.test.ts: isBrBusinessHour em 06:59 BRT=false, 07:00=true, 20:59=true, 21:00=false; nextBrBusinessSlot(23:30 BRT de 10/09) = 11/09 07:00 BRT (10:00Z); nextBrBusinessSlot(05:00 BRT) = mesmo dia 07:00 BRT; dentro do horário devolve o próprio instante

**Validação manual:** Disparar GET /api/whatsapp/cron/nudge (CRON_SECRET) às 21h30 ou depois: log 'nudge adiado até …'. No dia seguinte, SQL somente leitura: mensagens out sentByBot=true e systemSource null (nudge/despedida do cron) criadas entre 21h e 7h BRT (AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') devem ser ~0; entre 7h e 8h, o escoamento.

**Revisão: ok**
- problema: Confere: runNudgePhase cron-tasks.ts:601-607 não consulta horário; isBusinessHours/nextBusinessSlot :270-286 usam offset fixo fora do date-br.ts; as consultas :609-618 e :680-688 não têm orderBy. Levar as funções para date-br.ts cumpre a regra de fuso. Nada de cooldown, teto ou marcapasso é afrouxado, porque o volume noturno só cai. O caso de teste 23:30 BRT → 10:00Z do dia seguinte está correto.
- problema: Detalhe: em date-br.ts, prefira o mesmo mecanismo das outras funções (BR_TZ/brDateTimeParts) ao offset fixo de -3 h, por consistência. O Brasil não tem horário de verão hoje, então não há bug.
- problema: O risco da validação manual por disparo do cron está descrito no D3 e em missing.

**Em aberto:**
- Para state de triagem, trocar a despedida por entrada silenciosa em standby (sugestão do EF-3)? É decisão de tom/negócio: pedir ao chefe ou levar às instruções do /farewell. Fora desta onda.

## PR06 Painéis: aba Chatbot respeita o número e 'Origem dos leads' sem caixa de erro
**Por que agora:** São dois bugs de esforço P que o gestor vê hoje: métricas de todos os números com um número selecionado, e erro na aba padrão para quem está fora da allowlist.

**Deploy:** Só frontend. Se o E1c vier logo depois, o E1e vira só checagem manual.

**Medir antes/depois:**
- PR06 (E1e+E1f): checagem manual com o número X selecionado: os totais da aba Chatbot batem com a consulta filtrada por numberId. Usuário fora da allowlist não vê caixa de erro.

### E1e — Bug: aba Chatbot mostra métricas de todos os números com um número selecionado
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: PAINEL-5

**Impacto:** Ao comparar linhas, o gestor deixa de ver as métricas da IA somadas de todos os números.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/workspace/manager/ChatbotDashboard.tsx` | skipFirstFetch | 135-140 | useRef(Boolean(initialData) && numberId === null && period === 'range'). O initialData vem de get-strategic-dashboard.ts:89 sempre com numberId=null. Alternativa: key={numberId ?? 'all'} no ChatbotPanel (StrategicDashboard.tsx:182). |

**Passos:**
1. Aplicar a condição no skipFirstFetch. Se o E1c entrar no mesmo PR, este item some junto com o initialData e fica só como checagem manual.

**Regras tocadas:**
- Multi-número: métrica por número nunca pode cair na visão agregada

**Riscos:**
- Nenhum relevante; mudança de 1 linha.

**Testes:**
- Manual.

**Validação manual:** Selecionar um número no topo do Dashboard e só então abrir a aba Chatbot: as decisões diferem das de 'Todos os números'. No Network aparece uma chamada com o numberId.

**Revisão: ok**
- problema: ChatbotDashboard.tsx:135 `useRef(Boolean(initialData))` confere, e o initialData vem de get-strategic-dashboard.ts:89 com numberId=null. O bug é real. O E1c remove o initialData e resolve por construção.
- ajuste: Se E1c e E1e forem no mesmo PR, o item vira só a checagem manual. Se o E1c atrasar, aplicar a condição de 1 linha.

### E1f — Origem dos leads sem caixa de erro para quem está fora da allowlist
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: PAINEL-6

Escopo neste PR: E1f (+ mensagem própria em ChatbotDashboard.tsx:145 e AiCorner.tsx:126)

**Impacto:** A equipe fora da allowlist para de ver a caixa vermelha 'erro' na aba padrão do dashboard: a seção some ou mostra um aviso neutro.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/StrategicDashboard.tsx` | TabsContent analytics | 165-168 | {canViewChatbot && <LeadOriginSection …/>}, com canViewChatbot vindo da carga única (E1c). Sem o E1c, usar data.chatbot != null. |
| `app/nova-dash/workspace/manager/LeadOriginSection.tsx` | render de erro | 149-150 | Mensagem própria ('Não foi possível carregar a origem dos leads.' + Tentar novamente) no lugar de e.message, que chega mascarado em produção. |

**Passos:**
1. Condicionar a renderização.
2. Trocar o texto de erro cru por uma mensagem própria.

**Regras tocadas:**
- Erro de server action chega mascarado em produção: a UI precisa de mensagem própria
- A UI só esconde; o guard (allowlist + requireTeam) continua no servidor

**Riscos:**
- Nenhum.

**Testes:**
- Manual.

**Validação manual:** Logar com um usuário da equipe fora da allowlist (conta de teste) → Dashboard → Analytics: sem caixa vermelha. Com usuário da allowlist, a seção aparece normal.

**Revisão: ok**
- problema: StrategicDashboard 165-168 e LeadOriginSection 149-150 conferem. A condição por canViewChatbot (ou data.chatbot != null) resolve o PAINEL-6, e o guard continua no servidor.
- ajuste: Aplicar a mesma mensagem própria (sem e.message, que chega mascarado) ao ChatbotDashboard.tsx:145 e ao AiCorner.tsx:126, que têm o mesmo padrão.

## PR07 WhatsApp: timeout no download de mídia da Meta + log wa_media_fail
**Por que agora:** Esforço P e independente. Hoje o webhook sem timeout segura a função. O log obrigatório cria a linha de base de mídia perdida.

**Deploy:** wa_media_fail entra no LogAction e no mapa whatsapp-bot.md.

**Medir antes/depois:**
- PR07 (C10): p99 de duração do webhook nos logs da Vercel. wa_media_fail por dia vira linha de base nova. Mensagens inbound de mídia sem mediaKey.

### C10 — Timeout nos fetch da Meta em downloadMediaToS3 e registro da falha
Onda C_documentos · esforço P · depende de — · migration: não · micro: não · refs: DOC-7

**Impacto:** Hoje não há sintoma visível. Tira o risco de um download pendurado segurar o webhook (e o bot) numa rajada de arquivos, e a falha passa a ficar registrada.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/whatsapp/client.ts` | downloadMediaToS3 | 616-665 (fetch de metadata 626-629; binário 635-638; catch 661-664) | Adicionar `signal: AbortSignal.timeout(10_000)` no fetch de metadata e `signal: AbortSignal.timeout(30_000)` no binário. No catch, `await reportCriticalError(`whatsapp.downloadMediaToS3 ${mediaId}`, err)` no lugar do console.error, mantendo `return null`. |
| `app/_shared/lib/whatsapp/service.ts` | ingestIncomingMessage (bloco de mídia) | 340-351 | Opcional: se `stored` vier null, `logWhatsAppEvent({ action: 'wa_media_fail', … })`. O reportCriticalError hoje é só console.error, e sem isso a falha não é mensurável depois. |

**Passos:**
1. Adicionar os AbortSignal e o reportCriticalError.
2. Opcional: log wa_media_fail (e documentar a ação no mapa via /mapa-atualizar).
3. Não mover o download para depois do bot: a URL da Meta expira em ~5 min.

**Regras tocadas:**
- Webhook com maxDuration 120 e bot em linha: não somar trabalho síncrono (aqui só limita o existente)
- Multi-número: getCreds(numberId) intacto; número inativo continua sem cair no default

**Riscos:**
- Documento muito grande (até 100 MB na Meta) com rede lenta pode estourar 30 s e a mensagem fica sem anexo. É raro (1 falha em ~6.089 mídias em 30 dias).

**Testes:**
- Sem teste (I/O). Opcional: vitest com fetch mockado que nunca resolve, esperando retorno null em menos de 31 s com fake timers.

**Validação manual:** Mandar foto e PDF do celular de teste (WHATSAPP_TEST_NUMBERS) e ver os anexos na thread. Nos logs da Vercel, nenhum '[ERRO CRÍTICO] whatsapp.downloadMediaToS3'.

**Revisão: ok**
- problema: Conferido: client.ts:616-665 (fetch 626-629 e 635-638, catch 661-664) e service.ts:340-351. reportCriticalError (report-error.ts:14) é só console.error, então sem o log wa_media_fail a falha continua invisível.
- problema: O timeout de 30 s também aborta a leitura do body (arrayBuffer), o que é bom. Numa rajada, o pior caso por mídia é 40 s dentro do webhook com maxDuration 120. É o mesmo teto que já existe, só que agora limitado.
- ajuste: Tornar obrigatório (não opcional) o `logWhatsAppEvent({ action: 'wa_media_fail', metadata: { mediaId, numberId } })` quando `stored` vier null. Sem ele não dá para medir o efeito do timeout novo. Documentar a action no mapa.

## PR08 Card: upload com o File direto, key única e checagem do registro
**Por que agora:** Esforço P, isolado em FilesTab.tsx/upload-s3.ts. Tira a conversão para base64 do navegador e o 'subiu mas não registrou'. Vem depois do PR01, que também mexe no FilesTab (saveName).

**Deploy:** PUT direto na URL pré-assinada, respeitando o limite de 4,5 MB. Key `${Date.now()+idx}-${file.name}`. Mensagem de erro própria.

### C8 — FilesTab: PUT com o File direto, key única por arquivo e checagem do registro
Onda C_documentos · esforço P · depende de — · migration: não · micro: não · refs: DOC-8

**Impacto:** Soltar PDFs grandes não congela mais a aba. Dois arquivos com o mesmo nome sobem os dois. O 'Upload concluído' só aparece se o arquivo foi mesmo registrado no card; se não, aparece erro claro.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/card-dialog/FilesTab.tsx` | fileToBase64, estado base64Files, handleDrop | 97-103, 107, 182-193 | Remover fileToBase64 e base64Files. handleDrop vira `setFiles(p => [...p, ...accepted])` (síncrono). |
| `app/nova-dash/card-dialog/FilesTab.tsx` | uploadFiles | 195-255 | `fileInfos = files.map(f => ({ name: f.name, type: f.type || 'application/octet-stream' }))`. Parear por ÍNDICE (`presignedUrls[i] ↔ files[i]`, o Promise.all preserva a ordem), nunca por nome (bug da L210). PUT com `body: files[i]` e o mesmo Content-Type assinado. `const reg = await fetch('/api/documents', …); if (!reg.ok) throw new Error('Arquivos enviados, mas não registrados no card. Tente de novo.')` antes do toast de sucesso. |
| `app/_actions/documents/upload-s3.ts` | getPresignedUrls | 31-59 (key em 39-40) | A key hoje é `${Date.now()}-${file.name}` dentro do Promise.all: dois arquivos de mesmo nome no mesmo lote caem na MESMA key e o 2º sobrescreve o 1º. Trocar para `${Date.now()}-${idx}-${file.name}` (map com índice). |
| `app/nova-dash/card-dialog/types.ts` | FileWithBase64 | 46 | Remover (só o FilesTab usa). |

**Passos:**
1. Ajustar a key em getPresignedUrls.
2. Refatorar handleDrop e uploadFiles para usar File direto, com pareamento por índice.
3. Checar res.ok do POST e mostrar mensagem própria (erro de produção chega mascarado).

**Regras tocadas:**
- Limite de 4,5MB: mantido, porque o PUT continua presigned direto no S3 e a rota recebe só key
- UI precisa de mensagem própria (erro de action e rota chega mascarado em produção)
- Dark Reader: não usar classes dark: novas

**Riscos:**
- Se o POST falhar e o usuário reenviar, os objetos do 1º PUT ficam órfãos no S3 (custo desprezível).
- POST /api/documents sem requireTeam é tarefa separada; aqui só o cliente muda.

**Testes:**
- Sem lógica pura relevante. Opcional: extrair `uploadKey(prefix, ts, idx, name)` para app/_shared/utils/s3-keys.ts e testar que dois nomes iguais geram keys diferentes.

**Validação manual:** No card de TESTE: soltar 2 arquivos 'rg.pdf' de pastas diferentes e ver os 2 no card com conteúdos distintos. Soltar um PDF de ~30 MB sem a aba travar. Bloquear /api/documents no DevTools e ver o erro próprio, sem 'Upload concluído'.

**Revisão: ok**
- problema: Conferido: FilesTab.tsx:97-103, 107, 182-193, 195-255 (pareamento por nome na L210, POST sem res.ok em 233-241), upload-s3.ts:37-50 (key `${Date.now()}-${file.name}` na L39 dentro de Promise.all) e types.ts:46 (só o FilesTab usa).
- problema: O prefixo de key `<ts>-<idx>-nome` muda o formato `^\d{10,}-nome`. Nenhum parser lê keys de uploads/ hoje, mas `${Date.now() + idx}-${file.name}` mantém o formato e resolve igual.
- ajuste: Preferir `${Date.now() + idx}-${file.name}` na key.
- ajuste: Na mensagem de erro do POST, usar texto próprio (erro mascarado em produção), como a spec já prevê.

## PR09 Script: diagnóstico de mídias quebradas (dry-run)
**Por que agora:** Com o hotfix no ar, o script mede o estrago (rename_pareavel, purgado, doc_quebrado, ambiguo) e responde se o bucket tem versionamento, que é a única forma de recuperar o que a purga apagou.

**Deploy:** Não vai para deploy: o usuário roda localmente, com OK explícito, porque lê produção (banco + S3). O CSV vai para o scratchpad/os.tmpdir e é apagado depois da revisão. O --apply é o PR24.

### C1b — Script de reparo dos anexos quebrados por rename (dry-run padrão)
Onda C_documentos · esforço M · depende de C1, C2 · migration: não · micro: não · refs: DOC-1

Escopo neste PR: C1b (só dry-run)

**Impacto:** As ~318 fotos e PDFs de 91 conversas que ficaram quebrados voltam a abrir na thread. Mídia de fluxo ou template apagada por rename fica listada no relatório para ser reenviada.

**Ação do usuário:** O dry-run só lê produção (banco + S3), mas rodar exige OK. O --apply em produção só com aprovação explícita, depois de revisar o CSV. Confirmar se o bucket tem versionamento e se a credencial do .env tem s3:ListBucket e s3:GetBucketVersioning.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `scripts/reparar-midias-renomeadas.mjs` | script novo (main) | novo arquivo | `node -r dotenv/config scripts/reparar-midias-renomeadas.mjs [--contact=<id>] [--apply] [--incluir-ordem] [--out=<csv>]`. Segue o padrão de hash-passwords.mjs: sem --apply só lê. Usa PrismaClient e S3Client próprios com HeadObject, ListObjectsV2, GetBucketVersioning, ListObjectVersions e CopyObject. |

**Passos:**
1. Preflight: GetBucketVersioning, HEAD numa mediaKey recente (espera 200) e HEAD em `whatsapp/__probe__/<uuid>` (espera 404). Se o probe der 403, a credencial não tem s3:ListBucket e não dá para distinguir 'sumiu' de 'proibido': abortar com mensagem clara.
2. Candidatos (só leitura, $queryRaw): Documents, inclusive na lixeira, com key LIKE 'whatsapp/%' que nenhuma whatsapp_messages."mediaKey" referencia (NOT EXISTS), sem '/docs/' (rascunho da ficha), agrupados pelo contactId da key. Esperado ≈318 em 91 contatos. Separar à parte os de 'whatsapp/flows/' (fluxo renomeado).
3. Por contato: ListObjectsV2(Prefix 'whatsapp/<cid>/') para montar um Set de keys existentes (1 chamada em vez de N HEADs). Mensagens do contato com mediaKey fora do Set = faltantes. Fazer também HEAD em toda mediaKey de WhatsAppFlow.steps e WhatsAppTemplate.headerMediaKey.
4. Plano por faltante: (a) bucket versionado com versão não-delete-marker = 'restaurar_versao' (CopyObject da versão para a MESMA key, sem mexer no banco); (b) sem versionamento, parear com Document candidato do mesmo contato, mesma extensão e Document.createdAt ≥ message.createdAt. Par 1↔1 = 'apontar_para_doc' (confiança alta). n↔n com a mesma contagem = 'par_por_ordem' (só aplica com --incluir-ordem). O resto fica 'ambiguo' (só relatório).
5. Saída: resumo no console e CSV (default em os.tmpdir(), fora do repo) com contactId, messageId, oldKey, ação, newKey/versionId e confiança. Só ids e keys, sem nome nem telefone.
6. --apply: CopyObject para 'restaurar_versao'; `UPDATE whatsapp_messages SET "mediaKey"=$new WHERE id=$id AND "mediaKey"=$old` para os pares aprovados. Nunca apaga nada, e o CSV (old→new) serve de rollback.
7. Fluxo ou template com mídia sumida: só relatório. A correção é reenviar a mídia pela tela de Fluxos ou Templates.

**Regras tocadas:**
- Escrita em produção só com aprovação (o .env aponta para o Neon de produção)
- Sem migration; UPDATE pontual com guarda por valor antigo
- Nunca hardcode dado pessoal: o relatório sai só com ids

**Riscos:**
- Pareamento heurístico errado aponta a bolha para o arquivo errado. Mitigação: só 1↔1 por padrão, par por ordem atrás de flag, CSV de rollback.
- Rodar o --apply antes de C1 e C2 em produção deixa a key compartilhada de novo, e o próximo rename ou purga apaga outra vez.
- Sem versionamento, a cópia original não volta. O reparo aponta a mensagem para a cópia do card (mesmo conteúdo, key nova).
- O HEAD pode dar 403 no lugar de 404 sem ListBucket (tratado no preflight).

**Testes:**
- Sem teste vitest (script de I/O). O parser de key reusa contactIdFromWhatsAppKey de app/_shared/utils/s3-keys.ts, já testado em C2.

**Validação manual:** Rodar o dry-run com --contact=<um contato citado na auditoria> e conferir o CSV contra a thread no inbox (bolha quebrada, card com o arquivo renomeado). Depois do --apply aprovado, abrir 3 conversas amostradas e ver as imagens de volta.

**Revisão: ajustar**
- problema: O escopo só pega o sintoma do rename. Os candidatos saem de 'Document sem mensagem apontando', o que deixa de fora: (a) as vítimas da purga (DOC-6), cujo Document já foi apagado e a mensagem aponta para key inexistente, sem Document candidato; (b) o Document re-anexado depois do rename, com key = mediaKey antiga, que continua QUEBRADO no card mesmo depois de a mensagem ser corrigida (a auditoria descreve esse caso).
- problema: A varredura por contato (91 ListObjects) é mais complexa e menos completa que um diff global. O prefixo whatsapp/ tem na ordem de dezenas de milhares de objetos, ou seja, poucas dezenas de ListObjectsV2 paginados.
- problema: Restaurar versão por CopyObject com `?versionId=` exige s3:GetObjectVersion, que não está no preflight.
- problema: 'Só ids, sem nome': as keys renomeadas carregam o nome digitado pela equipe (ex.: RG_Maria_Silva.jpeg), então o CSV tem dado pessoal.
- problema: O total esperado fica abaixo de 318: parte dos renames é de rascunho (`/docs/`), que a spec exclui corretamente.
- ajuste: Diagnóstico global: ListObjectsV2 paginado de `whatsapp/` inteiro num Set. Comparar com todas as `whatsapp_messages."mediaKey"` distintas ($queryRaw sem orderBy), as `Document.key` com prefixo whatsapp/, WhatsAppFlow.steps e WhatsAppTemplate.headerMediaKey. Classificar: rename_pareavel, purgado (sem Document; os purgados manualmente aparecem em logs document_purge com metadata.key), doc_quebrado (Document ativo com key faltante) e ambiguo.
- ajuste: Para doc_quebrado re-anexado: com --apply, soft-delete (deletedAt, deletedBy 'reparo-midia') quando já existe o Document renomeado do mesmo contato. Senão, só relatório.
- ajuste: Preflight também de s3:GetObjectVersion quando o versionamento estiver ativo.
- ajuste: Gravar o CSV no scratchpad ou os.tmpdir(), avisar que contém nomes e apagar depois de revisado.
- ajuste: Registrar que o resíduo (ambiguo/purgado) depende do fallback de UI (ver missing: onError na bolha).

**Em aberto:**
- O bucket tem versionamento? Se tiver, a restauração é exata e dispensa o pareamento.
- Aceita aplicar os pares 'por ordem' (confiança média) ou só os 1↔1?

## PR11 Banco: índices do hash do inbox e do sino
**Por que agora:** Esforço P. Hoje o hash faz seq scan de 130 mil linhas em cada poll de 15 s por aba (9,5% do tempo do banco). O índice do sino vai na mesma migration.

**Deploy:** A migration vai ANTES do código: /migration → SQL final só com os 2 CREATE INDEX IF NOT EXISTS (apagar DROP TABLE discord e qualquer DROP de pagamento) → db execute fora do horário comercial (bloqueia INSERT por segundos) → migrate resolve → deploy do getWhatsAppInboxVersion. Como o calendário (payment_schedule) já está aplicado no Neon mas não está na main, o migrate diff vai propor DROP de payment_schedules e das colunas de project_costs: apagar essas linhas à mão, como o DROP TABLE "discord".

**Medir antes/depois:**
- PR11 (A6): query do hash, média de 28 ms → < 2 ms. Buffers por chamada 6.600 → dezenas. Fatia do tempo do banco 9,5% → ~0.

### A6 — Hash de versão sem seq scan em whatsapp_messages: índice em createdAt via /migration (+ índice do sino do A3), mantendo nota interna no hash
Onda A_sync_inbox · esforço P · depende de — · migration: **sim** · micro: não · refs: LISTA-6, BACK-4, TAG-8, BACK-9 (índice do sino)

**Impacto:** Invisível para o chefe: o poll de 15s de cada aba deixa de ler ~130 mil mensagens (~28 ms, picos de 1,2s que atrasavam a fila de actions) e passa a levar ~1 ms. O custo deixa de crescer com a tabela. Com o índice do sino, abrir e ler conversa também fica mais barato.

**Ação do usuário:** Aprovar a aplicação do SQL no Neon de produção (prisma db execute + migrate resolve), de preferência fora do horário comercial: CREATE INDEX sem CONCURRENTLY bloqueia INSERT em whatsapp_messages e Notification por alguns segundos. Confirmar também o estado da migration payment_schedule, que está pendente no working tree.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `prisma/schema.prisma` | model WhatsAppMessage; model Notification | 875-913 (índices em 911-912); 485-506 (índices em 501 e 505) | WhatsAppMessage: `@@index([createdAt])`, com comentário: o hash do inbox pede max(createdAt) global a cada 15s por aba; notas internas não tocam a conversa, e por isso o termo fica. Notification (opcional, do A3): `@@index([contactId, read])`, com comentário: markConversationRead apaga o sino por contato. |
| `prisma/migrations/<AAAAMMDDHHMMSS>_inbox_hash_read_indexes/migration.sql (novo)` | migration | arquivo novo | `CREATE INDEX IF NOT EXISTS "whatsapp_messages_createdAt_idx" ON "whatsapp_messages"("createdAt");` e `CREATE INDEX IF NOT EXISTS "Notification_contactId_read_idx" ON "Notification"("contactId", "read");`, no padrão de 20260914150000_inbox_indexes. Apagar a linha `DROP TABLE "discord"` do diff. |
| `app/_actions/whatsapp/conversations.ts` | getWhatsAppInboxVersion | 423-442 (termo em 438) | Nenhuma mudança de SQL: com o índice, `max("createdAt")` vira Index Only Scan Backward. Só atualizar o comentário do bloco dizendo por que o termo continua: sendWhatsAppInternalNote (send-message.ts:251-291) e postInternalNote (bot.ts:470-499) criam mensagem sem mexer em whatsapp_conversations, e a prévia da lista inclui nota interna. |

**Passos:**
1. Antes: confirmar se a migration 20260924010000_payment_schedule, que ainda não foi commitada nesta branch, já foi aplicada no Neon. Se não foi, aplicar/commitar primeiro, ou o migrate diff vai trazer as tabelas dela junto.
2. Editar schema.prisma (2 @@index) → npx prisma validate/format.
3. /migration inbox_hash_read_indexes: migrate diff → conferir que o SQL tem SÓ os 2 CREATE INDEX (apagar DROP TABLE "discord") → salvar → pedir aprovação ao usuário → db execute → migrate resolve --applied → prisma generate.
4. Rodar EXPLAIN ANALYZE (só leitura) do hash: esperado Index Only Scan Backward em whatsapp_messages_createdAt_idx, ~1 ms. Rodar também o do updateMany do sino, como SELECT equivalente.
5. Atualizar o comentário de getWhatsAppInboxVersion. Rodar /validar e /mapa-atualizar data-model (índices novos).

**Regras tocadas:**
- Migrations só via /migration (migrate diff → db execute → migrate resolve); nunca migrate dev/reset; apagar a linha do DROP TABLE "discord"
- Índices com CREATE INDEX IF NOT EXISTS e nome no padrão Prisma (<tabela>_<colunas>_idx) para o próximo diff não recriar
- Comentários explicam o porquê

**Riscos:**
- Lock de escrita durante a criação do índice (~130 mil linhas em whatsapp_messages, ~138 mil em Notification, poucos segundos). Webhooks que chegarem nesse intervalo esperam, não falham. Rodar à noite.
- O working tree está na branch chore/ai-harness, com mudanças de custos e uma migration payment_schedule não commitadas. Misturar os dois diffs pode aplicar tabelas que não eram o objetivo. Fazer a onda A numa branch nova a partir da main.
- Não reduz a FREQUÊNCIA de mudança do hash: ~57% das janelas mudam por mensagem, e isso também move lastMessageAt/updatedAt. O ganho é só o custo do poll. Quem reduz as recargas são o A3, o A4 e o delta futuro.
- Índice a mais em tabela de escrita frequente (~1.500 inserts por dia): custo desprezível.

**Testes:**
- Sem teste automatizado (mudança de schema/índice). Validação por EXPLAIN ANALYZE e por `npx prisma migrate diff` vazio depois do resolve (exceto a linha da discord).

**Validação manual:** Depois de aplicar: (1) EXPLAIN ANALYZE da query de getWhatsAppInboxVersion mostra Index Only Scan Backward em whatsapp_messages_createdAt_idx e tempo total de poucos ms, contra ~33 ms antes. (2) Mandar uma nota interna de teste numa conversa de teste: outra aba recarrega a lista em ≤15s e a prévia mostra 'Você: <nota>'. Isso prova que a nota ainda muda o hash. (3) Abrir uma conversa não lida de teste: markConversationRead sem Seq Scan em Notification (EXPLAIN do SELECT equivalente por contactId/read). Apagar nota e contato de teste.

**Revisão: ajustar**
- problema: Linhas conferidas: schema WhatsAppMessage 875-913 (índices em 911-912), Notification 485-506 (índices em 501/505, sem @@map, então o nome 'Notification_contactId_read_idx' está certo), hash 423-442 (termo em 438). Gravadores de nota interna: send-message.ts:251-291, bot.ts:470-499 e também service.ts:455-465 (migração BotConversa). Este último atualiza a conversa logo antes, então não muda a conclusão.
- problema: A recomendação 'fazer a onda A numa branch nova a partir da main' quebra o próprio plano. Hoje a main (9264be7) NÃO tem docs/ai nem .claude/skills (`git ls-tree main` vazio). O harness (/migration, /validar, /mapa-atualizar e os hooks) só existe nos commits de chore/ai-harness.
- problema: O /migration faz diff do BANCO REAL contra o schema (--from-schema-datasource). Se payment_schedule já tiver sido aplicada no Neon e a branch da onda A não tiver esses models (hoje só estão no working tree, não no HEAD), o diff vai propor DROP TABLE das tabelas de pagamento, além do 'discord'. A spec só trata o caso 'não aplicada'.
- ajuste: Base da branch: partir do HEAD commitado de chore/ai-harness (ou fazer merge do harness na main antes), sem as mudanças não commitadas de custos/payment_schedule. Um git worktree separado evita mexer no working tree atual.
- ajuste: Passo 0 do A6: descobrir se 20260924010000_payment_schedule está em _prisma_migrations (SELECT só de leitura). Se estiver aplicada e ainda não estiver na main/branch, integrar essa migration e os models ANTES; ou, no SQL gerado, apagar também qualquer DROP das tabelas de pagamento e PARAR para confirmar com o usuário, como manda o skill. O SQL final deve ter só os 2 CREATE INDEX IF NOT EXISTS.

**Em aberto:**
- Alternativa SEM migration, se o usuário preferir não aplicar SQL agora: remover o termo de whatsapp_messages do hash e fazer sendWhatsAppInternalNote e postInternalNote tocarem `whatsapp_conversations.updatedAt`, com `updateMany({ where: { contactId }, data: { updatedAt: new Date() } })`. Custo: +1 query por nota. Efeito colateral: o 'updatedAt' exibido no minikanban (bot-funnel.ts:135/180 → minikanban.tsx:330) passa a contar notas. Todo gravador futuro de nota interna teria que lembrar disso.
- Incluir o índice Notification(contactId, read) aqui (recomendado, ver A3) ou deixar para a tarefa separada da retenção do sino?

## PR12 Inbox: lista mais leve no banco (não lidas por LATERAL, etapas em paralelo)
**Por que agora:** A query de não lidas é 44-48,5% do tempo do banco (83 ms; a reescrita testada leva 8-16 ms). É o maior ganho de Neon e de latência num PR só. Precisa entrar antes do A3 e da extração do B2-2 (mesmo loadConversations).

**Deploy:** Não precisa de migration. Os motivos de encerramento entram direto no Promise.all, e o cache de 60 s fica só em getInactiveNumberIdsCached. Prévia com left(…,160) no SQL. Smoke SQL opcional com describe.skipIf(process.env.INBOX_SQL_SMOKE !== '1') (npm test roda contra o .env de produção).

**Medir antes/depois:**
- PR12 (A5): query de não lidas, média de 83 ms → 10-16 ms. Buffers por chamada ~85-113 mil → ~9-10 mil. Fatia do tempo do banco 44-48,5% → < 10%. Lista + hash passam de 67% do tempo do banco para < 30%. Payload da lista 1,25-1,33 MB → menor (prévia truncada).

### A5 — Backend da lista: não lidas via LATERAL por conversa, etapas em paralelo, cache de 60s de números inativos e motivos, prévia truncada no SQL, fim de docsCount/fichaComplete e do include de reads
Onda A_sync_inbox · esforço M · depende de — · migration: não · micro: não · refs: LISTA-2, BACK-2, BACK-6, LISTA-7, LISTA-8, BACK-8

**Impacto:** Cada recarga da lista (e cada busca ou abertura pela agenda, que usam a mesma montagem) fica bem mais curta no servidor: a query de não lidas cai de ~80 ms (picos de 1,2s) para ~9-13 ms, e as ~10-12 idas e voltas em série viram ~4. A fila de actions libera mais rápido, e isso encurta a espera de qualquer clique. O payload encolhe: some a prévia inteira, somem os ~2.765 registros de leitura por carga e somem campos que ninguém lia.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/conversations.ts` | loadConversations: findMany | 187-206 (reads em 202-204; draftDocuments em 198) | Remover `reads: { orderBy, take: 1 }`: sem relationJoins, o Prisma traz TODAS as leituras das 1.000 conversas e corta em memória. Remover `draftDocuments` do select do contato. Manter `clientDraft`, que ainda alimenta hasCpf/case* no CopilotPanel. |
| `app/_actions/whatsapp/conversations.ts` | loadConversations: Promise.all, extraAuthors, linkedUsers, docCounts, unreadRows, reasonRows, inactiveNumberIds | 220-263 (Promise.all); 268-276 (extraAuthors); 282-297 (linkedUsers); 299-308 (docCounts); 315-332 (unreadRows); 334-341 (reasonRows/inactive/closeLabelOf) | Uma única onda depois do findMany: `Promise.all([lastRows, assignees, handoffNotes, linkedUsers, readRows, getCloseReasonLabels(), getInactiveNumberIdsCached()])`. lastRows: `left(lm.body, 160) AS body` e `LEFT JOIN "User" au ON au.id = lm."authorId"` no LATERAL, devolvendo `au.name AS "authorName"`, o que elimina extraAuthors (268-276). handoffNotes: `left(m.body, 200)`. linkedUsers: select só id, name, role, cpf, cidade, lesoes, data_acidente (sai cep/rua). readRows substitui 315-332 pela reescrita medida na auditoria: `SELECT c."contactId", rr.read_at AS "readAt", u.cnt FROM whatsapp_conversations c CROSS JOIN LATERAL (SELECT GREATEST(c."lastReadAt", (SELECT MAX(r."lastReadAt") FROM whatsapp_conversation_reads r WHERE r."conversationId" = c.id)) AS read_at) rr CROSS JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM whatsapp_messages m WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false AND m."createdAt" > COALESCE(rr.read_at, to_timestamp(0))) u WHERE c."contactId" = ANY(${contactIds})`. Ela usa o índice (contactId, createdAt) e devolve 1 linha por conversa, com a leitura efetiva e a contagem. Apagar docCounts (299-308): é o groupBy de Document SEM `deletedAt: null`, que viola a regra, e o campo é morto. |
| `app/_actions/whatsapp/conversations.ts` | WhatsAppConversationDTO, DraftFichaShape, isFichaComplete, map final | 117-119 (fichaComplete); 131 (docsCount); 156-165 (DraftFichaShape/isFichaComplete); 351-354 (effectiveReadAt); 385-387 e 394-396 (map) | Remover fichaComplete e docsCount do DTO e do map. Grep confirmou zero leitores em .tsx/.ts além deste arquivo; o CopilotPanel lê só hasCpf/case*/adPlatform. Remover isFichaComplete e cep/rua de DraftFichaShape. effectiveReadAt passa a vir de `readAtByContact.get(c.contactId) ?? null`, e unreadCount de `cntByContact`. Até o A3 entrar, manter a regra de unread atual sobre esse readAt. |
| `app/_shared/lib/whatsapp/numbers.ts` | getInactiveNumberIds, invalidateNumberCache | 104-107 (getInactiveNumberIds); 78 (invalidateNumberCache); 23-24 (padrão de cache) | Nova `export async function getInactiveNumberIdsCached(): Promise<string[]>` com TTL de 60s, no mesmo padrão do cache de getCreds, e limpeza dentro de invalidateNumberCache(). Só o loadConversations passa a usar a versão com cache. Crons e activeNumberConversationWhere continuam na consulta fresca, e o caminho anti-spam não muda. |
| `app/_shared/lib/whatsapp/close-reason-labels.ts (novo) + app/_actions/whatsapp/close-reasons.ts` | getCloseReasonLabels, invalidateCloseReasonLabels; createCloseReason, deleteCloseReason | arquivo novo; close-reasons.ts 35-58 (create) e 60-64 (delete) | Lib server-only, sem 'use server', para não virar endpoint público: `getCloseReasonLabels(): Promise<Map<string, string>>` com TTL de 60s + `invalidateCloseReasonLabels()`, chamado depois do create/delete em close-reasons.ts. Não pode ficar em close-categories.ts: esse módulo neutro é importado pelo client. syncCloseTag (640) continua lendo sem cache, para não deixar tag de desfecho órfã. |

**Passos:**
1. Criar close-reason-labels.ts e getInactiveNumberIdsCached (+ invalidação).
2. Reescrever o miolo de loadConversations: findMany sem reads/draftDocuments, uma única onda de Promise.all, lastRows com prévia truncada e nome do autor, readRows com a reescrita LATERAL.
3. Remover docCounts, docsCount, fichaComplete, isFichaComplete e extraAuthors.
4. Antes de subir, comparar em dev (SELECT só de leitura contra produção) as duas queries para os 1.000 contactIds atuais: cnt e read_at têm que bater 1:1. Rodar EXPLAIN ANALYZE da nova (esperado ~9-13 ms, sem Seq Scan em whatsapp_messages).
5. Rodar /validar e /mapa-atualizar whatsapp-bot: fichaComplete/docsCount saem do mapa; atualizar a receita 'Campo novo na lista'.

**Regras tocadas:**
- Toda query de Document filtra deletedAt: null (o groupBy que violava a regra é removido)
- Em tabela grande nada de distinct do Prisma: $queryRaw com LATERAL
- SQL cru: "User" com aspas, colunas camelCase com aspas, template tag
- 'use server' não exporta helper de cache (fica em lib)
- Número inativo continua somente leitura (readOnly no DTO; servidor recusa envio por getCreds null)

**Riscos:**
- Equivalência da reescrita: vale porque contactId é único por conversa (upsert por contactId), como a auditoria verificou, mas precisa da comparação 1:1 antes do deploy.
- Truncar a prévia no SQL pode cortar marcação do WhatsApp no meio (ex.: '*negrito' sem fechar), e o stripWaMarkup deixa o asterisco aparecer. É só cosmético, na linha da lista. left() conta caracteres, então não quebra emoji.
- Cache de números inativos: por até 60s em outras instâncias, uma linha recém-desativada ainda aparece sem readOnly. O servidor já recusa o envio (getCreds devolve null), então só o composer fica visível.
- Motivo nq_ recém-criado aparece como chave crua na lista por até 60s em outra instância.
- A única onda abre ~7 queries simultâneas por carga. Com connection_limit=25 por instância e poucas cargas concorrentes cabe, mas vale observar pool_timeout nos logs da Vercel depois do deploy.
- Remover campos do DTO quebra só a compilação se algum leitor escapou do grep, e o tsc pega.

**Testes:**
- tests/whatsapp-inbox.test.ts: mediaTypeLabel ('image/jpeg'→'Foto', 'audio/ogg'→'Áudio', 'application/pdf'→'Documento'), que agora é compartilhado entre servidor e cliente.
- (Opcional) tests/inbox-unread-sql.smoke.test.ts, que precisa de banco e roda só manualmente: executa a query antiga e a nova para os mesmos contactIds e exige resultados idênticos.

**Validação manual:** Em dev com o .env de produção, só leitura: (1) Abrir o inbox e conferir que badges verdes, contagens, 'Você:' na prévia, selinho do atendente, motivo do handoff na Fila e 'Linha desativada' (readOnly) estão iguais a antes para ~20 conversas conhecidas. (2) Busca por um nome comum e abertura pela agenda funcionam, porque usam o mesmo loadConversations. (3) Criar um motivo nq_ de teste, encerrar uma conversa de teste com ele e ver o rótulo correto; apagar o motivo e a conversa de teste. (4) Tamanho da resposta da action de listagem no Network menor que antes (prévia truncada, sem docsCount/fichaComplete).

**Revisão: ajustar**
- problema: Linhas conferidas: 187-206 (draftDocuments em 198, reads em 202-204), 220-263, 268-276, 282-297 (select em 288), 299-308 (groupBy sem deletedAt), 315-332, 334-341, 117-119, 131, 156-165, 351-354, 385-387 e 394-396. numbers.ts 23-24, 78 e 104-107. close-reasons.ts 35-58 e 60-64. Grep confirma zero leitores de docsCount/fichaComplete fora de conversations.ts. lastMessagePreview e handoffReason só são lidos em WhatsAppInbox.tsx:2062-2064. A reescrita do LATERAL bate com a query medida na auditoria (8,7-13,5 ms).
- problema: A conta de '~4 etapas' está otimista. Sem previewFeatures relationJoins (schema.prisma:1-3), o findMany com contact + tags(tag) continua com ~4 idas e voltas internas (5 com reads). O resultado é ~4-5 do findMany + 1 onda, ou seja ~5-6 em série, não ~4. Continua um ganho grande sobre ~10-12.
- problema: O smoke test opcional (tests/inbox-unread-sql.smoke.test.ts) vai rodar em `npm test`: vitest inclui tests/**/*.test.ts e o .env local é PRODUÇÃO. No CI, sem DATABASE_URL, ele quebra. Os smoke tests existentes usam `describe.skipIf(!ativo)` com uma flag (tests/signature-seed.smoke.test.ts:19-36).
- problema: Existe caminho mais simples para os motivos: dentro de uma única onda de Promise.all, o findMany de whatsapp_close_reasons (tabela minúscula) já não soma latência. O cache de 60s + lib nova + invalidação por instância só economiza uma query num banco ~3,6% ocupado e cria uma janela de rótulo cru. O cache de getInactiveNumberIds é aceitável porque o servidor já recusa o envio.
- ajuste: Trocar o user_impact/objective para '~5-6 idas e voltas em série em vez de ~10-12'. Opcional: registrar relationJoins como próxima alavanca (fora desta onda).
- ajuste: Se o smoke test for criado: `describe.skipIf(process.env.INBOX_SQL_SMOKE !== '1')` e script `npm run inbox:sql-smoke` com a flag, só SELECT.
- ajuste: Sugerido: colocar `db.whatsAppCloseReason.findMany({ select: { key, label } })` direto na onda do Promise.all, sem close-reason-labels.ts. Manter o cache só em getInactiveNumberIdsCached. Se o cache dos motivos for mantido mesmo assim, está correto como especificado (lib sem 'use server', invalidação em create/delete).

**Em aberto:**
- Trocar também o clientDraft inteiro (~66 KB por carga) por extração dos 4 campos em SQL (clientDraft->>'cpf' etc.)? Exige um $queryRaw a mais ou mover o findMany para SQL. Fica para a onda de delta/rota GET.

## PR13 Infra: DATABASE_URL sem pgbouncer=true
**Por que agora:** Hoje 71% dos comandos no banco são BEGIN/DEALLOCATE ALL/COMMIT do modo pgbouncer (1.302/min). Não exige código. Entra depois do PR02 já medido, para não misturar os efeitos.

**Deploy:** Só env, feito pelo usuário. Primeiro no Preview, com os pré-requisitos de login (NEXTAUTH_URL/SECRET do Preview, login por credenciais, IP do escritório, Deployment Protection). Depois em Production, em horário de baixo movimento. Nas primeiras 2 h, filtrar os logs por 'prepared statement': na primeira ocorrência, voltar a env e fazer Redeploy.

**Medir antes/depois:**
- PR13 (B1 ii): BEGIN/DEALLOCATE ALL/COMMIT de 1.302/min → ~0. auth_query do pooler (20 conexões novas/min) → menor. Zero erros 'prepared statement'.

### B1 parte (ii) + roteiro de rollback no vercel/pro-checklist.md
Spec completa de B1 em **PR02**; aqui entra só: B1 parte (ii) + roteiro de rollback no vercel/pro-checklist.md

## PR14 Inbox: link de mídia pronto na thread (sem action por anexo)
**Por que agora:** Cada abertura de conversa enfileira de 3 a 11 server actions só para assinar URL (THR-1/FE-6/DOC-3). É a causa de 'imagens carregam uma por uma' e trava a fila serial. Também é o fallback de UI para o resíduo do C1b.

**Deploy:** NÃO trocar o guard da rota (JWT, L19-22) neste PR, porque o fetcher atual trataria um 403 como dado. signGetUrl fica em lib sem 'use server' e rejeita key fora de ALLOWED_KEY_PREFIXES. Chave do cache: `${key}|${inline}|${fileName}`.

**Medir antes/depois:**
- PR14 (C3): Next-Action disparadas por abertura de conversa só para mídia, p50 de 3-11 → 0 (gravação de Network no PC do chefe). Calls de downloadFileFromS3 por dia → só os cliques de download.

### C3 — URLs de mídia assinadas no GET da thread, cache único Inbox/Copiloto, img lazy
Onda C_documentos · esforço M · depende de — · migration: não · micro: não · refs: THR-1, DOC-3, FE-6

Escopo neste PR: C3 (com onError → 'Arquivo indisponível' na bolha, no áudio e no DocRow)

**Impacto:** Ao abrir uma conversa, fotos, áudios e PDFs aparecem juntos com o texto, sem spinners em fila. Enviar, marcar tag e abrir a ficha logo depois não ficam mais esperando links de anexo. O play do áudio já nasce habilitado.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/s3-presign.ts` | signGetUrl (novo, sem "use server") | novo arquivo | `signGetUrl(key, { fileName, inline }): Promise<{ url: string; expiresAt: string }>` com getSignedUrl passando `signingDate = início da janela de 30 min` e `expiresIn = 5400`. A URL fica IDÊNTICA entre polls (o <img> não recarrega a cada 8 s e o cache HTTP do navegador funciona) e tem ≥ 60 min de validade restante. Content-Disposition via `contentDisposition(inline, name)` com `filename*=UTF-8''…` para acentos. |
| `app/_shared/utils/s3-keys.ts` | ALLOWED_KEY_PREFIXES, isAllowedKeyPrefix, contentDisposition, signingWindow (novos) | novo arquivo (mesmo de C2) | Mover a lista de prefixos e a regra de traversal por segmento '..' (download-s3.ts:27-47) para funções puras e testáveis. `signingWindow(now, windowMs)` devolve `{ signingDate, expiresAt }`. |
| `app/_actions/documents/download-s3.ts` | isAllowedKey / downloadFileFromS3 | 23-47, 49-84 | Importar os prefixos e a regra de traversal de s3-keys.ts e manter o fallback por Document no banco (página pública). Nenhum export novo aqui: helper exportado de arquivo "use server" vira endpoint público. |
| `app/api/whatsapp/messages/route.ts` | GET | 12-22 (guard), 34-50 (select), 59-70 (map) | Guard: trocar o papel lido do JWT (L19-22, contraria a regra 'decisão de acesso lê o banco') por `try { await requireTeam() } catch { return 403 }` (cache de 30 s de permissão e de 60 s de IP, custo baixo). No map: para `m.mediaKey && !m.deletedAt && isAllowedKeyPrefix(m.mediaKey)`, `Promise.all` de signGetUrl, acrescentando `mediaUrl` e `mediaUrlExpiresAt`. getSignedUrl é CPU local, sem ida à rede. Vale também para o 'carregar anteriores' (before=). |
| `app/_shared/hooks/use-whatsapp.ts` | WhatsAppThreadMessage | 17-42 | Adicionar `mediaUrl?: string | null; mediaUrlExpiresAt?: string | null`. |
| `app/nova-dash/workspace/whatsapp/media-url-cache.ts` | seedMediaUrl, getMediaUrl, useMediaUrl (novo) | novo arquivo | Cache ÚNICO por key: uma entrada válida existente vence, senão semeia com a URL do servidor, com expiração = expiresAt − 5 min. `getMediaUrl(key, name?)` cai no downloadFileFromS3 só se não houver URL válida (aba parada > 1 h). `useMediaUrl(key, seedUrl, seedExp)` devolve URL estável. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | mediaUrlCache/getMediaUrl, WaMediaBubble, <img>, openInNewTab | 74-85, 2395-2418, 2466 | Apagar o cache local (L74-85) e importar do media-url-cache. WaMediaBubble passa a usar `useMediaUrl(msg.mediaKey, msg.mediaUrl, msg.mediaUrlExpiresAt)` no lugar do useEffect com server action por bolha (L2402-2412). `<img loading="lazy" decoding="async">` na L2466. O 'Baixar' (downloadAsFile, L2423-2427) continua com action no clique, porque precisa de disposition attachment. |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | mediaUrlCache/getMediaUrl, DocRow, AudioDocRow | 42-52, 1002-1009, 1077-1082, 1028 | Apagar o 2º cache (L42-52). O DocRow usa `doc.url` (vindo de listClientDocuments) ou o cache compartilhado, com `<img loading="lazy">` (L1028). O AudioDocRow usa `doc.url`, sem action no mount. |
| `app/_actions/whatsapp/client-documents.ts` | ClientDocumentDTO, listClientDocuments | 35-40, 44-59 | DTO ganha `url?: string | null; urlExpiresAt?: string | null`, assinados em lote no servidor com signGetUrl(key, { inline: true, fileName: name }). É 1 action no lugar de N. |

**Passos:**
1. Criar s3-keys.ts (puro) e s3-presign.ts (com S3Client). download-s3.ts passa a importar as regras deles.
2. Trocar o guard da rota de mensagens por requireTeam e assinar as mídias no map.
3. Estender WhatsAppThreadMessage e ClientDocumentDTO.
4. Criar media-url-cache.ts e migrar WaMediaBubble, DocRow e AudioDocRow. Remover os dois caches locais.
5. Adicionar loading=lazy e decoding=async nas imagens.
6. Rodar /mapa-atualizar em whatsapp-bot.md (rota da thread devolve mediaUrl) e documentos-ia.md (signGetUrl e janela estável).

**Regras tocadas:**
- requireTeam lendo o banco (a rota hoje lê o papel do JWT)
- "use server" só exporta funções async: o assinador fica em app/_shared/lib, sem "use server"
- Allowlist de prefixos de downloadFileFromS3 (página pública) preservada
- Vercel 4,5MB: a resposta cresce ~0,8 KB por mídia (p90 ~10 mídias, ~8 KB), longe do teto
- Dark Reader: sem dark: novo

**Riscos:**
- Sem a janela estável de assinatura, cada poll (8 s) traz URL nova e a imagem recarrega e pisca. Por isso signingDate em janela de 30 min, com a entrada de cache existente vencendo a semeada.
- requireTeam aplica a trava de IP à rota da thread. Quem está fora do escritório já é barrado no layout da nova-dash, então não muda o efetivo. Se a trava der 403, a thread vem vazia (o fetcher não checa res.ok): logar isso.
- A mesma onda mexe em WhatsAppInbox.tsx em C9 e C5. Sequenciar os PRs para evitar conflito no hotspot.
- A URL assinada no payload vale por até 90 min para quem tiver o JSON. É o mesmo nível de hoje (1 h) e só para a equipe.

**Testes:**
- tests/s3-keys.test.ts: isAllowedKeyPrefix('whatsapp/c/1-DOC-123..pdf') = true; ('whatsapp/../x') = false; ('outro/x') = false; signingWindow devolve a mesma signingDate para 12:01 e 12:29 e outra para 12:31, com expiresAt − now ≥ 60 min em todo ponto da janela; contentDisposition(true, 'COMPROVANTE DE ENDEREÇO.pdf') contém `filename*=UTF-8''COMPROVANTE%20DE%20ENDERE%C3%87O.pdf` e fallback ASCII sem aspas.

**Validação manual:** Com npm run dev e conta ADMIN*: abrir conversa de TESTE com várias mídias. No DevTools > Network, nenhum POST de server action por bolha. As imagens chegam junto do texto e a URL da imagem não muda entre dois polls de 8 s. Áudio toca, PDF abre, 'Baixar' baixa com o nome certo, e o Copiloto > Arquivos mostra miniaturas sem actions por linha. Deixar a aba aberta > 1 h e ver a mídia recarregar pelo fallback.

**Revisão: ajustar**
- problema: Conferido: messages/route.ts:12-22 (papel do JWT, com comentário na L19 explicando que era para evitar consulta por poll), 34-50 e 59-67; use-whatsapp.ts:17-42; WhatsAppInbox.tsx:74-85, 2395-2427 e 2466; CopilotPanel.tsx:42-52, 1002-1009, 1028 e 1077-1082; download-s3.ts:23-47. `signingDate` existe em RequestPresigningArguments (@smithy/types, presigner 3.804).
- problema: Sem fallback para objeto inexistente. Hoje uma key apagada gera a URL assinada sem erro, e o <img> vira ícone quebrado. O ramo `failed` da bolha só dispara quando a action falha. Com URL vinda do servidor isso continua, e o resíduo de C1b (ambiguo/purgado) segue quebrado sem explicação.
- problema: O cache único é por key, mas a URL carrega o Content-Disposition (inline/attachment + nome). A mesma key com nome da mensagem (bolha) e nome do Document (Copiloto) disputa a entrada: o PDF aberto pelo Copiloto pode sair com o nome da mensagem.
- problema: signGetUrl em lib, sem allowlist própria, é um assinador arbitrário para quem o importar no futuro.
- problema: Trocar 401 e 403 por um catch único de 403 apaga a distinção entre sessão expirada e falta de permissão.
- problema: Os mapas citam `getMediaUrl`/`fileNameFromKey` (hotspots.md:28 e 124). Se os símbolos saírem dos arquivos, `npm run docs:check` quebra.
- ajuste: Adicionar `onError` no <img> da bolha (L2466) e no DocRow (L1028), mais `onError` no <audio>, levando ao estado `failed` com o texto 'Arquivo indisponível'. O chip atual (L2449-2455) já existe.
- ajuste: Chave do cache = `${key}|${inline}|${fileName}`, ou o Copiloto passa a usar só `doc.url` vindo de listClientDocuments, sem reaproveitar a entrada da bolha.
- ajuste: signGetUrl rejeita key que não passe em isAllowedKeyPrefix (defesa em profundidade).
- ajuste: Rota: sem sessão continua 401; o `requireTeam()` que lança vira 403.
- ajuste: Atualizar hotspots.md (faixas e símbolos) junto com /mapa-atualizar e rodar `npm run docs:check` no /validar.

**Em aberto:**
- O 'Baixar' (disposition attachment) pode continuar como server action no clique, ou prefere uma rota GET /api/whatsapp/media/[messageId]?download=1 com 302 para sair de vez da fila de actions?

## PR15 Inbox: tag na hora, idempotente e com log
**Por que agora:** É queixa direta do chefe: a tag demora e o 2º clique desfaz. Depende só do refresh-gate do PR03.

**Deploy:** setConversationTag chama requireTeam(). toggleConversationTag fica por 1 deploy como wrapper, para abas com bundle antigo. O erro mostra mensagem própria com 'Recarregue (F5)'. No MESMO PR, excluir wa_tag_* das estatísticas por atendente (get-chatbot-analytics.ts, get-team-analytics.ts:76, get-collaborator-detail.ts:14). As actions novas entram em LogAction e em ACTION_META (os dois arquivos).

**Medir antes/depois:**
- PR15 (A1): clique → chip < 200 ms (performance do navegador). Pares add→remove da mesma tag em < 10 s (logs wa_tag_* novos) ≈ 0. Métricas de equipe do painel iguais antes e depois.

### A1 — Tag otimista e idempotente (set/unset), menu aberto com indicador, patch também em busca/agenda, log de add/remove
Onda A_sync_inbox · esforço M · depende de — · migration: não · micro: não · refs: LISTA-5, TAG-1, TAG-3, FE-3, DUR-2, THR-7, [MISSED lista] Tag, Encerrar e Assumir fora das 1.000, [MISSED frontend] Tag fora do top 1.000

**Impacto:** O chefe clica na tag e o check e o chip aparecem na hora. O menu continua aberto, então dá para marcar várias tags seguidas, e cada item mostra um spinner enquanto grava. Clicar duas vezes não apaga mais a tag, e reaplicar uma tag que já existe não muda o mês dela no KPI. Em cliente antigo aberto pela busca ou pela agenda, a tag também aparece. Quem colocou ou tirou cada tag fica registrado no log.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/tags.ts` | toggleConversationTag / requireTeamMember | 48-59 (toggle); 12-17 (requireTeamMember local) | Remover toggleConversationTag (o único chamador é o WhatsAppInbox). Criar `export async function setConversationTag(conversationId: string, tagId: string, on: boolean): Promise<{ tags: WhatsAppTagDTO[]; changed: boolean }>`. Como é action NOVA, começa com `requireTeam()` de permissions-server.ts, que lê o banco, usa cache de 30s e aplica a trava de IP. Com on=true: `createMany({ data: [{ conversationId, tagId }], skipDuplicates: true })`, que preserva o createdAt da aplicação que já existe. Com on=false: `deleteMany({ where: { conversationId, tagId } })`. Em Promise.all com a escrita, ler o contexto da conversa (contactId, numberId, contact.name/phone) e o nome da tag. `changed = count > 0`. Se mudou, rodar em paralelo `logWhatsAppEvent({ action: on ? 'wa_tag_add' : 'wa_tag_remove', numberId, metadata: { tagId, tagName, conversationId } })` e o findMany das tags atuais da conversa, que vira o retorno. |
| `app/_shared/lib/log.ts` | LogAction | 4-46 | Acrescentar `| "wa_tag_add"   // aplicou tag na conversa` e `| "wa_tag_remove"`. Não entram em PURGEABLE_LOG_ACTIONS (retention.ts:35-47): são a trilha de auditoria do KPI de contratados. |
| `app/_shared/utils/action-meta.tsx` | ACTION_META | 11-37 | Adicionar as entradas wa_tag_add e wa_tag_remove (rótulo 'WhatsApp: tags'). Sem isso, o metaFor cai no rótulo cru. |
| `app/nova-dash/workspace/manager/ChatbotDashboard.tsx` | ACTION_META | 66-77 | Adicionar wa_tag_add ('Tag aplicada') e wa_tag_remove ('Tag removida'). Os logs entram no feed de get-chatbot-analytics, que filtra por startsWith 'wa_'. |
| `app/_shared/utils/whatsapp-inbox.ts (novo)` | withTag, patchConversationList, revertPatch | arquivo novo | Utilitários puros, sem 'use server' e sem banco, importando só `import type { WhatsAppConversationDTO }`. (1) `withTag(tags, tag, on)`: idempotente, não duplica e não falha ao remover o que não existe. (2) `patchConversationList(list, contactId, patch | ((c) => Partial<DTO>))`: imutável, devolve a MESMA referência se o contato não está na lista e reordena por lastMessageAt desc quando o patch muda esse campo. (3) `revertPatch(original, patch)`: devolve os valores originais das chaves do patch, para rollback. |
| `app/_shared/hooks/use-whatsapp.ts` | useWhatsAppConversations | 55-75 | Expor também `patchConversations: (fn: (list?: DTO[]) => DTO[] | undefined) => mutate(fn, { revalidate: false })`. O SWR 2 descarta a resposta de um fetch que começou antes do mutate, e isso protege o estado otimista. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | handleToggleTag, menu de tags do cabeçalho, remoteResults/fetchedActive, import | 38 (import); 200 (remoteResults); 474-485 (fetchedActive); 709-717 (handleToggleTag); 1489-1517 (DropdownMenu de tags, CheckboxItem 1502-1510) | Criar `patchConversation(contactId, patch)`, que aplica `patchConversations` + `setRemoteResults(prev => patchConversationList(prev, ...))` + `setFetchedActive` quando é o mesmo contato. Todas as ações da onda passam a usá-lo. Criar o estado `pendingTagIds: Set<string>` e trocar handleToggleTag por `handleSetTag(tag: WhatsAppTagDTO, on: boolean)`, que ignora o clique se a tag já está pendente, aplica o patch otimista `{ tags: withTag(active.tags, tag, on) }` e chama setConversationTag. No sucesso, aplica `{ tags: res.tags }` só se não sobrou outra tag pendente nessa conversa, para evitar piscar com cliques em tags diferentes. No erro, reverte com `withTag(atual, tag, !on)` e mostra toast. Sem refreshConversations. No CheckboxItem: `onSelect={(e) => e.preventDefault()}` (mesmo padrão do filtro de tags em ~1207), `onCheckedChange={(v) => handleSetTag(t, v === true)}`, `disabled={pendingTagIds.has(t.id)}` e Loader2 animate-spin no fim do item quando pendente. O chip do cabeçalho (1464-1472) lê active.tags e já reflete o patch. |

**Passos:**
1. Criar app/_shared/utils/whatsapp-inbox.ts com withTag, patchConversationList e revertPatch, com comentário do porquê: auditoria de 24/09, a tag só aparecia depois de recarregar 1.000 conversas.
2. Em tags.ts: escrever setConversationTag com requireTeam(), createMany com skipDuplicates / deleteMany, contexto em paralelo, log só quando changed e retorno das tags atuais. Apagar toggleConversationTag.
3. Em log.ts: adicionar wa_tag_add e wa_tag_remove ao LogAction. Adicionar os rótulos em action-meta.tsx e em ChatbotDashboard.tsx.
4. Em use-whatsapp.ts: expor patchConversations (mutate com revalidate:false).
5. Em WhatsAppInbox.tsx: criar patchConversation(contactId, patch), que cobre a lista, remoteResults e fetchedActive. Criar pendingTagIds e handleSetTag, e ajustar o CheckboxItem (preventDefault, valor do checked, disabled, spinner). Trocar o import da L38.
6. Rodar /validar (tsc, eslint nos arquivos alterados, vitest) e depois /mapa-atualizar whatsapp-bot: novos logs, setConversationTag e o fim do toggle.

**Regras tocadas:**
- requireTeam/requirePermission lendo o banco (action nova usa requireTeam, não o requireTeamMember local)
- 'use server' só exporta funções async: tipos/utilitários ficam em app/_shared/utils/whatsapp-inbox.ts
- Dark Reader: não criar estilo que dependa de dark:
- Comentários explicam o porquê

**Riscos:**
- Aba aberta durante o deploy mantém o bundle antigo, que chama o id de action de toggleConversationTag. Depois do deploy essa chamada falha com erro mascarado e o toast genérico aparece; o F5 resolve. Avisar a equipe para recarregar depois do deploy.
- Corrida entre o estado otimista e uma recarga pelo hash que já saiu antes do commit da escrita: a tag pode piscar até o próximo poll (≤15s). Mitigam isso o SWR 2, que descarta fetch iniciado antes do mutate, e a aplicação de res.tags só quando não sobrou nada pendente.
- requireTeam aplica a trava de IP. Quem usa o inbox já passou pelo mesmo gate no layout da /nova-dash, então não deve bloquear ninguém legítimo.
- Os logs novos entram na contagem de 'tarefas' de get-team-analytics.ts:76 e get-collaborator-detail.ts:14, que excluem só wa_transcribe. São ~10 tags manuais por dia, e a decisão está em open_questions.
- createMany com skipDuplicates não recria a linha, então o KPI (tags.ts:80-83, que filtra pelo createdAt da aplicação) fica estável. Remover e aplicar de novo continua gerando createdAt novo, e isso é intencional.

**Testes:**
- tests/whatsapp-inbox.test.ts: withTag com on=true duas vezes gera 1 tag só; com on=false numa tag ausente não muda nada; a ordem das outras tags é preservada.
- tests/whatsapp-inbox.test.ts: patchConversationList devolve a mesma referência quando o contactId não existe, não muta o array de entrada e aplica o patch só na conversa certa.
- tests/whatsapp-inbox.test.ts: revertPatch devolve os valores originais só das chaves do patch.

**Validação manual:** `.env` = produção: usar um contato de teste e uma tag de teste, e apagar tudo no final. (1) Abrir a conversa de teste, marcar 2 tags seguidas: o menu fica aberto, o check aparece na hora e o spinner some em menos de 1s. No DevTools > Network, não pode aparecer o POST da action de listagem (header Next-Action) logo depois do clique. (2) Clicar duas vezes rápido na mesma tag: ela fica marcada. (3) Buscar um contato de teste com última mensagem mais antiga que a 1.000ª conversa, abrir pela busca e marcar a tag: o chip aparece. Limpar a busca e refazer: a tag continua lá. (4) Numa segunda aba (outro atendente), a tag aparece em até ~15s pelo hash. (5) Conferir na tabela logs as linhas wa_tag_add/wa_tag_remove com contactId e tagName, e apagá-las ao terminar se forem de teste. (6) Conferir que o KPI 'Contratados (bot)' não mudou ao reaplicar uma tag que já existia.

**Revisão: ajustar**
- problema: Símbolos e linhas conferidos com Grep: tags.ts 12-17 (requireTeamMember lê o role no banco) e 48-59 (toggle), com WhatsAppInbox como único chamador (L38 e L712); log.ts LogAction 4-46; retention.ts 35-47; action-meta.tsx 11-37; ChatbotDashboard.tsx 66-77; Inbox 200, 474-485, 709-717 e 1489-1517 (CheckboxItem 1502-1510). O padrão onSelect preventDefault existe em 1118, 1163 e 1209. Radix chama onCheckedChange mesmo com defaultPrevented, então o padrão funciona.
- problema: A chamada de logWhatsAppEvent está incompleta. A assinatura (log.ts:116-127) exige message, authorId, authorName e contactId, e a spec só passa action, numberId e metadata. requireTeam() devolve userId e name (permissions-server.ts:14-20), que precisam ir para authorId/authorName.
- problema: pendingTagIds: Set<tagId> é global. Se o atendente trocar de conversa com uma gravação pendente, a mesma tag fica desabilitada na outra conversa, e a regra 'só aplica res.tags se não sobrou pendente nessa conversa' não tem como saber a conversa.
- problema: O patch otimista calcula withTag(active.tags, …) sobre o closure do render. Em cliques rápidos em tags diferentes, isso pode partir de um active velho. O util já aceita patch em função e deveria ser usado aqui.
- problema: Toast de erro: em produção o e.message de server action chega mascarado (CLAUDE.md e mapa, regra 'Server action que dá throw aparece mascarada'). É justamente o caso do bundle antigo depois do deploy, que a spec cita como risco.
- problema: Risco que a spec não cita, causado pelo próprio mecanismo em que ela se apoia: o SWR 2.3.8 descarta o fetch em voo quando há um mutate depois do início dele (index.mjs:405-437). Uma recarga disparada pelo hash e descartada por causa do patch da tag não é refeita, porque o lastVersion já avançou. A mudança que ela traria (ex.: inbound novo em outra conversa) só aparece no próximo hash diferente. Em horário calmo e com a rede de segurança em 10 min (A4), isso pode levar minutos.
- problema: No ChatbotDashboard, os logs wa_tag_* entram no feed e também em attendantOf() (get-chatbot-analytics.ts:465), o que cria linha de atendente com zeros para quem só marcou tag. É ruído pequeno.
- ajuste: setConversationTag: `const me = await requireTeam();` e `logWhatsAppEvent({ action, message: `${on ? 'aplicou' : 'removeu'} a tag "${tagName}" ${on ? 'em' : 'de'} ${contactName ?? phone}`, authorId: me.userId, authorName: me.name ?? 'Atendente', contactId, contactName, contactPhone, numberId, metadata: { tagId, tagName, conversationId } })`.
- ajuste: Chavear a pendência por conversa: `pendingTags: Set<`${conversationId}:${tagId}`>`; disabled = pendingTags.has(`${active.id}:${t.id}`).
- ajuste: Usar o patch em função: `patchConversation(contactId, (c) => ({ tags: withTag(c.tags, tag, on) }))`, com rollback também em função: `(c) => ({ tags: withTag(c.tags, tag, !on) })`.
- ajuste: Usar mensagem própria no erro, por exemplo 'Não foi possível salvar a tag. Recarregue a página (F5) e tente de novo.'. Isso também cobre a aba com bundle antigo. Opcional: manter `toggleConversationTag` por um deploy como wrapper marcado para remoção, para que abas antigas não quebrem.
- ajuste: Em useWhatsAppConversations, passar `onDiscarded: () => refreshGate.trigger()` (single-flight/coalescido do A4) nas opções do SWR da lista, para refazer a recarga descartada pelo patch otimista.
- ajuste: get-chatbot-analytics.ts: tirar wa_tag_* do bloco de estatísticas por atendente e manter só no feed. Resolver junto com a open_question da contagem de tarefas, excluindo de get-team-analytics.ts:76 e get-collaborator-detail.ts:14.

**Em aberto:**
- wa_tag_add/wa_tag_remove devem sair da contagem de atividade (get-team-analytics.ts:76 e get-collaborator-detail.ts:14), como wa_transcribe? Sugestão: sim, porque é clique de classificação e inflaria 'tarefas'.
- Aproveitar para trocar o requireTeamMember local de listWhatsAppTags/saveWhatsAppTag/deleteWhatsAppTag (tags.ts:12-17, que não aplica a trava de IP) por requireTeam()? Isso é o LISTA-11, que não foi atribuído a esta onda.

## PR16 Inbox: skeleton de carregamento e erro com 'Tentar novamente'
**Por que agora:** Esforço P. Hoje a 1ª carga mostra 'Nenhuma conversa ainda' (FE-8), e o chefe lê isso como 'não carrega'. Entra depois do A1 porque os dois mexem no menu de tags.

**Deploy:** Só frontend. O skeleton aparece só com isLoading. Com error && !data, mostra mensagem própria + mutate.

### E4a — Skeleton de carregamento na lista, na thread e no menu de tags
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: FE-8

**Impacto:** Ao abrir a aba WhatsApp ou dar F5, aparece um esqueleto de carregamento em vez de 'Nenhuma conversa ainda', e a thread mostra que está carregando.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/hooks/use-whatsapp.ts` | useWhatsAppConversations | 55-75 | Retornar também loaded: data !== undefined (isLoading já é retornado em 74). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | lista / thread / tags | 189, 193, 1314-1320, 1620-1673, 1200-1202 (e o menu de tags do cabeçalho ~1489-1500) | Pegar isLoading/loaded do hook. Com !loaded, renderizar <ConversationListSkeleton/> (8 linhas animate-pulse, sem dark:), e 'Nenhuma conversa ainda' só com loaded && vazio. Na thread, isLoading && messages.length===0 → spinner. Nas tags, allTags undefined → 'Carregando tags…' (hoje o estado inicial é [], o que confunde com 'nenhuma tag'). |

**Passos:**
1. Expor loaded no hook.
2. Componente local ConversationListSkeleton.
3. Estados de carregamento na thread e nas tags.

**Regras tocadas:**
- UI: Dark Reader, sem dark:

**Riscos:**
- Nenhum relevante.

**Testes:**
- Manual.

**Validação manual:** F5 na nova-dash → aba WhatsApp: o esqueleto aparece até a lista chegar; nunca aparece 'Nenhuma conversa ainda' com conversas no banco. Abrir uma conversa não visitada mostra o spinner até as mensagens chegarem.

**Revisão: ajustar**
- problema: isLoading já é retornado (use-whatsapp.ts:74) e ignorado em WhatsAppInbox.tsx:189. 1314-1320 confere.
- problema: Skeleton com `!loaded` fica eterno em erro: shouldRetryOnError:false (linha 61) deixa data undefined e isLoading false.
- ajuste: Skeleton só com `isLoading`. Com `error && !data`, mostrar mensagem própria + 'Tentar novamente' (mutate). 'Nenhuma conversa ainda' só com data carregado e vazio.

## PR17 Inbox: 'não lida' só por mensagem recebida; markRead sem recarregar a lista
**Por que agora:** 86% dos envios humanos disparam markRead do próprio autor, e cada markRead vira escrita + recarga completa (cerca de 19% das cargas). Também corrige o markMessageRead sem numberId, que cai no número default, inclusive na linha 2323 inativa.

**Deploy:** Depende de A1 e A5. Antes do merge: EXPLAIN ANALYZE só de leitura do countWhatsAppUnread com internal=false, e decisão de produto sobre a pill 'Não lidas' excluir encerradas (muda o critério de validação). Opcional: revalidateOnFocus false em useWhatsAppUnread.

**Medir antes/depois:**
- PR17 (A3): recargas completas disparadas por markRead (≈19% das cargas, 1.029 por dia) → 0. markRead do próprio autor depois do envio (86% dos envios) → 0. Cargas por mensagem caem de novo. EXPLAIN do countWhatsAppUnread sem Seq Scan em whatsapp_messages.

### A3 — 'Não lida' só por mensagem RECEBIDA; markRead só quando entra inbound novo, sem recarregar a lista, com escritas em paralelo
Onda A_sync_inbox · esforço M · depende de A1, A5 · migration: não · micro: não · refs: GR-2, DUR-8, [MISSED backend] Ler a conversa recarrega a lista local e muda o hash de toda a equipe, [MISSED lista] Laço de markConversationRead, BACK-9, BACK-12

**Impacto:** A conversa em que o atendente acabou de responder não volta a aparecer como 'não lida', e com isso some o ciclo envio → marcar lida → recarga → recarga em todas as abas (~1/3 das leituras de hoje). Abrir uma conversa ou receber mensagem nela zera o badge na hora e não trava os botões. O badge verde e a pill 'Não lidas' passam a significar 'o cliente mandou algo que ninguém viu'.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/utils/whatsapp-inbox.ts` | computeUnread, readPatch, manualUnreadPatch | arquivo novo (criado no A1) | `computeUnread({ readAt: Date | null; lastInboundAt: Date | null }): { unread: boolean; manualUnread: boolean }`, com `manualUnread = readAt?.getTime() === 0` (sentinela epoch de markConversationUnread) e `unread = manualUnread || (!!lastInboundAt && (!readAt || lastInboundAt > readAt))`. `readPatch(nowIso)` → `{ unread: false, unreadCount: 0, manualUnread: false, lastReadAt: nowIso }`. `manualUnreadPatch()` → `{ unread: true, manualUnread: true, lastReadAt: new Date(0).toISOString() }`. |
| `app/_actions/whatsapp/conversations.ts` | loadConversations (map final) | 343-409 (unread em 398; manualUnread em 400-402) | Trocar `unread: !effectiveReadAt || c.lastMessageAt > effectiveReadAt`, que conta mensagem de SAÍDA porque send-message.ts:86 e bot.ts:788 atualizam lastMessageAt, por `computeUnread({ readAt: effectiveReadAt, lastInboundAt: inboundAt })`. Dá para calcular o último inbound no SQL SEM migration: ele já sai do LATERAL `li` (conversations.ts:238-244, índice (contactId, createdAt)) como DTO.lastInboundAt, e a contagem reescrita do A5 é equivalente (unreadCount > 0 ⇔ existe inbound depois da leitura). |
| `app/_actions/whatsapp/conversations.ts` | countWhatsAppUnread | 51-69 | Trocar o findMany com `take: 500` sem orderBy e o include de reads (BACK-12) por um `$queryRaw` com a mesma regra: `SELECT count(*)::int FROM whatsapp_conversations c CROSS JOIN LATERAL (SELECT GREATEST(c."lastReadAt", (SELECT max(r."lastReadAt") FROM whatsapp_conversation_reads r WHERE r."conversationId" = c.id)) AS read_at) rr WHERE c.status <> 'closed' AND (rr.read_at = to_timestamp(0) OR EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m."createdAt" > COALESCE(rr.read_at, to_timestamp(0))))`. O badge do topo (page.tsx:79) passa a bater com a lista. |
| `app/_actions/whatsapp/conversations.ts` | markConversationRead | 680-718 | Passar de 4 escritas em série para 2 ondas. (1) `const [, conv] = await Promise.all([db.whatsAppConversationRead.upsert(...), db.whatsAppConversation.update({ where: { id }, data: { lastReadAt: now }, select: { contactId: true } })])`: o update já devolve o contactId, e o findUnique de 683-686 sai. (2) `await db.notification.updateMany({ where: { contactId: conv.contactId, read: false }, ... })`. O tique azul na Meta continua fire-and-forget como hoje. A assinatura continua `Promise<void>`. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | useEffect de marcar lida; menu Marcar como lida/não lida | 524-528 (effect); 1586-1595 (não lida); 1596-1601 (lida) | Trocar o effect com deps `[active?.id, active?.unread, messages.length, refreshConversations]` e `.then(refreshConversations)`. Novo effect: `const readKeyRef = useRef<string | null>(null)`, zerado num effect separado quando activeContactId muda. Se `active?.unread`, montar `key = ${active.id}|${active.lastInboundAt}|${active.manualUnread}`; se for igual ao readKeyRef, retornar. Senão gravar a key, aplicar `patchConversation(active.contactId, readPatch(new Date().toISOString()))` e chamar `markConversationRead(active.id).catch(() => { readKeyRef.current = null; })`, SEM refreshConversations. Deps: `[active?.id, active?.unread, active?.lastInboundAt, active?.manualUnread]`. Menu: 'Marcar como lida' → runAction com optimistic readPatch(...); 'Marcar como não lida' → runAction com optimistic manualUnreadPatch() (os dois via runAction do A2). |
| `prisma/schema.prisma (opcional, vai na migration do A6)` | Notification | 485-506 | Opcional: `@@index([contactId, read])` para o updateMany do markRead (hoje seq scan de ~138 mil linhas, média 24 ms, máx 559 ms). Entra no MESMO arquivo de migration do A6 para não abrir um segundo ciclo de /migration. |

**Passos:**
1. Adicionar computeUnread, readPatch e manualUnreadPatch ao util.
2. Em loadConversations, usar computeUnread com o readAt da nova query do A5 e o lastInboundAt que já existe (sem migration).
3. Reescrever countWhatsAppUnread em SQL com a mesma regra, sem teto de 500.
4. Paralelizar markConversationRead (upsert + update com select contactId, depois o updateMany do sino).
5. No WhatsAppInbox, trocar o effect de leitura (guarda por key, patch local, sem refresh) e o menu lida/não lida (patches otimistas).
6. Se o A6 for pela migration, incluir nela o índice Notification(contactId, read).
7. Rodar /validar. Rodar /mapa-atualizar whatsapp-bot para registrar a nova semântica de unread em Dados e Regras.

**Regras tocadas:**
- Tempo: comparação de timestamps, não corte de dia (date-br.ts não se aplica, mas nada de getDate/toISOString().slice)
- SQL cru: "User"/snake_case com aspas; $queryRaw com template tag
- Comentários explicam o porquê (86% dos envios humanos geravam markRead do próprio autor em ≤30s)

**Riscos:**
- Mudança de semântica visível: o contador 'Não lidas', o badge do topo e o destaque verde caem, porque deixam de contar conversa em que só o bot/atendente falou por último, conversa só com template de saída e conversa nunca lida sem inbound. Avisar o chefe de que o número menor é o correto.
- Se markConversationRead falhar, o patch local diz 'lida' mas o banco não; o próximo reload volta a mostrar não lida e o effect tenta de novo, porque o catch zera a key.
- Se o reload pelo hash chegar antes do commit do markRead, o badge pode reaparecer por até ~15s (a key impede uma segunda chamada).
- A leitura continua mudando o hash (reads + updatedAt da conversa) e recarregando as abas dos colegas. É o comportamento 'lida para a equipe toda', e a frequência cai porque só dispara com inbound novo.
- update com select de conversa inexistente lança P2025. Antes o findUnique devolvia null e seguia; na prática o id vem da lista.

**Testes:**
- tests/whatsapp-unread.test.ts: readAt null + lastInboundAt presente → unread; readAt depois do último inbound (último out do atendente) → não unread; sem inbound e readAt null → não unread; readAt = epoch → unread e manualUnread; inbound 1 ms depois do readAt → unread.
- tests/whatsapp-inbox.test.ts: readPatch zera unreadCount/manualUnread e grava lastReadAt.

**Validação manual:** Com contato de teste (produção): (1) Mandar mensagem do celular de teste, abrir a conversa: o badge some na hora e há UM markConversationRead no Network, sem POST da listagem em seguida. (2) Responder pelo inbox: a conversa NÃO volta a ficar não lida e não aparece novo markConversationRead. (3) Mandar outra mensagem do celular com a conversa aberta: um markRead quando a lista percebe o inbound (≤15s). (4) 'Marcar como não lida' e reabrir: a conversa volta a ser marcada como lida. (5) Comparar o badge do topo (countWhatsAppUnread) com a pill 'Não lidas' da lista: os números batem para o número ativo. (6) Conferir que as notificações do sino daquele contato foram marcadas como lidas.

**Revisão: ajustar**
- problema: Linhas conferidas: conversations.ts 51-69 (take 500 sem orderBy), 238-244 (LATERAL li com lastInboundAt), 343-409 (unread em 398, manualUnread em 400-402), 680-718 (findUnique em 683-686). Inbox 523-528 (effect com messages.length) e 1586-1601. Resposta da pergunta do enunciado: sim, dá sem migration. lastInboundAt já sai do LATERAL `li` e o unreadCount também.
- problema: Violação de multi-número no código que a spec reescreve: markConversationRead chama `markMessageRead(last.waMessageId)` sem numberId (conversations.ts:715). A assinatura aceita numberId (client.ts:85), mas sem ele getCreds(undefined) cai no número DEFAULT. Conversa da linha 2323 desativada, ou de outro número, manda o recibo de leitura pela linha errada. É exatamente o que a regra proíbe ('número inativo nunca cai no default'). A spec diz 'tique azul continua como hoje'.
- problema: A validação manual (5) vai falhar: a pill 'Não lidas' (readCounts, WhatsAppInbox.tsx:604-606) e unreadInFolder (L684) contam também conversas ENCERRADAS com unread, enquanto countWhatsAppUnread filtra status <> 'closed'. A linha só pinta com `c.unread && c.status !== 'closed'` (L2065). Com a nova regra, conversa encerrada pelo bot, nunca aberta por humano e com inbound continua contando na pill.
- problema: O countWhatsAppUnread reescrito roda a cada 30s em TODA aba da /nova-dash (page.tsx:79, com revalidateOnFocus true) e está na fila serial. Hoje custa 1,9 ms. A nova versão faz subquery de reads + EXISTS para ~400 conversas abertas, e a spec não pede EXPLAIN dela (só da lista).
- problema: O EXISTS do count omite `m.internal = false`, que a contagem da lista usa. Hoje é equivalente na prática, porque inbound nunca é nota, mas a regra deveria ser idêntica nas duas.
- problema: Existe caminho mais simples e com uma fonte só: `unread = manualUnread || unreadCount > 0`. unreadCount já sai da query do A5 e tem o mesmo filtro do badge verde. computeUnread por lastInboundAt usa o LATERAL `li`, que não filtra internal, e pode divergir do número exibido.
- ajuste: markConversationRead: `db.whatsAppConversation.update({ where: { id }, data: { lastReadAt: now }, select: { contactId: true, numberId: true } })` e, no fire-and-forget, `markMessageRead(last.waMessageId, false, conv.numberId)`. Se getCreds devolver null (linha inativa), o recibo simplesmente não sai.
- ajuste: computeUnread({ readAt, unreadCount }) → `manualUnread = readAt?.getTime() === 0; unread = manualUnread || unreadCount > 0`. O teste unitário continua valendo.
- ajuste: countWhatsAppUnread: acrescentar `AND m.internal = false` e registrar em manual_validation um EXPLAIN ANALYZE só de leitura (esperado poucos ms, sem Seq Scan em whatsapp_messages).
- ajuste: Trocar a validação (5) por: 'badge do topo = linhas com bolinha verde nas pastas abertas'. Ou decidir explicitamente, como produto, se readCounts.nao_lidas passa a excluir closed, o que alinharia com o badge e com a regra de pintura da linha.
- ajuste: Opcional (enunciado A4, achado de foco): `revalidateOnFocus: false` também em useWhatsAppUnread (use-whatsapp.ts:167), porque o foco enfileira essa action na frente do clique.

**Em aberto:**
- Conversa em status bot, nunca aberta por humano e com inbound continua contando como não lida, como hoje. Queremos a pill 'Não lidas' só para queued/human? É decisão de produto e não entra nesta onda.

## PR18 Thread: 'carregar anteriores' não some mensagem e o envio não pisca
**Por que agora:** Corrige um bug de mensagem sumindo da tela (THR-5) e a bolha que pisca (THR-10), os dois de esforço P. Precisa vir ANTES do A2, porque ambos reescrevem handleSendText/handleSendMedia e o método do E4e é o que fica.

**Deploy:** thread-window.ts puro com teste (tolerar recent com 51 itens e janela que desliza mais de 1 por vez), merge numa única transição. removePending depois do upsert.

**Medir antes/depois:**
- PR18/PR19 (E4c/E4e/E4d): reprodução manual de THR-5 (mensagem antiga some), THR-10 (bolha pisca) e da mensagem nova em conversa com mais de 50 mensagens: as três deixam de ocorrer.

### E4c — Bug do 'Carregar mensagens anteriores' que faz mensagens sumirem
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: THR-5, [MISSED frontend] Depois de 'Carregar mensagens anteriores', cada mensagem nova faz sumir uma mensagem do meio da thread

**Impacto:** Depois de carregar o histórico, mensagens novas não fazem mais mensagens do meio da thread desaparecerem, e o botão 'Carregar anteriores' some de vez quando o histórico acaba.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/hooks/use-whatsapp.ts` | useWhatsAppMessages | 104-156 (hasMore 126-129; messages 131; loadOlder 133-153) | Guardar prevRecentRef. Quando recent muda e older.length > 0, mover para older as mensagens que saíram da janela e são anteriores ao novo recent[0], com merge por id. hasMore só é definido pelo SWR enquanto older está vazio; depois do 1º loadOlder, quem manda é a resposta do before=. prevRecentRef é zerado na troca de contactId (121-124). |
| `app/_shared/utils/thread-window.ts (novo)` | mergeThreadWindow | novo | mergeThreadWindow(older, prevRecent, nextRecent): WhatsAppThreadMessage[] (novo older, ordenado por createdAt, sem duplicar id). Tipo importado de use-whatsapp.ts ou movido para um módulo de tipos. |

**Passos:**
1. Util puro + teste com o cenário do bug (R0..R49 → R1..R49,N com older preenchido: R0 vai para older).
2. Aplicar no hook e corrigir o religamento de hasMore.

**Riscos:**
- Mensagem apagada ou editada que sai da janela fica congelada em older até reabrir a conversa (aceitável; o poll de 8 s só cobre as 50 recentes).

**Testes:**
- tests/thread-window.test.ts: janela deslizando 3 vezes com older preenchido não perde nenhuma mensagem; nada é duplicado; com older vazio, a função devolve older inalterado.

**Validação manual:** Conversa de teste com mais de 50 mensagens: Carregar anteriores → mandar 3 mensagens pelo número de teste → nenhuma mensagem do meio some (comparar com o total do banco). Rolar até o início: o botão some e não volta após novos polls.

**Revisão: ok**
- problema: use-whatsapp.ts 104-156 confere, e o bug descrito no THR-5 procede (recent de janela fixa + older congelado + hasMore religado em 127-129).
- ajuste: Fazer o merge numa única transição (derivar messages = união por id de older + deslocados + recent, com a versão mais nova por id) para não sumir por 1 frame entre o render e o setOlder do efeito.
- ajuste: A função precisa tolerar recent com 51 itens (upsert do E4e) e janela deslizando mais de 1 por vez.

### E4e — Bolha enviada que some e volta (pisca) ao confirmar o envio
Onda E_paineis_ux · esforço P · depende de E4c · migration: não · micro: não · refs: THR-10

**Impacto:** Ao enviar texto ou mídia, a bolha não some por um instante nem faz a rolagem pular.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | handleSendText, handleSendMedia | 745-766 (removePending antes do mutate em 758-760), 768-805 (797 e 803) | Usar o WhatsAppMessageDTO devolvido pela action (send-message.ts:140 e 389): mutateMessages(cur => upsertById(cur, toThreadMessage(dto, meName)), { revalidate: false }), depois removePending(temp.id), depois revalidar em segundo plano (void mutateMessages()). |
| `app/_shared/utils/thread-window.ts` | toThreadMessage, upsertById | novo (mesmo arquivo do E4c) | toThreadMessage(dto: WhatsAppMessageDTO, authorName): WhatsAppThreadMessage (internal=false, authorName); upsertById(data, msg) sem duplicar. |

**Passos:**
1. Helpers puros.
2. Trocar a ordem no texto e na mídia: substitui no cache e só depois tira o pending.

**Riscos:**
- O DTO de envio não traz transcript nem reaction: o revalidate de fundo completa esses campos.

**Testes:**
- tests/thread-window.test.ts: upsertById insere no fim quando é novo e substitui quando o id já existe (o SSE chegou antes).

**Validação manual:** Enviar 5 textos seguidos numa conversa de teste: nenhuma bolha pisca nem duplica. Enviar 2 imagens: idem.

**Revisão: ajustar**
- problema: As linhas conferem, e send-message.ts devolve o DTO (sendWhatsAppMessage 140→177, sendWhatsAppMedia 389→445). Mas o cache do SWR da thread é `{ messages, hasMore }` (use-whatsapp.ts:105), não um array: `mutateMessages(cur => upsertById(cur, …))` quebra o tipo e a thread.
- ajuste: `mutateMessages(cur => cur ? { ...cur, messages: upsertById(cur.messages, toThreadMessage(dto, meName)) } : cur, { revalidate: false })`, depois `removePending(temp.id)` e `void mutateMessages()`.

## PR19 Thread: auto-scroll pela última mensagem + chip 'Nova mensagem ↓'
**Por que agora:** É um MISSED de severidade alta: em conversa com mais de 50 mensagens, a mensagem nova do cliente não aparece. Depende do E4c.

**Deploy:** Só frontend. atBottom fica em ref e o contador zera ao trocar de contactId. decideThreadScroll puro com teste.

**Medir antes/depois:**
- PR18/PR19 (E4c/E4e/E4d): reprodução manual de THR-5 (mensagem antiga some), THR-10 (bolha pisca) e da mensagem nova em conversa com mais de 50 mensagens: as três deixam de ocorrer.

### E4d — Auto-scroll pelo id da última mensagem + chip 'Nova mensagem ↓'
Onda E_paineis_ux · esforço M · depende de E4c · migration: não · micro: não · refs: [MISSED thread] Auto-scroll depende só do total de mensagens

**Impacto:** A mensagem nova do cliente aparece na tela mesmo em conversa com mais de 50 mensagens (43% das recebidas em qualificadas/fila). Quem está lendo mais acima não é puxado para baixo e vê um chip 'Nova mensagem ↓'. Trocar de conversa sempre abre na última mensagem.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | efeito de scroll + handleLoadOlder | 535-557 (efeito 541-551 com dependência [displayMessages.length]) | Dependências [lastMessageId, activeContactId]. atBottomRef atualizado no onScroll do scrollRef (distância < 150px). Troca de contato → scroll 'auto' para o fim após a 1ª carga. Última mensagem minha (pending/out do meId) ou atBottom → 'smooth'. Senão, newBelow++ e o chip aparece. A âncora de prepend (prependAnchorRef) continua com prioridade. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | chip na thread | 1620-1673 (container scrollRef) | Botão absoluto 'Nova mensagem ↓' (com contador) sobre o rodapé da thread: scroll para endRef e zera o contador; some ao chegar no fim. |
| `app/_shared/utils/thread-scroll.ts (novo)` | decideThreadScroll | novo | decideThreadScroll({ contactChanged, prependPending, lastIdChanged, distanceFromBottom, lastIsMine }): 'restore'|'jump'|'smooth'|'chip'|'none'. |

**Passos:**
1. Util puro + teste.
2. Trocar o efeito e adicionar o onScroll + chip.
3. Opcional: no onLoad da imagem (WaMediaBubble ~2466/2477), rolar de novo se estava no fim (THR-11).

**Regras tocadas:**
- UI: Dark Reader, sem dark:

**Riscos:**
- O onScroll dispara muito: usar ref (sem setState por evento) e só setState quando o chip muda.
- Se o E4f virtualizar a thread depois, esta lógica migra para followOutput/atBottomStateChange do Virtuoso.

**Testes:**
- tests/thread-scroll.test.ts: contato trocado → 'jump'; prepend → 'restore'; nova mensagem com 400px do fim → 'chip'; nova mensagem minha longe do fim → 'smooth'; mesma última id → 'none'.

**Validação manual:** Conversa de teste com mais de 50 mensagens aberta no fim: o número de teste manda mensagem → ela aparece. Rolar para cima e mandar outra → o chip aparece e leva ao fim. Alternar entre duas conversas já visitadas: sempre abre na última.

**Revisão: ok**
- problema: O efeito 541-551 depende só de displayMessages.length (confere), e o chip resolve o 'missed thread'.
- ajuste: Zerar o contador do chip na troca de contactId. Guardar atBottom em ref (sem setState por evento de scroll), como a spec já prevê.

## PR20 Inbox: Assumir/Devolver/Encerrar/Enviar refletem na hora
**Por que agora:** Cerca de 670 recargas completas por dia são disparadas direto por ação, e o passo de fluxo manual leva 3,7-4,3 s a mais que o do bot. Precisa entrar antes de D5/D8, que mexem em returnConversationToBot/closeConversation.

**Deploy:** As actions devolvem o patch, e as props do Composer e do SendTemplateModal mudam: abas antigas veem mensagem própria + F5. O envio mantém o fluxo do E4e e só acrescenta patchConversation(sentMessagePatch) com truncatePreview(160). Rollback por revertPatch(base, optimistic).

**Medir antes/depois:**
- PR20 (A2): passo de fluxo manual, gap − delay, p50 de 3,7-4,3 s (n=445) → ~1 s, pela mesma consulta de logs. Cargas completas por ação (~670 por dia) → 0.

### A2 — Ações do inbox sem esperar a recarga completa: patch local da conversa (action devolve o patch) e revalidação só em segundo plano
Onda A_sync_inbox · esforço M · depende de A1, A4 · migration: não · micro: não · refs: GR-6, DUR-1, DUR-7, [MISSED lista] Tag, Encerrar e Assumir fora das 1.000, THR-10, FE-9

**Impacto:** Assumir, Devolver ao bot, Encerrar, Reabrir, Marcar como lida/não lida, enviar texto, mídia e template refletem na tela e soltam o toast na hora, sem os 2-4s de antes. O diálogo de template fecha logo depois do envio. Cada passo de um fluxo manual deixa de custar ~4s além do delay e fica perto do tempo de envio do servidor. Encerrar ou assumir uma conversa achada pela busca também muda o status na tela.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/conversations.ts` | assumeConversation, returnConversationToBot, closeConversation, syncCloseTag | 506-536 (assume); 539-562 (return); 571-618 (close); 637-672 (syncCloseTag) | Trocar os retornos `Promise<void>` por `Promise<Partial<WhatsAppConversationDTO>>`, montados com dados que o servidor já tem, sem hidratação extra. assume → `{ status: 'human', assignedToId: me.id, assignedToName: me.name, closeCategoryLabel: null }`, preservando closeCategory/qualified como hoje. return → `{ status: 'bot', assignedToId: null, assignedToName: null, closeCategoryLabel: null }`. close → `{ status: 'closed', closeCategory, closeCategoryLabel: label, qualified, assignedToId: null, assignedToName: null, ...(tags ? { tags } : {}) }`. `syncCloseTag` passa a devolver `Promise<{id,name,color}[] | null>`: incluir color no include de `current` (648-651) e calcular a lista final em memória (current − removidas − atual + tag nova), sem query extra; o catch devolve null. |
| `app/_shared/utils/whatsapp-inbox.ts` | sentMessagePatch, mediaTypeLabel | arquivo novo (criado no A1) | `sentMessagePatch(dto: WhatsAppMessageDTO, me: { id: string; name: string }): Partial<DTO>` → lastMessageAt = dto.createdAt, status = dto.conversationStatus, assignedToId = me.id, assignedToName = me.name, lastMessagePreview = `Você: ${dto.body ?? mediaTypeLabel(dto.mediaType)}`, lastMessageAuthorName = me.name, lastMessageFromBot = false, lastMessageFromClient = false, lastMessageStatus = 'sent', lastMessageMediaType = dto.mediaType, closeCategoryLabel = null. `mediaTypeLabel` sai de conversations.ts:169-174 para cá, e o servidor passa a importar daqui, para as duas prévias baterem. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | runAction e chamadores; handleSendText; handleSendMedia; ContactsDirectory.onOpen; AddContactDialog.onCreated; props do Composer e do SendTemplateModal | 699-707 (runAction); 745-766 (handleSendText); 768-805 (handleSendMedia); 866-883 (block/unblock); 1308-1311 (ContactsDirectory onOpen); 1519-1524 (Assumir/Devolver); 1537-1550 (Encerrar); 1557-1559 (Reabrir); 1586-1601 (marcar não lida/lida); 1709 (onRefresh do Composer); 1714-1719 (template onSent); 1769-1772 (AddContact onCreated) | `runAction(fn: () => Promise<Partial<DTO> | void>, okMsg: string, opts?: { contactId: string; optimistic?: Partial<DTO> })`. Passos: guardar revertPatch(active, optimistic), aplicar patchConversation(optimistic), `const res = await fn()` e mostrar o toast.success logo em seguida. Se res vier como objeto, aplicar patchConversation(res); se vier void, `void refreshConversations()` (single-flight do A4, sem await). No erro, rollback e toast.error. Encerrar: optimistic `{ status: 'closed', closeCategory: category, closeCategoryLabel: label, qualified: QUALIFIED_BY_CATEGORY[category] ?? (category.startsWith('nq_') ? false : null), assignedToId: null, assignedToName: null }`, com QUALIFIED_BY_CATEGORY importado de close-categories.ts, que é módulo neutro. Assumir/Reabrir e Devolver ao bot usam o patch equivalente, com session.user.name para assignedToName. Block/unblock ficam sem patch e revalidam em segundo plano. handleSendText: `.then(async (dto) => { patchConversation(dto.contactId, sentMessagePatch(dto, me)); await mutateMessages(); removePending(temp.id); })`; tirar o refresh da lista e remover o pending só depois da thread voltar (THR-10/FE-9). handleSendMedia: patch por arquivo com o DTO devolvido; no final só `await mutateMessages()`. ContactsDirectory/AddContact: `setActiveContactId(id)` na hora e `void refreshConversations()`; o fetchedActive hidrata quem está fora da lista. |
| `app/nova-dash/workspace/whatsapp/WhatsAppComposer.tsx` | Props.onRefresh, submit (nota), runFlow, WhatsAppSendTemplateModal | 57 (prop); 65-68 (destructuring); 208-221 (nota, onRefresh em 214); 252-298 (runFlow: passos 270-289, onRefresh em 288 e 293); 678-683 (modal) | Trocar `onRefresh: () => Promise<void>` por `onRefreshThread: () => Promise<unknown>` (só a thread, GET fora da fila de actions) e `onSent: (dto: WhatsAppMessageDTO) => void` (patch local da lista). Nota: `void onRefreshThread()`. runFlow: guardar o DTO devolvido por sendWhatsAppMessage/sendWhatsAppMedia e, em cada passo, chamar `onSent(dto); void onRefreshThread();` sem await e sem recarregar a lista; no catch, só `void onRefreshThread()`. Modal: `onSent={(dto) => { onSent(dto); void onRefreshThread(); }}`. |
| `app/nova-dash/workspace/whatsapp/WhatsAppSendTemplateModal.tsx` | Props.onSent, handleSend | 27-32 (Props); 82-95 (handleSend) | `onSent: (dto: WhatsAppMessageDTO) => void`. handleSend: `const dto = await sendWhatsAppTemplateMessage(...); toast.success(...); onOpenChange(false); onSent(dto);`. O diálogo fecha antes e não espera mais a recarga. |
| `app/_actions/whatsapp/send-message.ts + app/_shared/lib/chat-relay.ts (opcional, DUR-7)` | persistOutbound, broadcastToRelay | send-message.ts 84-111; chat-relay.ts 42-56 | Opcional e barato: `const [conversation, recipients] = await Promise.all([upsert, whatsappRecipients()])` (economiza ~65 ms), e fetch do relay com `signal: AbortSignal.timeout(1500)`, logando status não-2xx. Hoje um relay travado prende o envio sem limite. Não usar fire-and-forget sem waitUntil (ver open_questions). |

**Passos:**
1. Adicionar sentMessagePatch e mediaTypeLabel ao util (e importar mediaTypeLabel em conversations.ts).
2. Em conversations.ts, mudar os retornos de assume/return/close e fazer syncCloseTag devolver as tags finais.
3. Em WhatsAppInbox.tsx, reescrever runAction com patch otimista, rollback e revalidação em segundo plano sem await, e ajustar todos os chamadores (1520, 1523, 1543, 1558, 1590, 1597, 874, 882).
4. Ajustar handleSendText e handleSendMedia (patch pelo DTO, removePending depois do mutateMessages) e os callbacks do ContactsDirectory e do AddContactDialog.
5. Trocar as props do WhatsAppComposer (onRefreshThread/onSent), ajustar runFlow e a nota, e mudar a assinatura de onSent no WhatsAppSendTemplateModal. Passar as novas props nos 2 usos (Inbox 1709/1718 e Composer 678-683).
6. (Opcional) Paralelizar recipients e upsert em persistOutbound e pôr timeout no broadcastToRelay.
7. Rodar /validar e depois /mapa-atualizar whatsapp-bot (Fluxo item 10: ações não recarregam mais a lista).

**Regras tocadas:**
- Multi-número: o envio continua usando contact.numberId (nada muda no servidor de envio)
- 'use server' só exporta funções async (o retorno Partial<DTO> é só tipo; os helpers ficam no util)
- Erro de server action chega mascarado em produção: o toast.error de rollback continua com mensagem própria
- Comentários explicam o porquê (fila serial de actions do Next 14.2.35; auditoria de 24/09)

**Riscos:**
- Até o próximo hash (≤15s) a tela mostra o estado otimista. Se o servidor divergir (ex.: tag de desfecho que o syncCloseTag não conseguiu aplicar e devolveu null), a tela corrige sozinha no reload seguinte.
- O próprio hash muda com a ação e ainda dispara UMA recarga completa em segundo plano. O clique não espera mais por ela, mas a fila de actions continua recebendo essa carga; tirar isso de vez é o trabalho de delta/rota GET da próxima onda.
- Conversa fora do top 1.000 que recebe envio continua fora da lista local até o hash recarregar. A tela resolve active pelo fetchedActive, que também recebe o patch.
- A mudança do tipo de retorno das actions é compatível com bundle antigo (que ignora o retorno). Já a remoção da prop onRefresh quebra só em compilação, e o tsc pega.
- Fluxo manual: sem recarga por passo, a lista só reordena pelo patch local. Se um passo falhar no meio, o toast de erro continua saindo.

**Testes:**
- tests/whatsapp-inbox.test.ts: sentMessagePatch com texto gera a prévia 'Você: oi' e status human; com mídia sem legenda usa mediaTypeLabel ('Foto', 'Documento'); assignedToName = me.name.
- tests/whatsapp-inbox.test.ts: patchConversationList com lastMessageAt novo move a conversa para o topo e mantém a ordem das demais.
- tests/whatsapp-inbox.test.ts: revertPatch + patch otimista de Encerrar volta exatamente ao DTO original (rollback).

**Validação manual:** Com contato de teste (produção): (1) Assumir, Devolver ao bot, Encerrar como 'Perguntas' e Reabrir: status, pasta e toast mudam em menos de 1s. No Network, nenhum POST da listagem entre o clique e o toast. (2) Encerrar uma conversa de teste aberta pela busca (fora das 1.000): o chip 'Encerrada · …' aparece. (3) Enviar texto: a bolha não some e volta, e a conversa sobe para o topo da lista. (4) Enviar template: o diálogo fecha logo depois do toast. (5) Rodar um fluxo de teste de 3 passos com delay 0: o intervalo entre passos cai de ~4s para perto de ~1,2s (conferir pelos createdAt das mensagens de teste). (6) Em outra aba, o status novo aparece em até ~15s. Apagar as mensagens e logs de teste no final.

**Revisão: ajustar**
- problema: Linhas conferidas: conversations.ts 506-536, 539-562, 571-618, 637-672 (include de current em 648-651) e mediaTypeLabel 169-174. Inbox: runAction 699-707, handleSendText 745-766, handleSendMedia 768-805, block/unblock 874/882, ContactsDirectory 1308-1311, Assumir 1520, Devolver 1523, Encerrar 1543, Reabrir 1558, não lida 1586-1595, lida 1597, Composer onRefresh 1709, template 1714-1719, AddContact 1769-1772. Composer 57, 65-67, 214, 288 e 293, modal 678-683. Modal Props 27-32 e handleSend 82-95. sendWhatsAppMessage, sendWhatsAppMedia e sendWhatsAppTemplateMessage devolvem WhatsAppMessageDTO com conversationStatus. O template também grava assignedToId = me (templates.ts:526-530), então sentMessagePatch vale para ele.
- problema: runAction guarda `revertPatch(active, optimistic)`: o rollback fica preso à conversa ativa. 'Marcar como não lida' faz setActiveContactId(null) antes do runAction (L1589-1590), e block/unblock recebem `conv`, que pode não ser a ativa. Hoje funciona por acaso, porque o closure ainda tem o active antigo, mas é frágil.
- problema: sentMessagePatch usa `dto.body ?? mediaTypeLabel(dto.mediaType)`. Se body e mediaType forem nulos, mediaTypeLabel(null) quebra em `.startsWith`. A prévia local também não passa pelo mesmo truncamento de 160 caracteres do A5, então a linha 'pula' de tamanho quando o hash recarrega.
- problema: handleSendText: se mutateMessages rejeitar, removePending fica depois do await e a bolha fica eternamente como 'enviando'. handleSendMedia continua chamando removePending por arquivo, logo depois do send (L795), e o piscar do THR-10/FE-9 continua para mídia.
- problema: Mesma perda de atualização do A1: todo patch com revalidate:false descarta a recarga do hash que estava em voo.
- problema: A expectativa de 'passo de fluxo ~1,2s' ignora que sendWhatsAppMessage continua na fila serial. Se uma recarga disparada pelo hash estiver em voo, o passo espera por ela. O ganho real fica entre ~1,2s e ~2,5s por passo; a validação manual não deve reprovar por isso.
- problema: A nota interna (`void onRefreshThread()`) deixa a prévia 'Você: <nota>' da lista só para o próximo hash (≤15s). Isso é aceitável, mas não está dito.
- ajuste: Assinatura: `runAction(fn, okMsg, opts?: { base: WhatsAppConversationDTO; optimistic?: Partial<DTO> })`, com o rollback feito por `patchConversation(base.contactId, revertPatch(base, optimistic))`. Nos chamadores, passar `base: active` capturado antes de qualquer setActiveContactId.
- ajuste: sentMessagePatch: `const p = dto.body ?? (dto.mediaType ? mediaTypeLabel(dto.mediaType) : null); lastMessagePreview: p ? `Você: ${truncatePreview(p)}` : null`, com truncatePreview(160) no mesmo util e left(…,160) no SQL do A5.
- ajuste: handleSendText: `.then(async (dto) => { patchConversation(...); try { await mutateMessages(); } finally { removePending(temp.id); } })`. handleSendMedia: juntar os temp ids enviados e removê-los só depois do `await mutateMessages()` final, também em finally.
- ajuste: Toast de erro com mensagem própria por ação ('Não foi possível encerrar. Recarregue a página se persistir.'), não o e.message, que em produção vem mascarado.
- ajuste: Depende do onDiscarded + single-flight do A4/A1 para não perder a recarga descartada.

**Em aberto:**
- Instalar @vercel/functions para usar waitUntil no broadcast e no log (DUR-7, e também para tirar do caminho síncrono o PUT no S3 do Encerrar, DUR-3)? É dependência nova; sem ela, fire-and-forget pode ser cortado quando a função congela.
- Aproveitar a mudança de assume/return/close para trocar o requireTeamMember por JWT de conversations.ts:35-44 por requireTeam() (LISTA-11)? Isso aplica a trava de IP nas actions do inbox.

## PR21 Inbox: conversa, pasta, busca e filtros sobrevivem à troca de aba
**Por que agora:** THR-4/LISTA-9: toda troca de aba da nova-dash perde a conversa aberta. Este PR cria a chave SWR 'wa-number-options' que o E1c reaproveita.

**Deploy:** sessionStorage com try/catch. 'wa-open-contact' é lido por último (tem precedência). 'wa-number-filter' continua restaurado quando as opções chegam.

### E4b — Conversa aberta, pasta, busca e filtros sobrevivem à troca de aba da nova-dash
Onda E_paineis_ux · esforço M · depende de — · migration: não · micro: não · refs: THR-4, LISTA-9

**Impacto:** O chefe abre o card no Kanban, volta ao WhatsApp e encontra a mesma conversa, pasta e busca. Tags, números e a agenda reaparecem na hora, do cache.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | estado de navegação | 192 (activeContactId), 195 (search), 229 (tagFilter), 244 (dateRange), 265 (columnFilter), 410 (activeFolder), 414 (contactsMode), 448-462 (wa-open-contact) | Restaurar no mount (useEffect, try/catch) de sessionStorage 'wa-inbox-view' = { contactId, folder, search, tagFilter, dateRange, columnFilter, contactsMode } e gravar a cada mudança (search com debounce). 'wa-open-contact' continua tendo precedência sobre o contactId restaurado. |
| `app/_shared/utils/inbox-view-state.ts (novo)` | parseInboxViewState, serializeInboxViewState | novo | Função pura com validação (pasta desconhecida → 'todos', JSON inválido → null). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | cargas de mount | 286-296 (listWaNumberOptions), 374-377 (reloadTags), 416-418 (listWaContactsDirectory total) | useSWR('wa-number-options'), useSWR('wa-tags') (reloadTags = mutate) e useSWR('wa-directory-total'), com revalidateOnFocus:false e dedupingInterval 60 s. O cache global do SWR sobrevive ao remount. |

**Passos:**
1. Criar o util puro com o teste.
2. Persistir e restaurar o estado (não usar forceMount: manteria SSE e polls rodando com a aba oculta).
3. Converter as 3 cargas de mount em SWR.

**Regras tocadas:**
- Troca de aba: sessionStorage gravado antes do CustomEvent (padrão wa-open-contact preservado)
- Browser storage sempre em try/catch, sem estado crítico

**Riscos:**
- Restaurar um contactId de conversa que não está mais na lista cai no getWhatsAppConversationByContact (476-483), que já trata esse caso.
- A leitura no useState inicial daria hydration mismatch (SSR): restaurar em useEffect.

**Testes:**
- tests/inbox-view-state.test.ts: round-trip; JSON inválido → null; pasta inválida → 'todos'; tagFilter não-array → [].

**Validação manual:** Abrir uma conversa na pasta 'Qualificadas' com busca 'ma' → ir ao Kanban → voltar ao WhatsApp: mesma pasta, busca e conversa aberta, sem refetch de números e tags no Network. Clicar numa notificação de outra conversa ainda abre a da notificação.

**Revisão: ok**
- problema: Linhas conferem (192, 195, 229, 244, 265, 410, 414, 448-462; cargas 286-296, 374-377, 416-418). Restaurar em useEffect evita hydration mismatch.
- ajuste: Com SWR 'wa-number-options', manter a restauração de 'wa-number-filter' (localStorage, 292-293) quando as opções chegarem. Reusar essa mesma chave no StrategicDashboard (E1c).
- ajuste: Garantir a precedência de 'wa-open-contact' (ler as duas chaves no mesmo efeito, 'wa-open-contact' por último).

## PR22 Menos custo por ação: setor do log em cache, broadcast e logs depois da resposta
**Por que agora:** Hoje cada ação gasta 2 queries só para carimbar o setor, e o envio espera o broadcast ao relay (~50-120 ms). Entra depois do PR02 medido e do A3 (markConversationRead).

**Deploy:** Dependência nova @vercel/functions (waitUntil), que precisa de aprovação do usuário. `at = new Date()` é capturado antes da resposta e gravado em createdAt, para manter a ordem wa_assign→wa_text→wa_close do analytics. ttl-cache puro com teste. maxDuration continua como está.

**Medir antes/depois:**
- PR22 (B5): calls por hora das queries de setor do authorSectorSnapshot caem ~90% (pg_stat_statements). Com um metadata.serverMs no wa_text, o tempo de servidor do envio fica abaixo dos 419 ms de hoje.

### B5 — Menos overhead por ação: setor do log em cache, broadcast e logs depois da resposta (waitUntil), destinatários em cache
Onda B_leituras_infra · esforço M · depende de — · migration: não · micro: não · refs: DUR-6, GR-7, DUR-7, DUR-3

Escopo neste PR: B5 (sem a parte DUR-3 de closeConversation, que vai para o D8)

**Impacto:** Devolver ao bot e assumir caem de ~0,4 s para ~0,15 s de servidor; o envio de texto perde ~0,19 s (relay + destinatários) e mais ~0,1-0,15 s do log. Tudo isso antes do ganho da região (B1). O webhook e o bot também ficam mais leves, porque cada mensagem deixa de gastar 3 queries fixas.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `package.json` | dependencies | (bloco dependencies; hoje sem @vercel/functions — node_modules/@vercel só tem blob) | Adicionar @vercel/functions (waitUntil oficial da Vercel). |
| `app/_shared/lib/background.ts` | runAfterResponse (novo) | novo | runAfterResponse(label: string, task: () => Promise<unknown>): void. Dispara a task na hora, com catch → console.error(`[BG] ${label}`), e chama waitUntil(promise) dentro de try: fora da Vercel é no-op. Comentário do porquê: Next 14.2.35 não tem after() e promise solta pode ser congelada quando a função responde. |
| `app/_shared/utils/ttl-cache.ts` | createTtlCache (novo) | novo | createTtlCache<K, V>({ ttlMs, now = Date.now }) → { get, set, delete, clear }. Guarda null também (cache negativo). |
| `app/_shared/lib/log.ts` | authorSectorSnapshot | 63-78 (chamado em 88 e 129) | Cache por authorId com TTL de 5 min. Atalho sem query para ids de sistema: 'whatsapp-bot' (15 usos), 'system', 'roteiro' e 'whatsapp-client'. Hoje são 2 SQL por log (include sem relationJoins). JWT não serve: ficaria congelado até 30 dias, e o log é 'snapshot do setor no momento'. |
| `app/_shared/lib/whatsapp/service.ts` | whatsappRecipients, broadcastWhatsAppEvent (novo) | 39-45, 403-405 | whatsappRecipients com cache de 60 s por instância (beneficia também service.ts:503/644, cron-tasks.ts:963/1037/1183 e signature/core.ts:452). Novo broadcastWhatsAppEvent(dto): void = runAfterResponse('relay', async () => broadcastToRelay({ channelId: dto.channelId, recipients: await whatsappRecipients(), message: dto })). |
| `call sites do broadcast WhatsApp` | ingestIncomingMessage, persistOutbound/reação/nota, template, postInternalNote, sendBotReply, outbound, flow-runner | service.ts:403-405; send-message.ts:110-111, 216-229, 290-291; templates.ts:549-550; bot.ts:476-477, 807-808; outbound.ts:217-218; flow-runner.ts:92-93 | Trocar o par `const recipients = await whatsappRecipients(); await broadcastToRelay(...)` por broadcastWhatsAppEvent(dto) (a reação passa o payload wa_reaction). |
| `app/_shared/lib/chat-relay.ts` | broadcastToRelay | 42-57 | fetch com signal: AbortSignal.timeout(1500). Hoje é aguardado sem timeout. O log de status fica na B6. |
| `logs sem IA no caminho quente` | logWhatsAppEvent | send-message.ts:166 (wa_text), 229 (wa_reaction), 340 (wa_note), 432 (wa_document/wa_media); conversations.ts:524 (wa_assign/wa_reopen), 552 (wa_return_bot), 604 (wa_close); templates.ts:515 (wa_template) | runAfterResponse(`log ${action}`, () => logWhatsAppEvent({...})). Os logs de IA (assist.ts, ficha-ai.ts) e o createLog do kanban (move e histórico) continuam com await. |
| `app/_actions/whatsapp/conversations.ts` | markConversationRead (tique azul na Meta) | 709-717 | A promise solta db.whatsAppMessage.findFirst(...).then(markMessageRead) passa por runAfterResponse. Hoje pode ser congelada depois da resposta da action. |
| `app/_actions/whatsapp/conversations.ts` | convContact (opcional) | 27-33 | Opcional (DUR-6): 1 $queryRaw com JOIN em whatsapp_contacts em vez de findUnique com select de relação (2 SQL). Usado em assume (L508), return (L541) e close (L576). |

**Passos:**
1. Rodar antes a linha de base da B1 (a métrica wa_text create→log muda de sentido depois desta onda).
2. Adicionar @vercel/functions, background.ts e ttl-cache.ts, com testes.
3. Cache em authorSectorSnapshot e em whatsappRecipients.
4. broadcastWhatsAppEvent e troca dos call sites, com timeout de 1,5 s no fetch do relay.
5. Logs sem IA do caminho quente via runAfterResponse; tique azul do markRead idem.
6. (Opcional) convContact numa query.
7. Validar no preview: envio, reação, nota, template, assumir, devolver e encerrar num contato de TESTE; conferir se os logs chegam.
8. /mapa-atualizar whatsapp e infra (runAfterResponse como padrão; logs que podem e não podem ir para depois da resposta).

**Regras tocadas:**
- O log nunca quebra a operação principal (mantido; o catch agora também cobre o background)
- Logs de move e histórico do card nunca são purgados: o createLog do kanban continua síncrono
- Toda chamada de IA grava metadata.usage: os logs de IA continuam com await
- Todo envio usa o numberId do contato: o broadcast não mexe em envio
- Não afrouxar cooldown, tetos nem marcapasso (não tocados)

**Riscos:**
- waitUntil disponível? Next 14.2.35 não tem after()/unstable_after (0 ocorrências em node_modules/next/dist). @vercel/functions não está no package.json. O Next lê internamente globalThis[Symbol.for('@next/request-context')].waitUntil (base-server.js:965-973, getWaitUntil), mas isso é interno e não documentado: não usar. A alternativa segura é @vercel/functions.waitUntil, que funciona em route handler e server action no runtime Node da Vercel. Sem ele, 'sem await' vira perda silenciosa de broadcast e log.
- Um log pode se perder se a instância morrer antes (aceitável para wa_*; nunca para move/histórico).
- O timestamp do log passa a ser depois da resposta: a métrica create→log da auditoria (p50 419 ms) deixa de medir latência.
- Cache de destinatários: membro novo fica sem SSE por até 60 s, removido recebe por até 60 s (o relay ainda exige token de sessão).
- Cache do setor: quem trocou de setor carimba o antigo por até 5 min (bem melhor que o JWT, até 30 dias).
- waitUntil estende a vida da função (custo desprezível; teto = maxDuration).

**Testes:**
- tests/ttl-cache.test.ts: expira com relógio injetado; guarda e devolve null; delete e clear.
- tests/background.test.ts: vi.mock('@vercel/functions'). runAfterResponse chama waitUntil com a promise; rejeição da task vira console.error e não propaga; task que lança de forma síncrona não quebra o chamador.

**Validação manual:** No preview (contato de TESTE): enviar texto e o relógio some mais rápido. Logs wa_text, wa_note, wa_close etc. continuam aparecendo (segundos depois). Vercel logs sem '[BG]'. pg_stat_statements: a query User+Sector por log some quase toda, e a de 'User where role in' (destinatários) cai para ~1/min por instância. Outra aba recebe a mensagem nova (poll ou delta).

**Revisão: ajustar**
- problema: Linhas conferidas: log.ts 63-78 (chamado em 88 e 129); service.ts 39-45 e 404-405; chat-relay.ts 42-57; broadcasts em send-message 110-111/216-229/290-291, templates 549-550, bot 476-477/807-808, outbound 217-218, flow-runner 92-93; logs em send-message 166/229/340/432, conversations 524/552/604, templates 515; markRead solto em 709-717. Next 14.2.35 sem after(); @vercel/functions ausente (node_modules/@vercel só tem blob); getBuiltinRequestContext é interno (base-server.js:966-972). O diagnóstico sobre waitUntil está certo.
- problema: Com o log depois da resposta, o createdAt deixa de ser o instante da ação. get-chatbot-analytics.ts:467-480 monta a sequência wa_assign/wa_reopen → wa_text/wa_media/wa_template → wa_close pelo createdAt. Um deslocamento de centenas de ms raramente inverte a ordem, mas distorce o tempo de primeira resposta, e o problema se resolve de graça.
- problema: A spec cita DUR-3 (encerrar ~1,2 s) nas refs, mas só leva o log wa_close e o convContact para depois da resposta. Continuam no caminho crítico o PUT no S3 e o review.create do captureConversation, o syncCloseTag (5 queries) e o closeReason em série com o convContact. DUR-3 fica só parcialmente atendido.
- problema: Os loops de Notification (bot.ts:523/711, cron-tasks.ts:963/1037/1183, service.ts:503/644, outbound.ts:250, signature/core.ts:452) ganham com o cache de destinatários, mas continuam com 1 create por membro em série (a métrica BACK-5 vem deles). Não é obrigatório nesta onda; só registrar.
- ajuste: logWhatsAppEvent/createLog aceitam at?: Date. runAfterResponse(`log ${action}`, () => logWhatsAppEvent({ ..., at })) com const at = new Date() capturado ANTES da resposta, e db.log.create grava createdAt: at. Isso mantém a ordem para o analytics. A métrica create→log da auditoria deixa de fazer sentido de qualquer jeito (a B1 mede antes).
- ajuste: Tirar DUR-3 das refs ou incluir o mínimo seguro: Promise.all(convContact, closeReason) e syncCloseTag + log wa_close via runAfterResponse. A leitura do captureConversation fica ANTES do update, porque ele zera botMemory. Separar leitura e PUT dentro de brain.ts fica para outra onda, com o motivo.
- ajuste: Nas open questions: 'createMany nos loops de Notification' fica como item futuro (fora do escopo), citando BACK-5.

**Em aberto:**
- Aprovar a nova dependência @vercel/functions (package.json + lock)? **Aprovada em 25/09.** Ela entra em `serverComponentsExternalPackages` (next.config.mjs): empacotada, o `import("ws")` do módulo de WebSocket dela quebra o build do webpack.
- DUR-3 (encerrar ~1,2 s) saiu deste PR: o `wa_close`, o `syncCloseTag` e o `Promise.all(convContact, closeReason)` ficam no PR30 (D8), que usa o `runAfterResponse` criado aqui. O `void reportLeadStageToMeta(...)` do encerramento também é promise solta e pode ir junto.
- Futuro, fora do escopo (BACK-5): `createMany` nos loops de Notification (bot.ts handoffToQueue/handoffNotifyOnly, cron-tasks.ts, service.ts, outbound.ts, signature/core.ts). Hoje eles só ganham o cache de destinatários e continuam com 1 create por membro em série.

### parte CRM do B6: log de res.status/delivered no broadcastToRelay

## PR23 Ficha: vínculo por telefone sem esperar o resumo por IA + rascunhos migrados
**Por que agora:** Abrir a conversa de um cliente com card pode travar a ficha e a fila atrás de uma chamada de IA (THR-6). O C7 fecha os drafts órfãos no mesmo ramo. Usa o runAfterResponse do PR22.

**Deploy:** Se o usuário recusar @vercel/functions, alternativa: justLinked + POST /api/whatsapp/summary (route handler com requireTeam, maxDuration 60 e dedupe por wa_summary recente). Os drafts são reivindicados por updateMany condicional ou $transaction. Precisa entrar antes do PR42 (B2-4).

**Medir antes/depois:**
- PR23 (C6/C7): wa_summary por vínculo continua sendo gravado (o resumo não sumiu). Tempo até a ficha aparecer na 1ª abertura cai. draftDocuments não vazio em contato vinculado depois do deploy = 0.

### C6 — getClientInfo e 'Adicionar cliente' não esperam o resumo por IA ao vincular
Onda C_documentos · esforço P · depende de — · migration: não · micro: não · refs: THR-6, [MISSED documentos] Abrir a conversa de um cliente com card pode travar a tela atrás de uma chamada de IA

**Impacto:** Ao abrir a conversa de quem já tem card, ou clicar em 'Adicionar cliente', a ficha, o 'Card #N', as mídias e o envio não ficam mais presos atrás de 2 a 4 s de IA. O comentário de resumo chega ao card alguns segundos depois.

**Ação do usuário:** Só se optar pelo waitUntil: aprovar a dependência nova `@vercel/functions`.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/client-info.ts` | getClientInfo | 135-153 | Reusar o retorno do requireTeamMember da L136 (remover a 2ª chamada da L150). Vínculo atômico: `const r = await db.whatsAppContact.updateMany({ where: { id: contactId, userId: null }, data: { userId: found.id } })`. Só `if (r.count === 1)` dispara `summarizeConversationToCard(...).catch(err => reportCriticalError('WA_SUMMARY_LINK', err))` SEM await. Dois atendentes abrindo juntos hoje geram 2 resumos. |
| `app/_actions/whatsapp/client-info.ts` | addClientFromConversation | 270-350 (awaits em 289 e 343) | Mesmo disparo sem await nas L289 e L343. |

**Passos:**
1. Seguir o precedente do repo: updateKanbanStatus dispara runAutomations sem await, com .catch(reportCriticalError) (update-kanban.ts:69-76), e isso já roda a Auditoria IA em produção. summarizeConversationToCard já tem try/catch próprio (assist.ts:187/234) e nunca lança.
2. Opcional, para garantir a execução depois da resposta: helper `runInBackground(label, p)` em app/_shared/lib/background.ts usando `waitUntil` de `@vercel/functions` (dependência nova). O Next 14.2 não tem `after()`.
3. Comentário no ponto: o resumo saiu do caminho crítico porque o Next 14 serializa as server actions (a ficha, os links das mídias e o envio esperavam a IA).

**Regras tocadas:**
- Toda IA grava metadata.usage: preservado, porque o logWhatsAppEvent com usage continua dentro de summarizeConversationToCard
- Server action da equipe: requireTeamMember local continua (a troca por requireTeam é outra onda)

**Riscos:**
- Sem waitUntil, a Vercel pode congelar a instância depois da resposta e o resumo se perde sem log. O precedente das automações sugere que funciona hoje; o waitUntil elimina a dúvida.
- O CardDialog aberto na hora não mostra o comentário até recarregar.

**Testes:**
- Sem lógica pura isolável. Validação manual.

**Validação manual:** Contato de TESTE sem userId, com telefone igual ao de um card de TESTE. Ao abrir a conversa, a ficha aparece na hora, e em ~5 s surge o comentário '🤖 Resumo…' no card e o log wa_summary com metadata.userId. Abrir em 2 abas ao mesmo tempo gera um resumo só.

**Revisão: ajustar**
- problema: Conferido: client-info.ts:135-196 (vínculo em 141-153, 2º requireTeamMember na L150), awaits em 289 e 343, assist.ts:187/234 com try/catch e precedente em update-kanban.ts:69-76. Na mesma file já há `void reportLeadStageToMeta` (L291, L347).
- problema: O 'sem await' puro viola na prática a regra de metadata.usage. A chamada de IA acontece no micro (Railway). Se a Vercel congelar a instância depois da resposta da action, o micro já pagou o Claude, mas o CRM nunca grava o comentário nem o log wa_summary com usage, e o gasto some do Canto da IA. O precedente das automações não prova que funciona, porque ninguém mede perdas lá.
- problema: O `.catch(reportCriticalError)` é redundante: summarizeConversationToCard nunca lança. É inofensivo.
- ajuste: Tornar o waitUntil obrigatório, não opcional: `waitUntil(summarizeConversationToCard(...))` via `@vercel/functions` (o Next 14.2 não tem after()). Precisa de aprovação da dependência.
- ajuste: Alternativa sem dependência nova: getClientInfo e addClientFromConversation devolvem `justLinked: true`, e o inbox dispara `fetch('POST /api/whatsapp/summary', { contactId })`, um route handler fora da fila de actions que espera o resumo na própria invocação (maxDuration 60, requireTeam, e dedupe por log wa_summary recente do contato).
- ajuste: Manter o vínculo atômico por updateMany({ userId: null }). Com count 0, seguir como registered sem novo resumo.

**Em aberto:**
- Aceita adicionar @vercel/functions (waitUntil) ou seguimos o padrão atual 'sem await + .catch' das automações?

### C7 — Migrar rascunhos de documentos também no vínculo automático por telefone
Onda C_documentos · esforço P · depende de C6 · migration: não · micro: não · refs: DOC-10

**Impacto:** O documento anexado na ficha antes de o card existir não some mais quando a conversa é vinculada ao card pelo telefone. Vira arquivo do card.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/client-info.ts` | getClientInfo (ramo do vínculo) | 141-153 | Dentro do `if (r.count === 1)` de C6: `await migrateDraftDocuments(contact, found.id)`. |
| `app/_actions/whatsapp/client-info.ts` | getClientInfo (ramo registered) | 155-181 | Autocorreção para os 3 contatos já vinculados com 4 docs presos: se `contact.userId` e `draftDocuments` não vazio, chamar migrateDraftDocuments e devolver `migratedDrafts: n` no ClientInfoResult (L56-66), para o inbox disparar 'wa-docs-changed'. |
| `app/_actions/whatsapp/client-info.ts` | migrateDraftDocuments | 353-363 | Dedupe: buscar `db.document.findMany({ where: { userId, key: { in: keys } }, select: { key: true } })` e fazer createMany só das keys novas (a purga conta com uma linha por key). Depois limpa o draftDocuments. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | useSWR getClientInfo | 489-493 | Se `clientInfo?.migratedDrafts`, `window.dispatchEvent(new Event('wa-docs-changed'))` (o Copiloto já escuta, CopilotPanel.tsx:123-127). |

**Passos:**
1. Fazer junto com C6 (mesma função, mesmo ramo atômico).
2. Deduplicar em migrateDraftDocuments.
3. A autocorreção no ramo registered dispensa backfill por script: cada contato preso migra na próxima abertura.

**Regras tocadas:**
- Document novo gerado pelo sistema grava category: inferCategory(name) (já é o caso em migrateDraftDocuments)
- Toda query de Document considera deletedAt: no dedupe, uma key na lixeira também conta como existente (evita linha duplicada)

**Riscos:**
- Escrita dentro de uma leitura (getClientInfo já grava o vínculo e o nome, então segue o padrão).
- Os 3 contatos presos só migram quando alguém abrir a conversa. Se precisar na hora, dá para um script de 10 linhas com --apply (não especificado).

**Testes:**
- Opcional: extrair `draftsToCreate(drafts, existingKeys)` para app/_shared/utils e testar o dedupe.

**Validação manual:** Contato de TESTE sem card: anexar um arquivo pela ficha (rascunho). Criar card de TESTE com o mesmo telefone pelo kanban, abrir a conversa: o arquivo aparece na aba Arquivos e no card.

**Revisão: ok**
- problema: Conferido: migrateDraftDocuments em client-info.ts:353-363, ClientInfoResult em 56-66, SWR em WhatsAppInbox.tsx:489-493 e listener em CopilotPanel.tsx:123-127.
- problema: A autocorreção no ramo registered não é atômica. Duas abas abrindo juntas podem ler os mesmos drafts antes do createMany, e o dedupe por findMany não fecha essa corrida. É raro (3 contatos).
- problema: A justificativa do dedupe ('a purga conta com uma linha por key') está imprecisa. hardDelete preserva o S3 quando existe outra linha. O motivo real é não duplicar o arquivo no card.
- ajuste: Em migrateDraftDocuments, primeiro 'reivindicar' os drafts com `db.$transaction`: ler draftDocuments, limpar e fazer createMany das keys novas numa só transação. Ou fazer `updateMany({ where: { id, NOT: { draftDocuments: { equals: Prisma.DbNull } } }, data: { draftDocuments: Prisma.DbNull } })` e só criar se count === 1, com o array lido antes.
- ajuste: Corrigir o comentário do porquê do dedupe.

## PR24 Script: reparo das mídias renomeadas (--apply)
**Por que agora:** Só depois da revisão do CSV do PR09 e com o fallback onError do PR14 no ar, para o resíduo não reparável aparecer como 'Arquivo indisponível'.

**Deploy:** Não vai para deploy. Precisa de aprovação explícita do usuário para escrever em produção. doc_quebrado com Document renomeado recebe soft-delete (deletedBy 'reparo-midia'). Preflight de s3:GetObjectVersion se houver versionamento.

### C1b (--apply)
Spec completa de C1b em **PR09**; aqui entra só: C1b (--apply)

## PR25 Bot WhatsApp: docsReceived só com foto/PDF do atendimento atual
**Por que agora:** Esforço P e isolado. O cérebro lê 'arquivo nesta conversa', mas recebe a contagem da vida inteira do contato, incluindo áudio (DOC-5/EF-4). É pré-requisito do D11.

**Deploy:** Só CRM (fato, não regra). wa-media.ts puro com teste.

### D4 — [CÓDIGO CRM] docsReceived conta só foto/PDF do atendimento atual
Onda D_bot_ia · esforço P · depende de — · migration: não · micro: não · refs: DOC-5, EF-4

**Impacto:** Cliente antigo que só mandou áudio, ou mandou documento num atendimento já encerrado, deixa de ser tratado como 'tem documento novo'. O cérebro pode resolver a dúvida simples em vez de transferir. O efeito isolado é pequeno (~3 transferências em 10 dias); o grosso vem da regra de cliente cadastrado (D11).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/utils/wa-media.ts` | isClientDocumentMime, docsReceivedSince (novo) | novo | export function isClientDocumentMime(mime: string | null): boolean (image/* exceto image/webp; application/pdf); export function docsReceivedSince(conv: { createdAt: Date; closedAt: Date | null }): Date = max(createdAt, closedAt) |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — select da conversa | 928-931 | select + closedAt: true |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — docsReceived | 1087-1091 | count({ where: { contactId, direction: 'in', deletedAt: null, createdAt: { gte: docsReceivedSince(conversation) }, OR: [{ mediaType: { startsWith: 'image/', not: 'image/webp' } }, { mediaType: 'application/pdf' }] } }) |
| `app/_shared/lib/whatsapp/bot.ts` | basePayload.conversationFacts (comentário) | 1143-1151 | comentário passa a dizer 'foto/PDF desde o último encerramento'; sem campo novo no payload |

**Passos:**
1. [CÓDIGO CRM] Criar app/_shared/utils/wa-media.ts com isClientDocumentMime e docsReceivedSince (puros). closedAt é sempre o último encerramento; reabrir (automático, pelo botão ou saindo do standby) nunca o limpa, então 'depois de closedAt' é o atendimento atual.
2. Incluir closedAt no select da conversa (L930) e trocar o count (L1087-1091): só image/* sem webp (figurinha) e application/pdf, com deletedAt: null (hoje falta) e recorte em max(createdAt, closedAt).
3. Atualizar o comentário de L1146-1148 ('NESTE atendimento' agora é verdade).
4. Gravar conversationFacts no metadata do wa_bot (junto do D9) para validar em produção.
5. Micro fora do escopo (pedido 'só CRM'): o texto de bot.js:1157 '(foto/PDF/áudio)' fica levemente impreciso; o ajuste de texto vai no D11.

**Regras tocadas:**
- bot: código manda fatos corretos, cérebro decide (é correção do fato, não trava)
- nenhum campo novo no payload (sem deploy do micro)

**Riscos:**
- Documentos .docx/.doc e outros application/* deixam de contar. O micro também não os abre (bot.js ~1628), então fica coerente.
- Conversa que recebeu docs, foi encerrada à mão e reaberta passa a ter docsReceived=0. Os docs antigos ainda aparecem no histórico (30 msgs); o DOC-4 (memória zerada) é outro item.
- Queda no número de 'documentos recebidos' nas notas de transferência. É esperado.

**Testes:**
- tests/wa-media.test.ts: isClientDocumentMime('image/jpeg')=true; ('image/webp')=false; ('application/pdf')=true; ('audio/ogg; codecs=opus')=false; (null)=false; docsReceivedSince({createdAt: jan, closedAt: null})=jan; ({createdAt: jan, closedAt: set})=set

**Validação manual:** Número de teste que já mandou áudio e foto num atendimento encerrado: reabrir mandando uma pergunta simples. No log wa_bot (metadata.facts, via D9), docsReceived deve ser 0; mandar uma foto e conferir docsReceived=1 no turno seguinte.

**Revisão: ok**
- problema: Confere: bot.ts:928-931 (select sem closedAt), :1087-1091 (count com mediaKey not null desde conversation.createdAt, sem deletedAt), comentário :1146-1148. O filtro Prisma { startsWith: 'image/', not: 'image/webp' } é válido (condições em AND). É correção do fato, não trava, e não exige deploy do micro. A spec avisa corretamente que o efeito isolado é pequeno (~3 transferências/10 dias) e que o grosso vem do D11.

## PR26 Bot WhatsApp: handoff de erro não rouba conversa, bot para ao sair do modo bot e erros críticos ficam registrados
**Por que agora:** Hoje o timeout tira a conversa do atendente que já tinha assumido, e o bot continua falando depois de transferir. É a base de D3/D5/D9/D11 (mesmo laço de envio e mesmos helpers de fila).

**Deploy:** handoffToQueue/qualifyToQueue ganham opts { onlyIfStatus: 'bot' } com updateMany condicional. Com inbound mais nova, a ação terminal ainda roda; com saída do modo bot, nada roda. shouldAbortSend puro com teste. Decidir se critical_error é purgável.

**Medir antes/depois:**
- PR26 (D2): handoffs de erro/timeout que trocaram o assignedToId de conversa já assumida = 0. Mensagens sentByBot depois de o status sair de 'bot' = 0. Logs critical_error com contactId passam a existir.

### D2 — [CÓDIGO CRM] Handoff de erro/timeout não rouba conversa de atendente; bot para de falar quando a conversa sai do modo bot
Onda D_bot_ia · esforço M · depende de — · migration: não · micro: não · refs: [MISSED bot_latencia] O handoff por timeout tira a conversa do atendente que já tinha assumido, e o bot continua falando depois de transferir, BOT-6, [MISSED bot_latencia] Erros fora do try do bot somem

**Impacto:** Atendente: a conversa que ele assumiu não volta mais para a Fila ~1 min depois com nota de 'timeout' (caso cmt75fgn200guk004jk5tbs9w). Cliente: não recebe mais mensagem do bot depois da nota de transferência (4 de 19 timeouts em 30 dias), nem o resto de um roteiro enviado por cima de uma mensagem nova dele.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/whatsapp/bot.ts` | handoffToQueue | 507-540 | export async function handoffToQueue(contactId, contactLabel, reason, closeCategory = 'transferido', opts?: { onlyIfStatus?: 'bot'; extraNote?: string }): Promise<boolean> — update → updateMany({ where: { contactId, ...(opts?.onlyIfStatus ? { status: opts.onlyIfStatus } : {}) }, data }); count === 0 → return false sem nota nem notificação |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — debounce | 898-927 | manter sleep(BURST_DEBOUNCE_MS) e mover a definição/checagem de findNewerInbound para DENTRO do try (a falha de banco cai no catch → handoff, e não some no reportCriticalError do webhook) |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — corrida pós-cérebro | 1229-1239 | depois do findNewerInbound, reler o status: const isStillBot = async () => (await db.whatsAppConversation.findUnique({ where: { contactId }, select: { status: true } }))?.status === 'bot'; se false → return (log discarded_status no D9) |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — laço de envio | 1312-1322 | for (const [i, msg] of outgoing.entries()) { if (i > 0) { await sleep(replyDelayMs(i, msg)); if (await findNewerInbound() || !(await isStillBot())) { interrompido = true; break; } } await sendBotReply(..., msg, 0) } — interrompido → não executa o switch; loga e retorna |
| `app/_shared/lib/whatsapp/bot.ts` | chamadas de handoffToQueue no fluxo do bot | 888, 1026, 1063, 1343, 1389-1393, 1419-1424 | passar { onlyIfStatus: 'bot' } |
| `app/_shared/lib/whatsapp/bot.ts` | catch de handleIncomingWhatsApp | 1483-1506 | if (await findNewerInbound().catch(() => null)) { log erro com deferredToNewer: true; return } ; const moved = await handoffToQueue(contactId, contactLabel, detail, 'transferido', { onlyIfStatus: 'bot' }); log wa_bot error com handoffSkipped: !moved (logar depois do handoff) |

**Passos:**
1. [CÓDIGO CRM] Exportar handoffToQueue (o D3 usa no cron) com o parâmetro opts.onlyIfStatus e o retorno boolean. O update incondicional vira updateMany condicional. Nota interna e notificações só se count > 0. Comentário citando o caso de 11/09 18:47.
2. Mover o findNewerInbound do debounce para dentro do try (MISSED 'Erros fora do try'): hoje uma falha nessa query sobe para o catch do webhook, que só faz console.error, e o cliente fica sem resposta.
3. Depois da checagem de corrida (L1236), reler o status da conversa; se não for mais 'bot' (atendente assumiu/encerrou durante o cérebro), desistir sem enviar nem persistir.
4. Reestruturar o laço de envio (o D1 foi retirado em 25/09: o humanDelay continua como está, inclusive no 1º bloco): antes de CADA bloco (inclusive o 1º), depois do humanDelay de hoje, checar findNewerInbound + isStillBot; se falhar, parar os blocos restantes e NÃO executar a ação (a invocação mais nova, que junta as mensagens novas, ou o atendente, decide).
5. Todas as chamadas de handoffToQueue dentro do fluxo do bot passam { onlyIfStatus: 'bot' }. qualifyToQueue (L557-587) continua incondicional porque também é usado por signature/core.ts:13, mas fica protegido pela releitura de status.
6. No catch: se já existe inbound mais nova, deixar a invocação nova decidir (só logar). Senão, handoff condicional; se não moveu (status já é human/queued/closed), registrar handoffSkipped no log e não postar nota nem notificação.

**Regras tocadas:**
- falha do bot vai para handoffToQueue com motivo, nunca vira erro ao cliente
- bot: código não sobrescreve decisão do cérebro (aqui só rede de segurança/roteamento)
- comentários explicam o porquê

**Riscos:**
- Interromper o roteiro no meio deixa botMemory/botState já persistidos (L1299-1306) como se todos os blocos tivessem saído. A invocação seguinte vê no histórico o que de fato foi enviado. Aceitável, e raro com o humanDelay só entre blocos.
- +1 query por decisão (releitura de status) e +2 por bloco extra do roteiro. O custo é desprezível perto dos ~20 s do cérebro.
- Um handoff 'em duplicidade' para conversa já em queued deixa de postar a 2ª nota. É o comportamento desejado, mas a nota do motivo real pode ficar só na 1ª.
- O catch pular o handoff quando há inbound nova depende de a invocação nova completar. Se ela também falhar, cai no próprio catch dela e o risco fica coberto.

**Testes:**
- Lógica ligada ao banco, sem teste unitário útil. Se quiser, extrair shouldAbortSend({ hasNewerInbound, status }) para app/_shared/utils/bot-timing.ts e testar as 4 combinações.

**Validação manual:** No staging, apontar CHATBOT_URL_STAGING para um micro lento (ou derrubá-lo) e mandar mensagem do número de teste. Durante os ~146 s, assumir a conversa no inbox: ela deve ficar com o atendente, sem nota 'Transferido… timeout', e o log wa_bot error deve trazer handoffSkipped=true. Forçar um qualify com roteiro e responder no meio: os blocos restantes não saem. Logs Vercel [WHATSAPP BOT].

**Revisão: ajustar**
- problema: As linhas conferem: handoffToQueue bot.ts:507-540 (não exportada, update incondicional com assignedToId null), debounce :898-925 (fora do try), corrida :1236-1239, catch :1483-1506, chamadas :888/:1026/:1063/:1343/:1389/:1419.
- problema: RISCO EM PRODUÇÃO NÃO TRATADO: `replies` com vários blocos só existe em SCRIPT_STATES (bot.ts:300-303), e o comentário de :1309-1311 diz que ele vem justamente com action 'qualify' (o roteiro comercial). A regra 'interrompido → NÃO executa o switch' faz um lead qualificado que responde 'ok'/'sim' no meio do roteiro (caso comum) ficar sem qualifyToQueue. Com isso ele perde a tag 'Qualificada' (marco do funil), a CAPI, a tarefa de setor e a fila, e fica em 'bot' com state script_*. Nada garante que a invocação seguinte qualifique de novo.
- problema: qualifyToQueue (bot.ts:567-570) continua com update incondicional (status 'queued', assignedToId null). Entre a releitura de status e o switch passam todos os blocos do roteiro (até ~15 s), e se um atendente assumir nesse intervalo o qualify rouba a conversa, que é o mesmo bug que o item corrige no handoff.
- problema: Detalhe de implementação: se findNewerInbound for declarado com const DENTRO do try, o catch não o enxerga. Declare antes do try e só execute dentro dele.
- ajuste: Diferenciar os dois motivos de interrupção. (a) Chegou inbound mais nova: parar os blocos restantes, mas AINDA executar a ação terminal (qualify/disqualify/handoff/resolve). A decisão foi tomada com o lote completo, e para qualify a conversa vai para 'queued': a invocação nova sai no teste de status de :935 e o humano vê a mensagem nova na fila. Só 'continue' é descartado. (b) Status saiu de 'bot' (atendente assumiu): parar tudo e não executar a ação.
- ajuste: Dar a qualifyToQueue o mesmo opts?: { onlyIfStatus?: 'bot' } com updateMany condicional, e passar { onlyIfStatus: 'bot' } em bot.ts:1363. Os chamadores de signature/core.ts ficam sem o parâmetro, com o comportamento atual.
- ajuste: Acrescentar uma releitura de status depois do último bloco e antes do switch (1 query), além da releitura depois de :1236.
- ajuste: Opcional, recomendado: extrair shouldAbortSend({ hasNewerInbound, stillBot, action }) → 'continue_sending' | 'stop_blocks_run_action' | 'stop_all' para app/_shared/utils/bot-timing.ts e testar as combinações, incluindo qualify interrompido por inbound nova.

**Em aberto:**
- Quando o roteiro é interrompido, vale gravar botState anterior (rollback) em vez de manter o state novo? A proposta é manter e confiar no histórico real.

### faltou-D: reportCriticalError grava Log 'critical_error' com contactId

## PR27 Bot WhatsApp: cron de silêncio relê a conversa antes de encerrar; órfã vai para a Fila
**Por que agora:** Corrige a corrida cron × mensagem nova, que encerra conversa com pergunta sem resposta (BOT-5), e a órfã escondida (BOT-4). O critério de órfã é 'o bot não decidiu' (nenhum wa_bot depois da última inbound), não 'o bot ficou calado', o que respeita a regra do cérebro.

**Deploy:** Guard atômico com botNudge30At no where. finalizeClose(conv, { fromStatus }) recebe 'standby' nos 5 chamadores da recuperação. O interruptor por env permite desligar sem deploy se a fila encher. Teste manual do cron só fora da janela agendada.

**Medir antes/depois:**
- PR27 (D3): encerramentos por inatividade com inbound posterior à última saída (BOT-5) = 0. Órfãs (client_pending sem wa_bot) vão para a fila com motivo em vez de fechadas em silêncio.

### D3 — [CÓDIGO CRM] Cron de silêncio relê a conversa antes de encerrar e manda a órfã para a Fila com motivo
Onda D_bot_ia · esforço M · depende de D2 · migration: não · micro: não · refs: BOT-5, BOT-4, [MISSED bot_latencia] Erros fora do try do bot somem

Escopo neste PR: D3 (+ interruptor env WA_ORPHAN_TO_QUEUE)

**Impacto:** Cliente: pergunta enviada no mesmo segundo do cron (caso de 24/09 13:00:02) não é encerrada sem resposta. Equipe: conversa em que o bot não respondeu (erro de infra, função morta) aparece na Fila em ~30 min com a nota 'o bot não respondeu à última mensagem do cliente', em vez de ir calada para standby/fechadas (~10 casos em 4 mil rajadas).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/utils/wa-silence.ts` | ACK_WORDS, isClosingAck, classifyLastMessage (novo) | novo (move cron-tasks.ts 307-332) | export function isClosingAck(body, mediaType): boolean; export function classifyLastMessage(last: { direction: string; sentByBot: boolean; authorId: string | null; body: string | null; mediaType: string | null } | null): 'none' | 'bot_asked' | 'human_last' | 'client_ack' | 'client_pending' |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | runNudgePhase — 1. silêncio de 30 min | 620-677 | select de `last` (L623-627) ganha createdAt, mediaType, authorId; client_pending → handoffToQueue(conv.contactId, label, 'o bot não respondeu à última mensagem do cliente (30 min sem resposta)', 'transferido', { onlyIfStatus: 'bot' }) + recordCodeIntervention({ action: 'orfa_para_fila' }) + results.orphans++; depois de decideFollowup (L640) e antes de cada envio/mudança de estado: if (await inboundSince(conv.contactId, last.createdAt)) return |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | runNudgePhase — 2. encerramento por inatividade | 690-729 | lastMsg (L694-698) com createdAt/body/mediaType/authorId; client_pending → mesmo handoff de órfã; reler inboundSince antes da despedida (L704-705) e antes de enterStandby/finalizeClose (L710-723) |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | finalizeClose | 464-485 | finalizeClose(conv, opts: { closeCategory?; recoveryOutcome?; fromStatus: 'bot' | 'standby' }): Promise<boolean> → updateMany({ where: { id: conv.id, status: opts.fromStatus }, data }) ; recovery (L776, 792, 806, 904, 915) passa 'standby' |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | enterStandby | 501-522 | updateMany({ where: { id: conv.id, status: 'bot' }, data }) → Promise<boolean> |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | CronResults / emptyResults / helper inboundSince | 199-207 | + orphans: number; async function inboundSince(contactId: string, since: Date): Promise<boolean> (findFirst direction 'in', deletedAt null, createdAt > since) |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — saiu do modo bot | 933-938 | (opcional) se status === 'standby' (só o cron põe em standby, e a ingestão já reabriria) → updateMany({ where: { contactId, status: 'standby' }, data: { status: 'bot', recoveryNextAt: null } }) e segue; 'closed' continua desistindo (pode ter sido encerramento manual) |

**Passos:**
1. [CÓDIGO CRM] Extrair ACK_WORDS/isClosingAck de cron-tasks.ts (L307-332) para app/_shared/utils/wa-silence.ts (puro) e criar classifyLastMessage. O SLA humano (L1023) passa a importar de lá.
2. Nudge 30 min: quando a última mensagem não interna é do cliente e não é agradecimento/reação/figurinha (client_pending), é órfã. Chamar handoffToQueue exportado no D2 com onlyIfStatus 'bot' e motivo explícito, e registrar recordCodeIntervention('orfa_para_fila'), que aparece na aba Métricas. Isso é rede de segurança ('falha do bot vai para a fila com motivo'), não trava de negócio.
3. client_ack continua como hoje (só marca botNudge30At e depois vai para standby/closed sem mensagem). human_last é tratado no D5.
4. Corrida BOT-5: guardar last.createdAt. Depois do decideFollowup (IA, até 12 s), antes de enviar nudge/fecho e de novo antes de enterStandby/finalizeClose, checar inboundSince. Se o cliente falou, sair sem mexer (o bot da mensagem nova responde).
5. Tornar enterStandby e finalizeClose condicionais ao status esperado ('bot' no nudge, 'standby' na recuperação) via updateMany e retornar boolean. Fazer a releitura imediatamente antes do captureConversation, para não gerar review de conversa que não fechou.
6. Encerramento por inatividade: mesma classificação. client_pending → órfã para a fila; bot_asked → despedida como hoje (com releitura antes de enviar).
7. Adicionar orphans em CronResults (mergeResults é genérico) e no log [WHATSAPP CRON].
8. (Opcional) bot.ts L935: status 'standby' encontrado depois do debounce só pode ter vindo do cron depois da ingestão. Reabrir para 'bot' e seguir. 'closed' continua desistindo.

**Regras tocadas:**
- falha do bot vai para handoffToQueue com motivo
- captureConversation antes do update que encerra
- não afrouxar cooldown/tetos/marcapasso (o handoff de órfã não envia nada ao cliente; o pacer segue igual)
- multi-número (crons seguem com activeNumberConversationWhere)

**Riscos:**
- Falso positivo de órfã: o cérebro escolheu silent=true numa mensagem que não é ack e a conversa vai para a Fila. Volume desconhecido (silent não é logado hoje; o D9 passa a logar). Esperado ~1/dia de órfã real.
- O handoff de órfã grava closeCategory 'transferido' (sobrescreve categoria velha), mesmo comportamento do handoff normal.
- captureConversation continua antes do update. Se a releitura passar e o updateMany ainda der 0 (janela de ms), fica 1 review órfã na fila de revisão. Aceitável.
- À noite o D6 adia a fase inteira, então a órfã noturna só vai à Fila às 7h, o que dá no mesmo porque não há humano de noite.

**Testes:**
- tests/wa-silence.test.ts: isClosingAck('ok obrigado', null)=true; ('👍', null)=true; ('Reagiu com 👍', null)=true; ('', 'image/webp')=true; ('Mas será no INSS essa perícia?', null)=false; ('', 'image/jpeg')=false; ('legenda', 'image/jpeg')=false
- classifyLastMessage: out+sentByBot → bot_asked; out+!sentByBot+authorId → human_last; in+ack → client_ack; in+pergunta → client_pending; null → none

**Validação manual:** Número de teste: com o staging derrubado, mandar uma pergunta (a conversa fica em 'bot' sem resposta). Passados 30 min, disparar GET /api/whatsapp/cron/nudge com CRON_SECRET. A conversa deve aparecer na Fila com a nota do motivo, evento kind='code' action='orfa_para_fila' em Métricas e 'orphans' no log [WHATSAPP CRON]. Mandar 'ok obrigado' e deixar silenciar: segue para standby/closed como antes. Corrida (difícil de reproduzir): depois de 1 semana, SQL somente leitura procurando conversas closed com inbound criada até 5 s antes do closedAt e sem out depois. A meta é 0.

**Revisão: ajustar**
- problema: As linhas conferem: cron-tasks.ts:620-677 (nudge30), :690-729 (encerramento), finalizeClose :464-485, enterStandby :501-522, CronResults :199-207, ACK_WORDS/isClosingAck :309-332. Os casos de teste de isClosingAck batem com o código atual.
- problema: VIOLAÇÃO DA REGRA DO CÉREBRO: 'client_pending → fila' também pega a conversa em que o cérebro ESCOLHEU silent=true num continue (ex.: 'vou procurar os documentos e te mando'). Mandar isso para a fila é o código sobrescrevendo uma decisão deliberada da IA, ou seja, uma trava nova 'cliente falou por último → humano'. A rede de segurança permitida é para FALHA (o bot não decidiu), não para silêncio escolhido.
- problema: A releitura 'antes da despedida' precisa acontecer DEPOIS do buildFarewell (IA, até 15 s, cron-tasks.ts:704) e imediatamente antes do sendBotReply. Antes do buildFarewell a janela da corrida BOT-5 continua aberta.
- problema: Existe jeito mais simples e atômico no passo 2: a ingestão zera botNudge30At em todo inbound (service.ts:248) e o returnConversationToBot também (conversations.ts:549). Então updateMany({ where: { id, status: 'bot', botNudge30At: conv.botNudge30At } }) detecta qualquer mensagem nova desde a seleção, sem query extra nem janela de milissegundos.
- problema: Validação manual: disparar GET /api/whatsapp/cron/nudge manualmente roda a fase INTEIRA em produção, para todos os clientes. Se coincidir com a execução agendada, são duas invocações sem trava pegando as mesmas conversas, o que pode gerar nudge/despedida em dobro e dobrar o ritmo do marcapasso (anti-spam).
- ajuste: Critério de órfã baseado em falha: client_pending E nenhum log wa_bot (fora os outcome discarded_* do D9) depois da última inbound. Consulta: db.log.findFirst({ where: { action: 'wa_bot', createdAt: { gt: last.createdAt }, metadata: { path: ['contactId'], equals: conv.contactId } }, select: { id: true } }). É barata pelo índice @@index([action, createdAt]) de Log. Com wa_bot presente (a IA decidiu, inclusive silent), segue o fluxo atual. Manter classifyLastMessage puro e fazer a checagem de log fora dele.
- ajuste: Passo 2: guard atômico com botNudge30At no where de enterStandby/finalizeClose (além de status), retornando boolean. inboundSince fica só no passo 1 e na checagem logo antes do sendBotReply da despedida, depois do buildFarewell.
- ajuste: finalizeClose(conv, { fromStatus, ... }): manter captureConversation logo antes do updateMany, como proposto. Os 5 chamadores da recuperação (cron-tasks.ts:776/792/806/904/915) passam 'standby'.
- ajuste: O opcional de bot.ts:935 (standby → bot) pode sair: com o guard atômico a janela praticamente fecha. Se ficar, gravar também recoveryOutcome coerente.
- ajuste: Na validação manual, só disparar o cron quando a execução agendada não estiver rodando (logo depois de um :00/:15/:30/:45 concluído) e preferir o endpoint da fase isolada.

**Em aberto:**
- Órfã deve ir para a Fila já aos 30 min (proposta) ou só no passo de encerramento (90 min)?

## PR28 Bot WhatsApp: dono pegajoso (devolver, reabrir e transferir mantêm o último atendente)
**Por que agora:** EF-1 (crítico→alto): devolver ao bot fecha, reabre no bot e manda de volta à fila sem dono. Depende de A2, D2 e D3.

**Deploy:** Só CRM. Com a última fala humana há mais de 7 dias, fecha direto com finalizeClose, sem enterStandby, e grava recordCodeIntervention('recuperacao_bloqueada'): aperta o anti-spam, não afrouxa. ownership.ts em lib sem 'use server'; pickOwner puro com teste.

**Medir antes/depois:**
- PR28 (D5): entradas na fila sem dono em conversa com fala humana nos últimos 7 dias → ~0. Ciclos 'devolver → reabrir → fila sem dono' por semana (EF-1) caem.

### D5 — [CÓDIGO CRM] Dono pegajoso: devolver ao bot, reabrir e transferir mantêm o último atendente; cron não fecha por silêncio quando a última fala é humana
Onda D_bot_ia · esforço M · depende de D2, D3 · migration: não · micro: não · refs: EF-1

Escopo neste PR: D5 (+ interruptor env WA_HUMAN_HOLD_DAYS; sem o fato recentAttendant, que vai para o D11)

**Impacto:** Atendente: a conversa que ele devolveu ao bot continua com o selo dele; se o cliente voltar (até 7 dias) e o bot transferir, ela volta para ele, e só ele é notificado, em vez da Fila sem dono em que outro atendente pega em 56% dos casos. Chefe: menos 'vai e volta' e menos conversa trocando de mão (~19 retransferências/dia). Cliente: não é encerrado 106 min depois da última mensagem do atendente.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/whatsapp/ownership.ts` | resolveConversationOwner (novo, sem 'use server') | novo | export async function resolveConversationOwner(contactId: string, currentAssignee?: string | null, lookbackMs = 7*24*60*60_000): Promise<string | null> → currentAssignee se for da equipe (isTeamRole no banco); senão authorId da última whatsAppMessage { contactId, direction: 'out', sentByBot: false, authorId: { not: null }, internal: false, deletedAt: null, createdAt >= now-lookback } (índice [contactId, createdAt]) se ainda for da equipe |
| `app/_shared/utils/ownership.ts` | pickOwner (novo, puro) | novo | export function pickOwner(assignee: string | null, lastHumanAuthor: string | null, teamIds: Set<string>): string | null |
| `app/_actions/whatsapp/conversations.ts` | returnConversationToBot | 539-562 | data (L549) sem assignedToId: null — o dono fica gravado com status 'bot'; comentário do porquê (EF-1) |
| `app/_shared/lib/whatsapp/service.ts` | ingestIncomingMessage — reabertura closed→bot e standby→bot | 297-305, 315-321 | assignedToId: await resolveConversationOwner(contact.id) no lugar de null (status continua 'bot') |
| `app/_shared/lib/whatsapp/bot.ts` | handoffToQueue / qualifyToQueue | 513-517, 561-570 | const owner = await resolveConversationOwner(contactId, conv.assignedToId); data.assignedToId = owner (status 'queued'); nota interna '… — volta para <nome do atendente>' (nota interna não vai ao cérebro: history filtra internal) |
| `app/_shared/lib/whatsapp/bot.ts` | handoffToQueue — notificações | 522-536 | recipients = owner ? [owner] : await whatsappRecipients() (o D7 troca o else por setor) |
| `app/_shared/lib/whatsapp/service.ts` | notifyIncomingMessage / alertDeliveryFailure | 500-503, 625-631 | owned = (status === 'human' || status === 'queued') && !!assignedToId; alertDeliveryFailure põe em queued mantendo o dono |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | runNudgePhase — 2. encerramento por inatividade | 690-729 | classifyLastMessage (D3) === 'human_last' && lastMessageAt > now-7d → update { botNudge30At: new Date(lastMessageAt + 7d) } (trava de reavaliação; comentário) e return; depois de 7 dias segue o fluxo atual |

**Passos:**
1. Veredito segundo docs/ai/whatsapp-bot.md (L7, L77, L91): é ROTEAMENTO e pode. Manter/restaurar assignedToId, levar handoff/qualify ao último dono, notificar o dono e o cron não encerrar por silêncio quando quem falou por último foi humano não decidem desfecho de negócio (qualificar, transferir, resolver continuam com o cérebro).
2. Seria TRAVA DE NEGÓCIO, proibida: reabrir já como 'human'/'queued' pulando o cérebro, ou forçar handoff 'porque houve atendente'. Não fazer. Se o escritório quiser que o bot devolva mais rápido nesses casos, vira fato conversationFacts.recentAttendant (payload + buildDynamicContext no micro) + regra nas instruções. Não é state/closeCategory/action novo, então não cai na regra dos 3 lugares.
3. [CÓDIGO CRM] Criar app/_shared/lib/whatsapp/ownership.ts (resolveConversationOwner) e o puro pickOwner em app/_shared/utils/ownership.ts. Dono = assignedToId atual se ainda for da equipe; senão, o autor da última mensagem humana dos últimos 7 dias (mesma janela de HUMAN_TOUCH_LOOKBACK_MS). Não precisa de coluna nova.
4. returnConversationToBot: não zerar assignedToId (o dono fica visível na pasta Bot e em 'Só minhas').
5. service.ts: na reabertura closed→bot e standby→bot, gravar assignedToId = dono (status segue 'bot', o cérebro responde).
6. bot.ts: handoffToQueue e qualifyToQueue gravam assignedToId = dono (status 'queued', mantendo queuedAt/SLA e as métricas de fila). Notificação só para o dono quando existe.
7. service.ts: notifyIncomingMessage trata queued com dono como 'owned'; alertDeliveryFailure mantém o dono ao enfileirar.
8. cron-tasks.ts: no encerramento por inatividade, conversa cuja última fala não interna é de atendente (human_last) não é encerrada nem vai para standby durante 7 dias. Para não virar fome da consulta (take 25 sem orderBy), adiar a reavaliação gravando botNudge30At = lastMessageAt + 7d. A ingestão (service.ts L248) e o returnConversationToBot já zeram o campo quando o cliente fala. Documentar a armadilha no mapa.
9. Migration: NÃO precisa. Coluna lastOwnerId só se quiserem dono além de 7 dias, ou quando o atendente assumiu sem escrever (fica como pergunta).

**Regras tocadas:**
- bot: decisão de negócio é do cérebro (aqui só roteamento de dono)
- requireTeam/requirePermission lendo o banco (o dono é validado como equipe pelo banco, não pelo JWT)
- multi-número (sem impacto: não envia nada)
- comentários explicam o porquê

**Riscos:**
- Dono de folga ou fora do turno recebe a conversa. Coberto pela escalada do SLA de fila no D7 (4h/24h para a equipe, 48h para o gestor); em horário comercial, o 1h também vai ao setor.
- Conversas 'queued' com assignedToId aparecem na Fila com o selo do dono, e 'Só minhas' em Todos passa a incluir bot/queued do atendente. Validar na UI.
- Mais conversas 'bot' paradas até 7 dias na pasta Bot (antes o cron fechava em ~106 min; ~60/dia).
- botNudge30At no futuro é uma armadilha semântica: documentar no mapa e no comentário. A alternativa é uma coluna explícita (migration).
- Depois dos 7 dias o fluxo atual segue (standby/recuperação pode provocar). A política do EF-2 (humano bloquear recuperação) fica fora desta onda.

**Testes:**
- tests/ownership.test.ts: pickOwner('A', 'B', {A,B})='A'; pickOwner('X', 'B', {B})='B' (assignee saiu da equipe); pickOwner(null, null, {A})=null; pickOwner(null, 'C', {A})=null
- tests/wa-silence.test.ts cobre human_last (D3)

**Validação manual:** Com atendente de teste A e contato de teste: A responde e devolve ao bot → a conversa fica na pasta Bot com selo A. Disparar o cron de nudge depois de 90 min: continua em Bot. O cliente pede 'quero falar com alguém' → o bot faz handoff → Fila com dono A, e só A recebe a notificação. Encerrar à mão e o cliente voltar no dia seguinte → reabre em 'bot' com assignedToId A. Apagar o contato/conversa de teste no fim.

**Revisão: ajustar**
- problema: As linhas conferem: returnConversationToBot conversations.ts:539-562 (zera assignedToId e NÃO limpa closeCategory), reaberturas service.ts:297-305/315-321, notifyIncomingMessage :500-503, alertDeliveryFailure :625-631. O veredito 'roteamento, não trava de negócio, sem migration' está correto segundo docs/ai/whatsapp-bot.md L7/L77/L91. Na UI, a Fila (WhatsAppInbox.tsx:634/657) não filtra por assignedToId, e 'Só minhas' em Todos passa a incluir bot/queued do dono, como a spec prevê.
- problema: RISCO ANTI-SPAM: depois dos 7 dias de 'human_last', o fluxo atual leva a conversa ao standby quando closeCategory é null e qualified é null. O standbyBlockReason só enxerga humano nos últimos 7 dias (HUMAN_TOUCH_LOOKBACK_MS) e já não bloqueia. Aos 7 dias a janela de 24h está fechada há muito tempo, então a recuperação sai pelo template recuperacao_triagem_1, que é MARKETING. Hoje a provocação sai em texto livre dentro da janela, porque o fechamento acontece em ~106 min. O efeito é trocar texto na janela por template MARKETING a contato frio, exatamente a causa nº 1 do aviso de spam. Isso precisa ser resolvido nesta onda, não ficar como pergunta aberta.
- problema: A causa raiz do EF-1 do lado do bot (a IA retomar a triagem numa conversa devolvida e desqualificar lead já atendido) continua sem fato no payload. A spec deixa isso como opcional.
- ajuste: Tornar obrigatório: quando 'human_last' ultrapassar os 7 dias, fechar direto com finalizeClose(silentCloseCategory) SEM enterStandby e registrar recordCodeIntervention('recuperacao_bloqueada', 'última fala humana'). Isso aperta o anti-spam em vez de afrouxar e é coerente com o EF-2 (a retomada manual converte mais).
- ajuste: Opcional recomendado, sem regra dos 3 lugares: fato conversationFacts.recentAttendant (true se houve mensagem humana nos últimos 7 dias). Entra em basePayload, no destructuring já existente de conversationFacts e no buildDynamicContext, com deploy do micro antes. A regra de como agir vai para as instruções (D11).
- ajuste: Documentar no mapa e no comentário o uso de botNudge30At no futuro. Hoje só o cron lê o campo (conferido por grep), então o truque é seguro no código.

**Em aberto:**
- Criar coluna lastOwnerId (migration via /migration) para dono persistente além de 7 dias, ou basta derivar das mensagens? A proposta é derivar.
- Depois dos 7 dias de 'human_last', encerrar direto (sem standby/recuperação) já nesta onda, ou esperar a decisão do EF-2?

## PR29 Notificações: por dono/setor, escalada de 48 h ao gestor, LEAD QUALIFICADO em destaque
**Por que agora:** Cerca de 2 mil notificações por dia afogam o 'LEAD QUALIFICADO' (EF-10), e o cron para de alertar em 24 h (LAT-4). Depende do dono do D5.

**Deploy:** O usuário confere quem está no setor 'comercial' e a lista de gestores (manager_dashboard + MANAGER_EMAILS). box.tsx sem classes dark:. queueAlertAudience/sameBrDay puros com teste.

**Medir antes/depois:**
- PR29 (D7): notificações por dia vindas do bot, ~2.000 → meta combinada. Tempo até a leitura das notificações LEAD QUALIFICADO. Conversas na fila há mais de 24 h sem alerta = 0.

### D7 — [CÓDIGO CRM] Notificações por dono/setor com escalada preservada (+48h ao gestor), falha de entrega 1x por contato/dia e LEAD QUALIFICADO em destaque
Onda D_bot_ia · esforço M · depende de D5 · migration: não · micro: não · refs: EF-10, LAT-4

**Impacto:** Equipe: o sino deixa de receber ~1.890 avisos/dia para 15 pessoas; transferência e fila vão primeiro ao dono (ou ao setor comercial), e a equipe inteira só entra na escalada (4h/24h). Gestor: novo aviso no degrau de 48h para lead parado na fila. 'LEAD QUALIFICADO' aparece destacado e no topo do sino.

**Ação do usuário:** Conferir na aba Setores que o setor de slug 'comercial' tem as pessoas que fazem a triagem da Fila (se estiver vazio, cai no fallback de toda a equipe); confirmar a lista de gestores (managers.ts + env MANAGER_EMAILS) que recebe o degrau de 48h.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/sector-tasks.ts` | sectorRecipientIds (novo) / recordSectorTask | 47-90 | export async function sectorRecipientIds(slug: string): Promise<string[]> (membros do setor ou FALLBACK_ROLES); recordSectorTask passa a usá-la |
| `app/_shared/lib/whatsapp/alert-recipients.ts` | waAlertRecipients (novo) | novo | export async function waAlertRecipients(input: { contactId: string; assignedToId?: string | null; audience: 'owner_or_sector' | 'owner_and_sector' | 'team' | 'managers' }): Promise<string[]> — dono via resolveConversationOwner (D5), setor via sectorRecipientIds('comercial'), equipe via whatsappRecipients(), gestores = equipe com isManager(email) |
| `app/_shared/utils/alert-policy.ts` | queueAlertAudience, sameBrDay (novos, puros) | novo | export function queueAlertAudience(stepIdx: number, hasOwner: boolean) → com dono: 1 dono, 2 dono+setor, 3-4 equipe, 5 gestores; sem dono: 1 setor, 2-4 equipe, 5 gestores; export function sameBrDay(a: Date | null, b: Date): boolean (brDayKey) |
| `app/_shared/lib/whatsapp/close-categories.ts` | WA_QUALIFIED_MARK (novo) | após 29 | export const WA_QUALIFIED_MARK = 'LEAD QUALIFICADO ✅' (módulo neutro, importável pelo sino) |
| `app/_shared/lib/whatsapp/bot.ts` | handoffToQueue / handoffNotifyOnly / qualifyToQueue | 522-536, 579, 709-727 | handoff: waAlertRecipients({ audience: 'owner_or_sector' }); qualify: `${WA_QUALIFIED_MARK} — ${reason}` para 'owner_and_sector' |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | QUEUE_ALERT_STEPS_MS / SLA da fila | 39, 945-994 | steps + 48h; por conversa, recipients = waAlertRecipients({ audience: queueAlertAudience(stepIdx, !!conv.assignedToId) }) (hoje L963 = equipe toda em todos os degraus) |
| `app/_shared/lib/whatsapp/service.ts` | alertDeliveryFailure / DELIVERY_ALERT_DEBOUNCE_MS | 543-545, 609-657 | debounce: if (sameBrDay(conversation.deliveryAlertAt, new Date())) return; recipients: dono (human/queued com dono) senão setor (sectorRecipientIds) |
| `app/nova-dash/box.tsx` | NotificationDropdown | 35-150 (map em 103-135) | ordenar não lidas com n.message.includes(WA_QUALIFIED_MARK) no topo e aplicar classe de destaque (ex.: border-l-4 border-emerald-500 bg-emerald-50), sem dark: |

**Passos:**
1. [CÓDIGO CRM] Extrair sectorRecipientIds(slug) de recordSectorTask (reuso, com o mesmo fallback para ADMIN*). O setor da fila do WhatsApp = SECTOR_TASK_ROUTES.wa_lead_qualificado.sectorSlug ('comercial').
2. Criar alert-recipients.ts (lib) + alert-policy.ts (puro/testável) com a política: dono → setor → equipe → gestores.
3. Handoff (bot.ts L522-536): dono ou setor. LEAD QUALIFICADO (L579/709-727): dono + setor, com a marca WA_QUALIFIED_MARK exportada de close-categories.ts.
4. SLA da fila: acrescentar o degrau de 48h (LAT-4) só para gestores. 10 min e 1 h vão para dono/setor (sem dono, a equipe já entra em 1 h); 4 h e 24 h continuam para a equipe inteira. Os alertas que evitam lead parado >24h NÃO diminuem.
5. alertDeliveryFailure: no máximo 1 aviso por contato por dia BRT (sameBrDay/brDayKey no lugar dos 6h que repetiam a 'travada' até 10x por contato), para dono ou setor.
6. box.tsx: destacar e subir LEAD QUALIFICADO entre as não lidas, sem classes dark: (o modo escuro é o Dark Reader).
7. SLA humano (3b) já é dono-primeiro e escala em 120 min: não mexer.

**Regras tocadas:**
- requireTeam/requirePermission lendo o banco (destinatários vêm do banco, não do JWT)
- fuso via date-br.ts (debounce por dia BRT)
- Dark Reader (dark: não funciona)
- comentários explicam o porquê (citar as 24.612 notificações de 16/08 e as ~1.890/dia de 09-24/09)

**Riscos:**
- Setor pequeno ou ausente numa tarde: o 1º aviso não chega à equipe; ela só entra em 1 h (sem dono) ou 4 h (com dono). Hoje a mediana da fila em horário comercial é 15-19 min, a ser monitorada.
- Falha de entrega diferente no mesmo dia não gera 2º aviso (a conversa já foi para a fila no 1º).
- Destaque por texto (includes da marca) é frágil se alguém mudar a frase. Mitigado pela constante única; a alternativa é uma coluna kind em Notification (migration).
- Não mexe em notifyIncomingMessage de fila sem dono (authorId 'whatsapp-client'), que continua para a equipe.

**Testes:**
- tests/alert-policy.test.ts: queueAlertAudience(1,true)='owner_or_sector'; (2,true)='owner_and_sector'; (3,true)='team'; (4,false)='team'; (5,false)='managers'; (1,false)='owner_or_sector' (resolve para setor); sameBrDay(02:59Z de 11/09, 03:01Z de 11/09)=false (virada BRT); sameBrDay(null, now)=false

**Validação manual:** Handoff de teste: só o dono (ou o setor) recebe o sino. Deixar uma conversa de teste na Fila e acompanhar os degraus (queueAlertAt) com o cron de SLA. Qualificar no staging: o sino mostra LEAD QUALIFICADO destacado e no topo. SQL somente leitura: count de notifications com authorId 'whatsapp-bot' por dia BRT antes e depois (meta: de ~1.890/dia para menos de 600). Apagar as notificações/conversas de teste.

**Revisão: ajustar**
- problema: As linhas conferem: sector-tasks.ts:47-90 (fallback para ADMIN*), cron-tasks.ts:39 e :945-994 (L963 manda para a equipe toda em todos os degraus), service.ts:543-545/609-657, bot.ts:522-536/579/709-727, box.tsx:103+ (map).
- problema: O destaque/ordenação por 'não lidas' não funciona: handleToggle chama markAllRead() ao ABRIR o sino (box.tsx) e use-notifications.ts:26 marca tudo como lido localmente logo em seguida. O 'LEAD QUALIFICADO no topo entre as não lidas' perde a posição e o destaque ~200 ms depois de o dropdown abrir.
- problema: 'Gestores = equipe com isManager(email)' usa só a allowlist de e-mail. A Visão do Gestor é concedida pela permissão manager_dashboard (permissions.ts, ROLE_DEFAULTS + overrides no banco) OU por MANAGER_EMAILS (permissions-server.ts:22-25). A regra 'decisão de acesso lê o banco' pede resolver pelo banco.
- problema: depends_on também deveria citar D2/D3, porque handoffToQueue ganha opts e retorno no D2 e o D7 muda a notificação dentro dele.
- ajuste: box.tsx: destacar pela marca, independente de n.read. Ordenar colocando no topo as notificações com n.message.includes(WA_QUALIFIED_MARK) das últimas 24 h (lidas ou não) e depois o resto por data. Sem classes dark:.
- ajuste: waAlertRecipients({ audience: 'managers' }): usuários ADMIN* cuja permissão resolvida manager_dashboard é true (mesma função de resolução de ROLE_DEFAULTS + User.permissions usada em getSessionPermissions), unidos aos de MANAGER_EMAILS. Se ninguém for resolvido, cair em whatsappRecipients().
- ajuste: Manter o resto: sectorRecipientIds extraído do recordSectorTask, queueAlertAudience/sameBrDay puros e testados, e o degrau de 48 h só para gestores.

**Em aberto:**
- Notificações de 'cliente respondeu' na fila sem dono (notifyIncomingMessage, authorId 'whatsapp-client') também devem ir só ao setor? Fora do pedido.

## PR30 Encerramento: tag de desfecho em todo caminho, pasta Churn e KPI Contratados por nome exato
**Por que agora:** Hoje as tags 'Transferidos', 'Perguntas' e 'Sem resposta' ficam vazias no filtro, e o KPI Contratados conta churn. Depende de A2 (patch), B5 (runAfterResponse) e D3 (finalizeClose).

**Deploy:** syncCloseTag/closeCategoryLabel vão para lib/whatsapp/close-tags.ts (fora do 'use server'). planCloseTagSync puro: 'Qualificada' só sai em desqualificação, salvo decisão do chefe. closeConversation continua devolvendo o patch do A2, já com a tag.

**Medir antes/depois:**
- PR30 (D8): closedAt pós-deploy com a tag de desfecho aplicada = 100%. KPI Contratados (bot) deixa de contar churn (comparar com a consulta por nome exato). closeConversation, que hoje leva ~1,25 s no p50, fica mais rápido.

### D8 — [CÓDIGO CRM] Tag de desfecho em todo encerramento, pasta de churn no inbox e KPI Contratados por nome exato
Onda D_bot_ia · esforço M · depende de — · migration: não · micro: não · refs: [MISSED tags] KPI 'Contratados (bot)' da Gestão Estratégica também conta a tag de churn, [MISSED tags] Desfecho automático (bot/cron) não aplica a tag de desfecho, [MISSED tags] Conversas encerradas como 'Contratado e perdido (churn)' não têm pasta

**Impacto:** Chefe/equipe: filtrar por 'Transferidos ao atendente', 'Perguntas / dúvidas', 'Sem resposta' ou pelo motivo de não qualificado passa a trazer também os encerramentos do bot e do cron (hoje 0 e quase 0). Churn ganha pasta própria e deixa de 'sumir' com filtro ou busca. O card 'Contratados (bot)' e a meta do mês passam a bater com o funil (setembro: 182 → 159).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/whatsapp/close-tags.ts` | syncCloseTag, closeCategoryLabel, CLOSE_TAG_COLORS (novo, movido) | novo (move conversations.ts 620-672) | export async function syncCloseTag(conversationId: string, closeCategory: string): Promise<void> (resolve o rótulo sozinho; best-effort); export async function closeCategoryLabel(cat: string): Promise<string> (estático → whatsapp_close_reasons → fallback legível para nq_*) |
| `app/_shared/utils/close-tag-plan.ts` | planCloseTagSync (novo, puro) | novo | export function planCloseTagSync(current: { tagId: string; name: string }[], label: string, knownLabels: Set<string>, protectedNames: Set<string>): { removeTagIds: string[] } — nunca remove 'Qualificada'/'Contratados' |
| `app/_shared/lib/whatsapp/close-categories.ts` | QUALIFIED_TAG_NAME, HIRED_TAG_NAME (novos) | após 29 | export const QUALIFIED_TAG_NAME = 'Qualificada'; export const HIRED_TAG_NAME = 'Contratados' (bot.ts L133 e bot-funnel.ts L35-36 passam a importar) |
| `app/_actions/whatsapp/conversations.ts` | closeConversation / syncCloseTag local | 571-618, 620-672 | remover a cópia local; await syncCloseTag(conversationId, closeCategory) importado da lib |
| `app/_shared/lib/whatsapp/bot.ts` | disqualifyAndClose / resolveAndClose / opt-out | 633-641, 666-678, 1273-1280 | const conv = await db.whatsAppConversation.update(...); await syncCloseTag(conv.id, closeCategory) |
| `app/_shared/lib/whatsapp/cron-tasks.ts` | finalizeClose | 464-485 | se o update fechou (count > 0, D3) e opts.closeCategory → await syncCloseTag(conv.id, opts.closeCategory) |
| `app/_shared/lib/whatsapp/service.ts` | ingestIncomingMessage — opt-out por regex | 439-442 | await syncCloseTag(conversation.id, 'nao_qualificado') |
| `app/_actions/whatsapp/contacts.ts` | blockWhatsAppContact | 186-194 | const r = await db.whatsAppConversation.updateMany(...); if (r.count) { const c = await findUnique({ where: { contactId }, select: { id: true } }); await syncCloseTag(c.id, 'descartado') } |
| `app/_actions/whatsapp/tags.ts` | getContratadosTagCount | 70-86 | await requireTeam() (permissions-server) no lugar de getServerSession; db.whatsAppTag.findUnique({ where: { name: HIRED_TAG_NAME } }); count com tagId único |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | CLOSED_FOLDERS / FOLDER_ACCENT / groups / FOLDER_ITEMS / render com filtro | 389-409, 625-646, 678-683, 1292, 1345-1357 | + { key: 'churn', label: 'Churn', title: CLOSE_CATEGORY_LABELS.contratado_perdido, icon: UserX }; groups.churn = byCategory('contratado_perdido'); groups.outros = encerradas cuja categoria não cai em nenhum grupo (rede de segurança, renderizada com tag/busca ativa) para o contador da L1292 bater com a lista |

**Passos:**
1. [CÓDIGO CRM] Mover syncCloseTag + CLOSE_TAG_COLORS de conversations.ts ('use server') para app/_shared/lib/whatsapp/close-tags.ts (lib). A função passa a resolver o rótulo sozinha (a mesma regra de L583-586).
2. PROTEGER marcos do funil: hoje o rótulo 'Qualificada' está em CLOSE_CATEGORY_LABELS, então syncCloseTag remove a tag 'Qualificada' (marco do bot-funnel.ts) sempre que o desfecho muda para outra categoria. Com o cron chamando isso (ex.: lead qualificado encerrado com closeCategory 'transferido' antigo), o funil perderia qualificados. planCloseTagSync nunca remove QUALIFIED_TAG_NAME nem HIRED_TAG_NAME. Isso também corrige o encerramento manual.
3. Rótulo de nq_* do micro sem linha em whatsapp_close_reasons: fallback legível ('Não qualif. — sem lesão pertinente'), nunca a chave crua.
4. Chamar syncCloseTag depois do update em todos os caminhos de encerramento: disqualifyAndClose, resolveAndClose e opt-out do bot (bot.ts), finalizeClose (cron: sem_resposta, qualificado, transferido antigo, esgotado/opt_out da recuperação), opt-out por regex (service.ts) e bloqueio (contacts.ts). Handoff (queued) NÃO é encerramento e não ganha tag.
5. getContratadosTagCount: nome exato 'Contratados' (mesma constante do funil) e requireTeam() no lugar de só sessão (hoje cliente logado por CPF consegue chamar). Documentar no analytics-custos.md.
6. WhatsAppInbox.tsx: pasta 'Churn' para contratado_perdido e grupo 'Outros' como rede de segurança para categoria desconhecida, para o contador 'N resultados' e a lista renderizada baterem.
7. Extrair a classificação de pasta de conversa encerrada para uma função pura (app/_shared/utils/inbox-folders.ts: closedFolderOf(c)) e usá-la no useMemo de groups, para dar para testar.

**Regras tocadas:**
- 'use server' só exporta funções async (syncCloseTag sai do arquivo de action para a lib)
- captureConversation antes do update que encerra (a tag vem DEPOIS do update)
- requireTeam/requirePermission lendo o banco (getContratadosTagCount)
- Dark Reader (pasta nova sem dark:)

**Riscos:**
- Muda o número do KPI 'Contratados (bot)' (setembro 182 → 159; acumulado 388 → 364). Avisar o chefe antes do deploy.
- Deixar de remover 'Qualificada' no encerramento manual muda um comportamento existente. É correto para o funil, mas conversa reclassificada para não qualificada mantém a tag 'Qualificada' (histórico do marco).
- Cria automaticamente as tags 'Sem resposta (não recuperado)' e as de motivo nq_*. O rótulo 'não recuperado' fica impreciso para o fechamento pelo nudge (sem ciclo de recuperação).
- ~5 queries a mais por encerramento dentro dos loops do cron (orçamento de 240 s; ok).
- Pasta nova no rail ocupa espaço. Conferir layout estreito.

**Testes:**
- tests/close-tag-plan.test.ts: remove rótulo de desfecho antigo; mantém tags manuais; nunca remove 'Qualificada' nem 'Contratados'; não remove o rótulo atual
- tests/inbox-folders.test.ts: closedFolderOf({closeCategory:'contratado_perdido'})='churn'; 'nq_x'→'unqualified'; null+qualified true→'qualified'; 'categoria_nova'→'outros'

**Validação manual:** Staging + número de teste: forçar disqualify (ex.: acidente de 1990) → a conversa encerrada já tem a tag do motivo; deixar outra silenciar até o cron encerrar → tag 'Sem resposta…' ou 'Transferidos ao atendente'; conferir que a 'Qualificada' continua numa conversa qualificada encerrada pelo cron. Filtrar pela tag 'Contratado e perdido (churn)': o contador bate com a lista. Gestão Estratégica: card 'Contratados (bot)' = contratados do funil no mês. Apagar conversas/tags de teste.

**Revisão: ajustar**
- problema: As linhas conferem: syncCloseTag/CLOSE_TAG_COLORS conversations.ts:620-672, closeConversation :571-618, disqualify/resolve/opt-out bot.ts:633-641/666-678/1273-1280, service.ts:439-442, contacts.ts:186-194, getContratadosTagCount tags.ts:70-86 (contains 'contratad' + só sessão), inbox :389-409/:625-646/:678-683/:1292/:1345-1357.
- problema: Achado confirmado: CLOSE_CATEGORY_LABELS.qualificado = 'Qualificada' (close-categories.ts:7) = nome da tag-marco do funil, então syncCloseTag remove 'Qualificada' em qualquer desfecho diferente. Mas 'nunca remover Qualificada' também muda sem pedido o encerramento MANUAL: o atendente que reclassifica um qualificado da IA como nq_* (24% dos casos, EF-5) passa a deixar a tag, e o funil conta mais qualificados. É mudança de métrica que o chefe precisa aprovar.
- problema: blockWhatsAppContact (contacts.ts:186) encerra SEM captureConversation, o que viola a regra 'captureConversation antes do update que encerra'. O item passa por esse caminho e não o corrige nem registra a pendência.
- problema: finalizeClose chamar syncCloseTag só 'se count > 0' depende do D3 (updateMany condicional), mas depends_on está vazio.
- problema: A tag automática no cron usa a closeCategory velha (ex.: 'transferido' de um handoff anterior, que returnConversationToBot não limpa): conversas fechadas por silêncio ganham a tag 'Transferidos ao atendente'. Isso é coerente com o banco, mas convém avisar o chefe.
- ajuste: planCloseTagSync: remover 'Qualificada' só quando a nova categoria é de desqualificação (QUALIFIED_BY_CATEGORY[cat] === false, nao_qualificado, nq_* ou descartado) e mantê-la para transferido, perguntas, sem_resposta, novo_acidente e contratado_perdido. Isso corrige os caminhos automáticos e preserva a intenção do encerramento manual. Se preferirem 'nunca remover', pedir aprovação do chefe e registrar no analytics-custos.md.
- ajuste: Adicionar D3 em depends_on (ou implementar o finalizeClose do D3 no mesmo PR).
- ajuste: blockWhatsAppContact: captureConversation(contactId, 'manual', { closeCategory: 'descartado', qualified: null }) antes do updateMany, se a conversa não estiver fechada. Se decidirem não fazer, registrar como pendência.
- ajuste: Manter: syncCloseTag/closeCategoryLabel na lib (fora do 'use server'), getContratadosTagCount com requireTeam() + nome exato HIRED_TAG_NAME, pasta 'Churn' + grupo 'Outros' via closedFolderOf puro testado.

**Em aberto:**
- Existe linha em whatsapp_close_reasons para as chaves nq_* do enum do micro (nq_sem_lesao_pertinente etc.)? O mapa diz 'não verificado'. Uma consulta somente leitura decide se o fallback de rótulo vai ser usado.
- KPI de contrato líquido (Contratados − churn do período) ou só o nome exato? A proposta é só o nome exato.

### DUR-3 mínimo: Promise.all(convContact, closeReason) + syncCloseTag/log wa_close via runAfterResponse

### blockWhatsAppContact com captureConversation

## PR31 Painel Chatbot: agregação em SQL + 'Origem dos leads' separada
**Por que agora:** Hoje o painel puxa todos os logs wa_% do período para contar (PAINEL-1). Precisa entrar ANTES de D9 e E2a, para que eles editem SQL, e depois do A1.

**Deploy:** Saem do tipo team, intents, emotions e closeCategories. Guard com requireTeam() reaproveitando ctx.user.email. Os números são comparados antes e depois no mesmo período.

**Medir antes/depois:**
- PR31/PR32 (E1/E1b): linhas por chamada (rows do pg_stat_statements) das queries de logs caem de todos os wa_% do período para dezenas. Canto da IA: ~22 mil linhas / 9,5 MB → < 100 linhas. Duração da função nos logs da Vercel. Números idênticos antes e depois.

### E1 — getChatbotAnalytics agregado em SQL + Origem dos leads separada (sem logs)
Onda E_paineis_ux · esforço M · depende de — · migration: não · micro: não · refs: PAINEL-1

**Impacto:** Hoje cada abertura traz cerca de 33 mil logs (15 MB). A aba Chatbot e a Origem dos leads passam a trazer só agregados (centenas de linhas). O tempo deixa de crescer no fim do mês e nos presets 'Ano' e 'Tudo'.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/analytics/get-chatbot-analytics.ts` | getChatbotAnalytics | 123-525 (findMany sem take 166-171; humanMessages 173-177; filtro por número em memória 188-203; laço 377-484; taxas 486-489) | Mesma assinatura (periodDays, numberId, fromISO?, toISO?) e mesmo retorno, sem adOrigins. Por dentro, trocar o findMany pelas consultas $queryRaw agregadas descritas nos passos. O filtro por número passa a ser JOIN whatsapp_contacts ct ON ct.id = l.metadata->>'contactId' AND ct."numberId" = ${numberId} (Prisma.sql/Prisma.empty). |
| `app/_actions/analytics/get-chatbot-analytics.ts` | getLeadOrigins (novo) | extraído de 178-185 e 205-302 | export async function getLeadOrigins(periodDays: 7|30|90, numberId: string|null, fromISO?: string, toISO?: string): Promise<LeadOriginsData>. Faz só newContacts, leadConversations, adOrigins e fetchAdNames, sem tocar em logs. Tipo LeadOriginsData = o antigo ChatbotAnalytics['adOrigins'] + periodDays. |
| `app/_actions/analytics/get-chatbot-analytics.ts` | getChatbotAnalytics / getAdLeadOutcomes / getLeadOrigins (guard) | 129-133, 689-693 | await requireTeam() antes do canViewChatbotDashboard (hoje só getServerSession + allowlist, sem trava de IP). |
| `app/_shared/utils/chatbot-agg.ts (novo)` | aggregateBotRows, normalizeAutoNotifyFailReason | novo (failReasonOf sai de get-chatbot-analytics.ts:353-364) | Funções puras: aggregateBotRows(rows: {outcome,intent,emotion,n,understoodTotal,understoodYes,confSum,confN}[]) → objeto bot (erro não soma intents/emotions, como hoje em 399-428). normalizeAutoNotifyFailReason(reason: string|null, message: string) → 'sem-opt-in'|'cooldown'|'sem-template'|'opt-out'|'meta-rejeitou'|'outro'. |
| `app/nova-dash/workspace/manager/LeadOriginSection.tsx` | LeadOriginSection (efeito de carga) | 79-87 | getChatbotAnalytics(...) → getLeadOrigins(...). O estado data passa a ser LeadOriginsData (os usos de data.adOrigins.* viram data.*). |

**Passos:**
1. Criar app/_shared/utils/chatbot-agg.ts com aggregateBotRows e normalizeAutoNotifyFailReason, e os testes. A regra de negócio fica idêntica à do laço atual.
2. Extrair getLeadOrigins do bloco de contatos (178-185, 205-302), com requireTeam() + allowlist. Ligar o LeadOriginSection.tsx:79-87 nela.
3. Q1 (decisões): SELECT coalesce(metadata->>'outcome','continue'), coalesce(metadata->>'intent','outro'), coalesce(metadata->>'emotion','neutro'), count(*)::int. Mais count(*) FILTER (WHERE jsonb_typeof(metadata->'understood')='boolean'), FILTER (WHERE metadata->>'understood'='true'), sum de confidence com CASE jsonb_typeof='number' e count do mesmo. FROM logs l [JOIN contato] WHERE l.action='wa_bot' AND período, GROUP BY 1,2,3. Usar action = 'wa_bot' (não LIKE) para aproveitar o índice [action, createdAt].
4. Q2 (mediana até qualificar): percentile_cont(0.5) WITHIN GROUP (ORDER BY (metadata->>'durationMs')::float8) com outcome='qualify', jsonb_typeof(durationMs)='number' e > 0.
5. Q3 (avisos automáticos, metadata->>'automated'='true', exceto wa_bot/wa_account): (a) contadores silence, failed e sent via FILTER; (b) byReason com GROUP BY metadata->>'reason', message LIKE '%sem opt-in%', '%intervalo mínimo%' e '%nenhum template%', normalizado no JS; (c) failures ORDER BY createdAt DESC LIMIT 100.
6. Q4 (atividade da equipe): id, createdAt, authorName, action, message, metadata->>'contactName'. Exclui wa_bot, wa_account e automated; ORDER BY createdAt DESC LIMIT 500. O prefixo wa_ vai com LIKE 'wa\_%' ESCAPE '\' (o _ é curinga).
7. Q5 (saúde da conta): wa_account ORDER BY createdAt DESC LIMIT 100, só quando numberId é null. É a semântica atual: log sem contactId some da visão por número.
8. Q6 (equipe, bloco hoje comentado na UI, mas usado pelo E2): GROUP BY authorId, authorName, action para assumed, closed e messages. A 1ª resposta vem de um LATERAL em whatsapp_messages (índice [contactId, createdAt]): primeira mensagem out do mesmo autor, não bot, não interna, até 24 h depois do wa_assign/wa_reopen. Isso substitui o findMany humanMessages (173-177).
9. Manter closeCategories (335-342) como está.
10. Antes de apagar o código antigo, anotar os números da versão atual (mês corrente, todos os números e um número específico) para comparar no preview.

**Regras tocadas:**
- Em tabela grande nada de distinct/findMany sem teto: agregação em $queryRaw
- requireTeam() lendo o banco + allowlist (não só getServerSession)
- Fuso: nenhum corte de dia no SQL; a série diária da Origem continua via brDayKey/brDayKeySeries
- "use server" só exporta funções async: utils puras em app/_shared/utils/, tipos exportados são permitidos
- Multi-número: filtro de log por metadata.contactId → WhatsAppContact.numberId

**Riscos:**
- Um metadata com tipo inesperado (ex.: confidence como string) derruba a query inteira se o cast não estiver protegido por jsonb_typeof.
- A contagem pode divergir da atual em casos de borda (log sem outcome conta como 'continue'; understood em string). Comparar lado a lado antes do deploy.
- LIKE 'wa_%' sem escape também casa ações como 'waX...'. Usar ESCAPE.
- count(*) sem ::int volta como BigInt, e a server action falha ao serializar (erro mascarado em produção).
- O painel Chatbot e a Origem ficam sem dados enquanto o E1c não liga as novas chamadas: entregar E1 e E1c no mesmo PR.

**Testes:**
- tests/chatbot-agg.test.ts: aggregateBotRows mantém resolve, send_flow e continue separados, e erro não entra em intents; understoodRate e avgConfidence batem com o cálculo do laço antigo para o mesmo conjunto de linhas.
- tests/chatbot-agg.test.ts: normalizeAutoNotifyFailReason cobre reason novo e o fallback pela mensagem antiga.

**Validação manual:** Preview da Vercel (banco de produção), Dashboard → aba Chatbot, mês corrente: decisões, erros, entendimento, confiança, mediana até qualificar, avisos automáticos (entregues, falhas e motivos) e atividade (primeiros 10 itens) batem com os números anotados antes. Repetir com um número selecionado. No DevTools > Network, a resposta da action da aba Chatbot cai de MBs para dezenas de KB. Origem dos leads: mesmos placares por plataforma e anúncio.

**Revisão: ajustar**
- problema: Símbolos e linhas conferem: findMany 166-171, humanMessages 173-177, filtro em memória 188-203, laço 377-484, taxas 486-489, failReasonOf 353-364, guards 129-133 e 689-693.
- problema: A UI só lê bot.{doubts,error,totalDecisions,handoff,understoodRate,successRate,avgQualifyMinutes}, autoNotify, activity e accountEvents (ChatbotDashboard.tsx:174-183 e 187-395). Ninguém lê team (bloco comentado em 230-265), intents, emotions nem closeCategories. A Q6 (LATERAL em whatsapp_messages para a 1ª resposta) reimplementa carga morta. O E2 NÃO usa `team`: devoluções e fechamentos sem resposta por atendente saem do getBotEffectiveness. Isso responde à open_question.
- problema: Q4 (atividade) exclui 'automated' sem tratar NULL. logs.metadata é Json? e a maioria dos logs não tem a chave, então `NOT (metadata->>'automated'='true')` dá NULL e descarta a linha. Em JS o código é `meta.automated === true` (só boolean). No SQL: `metadata->'automated' = 'true'::jsonb`, e na exclusão `IS DISTINCT FROM`.
- problema: Q3: os contadores precisam repetir a precedência do laço: silenceAlerts (unansweredCount numérico) primeiro, depois failed (skipped=true), depois sent. Três FILTER independentes contam em dobro.
- problema: Q2: `jsonb_typeof(...)='number' AND (metadata->>'durationMs')::float8 > 0` no WHERE não garante a ordem de avaliação do AND, e o cast pode explodir. O guard tem de ser CASE, igual ao da confidence.
- problema: A validação manual está errada. A resposta da action ao navegador NÃO é de MBs: ela já volta agregada, com activity de até 500 itens, ~100 KB, e continua igual. Os 15 MB são do Neon para a função e da desserialização (PAINEL-1). Medir pela duração da função (log da Vercel) ou por linhas/chamada no pg_stat_statements.
- problema: O risco 'entregar E1 e E1c no mesmo PR' não procede. O E1 já troca o LeadOriginSection para getLeadOrigins, e ChatbotDashboard e carga única seguem chamando getChatbotAnalytics, que continua funcionando.
- problema: Q3 e Q4 com `action LIKE 'wa\_%'` não usam o índice [action, createdAt] (não há text_pattern_ops/collation C nem índice só em createdAt). Seguem com seq scan em logs, mas sem trafegar linhas. Aceitável, só não é 'índice'.
- ajuste: Remover do tipo e do cálculo o que a UI não lê: team (sai a Q6 e o LATERAL), intents, emotions e closeCategories (sai o groupBy 335-342). Se o gestor quiser o bloco de equipe, ele volta pelo E2.
- ajuste: aggregateBotRows passa a receber só (outcome, n, doubts, understood*, conf*). doubts = count FILTER (WHERE metadata->>'intent'='duvida').
- ajuste: Q4: `AND (l.metadata->'automated') IS DISTINCT FROM 'true'::jsonb`. Q3: `WHERE l.metadata->'automated' = 'true'::jsonb`, com silence = FILTER (jsonb_typeof(unansweredCount)='number'), failed = FILTER (NOT silence AND skipped=true) e sent = o resto.
- ajuste: Q2: `percentile_cont(0.5) WITHIN GROUP (ORDER BY d) FROM (SELECT CASE WHEN jsonb_typeof(metadata->'durationMs')='number' THEN (metadata->>'durationMs')::float8 END d ...) WHERE d > 0`.
- ajuste: getLeadOrigins devolve `{ periodDays, adOrigins }` para não reescrever as ~20 leituras `data.adOrigins.*` do LeadOriginSection.
- ajuste: Guard: `const ctx = await requireTeam(); if (!canViewChatbotDashboard(ctx.user.email)) ...`, reaproveitando o e-mail do ctx em vez de um 2º getServerSession.
- ajuste: Validação: comparar números antes e depois (como está) e medir duração da função/linhas por chamada, não o tamanho da resposta no Network.

**Em aberto:**
- Manter o cálculo de 'team' (bloco comentado em ChatbotDashboard.tsx:230-265) ou só no E2? A spec mantém, porque o E2 usa por atendente.

## PR32 Canto da IA: agregação em SQL
**Por que agora:** Esforço P. Hoje cada abertura traz cerca de 22 mil linhas e 9,5 MB de metadata só para somar tokens.

**Deploy:** WHERE jsonb_typeof(metadata->'usage')='object'. Entra antes do D9 (OPERATION_LABELS).

**Medir antes/depois:**
- PR31/PR32 (E1/E1b): linhas por chamada (rows do pg_stat_statements) das queries de logs caem de todos os wa_% do período para dezenas. Canto da IA: ~22 mil linhas / 9,5 MB → < 100 linhas. Duração da função nos logs da Vercel. Números idênticos antes e depois.

### E1b — Canto da IA agregado em SQL
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: PAINEL-7

**Impacto:** O bloco Canto da IA deixa de baixar cerca de 22 mil linhas (9,5 MB de metadata) a cada entrada na aba Chatbot, e os números continuam os mesmos.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/analytics/get-ai-corner.ts` | getAiCorner | 148-217 (query 161-168; montagem 170-195) | SELECT action, metadata->'usage'->>'model' AS model, date_trunc('hour', "createdAt") AS h, count(*)::int AS runs e a soma de inputTokens, outputTokens, cacheReadTokens e cacheWriteTokens (cada uma com CASE jsonb_typeof='number' THEN (…)::numeric ELSE 0). WHERE createdAt >= since AND jsonb_exists(metadata,'usage'), GROUP BY 1,2,3. Mais await requireTeam() antes da allowlist (150-153). |
| `app/_actions/analytics/get-ai-corner.ts` | buildWindow | 97-142 | Passa a receber linhas agrupadas {action, model, hour, runs, tokens…}. O custo é usageCostUSD({model, somas}), e é exato porque o preço é linear em tokens (ai-pricing.ts:69-78). As janelas mês, 30d e hoje comparam o hour com os limites das janelas (meia-noite BRT, sempre em hora cheia). |
| `app/_shared/utils/ai-corner-agg.ts (novo)` | buildAiWindowsFromGroups | novo | Função pura que monta month/last30/today/daily (brDayKey(hour)) a partir dos grupos, para teste. |

**Passos:**
1. Escrever a query agregada por hora UTC. Não agrupar por dia no SQL: o corte de dia fica no brDayKey.
2. Mover buildWindow e a série diária para a função pura; get-ai-corner só busca e chama.
3. Manter OPERATION_LABELS/ICONS e a regra 'sem lista fixa de ações' (jsonb_exists).

**Regras tocadas:**
- Toda IA grava metadata.usage; o Canto soma por jsonb_exists, sem lista de ações
- Preço só em MODEL_PRICING (priceFor/usageCostUSD)
- Fuso: corte de dia por brDayKey (bucket horário no SQL)
- requireTeam() + allowlist

**Riscos:**
- Um token gravado como string não numérica derrubaria o cast: proteger com jsonb_typeof.
- Com o modelo nulo agrupado junto, o 'estimated' continua certo (priceFor(null).known=false).

**Testes:**
- tests/ai-corner-agg.test.ts: para um conjunto de chamadas sintéticas, a soma por grupo de hora/modelo dá o mesmo usd, tokens e runs por janela que a soma chamada a chamada; o limite da janela 'hoje' às 00:00 BRT (03:00Z) cai no dia certo.

**Validação manual:** Aba Chatbot → Canto da IA: mês corrente, 30 dias, hoje, projeção e custo por decisão iguais aos anotados antes do deploy (diferença só de arredondamento na 4ª casa). A resposta da action cai para poucos KB.

**Revisão: ajustar**
- problema: Linhas conferem (148-217; query 161-168; buildWindow 97-142). O preço é linear (ai-pricing.ts:69-78), e as janelas mês, 30d e hoje começam em meia-noite BRT = hora cheia UTC: a agregação por hora é exata.
- problema: Divergência de semântica: hoje `usage: null` no metadata é descartado em JS (linha 174). No SQL, jsonb_exists devolve true e a linha entraria como 1 run com 0 tokens.
- problema: A validação 'a resposta da action cai para poucos KB' está errada: getAiCorner já devolve o objeto agregado. O ganho é Neon→função (22 mil linhas / 9,5 MB), medido por duração ou linhas no pg_stat_statements.
- problema: Ordem de grandeza: hora × ação × modelo em ~31 dias dá alguns milhares de grupos, não 'centenas'. Ainda assim fica muito abaixo das 22 mil linhas com metadata inteiro.
- ajuste: WHERE `jsonb_typeof(metadata->'usage') = 'object'` no lugar de só jsonb_exists: mantém a regra 'sem lista de ações' e a semântica atual.
- ajuste: Trocar a validação por duração da função e linhas/chamada, mantendo a comparação dos valores antes e depois.

## PR33 Gestão Estratégica: sem chamadas duplicadas
**Por que agora:** Hoje a mesma análise roda 2 vezes ao abrir e 3 ao trocar o período, e o loadCohort 2 a 3 vezes. Depende do E1 e do E4b (chave 'wa-number-options').

**Deploy:** O lápis da meta fica escondido sem perms.manager_dashboard. onGoalChange mantém rollback + toast.

### E1c — Fim das chamadas duplicadas na Gestão Estratégica (carga única sem chatbot, coorte única)
Onda E_paineis_ux · esforço M · depende de E1 · migration: não · micro: não · refs: PAINEL-2, PAINEL-3

**Impacto:** Abrir o dashboard deixa de rodar a análise pesada 2 vezes (3 ao trocar o período), e a coorte do funil roda 1 vez em vez de 2 ou 3. O spinner da página não espera mais o ramo do chatbot, que só carrega quando o gestor abre a aba Chatbot.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/analytics/get-strategic-dashboard.ts` | getStrategicDashboardData / StrategicDashboardData | 54-65, 67-112 (ramo chatbot 86-92) | Remover o ramo getChatbotAnalytics(7, null, …). Retornar { kanban, kanbanFlow, canViewChatbot: boolean, numberOptions: WaNumberOption[] }; listWaNumberOptions passa a vir daqui para toda a equipe. |
| `app/_actions/analytics/bot-funnel.ts` | getBotFunnelAndLeads (novo) + helper interno computeFunnel | 192-309 (getBotFunnel, loadCohort em 221), 320-333 (getBotKanbanLeads) | export async function getBotFunnelAndLeads(numberId: string|null, fromISO: string, toISO: string): Promise<{ funnel: BotFunnelData; leads: BotKanbanLead[] }>, com requireTeam() e loadCohort UMA vez. O corpo de getBotFunnel vira computeFunnel(cohort, …), não exportado. getBotFunnel/getBotKanbanLeads ficam como wrappers ou saem, se não tiverem outro chamador. |
| `app/nova-dash/StrategicDashboard.tsx` | StrategicDashboard | 42-44 (listWaNumberOptions), 48-55 (getBotKanbanLeads), 57-79 (carga única), 145-148, 164, 180-189 | Tirar as chamadas próprias de números e leads. Uma chamada a getBotFunnelAndLeads por (numberId, range); passar funnel ao BotFunnelSection e leads ao MiniKanban. ChatbotPanel sem initialAnalytics/numberOptions. |
| `app/nova-dash/workspace/manager/BotFunnelSection.tsx` | BotFunnelSection | 27-47 | Props { data: BotFunnelData|null; loading: boolean; error: boolean; numberId } no lugar do fetch próprio (efeito 39-47). A edição da meta continua igual. |
| `app/nova-dash/workspace/chatbot/ChatbotPanel.tsx + workspace/manager/ChatbotDashboard.tsx` | ChatbotPanel, ChatbotDashboard | ChatbotPanel 19-62; ChatbotDashboard 113-148 | Remover initialAnalytics/initialData/skipFirstFetch: a aba busca getChatbotAnalytics ao montar, ou seja, só quando o gestor abre a aba Chatbot. |

**Passos:**
1. Refatorar bot-funnel.ts: extrair computeFunnel e criar getBotFunnelAndLeads com um único loadCohort. As queries do mês e do ano (222-265) continuam no mesmo Promise.all.
2. Enxugar getStrategicDashboardData: sem chatbot, com canViewChatbot e numberOptions (a mudança de tipos casa com o E1g).
3. StrategicDashboard: 3 chamadas no total (carga única, funil+leads, e getLeadOrigins só se canViewChatbot), em vez de 5 ou 6 enfileiradas.
4. BotFunnelSection vira apresentacional.
5. ChatbotPanel/ChatbotDashboard sem initialData. Isso também elimina o bug do PAINEL-5 (E1e).

**Regras tocadas:**
- KPI novo do funil nasce de loadCohort (a mesma coorte alimenta Funil e Fluxo de Eventos Rápidos)
- requireTeam() nas actions de analytics
- "use server": computeFunnel não é exportado

**Riscos:**
- As server actions do Next 14.2 continuam em fila: a ordem de disparo define o que aparece primeiro. Disparar a carga única e o funil antes da Origem.
- BotFunnelData e BotKanbanLead continuam carregando nome e telefone da coorte para toda a equipe (armadilha já no mapa). Não piorar.

**Testes:**
- Sem teste unitário (actions com banco). Validação por tsc + manual.

**Validação manual:** DevTools > Network ao abrir Dashboard: no máximo 3 requisições com header Next-Action (carga única, funil+leads, origem). Nenhuma de getChatbotAnalytics antes de clicar na aba Chatbot. Soma das barras do Funil = colunas do Fluxo de Eventos Rápidos no mesmo período e número. Trocar o número: 1 chamada de funil+leads.

**Revisão: ajustar**
- problema: Linhas conferem: StrategicDashboard 42-44, 48-55, 57-79, 145-148, 164, 180-189; BotFunnelSection 27-47; bot-funnel 192-309 e 320-333. getBotFunnel e getBotKanbanLeads só têm esses chamadores, então os wrappers podem sair.
- problema: BotFunnelSection apresentacional quebra a edição da meta: saveGoal (49-60) faz setData local otimista e reverte no catch. Com `data` vindo por prop, 'continua igual' não compila. É preciso callback/mutate no pai.
- problema: Levar listWaNumberOptions para a carga única atrasa o seletor de número do cabeçalho até a carga pesada terminar (hoje ele aparece sozinho).
- problema: A validação 'no máximo 3 requisições Next-Action' conflita com os polls do cabeçalho da page (countWhatsAppUnread a cada 30 s, total a cada 60 s etc.), que também são server actions na mesma fila.
- problema: 'Soma das barras = Fluxo' pode divergir em 'Todos os números' por diferença pré-existente: hiredLegacy conta Botconversa por updatedAt (bot-funnel.ts:263-265) e o MiniKanban recebe o legado por createdAt (fetchBotconversaAll). Com ~4 linhas/mês o efeito é desprezível, mas o teste manual pode acusar.
- ajuste: BotFunnelSection recebe `onGoalChange(n)` (ou o `mutate` do SWR do E1d) e mantém o rollback + toast no erro. Aproveitar para esconder o lápis sem `usePermissions().perms.manager_dashboard` (armadilha já no mapa).
- ajuste: Números: `useSWR('wa-number-options', listWaNumberOptions)`, a mesma chave do E4b, com cache compartilhado com o inbox. canViewChatbot continua vindo da carga única.
- ajuste: Validação: filtrar no Network pelo id da action (ou contar só o que dispara ao abrir) em vez de 'no máximo 3 Next-Action'.

**Em aberto:**
- Vale mover as leituras do dashboard para GET em route handler (fetch paralelo de verdade, fora da fila de actions)? Fica fora desta spec; é a alternativa do PAINEL-3.

## PR34 Gestão: ramos mortos fora e loadCohort sem ILIKE
**Por que agora:** Os dois são de esforço P e dependem do E1c: tiram 5 de 8 ramos da carga única e o seq scan com ILIKE em whatsapp_messages.

**Deploy:** `= ANY(${ids}::text[])`. Botconversa filtrado no servidor. Registrar que 'Lista docs' pode subir alguns casos (fica mais correto).

### E1g — Remover ramos mortos da carga única e filtrar o legado Botconversa no servidor
Onda E_paineis_ux · esforço P · depende de E1c · migration: não · micro: não · refs: PAINEL-9

**Impacto:** A carga do dashboard fica menor e mais rápida, principalmente em 'Ano' e 'Tudo', que hoje mandam cerca de 1,3 MB do Botconversa ao navegador sem usar.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/analytics/get-strategic-dashboard.ts` | getStrategicDashboardData, StrategicCounts, MonthlyRow | 21-37, 54-65, 77-93 | Tirar fetchEventsCount, fetchEventsByMonth (usa range.from.getFullYear() em UTC), getContratadosTagCount, getMonthGoal e getFunnelAnalytics. kanban = db.botconversa.findMany({ where: { evento: 'contratado', createdAt: range }, select: {id,nome,telefone,evento,createdAt,updatedAt} }). |
| `app/nova-dash/StrategicDashboard.tsx` | MiniKanban | 164 | Passar kanban direto (o filtro evento==='contratado' agora é do servidor). |
| `app/_actions/analytics/get-chatbot-analytics.ts` | getLeadFunnel (opcional) | 527-661 | Remover: sem uso na UI (o mapa confirma), puxa logs wa_bot e wa_flow sem teto e é mais um export 'use server' exposto. |

**Passos:**
1. Aplicar a receita 'Enxugar a carga do dashboard' do docs/ai/analytics-custos.md.
2. Manter as funções de app/_shared/lib/db/botconversa.ts, porque /api/botconversa/counts e /monthly ainda usam.

**Regras tocadas:**
- Fuso: sai o getFullYear() no servidor
- Dado pessoal: payload menor, só os contratados do legado

**Riscos:**
- Algum consumidor externo dos tipos removidos quebra no tsc; o grep de hoje só achou o próprio arquivo e o StrategicDashboard.

**Testes:**
- npx tsc --noEmit (os tipos removidos não podem ter outro consumidor).

**Validação manual:** Fluxo de Eventos Rápidos com a coluna Contratado igual à de antes (mesmo período). Preset 'Tudo': a resposta da carga única cai de cerca de 1,3 MB para poucos KB.

**Revisão: ajustar**
- problema: Linhas conferem (21-37, 54-65, 77-93). Os tipos removidos não têm outro consumidor (grep). getFunnelAnalytics, getMonthGoal e setMonthGoal ficam sem nenhum chamador no app e seguem como endpoints 'use server' expostos (mesmo argumento usado para tirar getLeadFunnel).
- problema: fetchBotconversaAll ordena por createdAt desc. A troca por findMany precisa manter orderBy e o map para ISO (98-105).
- problema: O parâmetro monthKey e currentMonthKey() (StrategicDashboard.tsx:22-25, 64) ficam mortos.
- problema: Em 'Tudo' ainda vão ~702 linhas 'contratado' (~100 KB), não 'poucos KB'.
- ajuste: `db.botconversa.findMany({ where: { evento: 'contratado', createdAt: { gte, lte } }, orderBy: { createdAt: 'desc' }, select: {id,nome,telefone,evento,createdAt,updatedAt} })`.
- ajuste: Tirar monthKey da assinatura e currentMonthKey do cliente.
- ajuste: Opcional: apagar getFunnelAnalytics, getMonthGoal e setMonthGoal (Goal é legado, segundo o mapa) ou registrar a pendência.

### E1h — loadCohort: lista de documentos sem ILIKE em seq scan
Onda E_paineis_ux · esforço P · depende de E1c · migration: não · micro: não · refs: PAINEL-8

**Impacto:** O funil e o Fluxo de Eventos Rápidos ficam de 0,1 a 0,5 s mais rápidos por carga.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/analytics/bot-funnel.ts` | loadCohort | 113-186 (docsRows 142-152) | Buscar convs primeiro e depois $queryRaw: SELECT DISTINCT m."contactId" FROM whatsapp_messages m WHERE m."contactId" = ANY(${contactIds}) AND m.direction='out' AND m.internal=false AND m."createdAt" >= ${from} AND m.body ILIKE ${'%' + DOCS_FINGERPRINT + '%'}. O índice [contactId, createdAt] restringe às mensagens da coorte; byNumber fica implícito no conjunto de contatos. |

**Passos:**
1. Sequenciar: convs → docs (com a coorte). numbers continua em paralelo com convs.
2. Com a coorte vazia, pular a query.

**Regras tocadas:**
- Tabela grande: SQL com ANY/DISTINCT, sem distinct do Prisma

**Riscos:**
- Em 'Tudo' a coorte é quase a base inteira e o planner volta ao seq scan (igual a hoje, sem piora).
- DOCS_FINGERPRINT continua acoplado ao texto do bot (comentário 31-33).

**Testes:**
- Manual (query com banco).

**Validação manual:** Mês corrente: o KPI 'Lista docs' e a coluna do Fluxo iguais aos de antes. EXPLAIN no preview (opcional, pelo /validar) mostra Index/Bitmap Scan em whatsapp_messages.

**Revisão: ok**
- problema: loadCohort 113-186 e docsRows 142-152 conferem. A mudança preserva a semântica (createdAt >= from) e usa o índice [contactId, createdAt].
- problema: Diferença pequena e esperada com número selecionado: contato legado adotado por outra linha (outbound.ts:91-95) tem mensagens antigas com numberId NULL. Hoje o filtro por message.numberId as perde; por contactId elas entram.
- problema: depends_on E1c não é necessário: o item é independente.
- ajuste: Anotar na validação que o 'Lista docs' pode subir alguns casos com número selecionado (mais correto).
- ajuste: `= ANY(${ids}::text[])` explícito para o Prisma tipar o array.

**Em aberto:**
- Gravar um marco (ex.: coluna docsListSentAt na conversa quando a lista sai) para eliminar o ILIKE de vez? Exige migration e tocar no envio do bot e dos fluxos; ficou fora.

## PR35 Gestão: abas controladas, overlay na troca de período e cache curto
**Por que agora:** Hoje trocar o período devolve o gestor para a aba Analytics e refaz tudo (PAINEL-4). Depende do E1c.

**Deploy:** Overlay = data && isLoading (nunca isValidating). As chaves SWR incluem period/numberId/from/to.

### E1d — Tabs controlada, overlay na troca de período e cache curto (SWR) nos painéis
Onda E_paineis_ux · esforço M · depende de E1c · migration: não · micro: não · refs: PAINEL-4

**Impacto:** Quem está na aba Chatbot e troca o período continua nela, vendo os dados antigos com um véu de carregamento em vez da tela em branco. Sair para o Kanban e voltar mostra o dashboard na hora (cache), revalidando em segundo plano.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/StrategicDashboard.tsx` | StrategicDashboard | 115-135 (return antecipado 'tudo ou nada'), 150 (<Tabs defaultValue='analytics'>) | Com data presente, renderizar a árvore sempre; loading vira overlay absoluto sobre o conteúdo. <Tabs value={tab} onValueChange={setTab}>, com tab restaurada/gravada em sessionStorage 'strategic-tab' via useEffect com try/catch. Se tab==='chatbot' e !canViewChatbot, cai em 'analytics'. |
| `app/nova-dash/StrategicDashboard.tsx, workspace/manager/LeadOriginSection.tsx, ChatbotDashboard.tsx, AiCorner.tsx` | efeitos de busca | StrategicDashboard 57-79; LeadOriginSection 79-87; ChatbotDashboard 136-148; AiCorner 122-129 | useSWR com chaves em string/ISO (ex.: ['strategic', fromISO, toISO], ['lead-origins', period, numberId, from, to], ['chatbot-analytics', …], 'ai-corner'), { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 60_000 }. |

**Passos:**
1. Trocar useState+useEffect por useSWR nos 4 pontos; isLoading && !data = spinner inicial; isValidating com data = overlay.
2. Controlar as Tabs e persistir a aba em sessionStorage.
3. Overlay sem classes dark: (o Dark Reader não as aplica); usar cor neutra com opacidade.

**Regras tocadas:**
- UI: modo escuro é o Dark Reader, dark: não funciona
- sessionStorage/localStorage sempre com try/catch

**Riscos:**
- Chave SWR com objeto Date recriado a cada render gera refetch em loop: usar strings ISO.
- keepPreviousData mostra os números do período anterior sob o véu; o overlay precisa ser claro para ninguém ler número velho como novo.

**Testes:**
- Sem lógica pura nova relevante; validação manual.

**Validação manual:** Na aba Chatbot, trocar o período: continua na aba Chatbot, com véu e sem piscar branco. Ir ao Kanban e voltar em Espaço de Trabalho → Dashboard: os dados aparecem na hora. F5: volta na última aba escolhida (sessionStorage).

**Revisão: ajustar**
- problema: Return antecipado 115-135 e `<Tabs defaultValue>` em 150 conferem.
- problema: 'isValidating com data = overlay' mostra o véu em TODA revalidação de fundo: remontar depois de 60 s, revalidateOnMount etc. O que o gestor precisa ver é 'dados de outra chave' (keepPreviousData).
- problema: A lista de SWR deixa de fora getBotFunnelAndLeads (E1c). É a chamada mais pesada (loadCohort) e ficaria sem cache na volta ao dashboard, contrariando o 'aparece na hora'.
- problema: ChatbotDashboard e LeadOriginSection têm botões 7/30/90 próprios: a chave precisa do period, além de from/to.
- problema: PAINEL-4 também cita que, ao voltar ao Espaço de Trabalho, o Workspace reabre em 'meu-espaco' (Workspace.tsx useState('meu-espaco')). A validação 'Espaço de Trabalho → Dashboard' já exige clicar de novo.
- ajuste: Overlay = `data && isLoading` (com keepPreviousData, isLoading fica true enquanto a chave nova não tem dado) ou comparar a chave da última resposta com a atual. Nunca `isValidating`.
- ajuste: Incluir `['bot-funnel', numberId, from, to]` no SWR.
- ajuste: Chaves com o period: `['lead-origins', period, numberId, from, to]` e `['chatbot-analytics', period, numberId, from, to]`.
- ajuste: Opcional (barato): gravar a seção do Workspace em sessionStorage, para voltar ao Dashboard sem clique.

## PR36 Bot/IA: telemetria real (latência, descartes, custo da ficha e da transcrição)
**Por que agora:** Hoje não existe métrica de latência (o durationMs é a idade da conversa), e a transcrição e parte da ficha não gravam usage (regra inviolável). É a base para medir D10, D11 e E2a.

**Deploy:** MICRO ANTES: transcribeAudio → { text, usage }, /transcribe devolve usage, e o CRM trata usage como opcional. Nova action wa_bot_discarded (LogAction, PURGEABLE, OPERATION_LABELS). MODEL_PRICING 'gemini-2.5-flash-audio' fica antes de 'gemini-2.5-flash'. Edita o SQL do E1. O B4 não duplica nada disso.

**Medir antes/depois:**
- PR36 (D9): wa_bot com botLatencyMs = 100%. wa_transcribe e wa_ficha_ai com metadata.usage = 100% (hoje 0 de 2.873 com duração). O custo da transcrição aparece no Canto da IA.

### D9 — [CÓDIGO CRM + CÓDIGO MICRO] Telemetria da IA: latência real, desfecho efetivo, chamadas descartadas, idade da conversa, custo da ficha e da transcrição
Onda D_bot_ia · esforço M · depende de D2 · migration: não · micro: **sim (antes do CRM)** · refs: EF-7, DUR-5, BOT-7, FE-12, [MISSED bot_latencia] Ficha IA roda a cada mensagem, sem debounce, e só grava o usage quando preenche algum campo, [MISSED thread] Transcrição de áudio por IA não grava metadata.usage

**Impacto:** Chefe/gestor: passa a existir número de 'quanto a IA demora' (botLatencyMs) e de transferência real (effective queued), em vez de successRate 100% e transferências escondidas como 'continue'. O Canto da IA/Custos passa a somar a ficha que não achou dado novo (até ~8 mil chamadas invisíveis em 14 dias), as chamadas descartadas por corrida (~60/dia) e a transcrição de áudio (913 logs/30d sem usage). A ficha deixa de rodar N vezes por rajada.

**Ação do usuário:** Deploy do microserviço D:\Chatbot_whatsapp no Railway antes do deploy do CRM na Vercel (a mudança do /transcribe e do decide).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — início, callBrain, envio | 882-896, 1164-1207, 738-809 | const startedAt = Date.now(); brainMs acumulado em volta de cada callBrain; sendBotReply(...) : Promise<boolean> (true só se enviou); firstSentAt no 1º envio |
| `app/_shared/lib/whatsapp/bot.ts` | log wa_bot | 1429-1470 | metadata + botLatencyMs (firstSentAt − startedAt), sinceInboundMs (firstSentAt − message.createdAt), brainMs, effective: { status: 'bot'|'queued'|'closed'|'signature'; reason?: string }, silent, facts (docsReceived, registeredClient); durationMs → conversationAgeMs = Date.now() − conversation.createdAt (sem a query extra L1435-1437) |
| `app/_shared/lib/whatsapp/bot.ts` | returns de corrida/status/bloco interrompido (D2) e catch | 1236-1239, novo após 1239, 1317-1322, 1494-1504 | logWhatsAppEvent({ action: 'wa_bot', message: 'IA: resposta descartada — …', metadata: { outcome: 'discarded_race' | 'discarded_status', usage: decision.usage, brainMs, sentBlocks } }); catch com botLatencyMs e effective |
| `app/_shared/lib/whatsapp/bot.ts` | log de transcrição feita no /reply | após 1227 | se decision.transcribeUsage?.length → logWhatsAppEvent({ action: 'wa_transcribe', authorId: 'whatsapp-bot', metadata: { usage, bySystem: true } }) (NÃO somar no usage do Claude: modelo diferente) |
| `app/_actions/analytics/get-chatbot-analytics.ts` | laço de logs wa_bot / atividade / mediana de qualificação | 15, 399-428, 452-463, 490-500 | if (outcome.startsWith('discarded_')) continue (não conta decisão); const ageMs = meta.conversationAgeMs ?? meta.durationMs; atividade ignora meta.noop === true || meta.bySystem === true |
| `app/_actions/analytics/get-ai-corner.ts` | OPERATION_LABELS / OPERATION_ICONS | 26-43 | + wa_transcribe: 'Transcrição de áudio' / ícone 'mic' |
| `app/_shared/lib/whatsapp/ficha-ai.ts` | autoFillClientInfo | 128-145, 229-272 | autoFillClientInfo(contactId: string, opts?: { afterMessage?: { id: string; createdAt: string } }): se afterMessage e existe inbound mais nova → return { filled: [], reason: 'lote em andamento' } sem IA; usage calculado logo após messages.create; recusa e 'nenhum dado novo' gravam wa_ficha_ai com { usage, filled: [], noop: true } |
| `app/api/whatsapp/webhook/route.ts` | POST — fichaCandidates | 139-162 | fichaCandidates: Map<string, IngestResult> (última msg do contato); para contatos fora de botCandidates, await sleep(BURST_DEBOUNCE_MS) uma vez; autoFillClientInfo(contactId, { afterMessage: { id: r.message.id, createdAt: r.message.createdAt } }) |
| `app/_shared/lib/whatsapp/assist.ts` | transcribeMessageAudio | 263-287 | callAssist<{ transcript: string; usage?: object | null }>('/transcribe', …); logWhatsAppEvent(... metadata: { usage: out.usage ?? undefined }) |
| `D:\Chatbot_whatsapp\bot.js` | transcribeAudioOnce / transcribeAudio / decide | 1320-1337, 1339-1361, 1581-1597, 2294 | transcribeAudioOnce → { text, usage: { model, inputTokens: usageMetadata.promptTokenCount, outputTokens: candidatesTokenCount + (thoughtsTokenCount ?? 0), cacheReadTokens: cachedContentTokenCount ?? 0, cacheWriteTokens: 0 } }; decide devolve transcribeUsage: [...]; confirmContractReply adapta |
| `D:\Chatbot_whatsapp\index.js` | POST /transcribe | 186-203 | res.json({ transcript, usage }) |

**Passos:**
1. [CÓDIGO CRM] bot.ts: medir startedAt (início do handleIncomingWhatsApp, antes do debounce), brainMs (soma das chamadas ao cérebro) e firstSentAt (sendBotReply passa a devolver boolean; os chamadores atuais ignoram o retorno). Gravar botLatencyMs e sinceInboundMs no wa_bot. É a métrica que DUR-5 diz não existir.
2. Gravar o desfecho efetivo: variável `effective` atribuída em cada ramo do switch (send_flow com falha → queued; qualify → queued ou 'signature'; handoff/continue vazio → queued com o motivo; disqualify/resolve → closed) e no catch. Gravar também silent (mede o falso positivo de órfã do D3) e os conversationFacts (D4).
3. Renomear durationMs → conversationAgeMs (é idade da conversa, não latência) usando conversation.createdAt, que já vem do select (remove a query extra). No analytics, ler conversationAgeMs ?? durationMs (logs antigos ficam válidos por 180 dias).
4. Logar as chamadas descartadas (corrida L1236, status do D2, bloco interrompido do D2) como wa_bot com outcome discarded_race/discarded_status e o usage. O analytics pula esses outcomes na contagem de decisões. Não é action nova do cérebro, então não cai na regra dos 3 lugares.
5. Ficha IA: calcular usage logo depois do messages.create e logar também na recusa e em 'nenhum dado novo' (noop: true). Debounce: o webhook passa a última mensagem do contato; a ficha desiste se já existe inbound mais nova (a invocação da mensagem nova roda). Para conversa fora do modo bot, o webhook espera BURST_DEBOUNCE_MS (exportar a constante de bot.ts ou movê-la para um módulo neutro; o D1 que criaria bot-timing.ts foi retirado) uma vez antes do laço da ficha.
6. [CÓDIGO MICRO] bot.js: transcribeAudioOnce devolve { text, usage } a partir de response.usageMetadata do Gemini (contando thoughtsTokenCount como saída); transcribeAudio propaga; decide junta transcribeUsage; confirmContractReply adapta a nova forma. index.js /transcribe devolve usage.
7. [CÓDIGO CRM] assist.ts grava metadata.usage no wa_transcribe manual. bot.ts grava um wa_transcribe (authorId 'whatsapp-bot', bySystem: true) com o usage do Gemini quando o /reply transcreveu. O Canto da IA ganha o rótulo 'Transcrição de áudio'. O analytics tira bySystem/noop do feed de atividade da equipe.
8. Ordem de deploy: micro (Railway) primeiro. O CRM trata usage opcional, então um micro antigo não quebra nada.
9. (Extra, mesma regra do metadata.usage, pode ficar para depois) /farewell, /followup-decision e /recovery-message também não devolvem usage (bot.js 1907-2118) e o cron (cron-tasks.ts 350-595) não loga. Devolver usage no micro e logar com bySystem.

**Regras tocadas:**
- metadata.usage em toda IA (preço só em MODEL_PRICING)
- deploy do micro antes do CRM
- state/closeCategory/action novo = 3 lugares (não se aplica: outcome de log não é action do cérebro)
- comentários explicam o porquê

**Riscos:**
- Mais linhas em logs (~500/dia de noop da ficha + ~60/dia de descartadas + transcrições), todas em PURGEABLE_LOG_ACTIONS (retenção de 180 dias).
- get-ai-corner.ts:204 usa runs de wa_bot como 'decisões': as descartadas entram na conta (custo por decisão cai um pouco). Filtrar outcome discarded_* ali ou aceitar.
- Gemini cobra áudio de entrada mais caro que texto, mas MODEL_PRICING tem um preço só por modelo, então o custo da transcrição fica subestimado. Avaliar uma chave própria (ex.: 'gemini-2.5-flash-audio').
- A espera de 8 s da ficha em conversa humana/fila alonga o webhook (maxDuration 120; ok) e atrasa o preenchimento em 8 s.
- AIReview.tsx e brain.ts têm outro durationMs (stats do snapshot): não renomear esses.

**Testes:**
- tests/bot-telemetry.test.ts (helpers puros em app/_shared/utils/bot-telemetry.ts): conversationAgeOf({ conversationAgeMs: 5 })=5; ({ durationMs: 7 })=7; ({})=null; isDiscardedOutcome('discarded_race')=true, ('continue')=false; sumUsageByModel junta por modelo sem misturar Claude e Gemini

**Validação manual:** Depois do deploy (número de teste): SQL somente leitura em logs action='wa_bot' dos últimos 30 min: metadata com botLatencyMs, brainMs, effective, conversationAgeMs nas terminais. Mandar 3 mensagens picadas: 1 wa_bot normal e, se a corrida acontecer, 1 discarded_race com usage; wa_ficha_ai só 1 por rajada, e com usage mesmo sem campo novo. Transcrever um áudio pelo botão: wa_transcribe com usage e 'Transcrição de áudio' no Canto da IA. Aba Chatbot: a mediana de 'tempo até qualificar' não muda (leitura retrocompatível).

**Revisão: ajustar**
- problema: As linhas conferem: log wa_bot bot.ts:1429-1470 (query extra :1435-1437; conversation.createdAt já está no select de :930), return da corrida :1236-1238, catch :1494-1504, ficha-ai.ts:128-145/229-272 (usage só em :319-338), webhook route.ts:139-162 (fichaCandidates é Set), assist.ts:263-287 (wa_transcribe sem usage), get-chatbot-analytics.ts:399-428/490, get-ai-corner.ts:26-43/204, bot.js 1320-1361/1586/2294, index.js:186-203. /farewell, /followup-decision e /recovery-message de fato não devolvem usage (usageFrom só aparece em 1711/1863/1898/2237/2341/2436/2551).
- problema: Gravar descartes como wa_bot com outcome discarded_* obriga a mexer em todo consumidor de wa_bot: get-chatbot-analytics.ts:399 (contagem de decisões, intents, emoções e understood), get-ai-corner.ts:204 (custo por decisão) e qualquer consumidor futuro. Uma action própria é mais simples e não contamina nenhuma métrica.
- problema: get-chatbot-analytics: o ramo 'else' (:444+) põe o log no feed de atividade E em teamStats via attendantOf(). Os noop da ficha e os wa_transcribe bySystem (authorId 'whatsapp-bot') criariam um 'atendente' 🤖 com centenas de ações. Pular só o feed não basta.
- problema: index.js /transcribe (:196-197) faz `if (!transcript) throw`. Se transcribeAudio passar a devolver { text, usage }, a rota e o laço do decide (:1586) quebram se não forem adaptados juntos.
- problema: callClaudeStructured (bot.js:113-145) repete a chamada em JSON inválido ou vazamento e devolve só o response FINAL: o usage da 1ª tentativa se perde. É o mesmo tipo de gasto invisível que o item quer eliminar.
- problema: Transcrição do Gemini: priceFor usa startsWith na ordem da tabela (ai-pricing.ts). Uma chave 'gemini-2.5-flash-audio' precisa vir ANTES de 'gemini-2.5-flash' no objeto, senão casa com a de texto.
- ajuste: Usar uma action nova 'wa_bot_discarded' (metadata { outcome: 'discarded_race'|'discarded_status', usage, brainMs, sentBlocks }) em vez de wa_bot. Acrescentar ao union LogAction (log.ts:31-35), a PURGEABLE_LOG_ACTIONS (retention.ts:36-42) e a OPERATION_LABELS/ICONS ('Bot — respostas descartadas'). Assim nenhum consumidor de wa_bot muda. O critério de órfã do D3 continua olhando só wa_bot.
- ajuste: get-chatbot-analytics: logo depois do bloco wa_account, `if (meta.noop === true || meta.bySystem === true) continue;` (fora do feed E do teamStats). Ler a idade como meta.conversationAgeMs ?? meta.durationMs.
- ajuste: Micro: transcribeAudio devolve { text, usage }. Adaptar no mesmo commit index.js /transcribe (res.json({ transcript: out.text, usage: out.usage })), o laço do decide e confirmContractReply:2294. O CRM trata usage como opcional (micro antigo não quebra).
- ajuste: Micro: callClaudeStructured acumula o usage de todas as tentativas (somar input/output/cache) e devolve o total junto do response final.
- ajuste: Registrar a transcrição com model 'gemini-2.5-flash-audio' (entrada de áudio é mais cara), com a chave inserida antes de 'gemini-2.5-flash' em MODEL_PRICING.
- ajuste: Manter o resto: botLatencyMs/sinceInboundMs/brainMs/effective/silent/facts no wa_bot, conversationAgeMs sem a query extra, usage da ficha em todo retorno pós-create, debounce da ficha por afterMessage.

**Em aberto:**
- Adicionar já no painel do chatbot os KPIs do EF-7 (resolve separado, % transferência efetiva, devoluções ao bot) ou deixar para a onda de analytics? A proposta é gravar agora e mostrar na onda de analytics.
- Incluir já o usage de /farewell, /followup-decision e /recovery-message (extra)?

### faltou-D: callClaudeStructured acumula o usage de todas as tentativas no micro

## PR37 Bot: prazo e aborto no micro, áudios em paralelo e transcrição antecipada
**Por que agora:** Hoje o áudio soma cerca de 7 s e o pior caso passa do maxDuration sem handoff (BOT-4/8/10). Depende da telemetria do D9 para provar a melhora.

**Deploy:** MICRO ANTES, primeiro em staging e depois em produção. Node ≥ 20.3 no Railway (AbortSignal.any). No CRM, 504 do micro conta como timeout (mantém retry e metadata.timeout), com prazo total de cerca de 100 s no callBrain. thinkingBudget 0 só depois de A/B em staging.

**Medir antes/depois:**
- PR37 (D10): p50 da resposta a áudio (hoje ~7 s a mais) cai. Timeouts e retries por dia. Nenhuma função morrendo por maxDuration sem handoff.

### D10 — [CÓDIGO MICRO + CÓDIGO CRM] Micro com prazo e aborto, áudios transcritos em paralelo e transcrição já na ingestão
Onda D_bot_ia · esforço G · depende de D9 · migration: não · micro: **sim (antes do CRM)** · refs: BOT-8, BOT-10, BOT-3, BOT-4

**Impacto:** Cliente que manda áudio (comum no público DPVAT/INSS) espera menos: hoje p50 30,7 s contra 23,3 s só com texto; com a transcrição rodando durante os 8 s do debounce e vários áudios em paralelo, a diferença some na maioria dos casos. Custo: o micro para de gastar tokens em chamada que o CRM já abandonou (timeout de 45 s) e deixa de empilhar retries do SDK + callClaude + callClaudeStructured.

**Ação do usuário:** Deploy do D:\Chatbot_whatsapp no Railway (staging primeiro, depois produção) antes do deploy do CRM; confirmar a versão do Node no Railway (engines >=18.18: AbortSignal.any não existe no 18).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `D:\Chatbot_whatsapp\bot.js` | cliente Anthropic | 28-30 | new Anthropic({ apiKey, maxRetries: 0, timeout: 120_000 }) — callClaude já faz o retry; 120 s global por causa de /consolidate-playbook e /distill-lesson |
| `D:\Chatbot_whatsapp\bot.js` | callClaude / callClaudeStructured | 67-83, 110-145 | callClaude(params, { retries = 3, baseDelayMs = 1000, deadline, signal } = {}) → anthropic.messages.create(params, { timeout: Math.max(1000, deadline - Date.now()), signal }); sem nova tentativa se faltar < 5 s ou signal.aborted; callClaudeStructured repassa e pula a 2ª tentativa sem tempo |
| `D:\Chatbot_whatsapp\bot.js` | decide — mídia | 1488-1505, 1577-1597 | decide({ ..., deadline, signal }); áudios: const results = await Promise.all(audioItems.map((i) => transcribeAudio(i, { signal }).catch(() => null))) e depois montar clientText/transcripts na ordem original |
| `D:\Chatbot_whatsapp\bot.js` | transcribeAudioOnce | 1339-1361 | aceitar { signal }; fetch com sinal combinado (manual: AbortController ligado a signal + timer de 15 s — AbortSignal.any exige Node ≥ 20.3 e o engines é >=18.18); (opcional) config thinkingConfig.thinkingBudget: 0 no gemini-2.5-flash |
| `D:\Chatbot_whatsapp\index.js` | POST /reply | 17-47 | const budget = Math.min(Number(req.headers['x-bot-budget-ms']) || 40_000, 60_000); const ac = new AbortController(); res.on('close', () => { if (!res.writableFinished) ac.abort(); }); decide({ ..., deadline: Date.now() + budget, signal: ac.signal }) |
| `app/_shared/lib/whatsapp/bot.ts` | callBrainOnce / callBrain | 814-840, 848-877 | header 'x-bot-budget-ms': String(BOT_TIMEOUT_MS - 3_000); (opcional) callBrain(payload, baseUrl, deadline) com prazo total (startedAt + 100_000) para o handoff sair antes do maxDuration, sem aumentar BOT_TIMEOUT_MS nem BOT_MAX_ATTEMPTS |
| `app/_shared/lib/whatsapp/transcribe.ts` | transcribeInboundAudio, awaitInflightTranscripts (novo) | novo | export async function transcribeInboundAudio(messageId: string): Promise<string | null> (URL pré-assinada 600 s → /transcribe → grava WhatsAppMessage.transcript → wa_transcribe { usage, bySystem: true }); const inflight = new Map<string, Promise<string | null>>(); export async function awaitInflightTranscripts(ids: string[], maxMs: number): Promise<void> |
| `app/api/whatsapp/webhook/route.ts` | POST — ingestão/bot/ficha | 144-162 | para result.isNew && result.conversationStatus === 'bot' && result.message.mediaType?.startsWith('audio/') → transcribeInboundAudio(result.message.id) SEM await, antes do laço do bot; await Promise.allSettled(...) antes do laço da ficha |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — lote/mídia | 949-1003 | antes de montar mediaList: await awaitInflightTranscripts(idsDeAudioSemTranscript, 6_000) e reler transcript desses ids (1 query); os já transcritos seguem pelo caminho de texto (L992-996) |
| `app/_shared/lib/whatsapp/assist.ts` | transcribeMessageAudio | 243-290 | reusar a chamada central de transcribe.ts (evita duas implementações) mantendo o log com o atendente |

**Passos:**
1. [CÓDIGO MICRO] Cliente Anthropic com maxRetries: 0 (o retry é do callClaude, com classificação de erro) e timeout global de 120 s, não 40 s: /consolidate-playbook (max_tokens 8000 + thinking) e /distill-lesson são longos. O prazo curto vem por requisição.
2. [CÓDIGO MICRO] callClaude/callClaudeStructured recebem deadline + signal e passam { timeout, signal } por chamada (SDK 0.110 aceita opções por request). Sem retry se não houver tempo.
3. [CÓDIGO MICRO] index.js /reply: orçamento pelo header x-bot-budget-ms (relativo, sem depender do relógio) e aborto quando o CRM desconecta, usando res.on('close') com checagem de writableFinished. NÃO usar req.on('close'): no Node ≥ 16 ele dispara quando o corpo termina de ser lido (depois do express.json) e abortaria toda chamada.
4. [CÓDIGO MICRO] decide: transcrever todos os áudios do lote com Promise.all, preservando a ordem ao montar o texto. Opcional: thinkingBudget 0 no Gemini da transcrição (medir qualidade no staging).
5. Deploy do micro no Railway ANTES do CRM (regra). O micro novo funciona sem o header (orçamento padrão de 40 s).
6. [CÓDIGO CRM] callBrainOnce manda x-bot-budget-ms = BOT_TIMEOUT_MS − 3 s. Opcional: prazo total no callBrain para o handoff sair antes do maxDuration de 120 s. Não aumentar timeout nem tentativas.
7. [CÓDIGO CRM] Nova lib transcribe.ts: transcrição disparada na ingestão (só conversa em 'bot', onde o bot já transcreveria, então o custo não muda) e rodando em paralelo aos 8 s de debounce. Registro em memória das transcrições em andamento para o bot da mesma instância esperar até 6 s; se não der, o micro transcreve como hoje.
8. [CÓDIGO CRM] assist.ts passa a usar a mesma chamada central (usage do D9).

**Regras tocadas:**
- deploy do micro antes do CRM
- não aumentar timeout/tentativas sem rever maxDuration (só reduz)
- metadata.usage em toda IA (transcrição da ingestão loga usage)
- falha do bot vai para handoffToQueue com motivo (aborto vira timeout no CRM, que já cai no catch)

**Riscos:**
- Armadilha req.on('close') (dispara cedo) → usar res.on('close'). Testar no staging que chamadas normais NÃO são abortadas.
- Timeout global baixo quebraria /consolidate-playbook e /distill-lesson → manter 120 s global e o prazo curto só no /reply.
- Promise.all com vários áudios pode bater em rate limit do Gemini. São poucos áudios por rajada; o catch por item mantém o comportamento de 'não pôde ser transcrito'.
- Transcrição dupla quando o áudio está em andamento em outra instância da Vercel: afeta só o custo, raro.
- Transcrever na ingestão também áudios de conversas que o bot vai descartar (ex.: status muda no debounce): custo marginal.
- thinkingBudget 0 pode piorar a transcrição de áudio ruidoso: A/B no staging antes.

**Testes:**
- CRM: sem lógica pura relevante (transcribe.ts depende de rede/banco). Manual.
- Micro: não há suíte de testes; validar no staging.

**Validação manual:** Staging (CHATBOT_URL_STAGING + WHATSAPP_TEST_NUMBERS): (1) mandar 2 áudios seguidos → no Railway as duas transcrições começam juntas; no banco, WhatsAppMessage.transcript preenchido antes do wa_bot e wa_transcribe bySystem com usage; tempo inbound→resposta com áudio perto do de texto. (2) Mandar header de orçamento pequeno (ou deixar o staging lento) → o CRM aborta aos 45 s e o Railway loga o aborto sem novas chamadas ao Claude. (3) Revisão da IA → gerar playbook (consolidate) continua funcionando. (4) Conversa normal: nenhuma chamada abortada por engano.

**Revisão: ajustar**
- problema: As linhas conferem: new Anthropic({ apiKey }) bot.js:28-30, callClaude :67-83, callClaudeStructured :113-145, laço sequencial :1577-1597, transcribeAudioOnce :1339-1361, /reply index.js:17-47, callBrainOnce/callBrain bot.ts:814-877, engines '>=18.18'. O alerta sobre req.on('close') (usar res.on('close') + writableFinished) está correto.
- problema: EFEITO COLATERAL NÃO DESCRITO: com o prazo do micro (42 s), o estouro vira HTTP 500 do micro ANTES do abort de 45 s do CRM. O callBrain (bot.ts:859-867) trata isso como 'não timeout': 1 retry em vez de 3, e o log do catch grava timeout: false com 'erro no bot: chatbot HTTP 500…'. As métricas de timeout (19/30 dias na auditoria) somem do painel, e a política de retry muda sem ninguém decidir.
- problema: O aborto por res.on('close') atrás do proxy do Railway não é garantido (o proxy pode não fechar o upstream quando o cliente cai). O prazo por header é a proteção principal; o aborto é bônus. Validar isso no staging.
- problema: Há jeito mais simples para a transcrição na ingestão: disparar a transcrição do próprio áudio no início do handleIncomingWhatsApp, ANTES do sleep do debounce, na mesma invocação. Hoje o webhook já chama o bot uma vez por contato por POST, e a Meta manda em geral uma mensagem por POST. A invocação que desiste no debounce ainda espera (com limite) a transcrição e grava o transcript, e a vencedora relê do banco. Isso dispensa o registro em memória por instância (que não funciona entre instâncias) e a mudança no webhook.
- problema: Transcrição na ingestão para número de teste vai ao micro de PRODUÇÃO (assist usa CHATBOT_URL). Afeta só o custo.
- ajuste: Micro: no estouro do prazo responder 504 com detail 'prazo do CRM esgotado'. CRM: em callBrainOnce, tratar res.status === 504 como timeout (err.name = 'AbortError' ou flag isTimeout) para manter a política de retry e o metadata.timeout. Documentar a mudança de política se decidirem 1 retry.
- ajuste: Adotar o prazo total no callBrain (início + ~100 s) nesta onda, não como opcional: com o header, a cadeia pior fica 8 + 42 + 1 + 42 ≈ 93 s, e o prazo total garante o handoff antes do maxDuration mesmo com o micro fora do ar (3×45 s de AbortError).
- ajuste: Preferir a transcrição antecipada dentro do handleIncomingWhatsApp (transcribeInboundAudio(message.id) iniciada antes do sleep e aguardada depois, com teto de ~6 s) e só cair na variante de webhook + registro em memória se a medição mostrar rajadas com vários áudios em POSTs diferentes.
- ajuste: Manter maxRetries: 0 + timeout global de 120 s (consolidate/distill), Promise.all dos áudios com catch por item e thinkingBudget 0 só depois de A/B no staging.

**Em aberto:**
- Desligar o thinking do Gemini na transcrição (ganho de latência) depende de A/B de qualidade. Fazer nesta onda?
- Adotar o prazo total no callBrain (BOT-4) agora ou só depois de medir botLatencyMs (D9)?

## PR38 Bot: instruções v21 + fatos do atendimento + nota com transcrição
**Por que agora:** Trata a regra 'cadastrado nunca é resolve' (que manda dúvida de cliente da casa para a fila), a qualificação que a equipe desfaz e o áudio que dobra o 'não entendi'. Depende de D2 e D4.

**Deploy:** Precisa de aprovação do chefe para a regra (b) e do escopo (INSS/DPVAT). O micro (bloco dinâmico) vai antes. Testar a v21 em staging (deploy do micro com BRAIN_PROMPT_URL vazio e a v21 no STATIC_SYSTEM_PROMPT) com WHATSAPP_TEST_NUMBERS, e depois publicar pela aba Instruções. No CRM, buildAudioTranscriptNote puro com teste.

**Medir antes/depois:**
- PR38 (D11): % de handoff de cliente cadastrado com pergunta de status. 'Não entendi' repetido em áudio. Qualificados pela IA → nq_* pela equipe (64-72 em 30 dias hoje).

### D11 — [INSTRUÇÃO + CÓDIGO MICRO + CÓDIGO CRM] Cliente cadastrado pode ter 'resolve' em pergunta de status; perguntas obrigatórias antes de qualificar; áudio não entendido pede texto; transcrição na nota de transferência
Onda D_bot_ia · esforço M · depende de D2, D4 · migration: não · micro: **sim (antes do CRM)** · refs: [MISSED bot_eficacia] A regra 'cliente cadastrado nunca é resolve' manda toda dúvida de cliente da casa para a fila, [MISSED bot_eficacia] Áudio dobra o 'não entendi' e a transferência, EF-5, [MISSED bot_eficacia] Equipe fecha ou descarta transferências sem responder ao cliente

**Impacto:** Cliente da casa: 'como está meu processo?' passa a ser respondido pelo bot com a etapa do card, sem ir para a fila (109 das 413 transferências de 09-22/09 eram de status/andamento). Equipe: menos 'LEAD QUALIFICADO' que depois vira não qualificado por lesão ou advogado (24% dos qualificados pela IA). Quem manda áudio confuso recebe um pedido para escrever antes de ser transferido, e a nota de transferência traz a transcrição, para quem faz a triagem não descartar sem ouvir.

**Ação do usuário:** Publicar as instruções v21 pela aba Revisão da IA → Instruções (texto revisado pelo responsável pelo bot); deploy do micro (bloco dinâmico) no Railway; revisar na Revisão da IA os casos citados (34 + 14 + amostra de 62).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `banco: WhatsAppInstructions (aba Revisão da IA → Instruções)` | seções CATEGORIAS DE ENCERRAMENTO, CRITÉRIO DE QUALIFICAÇÃO, NÃO ENTENDEU/ÁUDIO (v20 → rascunho v21) | n/a (texto publicado; não é código) | (a) cadastrado + pergunta de status respondida com processInfo.etapa/etapaDescricao ou lookup status_processo, sem pedido pendente → resolve 'perguntas'; handoff se houver documento novo, pedido concreto, prazo, reclamação ou etapa que não explica; (b) antes de qualify, confirmar lesão/sequela pertinente e 'algum advogado já cuida do caso?' dentro dos states existentes (triagem_lesao/triagem_inss); (c) understood=false em mensagem de áudio → na 1ª vez pedir para escrever (ou áudio curto) e só transferir na 2ª |
| `D:\Chatbot_whatsapp\bot.js` | buildDynamicContext — bloco 'ESTE ATENDIMENTO' | 1156-1164 | trocar a proibição fixa ('Nestes casos NÃO use action="resolve" … use handoff') por fatos + 'siga CATEGORIAS DE ENCERRAMENTO das instruções'; texto do docsReceived '(foto/PDF)' (D4). Sem mudar STATES/responseSchema |
| `D:\Chatbot_whatsapp\bot.js` | buildDynamicContext — failCount | 1181-1184 | conferir compatibilidade: a regra '2º não entendi → handoff' continua; a instrução nova age no 1º (pedir texto). Sem mudança de código se o texto não conflitar |
| `app/_shared/utils/audio-note.ts` | buildAudioTranscriptNote (novo, puro) | novo | export function buildAudioTranscriptNote(items: { transcript: string | null }[], maxChars = 600): string | null → '🎙️ Áudio do cliente (transcrição): "…"' por item, truncado |
| `app/_shared/lib/whatsapp/bot.ts` | handleIncomingWhatsApp — handoff/continue vazio/qualify | 1217-1227, 1389-1393, 1419-1424, 1363 (qualifyToQueue 574-578) | montar audioNote a partir de burst (transcript salvo) + decisionTranscripts; handoffToQueue(..., { onlyIfStatus: 'bot', extraNote: audioNote }) (D2); qualifyToQueue(contactId, label, reason, { extraNote }) acrescenta à nota 'Lead qualificado pela IA' |

**Passos:**
1. [INSTRUÇÃO] Escrever o rascunho v21 na aba Revisão da IA → Instruções (upsertSection/publishInstructionsDraft), com as três regras (a), (b) e (c). Sem state/closeCategory/action novo: nq_sem_lesao_pertinente e nq_ja_tem_acao_advogado já estão no enum do micro, e as perguntas cabem em triagem_lesao/triagem_inss. Por isso não cai na regra dos 3 lugares.
2. [CÓDIGO MICRO] ACHADO: a proibição 'cliente cadastrado/docs → nunca resolve' não está só nas instruções. Ela está fixa no buildDynamicContext (bot.js:1156-1164), no bloco dinâmico que vai a toda chamada. Publicar só a v21 não muda o comportamento. Trocar o bloco por fatos + remissão às instruções (move a regra de negócio para onde a equipe edita). O bloco dinâmico fica fora do cache de prompt, então o cache não quebra.
3. [CÓDIGO MICRO] Na mesma mudança, ajustar o texto do docsReceived para '(foto/PDF)' (coerente com o D4). Conferir que a regra de failCount (1181-1184) não conflita com (c): (c) age no 1º não-entendi, e a do micro no 2º.
4. Ordem: validar tudo no staging (CHATBOT_URL_STAGING + número de teste; o micro de staging lê o mesmo brain-prompt, então testar a v21 lá antes de publicar) → deploy do micro de produção → publicar a v21 (entra em até 5 min pelo BRAIN_TTL_MS; o texto precisa ter ≥ 500 caracteres) → deploy do CRM.
5. [CÓDIGO CRM] Nota de transferência com a transcrição: função pura buildAudioTranscriptNote. Em bot.ts, juntar as transcrições do lote (salvas + as devolvidas pelo micro em L1217-1227) e passá-las como extraNote em handoff, continue-vazio e qualify. A nota é interna (a equipe vê; o cérebro não recebe, porque o histórico filtra internal).
6. [user] Mandar para a Revisão da IA os 34 casos nq_sem_lesao_pertinente, os 14 nq_ja_tem_acao_advogado e uma amostra dos 62 áudios com understood=false, para calibrar as regras antes de publicar.
7. Medir antes e depois (SQL somente leitura): % de transferências de contatos com card; % de qualificados pela IA reclassificados em nq_* por atendente; handoff em turnos com áudio.

**Regras tocadas:**
- prompt vivo do bot está no banco (editar só o bot.js não muda produção)
- state/closeCategory/action novo = 3 lugares (evitado: nada de enum novo)
- deploy do micro antes do CRM
- bot: decisão de negócio é do cérebro (a regra sai do código do micro e vai para as instruções)
- bytes estáveis no prompt estático (a mudança é no bloco dinâmico)

**Riscos:**
- Resolve de cliente cadastrado pode fechar conversa que precisava de humano (ex.: 'e quando sai o dinheiro?'). Mitigado pela exceção 'pedido concreto/pendência → handoff'. Medir reabertura em 24h das resolvidas.
- Perguntas obrigatórias alongam a triagem em 1-2 turnos (~24 s cada) e podem reduzir a conversão. Acompanhar a taxa de qualificação.
- Instrução publicada vai ao ar em até 5 min para todos os números. Validar no staging antes.
- A nota de transferência passa a ter texto do cliente. É dado pessoal, mas interno e já gravado em WhatsAppMessage.transcript.

**Testes:**
- tests/audio-note.test.ts: buildAudioTranscriptNote([]) = null; com 1 transcrição curta, formato esperado; com transcrição de 2.000 caracteres, truncada em 600 com reticências; ignora itens sem transcript

**Validação manual:** Staging: (1) vincular um card de teste ao telefone de teste e perguntar 'como está meu processo?' → resolve com a etapa (log wa_bot outcome resolve, closeCategory perguntas); pedir 'quero mandar um documento novo' → handoff. (2) Fazer a triagem até qualificar → o bot pergunta a lesão/sequela e se há advogado antes de qualificar. (3) Mandar áudio ininteligível → o bot pede para escrever; no 2º, transfere, e a nota interna traz a transcrição. Apagar o card e a conversa de teste no fim.

**Revisão: ajustar**
- problema: Achado CONFIRMADO: bot.js:1156-1164 tem fixo no bloco dinâmico 'Nestes casos NÃO use action="resolve"… use action="handoff"' para docsReceived>0 ou registeredClient. Publicar só a v21 não mudaria nada. :1181-1184 força handoff no 2º não-entendi e :1631-1650 tem texto fixo para áudio inaudível. A mudança fica no bloco dinâmico, fora do cache, e não cria state/closeCategory/action: nada cai na regra dos 3 lugares.
- problema: VALIDAÇÃO IMPOSSÍVEL COMO ESCRITA: 'testar a v21 no staging antes de publicar' não funciona, porque /api/whatsapp/brain-prompt (route.ts:34-41) serve SÓ status 'publicado'. Um micro de staging que lê esse endpoint recebe a v20 até a v21 ser publicada, e publicar vale para TODOS os números em ≤5 min.
- problema: A ordem de deploy está correta: com o micro novo e a v20 ainda publicada (que também proíbe resolve para cadastrado/arquivo, DOC-5), o comportamento não muda até a v21 sair. Não há janela sem regra.
- problema: A pergunta obrigatória de advogado e de lesão antes de qualificar é regra de negócio com custo de conversão (1-2 turnos): precisa de aprovação explícita do chefe, e não só de quem redige o texto.
- ajuste: Para testar a v21 antes de publicar, uma de duas: (a) deploy de staging do micro com BRAIN_PROMPT_URL vazio e a v21 colada no STATIC_SYSTEM_PROMPT só nesse deploy (o fallback vira o cérebro de staging), testando com WHATSAPP_TEST_NUMBERS; ou (b) um parâmetro ?draft=<version> no brain-prompt aceito só com um segredo de staging diferente (CHATBOT_STAGING_SECRET), servindo o rascunho. A (a) não mexe no CRM.
- ajuste: Registrar a aprovação do chefe para a regra (b) e definir o escopo (INSS apenas ou também DPVAT) antes de redigir.
- ajuste: Manter buildAudioTranscriptNote puro + extraNote no handoff/qualify (depende do opts do D2 e do qualifyToQueue com opts sugerido no D2).

**Em aberto:**
- Quem redige e aprova o texto da v21 (responsável pelo bot/chefe)? O plano só define as regras.
- Para (b), a pergunta do advogado vale só para INSS ou também para DPVAT?

### fato recentAttendant (vindo do D5)

## PR39 Leituras fora da fila (1/4): teamRoute, jsonFetcher e thread com requireTeam lendo o banco
**Por que agora:** Base dos PRs 40-44. Fecha a decisão de acesso pelo JWT na thread e a lista da equipe exposta a cliente logado por CPF.

**Deploy:** O fetcher novo e o teamRoute vão no MESMO deploy, nunca o teamRoute antes. AccessError → 403; qualquer outro erro → 500 com texto próprio. Validar no preview com os pré-requisitos de login. O preview grava no banco de produção: usar só card e contato de teste.

### B2 — Leituras do inbox e do cabeçalho via route handlers GET (fora da fila serial), com requireTeam lendo o banco
Onda B_leituras_infra · esforço G · depende de — · migration: não · micro: não · refs: THR-2, FE-1, BACK-3, BACK-11, THR-9, [MISSED backend] Voltar o foco à aba enfileira 3-4 server actions, GR-5, LISTA-11

Escopo neste PR: B2: route-guards.ts puro + tests/route-guards.test.ts, route-auth.ts (teamRoute/sameOrigin/noStoreJson), AccessError em requireTeam, fetch-json.ts, jsonFetcher em TODOS os hooks de use-whatsapp.ts, /api/whatsapp/messages com teamRoute, GET /api/presence com teamRoute ou removido

**Impacto:** Clicar em tag, assumir, encerrar ou enviar deixa de esperar o poll em andamento. A fila de server actions passa a ter só mutações. Os badges do topo (WhatsApp, Menções, Eventos, alerta dev) chegam numa ida só a cada 30 s, em paralelo. Ficha e documentos do Copiloto aparecem juntos, numa ida. Voltar o foco à aba não recarrega mais a lista inteira na frente do clique. O poll do chat desligado some.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/route-auth.ts` | teamRoute, sameOrigin, noStoreJson (novo) | novo | async teamRoute(): Promise<{ ctx: SessionPermissions } | { res: NextResponse }>. Chama requireTeam() e, no catch, devolve NextResponse.json({ error: msg }, { status: 403 }). sameOrigin(req): NextResponse | null, para POST (Origin ≠ Host → 403). noStoreJson(data, init?): Cache-Control 'private, no-store'. |
| `app/_shared/lib/permissions-server.ts` | requireTeam / getSessionPermissions | 39-88 | Sem mudança: verificado que funciona em route handler. getServerSession(authOptions) sem args já roda em rotas (app/api/whatsapp/messages/route.ts:15, app/api/chat/token/route.ts:9). getSessionPermissions já é usado em 6 rotas (labels ×3, work-session, ponto-adjustments, dev-tickets). checkDashboardIpAccess usa headers() de next/headers (ip-access.ts:1, 23-24), que vale em route handler. Cache de 30 s por e-mail (L31-32) + 60 s da lista de IPs: custo por chamada ~0. |
| `app/_shared/lib/whatsapp/inbox-data.ts` | loadConversations, WhatsAppConversationDTO, countUnreadConversations, getInboxVersion, LIST_PAGE (novo, sem 'use server') | novo (origem: conversations.ts 23, 51-69, 80-178, 180-410, 430-442) | Move a montagem do DTO e as leituras para um módulo comum. getInboxVersion(): Promise<{ version: string; total: number }> devolve o total na mesma query do hash, o que aposenta o poll de 60 s de countWhatsAppConversationsTotal. A regra de 'use server' só exportar funções async obriga a tirar DTO/constantes do arquivo de action. |
| `app/_actions/whatsapp/conversations.ts` | requireTeamMember, countWhatsAppUnread, countWhatsAppConversationsTotal, listWhatsAppConversations, getWhatsAppInboxVersion, searchWhatsAppConversations, getWhatsAppConversationByContact | 35-44, 51-69, 75-78, 418-421, 430-442, 450-474, 481-487 | Viram wrappers finos do inbox-data.ts, mantidos por 1 ciclo de deploy para abas abertas (Skew Protection). O requireTeamMember local (role do JWT, sem trava de IP) continua só nas mutações. A troca por requireTeam nas mutações é outra onda. |
| `app/api/whatsapp/inbox/conversations/route.ts` | GET (novo) | novo | Sem params → { items, cursor } (LIST_PAGE). ?contactId= → { item } (substitui getWhatsAppConversationByContact). ?since= fica reservado para a B3. dynamic='force-dynamic'; teamRoute; noStoreJson. |
| `app/api/whatsapp/inbox/version/route.ts` | GET (novo) | novo | Devolve { version, total }. teamRoute. |
| `app/api/whatsapp/inbox/search/route.ts` | GET (novo) | novo | ?q= → mesma lógica de searchWhatsAppConversations (conversations.ts:450-474). Menos de 2 caracteres → []. |
| `app/_shared/lib/whatsapp/copilot-data.ts` | CLIENT_FIELDS, findUserByPhone, aiFieldList, loadClientInfo, loadClientDocuments (novo) | novo (origem: client-info.ts 36-42, 72-98, 135-196, 199+; client-documents.ts 44-59) | loadCopilot(contactId, agent): Promise<{ clientInfo; documents }> com UM findUnique do contato e user + documents em Promise.all. Documents filtra deletedAt: null. Vínculo por telefone via updateMany({ where: { id, userId: null }, data: { userId } }), com resumo só se count === 1: evita resumo duplicado quando duas abas abrem juntas. |
| `app/api/whatsapp/inbox/copilot/[contactId]/route.ts` | GET (novo) | novo | Devolve { clientInfo, documents } numa ida (THR-9). teamRoute; noStoreJson (a resposta tem CPF e RG). maxDuration=60 enquanto o resumo ao vincular ainda tiver await (a B4 tira). |
| `app/api/team/badges/route.ts` | GET (novo) | novo | Promise.all → { whatsappUnread, mentionsPending, devAlerts, eventsSoon }. Reaproveita countUnreadConversations, db.mention.count({ recipientId: ctx.userId, status: 'PENDING' }) (lógica de mention-actions.ts:161-168), a lógica de getActiveDevAlerts (dev-alerts.ts:97-107) e a de countEventsSoon (event-actions.ts:118-129; janela relativa em ms, sem corte de dia, então não precisa de date-br). |
| `app/_shared/utils/fetch-json.ts` | jsonFetcher, postJson, HttpError (novo) | novo | jsonFetcher<T>(url) lança HttpError(status, body.error ?? statusText) quando !res.ok. Hoje o fetcher de use-whatsapp.ts:44 faz r.json() sem checar e guardaria { error } como dado. postJson<T>(url, body) fica para a B4. |
| `app/_shared/hooks/use-whatsapp.ts` | fetcher, useWhatsAppConversations, useWhatsAppConversationsTotal, useWhatsAppUnread | 44, 55-75, 81-88, 163-170 | Lista: key '/api/whatsapp/inbox/conversations' + jsonFetcher + revalidateOnFocus: false (GR-5: o foco só consulta a versão). Versão: '/api/whatsapp/inbox/version', com revalidateOnFocus: true (é barata). useWhatsAppConversationsTotal lê total da key da versão, sem poll próprio. useWhatsAppUnread sai (vai para os badges). Atualizar os comentários desatualizados (poll 5s, lista 15s, 'capada em 200'). |
| `app/_shared/hooks/use-header-badges.ts` | useHeaderBadges (novo) | novo | SWR '/api/team/badges': refreshInterval 30_000, revalidateOnFocus true, refreshWhenHidden false (padrão), shouldRetryOnError false. |
| `app/_shared/hooks/use-mentions.ts` | usePendingMentions | 25-74 | Deriva de useHeaderBadges (mesma key, o SWR deduplica). Mantém fresh e o toast quando a contagem sobe (a 1ª leitura não avisa). refresh = mutate. MENTIONS_CHANGED_EVENT → mutate. Sai o setInterval e o countPendingMentions. |
| `app/nova-dash/page.tsx` | PageInner (eventsSoon, useUnread, whatsappUnread, workspaceUnread) | 59-70, 75-82, 219-233, 294-298, 326-330 | eventsSoon vem de badges.eventsSoon (sai o setInterval de 5 min sem checar aba oculta); EventsDialog onChanged → mutate dos badges. whatsappUnread vem de badges.whatsappUnread. useUnread(TEAM_CHAT_ENABLED). |
| `app/nova-dash/UserMenu.tsx` | DevAlertPopup | 58-78 | Lê badges.devAlerts em vez de getActiveDevAlerts (server action) a cada 30 s. Mantém o filtro local de já vistos (getSeenIds). |
| `app/_shared/hooks/use-chat.ts` | useUnread | 76-83 | useUnread(enabled: boolean): key null quando desligado. Hoje GET /api/chat/read roda a cada 20 s (15,6/min no banco) com o chat desligado. É GET, então não trava a fila, mas é desperdício. |
| `app/nova-dash/workspace/WorkspaceSidebar.tsx` | CHAT_ENABLED | 38 | A const vai para app/nova-dash/workspace/chat/chat-flags.ts (export const TEAM_CHAT_ENABLED = false), importada por WorkspaceSidebar, Workspace.tsx:25, page.tsx:75 e Chat.tsx:80. Continua desligado (feature desligada de propósito). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | busca (searchSeq), fetchedActive, clientInfo SWR | 202-216, 476-483, 489-493 | Busca → GET /api/whatsapp/inbox/search com o mesmo searchSeq. Hidratação sob demanda → GET ?contactId=. clientInfo → key '/api/whatsapp/inbox/copilot/<id>', compartilhada com o CopilotPanel. |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | docs SWR, handleFillFichaAI | 114-127, 197 | documents sai da mesma key do copilot. As mutações que já devolvem a lista (confirmClientDocumentUpload, attach, rename, delete) aplicam mutate(prev => ({ ...prev, documents }), { revalidate: false }). 'wa-docs-changed' → mutate da key. L197 → mutate da key em vez de getClientInfo. |
| `app/api/whatsapp/messages/route.ts` | GET | 12-22 | Trocar a checagem de role pelo JWT (sem trava de IP, contra a regra 'decisão de acesso lê o banco') por teamRoute(). O cache de 30 s mantém o custo do poll de 8 s em ~0. |
| `app/api/presence/route.ts + app/_shared/hooks/use-presence.ts` | POST (heartbeat) / usePresence | route 43-55; hook 47-51 | db.user.updateMany({ where: { id }, data: { lastSeenAt } }), sem RETURNING da linha inteira: hoje volta o User com o hash de senha. teamRoute no POST. O hook fica com um único gatilho de foco (visibilitychange); hoje dispara em focus E visibilitychange. |
| `middleware.ts` | PUBLIC_API_PREFIXES, PUBLIC_GET_APIS | 39-51 | SEM mudança, de propósito. As rotas novas são da equipe e NÃO entram em allowlist: o middleware exige sessão (401) e a rota exige equipe + IP (403). Não criar rotas sob /api/whatsapp/webhook, /cron ou /brain-prompt, nem em /api/documents (GET público exato). |

**Passos:**
1. Criar app/_shared/lib/route-auth.ts (teamRoute, sameOrigin, noStoreJson) e app/_shared/utils/fetch-json.ts, com teste.
2. Extrair inbox-data.ts e copilot-data.ts. Os arquivos 'use server' viram wrappers e continuam exportando só funções async (os tipos passam a ser importados do lib).
3. Criar as rotas GET: inbox/conversations, inbox/version (com total), inbox/search, inbox/copilot/[contactId] e team/badges. Todas com dynamic='force-dynamic', teamRoute e Cache-Control private, no-store.
4. Trocar os hooks: use-whatsapp (lista sem revalidateOnFocus, versão com foco, total da versão), use-header-badges, use-mentions derivado, DevAlertPopup, eventsSoon e useUnread(TEAM_CHAT_ENABLED).
5. Inbox e Copilot: busca, hidratação e ficha+docs por GET; mutações de documento atualizam o cache sem refetch.
6. Alinhar /api/whatsapp/messages e /api/presence ao teamRoute (presence com updateMany).
7. Não mexer no middleware. Conferir com curl sem cookie (401) e logado como cliente de teste (403).
8. Manter as server actions antigas exportadas até o deploy seguinte. Depois, remover os wrappers de leitura sem uso (npx knip).
9. /mapa-atualizar whatsapp e /mapa-atualizar infra: padrão teamRoute, as rotas novas, a receita 'Campo novo na ficha' agora em copilot-data.ts e o app/api/CLAUDE.md ('hoje nenhuma rota usa requireTeam' deixa de valer).

**Regras tocadas:**
- Toda rota da equipe começa com requireTeam()/requirePermission() lendo o banco (não session.user.role)
- Rota da equipe NÃO entra nas allowlists do middleware.ts
- Arquivo 'use server' só exporta funções async (DTO e constantes vão para o lib)
- Nada acima de 4,5 MB no body de rota/action (vale também para a resposta)
- Features desligadas de propósito: o chat da equipe continua desligado, só para de ser pollado
- O inbox atualiza por polling com hash (sem revalidatePath)
- Erros de server action chegam mascarados: com GET/JSON a UI recebe a mensagem real
- Toda query de Document filtra deletedAt: null
- Dark Reader: nenhum aviso novo pode usar classes dark:

**Riscos:**
- A lista tem ~1,34 MB cru (~165 KB gzip). Continua abaixo do teto de 4,5 MB de resposta da função; LIST_PAGE não pode crescer sem a B3.
- Trava de IP passa a valer também nas leituras do inbox (hoje conversations.ts:35-44 só olha o JWT). Quem está no escritório não sente nada (o layout já barra quem está fora). Quem troca de rede com a aba aberta recebe 403 nos polls: o jsonFetcher lança, o SWR mantém o último dado e a UI deve mostrar aviso em vez de esvaziar.
- Abas abertas no deploy seguem chamando as actions antigas: manter os wrappers por 1 ciclo.
- Cold start das funções de rota novas na primeira chamada após ociosidade. Os polls as mantêm quentes e o Fluid Compute ajuda.
- GET da ficha devolve PII (CPF, RG): exige teamRoute + no-store, e nunca pode ir para allowlist.
- O GET do copilot tem efeito colateral (vínculo por telefone e alinhamento do nome do contato). Fica idempotente com updateMany guardado, porque o SWR pode repetir a chamada.
- usePendingMentions derivado: garantir que a 1ª leitura não dispara toast e que queda de contagem não pisca.
- ClientInfoModal.tsx:86/96 ainda chama listClientDocuments/getClientInfo por action: continua funcionando pelos wrappers.

**Testes:**
- tests/fetch-json.test.ts: jsonFetcher com fetch mockado (vi.stubGlobal). 200 → JSON; 401/403/500 → HttpError com status e o 'error' do corpo; corpo não-JSON → HttpError com statusText. postJson envia Content-Type e corpo.
- tests/mentions-badge.test.ts, se o cálculo de 'novas menções' for extraído para app/_shared/utils/mentions-badge.ts (mentionsIncrease(prev: number|null, next) → 0 na 1ª leitura e na queda; diferença na subida).

**Validação manual:** DevTools → Network no inbox, filtrando o header Next-Action. Em repouso não sai nenhum POST, só GET de version (15 s), badges (30 s) e messages (8 s, com conversa aberta), e zero /api/chat/read. Clicar numa tag de contato de TESTE durante uma recarga da lista: o POST da action sai na hora. Alt-tab e voltar: só a versão é consultada. Logado como cliente de teste (CPF): /api/team/badges e /api/whatsapp/inbox/* → 403. curl sem cookie → 401 'Não autenticado'. Badges continuam certos: criar uma menção e um alerta dev de teste e conferir; apagar ao final.

**Revisão: ajustar**
- problema: Linhas conferidas e corretas: conversations.ts 35-44/51-69/75-78/418-421/430-442/450-474/481-487; use-whatsapp.ts 44/55-75/81-88/163-170; use-mentions.ts 25-74; UserMenu.tsx 58-78; use-chat.ts 76-83; messages/route.ts 12-22; presence 43-55 e hook 47-51; middleware 39-51; CopilotPanel 114-127/197. requireTeam funciona em route handler (headers() de next/headers vale lá).
- problema: Bundle do cliente: hoje use-whatsapp.ts e o inbox importam WhatsAppConversationDTO do arquivo 'use server'. Se o tipo passar a morar em inbox-data.ts (que importa db/Prisma) e algum import no cliente não for 'import type', o Prisma entra no bundle do navegador e o build da Vercel quebra.
- problema: teamRoute com catch genérico → 403 transforma erro transitório do Neon (timeout do pool, falha de rede) em 'Acesso restrito à equipe'. A UI mostra 'sem acesso' quando o problema é o banco.
- problema: A troca da key da ficha para '/api/whatsapp/inbox/copilot/<id>' muda o formato do dado (de ClientInfoResult para {clientInfo, documents}). A spec cita só CopilotPanel:197, mas também há WhatsAppInbox.tsx:1737 (onClientInfoChanged → mutateClientInfo(info)) e :1752 (CardDialog onUpdate → mutateClientInfo()). Sem ajuste, o cache fica com o formato errado.
- problema: O loadCopilot não pode pôr documents no mesmo Promise.all do contato: os documentos dependem do userId, que pode ser resolvido naquela mesma chamada pelo vínculo por telefone. A ordem correta é contato → resolver userId → Promise.all(user, documents).
- problema: Afirmação errada: 'maxDuration=60 enquanto o resumo ainda tiver await (a B4 tira)'. Com waitUntil o trabalho em background continua limitado pelo maxDuration da função. Sem Fluid o padrão é curto e o resumo (timeout 30 s) é cortado. A rota do copilot mantém maxDuration 60 também depois da B4.
- problema: Ordem de deploy: se /api/whatsapp/messages passar a devolver 403 (IP) antes da troca do fetcher, o fetcher atual (r.json() sem checar status) guarda {error} como dado. Aí use-whatsapp.ts:128 (data.messages.length) lança TypeError e a thread quebra. jsonFetcher e teamRoute na rota messages precisam ir no MESMO deploy.
- problema: O formato de badges.devAlerts está ambíguo. O DevAlertPopup precisa da lista DevAlertDTO[] (id, title, message; hoje take 10), não de uma contagem.
- problema: GET /api/presence (route.ts:58-62) aceita qualquer sessão, inclusive cliente logado por CPF, e devolve nomes, fotos e roles da equipe. Nenhum código do app consome esse GET. A spec só trata o POST.
- problema: A spec pergunta se ClientInfoModal.tsx ainda está montado. Resposta: não está. Nenhum arquivo importa o componente (código morto). Dá para apagar em vez de manter wrappers por causa dele.
- problema: A hipótese do sintoma (FE-1/THR-2) só se resolve em parte: a assinatura de URL de mídia (downloadFileFromS3, 'use server', p50 de 3 a 11 actions por abertura de conversa) continua na fila serial. As leituras de montagem (listWaNumberOptions, listCloseReasons, listWhatsAppTags, listWaContactsDirectory) também. A spec deixou isso só como pergunta.
- ajuste: Colocar os DTOs (WhatsAppConversationDTO, ClientInfoResult, ClientDocumentDTO, DevAlertDTO usado pelos badges) num arquivo só de tipos, sem imports de servidor (ex.: app/_shared/lib/whatsapp/inbox-types.ts). No cliente, usar sempre 'import type'. inbox-data.ts e copilot-data.ts importam desse arquivo.
- ajuste: teamRoute: 403 só para erro de acesso e 500 para o resto. Opção sem quebrar as actions: requireTeam passa a lançar class AccessError extends Error (continua sendo Error para quem já usa), e teamRoute testa instanceof AccessError → 403; senão 500 { error: 'Falha ao carregar. Tente de novo.' } com console.error.
- ajuste: Listar como call sites da key nova: WhatsAppInbox.tsx:1737 → mutate(prev => prev && ({ ...prev, clientInfo: info }), { revalidate: false }); :1752 → mutate(); CopilotPanel:197 → mutate(). Remover as keys antigas ['wa-client-info', id] e ['wa-client-docs', id].
- ajuste: loadCopilot(contactId, agent): findUnique(contact) → se !userId, findUserByPhone + updateMany guardado → Promise.all([user select CLIENT_FIELDS, documents(userId, processId: null, deletedAt: null)]). No rascunho, documentos vêm de draftDocuments.
- ajuste: Manter export const maxDuration = 60 em app/api/whatsapp/inbox/copilot/[contactId]/route.ts de forma permanente, com comentário do porquê: waitUntil respeita o teto da função.
- ajuste: Nos passos: o deploy 1 leva jsonFetcher em use-whatsapp.ts (incluindo useWhatsAppMessages) junto com teamRoute em /api/whatsapp/messages. Nunca teamRoute antes do fetcher novo.
- ajuste: Definir o contrato: GET /api/team/badges → { whatsappUnread: number; mentionsPending: number; devAlerts: DevAlertDTO[]; eventsSoon: number }.
- ajuste: Incluir GET /api/presence: teamRoute ou remover o handler (não tem consumidor).
- ajuste: Apagar app/nova-dash/workspace/whatsapp/ClientInfoModal.tsx (confirmar com npx knip) e tirar a open question.
- ajuste: Confirmar com o orquestrador qual onda cuida da assinatura de mídia (THR-1/FE-6/DOC-3). Se nenhuma cuidar, incluir aqui: assinar mediaUrl dentro do GET /api/whatsapp/messages (getSignedUrl é CPU local; expiresIn curto) e o WaMediaBubble usar msg.mediaUrl, sem action por bolha.

**Em aberto:**
- Assinar as URLs de mídia dentro do GET /api/whatsapp/messages (THR-1/FE-6/DOC-3: p50 de 3 a 11 server actions por abertura de conversa) está em outra onda? Se não estiver, cabe aqui no mesmo padrão e é barato (getSignedUrl é CPU local).
- O ClientInfoModal.tsx ainda está montado em alguma tela? Se estiver, migrar junto para a rota do copilot.

## PR40 Leituras fora da fila (2/4): lista, hash e busca do inbox via GET
**Por que agora:** Tira a lista de 1.000 conversas e o hash da fila serial de server actions (FE-1 crítico): o clique deixa de esperar o poll. Entra depois de toda a onda A em conversations.ts.

**Deploy:** Só move código: A5/A3/A6 já estão dentro. No cliente, só 'import type'. As actions antigas ficam 1 deploy como wrappers (abas antigas). Validar Next-Action por minuto no PC do chefe.

### B2: inbox-types.ts (só tipos), inbox-data.ts (extração sem mudar lógica), rotas /api/whatsapp/inbox/{conversations,version,search}, hooks e busca/fetchedActive do WhatsAppInbox
Spec completa de B2 em **PR39**; aqui entra só: B2: inbox-types.ts (só tipos), inbox-data.ts (extração sem mudar lógica), rotas /api/whatsapp/inbox/{conversations,version,search}, hooks e busca/fetchedActive do WhatsAppInbox

## PR41 Leituras fora da fila (3/4): badges do cabeçalho numa rota só e fim dos polls órfãos
**Por que agora:** O chat desligado ainda é consultado a cada 20 s (BACK-11), e o foco enfileira 3-4 actions na frente do clique.

**Deploy:** Precisa entrar antes do PR50 (E4h mexe em page.tsx).

### B2: /api/team/badges { whatsappUnread, mentionsPending, devAlerts, eventsSoon }, use-header-badges, page.tsx, UserMenu, useUnread atrás de CHAT_ENABLED, use-mentions
Spec completa de B2 em **PR39**; aqui entra só: B2: /api/team/badges { whatsappUnread, mentionsPending, devAlerts, eventsSoon }, use-header-badges, page.tsx, UserMenu, useUnread atrás de CHAT_ENABLED, use-mentions

## PR42 Leituras fora da fila (4/4): Copiloto (ficha + documentos) num GET
**Por que agora:** Hoje abrir a conversa faz 2 actions em série e refaz a busca por telefone a cada vez (THR-9). Depende de C6/C7 (lógica de vínculo já final).

**Deploy:** export const maxDuration = 60 fica permanente, com comentário do porquê (waitUntil respeita o teto). As keys antigas ['wa-client-info'] e ['wa-client-docs'] são removidas.

### B2: copilot-data.ts, /api/whatsapp/inbox/copilot/[contactId], SWR no WhatsAppInbox e no CopilotPanel, apagar ClientInfoModal.tsx (conferir com knip)
Spec completa de B2 em **PR39**; aqui entra só: B2: copilot-data.ts, /api/whatsapp/inbox/copilot/[contactId], SWR no WhatsAppInbox e no CopilotPanel, apagar ClientInfoModal.tsx (conferir com knip)

## PR43 Inbox: sincronização da lista por delta
**Por que agora:** Troca a recarga de ~1,3 MB por um delta pequeno a cada mudança de hash. Depende de B2-2, A4 e do toque de updatedAt na mutação de tag do A1.

**Deploy:** O OR inclui contact.updatedAt e sai reads.some. EXPLAIN ANALYZE só de leitura antes de aposentar o hash, sem índice novo. mergeConversationDelta/sinceWithOverlap puros com teste.

**Medir antes/depois:**
- PR43 (B3): bytes por atualização da lista, ~1,3 MB → KB. Cargas completas por hora caem para poucas.

### B3 — Sincronização da lista por delta (listWhatsAppConversationsSince) aplicada no cache do SWR
Onda B_leituras_infra · esforço M · depende de B2, A4 · migration: não · micro: não · refs: GR-1, GR-8, FE-2, BACK-8, [MISSED lista] Tag, Encerrar e Assumir em conversa aberta pela busca ou agenda nunca aparecem aplicados

**Impacto:** A lista para de baixar as 1.000 conversas (~1,3 MB) a cada ~9,5 s por aba. Cada atualização passa a trazer só as poucas conversas que mudaram. A lista não 'pisca' nem pesa no pico, e tag ou encerramento aparecem nas outras abas em até 15 s. Conversa aberta pela busca ou pela agenda (fora do topo) também passa a refletir tag e encerramento.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/whatsapp/inbox-data.ts` | loadConversationsSince (novo, arquivo criado na B2) | novo | async loadConversationsSince(since: Date, cap = 300): Promise<{ items; cursor: string; full: boolean }>. cursor = SELECT now() do banco no início. where OR: updatedAt > since; lastMessageAt > since; reads.some.lastReadAt > since; tags.some.createdAt > since; contact.userId IN (User com updatedAt > since e role fora de TEAM_ROLES, take 500), para nome, coluna e ficha do card. Reusa loadConversations(where, cap + 1); se passar de cap → full: true. |
| `app/api/whatsapp/inbox/conversations/route.ts` | GET ?since= (rota da B2) | novo | Valida o ISO. since há mais de 24 h ou inválido → { full: true }. Devolve { items, cursor, full } e, na variante recomendada, também total. |
| `app/_actions/whatsapp/tags.ts` | toggleConversationTag | 49-59 | Na mesma $transaction do create/delete, 'tocar' a conversa com whatsAppConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }). Remover tag apaga a linha e não deixa rastro para o delta. updatedAt da conversa só é lido pelo hash (conversations.ts:434), então tocar é seguro. Se a onda A trocar o toggle por set/unset, o toque vai junto. |
| `app/_shared/utils/inbox-delta.ts` | mergeConversationDelta, sinceWithOverlap (novo) | novo | mergeConversationDelta<T extends { id; lastMessageAt }>(current: T[], incoming: T[], opts: { cap: number; lockedIds?: Set<string> }): upsert por id, ordena por lastMessageAt desc, corta em cap e não sobrescreve ids com patch otimista mais novo que o início da requisição. sinceWithOverlap(cursorIso, overlapMs = 5000): string. |
| `app/_shared/hooks/use-whatsapp.ts` | useWhatsAppConversations | 55-75 | cursorRef + inFlightRef. syncDelta() é fetch manual, e não mutate(): no SWR 2.3.8 o mutate apaga FETCH[key] e não deduplica. Aplica mutate(cur => mergeConversationDelta(...), { revalidate: false }). Lista completa só na montagem e com refreshInterval 600_000 (GR-8), ou quando full: true. refreshConversations passa a ser o delta: os chamadores (WhatsAppInbox.tsx:520, 527, 702, 713, 760, 803, 895, 1309, 1709, 1718, 1770) ficam baratos sem mudar a assinatura. reloadAll() para o full manual. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | listActive/fetchedActive, remoteResults | 468-485, 200-216 | Aplicar o mesmo merge por id em fetchedActive e remoteResults, para a conversa aberta fora do topo receber tag e encerramento. Se o GET do copilot ou do messages der 404 (contato excluído), remover do cache local. |
| `app/_actions/whatsapp/conversations.ts` | getWhatsAppInboxVersion (hash) | 430-442 | Variante recomendada: o poll de 15 s vira o próprio delta. Um delta vazio custa ~3 idas rápidas e nenhum seq scan, contra o hash, que faz seq scan de 130 mil mensagens (L438, BACK-4). A rota de versão da B2 fica transitória e é removida quando o delta estabilizar. |

**Passos:**
1. Implementar loadConversationsSince e o ?since= na rota da B2.
2. Tocar updatedAt da conversa no toggle de tag. syncCloseTag roda dentro do close, que já muda status e updatedAt, então já está coberto. applyFlowTagsToContact e qualifyToQueue só criam tag: cobertos por tags.createdAt.
3. Escrever inbox-delta.ts com os testes.
4. Trocar useWhatsAppConversations: full na montagem e a cada 10 min; delta disparado pela mudança de versão ou direto a cada 15 s (variante); delta no evento SSE só depois da A4 (guarda do onStream).
5. Aplicar o merge em fetchedActive e remoteResults.
6. Medir com a query da lista (1.000 linhas) no pg_stat_statements antes e depois.
7. /mapa-atualizar whatsapp: novo fluxo de sincronização, o que o delta cobre e o que não cobre.

**Regras tocadas:**
- O inbox atualiza por polling (agora delta), sem revalidatePath
- Tabela grande: nada de distinct do Prisma. O delta filtra whatsapp_conversations (~7,1 mil linhas), nunca whatsapp_messages
- Fuso: o delta compara instantes (timestamptz), não corta por dia, então não passa por date-br.ts
- Multi-número: o DTO continua com numberId/readOnly, o delta não mexe nisso

**Riscos:**
- Colisão de timestamps: @updatedAt e lastMessageAt são gravados com o relógio da instância que escreveu (engine do Prisma), não o do banco, e o commit pode chegar depois do SELECT. Mitigação: cursor = now() do banco, overlap de 5 s e merge idempotente. Duplicata é inofensiva.
- Exclusões (contacts.ts:241 apaga o contato e a conversa em cascata) não aparecem no delta. Quem excluiu remove localmente; as outras abas limpam no full de 10 min ou num 404 ao abrir.
- Encerramento e reabertura mudam status/closedAt → updatedAt, então vêm no delta e a conversa muda de pasta sozinha.
- Fora do delta, só no full de 10 min: tique de status da última mensagem (applyStatusUpdate só mexe em whatsapp_messages), nota interna (não toca a conversa), docsCount, rename/recolor e exclusão de tag (TAG-7).
- Patch otimista da onda A contra resposta do delta iniciada antes do clique: o merge ignora ids 'travados' com patch mais novo que o início da requisição. Sem isso a tag pisca.
- A lista local cresce com conversas novas e precisa do corte em LIST_PAGE para manter a semântica atual.
- O heartbeat de presença muda o User.updatedAt da equipe; o filtro por role evita puxar conversas por isso.

**Testes:**
- tests/inbox-delta.test.ts: item existente é substituído; item novo entra na posição certa por lastMessageAt; corte em cap; duplicata do overlap é idempotente; id em lockedIds não é sobrescrito; mudança para status 'closed' é aplicada; sinceWithOverlap subtrai 5 s e aceita ISO.

**Validação manual:** DevTools: em repouso, só GET ?since= (quase sempre items: []). Mensagem de um número de TESTE aparece na lista em até 15 s sem GET da lista completa. Tag e encerrar num contato de teste refletem na outra aba em até 15 s. Conversa aberta pela busca recebe a tag. Excluir o contato de teste: ele some das outras abas em até 10 min. SQL: chamadas da query da lista de 1.000 linhas caem de ~6,3/min por aba visível para ~0,1/min; o hash some do pg_stat_statements (variante).

**Revisão: ajustar**
- problema: Linhas conferidas: toggleConversationTag em tags.ts:49-59 (sem $transaction hoje); refreshConversations em WhatsAppInbox.tsx 520/527/702/713/760/803/895/1309/1709/1718/1770; listActive/fetchedActive 468-485; exclusão de contato em contacts.ts:241. Nenhum UPDATE cru em whatsapp_conversations/contacts: o @updatedAt é sempre gravado.
- problema: O delta esquece WhatsAppContact.updatedAt (coluna existe, schema model WhatsAppContact). Mudanças só no contato ficam fora até o full de 10 min: nome alinhado ao card (client-info.ts, dentro do getClientInfo), rename pela agenda, optedOut, vínculo userId (nome e card exibidos), clientDraft (fichaComplete) e adPlatform.
- problema: A cláusula reads.some.lastReadAt > since é redundante. markConversationRead e markConversationUnread sempre dão update na própria conversa (lastReadAt), e isso já muda updatedAt.
- problema: A afirmação 'nenhum seq scan' está errada. Não há índice em whatsapp_conversations.updatedAt, e o OR com relações vira seq scan das ~7,1 mil conversas com subplans. O custo é pequeno (ms), bem abaixo do hash sobre 130 mil mensagens, mas a spec não pode prometer o contrário.
- problema: 'updatedAt da conversa só é lido pelo hash' é impreciso. bot-funnel.ts:135/180 também o expõe no DTO do funil. Não há consumidor na UI e as métricas já usam closedAt (comentário do schema), então tocar updatedAt é seguro. Só corrigir a justificativa.
- problema: Conflito de arquivo com a onda A: toggleConversationTag (set/unset), patch otimista (lockedIds) e o hash (BACK-4). A dependência A4 está declarada, mas falta dizer que o 'toque' de updatedAt tem que seguir a função que a A deixar.
- ajuste: Adicionar { contact: { updatedAt: { gt: since } } } ao OR de loadConversationsSince. Sai da lista 'fora do delta' tudo o que é do contato.
- ajuste: Tirar reads.some do OR; ficam updatedAt, lastMessageAt, tags.some.createdAt, contact.updatedAt e o User do card (role fora de TEAM_ROLES).
- ajuste: Trocar 'nenhum seq scan' por 'seq scan de ~7 mil linhas, custo de poucos ms: medir com EXPLAIN ANALYZE antes de aposentar o hash'. Não criar índice agora.
- ajuste: Na tarefa de tags: 'aplicar o toque de updatedAt na mutação de tag que existir depois da onda A (toggle ou set/unset)'.
- ajuste: Ajustar a justificativa: 'updatedAt da conversa não participa de métrica (closedAt substituiu); bot-funnel só o repassa no DTO'.

**Em aberto:**
- Aposentar o hash de versão e deixar o delta ser o poll de 15 s? É o recomendado; depende de a onda A não estar reescrevendo o hash (BACK-4) em paralelo.
- O overlap de 5 s basta? Pode subir para 10 s se aparecer mudança perdida nos testes com duas abas.

## PR44 IA do Copiloto via POST fora da fila, com durationMs
**Por que agora:** Hoje resumo, sugestão e transcrição são actions de 2-4 s que seguram a fila da aba (DUR-4). Depende do PR39 (route-auth/sameOrigin) e do B5.

**Deploy:** sameOrigin é obrigatório em POST (sem Origin → 403). assistErrorStatus puro: not_configured → 503, com teste.

**Medir antes/depois:**
- PR44 (B4): actions de IA na fila da aba = 0. durationMs em wa_summary/wa_suggest = 100%.

### B4 — IA do Copiloto (resumo, sugestão, transcrição, ficha) via POST em route handler, com durationMs no log e resumo de vínculo em segundo plano
Onda B_leituras_infra · esforço M · depende de B2, B5 · migration: não · micro: não · refs: DUR-4, DUR-5, THR-6, [MISSED documentos] Abrir a conversa de um cliente com card pode travar a tela atrás de uma chamada de IA

Escopo neste PR: B4 (5 chamadores, incluindo WhatsAppComposer.tsx:634; sem usage de ficha/transcrição, que é do D9; sem o resumo de vínculo, que é do C6)

**Impacto:** Pedir resumo, sugestão ou transcrição não congela mais o inbox: enviar, tag e anexos seguem funcionando durante os 2-4 s da IA (até 30 s se o micro travar). 'Adicionar cliente' e o vínculo automático devolvem a ficha na hora, e o comentário 🤖 cai no card segundos depois. Se a IA falhar, a mensagem real aparece na tela, e não o erro genérico de server action. O gestor passa a ver quanto a IA do Copiloto demora.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/api/whatsapp/assist/[op]/route.ts` | POST (novo) | novo | op ∈ summary | suggest | transcribe | ficha. maxDuration = 60; dynamic='force-dynamic'. Chama sameOrigin(req) e teamRoute() da B2. Body { contactId } ou { messageId }. Chama as funções do lib com { id: ctx.userId, name: ctx.name ?? 'Atendente' }. Erro → JSON { error } com status de assistErrorStatus. |
| `app/_actions/whatsapp/assist.ts` | requireTeamMember, suggestWhatsAppReply, transcribeWhatsAppAudio, summarizeWhatsAppConversation, fillClientInfoWithAI | 14-25, 31-34, 40-43, 49-52, 60-63 | Mantidos como wrappers por 1 ciclo de deploy e depois removidos. O requireTeamMember local (1 findUnique por chamada) sai junto. |
| `app/_shared/lib/whatsapp/assist.ts` | ASSIST_TIMEOUT_MS, callAssist, suggestReplyForContact, summarizeConversationForAgent, summarizeConversationToCard, transcribeMessageAudio | 17, 31-62, 100-136 (log 124-133), 142-176 (log 164-173), 182-237 (log 224-233), 243-290 (log 279-287) | Medir só a chamada à IA: const t0 = Date.now() em volta de callAssist, gravando metadata: { usage, durationMs } (transcrição: { durationMs }). callAssist lança AssistError com code ('timeout' | 'offline' | 'upstream' | 'not_found' | 'bad_input') em vez de Error genérico; as mensagens PT-BR continuam. ASSIST_TIMEOUT_MS fica em 30 s: fora da fila o timeout deixa de congelar a aba. |
| `app/_shared/lib/whatsapp/ficha-ai.ts` | autoFillClientInfo (logs wa_ficha_ai) | 329, 347 | Adicionar durationMs, medido só em volta da chamada ao Haiku, no metadata do log (o usage já existe). |
| `app/_actions/whatsapp/client-info.ts` | getClientInfo (vínculo) / addClientFromConversation | 141-152, 289, 343 | Trocar await summarizeConversationToCard(...) por runAfterResponse('resumo-card', () => summarizeConversationToCard(...)) (helper da B5). No getClientInfo isso vale no loadCopilot da B2 (copilot-data.ts). |
| `app/nova-dash/layout.tsx` | NovaDashLayout (segment config) | 13-14 | export const maxDuration = 60, ao lado do dynamic. O resumo em segundo plano disparado pela server action addClientFromConversation não pode ser cortado pelo teto padrão do projeto (/nova-dash não declara maxDuration hoje). |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | handleSummarize, handleSuggest, handleFillFichaAI | 144-168, 189-205 | Trocar a server action por postJson('/api/whatsapp/assist/<op>', { contactId }) (fetch-json.ts da B2). Os guards summarizing/suggesting/fillingFicha continuam contra clique duplo. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | WaAudioBubble.handleTranscribe | 2591-2603 | postJson('/api/whatsapp/assist/transcribe', { messageId: msg.id }). |
| `app/_shared/utils/assist-errors.ts` | assistErrorStatus (novo) | novo | Função pura code → HTTP: timeout → 504, offline/upstream → 502, not_found → 404, bad_input → 400, desconhecido → 500. |

**Passos:**
1. Depois do runAfterResponse da B5 e do route-auth/fetch-json da B2: criar AssistError + assistErrorStatus e medir durationMs no lib (assist.ts e ficha-ai.ts).
2. Criar a rota POST /api/whatsapp/assist/[op] com sameOrigin + teamRoute + maxDuration 60.
3. Trocar os 4 chamadores de UI para postJson.
4. Resumo ao vincular e 'Adicionar cliente' em segundo plano. Adicionar maxDuration 60 no layout da /nova-dash.
5. Validar no preview (cle1) com um contato de teste; depois remover os wrappers antigos.
6. /mapa-atualizar whatsapp: rotas de assist, durationMs e resumo em background.

**Regras tocadas:**
- Toda chamada de IA grava metadata.usage (mantido; durationMs é aditivo)
- Rota da equipe com requireTeam lendo o banco; fora das allowlists
- A IA do Copiloto só ajuda: quem decide e envia é o humano (nada muda no cérebro/bot.ts)
- Erro de server action é mascarado em produção: a rota devolve a mensagem própria
- Limite de 4,5 MB: os corpos são ids; a transcrição usa URL pré-assinada do S3

**Riscos:**
- CSRF: POST com cookie fora do mecanismo de server actions. SameSite=Lax do NextAuth já barra POST cross-site; o sameOrigin (Origin = Host) é a segunda barreira. Gasto de IA não pode ser disparado por terceiros.
- Resumo em segundo plano falha sem feedback na tela (já era best-effort, com console.error). O comentário 🤖 aparece com atraso: se o atendente abrir o card na hora, ainda não está lá.
- Se o maxDuration padrão for curto (projeto sem Fluid), a waitUntil é cortada no teto da função. Daí o maxDuration 60 explícito.
- durationMs do Copiloto ≠ durationMs do wa_bot (que é a idade da conversa, bot.ts:1432-1438). Documentar para o painel não somar os dois.
- A transcrição segue sem metadata.usage: o micro /transcribe (D:\Chatbot_whatsapp\index.js:186-202) devolve só { transcript }. Corrigir exige deploy do micro antes (FE-12), fora desta onda salvo decisão.

**Testes:**
- tests/assist-errors.test.ts: cada code mapeia para o status certo; code desconhecido → 500; a mensagem PT-BR é preservada.

**Validação manual:** DevTools com contato de TESTE: clicar Resumo e, durante a espera, clicar tag e enviar. Os POSTs saem na hora (antes esperavam). Logs wa_summary, wa_suggest, wa_transcribe e wa_ficha_ai com metadata.durationMs (SQL: p50/p90 por ação). 'Adicionar cliente' devolve a ficha em menos de 1 s e o comentário 🤖 aparece no card em seguida. No preview, com CHATBOT_URL inválido, a UI mostra 'Serviço de IA fora do ar…' e não o erro genérico. Logado como cliente de teste → 403.

**Revisão: ajustar**
- problema: Linhas conferidas: assist.ts (lib) 17, 31-62, 100/124-133, 142/164-173, 182/224-233, 243/279-287; assist.ts (action) 14-25/31/40/49/60; client-info.ts 151/289/343; CopilotPanel 148/162/193-197; WhatsAppInbox.tsx 2591-2603; ficha-ai.ts logs em 330/348 e chamada ao Haiku em 230; layout.tsx:14 com dynamic.
- problema: Faltou um chamador: WhatsAppComposer.tsx:634 também chama suggestWhatsAppReply (botão de sugestão no composer). Ele continua na fila serial e quebra quando os wrappers forem removidos.
- problema: Regra inviolável de metadata.usage: ficha-ai.ts não grava usage em dois caminhos, na recusa (L237-239) e no 'nenhum campo novo' (L264-271). O botão 'Preencher com IA' que esta onda leva para a rota passa justamente por esses caminhos (resultado mais comum), e o gasto some do Canto da IA. Pôr durationMs só nos logs 330/348 deixa esses casos sem nada.
- problema: A transcrição também não grava usage (o micro /transcribe devolve só transcript). A regra já é violada hoje; a spec deixa como pergunta, mas precisa de um dono (deploy do micro antes).
- problema: sameOrigin comparando Origin com Host: atrás do proxy da Vercel o Next compara Origin com x-forwarded-host (fallback host). Usar só Host pode dar 403 falso.
- problema: callAssist com 'não configurado' (CHATBOT_URL vazio) não tem code definido no AssistError.
- problema: Vale também aqui o ponto da B2: o maxDuration da rota do copilot não pode sair depois do background.
- ajuste: Incluir WhatsAppComposer.tsx:634 → postJson('/api/whatsapp/assist/suggest', { contactId }) na lista de chamadores (são 5, não 4).
- ajuste: Em ficha-ai.ts: medir t0 em volta de client.messages.create (L230) e gravar logWhatsAppEvent wa_ficha_ai com metadata { usage, durationMs, filled: [] } também na recusa e no 'nenhum campo novo', talvez com message 'IA não encontrou dados novos'. Se a onda do bot já cuidar disso (MISSED bot_latencia), referenciar e não duplicar.
- ajuste: sameOrigin(req): new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host')). Sem Origin num POST → 403.
- ajuste: AssistError code 'not_configured' → 503 em assistErrorStatus, mais o caso no teste.
- ajuste: Registrar a transcrição sem usage (FE-12) como dependência explícita: mudança no micro (index.js /transcribe devolvendo usage), deploy do micro antes, depois gravar usage no wa_transcribe.

**Em aberto:**
- Qual o maxDuration padrão hoje (depende do Fluid Compute)? Define se o maxDuration 60 no layout é obrigatório ou só defensivo.
- Registrar o usage da transcrição (FE-12, precisa de deploy do micro) está em outra onda?
- Renomear o durationMs do wa_bot para conversationAgeMs e medir a latência do bot (DUR-5, parte do bot.ts) fica na onda do bot?

## PR45 Relay SSE: diagnóstico e log sem texto no relay
**Por que agora:** O tempo real não entrega (regressão de 0,01 recarga por evento). Só é seguro religar depois da guarda do A4, do delta do B3 e do log do B5.

**Deploy:** Deploy do relay no Railway. Antes, confirmar com o usuário a retirada do texto do log (index.js:97 diz 'Log pedido'); meio-termo: logar só o tamanho. Checar ALLOWED_ORIGIN, réplicas e os ids de 'conectou' contra os User.id da equipe.

**Medir antes/depois:**
- PR45 (B6): delivered > 0 no log do broadcast e recarga por evento do SSE deixa de ser 0,01 (ou decisão consciente de manter o relay desligado).

### B6 — Relay SSE não entrega: log de res.status/delivered no broadcast e roteiro de diagnóstico (só depois da guarda do onStream)
Onda B_leituras_infra · esforço P · depende de A4, B3, B5 · migration: não · micro: **sim (antes do CRM)** · refs: GR-3, GR-4, GR-7, [MISSED backend] O tempo real (SSE) provavelmente não entrega na maioria das abas

Escopo neste PR: B6 (parte do relay D:\chat_site + roteiro de diagnóstico; o log do CRM já entrou no PR22)

**Impacto:** Mensagem nova do cliente aparece na lista e na thread em 1-3 s em vez de ~8 s (mediana) e até ~15 s. Hoje a falha é silenciosa: o servidor gasta ~50-80 ms por evento chamando o relay e ninguém recebe. Também tira o texto das conversas dos logs do Railway (LGPD).

**Ação do usuário:** Railway: ler os logs e as envs do relay (ALLOWED_ORIGIN, CHAT_RELAY_SECRET, número de réplicas) e fazer deploy do index.js sem o texto no log. Vercel: ler os logs de /api/chat/token e '[CHAT RELAY]'. Abrir o DevTools no navegador do chefe. Ajustar ALLOWED_ORIGIN se for o caso.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/lib/chat-relay.ts` | broadcastToRelay | 42-57 | Ler a resposta: !res.ok → console.warn('[CHAT RELAY] /broadcast HTTP', res.status, input.channelId). O relay responde { ok, delivered } (D:\chat_site\index.js:100): delivered === 0 → console.warn('[CHAT RELAY] entregue a 0 conexões', channelId, recipients.length), no máximo 1 vez por minuto por instância. Nunca logar message/body. Pode ir no mesmo deploy da B5, porque é só log. |
| `D:\chat_site\index.js` | POST /broadcast (log) | 98 | Tirar message?.body do log. Hoje loga o texto de toda mensagem de cliente, contrariando o próprio comentário da L15 'Sem dados sensíveis'. Deploy no Railway. |
| `app/_shared/hooks/use-chat.ts` | useChatStream (onerror) | 154-161 | Opcional: backoff exponencial (3 s → 60 s) em vez de 3 s fixo (L157). Com CORS ou segredo errado, hoje cada aba martela /api/chat/token a cada ~3 s. |

**Passos:**
1. Pré-condição: a guarda do onStream (A4) em produção (debounce, aba oculta, delta em vez da lista inteira) e o delta da B3. Consertar o relay antes disso = GR-4 (+57% de cargas completas).
2. Deploy do log de status/delivered e ler '[CHAT RELAY]' nos logs da Vercel por 1 dia útil. HTTP 403 = CHAT_RELAY_SECRET diferente entre Vercel e Railway. 'entregue a 0' sempre = nenhum navegador conectado.
3. (Usuário) Vercel logs: frequência de GET /api/chat/token por usuário. Uma chamada a cada ~3 s = EventSource falhando em loop (use-chat.ts:154-158).
4. (Usuário) Railway: env ALLOWED_ORIGIN exatamente igual à origem que a equipe usa (https://segurosparana.com.br, www ou *.vercel.app; o exemplo em railway/chat-relay.md é vercel.app). CHAT_RELAY_SECRET igual ao da Vercel. Réplicas = 1 (o mapa de conexões fica em memória, index.js:27). Logs 'conectou <userId>' e 'entregue a N'. GET /health → usersOnline.
5. (Usuário) No computador do chefe: DevTools → Network → events?token=. 200 pendente na aba EventStream = conectado; 401 = token/segredo; erro de CORS no Console = ALLOWED_ORIGIN.
6. Corrigir a config (usuário) ou decidir tirar o SSE do inbox e ficar com o delta a cada 5-10 s (B3). Registrar a decisão no mapa.
7. Deploy do relay sem body no log (Railway).

**Regras tocadas:**
- Microserviço fora do repo tem deploy próprio: mexer só no Next não muda o relay
- Nunca logar dado pessoal ou texto de cliente (LGPD)
- Rota do relay (Railway) não passa pelo middleware; /api/chat/token continua exigindo sessão

**Riscos:**
- Consertar o relay antes da A4 faz cada evento recarregar a lista inteira em toda aba montada, inclusive oculta.
- cors({ origin: ORIGIN }) aceita uma origem só: se a equipe usa dois domínios, o relay precisa de lista.
- O log de 0 conexões pode poluir: por isso a amostragem de 1/min por instância.
- Sem nenhuma correção, o comportamento atual continua (polling). O log sozinho não muda a UX.

**Testes:**
- Sem teste automatizado (integração com serviço externo). npx tsc --noEmit e npx eslint nos arquivos alterados.

**Validação manual:** Depois do conserto: logs do Railway com 'entregue a N' e N ≥ abas abertas. SQL da auditoria (GR-3): 'recebida → markRead de quem está com a conversa aberta' cai da mediana de 7,6 s para ~2,7 s. Mensagem de um número de TESTE aparece na lista em 1-3 s. Vercel sem '[CHAT RELAY] HTTP'. /api/chat/token em ~1 chamada por aba por abertura, não a cada 3 s.

**Revisão: ajustar**
- problema: Linhas conferidas: chat-relay.ts 42-57 não lê a resposta; D:\chat_site\index.js L15 (comentário 'Sem dados sensíveis'), L27 (Map em memória), L98 (log com message?.body) e L100 ({ ok, delivered }); use-chat.ts 154-161 com reconexão fixa de 3 s (L157).
- problema: Contradição com dado observado: logo acima do log, index.js:97 diz 'Log pedido: apenas id da msg + o texto enviado'. O texto no log foi PEDIDO de forma deliberada. Tirar o body é decisão do usuário, não correção automática. Mesmo sendo LGPD, precisa de confirmação no chat.
- problema: O roteiro de diagnóstico não inclui conferir a identidade da conexão. O relay registra a conexão pelo userId do token (session.user.id do JWT, api/chat/token/route.ts:20) e entrega por whatsappRecipients() (User.id do banco). Com PrismaAdapter eles devem bater, mas 'entregue a 0' com 'conectou <id>' no log é exatamente o sintoma de ids diferentes.
- problema: cors({ origin: ORIGIN }) com ALLOWED_ORIGIN ausente vira '*' (index.js:10). Então CORS só é a causa se a env existir e estiver errada. O roteiro já cobre.
- ajuste: Passo de deploy do relay: 'confirmar com o usuário a remoção do texto do log (o comentário L97 diz que foi pedido)'. Opção de meio-termo: logar só o tamanho do body.
- ajuste: Incluir no roteiro: comparar os ids em 'conectou <userId>' do Railway com os User.id da equipe (role ADMIN*). Com a amostragem de 'entregue a 0', logar recipients.length e se o relay tem clientes (usersOnline via /health).
- ajuste: Manter o log de res.status/delivered no mesmo deploy da B5 (só log, sem mudar comportamento) e o backoff exponencial do onerror como opcional.

**Em aberto:**
- A equipe acessa o CRM por mais de um domínio (apex, www, vercel.app)?
- Se a causa for estrutural (réplicas, proxy), vale manter o SSE no inbox ou só o delta de 5-10 s?

## PR46 Inbox: filtros de tag, data e coluna no servidor, com total real
**Por que agora:** Hoje o filtro de tag e o de data mentem: a tag Contratados mostra 124 de 276 e 'Este mês' mostra 861 de 1.608. Entra sobre a rota GET do B2-2 e depois do A5.

**Deploy:** Implementar como parâmetros de /api/whatsapp/inbox/search (inbox-data.ts), não como action nova. brDayRangeToInstants em date-br.ts. buildInboxWhere/mergeLiveIntoFiltered puros com teste.

**Medir antes/depois:**
- PR46 (E3): tag Contratados na linha ativa 124/276 → 276/276. 'Este mês' 861/1.608 → 1.608. O aviso de corte fica coerente com o total real.

### E3 — Filtros de tag, data de entrada e coluna do Kanban no servidor, com total real e avisos honestos
Onda E_paineis_ux · esforço G · depende de — · migration: não · micro: não · refs: LISTA-3, TAG-2, FE-4

**Impacto:** Filtrar 'Contratados' passa a trazer os 364, não 129, com 'X de Y' vindo do banco. 'Este mês' mostra todas as conversas do mês. O inbox para de afirmar 'em todas as pastas' para um número parcial e avisa sempre que a lista mostrada é só o recorte recente.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/conversations.ts` | queryWhatsAppConversations (novo) | perto de 450-474 (searchWhatsAppConversations) | export async function queryWhatsAppConversations(f: InboxServerFilter): Promise<{ items: WhatsAppConversationDTO[]; total: number }>, com requireTeam() de permissions-server (não o requireTeamMember local). InboxServerFilter = { term?, tagIds?, fromDay?, toDay?, labelId?, numberId?, skip? }. Usa loadConversations(where, FILTER_PAGE=300) + db.whatsAppConversation.count({ where }). searchWhatsAppConversations vira wrapper ({ term }). |
| `app/_actions/whatsapp/conversations.ts` | loadConversations (linkedUsers) / kanbanColumn | 282-297, 403 | Selecionar label: { select: { id: true, name: true } } no linkedUsers; kanbanColumn = user.label?.name ?? user.role; novo campo DTO kanbanLabelId. |
| `app/_shared/utils/inbox-filter.ts (novo)` | buildInboxWhere, mergeLiveIntoFiltered | novo | buildInboxWhere(f, ctx: { cardIdsForTerm: string[]; userIdsForLabel: string[] | null }): Prisma.WhatsAppConversationWhereInput (AND de term OR, tags.some.tagId in, createdAt {gte, lt}, contact.userId in, numberId). mergeLiveIntoFiltered(filtered, live) troca itens por contactId pela versão mais recente (lastMessageAt maior). |
| `app/_shared/utils/date-br.ts` | brDayRangeToInstants (novo) | depois de 148-157 (brLocalToDate) | brDayRangeToInstants(fromKey, toKey): { gte: Date; lt: Date } = brLocalToDate(`${from}T00:00`) até a meia-noite BRT do dia seguinte ao toKey. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | busca/filtros | 195-219 (efeito da busca), 244-265 (dateRange/columnFilter), 568-595 (searchUniverse/filtered), 599-615 (dateCount/kanbanColumns), 686-692 (tagFilterActive) | Um efeito só (debounce 350 ms + seq como searchSeq) chama queryWhatsAppConversations quando há termo ≥2, tag, data ou coluna, e guarda remote {items,total}. Com filtro de servidor ativo, searchUniverse = mergeLiveIntoFiltered(remote.items, conversations), e filtered NÃO reaplica tag, data e coluna (só leitura, fila e número). columnFilter passa a ser o labelId, com opções via useSWR(getLabels). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | textos e avisos | 1043 (contador da data), 1158-1173 (opções de coluna), 1180 (title 'busca em todas as pastas'), 1283-1297 (faixa '{N} resultados … em todas as pastas'), 1395-1404 (carregar mais), 1409-1416 (aviso de corte só com !tagFilterActive) | A faixa passa a dizer '{items} de {total} com esses filtros, em todo o histórico', com 'Carregar mais' (skip += 300) quando items < total. O title da tag vira 'Filtrar por tag (em todo o histórico)'. O aviso de corte aparece SEMPRE que não houver filtro de servidor e houver pasta, leitura ou número ativo: 'Mostrando as 1.000 conversas mais recentes (desde DD/MM) de N — pastas e filtros de leitura/número valem só para elas'. O chip de data mostra remote.total. |
| `app/_shared/hooks/use-whatsapp.ts + conversations.ts + WhatsAppInbox.tsx` | comentários | use-whatsapp.ts 78-79, 94-102; conversations.ts 72-73; WhatsAppInbox.tsx 190, 240-243 | Corrigir os comentários desatualizados ('capada em 200', 'polling 5s', 'filtra só as 1.000 carregadas'). |

**Passos:**
1. Criar brDayRangeToInstants + buildInboxWhere + mergeLiveIntoFiltered, com os testes.
2. queryWhatsAppConversations: resolver cardIds do termo (como em 458-463) e userIds da coluna (db.user.findMany({ where: { labelId }, select: { id } })), montar o where, rodar findMany (via loadConversations) e count em paralelo.
3. DTO: kanbanColumn pelo nome da Label (fonte da verdade = labelId) + kanbanLabelId.
4. Inbox: unificar os efeitos de busca e filtro; ao mudar a versão (hash) com filtro de servidor ativo, rebuscar no máximo a cada 30 s. No intervalo, sobrepor as versões frescas da lista viva (mergeLiveIntoFiltered).
5. Reescrever os textos enganosos e os avisos de lista parcial.
6. Corrigir os comentários desatualizados.

**Regras tocadas:**
- Fuso: dia 'YYYY-MM-DD' de Brasília → instante via date-br.ts (nunca new Date('YYYY-MM-DD'))
- Server action nova com requireTeam() de permissions-server (não copiar o requireTeamMember por JWT)
- Coluna do card é labelId; role é só cópia do nome
- Multi-número: numberId entra no where quando o filtro de número está ativo junto
- Sem distinct do Prisma em whatsapp_messages (loadConversations já usa LATERAL)

**Riscos:**
- O filtro pelo labelId pode dar contagem diferente da atual (baseada em role) quando role e label divergem (coluna renomeada): é o comportamento mais correto, avisar a equipe.
- Com filtro ativo, uma conversa que muda de tag ou de data só entra ou sai do resultado no próximo refetch (até 30 s).
- O toggle de tag numa conversa vinda do resultado filtrado continua sem atualização otimista ([MISSED frontend] tag fora do top 1.000). Depende da onda que corrige TAG-1/TAG-3.
- getLabels (app/_actions/labels/get-labels.ts) não tem guard nenhum. Não piora aqui, mas fica o registro.
- Cada troca de filtro é +1 server action na fila serial (LISTA-4). O debounce é obrigatório.

**Testes:**
- tests/date-br.test.ts: brDayRangeToInstants('2026-09-01','2026-09-24') → gte 2026-09-01T03:00:00Z, lt 2026-09-25T03:00:00Z; de = até (um dia só).
- tests/inbox-filter.test.ts: buildInboxWhere combina term, tag, data, coluna e número em AND; sem filtro devolve {}; coluna sem cards devolve userId in [] (resultado vazio, não 'tudo'); mergeLiveIntoFiltered troca pela versão mais nova e não duplica.

**Validação manual:** Linha ativa, tag 'Contratados': a faixa mostra algo como '300 de 364 … em todo o histórico', com Carregar mais até 364 (confere com SELECT count na tabela de tags). 'Este mês' ≈ 1.609 no total. Coluna do Kanban de teste: o total bate com o nº de cards da coluna com conversa. Sem filtro, numa pasta de desfecho (ex.: Qualificadas), aparece o aviso 'mostrando as 1.000 mais recentes (desde DD/MM)'. A busca por nome continua achando conversa antiga.

**Revisão: ajustar**
- problema: Linhas conferem (195-219, 244-265, 568-615, 686-692, 1043, 1158, 1180, 1283-1297, 1395-1416; conversations.ts 282-297 e 403; comentários 190, 240-243, use-whatsapp 78-79 e 94-102, conversations 72-73).
- problema: Buraco de semântica: hoje só tag/busca ignoram a pasta (tagFilterActive, 689-690). Com data ou coluna no servidor e pasta ativa (ex.: 'Este mês' + Qualificadas), a pasta, o readFilter e a paginação de 300 filtram de novo no cliente uma PÁGINA do resultado. O 'X de Y' volta a mentir, o mesmo sintoma do LISTA-3.
- problema: loadConversations(where, take) (180-183) não tem skip. 'Carregar mais (skip += 300)' exige mudar a assinatura.
- problema: A coluna por labelId inclui cards arquivados (User.archivedAt), e a validação 'bate com o nº de cards da coluna' compara com o board, que não mostra arquivados.
- problema: Filtros restaurados pelo E4b disparam queryWhatsAppConversations no mount, mais uma action na fila (LISTA-4).
- ajuste: Definir `serverFilterActive = termo≥2 || tag || data || coluna` e, com ele ativo, tornar a lista global como já é com tag (seções por pasta sobre o resultado). Alternativa: levar a pasta ao where (status + closeCategory, mapeamento direto de groups 625-646). readFilter 'fila' vira `status: 'queued'` no where; 'lidas/não lidas' continua no cliente, com o texto 'leitura filtrada só nesta página'.
- ajuste: `loadConversations(where, take, skip = 0)`.
- ajuste: `db.user.findMany({ where: { labelId, archivedAt: null }, select: { id: true } })`.
- ajuste: Manter o debounce de 350 ms e o seq, e não rebuscar pelo hash se a aba estiver oculta.

**Em aberto:**
- Levar também as pastas de desfecho (Qualificadas, Descartados…) para o servidor? A spec só avisa que elas mostram o recorte recente.
- Tamanho da página do filtro: 300 (igual à busca) ou 500?

## PR47 Mídia da conversa com nome legível
**Por que agora:** Esforço P e pré-requisito do C4. Acaba com os anexos chamados 'midia.jpeg'.

**Deploy:** mediaDisplayName puro com os testes da spec (out-…-audio.ogg, contrato-kit-…pdf). image/webp vira 'Figurinha'. Os segundos entram no nome.

**Medir antes/depois:**
- PR47/PR48 (C5/C4): Documents novos com nome 'midia.*' = 0. % de fotos recebidas anexadas ao card sobe de 2,7%. Documentos fora da janela de 50 mensagens (31%) aparecem na aba Arquivos.

### C5 — Nome legível padrão para mídia da conversa ('Foto 24-09-2026 14h32.jpeg')
Onda C_documentos · esforço P · depende de — · migration: não · micro: não · refs: DOC-2

**Impacto:** A equipe deixa de ver 50 arquivos 'midia.jpeg'. Na conversa, na lista do Copiloto e no card, a mídia aparece como 'Foto 24-09-2026 14h32.jpeg', 'Áudio …' ou 'Vídeo …', no horário de Brasília. O PDF mantém o nome que o cliente mandou.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_shared/utils/media-name.ts` | mediaDisplayName (novo) | novo arquivo | `mediaDisplayName({ key, mediaType, createdAt }): string`. Se o nome tirado da key (sem o prefixo `^\d{10,}-`, decodificado) for o default `midia.<ext>`, `audio.ogg` ou vazio, monta `${rótulo} ${dd-mm-aaaa} ${HH}h${mm}.${ext}` com rótulo por mediaType (Foto, Vídeo, Áudio, Documento), usando `brDateTimeParts` de app/_shared/utils/date-br.ts. Senão, devolve o nome original (troca '_' por espaço). |
| `app/_actions/whatsapp/client-documents.ts` | attachConversationMediaToCard | 110-152 (select 113-116; nome 122-125) | Acrescentar `mediaType, createdAt` no select e trocar o cálculo do nome por `mediaDisplayName(...)`. A categoria continua `inferCategory(name)` (a pasta explícita vem em C4). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | fileNameFromKey / WaMediaBubble.docName | 65-72, 2420 | `docName = mediaDisplayName({ key: mediaKey, mediaType, createdAt: msg.createdAt })`. Remover fileNameFromKey se ficar sem uso. |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | fileNameFromKey / lista 'não anexada' | 54-58, 949 | Usar mediaDisplayName. C4 reescreve essa lista; se C4 vier junto, aplicar lá. |

**Passos:**
1. Criar media-name.ts, mais o teste com fuso.
2. Usar no attach e na exibição (inbox e Copiloto).
3. NÃO mudar o formato da key em downloadMediaToS3 (client.ts:646-649): há parsers de `^\d{10,}-` e o script C1b usa a key como está.

**Regras tocadas:**
- Fuso: todo corte de data e hora por date-br.ts (brDateTimeParts), nunca getHours/getDate crus
- Utilitário puro e testável em app/_shared/utils

**Riscos:**
- ':' é inválido em nome de arquivo no Windows: no download o navegador troca por '_' ou '-'. Por isso '14h32' no lugar de '14:32'.
- 'Áudio' e 'Vídeo' com acento no Content-Disposition dependem do filename* de C3. Sem C3, o download pode sair com o nome truncado ou garbled (a exibição fica certa).

**Testes:**
- tests/media-name.test.ts: key 'whatsapp/c/1727000000000-midia.jpeg', image/jpeg, createdAt '2026-09-25T02:30:00Z' = 'Foto 24-09-2026 23h30.jpeg' (fuso de Brasília, dia anterior em UTC); audio/ogg com 'audio.ogg' = 'Áudio 24-09-2026 23h30.ogg'; key '…-Laudo_hospital.pdf' = 'Laudo hospital.pdf'; decodeURIComponent inválido não lança.

**Validação manual:** Mandar uma foto do celular de teste e ver o nome 'Foto dd-mm-aaaa HHhMM.jpeg' na lista do Copiloto. Anexar e conferir o mesmo nome no card (pasta OUTROS, como hoje). Mandar um PDF com nome e ver o nome original preservado.

**Revisão: ajustar**
- problema: Conferido: client-documents.ts:110-152 (select 113-116, nome 122-125), WhatsAppInbox.tsx:65-72/2420, CopilotPanel.tsx:54-58/949 e brDateTimeParts em date-br.ts:160-171 (devolve {day:'YYYY-MM-DD', time:'HH:mm'}).
- problema: O padrão de key não é só `<ts>-nome`. A mídia do atendente é `whatsapp/<cid>/out-<ts>-<nome>` (send-message.ts:365), inclusive o PTT gravado ('audio.ogg'). A assinatura grava `assinatura-<ts>.png` e `contrato-kit-<ts>.pdf`. Com a regex `^\d{10,}-` o 'audio.ogg' da equipe nunca é reconhecido como default. O áudio recebido chega como `midia.ogg` (client.ts:643-646).
- problema: Colisão por minuto: o cliente manda frente e verso do RG no mesmo minuto, e o card fica com vários 'Foto 24-09-2026 14h32.jpeg' iguais.
- problema: Figurinha (sticker, image/webp) vira 'Foto'.
- ajuste: mediaDisplayName: remover `^(out-)?\d{10,}-` e tratar `midia.<ext>`/`audio.<ext>` como default nos dois sentidos.
- ajuste: Incluir os segundos ('14h32m05') ou um sufixo sequencial no attach em lote (C4 já numera com baseName).
- ajuste: image/webp de sticker vira 'Figurinha'.
- ajuste: Testes: 'whatsapp/c/out-1727000000000-audio.ogg' → 'Áudio …ogg' e 'whatsapp/c/contrato-kit-1727000000000.pdf' → nome preservado.

**Em aberto:**
- Formato final do nome: 'Foto 24-09-2026 14h32.jpeg' está bom? ('14:32' não é aceito no Windows.)

## PR48 Copiloto: Arquivos e Notas de todas as mídias do contato, com seleção múltipla
**Por que agora:** Hoje 31% dos documentos recebidos ficam fora da janela de 50 mensagens, e só 2,7% das fotos recebidas chegam ao card. Depende de C1, C3 e C5.

**Deploy:** GET /api/whatsapp/contact-files (fora da fila), páginas de 24 com img lazy. O helper attachOne grava document_add nos dois caminhos.

**Medir antes/depois:**
- PR47/PR48 (C5/C4): Documents novos com nome 'midia.*' = 0. % de fotos recebidas anexadas ao card sobe de 2,7%. Documentos fora da janela de 50 mensagens (31%) aparecem na aba Arquivos.

### C4 — Aba Arquivos e Notas do Copiloto a partir de TODAS as mídias e notas do contato, com seleção múltipla
Onda C_documentos · esforço M · depende de C3, C5, C1 · migration: não · micro: não · refs: THR-3, FE-7, [MISSED documentos] A lista 'mídia ainda não anexada' do Copiloto só mostra as 50 mensagens mais recentes, DOC-2

**Impacto:** O RG ou laudo mandado no começo da triagem aparece na aba Arquivos sem 'carregar anteriores'. São 1.293 fotos, PDFs e vídeos do cliente que hoje ficam fora, em 263 conversas. A aba mostra miniaturas, só o que o CLIENTE mandou por padrão (sem os vídeos e áudios do bot) e tem 'Selecionar todas' com 'Anexar selecionadas' na pasta e com o nome escolhidos. As notas antigas voltam a aparecer na aba Notas.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/api/whatsapp/contact-files/route.ts` | GET (novo) | novo arquivo | `GET ?contactId=&kind=media|notes&direction=in|all&onlyUnattached=1&before=<ISO>&limit=40`. Faz requireTeam() (try/catch 403). Para media: `whatsAppMessage.findMany({ where: { contactId, deletedAt: null, mediaKey: { not: null }, …direction, …(onlyUnattached && { mediaKey: { notIn: attachedKeys } }) }, orderBy: { createdAt: 'desc' }, take: limit + 1, select: { id, mediaKey, mediaType, direction, sentByBot, createdAt } })`. attachedKeys = keys de Document ativos do userId, ou do draftDocuments sem vínculo. Devolve `{ items: [{ …, name: mediaDisplayName(), mediaUrl, mediaUrlExpiresAt }], hasMore, unattachedCount }`. Para notes: `internal: true`, com body, authorId/authorName e sentByBot. Usa o índice (contactId, createdAt), máximo medido de 468 msgs por contato. |
| `app/_shared/hooks/use-whatsapp.ts` | useWhatsAppContactFiles (novo) | após 156 | SWR (ou useSWRInfinite de 'swr/infinite', já incluso no swr 2.3.8) com 'carregar mais' pelo cursor `before`. Sem refreshInterval: revalida no evento 'wa-docs-changed' e depois de salvar a nota. |
| `app/_actions/whatsapp/client-documents.ts` | attachConversationMediaBatch (novo) + helper interno attachOne | 110-152 (refatorar attachConversationMediaToCard) | `attachConversationMediaBatch(contactId: string, messageIds: string[], opts?: { category?: DocumentCategoryId; baseName?: string }): Promise<ClientDocumentDTO[]>`. Usa requireTeam() (padrão novo) e aceita no máximo 50 ids. Exige `msg.contactId === contactId` em todos. Mantém a mesma deduplicação e restauração da lixeira do attach unitário. Nome = `baseName ? `${baseName} ${i+1}.${ext}` : mediaDisplayName`. Categoria = opts.category validada por isDocumentCategory, senão inferCategory. Um createLog 'document_add' no card com os nomes. attachConversationMediaToCard passa a chamar o mesmo helper não exportado. |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx` | mediaMessages/handleAttach, notes, handoffNote, ArquivosTab (lista 'não anexada') | 258-278, 224-227, 178-184, 565-574, 850-984 (lista em 931-966) | Trocar a derivação de `messages` (janela de 50) pelo hook novo. ArquivosTab ganha uma grade de miniaturas (`<img loading="lazy">` com mediaUrl; ícone para PDF, áudio e vídeo), checkbox por item, 'Selecionar todas', seletor de pasta (DOCUMENT_CATEGORIES) e de nome-base, 'Anexar selecionadas (N)' e o toggle 'Só do cliente' (padrão ligado). A seção vem ABERTA quando há mídia do cliente. Notas e 'Por que caiu na fila' (handoffNote) passam a vir de kind=notes. Recomendado (hotspots.md): extrair ArquivosTab/DocRow/AudioDocRow para ArquivosTab.tsx. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | handleAttachMedia | 820-830 | Sem mudança de assinatura. Continua disparando 'wa-docs-changed', que agora também revalida a lista nova. |

**Passos:**
1. Rota GET contact-files (fora da fila de server actions, THR-2), com requireTeam, assinatura via signGetUrl (C3) e nome via mediaDisplayName (C5).
2. Hook no use-whatsapp.ts.
3. Action em lote no client-documents.ts, com o unitário refatorado para o helper comum.
4. Reescrever a lista 'não anexada' e a aba Notas do Copiloto. De preferência extrair ArquivosTab.tsx.
5. Rodar /mapa-atualizar whatsapp-bot (rota e action novas).

**Regras tocadas:**
- requireTeam()/requirePermission na rota e na action novas
- Multi-número: lista por contactId (o contato é por linha), consistente com a thread
- Toda query de Document filtra deletedAt: null (attachedKeys)
- "use server": o helper attachOne não é exportado
- Dark Reader: sem dark: novo; comentários explicam o porquê (janela de 50)

**Riscos:**
- O filtro padrão direction='in' esconde a mídia enviada pela equipe e pelo bot. Isso é intencional: a mídia de fluxo (whatsapp/flows/) anexada e renomeada apagava o vídeo do fluxo antes de C1/C2.
- notIn com centenas de keys: ok (máximo medido de 123 mídias por contato).
- A lista deixa de refletir mensagem nova em tempo real. Revalidar no mesmo evento SSE da conversa aberta, ou ao abrir a aba.
- Hotspot de 1.260 linhas: seguir a faixa do hotspots.md e extrair o componente.

**Testes:**
- Sem lógica pura nova além de mediaDisplayName (C5) e isDocumentCategory (existente). Opcional: tests/document-categories.test.ts cobrindo isDocumentCategory e inferCategory('Foto 24-09-2026 14h32.jpeg') = 'OUTROS'.

**Validação manual:** Conversa de TESTE com mais de 50 mensagens e uma foto no começo: a foto aparece na aba Arquivos sem 'carregar anteriores'. Selecionar 3 fotos com pasta DOCUMENTO DE IDENTIFICAÇÃO e nome 'DOCUMENTO PESSOAL', anexar e ver 'DOCUMENTO PESSOAL 1..3.jpeg' na pasta certa do card, mais o log document_add. Nota antiga aparece na aba Notas. O toggle mostra a mídia do bot.

**Revisão: ajustar**
- problema: Conferido: CopilotPanel.tsx:258-261 (mediaMessages), 224-227 (notes), 178-184 (handoffNote), 565-574 e 850-966, WhatsAppInbox.tsx:820-830; swr ^2.3.8 traz swr/infinite. /api/whatsapp/contact-files não é prefixo público no middleware.ts:39-51, então exige sessão, o que está certo.
- problema: A grade de miniaturas usa os ORIGINAIS do S3 (não há thumbnail): uma página de 40 fotos de celular pode baixar dezenas de MB ao abrir a aba. O lazy ajuda pouco num painel estreito.
- problema: Tirar o handoffNote ('por que está na fila') da janela da thread e passar para kind=notes sem refreshInterval deixa o motivo velho quando acontece um handoff novo com o painel aberto. Hoje ele é vivo, porque a thread faz poll.
- problema: A lista não reflete mídia nova recebida com a aba aberta, a menos que alguém dispare 'wa-docs-changed'.
- problema: O attach unitário não grava log hoje, e o lote passa a gravar document_add: comportamento divergente entre os dois caminhos.
- ajuste: Página de 24, contêiner de tamanho fixo com `loading="lazy" decoding="async"`, e thumbnail real registrado como melhoria futura.
- ajuste: handoffNote: continua vindo da janela da thread, com fallback para kind=notes só quando não há nota na janela.
- ajuste: Revalidar a lista quando o id da mensagem mais recente com mediaKey na thread (poll de 8 s) mudar. É barato e não precisa de SSE novo.
- ajuste: O helper attachOne grava o mesmo createLog('document_add') nos dois caminhos.

**Em aberto:**
- A lista deve incluir as mídias do contato 'gêmeo' (mesmo telefone na outra linha/WABA)? Por padrão, não.
- Quer também o anexo automático de imagens e PDFs recebidos quando o contato já tem card (DOC-2 b)? Fica fora desta spec.

### deleteClientDocument com deletedBy + log document_remove

## PR49 Envio de mídia: 'tentar de novo' e preview na bolha pendente
**Por que agora:** Hoje a falha de mídia não tem retry (DOC-9). Vem depois de E4e e C3 (mesmo trecho de pending/envio).

**Deploy:** Checa a janela de 24 h no cliente (WINDOW_24H_MS) e orienta a usar template. No retry com uploadedKey, faz mutateMessages antes para não duplicar o envio.

### C9 — Retry de mídia com falha e preview da bolha pendente
Onda C_documentos · esforço P · depende de C3 · migration: não · micro: não · refs: DOC-9

**Impacto:** Durante o envio, o atendente vê a foto (ou o nome do arquivo) que está mandando. Se falhar, há 'tentar de novo' sem precisar anexar de novo.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | makePending/patchPending/removePending | 721-743 | Ref `pendingMediaRef = useRef(new Map<string, { file: File; caption?: string; replyToId?: string | null; uploadedKey?: string }>())`. removePending faz URL.revokeObjectURL e limpa o ref. Limpar tudo no unmount. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | handleSendMedia / novo sendOneMedia | 768-805 | Extrair `sendOneMedia(contactId, tempId)` (getWhatsAppUploadUrl, PUT, sendWhatsAppMedia) guardando `uploadedKey` depois do PUT. O retry pula o upload se a key já existe. makePending de mídia recebe `localPreviewUrl: URL.createObjectURL(file)` e `fileName`. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | retryPending | 807-810 | Se `msg.mediaType && pendingMediaRef.current.has(msg.id)`, então `patchPending(id, { status: 'sending' })` e `sendOneMedia`. Senão, o caminho de texto atual. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | ThreadMessageRow (chip 'Enviando anexo...' e bloco 'Falhou.') | 2315-2320, 2341-2348 | O chip atual diz 'Enviando anexo...' até depois de falhar. Com localPreviewUrl de imagem, mostrar `<img>` translúcido com spinner; senão, o nome do arquivo. Em 'Falhou.', mostrar 'tentar de novo' também para mídia (nova prop `canRetryMedia`). |
| `app/_shared/hooks/use-whatsapp.ts` | WhatsAppThreadMessage | 17-42 | Adicionar os campos só de cliente `localPreviewUrl?: string; fileName?: string`. |

**Passos:**
1. Guardar o File por tempId e extrair sendOneMedia.
2. Renderizar o preview na bolha pendente e habilitar o retry de mídia.
3. Revogar os object URLs na remoção e no unmount.

**Regras tocadas:**
- Multi-número: envio segue por sendWhatsAppMedia com o numberId do contato no servidor (sem mudança)
- Não afrouxar cooldown ou janela: o retry é o mesmo envio do atendente e a janela de 24 h continua valendo
- Dark Reader: sem dark: novo

**Riscos:**
- Se o erro for janela de 24 h fechada, o retry falha de novo. Mostrar a mensagem do servidor.
- Memória: File guardado até enviar ou descartar (limpo no unmount e na troca de conversa).
- Mesmo hotspot de C3 e C5: sequenciar.

**Testes:**
- Sem lógica pura isolável. Validação manual.

**Validação manual:** Conversa de TESTE: enviar uma foto com a rede em 'Offline' no DevTools. A bolha mostra a foto translúcida e depois 'Falhou. tentar de novo'. Voltar a rede, clicar em tentar de novo: envia sem reanexar, e a bolha pendente some quando a mensagem real chega.

**Revisão: ajustar**
- problema: Conferido: WhatsAppInbox.tsx:721-743, 768-805, 807-810, 2315-2320 e 2341-2348. O pending persiste por contato e é filtrado na L531 por activeContactId, sem ser limpo na troca de conversa.
- problema: 'Mostrar a mensagem do servidor' não funciona: erro lançado em server action chega mascarado em produção (regra do CLAUDE.md). O toast atual (L800) já mostra o texto genérico do Next.
- problema: 'Limpar na troca de conversa' conflita com o pending por contato. Ao voltar à conversa, a bolha 'Falhou' continua lá, mas sem o File, e o retry morre.
- problema: Risco de mídia DUPLICADA ao cliente: se a Meta aceitou e só a resposta da action se perdeu (timeout ou rede), o retry manda de novo. É proatividade não pedida numa WABA que já levou aviso de spam.
- problema: depends_on C3 não é real: o preview usa objectURL. É só sequenciamento do hotspot.
- ajuste: Texto próprio na falha. Antes do retry, checar a janela de 24 h no cliente (WINDOW_24H_MS já existe na L88) e orientar a usar template quando estiver fechada.
- ajuste: Guardar o File por tempId e liberar só em removePending e no unmount, nunca na troca de conversa.
- ajuste: No retry com uploadedKey: primeiro `await mutateMessages()`. Se já houver mensagem com `mediaKey === uploadedKey`, só remover o pending, sem reenviar.
- ajuste: Trocar depends_on C3 por 'sequenciar PR no hotspot'.

## PR50 nova-dash: 'Abrir conversa' na mesma aba e imports sob demanda
**Por que agora:** Os dois são de esforço P e mexem no CardDialog.tsx. Tiram pdf-lib, docxtemplater, pizzip e recharts do bundle de quem só usa o inbox. Depende do PR41 (page.tsx).

**Deploy:** Troca de aba só depois que o handleDismiss fecha de fato. `import nextDynamic from 'next/dynamic'`. AutomationsPanel montado só quando aberto.

**Medir antes/depois:**
- PR50 (E4h): First Load JS de /nova-dash no build da Vercel/CI cai.

### E4g — CardDialog 'Abrir conversa no WhatsApp' troca de aba em vez de abrir outra janela
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: FE-11, [MISSED frontend] O SSE recarrega a lista mesmo com a aba do navegador em segundo plano

**Impacto:** Clicar em 'Abrir conversa' no card leva direto à conversa na mesma aba, sem abrir mais uma nova-dash, que multiplicaria SSE e recargas.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/CardDialog.tsx` | openWhatsAppConversation + botão | 291-296 (window.open em 295), 312-320 (title '(aba nova)') | Se window.location.pathname === '/nova-dash': sessionStorage.setItem('wa-open-contact', id) (try/catch) → window.dispatchEvent(new CustomEvent('open-whatsapp-conversation', { detail: { contactId: id } })) → fechar o diálogo (handleDismiss). Senão, manter o window.open com ?wa=. Title: 'Abrir a conversa deste cliente no WhatsApp'. |

**Passos:**
1. Aplicar o padrão dual já usado pela page.tsx (96-110 e 118-121) e pelo inbox (448-462).
2. Fechar o diálogo antes de trocar de aba (o Kanban desmonta).

**Regras tocadas:**
- Troca de aba da nova-dash: gravar o sessionStorage ANTES de disparar o CustomEvent

**Riscos:**
- Aberto de dentro do próprio inbox (WhatsAppInbox.tsx:1748), o evento só troca a conversa ativa: comportamento desejado.
- handleDismiss pode perguntar sobre rascunho não salvo; é o mesmo fluxo de fechar o modal.

**Testes:**
- Manual.

**Validação manual:** Kanban → abrir card de teste com conversa → 'Abrir conversa no WhatsApp': a mesma aba vai para WhatsApp com a conversa aberta, sem nova janela. De dentro do inbox (card do Copiloto), a conversa é trocada.

**Revisão: ok**
- problema: CardDialog.tsx:291-296 (window.open em 295) e o title em 314 conferem. Padrão dual igual ao page.tsx 96-110/118-136 e ao inbox 448-462.
- ajuste: Só gravar o sessionStorage e disparar o evento depois que handleDismiss de fato fechar (se o usuário cancelar a pergunta de rascunho, não troca de aba).

### E4h — Import sob demanda de pdf-lib/docxtemplater/pizzip (DocIaDialog), recharts e das abas da nova-dash
Onda E_paineis_ux · esforço P · depende de — · migration: não · micro: não · refs: FE-10

**Impacto:** A 1ª abertura e o F5 da nova-dash ficam mais leves (cerca de 380 KB gzip a menos no caminho de quem só usa Kanban ou inbox), o que ajuda PC fraco e 4G.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/CardDialog.tsx` | DocIaDialog | 37 (import), 425-431 (render condicional) | const DocIaDialog = nextDynamic(() => import('./card-dialog/doc-ia/DocIaDialog').then(m => m.DocIaDialog), { ssr: false }). scan-utils (pizzip, docxtemplater, pdf-lib) só é importado pelo DocIaDialog e sai do chunk principal. |
| `app/nova-dash/page.tsx` | imports das abas | 13-22 (imports estáticos), 15 (StrategicDashboard sem uso: TabsContent comentado em 364-366), 40 (export const dynamic) | import nextDynamic from 'next/dynamic' (alias obrigatório: o nome dynamic colide com export const dynamic = 'force-dynamic'). Workspace, ArchivedCards, MentionsInbox, TicketsBoard, ContractsPanel, WorkSessionPanel e Team via nextDynamic(() => import(...).then(m => m.X)). Remover o import morto de StrategicDashboard. |
| `app/nova-dash/workspace/Workspace.tsx` | seções | 5-17 (imports), 84 (StrategicDashboard) | StrategicDashboard, ManagerDashboard, CostsPanel, AIReview, NumbersPanel e SecurityPanel via nextDynamic (recharts vai junto). |
| `app/nova-dash/KanbanBoard.tsx` | AutomationsPanel | 16 (import), 2370 (render) | nextDynamic para o AutomationsPanel (arquivo gigante, só abre sob demanda). |

**Passos:**
1. DocIaDialog dinâmico (maior ganho, risco mínimo).
2. Abas da page.tsx e seções do Workspace dinâmicas, com fallback de carregamento simples.
3. AutomationsPanel dinâmico.

**Regras tocadas:**
- Não rodar next build local (OOM): a medição de chunk é pelo build da Vercel/CI

**Riscos:**
- Colisão do nome 'dynamic' com o export de configuração da página: usar o alias nextDynamic.
- Componente com window/document no topo precisa de ssr:false.
- Named export exige .then(m => m.X); errar quebra só no build.

**Testes:**
- npx tsc --noEmit + npm run lint nos arquivos tocados.

**Validação manual:** Comparar no log de build da Vercel (preview) o 'First Load JS' de /nova-dash antes e depois. Na UI: abrir Gerador IA no card, Espaço de Trabalho (Dashboard, Gestão, Custos), Automações, Arquivados e Ponto; tudo carrega sem erro de chunk.

**Revisão: ajustar**
- problema: O AutomationsPanel é SEMPRE renderizado (KanbanBoard.tsx:2370-2374 com prop `open`). Com nextDynamic, o chunk carrega no mount do board e não 'sob demanda'.
- problema: KanbanBoard.tsx:4 também tem `export const dynamic = "force-dynamic"`: o alias nextDynamic é obrigatório lá, não só na page.tsx.
- problema: DocIaDialog já é condicional (425-431), então o dynamic funciona de verdade ali. MySpace (recharts) é a seção padrão do Workspace e sai do chunk principal só porque o Workspace inteiro vira dinâmico (ok).
- ajuste: `{automationsPanelOpen && <AutomationsPanel open … />}` (conferir que o painel não depende de ficar montado entre aberturas) + nextDynamic com alias.
- ajuste: Usar `import nextDynamic from 'next/dynamic'` também no KanbanBoard.

## PR51 Métricas de eficácia real da IA
**Por que agora:** Hoje o painel mede errado e esconde o problema (EF-7). Depende do E1 e, de preferência, do D9 (latência e desfecho efetivo).

**Deploy:** O usuário decide antes o acesso das métricas por atendente (allowlist × manager_dashboard). Janela máxima de 180 dias por causa da retenção, com aviso na UI.

### E2a — KPIs de eficácia real da IA sem migração: devoluções/dia, humano antes do desfecho, qualificado IA → nq_* humano, decisões por categoria, successRate honesto
Onda E_paineis_ux · esforço M · depende de E1 · migration: não · micro: não · refs: EF-7

**Impacto:** O gestor deixa de ver 'IA 100% sem erro' e passa a ver o que decide a queixa. Quantas conversas a equipe devolve ao bot por dia e quem devolve. Quantas conversas novas tiveram humano antes do desfecho. Quantos qualificados pela IA a equipe depois desqualificou, e por quê. Resolve e send_flow aparecem separados de 'continue'.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/analytics/bot-effectiveness.ts (novo)` | getBotEffectiveness | novo | export async function getBotEffectiveness(numberId: string|null, fromISO: string, toISO: string): Promise<BotEffectiveness>. requireTeam() + canViewChatbotDashboard. Devolve { returnsToBot: { total, byDay: {date,label,n}[], byAttendant: {authorId,name,n}[] }, humanBeforeOutcome: { cohort, withHuman, pct, openWithHuman, closedWithHuman }, aiQualifiedThenHumanNq: { qualified, humanNq, pct, byReason: {category,label,n}[] } }. |
| `app/_actions/analytics/get-chatbot-analytics.ts` | ChatbotAnalytics.bot + agregação | 39-55 (tipo), 399-409 (resolve/send_flow caem em continueCount), 486-489 (Math.round) | Adicionar resolve e sendFlow ao tipo e à agregação do E1. successRate e understoodRate com 1 casa decimal; incluir errorCount explícito. |
| `app/_shared/utils/bot-kpis.ts (novo)` | rateOneDecimal, foldHourlyByBrDay | novo | rateOneDecimal(n,d): number|null (99,67 → 99,7, nunca 100; d=0 → null). foldHourlyByBrDay(rows: {hour: Date|string; n: number}[], keys: string[]) soma os buckets horários UTC em brDayKey. |
| `app/nova-dash/workspace/manager/AiCorner.tsx` | QualityStat | 259-268 | 'sem erro' → 'sem erro técnico', com 1 casa decimal, mostrando o nº de erros. 'transferidos' vira 'handoff decidido pela IA' (o efetivo vem do E2b). |
| `app/nova-dash/workspace/manager/ChatbotDashboard.tsx` | nova seção 'Eficácia real da IA' | entre 185 e 187 (depois do AiCorner) | useSWR(['bot-effectiveness', numberId, from, to]) → cartões (devoluções/dia com mini gráfico recharts, % humano antes do desfecho, qualificado IA → nq_* humano com top motivos) e tabela por atendente (devoluções). |

**Passos:**
1. Devoluções ao bot: SELECT date_trunc('hour', l."createdAt") h, l."authorId", l."authorName", count(*)::int FROM logs l [JOIN contato por metadata->>'contactId' se numberId] WHERE l.action='wa_return_bot' AND período GROUP BY 1,2,3. Depois foldHourlyByBrDay + brDayKeySeries para os dias zerados.
2. Humano antes do desfecho: coorte = whatsapp_conversations criadas no período (+numberId). Conta a coorte e o FILTER (WHERE EXISTS mensagem out, sentByBot=false, internal=false, authorId not null, createdAt >= c.createdAt e, se status='closed', createdAt <= c.closedAt). Separar abertas e encerradas.
3. Qualificado IA → nq_* humano: WITH q AS (SELECT DISTINCT ON (metadata->>'contactId') contactId e 1º createdAt do wa_bot com outcome='qualify' no período). Cruzar com a conversa hoje encerrada como não qualificada (closeCategory='nao_qualificado' OR LIKE 'nq\_%') e com um wa_close com metadata->>'by'='atendente' depois do qualify. byReason com rótulo via CLOSE_CATEGORY_LABELS/whatsapp_close_reasons.
4. Separar resolve e send_flow na agregação do E1 e trocar Math.round por rateOneDecimal.
5. UI: nova seção no ChatbotDashboard, sem dark:.

**Regras tocadas:**
- Fuso: bucket horário no SQL + brDayKey/brDayKeySeries no JS
- Não qualificado = nao_qualificado OU prefixo nq_ (nunca lista fixa, nem NON_QUALIFIED_CATEGORIES)
- Desfecho por data usa closedAt com status closed
- requireTeam() + allowlist
- Tabela grande: DISTINCT ON em $queryRaw, sem distinct do Prisma

**Riscos:**
- Métrica por atendente expõe desempenho individual: confirmar quem vê (allowlist do chatbot × manager_dashboard).
- 'Qualificado IA → nq_*' atribui à IA casos em que o critério só apareceu com documento (o EF-5 marca confiança média): o rótulo da UI deve dizer 'desqualificado depois pela equipe', não 'erro da IA'.
- O LATERAL/EXISTS em whatsapp_messages por conversa da coorte em 'Tudo' fica pesado: limitar a janela a 366 dias como o resto.

**Testes:**
- tests/bot-kpis.test.ts: rateOneDecimal(5982,6002) = 99.7 (não 100), rateOneDecimal(0,0) = null; foldHourlyByBrDay põe 02:00Z no dia anterior em BRT e 03:00Z no próprio dia; os dias sem evento saem com 0.

**Validação manual:** Mês corrente: as devoluções ao bot batem com um SELECT count(*) de wa_return_bot no período, e o top atendente confere com a auditoria (Daniel Meira ~38%). O KPI 'qualificado IA → nq_*' de 25/08-23/09 fica perto de 64/271. successRate mostra 99,x%, não 100%.

**Revisão: ajustar**
- problema: 'Humano antes do desfecho' com EXISTS até c.closedAt mede outra coisa. Todo lead que o bot qualificou/transferiu e a equipe atendeu depois conta como 'humano antes do desfecho', e o KPI infla. A auditoria (EF-2/EF-7: 254/561 = 45%) mediu mensagem humana ANTES do 1º desfecho do bot (qualify/disqualify/handoff/resolve).
- problema: 'Qualificado IA → nq_* humano' cruza o closeCategory ATUAL da conversa com qualquer wa_close depois do qualify. Um wa_close 'qualificado' seguido de desqualificação posterior pelo bot seria atribuído à equipe. O metadata do wa_close já traz closeCategory (conversations.ts:610).
- problema: rateOneDecimal 'nunca 100' é falso com 1 casa: 5999/6000 = 99,98 arredonda para 100,0. Além disso, AiCorner.tsx:263 monta `${successRate}%` e mostraria '99.7%' com ponto.
- problema: getBotEffectiveness(numberId, fromISO, toISO) não atende os botões 7/30/90 do próprio ChatbotDashboard, que não têm ISO.
- problema: Métrica por atendente é desempenho individual. A receita do mapa ('Métrica nova na Visão do Gestor') exige manager_dashboard, e a allowlist de 3 e-mails é outra trava.
- problema: wa_bot e wa_return_bot estão em PURGEABLE_LOG_ACTIONS (retention.ts:35-47, 180 dias): o teto real é 180 dias, não 366.
- problema: `LIKE 'nq\\_%'` dentro de template string do $queryRaw é fácil de errar o escape.
- ajuste: Humano antes do desfecho: t_desfecho = min(createdAt) dos wa_bot com outcome em (qualify, disqualify, handoff, resolve) do contactId depois de c.createdAt (LATERAL em logs por action='wa_bot', usando o índice). Contar EXISTS de mensagem humana (sentByBot=false, internal=false, authorId not null) com createdAt < coalesce(t_desfecho, now()).
- ajuste: Desqualificado pela equipe: EXISTS de wa_close depois do 1º qualify com `(metadata->>'closeCategory')='nao_qualificado' OR left(metadata->>'closeCategory',3)='nq_'`. Esperar entre 64 (motivos de triagem) e 72 (incluindo nq_arquivado) em 25/08-23/09.
- ajuste: rateOneDecimal: `n<d ? Math.min(99.9, r) : r`. Exibir com toLocaleString('pt-BR', {maximumFractionDigits: 1}).
- ajuste: Assinatura igual à do getChatbotAnalytics: (periodDays, numberId, fromISO?, toISO?).
- ajuste: Por atendente atrás de requirePermission('manager_dashboard') + allowlist, ou decisão explícita do usuário antes de implementar.
- ajuste: Janela máxima de 180 dias (retenção), com aviso na UI.

**Em aberto:**
- Quem pode ver métricas por atendente: a allowlist do chatbot (3 e-mails) ou a permissão manager_dashboard?

## PR52 Fila: marco durável de entrada (lastQueuedAt + evento wa_queued)
**Por que agora:** Mede a espera real da fila e as transferências fechadas sem resposta por atendente. Depende do E2a e dos helpers de fila já finais (D2/D5/D7).

**Deploy:** A migration vai ANTES do código pelo /migration (apagar à mão os DROP de pagamento e do discord; o SQL final só tem o ADD COLUMN). Backfill opcional, com --dry-run primeiro. wa_queued fica fora do feed e não é purgável.

**Medir antes/depois:**
- PR52/PR53 (E2b/E2c): KPI novo de transferências fechadas sem resposta por atendente cai semana a semana. Espera real da fila medida a partir de wa_queued.

### E2b — Marco durável de entrada na fila (lastQueuedAt): espera medida da entrada + transferências fechadas sem resposta por atendente
Onda E_paineis_ux · esforço M · depende de E2a · migration: **sim** · micro: não · refs: EF-7, [MISSED bot_eficacia] Equipe fecha ou descarta transferências sem responder ao cliente

**Impacto:** O gestor passa a ver quanto o cliente espera da entrada na fila até a 1ª resposta humana (p50/p90, sem humano em 24 h, nunca atendidas), não a partir do 'assumir'. Também vê quantas transferências cada atendente encerrou ou descartou sem mandar nenhuma mensagem ao cliente, e quantas transferências foram efetivas.

**Ação do usuário:** Aprovar a migration no Neon de produção (/migration) antes do deploy da Vercel e, se quiser histórico anterior ao deploy, aprovar o backfill (rodar primeiro em --dry-run).

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `prisma/schema.prisma` | model WhatsAppConversation | 748-808 (queuedAt 787) | lastQueuedAt DateTime? com comentário: 'última entrada na fila; NÃO é zerado ao assumir/encerrar/devolver (queuedAt é a estadia atual, usado pelo SLA)'. Sem índice (tabela de ~5 mil linhas). |
| `app/_shared/lib/whatsapp/queue-entry.ts (novo, sem 'use server')` | queueEntryData | novo | export function queueEntryData(now = new Date()) { return { status: 'queued', assignedToId: null, queuedAt: now, lastQueuedAt: now, queueAlertAt: null } as const } |
| `app/_shared/lib/whatsapp/bot.ts` | handoffToQueue, qualifyToQueue | 507-541 (update 513-517), 557-580 (update 567-570) | Usar ...queueEntryData() no data do update, mantendo os demais campos (botFailCount, closeCategory, qualified). |
| `app/_shared/lib/whatsapp/service.ts` | import BotConversa → fila; alertDeliveryFailure | 450-454, 626-632 | Idem: ...queueEntryData(). |
| `app/_shared/lib/signature/core.ts` | 3 pontos que põem na fila | 1658, 1712, 1848 | Idem. A feature está desligada, mas mantém o marco coerente. |
| `app/_shared/lib/whatsapp/bot.ts` | log wa_bot | 1441-1466 (e o de erro 1495-1503) | Acrescentar ao metadata queued: true quando a execução terminou com a conversa em 'queued' (inclui continue vazio → fila, send_flow falho e erro → handoffToQueue). É só telemetria: nenhuma decisão muda. |
| `app/_actions/whatsapp/conversations.ts` | convContact, assumeConversation, closeConversation | 27-33, 506-536, 571-618 | convContact também seleciona lastQueuedAt. closeConversation calcula humanRepliedSinceQueue (EXISTS de mensagem out não bot, não interna, com authorId e createdAt > lastQueuedAt) e grava no metadata do wa_close { queuedAt: lastQueuedAt, humanRepliedSinceQueue } (+ confirmedNoReply do E2c). O wa_assign grava { queuedAt, waitMs }. |
| `app/_actions/analytics/bot-effectiveness.ts` | getBotEffectiveness (extensão) | novo (E2a) | + queueWait { entries, p50Min, p90Min, noHuman24h, neverAnswered } (conversas com lastQueuedAt no período + LATERAL da 1ª mensagem humana depois dele) + closedWithoutReply { total, byAttendant[{authorId,name,n,descartados}] } (wa_close com metadata->>'humanRepliedSinceQueue'='false') + effectiveTransfers (wa_bot com queued=true). |
| `scripts/backfill-last-queued-at.mjs (novo, opcional)` | backfill | novo | UPDATE whatsapp_conversations SET "lastQueuedAt" = última nota interna do bot (internal AND sentByBot AND body LIKE '🤖 Transferido para atendimento humano%' OR '🤖 Lead qualificado%') WHERE "lastQueuedAt" IS NULL. Com modo --dry-run que só conta. |

**Passos:**
1. /migration conversation_last_queued_at: migrate diff → apagar DROP TABLE "discord" → db execute → migrate resolve. Aplicar no Neon ANTES do deploy.
2. Criar queueEntryData e trocar os 7 pontos que hoje fazem queuedAt: new Date() (grep 'queuedAt: new Date' deve voltar vazio fora do helper).
3. Telemetria queued no wa_bot (bot.ts), sem mexer no switch de ações.
4. Metadata nos logs de assume/close.
5. KPIs no getBotEffectiveness e cartões/tabela no ChatbotDashboard ('Espera da fila' e 'Transferências encerradas sem resposta').
6. Opcional: backfill com dry-run e aprovação do usuário.

**Regras tocadas:**
- Migrations só via /migration (migrate diff → db execute → migrate resolve; apagar DROP TABLE discord)
- Bot: código manda fatos e não reintroduz trava (aqui só telemetria de log)
- Fuso: percentis em minutos (sem corte de dia); a série por dia, se houver, via brDayKey
- "use server" só exporta funções async: o helper fica em módulo neutro

**Riscos:**
- CRÍTICO: se o deploy sair antes da coluna existir, o update do Prisma com lastQueuedAt falha dentro do handoffToQueue, e o bot cai no catch em loop. Migration primeiro, deploy depois.
- Há mudança não commitada em prisma/schema.prisma (PaymentSchedule, migration 20260924010000_payment_schedule). Aplicar e commitar essa antes; senão o migrate diff mistura as duas.
- Os KPIs só têm dados completos depois do deploy (ou do backfill); a UI precisa dizer 'desde DD/MM' quando não houver backfill.
- bot.ts é hotspot (>800 linhas): ler só as faixas citadas via docs/ai/hotspots.md.

**Testes:**
- tests/bot-kpis.test.ts: percentil (p50/p90) de uma lista de esperas em minutos; lista vazia → null.

**Validação manual:** Com número de teste (WHATSAPP_TEST_NUMBERS + cérebro de staging): forçar uma transferência, conferir lastQueuedAt e queuedAt preenchidos; Assumir → queuedAt null, lastQueuedAt mantido e wa_assign com waitMs; Encerrar sem responder → wa_close com humanRepliedSinceQueue=false. No painel, o atendente de teste aparece com 1 em 'encerradas sem resposta'. Apagar o contato e a conversa de teste no fim.

**Revisão: ajustar**
- problema: Os 7 pontos que gravam `queuedAt: new Date()` conferem: bot.ts:516 e 569, service.ts:453 e 630, signature/core.ts:1658, 1712 e 1848. Linhas do schema também (787 e 748-808). A ordem migration → deploy está correta, e a coluna nullable aditiva não quebra o código antigo.
- problema: lastQueuedAt guarda só a ÚLTIMA entrada. queueWait 'conversas com lastQueuedAt no período' perde as reentradas, que são justamente o problema do EF-1 (229 contatos com 3 ou mais devoluções, ~19 retransferências/dia). A entrada anterior some quando há uma nova, e o p50/p90 fica enviesado.
- problema: effectiveTransfers via `wa_bot.queued=true` subconta. handoffToQueue em bot.ts:888 (bot não configurado), 1026 (mensagem sem texto interpretável) e 1063 (cliente diz que assinou) roda antes de qualquer log wa_bot, e os qualifyToQueue do signature/core também não geram wa_bot. No caminho de erro, o log (1495) é gravado ANTES do handoffToQueue (1505).
- problema: 'Quando a execução terminou com a conversa em queued' não pode virar uma leitura extra do banco no caminho quente do bot.
- ajuste: Evento durável por entrada: no mesmo helper único (queueEntryData ou um `enterQueue`), gravar também um log por entrada (ex.: action nova `wa_queued` com {reason, source}), excluído do feed de atividade do E1 e fora do PURGEABLE. queueWait e effectiveTransfers saem desse evento (LATERAL da 1ª mensagem humana depois de cada entrada). lastQueuedAt fica para o check no fechamento (E2c). Se não quiser o log, rotular o KPI como 'última entrada por conversa'.
- ajuste: Telemetria no wa_bot com flag local (`let queued = false`, marcado onde handoffToQueue/qualifyToQueue é chamado no switch). No catch, `queued: true` fixo.
- ajuste: Manter o pré-requisito: aplicar e commitar primeiro a migration pendente 20260924010000_payment_schedule e só então rodar migrate diff (apagando o DROP TABLE discord).

**Em aberto:**
- Separar a espera por horário comercial × fora (EF-8 mostra p50 19 min × 847 min)? Precisa reaproveitar a definição de businessHours do bot.ts:350-377.
- Rodar o backfill do histórico (a partir das notas do bot) ou medir só daqui para frente?

## PR53 Encerrar transferência sem nenhuma resposta pede confirmação
**Por que agora:** Hoje a equipe fecha ou descarta transferências sem responder, inclusive leads reais (MISSED bot_eficacia). Depende de E2b e D8.

**Deploy:** Marco = coalesce(lastQueuedAt, queuedAt). handoffNote vem do servidor. Toast só com ok:true.

**Medir antes/depois:**
- PR52/PR53 (E2b/E2c): KPI novo de transferências fechadas sem resposta por atendente cai semana a semana. Espera real da fila medida a partir de wa_queued.

### E2c — Confirmação ao encerrar/descartar transferência sem nenhuma mensagem ao cliente
Onda E_paineis_ux · esforço P · depende de E2b · migration: não · micro: não · refs: [MISSED bot_eficacia] Equipe fecha ou descarta transferências sem responder ao cliente

**Impacto:** O atendente que tenta encerrar uma conversa transferida sem ter falado com o cliente vê um aviso com o motivo da transferência e confirma. 'Descartada (spam/engano)' sempre mostra a nota antes, o que evita descartar lead real sem ouvir o áudio.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/_actions/whatsapp/conversations.ts` | closeConversation | 571-618 | closeConversation(conversationId, category, opts?: { confirmNoReply?: boolean }): Promise<{ ok: true } | { ok: false; needsConfirm: 'sem_resposta_humana'; handoffNote: string | null; queuedAt: string }>. Se lastQueuedAt existe, não há resposta humana desde então e !opts?.confirmNoReply, devolve needsConfirm sem encerrar. Não usar throw: o erro chega mascarado em produção. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | menu Encerrar | 1527-1556 (onClick 1543), useConfirm 371, runAction 699-707 | Handler handleClose(category): chama closeConversation; se needsConfirm, confirm({ title: 'Encerrar sem responder ao cliente?', description: handoffNote … }) e rechama com { confirmNoReply: true }. category==='descartado' SEMPRE pede confirmação mostrando active.handoffReason (ou 'sem nota'). |

**Passos:**
1. Mudar o retorno de closeConversation. O único chamador é WhatsAppInbox.tsx:1543, confirmado por grep.
2. handleClose com o fluxo de confirmação; toast de sucesso só com ok.
3. wa_close grava confirmedNoReply: true quando confirmado (alimenta o KPI do E2b).

**Regras tocadas:**
- Erros de server action mascarados em produção: resultado discriminado, não throw
- "use server": o tipo do retorno pode ser exportado (type), as constantes não

**Riscos:**
- Atrito na triagem da fila (Daniel descarta cerca de 200 por quinzena): o texto do aviso deve ser curto, com 1 clique para confirmar.
- A conversa em 'human' assumida sem resposta também cai no aviso; é o comportamento desejado.

**Testes:**
- Sem lógica pura isolável além do tipo; validação manual.

**Validação manual:** Conversa de teste transferida (número de teste): Encerrar como 'Qualificada' sem responder → aparece o aviso com a nota; cancelar não encerra; confirmar encerra e grava confirmedNoReply. Responder 1 mensagem e encerrar → sem aviso. 'Descartada' → sempre pede confirmação com a nota.

**Revisão: ajustar**
- problema: closeConversation (571-618) retorna void, e o único chamador é WhatsAppInbox.tsx:1543 via runAction (699-707). Conferido.
- problema: A spec não diz de onde sai handoffNote. `active.handoffReason` só é preenchido para conversas em fila (loadConversations busca a nota só para queuedContactIds), então em 'human' o descarte sempre mostraria 'sem nota'.
- problema: Conversas que já estão na fila no dia do deploy, sem backfill, têm lastQueuedAt NULL e passariam sem aviso, embora queuedAt esteja preenchido.
- ajuste: handoffNote no servidor: a última nota interna do bot do contato (a mesma consulta de reasonRows), incluindo a transcrição se a nota citar áudio (MISSED 'Áudio dobra'). Usar esse valor também no confirm do 'descartado'.
- ajuste: Marco = `coalesce(lastQueuedAt, queuedAt)`.
- ajuste: Manter o `refreshConversations()` e o toast só quando `ok: true`. O handleClose substitui o runAction só nesse botão.

**Em aberto:**
- Exigir também um motivo digitado no descarte sem resposta, ou basta a confirmação?

## PR54 Inbox: lista e thread memoizadas e virtualizadas
**Por que agora:** É o último PR do hotspot: reestrutura o render e precisa das pastas e filtros finais do E3. react-virtuoso já está no package.json.

**Deploy:** O elemento rolável vai em callback ref + useState. A fase da thread só entra se o Profiler mostrar necessidade.

### E4f — Performance da lista e da thread: React.memo, react-virtuoso, useDeferredValue e limite nas seções
Onda E_paineis_ux · esforço G · depende de E3 · migration: não · micro: não · refs: FE-5

**Impacto:** Digitar a 1ª letra na busca não trava mais (hoje renderiza 750 linhas de uma vez). A lista não dá solavanco quando chega mensagem, e arrastar o divisor fica leve.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | ConversationGroup → ConversationRow | 2018-2190 (linha inline 2050-2189) | Extrair const ConversationRow = React.memo(function ConversationRow({ c, isActive, onSelect, meId, meName }), areRowsEqual), comparando os campos exibidos (id, lastMessageAt, unreadCount, unread, status, closeCategoryLabel, assignedToName, lastMessageAuthorName, lastMessagePreview, lastMessageStatus, handoffReason, recoveryAttempts, lastInboundAt e ids das tags). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | render da lista | 1302 (área rolável), 1345-1357 (10 seções sem limit), 1358-1379 ('Não qualificadas' sem limit), 1381-1404 (pasta única + Carregar mais) | Pasta única: <Virtuoso customScrollParent={listScrollRef.current} data={visibleItems} itemContent={…ConversationRow}/>, sem a paginação visibleCount. Multi-seção e 'Não qualificadas' por motivo: <GroupedVirtuoso groupCounts groupContent itemContent customScrollParent/>. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | filtered | 574-595 | const deferredSearch = useDeferredValue(search) no filtro client-side. O efeito de busca no servidor segue com o search cru e debounce. |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | ThreadMessageRow + props | 2214 (componente), 1650-1668 (≈12 callbacks inline) | ThreadMessageRow = React.memo com comparador por campos da msg (id, status, body, reaction, editedAt, deletedAt, transcript) + grouped e highlighted. Os callbacks passam a receber msg (onReply(msg), onReact(msg, emoji)…) e são estáveis via useCallback; setRowRef(id, el). |
| `app/nova-dash/workspace/whatsapp/WhatsAppInbox.tsx` | startResize | 343-369 | Aplicar a largura com requestAnimationFrame (1 setState por frame) em vez de setState a cada mousemove. |

**Passos:**
1. Fase 1: memo de ConversationRow e ThreadMessageRow com callbacks estáveis + useDeferredValue + rAF no resize.
2. Fase 2: Virtuoso/GroupedVirtuoso na lista, com customScrollParent (a lista divide o scroll com os avisos e os estados vazios).
3. Fase 3 (opcional, depois do E4c e do E4d): Virtuoso na thread (firstItemIndex para o prepend, followOutput + atBottomStateChange no lugar do scroll manual, scrollToIndex no jumpToMessage). Só vale se a medição mostrar custo; a janela é de 50-200 mensagens.

**Regras tocadas:**
- UI: Dark Reader, sem dark:
- Arquivo >800 linhas: ler só as faixas do docs/ai/hotspots.md

**Riscos:**
- Comparador incompleto congela a linha (ex.: windowPill depende de Date.now() e da janela de 24 h): incluir lastInboundAt e aceitar a atualização no próximo refetch.
- Virtualização quebra o scrollIntoView por ref (jumpToMessage, 433-440) se aplicada à thread: por isso a thread fica na fase 3.
- O Virtuoso com customScrollParent precisa do ref já montado (render condicional até o ref existir).

**Testes:**
- tests/inbox-row-equal.test.ts (se areRowsEqual for extraída para app/_shared/utils/): mudança de tag, unreadCount ou preview → diferente; nova referência com os mesmos campos → igual.

**Validação manual:** React DevTools Profiler: digitar 'a' na busca (antes ~750 linhas) fica abaixo de ~50 ms de commit. Chegar mensagem com a lista aberta re-renderiza só a linha afetada. Arrastar o divisor fica fluido. Pasta 'Todos' rola até a conversa 1.000 sem 'Carregar mais'.

**Revisão: ok**
- problema: Faixas conferem (2018-2190, 2214, 1302, 1345-1404, 574-595, 1650-1668, 343-369). react-virtuoso está no package.json e ninguém usa.
- problema: A área rolável (1302) não tem ref hoje. customScrollParent com ref.current é null no 1º render.
- ajuste: Usar callback ref + useState para o elemento rolável e renderizar o Virtuoso só quando ele existir. Manter a fase 3 (thread) condicionada ao Profiler.

**Em aberto:**
- Fazer a fase 3 (thread virtualizada) nesta onda ou só se o Profiler mostrar necessidade?

## PR55 (fase 2) Juntar fotos selecionadas num PDF com nome padrão
**Por que agora:** Só depois do C4 validado em produção.

**Deploy:** Devolve { ok:false, motivo } em JSON, sem throw. Com vínculo, o arquivo vai para uploads/user_<id>/ + Document + document_add. Sem vínculo, vai para draftDocuments.

### C5b — Juntar fotos selecionadas num PDF com nome padrão (DOCUMENTO PESSOAL / COMPROVANTE DE ENDEREÇO)
Onda C_documentos · esforço G · depende de C4 · migration: não · micro: não · refs: DOC-2

**Impacto:** Acaba a conversão por fora. Nos 86 clientes com 'DOCUMENTO PESSOAL.pdf' ou 'COMPROVANTE DE ENDEREÇO.pdf' a equipe fazia isso manualmente. Agora seleciona as fotos na aba Arquivos, clica 'Juntar em PDF' e o PDF já nasce no card, na pasta DOCUMENTO DE IDENTIFICAÇÃO.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `app/api/whatsapp/merge-pdf/route.ts` | POST (novo) | novo arquivo | Body `{ contactId, messageIds: string[], name: string, category?: DocumentCategoryId }` (só ids, longe do teto de 4,5 MB). requireTeam, `maxDuration = 60`, no máximo 20 imagens e 25 MB somados. Baixa do S3 (GetObject) e monta o PDF com pdf-lib, já no package.json: embedJpg/embedPng, página A4 ajustada, e PDF recebido entra via PDFDocument.load + copyPages. PutObject em `uploads/user_<userId>/<ts>-<name>.pdf` (ou `whatsapp/<cid>/docs/` sem vínculo, virando rascunho), mais Document.create com category explícita e log document_add. |
| `app/nova-dash/workspace/whatsapp/CopilotPanel.tsx (ou ArquivosTab.tsx extraído em C4)` | barra de seleção | lista de C4 | Botão 'Juntar em PDF' ao lado de 'Anexar selecionadas', com nome sugerido (DOCUMENTO PESSOAL / COMPROVANTE DE ENDEREÇO / livre) e pasta. |
| `app/_shared/lib/document-categories.ts` | PATTERNS | 49-62 | Opcional: `COMPROVANTE DE (ENDERECO|RESIDENCIA)` → IDENTIFICACAO. Cuidado: docs antigos com category null mudam de pasta na leitura. |

**Passos:**
1. Rota POST de merge (route handler, fora da fila de actions).
2. UI de 'Juntar em PDF' sobre a seleção de C4.
3. Decidir se as fotos originais também ficam anexadas.

**Regras tocadas:**
- Vercel 4,5MB: só ids no body; binário lido e gravado direto no S3
- requireTeam na rota nova
- Document novo com category explícita (ou inferCategory)
- Nenhuma IA envolvida (sem metadata.usage)

**Riscos:**
- pdf-lib não embute WEBP nem HEIC: pular com aviso (quase tudo chega como image/jpeg, 1.650 de 1.651).
- Memória e tempo com 20 fotos grandes: teto de 25 MB e maxDuration 60.
- Pasta por regex muda docs antigos (só se adotar a regra opcional).

**Testes:**
- Opcional: extrair `fitImageToA4(w, h)` para app/_shared/utils e testar proporção e margem.

**Validação manual:** Conversa de TESTE com 2 fotos (frente e verso): selecionar, 'Juntar em PDF' com o nome 'DOCUMENTO PESSOAL'. O PDF de 2 páginas aparece no card, em DOCUMENTO DE IDENTIFICAÇÃO, e abre no preview.

**Revisão: ajustar**
- problema: Sem vínculo não dá para fazer `Document.create`: userId é obrigatório (documentos-ia.md > Dados). O rascunho tem de ir para WhatsAppContact.draftDocuments, como em confirmClientDocumentUpload (client-documents.ts:94-98).
- problema: O enunciado trata a junção em PDF como 'opcional depois' (G). A spec põe o item como 'fazer' no mesmo pacote.
- problema: PDF recebido e criptografado faz PDFDocument.load lançar exceção. Faltam `runtime = 'nodejs'` e a validação de que os ids são do contactId e de mídia image/jpeg|png ou application/pdf.
- ajuste: Com vínculo, usar `uploads/user_<userId>/<ts>-<nome>.pdf` com Document.create (category explícita ou inferCategory) e log document_add. Sem vínculo, usar `whatsapp/<cid>/docs/<ts>-<nome>.pdf` com push em draftDocuments.
- ajuste: Status 'fase 2': entra depois de C4 validado em produção.
- ajuste: Pular com aviso: PDF criptografado, webp/heic e itens que não sejam do contato. Mandar `{ ok:false, motivo }` em JSON (não throw), para a UI ter mensagem própria.

**Em aberto:**
- Quais nomes padrão entram na lista (só DOCUMENTO PESSOAL e COMPROVANTE DE ENDEREÇO, ou outros)?
- Depois de juntar, as fotos originais também devem ficar anexadas no card?

## PR56 (fase 2) Tipo do documento vindo do cérebro (docType)
**Por que agora:** Só depois da onda de latência do bot (D9/D10), medindo outputTokens antes e depois em staging.

**Deploy:** Migration pelo /migration a partir de branch limpa (só ADD COLUMN "mediaLabel"). O micro vai ANTES do CRM, com enum idêntico nos dois repos. Nova versão das instruções publicada pela aba Instruções.

### C5c — Tipo do documento vindo do cérebro (docType por mídia) para nome e pasta automáticos
Onda C_documentos · esforço G · depende de C5, C4 · migration: **sim** · micro: **sim (antes do CRM)** · refs: DOC-2

**Impacto:** A foto que o bot já abriu chega nomeada 'RG frente 24-09-2026.jpeg' ou 'Laudo …', e o anexo cai na pasta certa sem a equipe renomear ou mover.

**Ação do usuário:** Aprovar a migration em produção. Fazer push e deploy do D:\Chatbot_whatsapp antes do CRM. Publicar a nova versão das instruções pela aba Instruções.

| arquivo | símbolo | linhas | mudança |
|---|---|---|---|
| `D:\Chatbot_whatsapp\bot.js` | responseSchema / sanitize | confirmar no repo do micro | Campo opcional `mediaLabels: [{ id: string, docType: enum }]`, com enum sugerido RG, CNH, CPF, COMPROVANTE_ENDERECO, LAUDO, ATESTADO, EXAME, BOLETIM_OCORRENCIA, CNIS, CARTA_INSS, OUTRO. É preenchido só para itens de mediaList. Mesmo padrão de `transcripts`. |
| `D:\Chatbot_whatsapp\index.js` | /reply | confirmar no repo do micro | Repassar `mediaLabels` na resposta, se ele não for devolvido por inteiro. |
| `app/_shared/lib/whatsapp/bot.ts` | BotDecision + persistência junto dos transcripts (mediaList montado em 983-1003) | 983-1003 e o ponto onde transcripts é persistido | Aceitar `mediaLabels` tolerante a ausência (micro antigo). Validar id ∈ mediaList e docType ∈ enum, e gravar `whatsAppMessage.update({ data: { mediaLabel } })`. |
| `prisma/schema.prisma` | WhatsAppMessage | 875-914 | `mediaLabel String?`, via /migration (migrate diff → db execute → migrate resolve). |
| `app/_shared/utils/media-name.ts` | mediaDisplayName + docTypeToCategory | arquivo de C5 | Usar mediaLabel no rótulo e mapear para DocumentCategoryId: RG/CNH/CPF/COMPROVANTE → IDENTIFICACAO; LAUDO/ATESTADO/EXAME → EXAME_MEDICO; CNIS/CARTA_INSS → DOCS_INSS. |

**Passos:**
1. Migration da coluna mediaLabel (/migration), ANTES do deploy do CRM.
2. Micro: schema, sanitize e index.js. Deploy no Railway primeiro.
3. Instruções no banco (aba Instruções): explicar o campo e a regra (só classificar o que abriu; na dúvida, OUTRO). Publicar.
4. CRM: BotDecision, persistência, mediaDisplayName e categoria no attach e em lote.
5. Rodar /mapa-atualizar whatsapp-bot (contrato do /reply).

**Regras tocadas:**
- Contrato CRM↔micro: campo novo no responseSchema, sanitizeDecision espelhado nos dois lados, micro antes do CRM
- Prompt vivo no banco: editar só o bot.js não muda produção
- Decisão é do cérebro: o código só persiste o fato, sem trava
- IA grava metadata.usage (já coberto no wa_bot)
- Migration só via /migration

**Riscos:**
- Mais tokens de saída por imagem (poucos; entra no usage).
- Mídia recebida com a conversa em human ou queued não passa pelo bot e fica sem rótulo (cai no nome padrão de C5).
- Classificação errada nomeia o arquivo errado. Continua editável, e o rename agora é seguro (C1).

**Testes:**
- tests/media-name.test.ts: com mediaLabel 'RG' = 'RG 24-09-2026 23h30.jpeg'; docTypeToCategory('COMPROVANTE_ENDERECO') = 'IDENTIFICACAO'; docType desconhecido = OUTROS.

**Validação manual:** Com número de teste (WHATSAPP_TEST_NUMBERS → CHATBOT_URL_STAGING): mandar a foto de um RG de exemplo. O log wa_bot traz mediaLabels, a mensagem fica com mediaLabel 'RG', e ao anexar o nome e a pasta saem certos.

**Revisão: ajustar**
- problema: As referências existem: bot.ts:983-1003 (mediaList), transcripts em bot.ts:208/1218, schema.prisma:875-914. Não é state/closeCategory/action, mas segue a mesma regra de contrato: instruções no banco, responseSchema/sanitize no bot.js e BotDecision/sanitize no bot.ts, com o micro subindo antes.
- problema: Conflita com a queixa principal de latência do bot (BOT-1: o tempo acompanha os tokens de saída). Campo novo por imagem aumenta a saída do cérebro em toda mensagem com mídia.
- problema: A árvore de trabalho tem schema.prisma modificado e a migration 20260924010000_payment_schedule não commitada. Um `migrate diff` para mediaLabel traria as duas mudanças juntas.
- ajuste: Status 'fase 2': só depois da onda de latência do bot, medindo outputTokens antes e depois no staging (WHATSAPP_TEST_NUMBERS).
- ajuste: Fazer a migration a partir de um branch limpo da main, pelo /migration, e conferir que o diff só contém `ALTER TABLE whatsapp_messages ADD COLUMN "mediaLabel" TEXT`.
- ajuste: sanitize espelhado com enum idêntico nos dois repos. docType fora do enum é descartado (não vira OUTRO silencioso).

**Em aberto:**
- Lista final do enum docType, a combinar com a equipe.

---
## O que os revisores apontaram que faltava (por onda)

### A_sync_inbox
- Perda de atualização por fetch descartado. O SWR 2.3.8 descarta a recarga em voo quando qualquer patch com revalidate:false acontece depois do início dela (index.mjs:405-437), e o lastVersion já avançou. Uma mudança de outra conversa só volta no próximo hash diferente, ou em até 10 min com a rede de segurança do A4. Falta `onDiscarded` → refresh coalescido/single-flight na lista.
- Multi-número em markConversationRead: markMessageRead sem numberId (conversations.ts:715) cai no número default via getCreds(undefined), inclusive para a linha 2323 desativada. Corrigir junto com o A3 passando conv.numberId.
- Base da branch: main não tem o harness (docs/ai, .claude/skills, hooks), que existe só em chore/ai-harness. payment_schedule está só no working tree. Branch a partir da main perde /migration e /validar, e o migrate diff pode propor DROP das tabelas de pagamento se elas já existirem no Neon.
- Mensagens de erro: em produção o e.message de server action vem mascarado. runAction e handleSetTag hoje mostram e.message. É preciso texto próprio por ação, com dica de F5, o que também cobre as abas com bundle antigo depois do deploy (toggleConversationTag removido, props do Composer trocadas).
- Validação do A3: a pill 'Não lidas' e unreadInFolder contam conversas encerradas, e o badge do topo não. Os números não vão bater como a spec afirma. Precisa de decisão de produto (excluir closed da pill) ou de outro critério de validação.
- EXPLAIN do novo countWhatsAppUnread: roda a cada 30s em toda aba da /nova-dash, dentro da fila serial. Medir antes do deploy e, opcionalmente, desligar o revalidateOnFocus dele (use-whatsapp.ts:167, citado no achado de foco).
- Bolha pendente: removePending precisa ficar em finally, e na mídia só depois do mutateMessages final. Sem isso a bolha trava em 'enviando' ou continua piscando (THR-10 só resolvido para texto).
- O smoke test SQL do A5 precisa de guarda por flag (describe.skipIf), porque npm test roda tests/**/*.test.ts contra o .env de PRODUÇÃO e no CI sem banco.
- Coerência da prévia: o patch local de envio deve truncar igual ao SQL (left 160) e tratar body/mediaType nulos.
- Correção em map_corrections #6: wa_contact JÁ está na lista de logs de docs/ai/whatsapp-bot.md:67. Faltam só wa_document, wa_media e wa_signature. Acrescentar que WhatsAppInbox.tsx:190 também tem o comentário desatualizado 'capada em 200'.

### B_leituras_infra
- Conflito de arquivo com a onda A: B2 extrai loadConversations e as leituras de conversations.ts para inbox-data.ts, e a onda A mexe no mesmo trecho (BACK-2 não lidas, BACK-6 Promise.all, BACK-4 hash, markRead). Definir a ordem: a extração da B2 entra primeiro (move sem mudar lógica) ou depois do merge da A. Nunca as duas em paralelo.
- Assinatura de URL de mídia (THR-1/FE-6/DOC-3, downloadFileFromS3 'use server' por bolha, p50 de 3 a 11 actions por abertura) continua na fila serial. Se nenhuma onda cuidar disso, o sintoma 'imagens carregam uma por uma' do FE-1 não se resolve com a onda B.
- Ordem de deploy obrigatória na B2: o fetcher novo (jsonFetcher em use-whatsapp.ts, incluindo useWhatsAppMessages) sai junto ou antes do teamRoute em /api/whatsapp/messages. Senão um 403 vira dado e use-whatsapp.ts:128 (data.messages.length) quebra a thread.
- Validação em preview (B1, B2, B4, B5): falta o pré-requisito de login no deploy de preview (NEXTAUTH_URL de Preview, Google OAuth sem o domínio *.vercel.app, Deployment Protection) e a trava de IP (testar do escritório). O preview grava no banco de produção: só card e contato de TESTE.
- WhatsAppComposer.tsx:634 é um 5º chamador de IA do Copiloto (suggestWhatsAppReply) que a B4 não lista.
- Regra de metadata.usage já violada hoje e tocada por esta onda: ficha-ai.ts não grava usage na recusa (L237-239) nem no 'nenhum campo novo' (L264-271); wa_transcribe não grava usage (precisa do micro devolver usage, deploy do micro antes). Definir o dono (bot ou B4).
- GET /api/presence (route.ts:58-62) devolve a lista da equipe (nome, foto, role) para qualquer sessão, inclusive cliente por CPF, e não tem consumidor no app: teamRoute ou remover.
- ClientInfoModal.tsx é código morto (nenhum import). Apagar em vez de manter wrappers por causa dele.
- A B3 não cobre mudanças só no contato (WhatsAppContact.updatedAt): nome alinhado ao card, rename, opt-out, vínculo userId, rascunho da ficha.
- Logs em background (B5) precisam preservar o instante da ação (at capturado antes da resposta), porque get-chatbot-analytics.ts:467-480 usa a ordem wa_assign → wa_text → wa_close.
- maxDuration: com waitUntil o background continua limitado pelo teto da função. A rota do copilot e o layout /nova-dash mantêm maxDuration 60 de forma permanente (não só 'até a B4'), a menos que o Fluid esteja confirmado (padrão 300 s). Fluid pode ir para o vercel.json ("fluid": true).
- Remover o body do log do relay contraria um pedido explícito registrado no código (index.js:97 'Log pedido'): confirmar com o usuário antes do deploy no Railway.
- Não há teste para teamRoute/sameOrigin. A lógica de decisão (Origin × x-forwarded-host; AccessError → 403, outro erro → 500) pode ir para app/_shared/utils/route-guards.ts pura e ter tests/route-guards.test.ts.

### C_documentos
- Fallback de UI para mídia inexistente no S3: `onError` no <img>/<audio> da bolha (WhatsAppInbox.tsx:2466 e o player de áudio) e no DocRow do Copiloto (CopilotPanel.tsx:1028), levando ao estado 'Arquivo indisponível'. Sem isso, o resíduo não reparável de C1b (ambiguo, purgado pela DOC-6) continua como ícone quebrado, porque uma URL assinada de key apagada é gerada sem erro.
- Vítimas da purga (DOC-6) já apagadas: o cron roda todo dia desde que a lixeira passou dos 30 dias, e cada dia até C2 subir perde mais mídia. O diagnóstico de C1b precisa listá-las (logs document_purge com metadata.key, no caso manual, mais o diff global S3 × mediaKey). Também precisa responder se o bucket tem versionamento: essa é a única forma de recuperar.
- Ordem de deploy explícita da onda: (1) hotfix C1+C2, (2) dry-run de C1b com OK do usuário, (3) --apply aprovado, (4) C6/C7/C8/C10, (5) C3 → C5 → C4 → C9 em PRs sequenciais no hotspot, (6) C5b/C5c em fase 2.
- Conflito entre ondas: WhatsAppInbox.tsx, CopilotPanel.tsx e use-whatsapp.ts também mudam nos fixes THR-2/THR-4/THR-5/THR-7 e FE-* de outras ondas. THR-5 reescreve useWhatsAppMessages, o mesmo hook que C3 estende. Combinar a ordem entre as ondas.
- Atualização de mapas além do que a spec lista: data-model.md:102 (regra da purga passa a considerar WhatsAppMessage.mediaKey e flows/templates); hotspots.md:28 e 124 (símbolos getMediaUrl/fileNameFromKey e faixas de linha); whatsapp-bot.md:17 (a rota da thread devolve mediaUrl) e a tabela com /api/whatsapp/contact-files; infra-integracoes.md:23/182 se purgeExpiredTrash mudar de arquivo. Rodar `npm run docs:check`, que não está no CI.
- Árvore de trabalho suja (branch chore/ai-harness com schema.prisma, middleware.ts, costs e a migration payment_schedule não commitados): os branches da onda C devem sair da main, e nenhuma migration desta onda pode carregar o diff do payment_schedule.
- deleteClientDocument (client-documents.ts:180-193) manda para a lixeira com deletedBy null e sem log document_remove. A lixeira do card mostra 'excluído por —', e não há como auditar exclusões feitas pelo Copiloto. Ajuste pequeno, cabe junto de C4.
- Critério de sucesso mensurável depois do deploy: consulta de só leitura que repete a medição da auditoria (Documents whatsapp/ com key sem mensagem apontando, criados depois do deploy = 0; % de fotos recebidas anexadas acima dos 2,7% de hoje).

### D_bot_ia
- Plano de rollout: D2/D3/D4/D9 reescrevem os mesmos trechos de bot.ts (laço de envio, catch, log) e D3/D5/D6/D8 os mesmos de cron-tasks.ts, os dois sem teste. A spec não define a sequência de PRs/deploys nem um interruptor por env (ex.: WA_ORPHAN_TO_QUEUE, WA_HUMAN_HOLD_DAYS) para desligar a regra de órfã e o 'dono pegajoso' sem novo deploy, caso encham a fila em produção.
- Persistir o reportCriticalError (report-error.ts:14-16 só faz console.error) como Log (action 'critical_error' com contactId). É o fix do '[MISSED bot_latencia] Erros fora do try' que D2/D3 citam: mover findNewerInbound para dentro do try não cobre falha do handoffToQueue no catch, da ficha ou do applyStatusUpdate, e as órfãs continuam sem causa investigável.
- Validação manual do cron: GET /api/whatsapp/cron/nudge (D3/D5/D6) roda a fase inteira para TODOS os clientes de produção e não tem trava contra a execução agendada. Duas invocações simultâneas podem mandar nudge/despedida em dobro e furar o ritmo do marcapasso. Falta a instrução 'disparar só fora da janela do agendado'.
- callClaudeStructured (bot.js:113-145) descarta o usage da 1ª tentativa quando repete por JSON inválido ou vazamento. É gasto de IA fora do Canto da IA, mesma regra do metadata.usage.
- blockWhatsAppContact (contacts.ts:186-194) encerra sem captureConversation, o que viola a regra do mapa. O D8 passa por ali e não trata.
- Mudança de classificação de timeout ao introduzir o prazo no micro (D10): sem mapear 504 → timeout no CRM, o painel perde a série de timeouts e o retry cai de 3 para 1 sem decisão explícita.
- A regra do cérebro também vale no cron: a órfã do D3 precisa distinguir 'bot não decidiu' (falha → fila) de 'bot decidiu silent' (decisão do cérebro). Sem isso a onda reintroduz uma trava de negócio.
- Atualização dos mapas ao final (/mapa-atualizar whatsapp-bot e analytics-custos) e do CLAUDE.md de app/_shared/lib/whatsapp. Precisam registrar: handoffToQueue/qualifyToQueue condicionais e com dono; syncCloseTag na lib chamado em todo encerramento; nudge só das 7h às 21h; botNudge30At no futuro como trava de 7 dias; novos campos do wa_bot (botLatencyMs, effective, conversationAgeMs) e a action de descarte; KPI Contratados por nome exato; regra fixa do micro removida do buildDynamicContext. A spec só cita regenerar o hotspots.md.
- O '[MISSED bot_eficacia] Equipe fecha ou descarta transferências sem responder' é citado no D11, mas só a nota com transcrição entra. A confirmação e o motivo ao encerrar/descartar uma transferência sem nenhuma resposta ao cliente, e o KPI 'transferências fechadas sem resposta' por atendente, ficaram sem dono em qualquer onda. Confirmar em que onda entram.

### E_paineis_ux
- ChatbotDashboard.tsx:145 e AiCorner.tsx:126 também mostram e.message cru (mascarado em produção). O E1f só corrige o LeadOriginSection.
- Correção de mapa que falta em map_corrections: queuedAt também é zerado em cron-tasks.ts:478 e 516, não só em conversations.ts/bot.ts.
- Retenção: wa_bot e wa_return_bot são purgados em 180 dias (retention.ts:35-47). Os KPIs do E2 e a Canto/Chatbot em 'Ano'/'Tudo' precisam avisar esse teto quando o cron de retenção voltar a rodar (tarefa separada).
- KPI do EF-7/EF-1 fora da spec: 'transferências de conversa já humana' e 'mesmo atendente retomou'. O EF-1 pede para medir isso depois. Com um evento por entrada na fila (ver E2b) sai quase de graça.
- Evento durável por entrada na fila: sem ele, espera da fila e transferências efetivas perdem reentradas e os handoffs de bot.ts:888/1026/1063, que não geram wa_bot.
- Decisão de acesso das métricas por atendente (allowlist × manager_dashboard) precisa do usuário ANTES de implementar o E2a/E2b. A spec deixou como open_question, mas isso bloqueia a UI.
- A validação de 'mais rápido' do E1/E1b precisa de medida no servidor (duração da função na Vercel / pg_stat_statements). O Network do navegador não muda para essas duas actions.
- PAINEL-4: o Workspace reabre sempre em 'meu-espaco' (Workspace.tsx). Sem persistir a seção, 'voltar ao dashboard na hora' continua exigindo clique.
- O inbox (E3/E4b) e a Gestão (E1c/E1d) somam actions na fila serial do Next (LISTA-4/PAINEL-3). A spec não mede o efeito líquido. Vale registrar como validação: gravar Network (Next-Action) antes e depois no PC do chefe, como recomendou o crítico.

## Correções de mapa (docs/ai) a aplicar com `/mapa-atualizar`
- (A_sync_inbox) docs/ai/whatsapp-bot.md, Fluxo item 10 ('a lista só recarrega quando o hash muda; SSE acelera'): está errado. Hoje a lista inteira também recarrega a cada evento SSE whatsapp:* (WhatsAppInbox.tsx:516-521), no foco (use-whatsapp.ts:61), a cada 120s, depois de toda ação (runAction/tag/envio/template/passo de fluxo) e depois de cada markConversationRead (WhatsAppInbox.tsx:525-528). A auditoria indica que em produção o SSE não entrega, então o inbox vive do poll de 15s.
- (A_sync_inbox) docs/ai/whatsapp-bot.md, Regras ('Auth das actions'): impreciso. conversations.ts:35-44 lê o role do JWT (session.user.role, que nunca é renovado); tags.ts:12-17 e send-message.ts:29-40 leem o role do banco. Todas pulam a trava de IP.
- (A_sync_inbox) docs/ai/whatsapp-bot.md, Regras ('Inbox … A lista é capada em 1000; fora dela só a busca acha'): falta dizer que os filtros de tag, data e coluna do Kanban e as pastas também só enxergam as 1.000 carregadas (~8 dias), e que a UI diz 'em todas as pastas' (WhatsAppInbox.tsx:1292).
- (A_sync_inbox) docs/ai/whatsapp-bot.md, linha do fichaComplete: além dele, docsCount também é campo morto, e o groupBy de Document que o calcula (conversations.ts:301-307) não filtra deletedAt: null, o que viola a regra. Os dois saem no A5.
- (A_sync_inbox) docs/ai/whatsapp-bot.md, Dados/Regras: não documenta que `unread` = lastMessageAt > leitura (conta mensagem de SAÍDA do atendente e do bot), contrariando o comentário da própria UI ('mensagem recebida depois da última leitura', WhatsAppInbox.tsx:587-588). Também não documenta que countWhatsAppUnread usa take 500 sem orderBy (conversations.ts:51-69).
- (A_sync_inbox) docs/ai/whatsapp-bot.md, lista de logs (Dados): faltam wa_document, wa_media, wa_signature e wa_contact, que existem em LogAction (log.ts:4-46).
- (A_sync_inbox) docs/ai/whatsapp-bot.md, 'Onde fica' (use-whatsapp.ts): 'lista 2min' omite revalidateOnFocus: true na lista e no total, que responde por ~17% das recargas.
- (A_sync_inbox) docs/ai/data-model.md:62 ('Notification = sino volátil (retenção 30/90 d)'): na prática a retenção não roda. /api/maintenance/retention não está em PUBLIC_API_PREFIXES e morre em 401, e há ~47 mil notificações lidas com mais de 30 dias. A correção em si é tarefa separada.
- (A_sync_inbox) docs/ai/infra-integracoes.md:31 ('broadcast best-effort'): broadcastToRelay é aguardado no caminho quente, sem timeout e sem checar res.ok (chat-relay.ts:42-56). Custa ~50-80 ms por envio/webhook, e um relay travado prende o envio. useChatStream reconecta a cada 3s fixos em erro (use-chat.ts:153-157).
- (A_sync_inbox) Comentários de código desatualizados (não são mapa, mas enganam o leitor): use-whatsapp.ts:93-103 fala em poll de 5s na thread e lista em 15s, quando o real é 8s e o hash de 15s; use-whatsapp.ts:77-80 e conversations.ts:71-74 dizem que a lista é capada em 200, quando LIST_PAGE = 1000. Corrigir junto com o A4/A5.
- (A_sync_inbox) docs/ai/hotspots.md (WhatsAppInbox.tsx): conferido, as faixas continuam certas (runAction L699, handleToggleTag L709, onStream L516, tags do cabeçalho L1489, Encerrar L1525, ConversationGroup L2018). Regenerar depois da onda A, porque A1/A2/A4 mexem nessas faixas.
- (B_leituras_infra) docs/ai/whatsapp-bot.md L54 (Fluxo, passo 10) diz que o SSE (useChatStream) 'acelera'. Na auditoria (GR-3) o relay não entrega nas abas em produção (0,01 recarga por evento), e o onStream (WhatsAppInbox.tsx:516-522) chama refreshConversations() da lista inteira em todo evento whatsapp:*, sem debounce e sem checar aba oculta. O mapa deveria registrar as duas coisas.
- (B_leituras_infra) docs/ai/whatsapp-bot.md L104 e docs/ai/auth-permissoes.md L93 estão imprecisos sobre auth. Só conversations.ts:35-44 (e a rota app/api/whatsapp/messages/route.ts:12-22) decidem pelo role do JWT. tags.ts:12-17, client-info.ts:22-33, client-documents.ts:28-32, assist.ts:14-25 e send-message.ts leem o role no banco (db.user.findUnique), mas nenhum aplica a trava de IP. /api/whatsapp/messages deveria constar entre as rotas que decidem pelo JWT.
- (B_leituras_infra) docs/ai/infra-integracoes.md (L7, tabela L89, receita L147), docs/ai/auth-permissoes.md L96 e app/api/CLAUDE.md L6 dizem que /api/costs/sync está fora de PUBLIC_API_PREFIXES. No working tree desta branch (chore/ai-harness, alteração não commitada) middleware.ts:47 já inclui '/api/costs/sync'. Ao commitar, sobram barrados só automations/cron/time-check e maintenance/retention.
- (B_leituras_infra) docs/ai/whatsapp-bot.md (Regras e armadilhas) não registra a armadilha principal desta auditoria: no Next 14.2.35 as server actions de uma aba rodam em fila serial (action-queue.js), então leitura e poll feitos por server action atrasam todo clique. Registrar e indicar GET/route handler para leituras.
- (B_leituras_infra) docs/ai/whatsapp-bot.md L37 lista os polls de use-whatsapp.ts, mas omite o total (60 s, revalidateOnFocus) e o revalidateOnFocus da lista. Os comentários do próprio use-whatsapp.ts estão desatualizados: L94-102 falam em poll de 5 s da thread e lista em 15 s; L78-79 e L159-160 em 'capada em 200'; hoje são 8 s, versão de 15 s e LIST_PAGE 1000.
- (B_leituras_infra) docs/ai/infra-integracoes.md não registra que o vercel.json não fixa 'regions' (a função não está junto do Neon us-east-2, piso medido de 60 ms por operação Prisma) nem que o DATABASE_URL usa pgbouncer=true (BEGIN/DEALLOCATE ALL/COMMIT em ~71% dos comandos).
- (B_leituras_infra) docs/ai/infra-integracoes.md L143 diz que 'o relay cai para polling'. Falta dizer que a falha é silenciosa: broadcastToRelay (chat-relay.ts:42-57) não checa res.status e é aguardado sem timeout no caminho quente. Falta também que o relay (D:\chat_site\index.js:98) loga o texto das mensagens apesar do comentário 'Sem dados sensíveis' (L15).
- (B_leituras_infra) vercel/pro-checklist.md §1 ainda diz que o vercel.json agenda /api/whatsapp/cron (a agregadora, que não deve voltar; o mapa infra L127 já avisa). §2 não tem o item de Function Region.
- (C_documentos) docs/ai/documentos-ia.md (Dados, 'Rascunho de docs do WhatsApp'): diz que draftDocuments vira Document 'quando o contato ganha card'. Só acontece em addClientFromConversation (client-info.ts:283 e 325). O vínculo automático por telefone em getClientInfo (141-153) não migra (DOC-10).
- (C_documentos) docs/ai/documentos-ia.md (Dados, 'Prefixos S3'): detalhar os subprefixos de whatsapp/. São eles: `whatsapp/<contactId>/<ts>-*` (recebida), `whatsapp/<contactId>/out-*` (atendente, send-message.ts:365), `whatsapp/<contactId>/docs/` (rascunho da ficha, client-documents.ts:74) e as bibliotecas COMPARTILHADAS `whatsapp/flows/` (flows.ts:159; flow-runner.ts:149 grava a mesma key em toda mensagem do fluxo) e `whatsapp/templates/` (templates.ts:153).
- (C_documentos) docs/ai/documentos-ia.md (armadilha da L95): falta o caso mais grave. O Copiloto lista a mídia do bot (vídeos de fluxo) como 'não anexada'. Anexar e depois renomear ou purgar apaga `whatsapp/flows/...`, o que quebra o passo do fluxo para todos os próximos leads e todas as threads antigas.
- (C_documentos) docs/ai/documentos-ia.md (Fluxo 1 e 'Visualizar/baixar'): getPresignedUrls gera `{Date.now()}-{nome}` dentro de Promise.all, e dois arquivos de mesmo nome no mesmo lote caem na mesma key. O Copiloto não baixa com `name`: getMediaUrl usa o último segmento da key (CopilotPanel.tsx:47-48).
- (C_documentos) docs/ai/whatsapp-bot.md (tabela, `app/api/whatsapp/messages/route.ts`): a rota decide acesso pelo papel do JWT (route.ts:19-22), contra a regra 'decisão de acesso lê o banco'. C3 troca por requireTeam.
- (C_documentos) app/_shared/hooks/use-whatsapp.ts:94-103: o JSDoc de useWhatsAppMessages ainda diz 'polling 5s', mas o código usa 8 s (o mapa está certo, o comentário não).
- (C_documentos) app/nova-dash/workspace/whatsapp/ClientInfoModal.tsx: não é importado em lugar nenhum (código morto, o Copiloto substituiu). Também chama downloadFileFromS3. Os mapas não o citam; candidato a remoção.
- (C_documentos) app/_actions/documents/trash.ts: purgeExpiredTrash é exportada de arquivo "use server" sem guard, então é invocável como action por qualquer sessão. Registrar em documentos-ia.md > Guards fracos. A rota de purga também copia isCronAuthorized, contra app/api/CLAUDE.md.
- (C_documentos) Nuance da auditoria DOC-9: a bolha pendente de mídia renderiza, sim, um chip 'Enviando anexo...' (WhatsAppInbox.tsx:2316-2319), que continua dizendo 'Enviando' depois de falhar. O que falta é o preview e o retry.
- (C_documentos) Nuance da auditoria DOC-1 ('o download usa name'): vale para FilesTab, download-all e ClientInfoModal; no Copiloto e na bolha do inbox o nome vem da key. C1 inclui a correção no Copiloto.
- (D_bot_ia) docs/ai/whatsapp-bot.md L82 (Tempo do webhook): diz que no pior caso 'a função morre antes do handoffToQueue'. A auditoria refutou: os 19 timeouts de 30 dias foram logados no catch exatamente 146 s depois da mensagem, ou seja, a função passou dos 120 s e fez o handoff. A causa das órfãs verdadeiras segue desconhecida (reportCriticalError só faz console.error).
- (D_bot_ia) docs/ai/whatsapp-bot.md L7/L77 ('decisão de negócio é do cérebro… regra nas instruções'): parte das regras de negócio está fixa no CÓDIGO do micro, em buildDynamicContext (D:\Chatbot_whatsapp\bot.js:1156-1164 proíbe resolve para cliente cadastrado/docs; 1181-1184 força handoff no 2º 'não entendi'; 1185-1186 texto de fora do horário), e no texto fixo de áudio inaudível do decide (~1623). Editar só as instruções no banco não muda isso: registrar no mapa e na receita 'Mudar o comportamento do bot'.
- (D_bot_ia) docs/ai/whatsapp-bot.md L49 e comentário bot.ts:1146-1148: conversationFacts.docsReceived conta áudio e figurinha e soma a vida toda do contato (desde conversation.createdAt, e a conversa é 1:1 e nunca recriada), não 'neste atendimento'; também não filtra deletedAt.
- (D_bot_ia) docs/ai/whatsapp-bot.md L53 (crons/nudge): conversa em 'bot' cuja última mensagem é do cliente (órfã) ou de atendente só ganha botNudge30At e, 60 min depois, vai para standby/closed sem nenhum alerta; runNudgePhase não respeita horário comercial (só a recuperação e o SLA humano usam isBusinessHours).
- (D_bot_ia) docs/ai/whatsapp-bot.md L91: returnConversationToBot também zera assignedToId e NÃO limpa closeCategory; o cron depois encerra com a categoria antiga (ex.: 'transferido' do handoff anterior), e como 'transferido' está em NON_RECOVERABLE_CATEGORIES a conversa nem entra em standby. É a origem dos ~199 'encerrados como transferido' sem tag.
- (D_bot_ia) docs/ai/whatsapp-bot.md L112 (Novo caminho de encerramento): além de só existir no closeConversation manual, syncCloseTag remove a tag 'Qualificada' (marco do funil em bot-funnel.ts:35) quando o desfecho muda para outra categoria, porque 'Qualificada' é rótulo de CLOSE_CATEGORY_LABELS.qualificado.
- (D_bot_ia) docs/ai/whatsapp-bot.md L95 (Ficha por IA): além de quase nunca pular, o retorno 'nenhum dado novo' (ficha-ai.ts:264-272) e a recusa (237-239) saem antes do log, então não gravam usage; e roda uma vez por webhook sem debounce (N chamadas paralelas por rajada, com corrida de leitura/escrita do clientDraft).
- (D_bot_ia) docs/ai/whatsapp-bot.md L94/L115 (custo de IA): /transcribe e a transcrição dentro do /reply (Gemini) não devolvem usage (0 de 913 wa_transcribe com usage); /farewell, /followup-decision e /recovery-message também não, e o cron (cron-tasks.ts 350-595) não loga. Esse gasto está fora do Canto da IA.
- (D_bot_ia) docs/ai/whatsapp-bot.md L67 (Logs): no wa_bot, metadata.durationMs é a idade da conversa (Date.now() − conversation.createdAt, só em ações terminais), não latência da IA; não existe métrica de latência.
- (D_bot_ia) docs/ai/whatsapp-bot.md L104 (Auth das actions): getContratadosTagCount (app/_actions/whatsapp/tags.ts:70) só checa getServerSession, nem o requireTeamMember local (cliente logado por CPF consegue chamar); e o KPI usa contains 'contratad', que pega a tag de churn.
- (D_bot_ia) docs/ai/whatsapp-bot.md (Crons/Anti-spam): o 'horário comercial' tem 3 definições: bot.ts businessHours() (seg-sex 8-18, sáb 8-12, vai ao cérebro), cron-tasks.ts isBusinessHours/nextBusinessSlot (7-21 todos os dias, offset fixo −3h fora de date-br.ts) e uma cópia de nextBusinessSlot em signature/core.ts:1725.
- (D_bot_ia) docs/ai/whatsapp-bot.md L41/L50 (micro): /reply não observa a desconexão do CRM; o SDK Anthropic 0.110 roda com o padrão maxRetries 2 + timeout de 10 min, somado ao retry do callClaude (3) e do callClaudeStructured (2). Cada timeout de 45 s do CRM deixa uma chamada órfã gastando no micro. A transcrição de vários áudios no decide é sequencial (bot.js:1577-1597).
- (D_bot_ia) docs/ai/whatsapp-bot.md (Dados/alertas): alertDeliveryFailure tem debounce de 6 h por conversa (service.ts:545), então o alerta de mensagem 'travada' se repete a cada 6 h durante a janela de 12-72 h para a equipe inteira (~89 notificações por contato); handoffToQueue, handoffNotifyOnly e o SLA de fila notificam todos os whatsappRecipients em todos os degraus.
- (D_bot_ia) docs/ai/whatsapp-bot.md L48: 'markMessageRead(typing)' é enviado uma única vez por invocação, antes do debounce; o indicador expira (~25 s pela Meta) antes da resposta em ~46% dos casos.
- (D_bot_ia) docs/ai/hotspots.md: as faixas de bot.ts (1507 linhas) e cron-tasks.ts (1244 linhas) conferem com o código atual. Sem correção; regenerar depois desta onda, porque D2/D3/D9 mudam bastante as duas.
- (E_paineis_ux) docs/ai/analytics-custos.md (TL;DR, linha 5): diz que o StrategicDashboard é 'também montado direto em app/nova-dash/page.tsx'. O TabsContent dele está comentado em page.tsx:364-366 e o import em page.tsx:15 é código morto: só monta via Workspace.tsx:84 (seção 'dashboard').
- (E_paineis_ux) docs/ai/analytics-custos.md (Canto da IA, passo 1, e Armadilhas): falta a armadilha do initialAnalytics. A carga única sempre chama getChatbotAnalytics(7, null, …), e ChatbotDashboard.tsx:135-140 pula o 1º fetch mesmo com um número selecionado, então a aba Chatbot pode mostrar métricas de todos os números.
- (E_paineis_ux) docs/ai/analytics-custos.md: getChatbotAnalytics calcula team, closeCategories e intents/emotions, mas a UI não lê nenhum dos três. O bloco 'Desempenho da equipe' está comentado em ChatbotDashboard.tsx:230-265 e LeadOriginSection só usa adOrigins: carga morta ainda não registrada no mapa.
- (E_paineis_ux) docs/ai/analytics-custos.md ('Três travas de acesso'): getChatbotAnalytics, getAiCorner, getAdLeadOutcomes e getLeadFunnel usam só getServerSession + allowlist fixa por e-mail. Não chamam requireTeam (sem trava de IP, a decisão não lê o banco), o que contraria a regra do CLAUDE.md.
- (E_paineis_ux) docs/ai/whatsapp-bot.md (Fluxo, passo 10): 'a lista só recarrega quando o hash muda; SSE acelera' está incompleto. O onStream (WhatsAppInbox.tsx:516-521) recarrega a lista INTEIRA de 1.000 conversas em todo evento whatsapp:*. O efeito de markConversationRead (525-528) recarrega de novo, e useWhatsAppConversations tem revalidateOnFocus (use-whatsapp.ts:61).
- (E_paineis_ux) docs/ai/whatsapp-bot.md (armadilha 'Inbox', linha 92): além de 'fora dela só a busca acha', faltam três pontos. Os filtros de tag, data de entrada e coluna, as pastas e os contadores (dateCount, readCounts, numberCounts, kanbanColumns) só enxergam as 1.000 carregadas (~8 dias). A UI afirma 'em todas as pastas' (WhatsAppInbox.tsx:1180 e 1292). O aviso de corte some justamente com tag ou busca ativa (1409).
- (E_paineis_ux) docs/ai/whatsapp-bot.md (Dados, WhatsAppConversation): não diz que queuedAt é zerado ao assumir, encerrar e devolver ao bot (conversations.ts:519, 549, 596; bot.ts:640, 674, 1277). Por isso ele não serve para medir a espera da fila depois do fato; esse é o motivo do lastQueuedAt do E2b.
- (E_paineis_ux) Comentários desatualizados no código (não no mapa): 'lista capada em 200' em use-whatsapp.ts:78-79, conversations.ts:72-73 e WhatsAppInbox.tsx:190 (é 1000, LIST_PAGE em conversations.ts:23). use-whatsapp.ts:94-102 fala em 'polling 5s' e 'lista em 15s', mas o código usa 8 s na thread e hash de 15 s com lista a cada 2 min.
- (E_paineis_ux) Caminho citado na tarefa: 'app/nova-dash/card-dialog/CardDialog.tsx' não existe. O arquivo é app/nova-dash/CardDialog.tsx; o docs/ai/kanban-cards.md está certo.
- (E_paineis_ux) Depois da implementação (via /mapa-atualizar): analytics-custos.md ('Tetos de consulta: getChatbotAnalytics e loadCohort não têm teto') e o fluxo da carga única mudam com E1, E1c e E1g. data-model.md e whatsapp-bot.md ganham WhatsAppConversation.lastQueuedAt (E2b), e o inbox ganha queryWhatsAppConversations (E3).