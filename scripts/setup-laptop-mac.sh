#!/usr/bin/env bash
# Bootstrap canonical git/Gitea setup num Mac novo.
# Idempotente: pode correr múltiplas vezes sem efeitos colaterais.
#
# O que faz:
#   - Instala Bitwarden Desktop se faltar
#   - Pede a public key (Bitwarden Generate → copy)
#   - Cria PAT no Gitea via API
#   - Regista a public key no Gitea
#   - Guarda PAT no macOS keychain
#   - Configura git (signing + remote HTTPS + credential helper)
#   - Appende SSH_AUTH_SOCK ao ~/.zshrc se faltar
#
# Cliques manuais inevitáveis no Bitwarden Desktop:
#   1) Settings → Security → SSH Agent → Enable
#   2) + Add Item → SSH Key → Generate, name "iedora-gitea"
#   3) Copy public key

set -euo pipefail

GITEA=${GITEA_URL:-https://git.iedora.com}
GITEA_USER_DEFAULT=eduvhc

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }
pause() { read -r -p "↵ Enter quando feito... " _; }

require() { command -v "$1" >/dev/null || { red "✗ falta: $1"; exit 1; }; }
require curl
require git
require python3

# ── 1. Bitwarden Desktop ───────────────────────────────────────────────
if [ ! -d "/Applications/Bitwarden.app" ]; then
  bold "→ A instalar Bitwarden Desktop..."
  command -v brew >/dev/null || {
    red "✗ Homebrew não instalado. Instala em https://brew.sh primeiro."
    exit 1
  }
  brew install --cask bitwarden
fi

bold "→ A trazer Bitwarden Desktop ao foreground..."
# `open -a` não força nova janela se a app já está em tray; -n força a
# instância nova. Activate via osascript garante foco da janela.
open -na "/Applications/Bitwarden.app" 2>/dev/null || open -a Bitwarden
osascript -e 'tell application "Bitwarden" to activate' 2>/dev/null || true
sleep 1

cat <<'STEPS'

╭──────────────────────────────────────────────────────────╮
│  FAZ ISTO NO BITWARDEN DESKTOP (3 cliques):              │
│                                                          │
│  1) Settings → Security → SSH Agent → Enable             │
│  2) + Add Item → SSH Key → Generate                      │
│     Name: iedora-gitea                                   │
│  3) Copia a Public Key (botão copy ao lado do campo)     │
╰──────────────────────────────────────────────────────────╯

STEPS

read -r -p "Cola a public key (ssh-ed25519 AAAA...): " PUBKEY
[ -z "$PUBKEY" ] && { red "✗ vazio"; exit 1; }
[[ "$PUBKEY" =~ ^ssh- ]] || { red "✗ formato inválido (esperado ssh-...)"; exit 1; }

# ── 2. Gitea credentials ───────────────────────────────────────────────
echo
bold "→ Credenciais Gitea ($GITEA)"
read -r -p "Username [$GITEA_USER_DEFAULT]: " GUSER
GUSER=${GUSER:-$GITEA_USER_DEFAULT}
read -r -s -p "Password: " GPASS; echo
read -r -p "2FA OTP (Enter se não tens 2FA): " GOTP

GAUTH=(-u "$GUSER:$GPASS")
[ -n "$GOTP" ] && GAUTH+=(-H "X-Gitea-OTP: $GOTP")

# ── 3. Cria PAT ────────────────────────────────────────────────────────
TOKEN_NAME="mac-$(scutil --get LocalHostName 2>/dev/null || hostname -s)-$(date +%Y%m%d)"
bold "→ A criar PAT '$TOKEN_NAME'..."

PAT_RESP=$(curl -fsS "${GAUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$TOKEN_NAME\",\"scopes\":[\"write:repository\",\"write:user\"]}" \
  "$GITEA/api/v1/users/$GUSER/tokens") || {
  red "✗ falhou a criar PAT (cred erradas? 2FA?)"
  exit 1
}

PAT=$(echo "$PAT_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sha1"])')
green "✓ PAT criado (também visível em $GITEA/user/settings/applications)"

