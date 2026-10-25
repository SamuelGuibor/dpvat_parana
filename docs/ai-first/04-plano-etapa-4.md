# AI-First — Etapa 4: plano de execução (documentos: procuração, pedido de prontuário, contrato — rascunho com prévia)

> **Comece aqui num chat novo.** Leia, nesta ordem: este arquivo → `docs/ai-first/03-resultado-etapa-3.md` (o que existe) → `docs/ai/operacao-ia.md` (API/MCP/ferramentas, contrato L3 com prévia) → `docs/ai/documentos-ia.md` (S3, `Document`, modelos `.docx`, converter, `gerarProcuracaoById`) → `docs/ai/kanban-cards.md` (libs de escrita no card). Contexto de negócio só se precisar: `docs/ai-first/00-diagnostico-etapa-zero.md` §7, §8 (linhas 4 e 4b) e §10 (decisão 13). Regras do repo valem integralmente (`CLAUDE.md` raiz; skills `/plano` `/migration` `/validar` `/mapa-atualizar`). **Banco = produção.** Escrito em 25/10/2026 por uma sessão autônoma (o dono estava fora): as decisões abaixo marcadas **(provisória)** foram tomadas pelo lado conservador e ficam na lista "Perguntas para o dono" no fim — siga-as, não bloqueie.

## Ponto de partida (25/10/2026)
- Etapa 3 implementada (commit local, **sem push**; o dono publica): libs `app/_shared/lib/cards/*`, contrato L3 `previewOrExecute` + `previa_hash` (`app/_shared/lib/op/preview.ts`), interruptor por ferramenta (`op/switches.ts`, seção "IA de operação"), 6 ferramentas L3 + `meu_dia`.
- Documentos hoje: procuração/KIT/pedido hospitalar são gerados na aba Integrações do card (`POST /api/procuracao` → `gerarProcuracaoById` → docxtemplater `[[ ]]` → converter `DOCX_CONVERTER_URL/convert` → PDF baixado no navegador, **não vira `Document`**). Campo vazio sai em branco sem aviso. `PEDIDO_HOSPITALAR.docx` existe e não tem chamador próprio (diag. §7).
- Contrato: assinatura eletrônica própria **desligada**; contrato segue no ZapSign pelo navegador da pessoa (decisão 13) — isso é a Etapa 4b.

## Objetivo da etapa
A IA **prepara** documentos do card a pedido do operador: confere os campos que o modelo usa, lista o que falta (nunca gera `undefined`/em branco calado), gera o PDF como **rascunho** no S3 com link de prévia, e — só depois do "sim" — anexa o PDF na pasta certa do card como `Document`. Pergunta que precisa funcionar: *"prepara a procuração Curitiba do 2342"* → "faltam RG e estado civil no card; quer gerar mesmo assim ou preencher antes?" → "preenche: RG 12.345.678-9, casado" (Etapa 4 não edita cadastro → diz que precisa preencher no site) → gera → link de prévia → "anexo na pasta PROCURAÇÃO?" → "sim" → `Document` + log `document_add` "(via IA)".

**Fora desta etapa**: enviar documento ao cliente/hospital (Etapa 5), editar campos do cadastro pela IA (decidir com o dono — ver perguntas), assinatura eletrônica (desligada), ZapSign (4b, abaixo).

