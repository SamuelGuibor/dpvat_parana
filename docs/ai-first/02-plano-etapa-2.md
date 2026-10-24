# AI-First — Etapa 2: plano de execução (base de conhecimento da operação)

> **Comece aqui num chat novo.** Leia, nesta ordem: este arquivo → `docs/ai-first/01-resultado-etapa-1.md` (o que existe e as evidências) → `docs/ai/operacao-ia.md` (mapa técnico) → só se precisar de contexto de negócio, `docs/ai-first/00-diagnostico-etapa-zero.md` (§6.4 vault, §10 decisões). Regras do repo valem integralmente (`CLAUDE.md` raiz, skills `/plano` `/migration` `/validar` `/mapa-atualizar`). Banco = produção. Escrito em 24/10/2026.

## Ponto de partida (estado em 24/10/2026)
- **Etapa 1 no ar e testada pelo dono** (commit `ea0de1f`): Claude Code → MCP `crm-op` → `/api/op/*` com token por membro; 10 ferramentas só de leitura; skills `/cliente`, `/processo`, `/parados`, `/pendencias`; registro em `op_sessions`/`op_requests`/`op_tool_calls`.
- **Evidência no banco** (`node -r dotenv/config scripts/op-relatorio.mjs --dias=2`): 1 token (Samuel, ADMIN++), 4 sessões, 9 prompts (`/cliente` 1, `/processo` 2, `/parados` 1, `/pendencias` 1, texto livre 4), **11 chamadas de ferramenta, 11 ok, 11 ligadas ao prompt**, 94 cards lidos, 34–230 ms por chamada. Detalhe em `01-resultado-etapa-1.md` §"Evidências em produção".
- **Material pronto para esta etapa**: `docs/ai-first/02-mapa-etapas-logs.md` (o que cada coluna recebe, pelos logs) e o pré-layout do quadro "Cérebro APP" (link no passo 9).
- **Mudança depois do teste, ainda não publicada no momento em que este plano foi escrito**: CPF e telefone saem **sem máscara** nas ferramentas e no registro (decisão do dono, 24/10). Confira com `git log` se já foi para a `main`.

## Objetivo da etapa
A IA passa a saber **como se faz** a operação, não só onde está cada card. Pergunta de exemplo que precisa funcionar no fim: *"como peço o prontuário no Hospital Angelina Caron?"* → resposta com o procedimento, o contato, a procuração exigida e **a fonte** (nota publicada + automação de origem). Nota que não está publicada **não** é usada como verdade.

Nenhuma escrita no CRM nesta etapa: o conhecimento vive em arquivos do repositório (vault) e numa cópia no S3. As automações continuam como estão.

## Decisões do dono que esta etapa segue
| # | Decisão | Efeito |
|---|---|---|
| 4 | Vault dentro do repo, `docs/operacao/` | notas `.md` versionadas no git, abríveis no Obsidian |
| 5 | Sem tabela espelho; vault sincronizado como arquivos no S3 (`operacao-vault/`) | script de sync com dry-run; o site/CRM lê do S3 quando precisar |
| 10 | Sem DPVAT | notas de serviço só para INSS |
| 24/10 (nova) | **Quem publica as notas = agentes**: um agente redige, outro valida, para tirar essa carga do dono | pipeline redator → validador; humano só no que os agentes não fecham e numa amostra |
| 24/10 (nova) | **No futuro**, operador com hierarquia (`manage_knowledge`) pode gravar conhecimento novo; uma **IA auxiliar** confere a proposta contra as automações que já existem antes de gravar | skill `/conhecimento` com checagem de conflito × automações; publicar exige `manage_knowledge` |
| 24/10 (nova) | CPF e telefone sem máscara nas ferramentas | já feito no código; notas podem citar contato de hospital normalmente |
| 24/10 (resposta 1) | **Amostra humana**: o dono confere uma amostra das notas aprovadas por lote | relatório do lote traz 10% aleatório para conferência |
| 24/10 (resposta 2) | `manage_knowledge` fica **só no ADMIN++** (padrão atual). Fluxo "de desenvolvimento": o operador com a sugestão **abre um card/ticket**; outro operador com permissão de conhecimento **implementa com a IA dele** | `/conhecimento` tem dois modos: *sugerir* (qualquer operador: prepara o texto + conflitos, abre o pedido) e *implementar* (só `manage_knowledge`: redige, valida, publica) |
| 24/10 (resposta 4) | **Automações inativas ficam fora** do vault | seed lê só `isActive: true` (278) |

