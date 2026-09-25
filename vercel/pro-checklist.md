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
modo o Prisma cerca cada operação de `BEGIN`/`DEALLOCATE ALL`/`COMMIT`: em 25/09
eram **70,5%** das chamadas em `pg_stat_statements` (desde o último reset). O
pooler do Neon aceita prepared statements em modo transação, então o parâmetro
em tese é dispensável — mas só produção prova. Fazer **depois** de 24h úteis
medidas com `cle1` (2.1), para não misturar os dois efeitos.

- [ ] **Preview primeiro:** Environment Variables → criar `DATABASE_URL` com
      escopo **Preview** (só a branch), igual à de produção **sem**
      `pgbouncer=true`. Manter o host `-pooler`, `connection_limit` e
      `pool_timeout`. `DIRECT_URL` não muda. (A IA não edita `.env`.)
- [ ] Smoke no preview (ver 7) com contato e card de TESTE: abrir inbox e
      conversa, tag, encerrar e reabrir, ficha, mover card no Kanban.
      Limite: o preview tem tráfego quase nulo, e o erro
      `prepared statement "s0" already exists` / `does not exist` costuma
      aparecer só com várias conexões Prisma passando pelo mesmo PgBouncer.
      O preview não prova que é seguro; o risco real fica no passo seguinte.
- [ ] **Production em horário de baixo movimento:** trocar o `DATABASE_URL` de
      Production pela versão sem `pgbouncer=true` e fazer **Redeploy** (env
      nova só vale no próximo deploy).
- [ ] **Primeiras 2 h:** Vercel → Logs filtrando por `prepared statement`.
      **Uma** ocorrência já é rollback.
- [ ] **Rollback:** voltar o valor anterior (com `pgbouncer=true`) e Redeploy.
- [ ] Medir 24h úteis: a fração de `BEGIN`+`DEALLOCATE ALL`+`COMMIT` em
      `pg_stat_statements` despenca e `DEALLOCATE ALL` para de crescer; repetir
      (a) e (b) do 2.1 (devem cair mais um pouco).

## O que NÃO mudar

- Limite de 4,5 MB de body é da plataforma (qualquer plano) → upload por S3
  presigned do roteiro **fica como está**.
- `docx-converter` continua no serviço próprio (LibreOffice é binário nativo,
  não roda em função da Vercel).
- Relay SSE do Railway continua necessário (hub de conexões persistentes não
  cabe em serverless); o polling de fallback fica como está.
