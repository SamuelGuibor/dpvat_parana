# Vercel Pro — checklist de configuração do painel

O código já foi ajustado para o plano Pro (crons no `vercel.json` + `maxDuration`
acima de 60s nas rotas longas). Este arquivo lista o que precisa ser feito **no
painel da Vercel** (vercel.com), uma única vez, na ordem sugerida.

## 1. Conferir o Cron (após o primeiro deploy)

O `vercel.json` agora agenda `/api/whatsapp/cron` a cada 15 minutos.

- [ ] Deploy feito → **Project → Settings → Cron Jobs** deve listar o job.
- [ ] Confirmar que a env `CRON_SECRET` existe em **Production** (a Vercel manda
      `Authorization: Bearer ${CRON_SECRET}` automaticamente quando ela existe).
- [ ] Ver uma execução bem-sucedida no log do cron (aba Cron Jobs mostra as rodadas).
- [ ] **Desligar o disparo externo antigo** (serviço/agendador que chamava
      `/api/whatsapp/cron?secret=` em produção), senão o job roda em dobro.
      O `whatsapp-cron.cmd` local é só para dev e pode ficar.

## 2. Functions: região, Fluid Compute e memória

**Project → Settings → Functions**

### 2.1 Região das funções = `cle1` (fixada no `vercel.json`)

O `vercel.json` declara `"regions": ["cle1"]` (Cleveland, AWS **us-east-2**), a
mesma região do host do Neon (`*.us-east-2.aws.neon.tech`). JSON não aceita
comentário, então o porquê fica aqui: cada operação Prisma pagava p50 ~72 ms de
ida e volta (piso ~60 ms), sinal de que a função não roda junto do banco. Na
mesma região o RTT cai para ~1-2 ms, e o ganho se repete em toda query em série
(~10 por carga da lista do inbox, ~5 por envio, ~17 ao encerrar conversa).
O `regions` do `vercel.json` tem precedência sobre o que estiver no painel.

- [ ] **Antes do deploy:** anotar a Function Region atual do painel e se o Fluid
      Compute está ligado (ver 2.2).
- [ ] Conferir no painel se o preço de CPU/GB-hora em `cle1` é o mesmo de `iad1`.
- [ ] **Linha de base** (antes do deploy, e sempre antes do PR22, que passa os
      logs para depois da resposta e invalida a métrica "b"). Só leitura:
  - (a) intervalo entre `create`s seguidos de `Notification` do bot no mesmo
    laço (mesmo autor e contato, destinatário diferente, gap < 2 s), 7 dias.
    Em 25/09: p10/p50/p90 = **59/72/145 ms** (n=12.160).
  - (b) `whatsapp_messages.createdAt` → `logs.createdAt` do `wa_text` (envio de
    texto pela equipe), 14 dias. Em 25/09: p50 **419** / p90 476 / p99 1.149 ms
    (n=5.092). Template: p50 ~178 ms.
- [ ] **Depois do deploy:** o header `x-vercel-id` de qualquer resposta tem o
      formato `<borda>::cle1::<id>` (DevTools → Network).
- [ ] Medir 24h úteis e repetir (a) e (b). Esperado: (a) p50 < 15 ms; (b) p50
      ≤ ~300 ms. Em Observability, o p50 das POST `/nova-dash` (server actions) e
      do GET `/api/whatsapp/messages` deve cair.
- [ ] **Rollback:** tirar `"regions"` do `vercel.json` e fazer deploy.

Notas:
- Região única, sem failover (igual a hoje; multi-região com failover é
  Enterprise). Crons continuam em UTC e nenhum `maxDuration` muda.
- O middleware (Edge) continua rodando na borda perto do usuário; ele só lê o
  JWT, não toca o banco.
- Serviços fora de us-east-2 pagam alguns ms a mais por chamada, desprezível
  perto do ganho no banco:
  - bucket S3 em **us-east-1** (`AWS_REGION`): ~10-15 ms a mais só nas chamadas
    que o **servidor** faz ao S3 (mídia da Meta → S3, zip, snapshot, apagar).
    Presign é calculado local e o upload/download do navegador vai direto ao S3.
  - Railway (cérebro `/reply` e `/assist`, relay SSE, docx-converter): região a
    confirmar no painel do Railway. Mesmo em outra região, a chamada ao cérebro
    leva segundos e a diferença some.

### 2.2 Fluid Compute (decisão: pelo painel, não pelo `vercel.json`)

- [ ] Ativar **Fluid Compute** (se ainda não estiver). Tempo ocioso (debounce de
      8s do bot, espera de resposta da IA) passa a custar muito menos, porque a
      cobrança separa CPU ativa de tempo de parede.