## O que o levantamento no banco mostrou (24/10, só leitura)
| Dado | Valor | Consequência para o plano |
|---|---|---|
| Automações na coluna "DISTRIBUIÇÃO DE SOLICITAÇÕES" | **283** (278 ativas), todas com condição `hospital equals <NOME>` e ação `comment` | 1 nota por hospital; `fonte` = id da automação |
| Hospitais distintos nessas automações | **281** (2 nomes repetidos) | o seed agrupa por nome normalizado e junta as duas fontes |
| Automação sem texto útil | 1 | vira nota `rascunho` com `pendente_humano` |
| Tamanho do texto do comentário | média 331, máx. 1.703 caracteres | cabe inteiro na nota (bloco "Fonte") |
| Modos citados no texto (heurística) | e-mail 209 · link/site 111 · WhatsApp 67 · presencial 43 (um hospital pode ter mais de um) | campo `modo` é lista, não valor único |
| Ações `file` (formulário anexado) | 6 (Formulário, termo de envio eletrônico, Bom Jesus 1/2, São Francisco de Francisco Beltrão, Formulário de solicitação) | nota cita o anexo pelo nome; o arquivo segue no S3 `automation-templates/` |
| GHOST (catálogo de hospitais) | 249, nome com prefixo **`[HOSPITAL] `** | casar sem o prefixo: **248 de 281** batem |
| Cards ativos com hospital preenchido | 113; **85 (75%)** têm automação com o mesmo nome | 28 cards de hospitais sem procedimento → relatório de lacunas |
| Hospitais de cards ativos sem automação (exemplos) | Municipal de Araucária (2), UPA Pato Branco, Maice, São Camilo Campo Largo, Oswaldo Cruz… | lista de lacunas para a equipe preencher |
| Outras colunas com automação | FAZER PROTOCOLO (1, "GERAL" = modelo do e-mail de pedido de prontuário), COM SENHA (2), PERÍCIA AGENDADA (5 WhatsApp por prazo), AFASTADOS (4) | modelo `modelos/email-prontuario.md` sai da "GERAL"; notas de coluna nascem quase vazias |
| Texto das automações cita pessoas internas ("informações do Thomaz"), telefones e links do Google Drive | — | a nota mantém tudo literal no bloco Fonte; o resumo só repete o que está lá |

### Mapa das etapas pelos logs (substitui, por ora, a lista oficial do INSS)
O dono não tem a lista de documentos por etapa. Em vez de esperar, ela sai do que a equipe **faz**: `scripts/mapa-etapas.mjs` (só leitura) lê 90 dias de `logs` (`move`, `document_add`, `update`, `status_change`, `comment_add`, `ai_audit`, `archive`) + os `Document` de cada card e mede, por coluna, o que o card recebe durante a etapa e o que ele **já tem quando sai**. Resultado completo: `docs/ai-first/02-mapa-etapas-logs.md` (1.074 cards, 26.082 logs, gerado em 24/10).

A esteira que aparece (pasta presente em ≥ 70% das saídas = "costuma estar completa a partir daqui"):

