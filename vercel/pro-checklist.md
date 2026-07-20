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

## 2. Fluid Compute + memória

**Project → Settings → Functions**

- [ ] Ativar **Fluid Compute** (se ainda não estiver). Tempo ocioso (debounce de
      8s do bot, espera de resposta da IA) passa a custar muito menos, porque a
      cobrança separa CPU ativa de tempo de parede.
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

## O que NÃO mudar

- Limite de 4,5 MB de body é da plataforma (qualquer plano) → upload por S3
  presigned do roteiro **fica como está**.
- `docx-converter` continua no serviço próprio (LibreOffice é binário nativo,
  não roda em função da Vercel).
- Relay SSE do Railway continua necessário (hub de conexões persistentes não
  cabe em serverless); o polling de fallback fica como está.
