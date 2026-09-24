---
name: migration
description: Cria e aplica uma migration Prisma no Neon de produção pelo fluxo seguro (migrate diff → db execute → migrate resolve), sem nunca usar migrate dev/reset. Use sempre que prisma/schema.prisma mudar ou o usuário pedir "migration", "nova coluna", "nova tabela".
---

# /migration — fluxo seguro para o Neon

**Por quê:** o histórico de migrations do Neon tem drift. `prisma migrate dev` detecta o drift e quer **resetar o banco de produção**. Os hooks do projeto bloqueiam `migrate dev`/`reset`. Detalhes em `docs/ai/data-model.md`.

Entrada: `$ARGUMENTS` = nome curto da migration em snake_case (ex.: `add_card_priority`).

## Passos

1. Edite `prisma/schema.prisma`. Prefira mudanças **aditivas** (coluna nullable ou com default, tabela nova). Rename/drop exige confirmação explícita do usuário.
2. Valide: `npx prisma validate` e `npx prisma format`.
3. Gere só o SQL do delta entre o banco real e o schema:
   ```bash
   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
   ```
   (`--from-schema-datasource` lê a conexão do `.env` via `datasource` do schema — não precisa expor a URL no shell.)
4. **Leia o SQL gerado.** Se aparecer `DROP`, `ALTER ... TYPE`, ou qualquer coisa que você não pediu (drift antigo), PARE e mostre ao usuário — não aplique.
5. Salve em `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` (timestamp atual com 14 dígitos, mesmo padrão da maioria das pastas existentes).
6. **Confirme com o usuário antes de aplicar** (é produção). Então:
   ```bash
   npx prisma db execute --file prisma/migrations/<pasta>/migration.sql --schema prisma/schema.prisma
   npx prisma migrate resolve --applied <pasta>
   npx prisma generate
   ```
7. `npx tsc --noEmit` para pegar os tipos novos do client.
8. Se o model/campo tem semântica não óbvia, atualize `docs/ai/data-model.md` (ou rode `/mapa-atualizar data-model`).

## Nunca
- `prisma migrate dev`, `prisma migrate reset`, `db push --accept-data-loss`/`--force-reset`.
- Editar migration já aplicada.
