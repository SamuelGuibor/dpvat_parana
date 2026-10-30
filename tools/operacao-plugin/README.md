# Plugin do operador — CRM Seguros Paraná

Pacote que a equipe instala no app do Claude (aba Code) para usar a IA de operação **sem o repositório do CRM**. Este arquivo vai junto para o repositório privado do plugin.

## O que tem (e o que não tem)
| vai | não vai |
|---|---|
| skills de operação (`/crm:prontuario`, `/crm:whatsapp`, `/crm:varredura`…) | código do CRM (`app/`, `prisma/`), `.env`, documentação de desenvolvimento |
| MCP `crm-op` (`server/crm-mcp.mjs`, sem dependências) | skills de desenvolvimento (`plano`, `validar`, `migration`, `mapa-atualizar`, `publicar-conhecimento`) |
| hooks de registro e da prova do "aprovo" (`op-prompt`, `op-response`, `op-tool`) | guards de desenvolvimento (a pasta do operador nega Bash/Edit/Write) |
| pasta `operador/` com `CLAUDE.md`, `.claude/settings.json` e `instalar.ps1` | — |

O que cada pessoa pode fazer **não** está aqui: vem do CRM pelo token (permissões do banco, nível da ferramenta, interruptores, "aprovo <código>").

## Publicar uma versão (dono, no computador com o repositório do CRM)
1. Commit no repositório do CRM das mudanças em skills/MCP/hooks (e push da main, se a skill usa ferramenta nova).
2. `npm run plugin:publicar` — gera em `D:\crm-operacao-plugin`, commita e dá push. Para só conferir antes: `node scripts/plugin-operacao.mjs` (dry-run).
3. Os operadores recebem sozinhos: com `autoUpdate` ligado (vem no `settings.json` da pasta), o app busca a versão nova até ~10 min depois da 1ª mensagem e carrega na **próxima vez que abrir**. Para forçar na hora: `claude plugin update crm@seguros-parana` no PowerShell e reabrir o app. Ferramenta nova do CRM só aparece depois do deploy da Vercel.

Primeira vez: criar no GitHub o repositório **privado** `crm-operacao-plugin` (só este pacote), clonar em `D:/crm-operacao-plugin` e dar acesso de **leitura** à conta GitHub de cada operador.

## Instalar no PC de um operador
1. ADMIN++ gera o token: Equipe → membro → Token do app (aparece uma vez). A conta GitHub da pessoa recebe leitura neste repositório.
2. No PC da pessoa: baixar a pasta `operador/` deste repositório (ou clonar) e rodar `instalar.ps1`. Ele confere Node, Git e o Claude Code de linha de comando, testa o acesso ao GitHub (salva a credencial), **instala o plugin** e pede o token (vai para o cofre do Windows), e cria `C:\CRM-Operacao`.
3. Fechar o app do Claude por completo e abrir → Code → pasta `C:\CRM-Operacao` → confiar → sessão nova → `/` mostra `/crm:…` → pedir `diagnostico_crm`.

Só declarar o plugin no `settings.json` da pasta **não instala**: o app não baixa sozinho e, sem credencial do GitHub salva, o clone do repositório privado falha sem aviso (foi o que aconteceu no 1º PC, 30/10).

## Plugin não aparece no app
| sintoma | causa | o que fazer |
|---|---|---|
| nem `/crm:…` nem `diagnostico_crm` | plugin não instalado neste Windows | `claude plugin list` no PowerShell; sem `crm@seguros-parana` → rodar o `instalar.ps1` |
| `claude plugin list` mostra o plugin, o app não | app aberto antes da instalação | fechar o app por completo (bandeja também) e abrir; sessão nova |
| instalar falha com erro de clone | sem acesso/credencial ao repositório | `git ls-remote https://github.com/SamuelGuibor/crm-operacao-plugin.git` deve funcionar; liberar a conta no GitHub |
| `/crm:…` aparece, `diagnostico_crm` não | servidor crm-op não sobe | `node --version` (instalar Node LTS); token: `claude plugin configure crm@seguros-parana` mostra `set` |
| `diagnostico_crm` diz token inválido/revogado | token errado | gerar outro em Equipe → Token do app e rodar o `instalar.ps1` de novo (responde "s" para trocar) |

Saída da pessoa: revogar o token (Equipe → Token do app → Revogar) e tirar o acesso ao repositório do plugin.

## Cuidados
- Não instale o plugin no computador que tem o repositório do CRM aberto na mesma pasta: os hooks rodariam duas vezes (os do repo e os do plugin).
- Uma janela do Claude Code por vez para envio L4 (`~/.claude/crm-op/session.json` é um por computador).
- `~/.claude/crm-op/` guarda a sessão e eventos temporários; não guarda o token.
