# VM Contratos (Windows: Chrome + ZapSign) — preparo da máquina (1×, como ADMINISTRADOR).
# A VM Operação, de todo o escritório, é Linux: scripts/vm/linux/.
# Plano: docs/ai-first/12-plano-vm-segundo-plano.md
#
#   powershell -ExecutionPolicy Bypass -File scripts\vm\setup-maquina.ps1
#
# Não cria usuário nem define senha (é da pessoa) e não toca em nada do CRM.

$ErrorActionPreference = "Stop"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Rode como administrador." }

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "winget não encontrado. No Windows Server, instale o 'App Installer' antes (ou instale Git, Node LTS e Chrome à mão)."
}

# Git (clonar/atualizar o repo), Node LTS (MCP crm-op e hooks rodam em node) e Chrome (Claude in Chrome).
foreach ($id in @("Git.Git", "OpenJS.NodeJS.LTS", "Google.Chrome")) {
  Write-Host "== $id"
  winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent --scope machine
  if ($LASTEXITCODE -ne 0) { Write-Warning "${id}: winget saiu com $LASTEXITCODE (pode já estar instalado)." }
}

# VM dormindo = tarefa agendada pulada e Remote Control caído.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /hibernate off

# Sessão de RDP desconectada continua viva (Chrome e Remote Control seguem rodando);
# 0 = sem limite. Encerrar só com "Sair".
$ts = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services"
if (-not (Test-Path $ts)) { New-Item -Path $ts -Force | Out-Null }
Set-ItemProperty -Path $ts -Name MaxDisconnectionTime -Value 0 -Type DWord
Set-ItemProperty -Path $ts -Name MaxIdleTime -Value 0 -Type DWord

Write-Host ""
Write-Host "Pronto. Próximos passos:"
Write-Host " - firewall do provedor: porta 3389 só para o IP do escritório (ou Tailscale/Bastion)"
Write-Host " - criar o usuário do Windows de cada pessoa"
Write-Host " - logado como a pessoa: scripts\vm\setup-operador.ps1"