| Coluna | o que "acende" ao sair | sinal no cadastro durante a etapa |
|---|---|---|
| COLHER-ASSINATURA (676 saídas, mediana 0,7 d) | Documento de identificação 87% | CEP, CPF, nacionalidade editados (11–13%) |
| FALTA SENHA - SOLICITADO (614, 1,1 d) | — (DOCS INSS 58%) | **Senha INSS editada em 29%** das passagens |
| COM SENHA - SOLICITADO (301) | **DOCS INSS 97%** | Senha INSS / observação |
| INSS/OAB/POUPA TEMPO (228) | **Procuração 83%**, DOCS INSS 80% | 39% voltam para uma coluna anterior |
| AGENDAR PERÍCIA ADM (106, 1,7 d) | **Exame médico 89%** | — |
| AGUARDANDO SAIR DATA PERÍCIA (54, 6,9 d) | **Processo 74%** | — |
| AUDITORIA (390, 1,0 d) | Exame médico 85%, DOCS INSS 99% | etapa "Perícia realizada" |
| FAZER ROTEIRO PREV (616) | **Roteiro 82%** | etapa "Perícia realizada" |
| ENVIAR EMAIL UNI/CCS (115) | **Hipossuficiência 83%**, tudo ≥ 99% | pasta completa antes do envio |

Leitura: **identidade → senha INSS → DOCS INSS → procuração → exame médico → roteiro → hipossuficiência**, com a pasta inteira completa antes do e-mail para UNI/CCS. Isso vira o rascunho de `servicos/inss.md` e das notas `etapas/<coluna>.md` (`kind: extraido_dos_logs`), que **uma pessoa confirma** (não é regra até ser publicado). Limites do método: a coluna 0 recebe cards por criação, não por `move`; tags não têm log (só a foto de hoje); colunas antigas renomeadas aparecem em "vem de/vai para"; mediana baixa (0,1 d) em várias colunas mostra que muitas passagens são cards empurrados em sequência.

## Ordem de execução

### 0. Pendências da Etapa 1 (antes de tudo)
- **Revogar o token que foi colado no chat** (é o único token hoje, segue ativo) e gerar outro: Equipe → Token do app.
- Publicar a remoção das máscaras, se ainda não foi (`git log dpvat/main`).
- Opcional, fora do AI-First: corrigir `'\D'` → `'\\D'` em `findLinkedCard` (`app/_shared/lib/whatsapp/bot.ts`) — o vínculo conversa↔card falha com telefone mascarado.

### 1. Estrutura do vault (`docs/operacao/`)
```
docs/operacao/
  Mapa da Operação.md          índice com wikilinks (como o vault do bot em D:\Chatbot_whatsapp\mapa-obsidian)
  _modelo-nota.md              modelo de nota (frontmatter comentado)
  hospitais/<slug>.md          1 por hospital (seed das automações)
  etapas/<slug-da-coluna>.md   1 por coluna do kanban (20)
  servicos/inss.md             documentos exigidos, etapas, prazos
  modelos/email-prontuario.md  texto do pedido (da automação "GERAL")
  regras/*.md                  regras da operação (ex.: "Não mover card com tag NÃO MOVER")
  _relatorios/lacunas.md       gerado: hospitais de cards sem procedimento, GHOST sem automação, divergências
```
**Frontmatter obrigatório** (validado por script, passo 4):
```yaml
kind: oficial | extraido_do_codigo | sugestao_ia
status: rascunho | em_validacao | publicado | desatualizado
fonte: automation:<id>            # ou "pessoa:<nome>", "docs/ai/<mapa>.md", "card:<nº>"
fonte_hash: <sha256 do texto da fonte no momento da redação>
hospital: <nome exato da condição da automação>   # só em hospitais/
ghost_id: <User.id do GHOST>                       # se casou
modo: [email, whatsapp, presencial, site]
contatos: { email: [...], telefone: [...], site: [...] }
procuracao: <texto curto ou null>
prazo: <texto ou null>
redigido_por: agente-redator | <pessoa>
validado_por: agente-validador | <pessoa>
publicado_por: <pessoa com manage_knowledge | agente-validador>
atualizado_em: AAAA-MM-DD
pendente_humano: [lista do que só uma pessoa resolve]   # vazio para publicar
```
Corpo de nota de hospital: `## Como pedir` (passos), `## Contato`, `## Documentos e procuração`, `## Prazo e retorno`, `## Observações`, `## Fonte` (texto **literal** da automação, sem edição, + nomes dos anexos `file`).

