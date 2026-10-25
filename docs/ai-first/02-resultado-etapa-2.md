# AI-First — Etapa 2: resultado (parcial, 24/10/2026)

> Plano: `docs/ai-first/02-plano-etapa-2.md`. Mapa técnico: `docs/ai/operacao-ia.md`. Este arquivo registra o que já existe e o que falta para os critérios de aceite.

## O que foi feito
| Passo do plano | Estado | Onde |
|---|---|---|
| 1. Estrutura do vault | ✅ | `docs/operacao/` (`Mapa da Operação.md`, `_modelo-nota.md`, `hospitais/`, `etapas/`, `servicos/`, `modelos/`, `_relatorios/`) |
| 2. Seed determinístico | ✅ | `scripts/vault-seed-hospitais.mjs` + lógica pura em `app/_shared/utils/vault.ts` |
| 3. Agentes de publicação | ✅ (piloto) | `.claude/agents/redator-conhecimento.md`, `validador-conhecimento.md`, skill `/publicar-conhecimento`, `scripts/vault-publicar.mjs` |
| 4. Validador determinístico | ✅ | `scripts/vault-check.mjs` (`--drift` lê o banco); entrou no `/validar` |
| 5. Notas de etapa e serviço INSS | ✅ rascunho | `scripts/mapa-etapas.mjs --vault` → 20 `etapas/*.md` + `servicos/inss.md` com perguntas sim/não |
| 6. Sync S3 | ✅ código, **não rodado** | `scripts/sync-vault-s3.mjs` (dry-run ok: 0 no S3) |
| 7. `consultar_hospital` | ✅ código, **não publicado** | `app/_shared/lib/op/tools/consultar-hospital.ts` (+ `minhas_permissoes`) |
| 8. Skills | ✅ | `/hospital`, `/conhecimento` (sugerir × implementar), `/publicar-conhecimento` |
| 9. Quadro "Cérebro APP" | ✅ código + migration `dev_tickets.meta` aplicada; **não testado logado** | aba Tickets → "Cérebro APP" (`app/nova-dash/tickets/`), `app/_shared/utils/cerebro.ts`, `app/_shared/lib/cerebro.ts`, `/api/cerebro/*`; lotes em `docs/operacao/_lotes/*.json` |
| 10. Testes/validação/docs | ✅ parcial | `tests/vault.test.ts` (17), `tests/op-registry.test.ts` (12 ferramentas); suíte: 920 testes ok; tsc 0; docs:check 0 |

## Números do seed (banco de produção, só leitura, 24/10)
- 283 automações na coluna DISTRIBUIÇÃO DE SOLICITAÇÕES → 278 ativas → **276 notas de hospital** (2 nomes repetidos juntados; o plano falava em 281 contando as inativas).
- GHOST: 249; hospitais das automações que casam com um GHOST: 243.
- Cards ativos com hospital: 113; com procedimento: 85 (75%); **27 nomes de hospital de card sem procedimento** → `docs/operacao/_relatorios/lacunas.md`.
- Contatos extraídos por regex: 205 e-mails, 136 links, 117 telefones (conferidos por amostra: sem CEP/protocolo/data).
- Modelo `modelos/email-prontuario.md`: automação "GERAL" da coluna **FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL** (nome real da coluna).

## Lote piloto (3 notas, 24/10)
- Redator redigiu as 3; `vault-check` ok nas 3.
- Validador: **1 aprovada** (`hospitais/anisio-figueiredo-hzn-londrina.md`, publicada), **2 devolvidas** — o redator tinha "explicado" os prefixos `.curitiba` / `.sudeste (.sp)` que a Fonte não explica. Na 2ª volta o redator tirou a interpretação e mandou para `pendente_humano` → ficaram rascunho.
- Relatório: `docs/operacao/_relatorios/publicacao-2026-10-24-20261024-piloto.md`.
- **Pergunta para o dono**: o que significam os prefixos `.curitiba`, `.sudeste (.sp)` etc. que aparecem antes do e-mail nas automações? Com a resposta vira uma regra (`regras/`) e as notas presas saem.

## Decisões tomadas na implementação
- Frontmatter com listas/objetos em JSON numa linha (YAML válido, abre no Obsidian; parser sem dependência).
- `fonte_hash` = sha256 de `id + texto do comentário + nomes dos anexos` de cada automação, em ordem de id (`sourceHash`). Um só lugar para seed, check e ferramenta.
- Fonte mudou numa nota já redigida/publicada: o seed troca só o bloco `## Fonte` e o hash e marca `desatualizado` (as seções redigidas ficam para o redator refazer). O S3 continua com a versão publicada antiga até a nova ser publicada, e `consultar_hospital` acusa `desatualizado` pelo hash.
- Nota `kind: oficial` (escrita por pessoa via `/conhecimento implementar`) o seed não toca.
- Status só muda pelo `vault-publicar.mjs marcar`, que recusa o que não passa no `checkNote`.

## O que falta para os critérios de aceite
1. Publicar os ~273 hospitais restantes (`/publicar-conhecimento`, lotes de 20) e o dono conferir as amostras.
2. Dono responder as perguntas sim/não de `etapas/*.md` e `servicos/inss.md` → publicar; depois `verificar_pendencias` compara com `servicos/inss.md`.
3. Deploy (Vercel) para `consultar_hospital`/`minhas_permissoes` aparecerem no MCP; rodar `sync-vault-s3.mjs --apply`; teste manual `/hospital angelina caron`, hospital sem nota, nota desatualizada.
4. Passo 9: testar logado (ticket comum de ponta a ponta, Sugerir conhecimento, Gerar cards automáticos, Conferir lote depois do sync do `_lotes/`). Os cards LACUNA/DESATUALIZADO saem do botão "Gerar cards automáticos" (no lugar do `vault-check --tickets`: script não escreve no banco).
5. Pendências da Etapa 1: revogar o token colado no chat; publicar o commit das máscaras (`020c7d6` ainda não está no `dpvat/main`).
