#!/usr/bin/env bash
# VM Operação (Ubuntu) — preparo da máquina (1×, como root). Plano: docs/ai-first/12-plano-vm-segundo-plano.md
#
#   sudo bash setup-maquina.sh
#
# 1ª vez: instala pacotes, gera a chave de deploy e PARA (cadastrar no GitHub como somente leitura).
# 2ª vez: clona em /opt/crm, só leitura para os operadores, com atualização a cada 10 min.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo)." >&2; exit 1; }

REPO_SSH="${REPO_SSH:-git@github.com:SamuelGuibor/dpvat_parana.git}"
PASTA=/opt/crm
CHAVE=/root/.ssh/crm_deploy

apt-get update -q
apt-get install -y -q git tmux curl ca-certificates

# Node LTS: o MCP crm-op e os hooks são .mjs; o nodejs do apt do Ubuntu fica atrás.
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

install -d -m 700 /root/.ssh
if [ ! -f "$CHAVE" ]; then
  ssh-keygen -t ed25519 -N "" -C "vm-operacao (somente leitura)" -f "$CHAVE" >/dev/null
  echo
  echo "Cadastre esta chave em GitHub > repositório > Settings > Deploy keys,"
  echo "SEM marcar 'Allow write access', e rode este script de novo:"
  echo
  cat "$CHAVE.pub"
  exit 0
fi

export GIT_SSH_COMMAND="ssh -i $CHAVE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" pull --ff-only -q
else
  git clone -q "$REPO_SSH" "$PASTA"
fi

# O .env aponta para o banco de PRODUÇÃO: operador não precisa dele (tudo passa pelo crm-op).
if find "$PASTA" -maxdepth 1 -name '.env*' ! -name '.env.example' | grep -q .; then
  echo "Há arquivo .env em $PASTA. Apague: a VM não pode ter acesso direto ao banco." >&2
  exit 1
fi

# Dono root, leitura para todos: ninguém altera skill/hook pela VM, mudança vem pela main.
chown -R root:root "$PASTA"
chmod -R u+rwX,go+rX,go-w "$PASTA"
# Sem isso o git de cada operador recusa o repo ("dubious ownership") e o Claude Code fica sem git status.
git config --system --get-all safe.directory | grep -qx "$PASTA" || git config --system --add safe.directory "$PASTA"

cat > /etc/cron.d/crm-pull <<EOF
*/10 * * * * root GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git -C $PASTA pull --ff-only -q
EOF
chmod 644 /etc/cron.d/crm-pull

echo
echo "Pronto: $PASTA clonado e atualizando a cada 10 min."
echo "Para cada pessoa: sudo bash $PASTA/scripts/vm/linux/novo-operador.sh <usuario>"