### 2. Seed determinístico — `scripts/vault-seed-hospitais.mjs`
- Lê (transação READ ONLY) as automações **ativas** da coluna "DISTRIBUIÇÃO DE SOLICITAÇÕES" (278; as 5 inativas ficam fora, decisão do dono) + GHOST (casando sem `[HOSPITAL] `) + contagem de cards ativos por hospital.
- Gera **só o esqueleto**: frontmatter (`kind: extraido_do_codigo`, `status: rascunho`, `fonte`, `fonte_hash`, `ghost_id`), `contatos` extraídos por regex (e-mail, telefone, URL) e o bloco `## Fonte` literal. **Não interpreta texto** — isso é do agente redator.
- Gera `_relatorios/lacunas.md` e o `modelos/email-prontuario.md` (texto da automação "GERAL").
- Dry-run por padrão (lista o que criaria/alteraria); `--apply` escreve os arquivos. Nunca sobrescreve nota com `status: publicado` cujo `fonte_hash` não mudou; nota publicada cuja fonte mudou → vira `desatualizado` (não é reescrita).
- Lógica pura (slug, normalização, regex de contato, hash, decisão criar/pular/desatualizar) em `app/_shared/utils/vault.ts` com testes.

### 3. Agentes de publicação (decisão do dono)
Dois subagentes em `.claude/agents/`, orquestrados pela skill `/publicar-conhecimento [lote|pasta]`:
- **`redator-conhecimento`**: recebe uma nota `rascunho`, lê o bloco `## Fonte` e escreve as seções `Como pedir`/`Contato`/`Documentos e procuração`/`Prazo e retorno`/`Observações` e os campos `modo`/`procuracao`/`prazo`. Regra: **só o que está na fonte**; o que for ambíguo vai para `pendente_humano`. Muda `status` para `em_validacao`.
- **`validador-conhecimento`**: independente (não recebe o raciocínio do redator, só a nota e a fonte). Confere: todo e-mail/telefone/link do corpo aparece literalmente na Fonte; nada foi acrescentado; modo e procuração batem; frontmatter válido; nada contraria as regras do CRM (docs/ai). Saída: `aprovado` → `status: publicado`, `validado_por`/`publicado_por: agente-validador`, `atualizado_em`; `devolvido` com motivos → volta ao redator **uma vez**; segunda reprovação → fica `rascunho` com `pendente_humano`.
- **Checagem determinística antes do validador**: `scripts/vault-check.mjs` (passo 4) roda primeiro; nota que falha nele nem chega ao validador.
- **Humano no circuito** (confirmado pelo dono): o lote termina com um relatório (`_relatorios/publicacao-<data>.md`) com aprovadas, devolvidas, `pendente_humano`, e uma **amostra aleatória de 10%** das aprovadas para o dono conferir. O commit do lote é feito pela sessão do operador (git = histórico de quem publicou o quê).
- Lote de 20 notas por rodada; 281 notas ≈ 15 rodadas. Se o dono pedir explicitamente uma orquestração maior, dá para usar o Workflow (vários redatores/validadores em paralelo).

### 4. Validador determinístico — `scripts/vault-check.mjs`
- Frontmatter completo e com valores válidos; `status: publicado` exige `validado_por`, `publicado_por` e `pendente_humano` vazio.
- Contatos do corpo ⊂ contatos da Fonte (e-mail/telefone/URL literais).
- **Drift**: `fonte_hash` × hash atual da automação no banco (leitura) → lista as notas `desatualizado`.
- Wikilinks do `Mapa da Operação.md` existem.
- Roda no `/validar` quando `docs/operacao/` mudou; lógica pura em `app/_shared/utils/vault.ts` com `tests/vault.test.ts`.

