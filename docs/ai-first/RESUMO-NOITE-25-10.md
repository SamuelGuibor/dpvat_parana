# Resumo da noite de 25/10/2026 — guia para validar as Etapas 3 a 7

> Feito por sessões autônomas enquanto você dormia. Tudo está **commitado localmente na `main`, sem push**. Nada saiu (nenhum e-mail, nenhum WhatsApp), nenhum card/comentário/tag real foi criado ou editado, e toda ferramenta nova de escrita nasceu com o interruptor **desligado**. Este arquivo é o roteiro único; o detalhe de cada etapa está no `0N-resultado-etapa-N.md` indicado. Decisões **(provisória)** foram tomadas pelo lado conservador e esperam o seu OK.

## Antes de começar (5 min)
- `git log --oneline -6` deve mostrar, do mais novo para o mais antigo: `c6360f8` Etapa 7 · `90e591f` Etapa 6 · `c79771f` Etapa 5 · `acb9bd7` Etapa 4 · `47a98d2` Etapa 3 (e o `66c4e83` com as suas decisões da Etapa 3).
- **Migrations**: `npx prisma migrate status` → "Database schema is up to date!" (conferido às 02h50 de 25/10). A única migration nova da noite é a da Etapa 5 (`20261025120000_op_approvals_hospital_contato`: tabela `op_approvals` + `User.hospital_email/telefone/modo/obs`, só aditiva) e **já está aplicada no Neon**. Etapas 3, 4, 6 e 7 não têm migration.
- Crie o **card de teste "TESTE IA — não mexer"** (numa coluna sem automação de WhatsApp, com dados fictícios e o **seu** telefone/e-mail) e a tag `TESTE IA`. Todos os testes abaixo usam só esse card.
- Os testes de escrita rodam contra produção: depois de cada etapa, **desligue de novo** o que ligou se não for usar.

## Etapa 3 — escrita interna (L3) com prévia, interruptores e `/meu-dia` · commit `47a98d2`
Detalhe: `docs/ai-first/03-resultado-etapa-3.md`.
- **No site primeiro** (a Etapa 3 trocou as libs que o site usa): arrastar card entre colunas e na mesma coluna (agora é noop), marcar/tirar tag (aparece no histórico), comentar com @menção, arquivar/desarquivar — tudo igual a antes. Automação de comentário/tag/mover numa coluna de teste segue rodando.
- **Espaço de Trabalho → IA de operação**: ligar as 6 ações (Mover, Marcar tag, Tirar tag, Comentar, Avisar pessoa/setor, Arquivar).
- **No Claude Code** (reiniciar antes): `/meu-dia` → `/processo <nº do card de teste>` → pedir "move o <nº> para <coluna>" → prévia sem escrita → "sim" → estado relido, histórico "(via IA)"; repetir = noop; mexer no card pelo site entre a prévia e o "sim" → `estado_mudou`; tag add/remove; comentário com menção; "avisa o setor comercial"; arquivar não destrutivo e desarquivar; destino destrutivo → recusa (faça pelo site); desligar um interruptor → some do catálogo em ~15 s.
- Migration: nenhuma. Perguntas: as 6 já foram respondidas por você em 25/10. **Pendente seu**: passo 8 — liberar `op_write` para ADMIN/ADMIN+ (hoje só ADMIN++).

