# Planejamento — tickets DEV de 09/11/2026

Tickets: T-Y6ZGE, T-PMEYS, T-JH38P, T-GE364 (todos em **Em análise**, responsável Samuel).
Levantamento só de leitura no código; nada implementado ainda.

| ticket | o que é na prática | tamanho | decisão pendente |
|---|---|---|---|
| T-JH38P | desligar 1 chamada (ficha automática) | pequeno | nenhuma (recomendação abaixo) |
| T-GE364 | mostrar o "Apagar" que o servidor já aceita | pequeno | quem pode apagar nota de outra pessoa |
| T-PMEYS | os campos **já existem** no banco; falta tela, permissão e variável de automação | médio | onde fica a tela e quem edita |
| T-Y6ZGE | filtros novos no board (hoje só busca + coluna) | médio | quais filtros |

---

## T-JH38P — remover o preenchimento automático do card pela IA

**Hoje.** O único caminho em que a IA grava cadastro sem clique é a ficha automática
(`autoFillClientInfo`, `app/_shared/lib/whatsapp/ficha-ai.ts:168`), chamada pelo webhook a cada
rajada de mensagem (`app/api/whatsapp/webhook/route.ts:116`). Com contato vinculado, grava direto no
`User` (só campos vazios); sem vínculo, grava no rascunho `WhatsAppContact.clientDraft`, que vira card
quando o operador clica em criar. Também grava `WhatsAppContact.name`, `hospitalHint` e o selo "IA".
Não há flag para desligar. Custo: ~8 mil chamadas de Haiku a cada 14 dias.

Não é preenchimento de cadastro (fica como está): resumo da conversa como **comentário** ao criar o
card, auditoria de documentos (automação configurada pela equipe), `editar_cadastro` da IA de operação
(pedido explícito do operador, com prévia).

**Plano.**
1. Tirar a chamada do webhook atrás de uma env `WA_FICHA_AUTO` (padrão desligada), para voltar sem
   deploy se a equipe sentir falta. O botão **"Preencher com IA"** do Copiloto continua (ação explícita).
2. Mapa `docs/ai/whatsapp-bot.md` + CLAUDE.md da pasta (a regra "roda a cada rajada" muda).

**Efeitos que a equipe vai notar.** O formulário "criar card" pela conversa vem vazio (o rascunho não
se preenche sozinho); o nome do contato deixa de ser corrigido pela IA; o `hospitalHint` da conversa
deixa de ser preenchido (é o `[[hospital]]` do WhatsApp por conversa da IA de operação). O cérebro do
bot não lê a ficha: nada muda no micro.

---

## T-GE364 — apagar nota interna na conversa

**Hoje.** `deleteWhatsAppMessage` (`app/_actions/whatsapp/send-message.ts:508`) já faz soft delete de
mensagem do próprio autor e **não barra nota**. O que falta é a tela: a nota interna tem um desenho
próprio (`WhatsAppInbox.tsx:3528`) que só mostra o botão de fixar, sem editar nem apagar.

**Plano.**
1. Botão "Apagar nota" (lixeira) na nota, ao lado do de fixar, para o **autor**; confirma antes.
2. No servidor: ao apagar a nota fixada, limpar `pinnedNoteId/pinnedNoteAt` da conversa.
3. Nota apagada some da thread (hoje o desenho da nota ignora `deletedAt`).
4. Conferir que o cérebro (`brain.ts:194`) e a lista de notas da aba Arquivos ignoram nota apagada.
5. Nota do bot (motivo da transferência) continua sem apagar: a Fila usa a última nota do bot como
   motivo e essa leitura não filtra `deletedAt`.

O que não some: o sino/caixa de Menções de quem foi @mencionado e o log `wa_note` (auditoria).

**Atenção.** `WhatsAppInbox.tsx` tem mudanças não commitadas de outra frente (respostas em áudio):
implementar depois que elas entrarem, para não misturar commits.

---

## T-PMEYS — e-mail e telefone de contato do hospital

**Hoje.** Os campos já existem no banco: `hospital_email`, `hospital_telefone`, `hospital_modo`,
`hospital_obs` no registro GHOST de cada hospital (migration de 25/10). A IA de operação já lê
(`consultar_hospital`, e o e-mail é o destino padrão do `/prontuario`). Mas **não existe tela** de
informações do hospital: só o script `vault-hospitais-para-ghost.mjs` grava, e o `--apply` nunca foi
rodado (147 hospitais prontos para preencher no dry-run de 25/10). As automações do kanban não
enxergam esses campos (`[[campo]]` lê só o card).

**Plano.**
1. Permissão nova `manage_hospitals` (`PERMISSION_DEFS` + `ROLE_DEFAULTS` + guard no servidor).
2. Action `updateHospitalContact` (e-mail validado, telefone só dígitos) + `invalidateHospitalCache`.
3. Tela: dialog "Informações do hospital" aberto por um botão ao lado do campo Hospital no card
   (sugestão) — lista e edita e-mail/telefone/modo/observação do hospital selecionado.
4. Automações: `[[hospital_email]]` e `[[hospital_telefone]]` resolvidos pelo hospital do card
   (`hospitalContactFor`) no executor + na paleta de variáveis do `AutomationsPanel`.
5. Rodar o `--apply` do script (só preenche vazio) para já entrar com os 147 contatos das notas.
6. Ferramenta da IA para editar o contato (`editar_hospital`, L3) — opcional, fica para depois.

Sem migration. **Achado de segurança** no caminho: `DELETE /api/hospitals` não exige permissão (só
bloqueia somente leitura) e apaga o nome do hospital em todos os cards — corrigir junto.

---

## T-Y6ZGE — filtros dentro do kanban

**Hoje.** O board já tem busca (nome, nº do card, CPF, telefone; lista arquivados à parte) e um
seletor de etapa (coluna). Tudo filtra no navegador, sobre os cards carregados. Não persiste: trocar
de aba zera. Os cards já chegam com tags, prazo da coluna e dias na coluna; **hospital e serviço não
chegam** ao board.

**Plano (filtros sugeridos).**
1. **Tag** (uma ou mais), **prazo estourado**, **afastado** — sem custo novo (os dados já chegam).
2. **Hospital** — exige incluir o campo no payload do board (cresce o JSON do poll de 7 s).
3. Contador "N de M" por coluna quando houver filtro; botão "limpar filtros"; filtros guardados no
   `sessionStorage` (como o inbox).
4. **Arrastar com filtro ativo**: hoje reordenar uma coluna filtrada (inclusive com a busca) refaz a
   ordem só dos cards visíveis e embaralha os escondidos. Corrigir calculando a ordem sobre a coluna
   inteira (vale também para a busca atual).

"Responsável" não existe no card (não há dono do card), então não entra sem decidir o que seria.

---

## Ordem sugerida

1. T-JH38P (pequeno, corta custo de IA).
2. T-GE364 (pequeno; depois do commit das respostas em áudio).
3. T-PMEYS (médio; inclui a correção de segurança).
4. T-Y6ZGE (médio; inclui a correção do arrastar com busca).