### 5. Notas de etapa (colunas) e de serviço INSS — a partir do mapa dos logs
- `scripts/mapa-etapas.mjs` (já existe, só leitura) ganha a opção `--vault` que gera `etapas/<coluna>.md` para as 20 colunas com `kind: extraido_dos_logs`, `status: rascunho`, `fonte: logs:<data>:<dias>d`: ordem, `timeLimitDays`, de onde vem/para onde vai, mediana de dias, o que acende na saída (≥ 70%), campos editados (≥ 30%), automações da coluna e tags de hoje. Seções **"Para entrar"** e **"Para sair"** preenchidas como **proposta** ("em 97% das saídas o card já tinha DOCS INSS").
- `servicos/inss.md` nasce da esteira acima (lista ordenada de pastas por etapa), também `rascunho`.
- **Confirmação humana curta** (não é ditar a lista do zero): o redator transforma cada proposta em pergunta sim/não ("Para sair de COM SENHA, o card precisa ter DOCS INSS? 97% têm"); o dono responde em lote; o validador grava `fonte: pessoa:<nome>, <data>` e publica. O que ficar sem resposta continua rascunho.
- Quando `servicos/inss.md` estiver publicado, o `verificar_pendencias` passa a comparar o card com a lista da etapa atual (mudança pequena na ferramenta; o aviso "a lista oficial ainda não existe" sai).
- Rodar o mapa de novo a cada mês mostra se a rotina mudou (diferença grande vira ticket "Desatualizado" no quadro do passo 10).

### 6. Sync para o S3 — `scripts/sync-vault-s3.mjs`
- Só notas `publicado`; compara hash local × objeto (`operacao-vault/<caminho>.md`, metadata `sha256`) e sobe só o que mudou; dry-run por padrão, `--apply` escreve.
- Gera `operacao-vault/index.json` (caminho, título, hospital, `ghost_id`, `atualizado_em`, hash) para leitura barata.
- Não apaga nada no S3 sem `--prune` explícito.

### 7. Ferramenta `consultar_hospital` (L1, `op_use`)
- Entrada: nome do hospital (aproximado) ou nº do card (usa o hospital do card).
- Casa o nome com `normalizeColumnName`-like (reaproveitar/generalizar `matchColumn` em `app/_shared/lib/op/resolve.ts`); ambíguo → candidatas.
- Devolve: nota publicada lida do S3 (via `index.json`), **texto vivo da automação** (o CRM é a verdade operacional hoje), `desatualizado: true` se `fonte_hash` ≠ hash atual, GHOST casado, quantos cards ativos têm esse hospital.
- Sem nota publicada → devolve a automação viva com `aviso: "procedimento ainda não validado"`.
- `S3` de leitura: reaproveitar cliente/padrão de `app/_shared/lib/s3-presign.ts` (não criar outro `S3Client` à toa); prefixo novo em `ALLOWED_KEY_PREFIXES` só se for assinar URL.

### 8. Skills
- **`/hospital <nome|nº do card>`**: `consultar_hospital` → responde com passos, contato, procuração, prazo, **fonte** e se está desatualizado; termina com "Próximos passos sugeridos" (ex.: "gerar procuração — Etapa 4").
- **`/conhecimento`** — fluxo "de desenvolvimento" definido pelo dono (quem sugere ≠ quem implementa):
  - **Modo sugerir** (qualquer operador com `op_use`): `/conhecimento sugerir <assunto>`
    1. a IA auxiliar busca no vault e nas automações (`consultar_hospital` / Grep em `docs/operacao/`) o que já existe;
    2. mostra o **conflito ou a sobreposição** ("a automação do Hospital X diz e-mail A; você está propondo e-mail B");
    3. monta o pedido (assunto, o que muda, fonte/evidência, conflitos) e o operador **abre o card/ticket** no site. Nesta etapa a IA não escreve no CRM: ela entrega o texto pronto para colar. Candidato a mecanismo, já existente: **Tickets Dev** (`DevTicket`, aba Tickets) — já tem o fluxo `EM_DISTRIBUICAO → EM_ANALISE → EM_DESENVOLVIMENTO → CONCLUIDO`, e `type` é String no banco: acrescentar `CONHECIMENTO` em `TICKET_TYPES` (`app/_actions/dev-tickets/ticket-actions.ts`) e no `CreateTicketDialog.tsx`, **sem migration**. Confirmar com o dono antes de criar qualquer coisa nova. Abrir o ticket pela IA vira ferramenta L3 na Etapa 3.
  - **Modo implementar** (só `manage_knowledge` = ADMIN++): `/conhecimento implementar <nº do ticket ou texto do pedido>`
    1. confere a permissão (ferramenta nova `minhas_permissoes` L1, ou o catálogo do MCP, que já sabe quem é o operador); sem permissão, para;
    2. repete a checagem de conflito contra automações e notas;
    3. grava a nota (`kind: oficial` quando vem de pessoa, `fonte: ticket:<nº>` ou `pessoa:<nome>`), roda `vault-check` e o `validador-conhecimento`, publica e dá o commit;
    4. se o conhecimento contradiz uma automação viva, **não publica sozinho**: aponta qual automação precisa ser alterada no site (editar automação pela IA está fora desta etapa).