## Decisões
| origem | decisão | efeito |
|---|---|---|
| diag. §8 linha 4 | ferramentas `preparar_procuracao`, `preparar_pedido_prontuario`, `preparar_contrato`; campos obrigatórios por modelo; S3 + rascunho + URL de prévia; skill `/procuracao` | uma lib de rascunho + ferramentas finas por tipo |
| Etapa 3 | prévia antes de escrever; nada em lote; interruptor por ferramenta | `anexar_rascunho` é L3 com `previewOrExecute` e interruptor |
| 25/10 **(provisória)** | gerar rascunho é **L2** (não mexe no card: só S3 `op-drafts/` + linha `op_drafts`); anexar ao card é **L3** | `OP_MAX_LEVEL` já é 3; L2 não precisa de interruptor, mas exige `op_write`? **não**: L2 exige só `op_use` + permissão de domínio (`generate_documents` se existir; senão `op_use`) — confira em `permissions.ts` antes de criar chave nova |
| 25/10 **(provisória)** | campo obrigatório = toda tag `[[campo]]` do modelo (lida do próprio .docx) que esteja vazia no card | sem tabela de obrigatórios; `permitir_vazios: true` só se o operador disser "gerar mesmo assim", e a prévia lista o que saiu em branco |
| 25/10 **(provisória)** | rascunho em tabela nova `op_drafts` (migration **aditiva**: `id, operatorId, cardId, kind, template, s3Key, missing Json, createdAt, attachedDocumentId?, expiresAt`) | rascunho não anexado expira em 7 dias (purga junto do cron da lixeira, só objetos `op-drafts/`) |
| 25/10 **(provisória)** | PDF sempre pelo converter (como a UI); timeout curto + 1 retry; falha = `conversor_indisponivel`, nada gravado | nunca passar binário pelo body da rota (4,5 MB): só `key` + URL pré-assinada (`trySignGetUrl`, adicionar `op-drafts/` na allowlist de leitura) |
| 25/10 **(provisória)** | `preparar_contrato` = KIT do grupo procuração (ex.: `KIT DRA EVELYN INSS.docx` / `KIT_PREV_CSS.docx`), escolhido por nome exato do modelo visível | é o PDF que a 4b sobe no ZapSign |

## Ordem de execução
### 0. Refinar o plano lendo o código (antes de tudo)
- Ler `gerarProcuracaoById.ts`, `gerarProcuracao.ts`, `doc-templates.ts`, `app/api/procuracao/route.ts`, `s3-presign.ts`, `s3-keys.ts`, `trash-purge.ts`. Ajustar este plano se algo divergir (ex.: os modelos do KIT de assinatura usam outras tags). Registrar o ajuste numa seção "Ajustes do passo 0" no fim deste arquivo.

### 1. Lib de rascunho (`app/_shared/lib/docs/drafts.ts`)
- `templateFields(buffer)` (pura, em `app/_shared/utils/`, testável): tags `[[campo]]` do .docx (cuidado com tag quebrada entre `<w:r>` — use o docxtemplater `getFullText`/inspect, não regex no XML cru).
- `cardDocData(cardId)`: reaproveita a montagem de `dados` de `gerarProcuracaoById` (extrair função pura `buildProcuracaoData(card)` sem mudar o comportamento da UI).
- `createDraft({ cardId, kind, template, author, op, allowEmpty })` → `{ draftId, missing[], previewUrl }`: valida modelo (lista visível), calcula faltantes, gera DOCX → PDF no converter, `PutObject` em `op-drafts/<cardId>/<ts>-<nome>.pdf`, linha `op_drafts`.
- `attachDraft({ draftId, author, op })`: copia/move para `uploads/user_<id>/…` (`CopyObject`), cria `Document` na pasta certa (`inferCategory`/PROCURAÇÃO), log `document_add` com `metadata.source = "op"`, marca `attachedDocumentId`. Idempotente (já anexado = noop).
- Migration aditiva `op_drafts` pelo `/migration` (`migrate diff → db execute → migrate resolve`; apague a linha `DROP TABLE "discord"`).

### 2. Ferramentas (`app/_shared/lib/op/tools/`)
| ferramenta | nível | args | devolve |
|---|---|---|---|
| `listar_modelos` | L1 | `tipo?` | modelos visíveis com as tags que cada um usa |
| `preparar_procuracao` / `preparar_pedido_prontuario` / `preparar_contrato` | L2 | `card`, `modelo` (nome exato), `permitir_vazios?` | sem `permitir_vazios` e com faltantes → `campos_faltando` (lista, nada gerado); senão rascunho + `previewUrl` (~90 min) + campos em branco |
| `anexar_rascunho` | L3 (`op_write`, interruptor) | `rascunho`, `confirmar`, `previa_hash` | prévia: arquivo, pasta de destino, card; execução: `Document` + estado relido |
- `tests/op-registry.test.ts`: lista `ETAPA_4` (L2 só nas `preparar_*`).
- `OpSwitchesPanel` ganha o rótulo de `anexar_rascunho`.

