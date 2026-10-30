#!/usr/bin/env bash
# VM Operação (Ubuntu) — cria o usuário Linux de UMA pessoa (como root). Plano: docs/ai-first/12-plano-vm-segundo-plano.md
#
#   sudo bash novo-operador.sh <usuario>
#
# Um usuário por pessoa porque a conta do Claude não pode ser compartilhada: cada um tem o próprio
# /login, token do app e ~/.claude (o session.json do hook op-prompt é por usuário).
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo)." >&2; exit 1; }
U="${1:-}"
[[ "$U" =~ ^[a-z][a-z0-9_-]{1,30}$ ]] || { echo "Uso: novo-operador.sh <usuario> (minúsculas, sem espaço)" >&2; exit 1; }

if id "$U" >/dev/null 2>&1; then
  echo "Usuário $U já existe."
else
  # Sem senha: a pessoa não entra por SSH; quem administra usa sudo -iu.
  useradd -m -s /bin/bash "$U"
  passwd -l "$U" >/dev/null
  chmod 700 "/home/$U"
fi

# Linger: o serviço do Remote Control da pessoa roda sem ela estar logada e volta sozinho após reboot.
loginctl enable-linger "$U"

echo "Agora, com a pessoa do lado:"
echo "  sudo -iu $U bash /opt/crm/scripts/vm/linux/setup-operador.sh"