## Etapa 4 (+ 4b) — documentos em rascunho e `/contrato` · commit `acb9bd7`
Detalhe: `docs/ai-first/04-resultado-etapa-4.md` (roteiro da 4b na seção "Etapa 4b").
- **No site**: aba Integrações de um card → "Gerar Procuração" sai igual a antes.
- **No Claude Code**: `diagnostico_crm` lista `listar_modelos` e as 3 `preparar_*`. `/procuracao <nº> Curitiba` com um campo vazio no card de teste → lista de faltantes, nada gerado; "gerar mesmo assim" → link do PDF com o campo em branco (sem "undefined"). Ligar **"Anexar documento preparado"** → prévia → "sim" → PDF na pasta PROCURAÇÃO, histórico "(via IA)"; repetir = noop. `/pedido-prontuario <nº>` → pedido + como mandar ao hospital com a fonte.
- **4b `/contrato` — NÃO TESTADA**: precisa do seu Chrome com a extensão Claude in Chrome e você logado no ZapSign; siga os 9 passos do roteiro (signatário = você).
- Migration: nenhuma (rascunho só no S3 `op-drafts/`, 7 dias). Decisões provisórias: rascunho (L2) sem interruptor; IA não preenche cadastro; só quem preparou anexa; ZapSign pelo navegador de quem pede. Perguntas 1–7 no resultado (KIT padrão EVELYN × CSS × TAYNARA; data do "Gerar Procuração" do site em Brasília).

## Etapa 5 — e-mail e WhatsApp com aprovação digitada (L4) e `/prontuario` · commit `c79771f`
Detalhe: `docs/ai-first/05-resultado-etapa-5.md`.
- **Antes**: `node -r dotenv/config scripts/vault-hospitais-para-ghost.mjs` (dry-run) → ler → `--apply` (só preenche coluna vazia dos GHOST).
- **No Claude Code**: ligar **"E-mail para fora (hospital) — canal"** e **"Enviar o que o operador aprovou"**. No card de teste (hospital com o **seu** e-mail, ou `para` = seu e-mail, que sai como "fora do cadastro"): `/prontuario <nº>` → pedido em rascunho → prévia do e-mail com código → digite **outra coisa** → `aprovacao_nao_digitada` → digite `aprovo <código>` sozinho → o e-mail chega com o anexo → comentário + histórico no card → repetir = noop. Esperar 30 min → `aprovacao_expirada`. WhatsApp só se quiser, com o seu telefone num contato de teste e a janela de 24 h aberta.
- **Depois**: desligar os três interruptores; olhar bounce/reclamação no SES.
- Migration: `20261025120000_op_approvals_hospital_contato` (**já aplicada**). Decisões provisórias: aprovação = `aprovo <código>` como última mensagem; e-mail para endereço digitado sai com aviso; WhatsApp só UTILITY e aparece no inbox como "mensagem automática"; `op_approve` só ADMIN++. Perguntas 1–10 no resultado (remetente do SES, cc padrão, retenção de `op_approvals`).

## Etapa 6 — fluxos com retomada (`/retomar`) · commit `90e591f`
Detalhe: `docs/ai-first/06-resultado-etapa-6.md`.
- **No Claude Code**: `diagnostico_crm` lista `fluxos_abertos`/`retomar_fluxo` e `salvar_progresso` desligada. Ligar **"Guardar o progresso dos fluxos"**. Card de teste **com a data do acidente vazia**: `/prontuario <nº>` → para nas pendências e diz "digite /retomar" → feche a conversa → preencha a data no site → conversa nova: `/retomar` → mostra onde parou → "sim" → gera o pedido uma vez → anexar → pare antes do e-mail → `/retomar` noutra conversa → não gera de novo, vai ao e-mail com **código novo** (a aprovação antiga vira `cancelada`).
- Migration: nenhuma (estado em `op_requests.state`). Decisões provisórias: estado só com ids; bloqueio sem texto livre; `salvar_progresso` com interruptor; 14 dias = abandonado; não retoma fluxo de outra pessoa. Perguntas 1–7 no resultado (incluir as 3 no `allow` do `.claude/settings.json`?).