# ── 4. Regista pubkey no Gitea ─────────────────────────────────────────
KEY_TITLE="bitwarden-$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
bold "→ A registar SSH key '$KEY_TITLE' no Gitea..."

HTTP=$(curl -fsS -o /tmp/.gitea-key-resp -w '%{http_code}' \
  -H "Authorization: token $PAT" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"$KEY_TITLE\",\"key\":\"$PUBKEY\"}" \
  "$GITEA/api/v1/user/keys" || true)

if [ "$HTTP" = "422" ] && grep -q "already" /tmp/.gitea-key-resp 2>/dev/null; then
  green "✓ key já registada (skip)"
elif [ "$HTTP" = "201" ]; then
  green "✓ key registada"
else
  red "✗ falha ($HTTP): $(cat /tmp/.gitea-key-resp)"
  exit 1
fi

# ── 5. Guarda PAT no keychain ──────────────────────────────────────────
bold "→ A guardar PAT no macOS keychain..."
printf 'protocol=https\nhost=git.iedora.com\nusername=%s\npassword=%s\n\n' \
  "$GUSER" "$PAT" | git credential-osxkeychain store
green "✓ keychain populado"

# ── 6. Git global config ───────────────────────────────────────────────
bold "→ A configurar git..."
git config --global commit.gpgsign true
git config --global gpg.format ssh
git config --global user.signingkey "key::$PUBKEY"
git config --global credential.helper osxkeychain

EMAIL=$(git config --global user.email)
ALLOWED="$HOME/.ssh/allowed_signers"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if ! grep -qF "$PUBKEY" "$ALLOWED" 2>/dev/null; then
  echo "$EMAIL namespaces=\"git\" $PUBKEY" >> "$ALLOWED"
fi
git config --global gpg.ssh.allowedSignersFile "$ALLOWED"
green "✓ git config done"

# ── 7. Shell rc — SSH_AUTH_SOCK ─────────────────────────────────────────
RC="$HOME/.zshrc"
BW_SOCK="$HOME/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock"
[ -S "$BW_SOCK" ] || BW_SOCK="$HOME/.bitwarden-ssh-agent.sock"

if ! grep -q "bitwarden-ssh-agent.sock" "$RC" 2>/dev/null; then
  bold "→ A appende SSH_AUTH_SOCK ao $RC..."
  cat >> "$RC" <<'EOF'

# Bitwarden SSH Agent — testa ambos os paths (brew/.dmg e App Store)
for s in "$HOME/.bitwarden-ssh-agent.sock" \
         "$HOME/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock"; do
  [ -S "$s" ] && { export SSH_AUTH_SOCK="$s"; break; }
done
unset s
EOF
  green "✓ ~/.zshrc atualizado (faz 'source ~/.zshrc' ou abre novo terminal)"
else
  green "✓ ~/.zshrc já tem SSH_AUTH_SOCK"
fi

# ── 8. Repo remote ─────────────────────────────────────────────────────
if [ -d ".git" ] && git remote get-url gitea >/dev/null 2>&1; then
  bold "→ A garantir que o remote 'gitea' aponta a HTTPS..."
  git remote set-url gitea "$GITEA/$GUSER/$(basename "$PWD").git"
  green "✓ remote gitea = $(git remote get-url gitea)"
fi

# ── 9. Smoke test ──────────────────────────────────────────────────────
echo
bold "→ Smoke test"
export SSH_AUTH_SOCK="$BW_SOCK"
if ssh-add -l 2>/dev/null | grep -q "$(echo "$PUBKEY" | awk '{print $2}' | cut -c1-30)"; then
  green "✓ ssh-add -l vê a key via Bitwarden"
else
  red "✗ ssh-add -l não vê a key — confirma que SSH Agent está enabled em Bitwarden"
fi

if curl -fsS -H "Authorization: token $PAT" "$GITEA/api/v1/user" >/dev/null; then
  green "✓ PAT funciona contra a API"
fi

echo
green "═══════════════════════════════════════════════════════════"
green "  ✓ Setup completo."
green "  Próximo passo: source ~/.zshrc && git push gitea <branch>"
green "═══════════════════════════════════════════════════════════"

rm -f /tmp/.gitea-key-resp
