# VM Contratos (Windows: Chrome + ZapSign) — preparo do responsável pelos contratos, no usuário DELE.
# A conta do Claude não pode ser compartilhada: só o dono da conta usa esta VM.
# Plano: docs/ai-first/12-plano-vm-segundo-plano.md
#
#   powershell -ExecutionPolicy Bypass -File setup-operador.ps1
#
# Faz: instala o Claude Code, clona/atualiza o repo, grava o token do app como variável de USUÁRIO
# (como na Etapa 1: nunca no .env do projeto) e cria o início automático do Remote Control no logon.
# Não faz (é da pessoa): /login na própria conta do Claude, extensão do Chrome, login no ZapSign.

param(
  [string]$RepoUrl = "https://github.com/SamuelGuibor/dpvat_parana.git",
  [string]$Pasta = (Join-Path $HOME "crm")
)

$ErrorActionPreference = "Stop"

foreach ($cmd in @("git", "node")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd não encontrado: o administrador precisa rodar scripts\vm\setup-maquina.ps1 antes."
  }
}

# 1. Claude Code (instalador oficial, por usuário).
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "== instalando o Claude Code"
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
}

# 2. Repositório: só skills, MCP e hooks. O Git Credential Manager pede o acesso ao GitHub na primeira vez.
if (Test-Path (Join-Path $Pasta ".git")) {
  Write-Host "== atualizando $Pasta"
  git -C $Pasta pull --ff-only
} else {
  Write-Host "== clonando em $Pasta"
  git clone $RepoUrl $Pasta
}

# O .env aponta para o banco de PRODUÇÃO: o operador não precisa dele (tudo passa pelo crm-op).
if (Get-ChildItem -Path $Pasta -Filter ".env*" -Force -File | Where-Object { $_.Name -ne ".env.example" }) {
  throw "Há arquivo .env em $Pasta. Apague: a VM do operador não pode ter acesso direto ao banco."
}

# 3. Token do app (Equipe -> membro -> Token do app). Entrada oculta; nunca colar no chat com a IA.
$varToken = "CRM_OP_" + "TOKEN"
$atual = [Environment]::GetEnvironmentVariable($varToken, "User")
$trocar = $true
if ($atual) { $trocar = (Read-Host "Já existe um token do app neste usuário. Trocar? (s/N)") -match "^[sS]" }
if ($trocar) {
  $seguro = Read-Host "Cole o token do app (começa com crmop_)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($token -notmatch "^crmop_") { throw "Token inválido (não começa com crmop_)." }
  [Environment]::SetEnvironmentVariable($varToken, $token, "User")
  $token = $null
  Write-Host "Token gravado na variável de usuário."
}

# 4. Remote Control no logon, em laço: queda de rede de ~10 min ou login vencido encerra o processo
# (doc remote-control); o laço tenta de novo e atualiza o repo antes, para as skills ficarem em dia.
$dir = Join-Path $HOME ".claude\crm-op"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$laco = Join-Path $dir "remote-control.ps1"
@"
`$Host.UI.RawUI.WindowTitle = 'Remote Control - CRM (nao feche)'
Set-Location '$Pasta'
while (`$true) {
  git pull --ff-only 2>`$null
  claude remote-control
  Write-Host 'Remote Control encerrou. Se pediu login, rode claude e /login nesta pasta. Nova tentativa em 60 s.'
  Start-Sleep -Seconds 60
}
"@ | Set-Content -Path $laco -Encoding UTF8

# Interativo: Chrome e Remote Control precisam da sessão gráfica da pessoa (não roda como serviço).
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$laco`""
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "CRM Remote Control ($env:USERNAME)" -Action $acao -Trigger $gatilho -Principal $principal -Settings $config -Force | Out-Null

Write-Host ""
Write-Host "Pronto. Agora, à mão (só você faz):"
Write-Host " 1. Abra um terminal NOVO, rode: cd '$Pasta'; claude"
Write-Host "    -> confie na pasta, aprove o MCP crm-op, /login com a SUA conta do Claude"
Write-Host " 2. Chrome: instale a extensão Claude in Chrome e entre com a mesma conta; no Claude Code, /chrome -> ligar por padrão"
Write-Host " 3. Chrome: entre no ZapSign"
Write-Host " 4. No Claude Code: peça 'diagnostico_crm' -> deve mostrar você como operador"
Write-Host " 5. Saia do Claude Code e faça logoff/logon (ou rode a tarefa 'CRM Remote Control' no Agendador)"
Write-Host " 6. No claude.ai/code ou no app, a sessão desta VM aparece no Remote Control"
Write-Host "Ao sair do RDP: feche pelo X (desconectar). 'Sair' encerra o Chrome e o Remote Control."
