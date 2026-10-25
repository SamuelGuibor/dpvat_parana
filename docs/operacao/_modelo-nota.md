# Modelo de nota do vault

Frontmatter: uma linha por campo; listas e objetos em JSON numa linha só (o `scripts/vault-check.mjs` recusa o resto).

```yaml
kind: oficial | extraido_do_codigo | extraido_dos_logs | sugestao_ia
status: rascunho | em_validacao | publicado | desatualizado
fonte: automation:<id>          # ou "pessoa:<nome>, <data>", "docs/ai/<mapa>.md", "card:<nº>", "ticket:<nº>", "logs:<data>:<dias>d"
fonte_hash: <sha256>            # obrigatório quando a fonte é automação (o seed calcula)
hospital: <nome exato da condição da automação>   # só em hospitais/
ghost_id: <User.id do GHOST>    # ou null
modo: ["email", "whatsapp", "presencial", "site"]
contatos: {"email": [], "telefone": [], "site": []}   # só o que está LITERAL na Fonte
procuracao: <texto curto> | null
prazo: <texto> | null
redigido_por: agente-redator | <pessoa> | null
validado_por: agente-validador | <pessoa> | null
publicado_por: <pessoa com manage_knowledge> | agente-validador | null
atualizado_em: AAAA-MM-DD
pendente_humano: []             # o que só uma pessoa resolve; vazio para publicar
```

Corpo de nota de hospital: `## Como pedir`, `## Contato`, `## Documentos e procuração`, `## Prazo e retorno`, `## Observações`, `## Fonte` (literal, gerado).