- Regra comum (como na Etapa 1): responder só com nota publicada ou automação viva; nunca inventar contato; mudança na automação do CRM continua sendo feita no site (Etapa 3+ decide se a IA pode editar automação).

### 9. Tela "Cérebro APP" no site (quadro unificado com Tickets Dev)
Pedido do dono (24/10): um quadro só para conhecimento da operação **e** Tickets Dev, um card por item, com layout melhor que o de hoje. **Pré-layout**: https://claude.ai/artifact/CUnMd9Z3XwEucC8TwtEw5m (3 telas: quadro, card de conhecimento aberto, conferência da amostra).
- **Onde**: substitui a aba Tickets (`app/nova-dash/tickets/`: `TicketsBoard.tsx`, `TicketCard.tsx`, `CreateTicketDialog.tsx`, `constants.ts`) por um quadro "Cérebro APP"; os tickets de hoje continuam lá dentro, sem perder nada.
- **Tipos de card** (`DevTicket.type`): os 4 de hoje (`BUG`, `ALTERACAO`, `MELHORIA`, `OUTRO`) + `CONHECIMENTO` (sugestão/implementação de nota), `LACUNA` (hospital de card ativo sem procedimento — criado pelo relatório de lacunas) e `DESATUALIZADO` (automação mudou depois da nota — criado pelo `vault-check`). Lista validada em `TICKET_TYPES` (`app/_actions/dev-tickets/ticket-actions.ts`) + `TYPE_META` (`constants.ts`).
- **Colunas** (`DevTicket.status`): `EM_DISTRIBUICAO → EM_ANALISE → EM_DESENVOLVIMENTO ("Em implementação") → VALIDACAO_IA → CONCLUIDO`. `VALIDACAO_IA` é status novo, usado só por card de conhecimento (ticket comum pula direto). Lista em `TICKET_STATUS_FLOW`/`NEXT_STATUS` + validação no servidor.
- **Dados novos**: o card de conhecimento precisa guardar caminho da nota, id da automação, conflito encontrado (hoje × proposta), resultado das checagens e o lote. Migration aditiva via `/migration`: `DevTicket.meta Json?` (nullable). Nada muda nos tickets existentes.
- **Quem cria os cards automáticos**: `LACUNA` e `DESATUALIZADO` saem de `scripts/vault-check.mjs --tickets` (dry-run por padrão; `--apply` cria, sem duplicar: um card aberto por hospital/nota). `CONHECIMENTO` sai do `/conhecimento sugerir` — nesta etapa a IA entrega o texto e o operador cria pelo botão "Sugerir conhecimento" da tela; criar pelo app vira ferramenta L3 na Etapa 3.
- **Layout** (o que melhora em relação ao de hoje): faixa de indicadores (notas publicadas / em validação / desatualizadas / lacunas / tickets abertos); filtro por tipo com contagem + "Todos / Meus / Aguardando IA"; card com chip de tipo, id curto, faixa de alerta (conflito, desatualizado, pendente humano), responsável e idade; colunas com uma linha de ajuda; detalhe com o **conflito lado a lado**, checagens, ligações (nota, automação, catálogo, cards ativos) e "Copiar comando para minha IA" (`/conhecimento implementar C-12`).
- **Conferência da amostra** (tela 3 do pré-layout): fonte literal × nota do redator, com os contatos destacados; "Confere — próxima" / "Devolver ao redator". Lê o relatório do lote (S3, `operacao-vault/_lotes/<lote>.json`); a decisão grava no `meta` do card do lote e só então o lote é publicado.
- **Permissões**: ver o quadro = `view_tickets` **ou** `op_use` (hoje `view_tickets` nasce fechado para ADMIN; o operador precisa ver para sugerir); assumir/implementar/conferir card de conhecimento = `manage_knowledge`; ticket comum segue como hoje. Guard no servidor em toda action nova (`requirePermission`).
- Polling/atualização: como o board de tickets atual (SWR); sem `revalidatePath`.