## Etapa 7 — painel "Operação por IA", `/auditoria-operacao`, `/varredura` · `c6360f8`
Detalhe: `docs/ai-first/07-resultado-etapa-7.md`. **Só leitura** (nenhuma ferramenta nova grava; nada a ligar).
- **No site**: Espaço de Trabalho → IA de operação → painel "Operação por IA — rendimento" acima dos interruptores (só quem tem a Visão do Gestor). 7 dias: ~13 pedidos seus e "106 conversa(s) fora da conta" (seus prompts de desenvolvimento). Passe o mouse nos números (definições); troque período/operador; "Mostrar pedidos" → só pedidos; "Mostrar conversas" → inclui desenvolvimento; nenhum token `crmop_…` aparece. Depois de testar as Etapas 3–6, os cards de teste aparecem em "Cards conduzidos" e o clique abre o card.
- **No Claude Code**: `diagnostico_crm` lista `gerar_relatorio` e `varrer_inconsistencias`. `/auditoria-operacao últimos 30 dias` → rendimento, consultas, falhas, fluxos, envios e "O que melhorar", tudo com id/card/código, sem texto de pedido. `/varredura` → hoje acha 4 CPFs inválidos e 5 cards sem hospital em FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL; não altera nada.
- Migration: nenhuma (medido: sem necessidade de índice). Decisões provisórias: painel só `manager_dashboard`; pedido × conversa pela skill/ferramenta (o `cwd` não separa); "ação" inclui preparar documento; tempo = intervalos ≤ 30 min; varredura com 5 checagens fixas. Perguntas 1–8 no resultado (quais colunas exigem hospital; retenção do texto dos prompts).
- **Não testado**: a tela logada (a sessão não entra com senha) e as duas skills no app (catálogo muda só depois do deploy).

## Etapa 8 — só o plano
`docs/ai-first/08-plano-etapa-8.md`: autonomia gradual decidida pelos números do painel, **depois de ≥ 1 semana de uso real** (limiares provisórios: ≥ 10 execuções por ferramenta e operador, desfeito ≤ 5 %, `estado_mudou` ≤ 10 %, falha ≤ 5 %; nenhuma L4 dispensa o `aprovo <código>`). Não implementado.

## Perguntas que só você responde (as mais importantes; a lista completa está em cada resultado)
1. Liberar `op_write` para ADMIN/ADMIN+ (Etapa 3, passo 8) — quando e para quem primeiro?
2. KIT padrão do contrato e ZapSign por operador ou conta única (Etapa 4).
3. Remetente do SES e cc padrão nos pedidos de prontuário (Etapa 5).
4. Retenção de `op_requests.text` e `op_approvals.args` (sugestão: 180/90 dias) (Etapas 5 e 7).
5. `.claude/settings.json`: pôr no `allow` as L1 `fluxos_abertos`, `retomar_fluxo`, `salvar_progresso`, `gerar_relatorio`, `varrer_inconsistencias` (L3/L4 nunca) (Etapas 6 e 7).
6. Quais colunas exigem hospital na `/varredura` (Etapa 7).

## Ordem de deploy
1. **Migrations**: nada a fazer — já aplicadas (`npx prisma migrate status` = up to date). Não rode `migrate dev`/`reset`.
2. **Push** da `main` (leva as Etapas 3 a 7 juntas) → aguardar o deploy da Vercel terminar sem erro (o build real é o da Vercel; não rode `next build` local).
3. **Conferir o site** sem a IA (Etapa 3, "No site primeiro"; Etapa 4, "Gerar Procuração").
4. **Reiniciar o Claude Code** (catálogo do MCP e as skills novas `/auditoria-operacao` e `/varredura` só carregam assim) → `diagnostico_crm`.
5. **Ligar os interruptores um a um, no card de teste**, na ordem das etapas: as 6 da Etapa 3 → "Anexar documento preparado" (4) → "E-mail para fora" + "Enviar o que o operador aprovou" (5) → "Guardar o progresso dos fluxos" (6). Testar cada um antes de ligar o próximo; **desligar** o que não for ficar ligado.
6. Abrir o painel da Etapa 7 e conferir que os testes do dia aparecem lá (pedidos, ações, cards conduzidos, envio executado).
7. Responder as perguntas e, depois de uma semana de uso, começar a Etapa 8 por `docs/ai-first/08-plano-etapa-8.md`.
