#!/usr/bin/env bash
# VM Operação (Ubuntu) — preparo de UMA pessoa (no usuário dela). Plano: docs/ai-first/12-plano-vm-segundo-plano.md
#
#   sudo -iu <usuario> bash /opt/crm/scripts/vm/linux/setup-operador.sh
#
# Faz: instala o Claude Code, grava o token do app (só leitura do próprio usuário, nunca no .env
# do projeto) e liga o Remote Control como serviço do usuário.
# Não faz (é da pessoa): /login na própria conta Pro do Claude.
set -euo pipefail

PASTA=/opt/crm
CONF="$HOME/.config/crm-op"

[ "$(id -u)" -ne 0 ] || { echo "Rode como a pessoa: sudo -iu <usuario> bash $0" >&2; exit 1; }
[ -d "$PASTA/.git" ] || { echo "$PASTA não existe: rode setup-maquina.sh antes." >&2; exit 1; }

# 1. Claude Code (instalador oficial, por usuário, em ~/.local/bin).
export PATH="$HOME/.local/bin:$PATH"
if ! command -v claude >/dev/null; then
  echo "== instalando o Claude Code"
  curl -fsSL https://claude.ai/install.sh | bash
fi

# 2. Token do app (Equipe -> membro -> Token do app). Entrada oculta; nunca colar no chat com a IA.
install -d -m 700 "$CONF"
VAR="CRM_OP_""TOKEN"
TROCAR=s
if [ -f "$CONF/env" ]; then
  read -r -p "Já existe um token do app neste usuário. Trocar? (s/N) " TROCAR
fi
if [[ "$TROCAR" =~ ^[sS] ]]; then
  read -r -s -p "Cole o token do app (começa com crmop_): " TOKEN; echo
  [[ "$TOKEN" == crmop_* ]] || { echo "Token inválido (não começa com crmop_)." >&2; exit 1; }
  ( umask 077; printf 'export %s=%q\n' "$VAR" "$TOKEN" > "$CONF/env" )
  unset TOKEN
  echo "Token gravado em $CONF/env (só este usuário lê)."
fi

# Sessão interativa (o primeiro `claude` para o /login) também precisa do token para o MCP.
grep -q 'crm-op/env' "$HOME/.bashrc" 2>/dev/null || \
  printf '\n[ -f "$HOME/.config/crm-op/env" ] && . "$HOME/.config/crm-op/env"\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"

# 3. Remote Control em laço dentro do tmux (precisa de terminal): queda de rede de ~10 min ou login
# vencido encerra o processo (doc remote-control); o laço tenta de novo em 1 min.
cat > "$CONF/remote-control.sh" <<EOF
#!/usr/bin/env bash
. "\$HOME/.config/crm-op/env"
export PATH="\$HOME/.local/bin:\$PATH"
cd $PASTA
while true; do
  claude remote-control
  echo "Remote Control encerrou. Se pediu login: cd $PASTA && claude, e /login. Nova tentativa em 60 s."
  sleep 60
done
EOF
chmod 700 "$CONF/remote-control.sh"

mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/crm-remote-control.service" <<EOF
[Unit]
Description=Remote Control do Claude Code (CRM)

[Service]
Type=forking
ExecStart=/usr/bin/tmux new-session -d -s crm-rc %h/.config/crm-op/remote-control.sh
ExecStop=/usr/bin/tmux kill-session -t crm-rc
Restart=on-failure
RestartSec=60

[Install]
WantedBy=default.target
EOF

# sudo -iu não abre sessão do systemd: apontar para o barramento do usuário (existe por causa do linger).
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
systemctl --user daemon-reload
systemctl --user enable crm-remote-control.service

# 4. Login antes de subir o serviço: sem login, o Remote Control ficaria parado num prompt dentro do tmux.
echo
echo "Agora o login (só a pessoa faz). Vou abrir o Claude Code em $PASTA:"
echo "  -> confie na pasta, aprove o MCP crm-op, digite /login"
echo "  -> a pessoa abre o link no computador DELA, entra na conta Pro DELA e cola o código aqui"
echo "  -> peça 'diagnostico_crm' (deve mostrar a pessoa como operadora) e saia com /exit"
read -r -p "Enter para abrir... " _
( . "$CONF/env"; cd "$PASTA" && claude ) || true

systemctl --user restart crm-remote-control.service
echo
echo "Pronto. Em até 1 min a sessão aparece no app do Claude da pessoa (Code -> Remote Control)."
echo "Ver o Remote Control: sudo -iu $(id -un) tmux attach -t crm-rc (sair sem fechar: Ctrl+B, depois D)"
echo "Login vencido mais tarde: rode este script de novo (responda N para o token)."
