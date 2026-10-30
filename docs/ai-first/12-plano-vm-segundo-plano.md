# VM de segundo plano da Operação por IA — plano (28/10)

> Retoma a decisão 14 de 26/10 ("ZapSign: conta única; avaliar depois uma VM rodando o navegador enquanto o operador espera"). Respostas do dono em 28/10: **todo o escritório** usa pelo app do Claude e a execução roda na VM · provedor a escolher entre AWS e Magalu · **uma VM só para contrato** · **plano Pro por pessoa** · ligada 24 h se o custo não mudar muito. Fatos do Claude Code conferidos na documentação oficial em 28/10 (fontes no fim).

## TL;DR
- **Duas VMs na AWS** (mesma conta que já tem S3/SES/SNS):
  - **VM Operação** — Ubuntu, **todo o escritório**. Um usuário Linux por pessoa, cada um logado na **própria conta Pro** e com o **próprio token do app**. Cada pessoa tem uma sessão de **Remote Control** sempre aberta e conduz pelo app do Claude (claude.ai/code, desktop ou celular). Nada para instalar no computador da pessoa além do app do Claude.
  - **VM Contratos** — Windows, Chrome com a extensão Claude in Chrome e o ZapSign logado. Uma conta Pro só: a do **responsável pelos contratos**.
- **E-mail, WhatsApp, cadastro, documentos, lotes** já são ferramentas `crm-op` e rodam na VM Operação. Só o que precisa de **navegador logado** (ZapSign) vai para a VM Contratos.
- **Custo estimado: ~US$ 160/mês** (~R$ 900) com as duas ligadas 24 h na região us-east-1. Detalhe abaixo.
- Scripts: `scripts/vm/linux/*.sh` (VM Operação) e `scripts/vm/setup-*.ps1` (VM Contratos).

## Por que esse desenho
| regra | origem | consequência |
|---|---|---|
| Conta do Claude não pode ser compartilhada nem "disponibilizada a outra pessoa" | Consumer Terms §2 | um usuário do SO por pessoa, cada um com o próprio `/login`; a VM Contratos é operada só pelo dono da conta |
| Claude in Chrome e Remote Control exigem `/login` interativo; `setup-token` / `CLAUDE_CODE_OAUTH_TOKEN` **desliga os dois** | doc `authentication`, `chrome`, `remote-control` | sem token de 1 ano: login normal por pessoa |
| Remote Control está no **Pro**; a sessão roda na máquina (MCP e arquivos locais) e é conduzida pelo claude.ai/code ou pelo app | doc `remote-control` | serve para todos sem instalar o repositório em cada computador (o atrito nº 1 da Etapa 1) |
| Remote Control não precisa de tela; o Claude in Chrome age numa janela visível do Chrome e o Linux não está confirmado na doc | doc `remote-control`, `chrome` | Operação pode ser Linux (barato, vários usuários sem licença extra); Contratos precisa de Windows com sessão gráfica |
| Windows 10/11 aceita **uma** sessão de RDP por vez; mais pessoas exigem Windows Server + licença RDS por usuário | licenciamento Microsoft | por isso a VM de todos é Linux, não Windows |
| Limite de uso (janela de 5 h + semanal) é da conta e somado entre Claude e Claude Code | central de ajuda Pro/Max | lote grande gasta o Pro de quem pediu; o Pro tem o menor limite — o responsável pelos contratos (navegador = muitas capturas de tela) pode precisar do **Max** |
| `session.json` do hook e o token do app são por usuário do SO (`~/.claude/crm-op/`, variável de ambiente) | `.claude/hooks/op-prompt.mjs` | o registro em `op_*` segue certo por pessoa |

## AWS × Magalu
**AWS.** Já é a conta do projeto (S3, SES, SNS): uma fatura, mesmo IAM, e tem imagem Windows pronta, Session Manager (acesso sem abrir porta) e Savings Plans. A Magalu Cloud cobra em real e guarda tudo no Brasil, mas seria uma conta e um painel novos para manter; não conferi oferta de Windows lá.

## Custo (estimativa — conferir na calculadora da AWS antes de criar)
A AWS cobra **por hora ligada**; VM parada paga só o disco. Valores sob demanda, aproximados:

| VM | tipo | us-east-1 (24 h) | São Paulo (24 h) |
|---|---|---|---|
| Operação (Ubuntu) | t3.large — 2 vCPU / 8 GB, disco 30 GB | ~US$ 63/mês | ~US$ 100/mês |
| Contratos (Windows) | t3.large — 2 vCPU / 8 GB, disco 64 GB | ~US$ 100/mês | ~US$ 140/mês |
| **total** | | **~US$ 165/mês** | **~US$ 240/mês** |

- **Ligar só no horário comercial** (12 h × dias úteis) corta ~60%, mas **não vale aqui**: a Operação atende qualquer pessoa a qualquer hora, e a Contratos, ao religar, volta sem o Chrome e sem o Remote Control até alguém entrar no Windows de novo. **Recomendação: 24 h.**
- Depois de 1 mês de uso estável: **Savings Plan de 1 ano** (sem pagamento antecipado) baixa ~30%.
- Região: us-east-1 é ~40% mais barata; latência não importa (a IA já roda nos EUA) e a VM só guarda PDF temporário. São Paulo se o dono preferir dado em repouso no Brasil.
- t3.large aguenta umas **8 pessoas trabalhando ao mesmo tempo** na Operação; passando disso, trocar para t3.xlarge (16 GB, ~2×) — é parar, trocar o tipo e ligar.

