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
1. Commit no repositório do CRM das mudanças em skills/MCP/hooks.
2. `node scripts/plugin-operacao.mjs --saida=D:/crm-operacao-plugin` (dry-run) → confira a lista → `--apply`.
3. Em `D:/crm-operacao-plugin`: `git add -A`, `git commit -m "Plugin <versão>"`, `git push`.
4. Os operadores recebem ao abrir o app (a versão muda a cada commit). Ferramenta nova do CRM só aparece depois do deploy da Vercel.

Primeira vez: criar no GitHub o repositório **privado** `crm-operacao-plugin` (só este pacote), clonar em `D:/crm-operacao-plugin` e dar acesso de **leitura** à conta GitHub de cada operador.

## Instalar no PC de um operador
1. ADMIN++ gera o token: Equipe → membro → Token do app (aparece uma vez).
2. No PC da pessoa: baixar a pasta `operador/` deste repositório (ou clonar) e rodar `instalar.ps1`.
3. App do Claude → Code → pasta `C:\CRM-Operacao` → confiar → instalar o plugin `crm` → colar o token → pedir `diagnostico_crm`.

Saída da pessoa: revogar o token (Equipe → Token do app → Revogar) e tirar o acesso ao repositório do plugin.

## Cuidados
- Não instale o plugin no computador que tem o repositório do CRM aberto na mesma pasta: os hooks rodariam duas vezes (os do repo e os do plugin).
- Uma janela do Claude Code por vez para envio L4 (`~/.claude/crm-op/session.json` é um por computador).
- `~/.claude/crm-op/` guarda a sessão e eventos temporários; não guarda o token.
