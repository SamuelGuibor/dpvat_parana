# prisma/ — schema e migrations do Neon (PRODUÇÃO)

Schema único do CRM (`schema.prisma`) e histórico SQL (`migrations/`). O `.env` local aponta para o Neon de produção: não existe banco de dev.
Mapa completo: `docs/ai/data-model.md` · fluxo passo a passo: skill `/migration`.

## Regras ao editar esta pasta
- NUNCA rode `prisma migrate dev`, `migrate reset` ou `db push --accept-data-loss/--force-reset`: o banco tem drift e o Prisma propõe resetar produção.
- Gere o SQL com `migrate diff` (só lê o banco), LEIA o SQL e APAGUE a linha `DROP TABLE "discord"` (órfã conhecida; derrubar só com ordem explícita do usuário). O hook de Bash não lê o `.sql` passado a `db execute`: a revisão é sua.
- Qualquer outro `DROP`, `ALTER ... TYPE` ou rename no SQL: pare e pergunte.
- Mudanças aditivas: coluna nova nullable ou com `@default`; tabela nova; índice com `CREATE INDEX IF NOT EXISTS` e nome no padrão Prisma `<tabela>_<colunas>_idx`.
- Pasta nova: `migrations/<AAAAMMDDHHMMSS>_<nome_snake>/migration.sql` (14 dígitos). Backfill (`UPDATE ... WHERE col IS NULL`) vai no mesmo arquivo.
- Nunca edite uma migration já aplicada nem `migration_lock.toml`; corrija com uma migration nova.
- Aplicar em produção só com OK do usuário: `db execute` → `migrate resolve --applied <pasta>` → `generate`.
- Model novo: comente no schema a semântica de cada campo String/Json (valores válidos, shape do Json). Não há enums Prisma: a fonte dos valores fica no código (ver mapa).
- Nome de tabela: use `@@map("snake_case")` em model novo. SQL cru dos models antigos sem `@@map` usa `"User"`, `"Process"`, `"Document"` etc. entre aspas.
- Multi-número WhatsApp: dado por linha leva `numberId String?` + índice `[numberId, createdAt]`; unique composto com `numberId` não impede duplicata com `numberId` null.
- Dinheiro em centavos `Int`; data de negócio "AAAA-MM-DD" (String) sempre em horário de Brasília (`app/_shared/utils/date-br.ts`).
- `cardNumber` vem da sequência `card_number_seq` (criada em SQL, invisível no schema): não troque por `@default(autoincrement())`.
- Não reative colunas mortas (`WhatsAppConversation.urgent`, models `Message`/`SubMessage`).

## Validação
```bash
npx prisma validate && npx prisma format
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script   # após aplicar: só a linha da discord
npx prisma migrate status      # "Database schema is up to date"
npx prisma generate            # no Windows, pare o `npm run dev` antes (EPERM)
npx tsc --noEmit
```
Depois de mudar model ou campo com semântica não óbvia: atualize `docs/ai/data-model.md` (skill `/mapa-atualizar data-model`).