- Vale o toggle do painel. O `vercel.json` **não** declara `"fluid"` de
  propósito: ligar muda o `maxDuration` padrão das funções que não declaram um
  (server actions e páginas; no Pro sobe para 300 s) e o modo de cobrança, e essa
  decisão é do dono do projeto. Se um dia quiser versionar, `"fluid": true` no
  `vercel.json` vale por deployment e passa por cima do painel.
- Os PRs que deixam trabalho para depois da resposta (`waitUntil`, PR22/PR44)
  dependem de saber o estado do Fluid: sem ele, esse trabalho fica preso ao
  `maxDuration` da função e cobra tempo de parede.

### 2.3 Memória

- [ ] Se zip/PDF pesado continuar lento, subir a memória para **Performance**
      (~3 GB). Começar no Standard e só subir se precisar — memória maior custa
      mais por GB-hora.

## 3. Skew Protection

**Project → Settings → Advanced → rolar até "Skew Protection"**
(não fica em Deployment Protection!)

- [ ] Pré-requisito: ativar **"Enable access to System Environment Variables"**
      (Settings → Environment Variables) — sem isso o Skew Protection não opera.
- [ ] Ativar o toggle **Skew Protection** em Settings → Advanced.
- [ ] Maximum Age: o padrão (1 dia) já cobre o dashboard aberto o dia todo.
- [ ] **Redeployar** o deployment de produção depois de ativar (só vale a
      partir do próximo deploy).

