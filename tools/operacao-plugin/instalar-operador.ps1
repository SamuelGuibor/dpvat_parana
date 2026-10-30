# Instala a IA de operação do CRM no PC do operador (plugin "crm"), SEM o
# repositório do CRM. Rodar no PowerShell do usuário (não como administrador),
# a partir da pasta "operador" do repositório do plugin:
#
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
#
# Por que instala pela linha de comando: o app só DECLARA o plugin pela pasta
# (.claude\settings.json); quem baixa é o "claude plugin install". O clone do
# repositório privado usa as credenciais do Git já salvas e nunca pergunta —
# sem elas, o app falha em silêncio e o plugin não aparece (30/10, 1º PC).
# O token vai pelo stdin do "claude plugin configure" para o cofre do Windows:
# nunca aparece na tela, na linha de comando nem em arquivo.

# Continue (não Stop): no PowerShell 5.1, programa externo que escreve no stderr
# viraria erro fatal. Cada passo confere o $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$Pasta = "C:\CRM-Operacao"
$Repo = "__REPO__"
$Plugin = "crm@seguros-parana"
$Origem = Split-Path -Parent $MyInvocation.MyCommand.Path

function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Reabrir($oque) {
  Write-Host "   $oque instalado. Feche e abra o PowerShell e rode este script de novo." -ForegroundColor Yellow
  exit 1
}

Write-Host "1/6 Node.js (o servidor crm-op e os hooks rodam em Node)"
if (-not (Tem "node")) {
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Reabrir "Node.js"
}
Write-Host "   ok: $(node --version)"

Write-Host "2/6 Git (o plugin vem de um repositório privado do GitHub)"
if (-not (Tem "git")) {
  winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
  Reabrir "Git"
}
Write-Host "   ok: $(git --version)"

Write-Host "3/6 Claude Code na linha de comando (instala o plugin para o app)"
if (-not (Tem "claude")) {
  # Instalador oficial da Anthropic.
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  Reabrir "Claude Code"
}
# "claude plugin configure" (token pelo stdin) existe a partir da v2.1.285.
claude update 2>&1 | Out-Null
Write-Host "   ok: $(claude --version)"

Write-Host "4/6 Acesso ao repositório $Repo"
Write-Host "   se abrir o navegador, entre com a conta do GitHub que recebeu acesso."
git ls-remote "https://github.com/$Repo.git" HEAD | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "   sem acesso: peça ao administrador para liberar sua conta do GitHub no repositório $Repo." -ForegroundColor Yellow
  exit 1
}
Write-Host "   ok (credencial salva no Windows: o app usa a mesma)"

Write-Host "5/6 Plugin $Plugin"
# Força HTTPS: é a credencial que o passo 4 acabou de salvar.
$env:CLAUDE_CODE_PLUGIN_PREFER_HTTPS = "1"
$lista = (claude plugin marketplace list 2>&1 | Out-String)
if ($lista -notmatch "seguros-parana") {
  claude plugin marketplace add $Repo
  if ($LASTEXITCODE -ne 0) { Write-Host "   falhou ao adicionar o catálogo." -ForegroundColor Red; exit 1 }
}
claude plugin install $Plugin --scope user
if ($LASTEXITCODE -ne 0) { Write-Host "   falhou ao instalar o plugin." -ForegroundColor Red; exit 1 }

$cfg = (claude plugin configure $Plugin --json 2>$null | Out-String)
$temToken = $cfg -match '"configured"\s*:\s*\[[^\]]*"crm_op_token"'
$trocar = $true
if ($temToken) {
  $r = Read-Host "   Já há um token salvo. Trocar? (s/N)"
  $trocar = $r -match '^[sS]'
}
if ($trocar) {
  Write-Host "   Cole o TOKEN DO APP (Equipe -> seu nome -> Token do app). Ele não aparece enquanto você cola."
  $sec = Read-Host "   Token" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try {
    $t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
    if ($t -notmatch '^crmop_') { Write-Host "   isso não parece um token do app (começa com crmop_)." -ForegroundColor Red; exit 1 }
    (@{ crm_op_token = $t } | ConvertTo-Json -Compress) | claude plugin configure $Plugin --values-stdin 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      # Claude Code antigo (sem "configure"): mesmo cofre, pelo --config do install.
      # O token passa na linha de comando só durante essa chamada.
      claude plugin install $Plugin --scope user --config "crm_op_token=$t" 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { Write-Host "   falhou ao salvar o token." -ForegroundColor Red; exit 1 }
    }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $t = $null
  }
}
Write-Host "   ok"

Write-Host "6/6 Pasta $Pasta"
New-Item -ItemType Directory -Force "$Pasta\.claude" | Out-Null
Copy-Item -Force "$Origem\CLAUDE.md" "$Pasta\CLAUDE.md"
Copy-Item -Force "$Origem\.claude\settings.json" "$Pasta\.claude\settings.json"
Write-Host "   ok"

Write-Host ""
Write-Host "Pronto. Agora no app do Claude:" -ForegroundColor Green
Write-Host "  1. FECHE o app do Claude por completo e abra de novo (ele só carrega plugins ao iniciar)."
Write-Host "  2. Aba Code -> pasta $Pasta -> confiar na pasta -> sessão NOVA."
Write-Host "  3. Digite / : devem aparecer as skills /crm:meu-dia, /crm:processo..."
Write-Host "  4. Peça: diagnostico_crm  -> deve mostrar seu nome e as ferramentas liberadas."
Write-Host "  Conferir pelo PowerShell: claude plugin list   (crm@seguros-parana, enabled)"
