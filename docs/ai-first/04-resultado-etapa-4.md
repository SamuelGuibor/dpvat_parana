# AI-First — Etapa 4 (+ 4b): resultado (25/10/2026, implementada e validada localmente; deploy e teste manual pendentes)

> Plano: `docs/ai-first/04-plano-etapa-4.md` (a seção "Ajustes do passo 0" no fim registra o que mudou ao ler o código). Mapa técnico: `docs/ai/operacao-ia.md` (ferramentas de documento, L2, rascunho) e `docs/ai/documentos-ia.md` (prefixo `op-drafts/`, `buildProcuracaoData`). Próxima etapa: `docs/ai-first/05-plano-etapa-5.md`. Feita por uma sessão autônoma com o dono fora: decisões **(provisória)** abaixo e na lista "Perguntas para o dono".

## Estado por passo do plano
| Passo | Estado | Onde |
|---|---|---|
| 0. Refinar o plano lendo o código | ✅ | "Ajustes do passo 0" no fim do `04-plano-etapa-4.md` |
| 1. Lib de rascunho | ✅ | `app/_shared/lib/docs/drafts.ts` (`listDraftTemplates`, `checkDraft`, `createDraft`, `getDraft`, `attachDraft`, `purgeExpiredOpDrafts`), `app/_shared/lib/docs/converter.ts` (`convertDocxToPdf`, 45 s), `app/_shared/utils/doc-fields.ts` (puro: `templateFields`, `buildProcuracaoData`, `missingFields`, `classifyTemplate`, keys) |
| 1. `buildProcuracaoData` sem mudar a UI | ✅ | `gerarProcuracaoById.ts` usa o mapa extraído com a mesma data de antes (teste compara com a cópia literal do bloco antigo) |
| 1. Migration `op_drafts` | ➖ não feita **(provisória)** | rascunho = objeto `op-drafts/<cardId>/<ts>-<hex>.pdf` + metadados no S3; nada mudou no banco nesta etapa |
| 2. Ferramentas | ✅ | `app/_shared/lib/op/tools/documentos.ts`: `listar_modelos` (L1), `preparar_procuracao` · `preparar_pedido_prontuario` · `preparar_contrato` (L2), `anexar_rascunho` (L3, desligada por padrão); rótulo no `OpSwitchesPanel`; `canRun` recusa `read_only` desde o L2 |
| 2. Purga | ✅ | cron `/api/documents/trash/purge` chama `purgeExpiredOpDrafts` (só `op-drafts/`, > 7 dias) depois da lixeira |
| 3. Skills | ✅ | `/procuracao`, `/pedido-prontuario` (novas); `/processo` e `/pendencias` oferecem preparar quando os campos estão completos; "Regras de escrita" das 5 skills e `/hospital` falam dos documentos |
| Revisão | ✅ | `revisor-regras`: 0 bloqueio, 3 correções (2 corrigidas, 1 sem mudança — ver Decisões), 5 sugestões (2 aplicadas) |
| 4. Testes/validação | ✅ local | ver Evidências |
| 4. Docs | ✅ | `/mapa-atualizar operacao-ia documentos-ia`; este arquivo; `05-plano-etapa-5.md` |
| 4b. `/contrato` (ZapSign) | ✅ entregue · ⚠ **não testado** | `.claude/skills/contrato/SKILL.md` + roteiro abaixo |

## Evidências (25/10/2026)
- `npx tsc --noEmit` 0 erros · eslint nos 16 arquivos alterados/novos 0 · `npm test` **72 arquivos, 983 testes ok** (novos: `doc-fields` 13, `op-drafts` 13, `op-converter` 4; `op-policy` +1, `op-registry` reescrito para as listas `ETAPA_4_*`) · `npm run docs:check` 0 referência quebrada.
- Fumaça contra produção pelo `scripts/op-testar-ferramenta.mjs` (banco só leitura; **1 geração** no S3 `op-drafts/`):

