# Instala a pasta de trabalho do operador do CRM (plugin "crm"), SEM o
# repositório do CRM. Rodar no PowerShell do usuário (não como administrador),
# a partir da pasta "operador" do repositório do plugin:
#
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
#
# O que faz: confere Node (o MCP e os hooks rodam em Node) e Git (o app baixa
# o plugin do GitHub privado), cria C:\CRM-Operacao com o CLAUDE.md e o
# .claude\settings.json do operador e testa o acesso ao repositório do plugin.
# Não pede nem grava o token: ele é pedido pelo próprio app ao ativar o plugin.

$ErrorActionPreference = "Stop"
$Pasta = "C:\CRM-Operacao"
$Repo = "__REPO__"
$Origem = Split-Path -Parent $MyInvocation.MyCommand.Path

function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "1/4 Node.js"
if (-not (Tem "node")) {
  Write-Host "   instalando Node.js LTS (winget)..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Write-Host "   feche e abra o PowerShell e rode este script de novo." -ForegroundColor Yellow
  exit 1
}
Write-Host "   ok: $(node --version)"

Write-Host "2/4 Git"
if (-not (Tem "git")) {
  Write-Host "   instalando Git (winget)..."
  winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
  Write-Host "   feche e abra o PowerShell e rode este script de novo." -ForegroundColor Yellow
  exit 1
}
Write-Host "   ok: $(git --version)"

Write-Host "3/4 Pasta $Pasta"
New-Item -ItemType Directory -Force "$Pasta\.claude" | Out-Null
Copy-Item -Force "$Origem\CLAUDE.md" "$Pasta\CLAUDE.md"
Copy-Item -Force "$Origem\.claude\settings.json" "$Pasta\.claude\settings.json"
Write-Host "   ok"

Write-Host "4/4 Acesso ao plugin no GitHub ($Repo)"
Write-Host "   se abrir o navegador, entre com a conta do GitHub que recebeu acesso ao repositório."
git ls-remote "https://github.com/$Repo.git" HEAD | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "   sem acesso: peça ao administrador para liberar sua conta do GitHub no repositório $Repo." -ForegroundColor Yellow
  exit 1
}
Write-Host "   ok"

Write-Host ""
Write-Host "Pronto. Agora no app do Claude:" -ForegroundColor Green
Write-Host "  1. Aba Code -> escolher a pasta $Pasta -> confiar na pasta."
Write-Host "  2. Aceitar instalar o plugin crm (seguros-parana) e colar o TOKEN DO APP quando pedir."
Write-Host "     (se não aparecer: digite /plugin marketplace add $Repo e depois /plugin install crm@seguros-parana)"
Write-Host "  3. Pedir: diagnostico_crm  -> deve mostrar seu nome e as ferramentas liberadas."