## Como fica o dia a dia
1. A pessoa abre o app do Claude → Code → escolhe a sessão de Remote Control **dela** (da VM Operação).
2. Pede `/prontuario 2342`, `/whatsapp …`, `/varredura` etc. Tudo roda na VM; confirmações e `aprovo <código>` continuam na mesma conversa.
3. Contrato: a pessoa prepara o KIT (`/contrato 2342` na Operação gera o PDF e anexa) e **o responsável pelos contratos** sobe no ZapSign pela sessão dele na VM Contratos. *(A `/contrato` ainda precisa ser adaptada para esse repasse — ver Próximos passos.)*
4. Login/CAPTCHA no ZapSign → a automação **para**; o responsável entra na VM Contratos por RDP e resolve (o Claude nunca digita senha nem resolve CAPTCHA).
5. VM Contratos: fechar o RDP pelo **X** (desconectar), nunca "Sair" — sair encerra o Chrome e o Remote Control.

## Instalação
### 0. AWS — quem administra
- Criar as duas instâncias (tabela acima). Security group: **porta 22 (Operação) e 3389 (Contratos) liberadas só para o IP do escritório** — nunca 0.0.0.0/0. Alternativa sem porta aberta: Session Manager.
- Disco com criptografia ligada (padrão da conta).

### 1. VM Operação (Ubuntu 24.04)
1. `sudo bash setup-maquina.sh` (de `scripts/vm/linux/`): instala git, tmux, Node LTS; gera uma **chave de deploy somente leitura** e para, mostrando a chave pública → cadastrar em GitHub → repositório → Settings → Deploy keys **sem** "Allow write access" → rodar de novo. Na segunda vez clona em `/opt/crm` (só leitura para os operadores; atualiza sozinho a cada 10 min).
2. Para cada pessoa: `sudo bash /opt/crm/scripts/vm/linux/novo-operador.sh <usuario>` (cria o usuário Linux sem senha — ninguém entra por SSH além do administrador).
3. Com a pessoa do lado: `sudo -iu <usuario> bash /opt/crm/scripts/vm/linux/setup-operador.sh` → instala o Claude Code, pede o **token do app** da pessoa (entrada oculta; ADMIN++ gera em Equipe → membro → Token do app) e abre o Claude Code para o login: confiar na pasta, aprovar o MCP `crm-op`, `/login` — **a pessoa abre o link no computador dela, entra na conta Pro dela** e cola o código; pedir `diagnostico_crm`; `/exit`. O script então sobe o Remote Control e em até 1 min a sessão aparece no app do Claude dela.
4. Login vencido depois: rodar o mesmo script de novo (responder N para o token).

### 2. VM Contratos (Windows)
1. Como administrador: `scripts\vm\setup-maquina.ps1` (Git, Node LTS, Chrome; sem suspensão; sessão de RDP desconectada continua viva).
2. Logado como o responsável pelos contratos: `setup-operador.ps1` (Claude Code, repositório sem `.env`, token do app, Remote Control no logon).
3. À mão: `/login` na conta dele, extensão Claude in Chrome com a mesma conta, `/chrome` → ligar por padrão, entrar no ZapSign, `diagnostico_crm`.

## Riscos e regras
- **As VMs acessam o CRM fora do escritório** (o token não passa pela trava de IP — decisão 3 de 24/10). Revogar o token e apagar o usuário Linux (`sudo userdel -r <usuario>`) quando a pessoa sair.
- **Nunca copiar o `.env` para as VMs**: ele aponta para o banco de produção. Os scripts recusam clone com `.env`. Os hooks (`guard-env`, `guard-bash`) seguem ativos porque vêm com o repositório.
- **Repositório só leitura na Operação** (`/opt/crm`, dono root): ninguém altera skill ou hook pela VM; mudança vem pela `main`.
- **Chave de deploy só leitura**: se vazar, dá leitura do código (sem `.env`, sem segredo), não escrita.
- **Login expira**: Remote Control com login vencido para de responder — rodar o `setup-operador.sh` de novo. Queda de rede de ~10 min encerra o processo; o laço reinicia em 1 min.
- **Automação na assinatura**: a doc do Claude Code descreve Remote Control, `claude -p` e tarefas agendadas usando a assinatura, mas os termos de consumidor só liberam acesso automatizado "onde explicitamente permitido". Uso **conduzido pela pessoa** (Remote Control) é o caso seguro; robô que age sozinho, sem ninguém, deve ir para API key/termos comerciais.
- **Claude in Chrome no Pro**: confirmar no primeiro acesso da VM Contratos; se não estiver disponível no Pro, a conta do responsável precisa de Max.
- Site com CAPTCHA (ex.: Meu INSS) não roda sozinho.

## Próximos passos
1. Dono: criar as instâncias na AWS e definir **quem é o responsável pelos contratos** (dono da conta da VM Contratos).
2. Adaptar a `/contrato`: na VM Operação, prepara e anexa o KIT e avisa o responsável (`notificar_pessoa`); na VM Contratos, o responsável retoma (`/retomar`) e faz o ZapSign.
3. Primeiro teste com 1 pessoa na Operação + o responsável na Contratos; depois o resto do escritório.

## Fontes (lidas em 28/10)
- code.claude.com/docs/en/authentication.md · remote-control.md · chrome.md · headless.md · desktop-scheduled-tasks.md · routines.md · claude-code-on-the-web.md
- anthropic.com/legal/consumer-terms (§2 conta, §3 acesso automatizado)
- support.claude.com — "Using Claude Code with your Pro or Max plan" e "Use Claude Code with your Team or Enterprise plan"