| caso | resultado |
|---|---|
| `listar_modelos {}` | 7 modelos: 2 procurações + declaração (procuracao), `KIT DRA EVELYN INSS` · `KIT_PREV_CSS` · `KIT_TAYNARA-PREVIDENCIARIO` (contrato), `PEDIDO_HOSPITALAR` (pedido); tags lidas dos .docx do S3. 14 s em série → **3,9 s** depois do `Promise.all` |
| `preparar_procuracao` modelo "Curitiba" | `ambiguo` com a única candidata (nome exato é obrigatório; a skill pega o nome da lista) |
| `preparar_procuracao` card 4967, `-PROCURAÇÃO-ESPECÍFICA_CURITIBA` | campos completos → PDF gerado em 20 s, `camposEmBranco: []`, pasta sugerida PROCURAÇÃO |
| link de prévia (`signOpDraftUrl`) | HTTP 206 `application/pdf`, começa com `%PDF-1.6`; key fora de `op-drafts/` recusada |
| `anexar_rascunho` (só prévia, script força `confirmar: false`) | prévia com arquivo, pasta PROCURAÇÃO, autor "(via IA)", aviso "card arquivado (descartados_analise_interna)", `previa_hash`; nada copiado, nenhum `Document` |

- **Key gravada no teste (limpeza)**: `op-drafts/cmsp9hqlk0001l904y4fyvnku/1792900329052-11fe030d.pdf` (procuração de um cliente real do card 4967). Vence em 01/11/2026 e sai na primeira rodada do cron depois do deploy; para apagar antes, pelo console do S3.
- Caminho "campo faltando" **não** rodou contra produção: os 4 cards olhados (4967, 5100, 5050, 4800) estavam completos. Coberto por teste (`op-drafts.test.ts`: lista, nada gerado, conversor não chamado).

## Decisões tomadas na implementação
- **Sem tabela `op_drafts`** (provisória, mais conservador que o plano): nenhuma migration em produção com o dono fora. O objeto do S3 carrega operador, card, tipo, modelo, nome e campos em branco; a key é o id do rascunho e valida por regex estrita (`parseOpDraftKey`). Se a Etapa 7 (dashboard) precisar de linha no banco, a tabela entra aditiva depois.
- **`op-drafts/` fora de `ALLOWED_KEY_PREFIXES`**: aquela allowlist vale para `downloadFileFromS3`, chamável de página pública. Assinador próprio `signOpDraftUrl` (só esse prefixo).
- **L2 sem interruptor e fora do `allow`** (provisória): gerar não toca o card, mas grava PDF com dado pessoal no S3 — o Claude Code pede permissão a cada `preparar_*`. `read_only` não gera (como o `readOnlyBlock` do site).
- **Faltante = tag do próprio .docx vazia no card** (não lista fixa): lido pelo `InspectModule` do docxtemplater, relido a cada geração (sem cache). Tag que o CRM não tem = faltante "o CRM não tem este campo"; com `permitir_vazios` sai em branco (`nullGetter`), nunca `undefined`.
- **Data do documento da IA em Brasília** (`brDateBR`); a aba Integrações continua com a data antiga sem fuso (critério 5: mesma saída). Depois das 21h as duas divergem — tarefa à parte para o site (ver pendências).
- **Só quem preparou anexa** (provisória): rascunho de outro operador → `sem_permissao`.
- **Anexar é idempotente por key**: destino `uploads/user_<id>/<ts do rascunho>-<nome>.pdf`; `Document` criado sob `pg_advisory_xact_lock` com releitura; já anexado (mesmo na lixeira) = `noop` com aviso.
- **Pasta**: procuração e KIT → PROCURAÇÃO; pedido → `inferCategory` do nome (OUTROS); o operador troca com `pasta`.
- **Achado do revisor sem mudança**: "log `document_add` fora da transação pode se perder e o retry vira noop". `createLog` nunca lança (try/catch interno), então o "sim" não falha; a perda só ocorre se o insert do log falhar — mesma assimetria do upload do site. Mantido.
- **Conversor**: 30 s na 1ª tentativa, retry só em 5xx/timeout depois de 1,5 s, total 45 s (MCP corta em 55 s). Erro de modelo (.docx ilegível/tag quebrada) → `modelo_invalido` 422, não 500.

## Etapa 4b — `/contrato` (ZapSign pelo Claude in Chrome) — **NÃO TESTADA**
Entregue: `.claude/skills/contrato/SKILL.md`. Não há ferramenta nova no CRM: a skill encadeia `preparar_contrato` → (opcional) `anexar_rascunho` → navegador do operador → `comentar_card` com o link. Não testada porque exige o Chrome do dono com a extensão Claude in Chrome conectada e logado no ZapSign; a sessão autônoma não loga em nada (regra).