### 3. Skills
- `/procuracao <card> [modelo]`: `listar_modelos` → `preparar_procuracao` → mostra faltantes / link → oferece anexar (Regras de escrita).
- `/pedido-prontuario <card>`: usa `consultar_hospital` para dizer como enviar (o envio é da Etapa 5) + `preparar_pedido_prontuario`.
- Atualizar `/processo` e `/pendencias`: "quer que eu prepare a procuração?" quando os campos estão completos.

### 4. Testes, validação, documentação
- vitest: `templateFields` (tags simples, tag partida entre runs, repetida), `buildProcuracaoData` (mesmo resultado da função antiga para um card fixture), `op-registry` (`ETAPA_4`), regra de faltantes.
- Teste de fumaça **só leitura** contra produção: `listar_modelos`; `preparar_*` grava no S3 `op-drafts/` (aceitável: prefixo próprio, expira) — rodar no máximo 2 vezes, num card real só para leitura dos campos, e anotar as keys no resultado para limpeza.
- `/validar` + `revisor-regras` (body ≤ 4,5 MB, `deletedAt`, `outputFileTracingIncludes` se ler do disco, permissões, autor em FK).
- `/mapa-atualizar operacao-ia documentos-ia` + `docs/ai-first/04-resultado-etapa-4.md` + plano da 4b/5.

## Etapa 4b (mesmo ciclo, logo depois): contrato via ZapSign
- Skill `/contrato <card>`: `preparar_contrato` → (operador anexa ou não) → Claude in Chrome no ZapSign **logado pela pessoa** (o Claude nunca digita senha nem cria conta) → sobe o PDF, preenche signatário com os dados do card → devolve o link → `comentar_card` (L3, prévia) com o link. Colar o link no WhatsApp é da Etapa 5 (aprovação).
- Não há como testar sem o navegador logado do dono: entregar a skill + roteiro de teste manual, marcado "não testado".

## Critérios de aceite
1. Modelo com campo vazio no card → lista de faltantes, nada gerado (sem `permitir_vazios`).
2. Rascunho gerado: PDF no S3 `op-drafts/`, link abre, nenhum `Document` criado, card intocado.
3. `anexar_rascunho` sem `confirmar` não grava; com hash anexa na pasta certa; repetir = noop; log `document_add` "(via IA)".
4. Nenhum binário pelo body de rota; converter fora do ar → erro claro, nada pela metade.
5. UI da aba Integrações gera o mesmo PDF de antes (refatoração de `buildProcuracaoData` sem mudança de saída).
6. tsc/lint/testes limpos; interruptor desligado esconde `anexar_rascunho`.

## Riscos
- Converter serial (Railway): rajada de rascunhos enfileira. Mitigação: uma geração por chamada, timeout, nada em lote.
- Tags do .docx partidas entre runs: usar o parser do docxtemplater.
- Rascunho órfão no S3: expiração de 7 dias + purga só no prefixo `op-drafts/`.

## Perguntas para o dono (decididas provisoriamente — confirmar ao acordar)
1. Gerar rascunho como **L2** sem interruptor (só S3 próprio) está ok, ou quer interruptor também?
2. A IA pode **preencher campo vazio do cadastro** (RG, estado civil…) com o que o operador digitar no chat? (provisório: não nesta etapa; diz para preencher no site)
3. Tabela `op_drafts` + expiração de 7 dias para rascunho não anexado?
4. Qual KIT é o "contrato" padrão (EVELYN × CSS × outro)? (provisório: o operador escolhe pelo nome)
5. Na 4b, o ZapSign é usado no navegador de cada operador (cada um logado) ou numa conta única?

