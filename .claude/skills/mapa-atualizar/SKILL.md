---
name: mapa-atualizar
description: Atualiza os mapas de IA (docs/ai/*.md, CLAUDE.md de pasta, hotspots) depois de uma feature/refactor, para que a próxima sessão não precise redescobrir o código. Use ao terminar uma implementação que criou/moveu arquivos, mudou fluxo, model Prisma ou regra; ou quando o usuário pedir "atualiza o mapa".
---

# /mapa-atualizar — manter o mapa vivo

Entrada: `$ARGUMENTS` = domínio(s) (`whatsapp-bot`, `kanban-cards`, `assinatura`, `documentos-ia`, `auth-permissoes`, `workspace-equipe`, `analytics-custos`, `site-publico-cliente`, `data-model`, `infra-integracoes`, `hotspots`) ou vazio = deduzir do diff.

## Passos

1. Descubra o que mudou: `git diff --stat main...HEAD` e `git diff --name-status main...HEAD` (ou `HEAD` se ainda não commitou).
2. Mapeie arquivo → domínio pela tabela "Onde fica" de cada `docs/ai/*.md` (grep o caminho).
3. Para cada mapa afetado, edite **só as seções tocadas**:
   - arquivo novo/movido/removido → "Onde fica"
   - fluxo alterado → "Fluxo principal"
   - model/campo → "Dados" (e `docs/ai/data-model.md`)
   - armadilha descoberta ou regra nova → "Regras invioláveis e armadilhas" (com o porquê)
   - tarefa que você teve que descobrir sozinho → nova "Receita"
4. Se um arquivo de `docs/ai/hotspots.md` mudou de tamanho em >15%, regenere o sumário por seção dele.
5. Atualize a linha `> Verificado em AAAA-MM-DD` dos mapas editados.
6. Verifique com `npm run docs:check` (todo caminho e símbolo citado precisa existir; nomes propostos só dentro de seção `## Backlog`). Mapas: 120–260 linhas; CLAUDE.md de pasta: ≤40.
7. Regra que vale para o projeto inteiro e foi descoberta agora → adicione também em "Regras invioláveis" do `CLAUDE.md` raiz (mantenha ≤150 linhas: se passar, mova detalhe para o mapa).

## Não faça
- Não reescreva o mapa inteiro por causa de uma mudança pequena.
- Não coloque histórico ("em 23/09 fizemos…") — mapa descreve o estado atual. Histórico vai no git.
- Nada de segredos, IPs, e-mails ou telefones de pessoas.
