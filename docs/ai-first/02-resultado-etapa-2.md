# AI-First — Etapa 2: resultado (24/10/2026, em produção; fechamento pendente com o dono)

> Plano: `docs/ai-first/02-plano-etapa-2.md`. Mapa técnico: `docs/ai/operacao-ia.md` (vault, scripts, ferramentas) e `docs/ai/workspace-equipe.md` (quadro Cérebro APP). Próxima etapa: `docs/ai-first/03-plano-etapa-3.md`.

## Estado por passo do plano
| Passo | Estado | Onde |
|---|---|---|
| 1. Estrutura do vault | ✅ no git | `docs/operacao/` (`Mapa da Operação.md`, `_modelo-nota.md`, `hospitais/` 276, `etapas/` 20, `servicos/inss.md`, `modelos/email-prontuario.md`, `_relatorios/`, `_lotes/`) |
| 2. Seed determinístico | ✅ | `scripts/vault-seed-hospitais.mjs` + `app/_shared/utils/vault.ts` (+ `contacts.ts`, sem Node, usado no navegador) |
| 3. Agentes de publicação | ✅ rodando | `.claude/agents/{redator,validador}-conhecimento.md`, skill `/publicar-conhecimento`, `scripts/vault-publicar.mjs` (`proximos` · `marcar` · `relatorio` → `_relatorios/*.md` + `_lotes/*.json`) |
| 4. Validador determinístico | ✅ | `scripts/vault-check.mjs` (`--arquivos`, `--drift`, `--json`); no `/validar` |
| 5. Etapas + serviço INSS | ✅ rascunho | `scripts/mapa-etapas.mjs --vault` → perguntas sim/não esperando o dono |
| 6. Sync S3 | ✅ rodado | `scripts/sync-vault-s3.mjs --apply`: 163 notas + 2 lotes em `operacao-vault/`; 2ª rodada = 0 envios (idempotente) |
| 7. `consultar_hospital` + `minhas_permissoes` | ✅ em produção | `app/_shared/lib/op/tools/consultar-hospital.ts`, `app/_shared/lib/op/hospitais.ts` (grupos hospital × automação, índice do S3, cards por hospital) |
| 8. Skills | ✅ | `/hospital`, `/conhecimento` (sugerir × implementar), `/publicar-conhecimento` |
| 9. Quadro "Cérebro APP" | ⏳ backend em produção, **front só local** | backend: `DevTicket.meta` (migration `20261024200000_dev_ticket_meta` aplicada), `app/_shared/utils/cerebro.ts`, `app/_shared/lib/cerebro.ts`, `/api/cerebro/{resumo,lotes/[id]}`, actions `sugerirConhecimento`/`gerarCardsAutomaticos`/`registrarConferencia`. Front (`app/nova-dash/tickets/*`, `page.tsx`, `GlobalSearch.tsx`, `docs/ai/workspace-equipe.md`) **não commitado**: o dono ainda vai mexer (alternância Desenvolvimento × Cérebro, filtros estilo Jira, modal único `TicketDetail`) |
| 10. Testes/validação/docs | ✅ | `tests/vault.test.ts` (17), `tests/cerebro.test.ts` (4), `tests/op-registry.test.ts` (12 ferramentas); suíte 925 ok; tsc 0; lint 0; docs:check 0; revisor-regras sem violação |

## Evidências em produção (24/10/2026)
- **Deploy**: commits `b9ee892` (código) e `8031d5d` (vault) na `main`; o catálogo de produção (`diagnostico_crm`) lista 12 ferramentas, com `consultar_hospital` e `minhas_permissoes`. Commit local `de530d2` (`scripts/op-testar-ferramenta.mjs`) ainda não enviado.
- **Uso real** (`node -r dotenv/config scripts/op-relatorio.mjs --dias=1`): 108 prompts (`/hospital` 5, `/publicar-conhecimento` 2, `/processo` 2…), 15 chamadas de ferramenta, **15 ok**; `consultar_hospital` 2 chamadas, 2 ok, média 445 ms.
- **Testes manuais** (`scripts/op-testar-ferramenta.mjs`, a mesma ferramenta do deploy contra banco + S3 de produção):

| caso | resultado |
|---|---|
| Angelina Caron (sem nota publicada) | texto vivo da automação + `aviso: procedimento ainda não validado`, GHOST, 1 card ativo |
| Anisio Figueiredo (nota publicada) | nota do vault, `desatualizado: false`, sem aviso |
| Nota desatualizada (cópia no S3 trocada por segundos com outro `fonte_hash`, restaurada e conferida) | `desatualizado: true` + `aviso: a automação mudou depois da nota…` |
| Hospital Municipal de Araucária (sem automação) | `nao_encontrado` apontando o relatório de lacunas |
| "cruz vermelha" | `ambiguo` → Curitiba / Castro |

- **Drift real**: `vault-check --drift` = 0 notas desatualizadas (24/10).
- **Vault**: 276 hospitais → **163 publicados**, 113 rascunho (pendência humana ou fila); 3 lotes (`20261024-piloto`, `-1953`, `-2013`; só os dois últimos têm JSON para a conferência). GHOST 249 (243 casam); cards ativos com hospital 113, 85 com procedimento (75%), 27 nomes sem procedimento.
- **Pipeline redator → validador funciona como trava**: no piloto o validador devolveu 2 de 3 notas porque o redator "explicou" os prefixos `.curitiba`/`.sudeste (.sp)` que a Fonte não explica; na 2ª volta virou `pendente_humano`.
- **Incidente de teste**: o botão "Gerar cards automáticos" criou 25 cards LACUNA de uma vez; foram apagados com `scripts/cerebro-limpar-automaticos.mjs` (dry-run → `--apply`). Lição para a Etapa 3: ação em lote precisa de **prévia + confirmação**, nunca disparo direto.

## Decisões tomadas na implementação
- Frontmatter numa linha por campo, listas/objetos em JSON (YAML válido, abre no Obsidian; parser sem dependência).
- `fonte_hash` = sha256 de `id + texto do comentário + nomes dos anexos` por automação, em ordem de id (`sourceHash`) — um só cálculo para seed, check, ferramenta e quadro.
- Fonte mudou numa nota redigida/publicada: o seed troca só `## Fonte` + hash e marca `desatualizado`; o S3 mantém a versão publicada até republicar; `consultar_hospital` acusa pelo hash. Nota `kind: oficial` o seed não toca.
- Status de nota só muda pelo `vault-publicar.mjs marcar` (recusa o que não passa no `checkNote`).
- Cards LACUNA/DESATUALIZADO saem do botão do quadro (o script não escreve no banco), com `meta.chave` para não duplicar.
- Actions de ticket passaram a ler permissões do banco (`requireTeam` + `view_tickets` ou `op_use`; conhecimento exige `manage_knowledge`).

## Falta para fechar a Etapa 2 (com o dono, fora da Etapa 3)
1. Publicar os 113 restantes (`/publicar-conhecimento`, lotes de 20) + conferir amostras + `sync-vault-s3.mjs --apply` a cada lote.
2. Responder: significado dos prefixos `.curitiba`/`.sudeste (.sp)` (vira `regras/`) e as perguntas sim/não de `etapas/*.md` e `servicos/inss.md` → publicar; depois `verificar_pendencias` compara com `servicos/inss.md`.
3. Terminar o front do Cérebro APP e publicar (o backend já está no ar).
4. Pendências da Etapa 1: revogar o token colado no chat; `'\D'` → `'\\D'` em `findLinkedCard` (`app/_shared/lib/whatsapp/bot.ts`).