**Roteiro de teste manual (dono, ~15 min)** — no card de teste "TESTE IA — não mexer" (criar antes; ver Etapa 3), com dados fictícios e **o próprio telefone/e-mail do dono como signatário**:
1. Publicar (push → Vercel), reiniciar o Claude Code, conferir `listar_modelos` no catálogo (`diagnostico_crm`).
2. Ligar `anexar_rascunho` e `comentar_card` no Espaço de Trabalho → IA de operação.
3. No Chrome: extensão Claude in Chrome conectada; entrar no ZapSign numa aba.
4. No Claude Code: `/contrato <nº do card de teste> CSS`. Conferir: pergunta qual KIT se ambíguo; mostra faltantes (preencher RG/estado civil no card de teste antes); link de prévia abre o PDF certo.
5. Aceitar o download (o Claude Code pede permissão para o `curl`) e o "Pode?" do passo 4 da skill.
6. Conferir no ZapSign: documento `Contrato <nº> - <nome>`, PDF anexado, signatário com nome/CPF/telefone do card, **notificação automática desligada**; o Claude para e pede "Confirma?" antes do botão final.
7. "sim" → link de assinatura copiado (o do signatário, não o do remetente) → prévia do comentário → "sim" → comentário no card com o link.
8. Anotar: nomes reais dos botões do ZapSign, se dá para criar sem notificar o signatário, se o link copiado é o certo. Ajustar a seção 6 da skill com os nomes reais.
9. Apagar o documento de teste no ZapSign e o PDF da pasta temporária.

## Para o dono validar (ordem sugerida)
1. Publicar (push da `main` → Vercel; vai junto com o commit da Etapa 3). Na aba Integrações de um card: "Gerar Procuração" sai igual a antes (critério 5).
2. Reiniciar o Claude Code; `diagnostico_crm` lista `listar_modelos` e as 3 `preparar_*` (a `anexar_rascunho` só aparece ligada).
3. No card de teste: `/procuracao <nº> Curitiba` com um campo vazio → lista de faltantes, nada gerado; "gerar mesmo assim" → link com o campo em branco (sem "undefined"); ligar `anexar_rascunho` → prévia → "sim" → PDF na pasta PROCURAÇÃO, histórico com "adicionou o documento … (via IA)"; repetir → `noop`.
4. `/pedido-prontuario <nº>` → pedido + como enviar ao hospital com a fonte.
5. Roteiro da 4b acima.
6. Responder as perguntas abaixo (decisões provisórias).

## Perguntas para o dono (decididas provisoriamente)
1. Gerar rascunho (L2) sem interruptor e com pedido de permissão do Claude Code a cada geração está ok?
2. A IA pode preencher campo vazio do cadastro com o que o operador digitar? (provisório: **não**; diz para preencher no site)
3. Rascunho só no S3 (sem tabela `op_drafts`), 7 dias, está ok? Quer a tabela para o dashboard da Etapa 7?
4. Qual KIT é o "contrato" padrão (EVELYN × CSS × TAYNARA)? (provisório: o operador escolhe pelo nome; a skill pergunta)
5. ZapSign: cada operador logado no próprio navegador ou conta única? (provisório: o navegador de quem pede, sem guardar sessão)
6. Só quem preparou o rascunho pode anexá-lo? (provisório: sim)
7. Corrigir a data do "Gerar Procuração" do site para Brasília (`brDateBR`)? Hoje, depois das 21h, sai com a data de amanhã.

## Pendências e riscos conhecidos
- **Card de teste e tag `TESTE IA` ainda não existem** (nada foi gravado no banco nas Etapas 3–4).
- `/contrato` não testada (roteiro acima); os nomes dos botões do ZapSign na skill são suposições a confirmar.
- Conversor serial: rascunho e aba Integrações dividem a fila; a skill gera um por pedido.
- O rascunho de teste do card 4967 fica no S3 até o cron depois do deploy (key acima).
- `docs/ai/workspace-equipe.md` (mudanças locais do dono) continua sem a seção "IA de operação".
