#!/usr/bin/env bash
set -euo pipefail

# Kamal wrapper for day-2 commands. Loads infra/.env and runs `kamal "$@"`
# from infra/kamal/. Used by `make logs`, `make console`, etc.
#
# Usage: bash scripts/k.sh <kamal-args>

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/infra/.env"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE — run \`make deploy\` first."; exit 1; }

# Make sure `kamal` (gem-installed) is on PATH even from non-zsh shells.
if ! command -v kamal >/dev/null 2>&1; then
  for gem_bin in /opt/homebrew/lib/ruby/gems/*/bin "$HOME/.gem/ruby/"*/bin; do
    [[ -d "$gem_bin" ]] && export PATH="$gem_bin:$PATH"
  done
fi

set -a; source "$ENV_FILE"; set +a
export ASSETS_HOSTNAME="assets.${PUBLIC_HOSTNAME#*.}"
export KAMAL_BUILD_CONTEXT="$REPO_ROOT"

cd "$REPO_ROOT/infra/kamal"
exec kamal "$@"
