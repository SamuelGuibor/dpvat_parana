---
name: plano
description: Gera um plano de implementação certeiro para uma feature/bug deste CRM usando os mapas de docs/ai em vez de reler o código inteiro. Use quando o usuário pedir "plano", "como fazer X", "planeje", ou antes de qualquer mudança que toque 3+ arquivos.
---

# /plano — plano certeiro com o mínimo de leitura

Entrada: `$ARGUMENTS` = descrição da feature/bug.

## Passos

1. **Classifique o domínio** usando o índice de `CLAUDE.md` (seção "Mapas por domínio"). Quase toda tarefa toca 1 domínio principal + 1–2 fronteiras.
2. **Leia só os mapas necessários**: `docs/ai/<domínio>.md` (+ `docs/ai/data-model.md` se mexe em banco). Não abra código ainda.
3. **Localize os pontos exatos**: a partir das seções "Onde fica" e "Receitas", abra SOMENTE os arquivos/funções apontados. Arquivo gigante? Consulte `docs/ai/hotspots.md` e leia só a faixa da seção (Read com offset/limit). Para varrer muitos arquivos, delegue ao subagente `explorador-dominio`.
4. **Cheque as regras invioláveis** do domínio e do `CLAUDE.md` raiz contra o que a mudança vai fazer.
5. **Entregue o plano** neste formato:

```
## Objetivo
1–2 frases (o que muda para o usuário final).
## Arquivos
| arquivo | mudança | por quê |
## Passos
1. … (ordem de execução; migration sempre primeiro e via /migration)
## Riscos e regras tocadas
- regra X do mapa Y → como o plano respeita
## Validação
- tsc/lint/testes específicos (/validar) + teste manual no preview (qual tela, qual ação)
## Fora do escopo
```

6. Se o mapa estiver errado ou faltando algo que você teve que descobrir no código, **anote** para rodar `/mapa-atualizar <domínio>` ao final da implementação.

## Não faça
- Não leia `WhatsAppInbox.tsx`, `KanbanBoard.tsx`, `signature/core.ts` ou `bot.ts` inteiros — use o hotspots.
- Não proponha `prisma migrate dev`.
- Não escreva código no plano além de assinaturas/trechos curtos essenciais.