Por quê: o dashboard fica aberto o dia todo com polling de 5s + server actions.
Sem isso, cada deploy quebra as abas abertas (chunk 404 / "server action not
found") até o usuário recarregar. Next 14.2 já suporta sem config extra.

## 4. Spend Management

**Team → Settings → Billing → Spend Management**

- [ ] Definir um teto mensal e alerta por e-mail (ex.: alerta em 50%/75%).

Por quê: no Pro, excedente vira cobrança (não bloqueio). O polling de 5s do
kanban multiplicado pela equipe gera muitas invocações — melhor descobrir por
alerta do que na fatura.

## 5. Firewall / WAF

**Project → Firewall**

- [ ] Regra de **rate limit** em `/api/auth` (proteção de brute force na borda,
      antes de gastar invocação — complementa o rate limit em código).
- [ ] **NÃO** aplicar rate limit em `/api/whatsapp/webhook`: a Meta manda
      rajadas legítimas e reenvia eventos que falham; a assinatura HMAC já
      protege a rota.
- [ ] Opcional: bloqueio por país/IP se aparecer tráfego estranho nos logs.

## 6. Logs e observabilidade

- [ ] **Team → Settings → Log Drains**: conectar um destino (Axiom e Better
      Stack têm plano gratuito) para reter logs permanentemente — essencial
      para auditar decisões do bot dias depois ("o bot respondeu errado ontem").
- [ ] Avaliar **Observability Plus** (add-on, 30 dias de retenção nativa) só se
      o Log Drain não bastar.

## 7. Preview de branch: pré-requisitos para testar

Sem isto, o preview de uma branch não abre para teste manual (vale para
validar região, pgbouncer e os PRs de inbox antes do merge).

- [ ] **Deployment Protection:** liberar o preview (ou usar o link de bypass)
      para a equipe conseguir abrir.
- [ ] **`NEXTAUTH_URL` só no escopo Production.** No Preview, deixe sem: o
      NextAuth v4 usa o `VERCEL_URL` do próprio deploy. Se estiver em "All
      Environments" apontando para o domínio de produção, o login do preview
      redireciona para produção.
- [ ] `NEXT_AUTH_SECRET`/`NEXTAUTH_SECRET` e `WHATSAPP_CRED_KEY` com o **mesmo
      valor** de Production também no Preview. Sem isso, os tokens de WhatsApp
      salvos no banco ficam indecifráveis no preview.
- [ ] Logar por **e-mail e senha** (credenciais). O Google OAuth não aceita o
      domínio `*.vercel.app` do preview.
- [ ] Testar **do escritório**: a trava de IP da dashboard vale no preview.
- Atenção: o preview grava no banco de **PRODUÇÃO**. Teste só com contato e
  card de TESTE e apague ao final. Cron não roda em preview (a Vercel só agenda
  no deploy de produção).

## 8. Banco: `DATABASE_URL` sem `pgbouncer=true` (PR13, depois do 2.1 medido)

Hoje o `DATABASE_URL` usa o host `-pooler` do Neon com `pgbouncer=true`. Nesse
modo o Prisma não usa prepared statements nomeados e cerca cada operação de
`BEGIN`/`DEALLOCATE ALL`/`COMMIT`: são 3 comandos a mais por query. O pooler do
Neon aceita prepared statements em modo transação, então o parâmetro em tese é
dispensável, mas só produção prova. A troca é **só de env, feita por você no
painel** (a IA não edita `.env` nem o painel). Não há código a mudar: o app usa
um `PrismaClient` só (`db`) e nada depende de estado de sessão no banco
(advisory lock, `LISTEN`, `SET` de sessão).

**Muda só isto:** tirar `pgbouncer=true` da query string. Host `-pooler`,
`connection_limit`, `pool_timeout` e o resto ficam iguais. `DIRECT_URL`
(migrations) não muda. O `.env` local e os `scripts/` continuam como estão.

### 8.1 Antes de começar

- [ ] `cle1` (2.1) em produção há pelo menos 24h úteis, com (a) e (b) medidos.
      Esta branch leva vários PRs juntos (índices, lista mais leve etc.), então a
      latência mistura efeitos. O número que isola o PR13 é o da "cerimônia"
      (8.2), que só existe por causa do `pgbouncer=true`.
- [ ] Escolher um dia **sem outro deploy de código**. Assim o deploy anterior
      é o mesmo código com a env antiga, e o rollback (8.5) volta só a env.
- [ ] Guardar o valor atual do `DATABASE_URL` de Production num lugar seguro
      (gerenciador de senhas). Nunca no repo, em ticket ou no chat.
- [ ] Conferir em Environment Variables se o `DATABASE_URL` atual está marcado
      para Production **e** Preview juntos. Se estiver, editar o de Production
      também muda o Preview (sem problema, mas saiba antes).

### 8.2 Como medir (SQL só leitura, antes e depois)

Rodar no **Neon Console → SQL Editor** (é só `SELECT`). Tire uma foto no começo
e outra no fim da mesma janela de dia útil (ex.: 9h e 17h de Brasília) e compare
a **diferença** entre as duas. `pg_stat_statements` acumula desde o último
reset, e zerar exige privilégio.

```sql
SELECT now() AS agora,
       (SELECT stats_reset FROM pg_stat_statements_info) AS stats_reset,
       sum(calls) FILTER (WHERE query IN ('BEGIN', 'COMMIT', 'DEALLOCATE ALL')) AS cerimonia,
       sum(calls) FILTER (WHERE query = 'DEALLOCATE ALL') AS deallocate_all,
       sum(calls) AS comandos_app,
       round(100.0 * sum(calls) FILTER (WHERE query IN ('BEGIN', 'COMMIT', 'DEALLOCATE ALL'))
             / nullif(sum(calls), 0), 1) AS pct_cerimonia,
       (SELECT sum(calls) FROM pg_stat_statements
         WHERE query LIKE 'SELECT rolname, CASE WHEN rolvaliduntil%') AS auth_query
FROM pg_stat_statements
WHERE pg_get_userbyid(userid) <> 'cloud_admin'
```

- `cloud_admin` é o monitoramento interno do Neon; fica fora da conta do app.
- `auth_query` é a consulta que o PgBouncer do Neon faz a cada conexão nova
  com o banco.
- Por minuto = (valor na foto 2 − valor na foto 1) ÷ minutos entre as fotos.
  A fração da janela = Δ`cerimonia` ÷ Δ`comandos_app`.
- Se o `stats_reset` mudou entre as duas fotos, o contador zerou no meio (um
  reinício do compute do Neon, por exemplo) e a janela não vale. Refaça.

Linha de base de 25/09 (07:59–17:22 de Brasília, desde o reset): cerimônia =
**70,4%** dos comandos do app (583 mil de 829 mil), ~1.040/min em média
(1.302/min no pico medido pela auditoria), `DEALLOCATE ALL` ~345/min e
`auth_query` ~23/min.

Esperado depois da troca:
- `DEALLOCATE ALL` **para de crescer** (Δ perto de 0). É a prova de que a env
  nova está valendo.
- `pct_cerimonia` cai de ~70% para perto de 0. Sobram `BEGIN`/`COMMIT` só das
  transações de verdade (`$transaction`).
- `comandos_app` por minuto cai para cerca de um terço.
- `auth_query` por minuto tende a cair. É sinal secundário, não critério.
- Latência: repetir (a) e (b) do 2.1 (devem cair mais um pouco) e ver o p50
  das POST `/nova-dash` e do GET `/api/whatsapp/messages` em Observability.
  É só indício, porque outros PRs da branch também mexem nisso.

### 8.3 Preview primeiro

- [ ] Pré-requisitos do preview: seção 7 (Deployment Protection,
      `NEXTAUTH_URL` só em Production, mesmo segredo, login por e-mail e
      senha, teste do escritório).
- [ ] Environment Variables → **Add** → `DATABASE_URL`, ambiente **Preview**,
      só a branch do teste. Valor = o de Production **sem** `pgbouncer=true`.
      A variável por branch vale só para ela e tem prioridade sobre a de
      Preview geral.
- [ ] Fazer um deploy novo da branch (push ou **Redeploy**). Env nova só vale
      no próximo deploy.
- [ ] Smoke com contato e card de **TESTE** (o preview grava no banco de
      **PRODUÇÃO**): abrir inbox e conversa, aplicar e tirar tag, assumir,
      enviar texto, encerrar e reabrir, abrir a ficha, mover card no Kanban.
      Apagar o que for de teste no fim.
- [ ] Logs do deployment de preview filtrando por `prepared statement`: zero.
- Limite: o preview tem tráfego quase nulo. O erro
  `prepared statement "s0" already exists` / `does not exist` costuma
  aparecer só com várias conexões Prisma passando pelo mesmo PgBouncer. O
  preview não prova que é seguro; o risco real fica no 8.4.

### 8.4 Production

- [ ] Tirar a foto 1 do 8.2 (ou usar a última janela "antes").
- [ ] **Horário de baixo movimento** em dia útil (ex.: 18h–19h de Brasília).
      Environment Variables → `DATABASE_URL` de **Production** → trocar pelo
      valor sem `pgbouncer=true` → Save.
- [ ] Deployments → deploy de produção atual → **Redeploy** (mesmo código).
      Anotar a hora e qual era o deploy anterior (ele é o rollback).
- [ ] **Primeiras 2 h:** Vercel → Logs (runtime) filtrando por
      `prepared statement`. Vale também procurar os códigos `42P05` ("already
      exists"), `26000` ("does not exist") e a mensagem `bind message
      supplies`. **Uma** ocorrência já é rollback (8.5).
- [ ] **Segunda vigia: as 2 primeiras horas úteis da manhã seguinte** (ex.:
      8h–10h). O erro depende de concorrência, e o pico da equipe é o teste
      de verdade. Uma ocorrência também é rollback.
- Na tela, a equipe só vê erro genérico: em produção o erro de server action
  chega mascarado. A confirmação está nos logs, não no relato de quem usa.
- [ ] Depois de 24h úteis sem erro: foto 2 do 8.2 e comparar com o esperado.

### 8.5 Rollback

Gatilho: uma ocorrência de `prepared statement` (ou dos códigos acima) nos
logs, ou salto de erros 5xx em Observability logo depois da troca.

- [ ] **Mais rápido (segundos, sem build):** Deployments → o deploy de
      produção **anterior** ao Redeploy (mesmo código, com `pgbouncer=true`) →
      **Instant Rollback**. Deploy da Vercel é imutável: ele guarda a env do
      momento em que foi criado, então volta com o parâmetro.
- [ ] Em seguida, voltar o valor antigo (com `pgbouncer=true`) no
      `DATABASE_URL` de **Production**. Sem isso, o próximo deploy da `main`
      sai de novo sem o parâmetro.
- [ ] Depois de um Instant Rollback, a Vercel deixa de promover sozinha os
      próximos deploys da `main` até alguém promover um deploy de novo (o
      painel avisa). Com a env já corrigida, faça **Redeploy** do deploy atual
      e confirme que ele ficou como produção.
- Alternativa sem Instant Rollback: voltar a env e fazer **Redeploy** (leva
  o tempo de um build).
- [ ] Conferir que voltou: logs sem `prepared statement` e `DEALLOCATE ALL`
      voltando a crescer na query do 8.2.
- [ ] Ação que deu erro no meio pode ter gravado só uma parte (ex.: conversa
      encerrada sem a tag de encerramento). Rever as conversas e os cards
      mexidos na janela do erro.
- Nada a desfazer no banco: prepared statement vive na conexão do pooler e
  some com ela.
- [ ] Registrar hora, mensagem de erro e volume da janela antes de tentar de
      novo.

## O que NÃO mudar

- Limite de 4,5 MB de body é da plataforma (qualquer plano) → upload por S3
  presigned do roteiro **fica como está**.
- `docx-converter` continua no serviço próprio (LibreOffice é binário nativo,
  não roda em função da Vercel).
- Relay SSE do Railway continua necessário (hub de conexões persistentes não
  cabe em serverless); o polling de fallback fica como está.