### 10. Testes, validação e documentação
- `tests/vault.test.ts` (slug, normalização com prefixo `[HOSPITAL]`, regex de contato, hash, decisão criar/pular/desatualizar, regras do frontmatter), `tests/op-registry.test.ts` (11ª ferramenta, L1).
- `/validar`; manual: `/hospital angelina caron`, um hospital sem nota (aviso), uma nota com fonte alterada (desatualizado).
- `/mapa-atualizar operacao-ia` (vault, scripts, agentes, skills, ferramenta) + `docs/ai-first/02-resultado-etapa-2.md`.

## Critérios de aceite
1. `docs/operacao/` com 281 notas de hospital (rascunho ou publicadas), 20 de etapa, `servicos/inss.md`, `modelos/email-prontuario.md`, `Mapa da Operação.md` e `_relatorios/lacunas.md`; abre no Obsidian.
2. Toda nota publicada passou por `vault-check` + validador; nenhum contato no corpo que não esteja na Fonte.
3. `/hospital <nome>` responde com procedimento + fonte; nota não publicada nunca é apresentada como procedimento oficial.
4. Automação alterada no CRM depois da nota → `consultar_hospital` e `vault-check` acusam `desatualizado`.
5. `/conhecimento` mostra o conflito com a automação existente antes de gravar; quem não tem `manage_knowledge` não publica.
6. Sync S3 idempotente (2ª rodada sem mudanças = 0 uploads).
7. Nenhuma escrita no CRM pelas ferramentas da IA; tsc/lint/testes limpos; `op_tool_calls` registra `consultar_hospital`.
8. `etapas/*.md` e `servicos/inss.md` gerados do mapa dos logs, com as propostas confirmadas pelo dono publicadas.
9. Quadro "Cérebro APP" no site com os tickets antigos intactos, os tipos novos, a coluna "Validação IA", o detalhe com conflito e a conferência da amostra; um ticket comum continua funcionando de ponta a ponta.

## Fora desta etapa
Editar automações pela IA; colunas `hospital_*` no GHOST (Etapa 5); e-mail/WhatsApp; procuração/pedido hospitalar (Etapa 4); ferramentas L3 (Etapa 3); tela no site.

## Riscos
- **Vault × automação divergirem**: a automação continua sendo o que o CRM executa. Mitigação: `fonte_hash` + `desatualizado` + `consultar_hospital` sempre devolve a automação viva junto.
- **Agente "melhorar" o texto e inventar** (ex.: completar e-mail): validador independente + checagem literal de contatos no script.
- **Validação só por IA**: amostra humana de 10% por lote (confirmar com o dono) e `pendente_humano` para o que é ambíguo.
- **Nome de hospital é texto livre** (337 valores distintos nos cards × 281 nas automações): o relatório de lacunas mostra, a correção do cadastro é humana.
- **Operador com repositório desatualizado**: `consultar_hospital` lê do S3 (sempre a versão publicada mais recente); a nota local é só conveniência.

## Perguntas para o dono
Respondidas em 24/10 (ver "Decisões"): 1 → amostra humana sim; 2 → `manage_knowledge` só ADMIN++, fluxo sugerir (card/ticket) × implementar; 4 → inativas fora.

- (3) Lista de documentos do INSS: o dono não tem a lista → **sai do mapa dos logs** e o dono confirma por perguntas sim/não (passo 5).
- Mecanismo do card de sugestão: **Tickets Dev confirmado**, evoluído para o quadro "Cérebro APP" (passo 9).

Em aberto (não bloqueiam o início):
- Ver o quadro: `view_tickets` **ou** `op_use` está bom, ou só quem já vê Tickets hoje?
- Rodar o mapa das etapas todo mês automaticamente (cron) ou sob demanda?