## Ajustes do passo 0 (25/10/2026, lendo o código)
- **Tags dos modelos conferidas com o `InspectModule` do docxtemplater 3.67** (não regex): as 2 procurações, a declaração e os 2 KITs usam `name, nacionalidade, estado_civil, profissao, rg, cpf, rua, numero, bairro, cep, cidade, estado, data`; o `PEDIDO_HOSPITALAR.docx` usa `name, rg, cpf, data_nascimento, nome_mae, hospital, data_acidente`. Tudo está em `dados` de `gerarProcuracaoById`. `nacionalidade` (padrão "brasileiro(a)") e `data` (hoje) nunca faltam. Tag que não existe em `dados` conta como faltante ("campo que o CRM não tem") e, com `permitir_vazios`, sai em branco (`nullGetter`), nunca `undefined`.
- **Sem tabela `op_drafts` (sem migration nesta etapa)** — (provisória), mais conservador que o plano: o rascunho é só o objeto `op-drafts/<cardId>/<ts>-<aleatório>.pdf` no S3 com os metadados no próprio objeto (`x-amz-meta-*`: operador, card, tipo, modelo, nome, campos em branco). O id do rascunho é a key. O rastro fica em `op_tool_calls` (summary com a key) e, ao anexar, no `Document` + log `document_add`. Expiração de 7 dias pelo `LastModified` (anexar recusa rascunho vencido) e purga no cron diário da lixeira, **só** no prefixo `op-drafts/`. Se o dono quiser a tabela (dashboard da Etapa 7), entra depois sem perder nada.
- **Link de prévia sem mexer na allowlist pública**: `ALLOWED_KEY_PREFIXES` vale também para `downloadFileFromS3` (invocável de página pública). Em vez de pôr `op-drafts/` lá, `signOpDraftUrl` em `s3-presign.ts` assina só esse prefixo (mesma janela de 30 min / 90 min do `signGetUrl`).
- **Conversor com orçamento de 45 s** (1 retry só em 5xx/timeout; 400/422 = modelo inválido, não repete): o MCP corta a chamada em 55 s (`CALL_TIMEOUT_MS`) e a rota tem `maxDuration` 60. Falha = `conversor_indisponivel` e nada é gravado.
- **L2 bloqueia `read_only`** (como o `readOnlyBlock` do `/api/procuracao`): `canRun` passa a checar `read_only` a partir do nível 2; `op_write` continua só no 3. Não existe chave de permissão de documento (`generate_documents`): L2 usa `op_use`.
- **Pasta ao anexar**: procuração e KIT → `PROCURACAO` (o `inferCategory` já manda `KIT` para lá); pedido hospitalar → `inferCategory` do nome (cai em OUTROS) — então o padrão do pedido é `OUTROS`, e `anexar_rascunho` aceita `pasta` para trocar.
- **`data` do documento pela IA em Brasília** (`brDateBR`); a UI continua com o `toLocaleDateString` antigo para não mudar a saída (critério 5). A extração `buildProcuracaoData(card, hoje)` recebe a data pronta.
- **Tipo do modelo pelo nome**: `PEDIDO`/`HOSPITALAR`/`PRONTU` → pedido de prontuário; `KIT`/`CONTRATO` → contrato; o resto → procuração. Cada `preparar_*` só aceita modelo do seu tipo (o erro aponta a ferramenta certa).
- **Só quem preparou anexa** (provisória): `anexar_rascunho` de rascunho de outro operador → `sem_permissao`.
- **Resultado**: `docs/ai-first/04-resultado-etapa-4.md` (evidências, decisões, roteiro da 4b). Próxima: `docs/ai-first/05-plano-etapa-5.md`.
- **`preparar_*` fica fora do `allow` do `.claude/settings.json`** (provisória): grava no S3, então o Claude Code pede permissão a cada geração; `listar_modelos` (L1) entra no `allow`.
