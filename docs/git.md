# Git & Gitea — commit / push canonical

Setup mínimo para empurrar para `git.iedora.com` (Gitea self-hosted no
homelab) com:

- **Auth SSH** sem `GIT_SSH_COMMAND` em cada push
- **Commit signing SSH** ("Verified" badge no Gitea, sem GPG)
- **Conventional Commits** enforced localmente via `commit-msg` hook
- **Hooks** instalados automaticamente pelo `bun install`

Workflow assumido: **trunk-based**. Pushes ao `main` disparam CI. PRs
opcionais quando se quer revisão explícita.

---

## 1. SSH config (uma vez por máquina)

A chave registada no Gitea é a **`ci_ed25519`** (nome no Gitea:
`operator-mac`). Gera nova se for outra máquina — vê § Onboarding nova
máquina.

### macOS / Linux

Adiciona ao `~/.ssh/config`:

```ssh-config
Host gitea.iedora git.iedora.com 192.168.50.53
  HostName 192.168.50.53
  Port 3022
  User git
  IdentityFile ~/.ssh/ci_ed25519
  IdentitiesOnly yes
```

Testa: `ssh -T git@192.168.50.53 -p 3022` deve devolver
`Hi there, eduvhc!`.

### Windows

Duas opções:

**A) Git Bash (recomendado — mesma UX que macOS/Linux)**

Mesmo bloco acima em `C:\Users\<tu>\.ssh\config`. Garante permissões
restritivas:

```powershell
icacls "$env:USERPROFILE\.ssh\config" /inheritance:r /grant:r "${env:USERNAME}:F"
icacls "$env:USERPROFILE\.ssh\ci_ed25519" /inheritance:r /grant:r "${env:USERNAME}:F"
```

Sem isto, o OpenSSH do Windows recusa a chave com `Permissions for
'config' are too open`.

**B) PowerShell + OpenSSH nativo (Windows 10+)**

Mesmo ficheiro `~\.ssh\config`. O `ssh-agent` do Windows liga-se
diferente:

```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\ci_ed25519
```

Em ambos os casos, `git push gitea homelab-migration` funciona sem
flags adicionais.

> Nota WSL2: se clonares o repo dentro de WSL, repete a § macOS/Linux
> dentro da distro. **Não** partilhes a chave entre Windows-host e WSL
> via `/mnt/c` — copia para `~/.ssh/` dentro de WSL e ajusta `chmod 600`.

---

## 2. Commit signing SSH (uma vez por máquina)

A chave de access do Gitea é a **mesma** que assina commits (limitação
do Gitea — não há separação como no GitHub). Já a tens; só falta
configurar o git:

### macOS / Linux

```bash
git config --global commit.gpgsign true
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/ci_ed25519.pub

# allowed_signers — o git usa para verificar localmente (`git log --show-signature`)
EMAIL=$(git config --global user.email)
echo "$EMAIL namespaces=\"git\" $(cat ~/.ssh/ci_ed25519.pub)" >> ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

O Gitea mostra "Verified" automaticamente porque a chave já está
registada como access key — nada para fazer no UI.

### Windows (Git Bash ou PowerShell)

```powershell
git config --global commit.gpgsign true
git config --global gpg.format ssh
git config --global user.signingkey "$env:USERPROFILE\.ssh\ci_ed25519.pub"

$email = git config --global user.email
$key = Get-Content "$env:USERPROFILE\.ssh\ci_ed25519.pub"
Add-Content "$env:USERPROFILE\.ssh\allowed_signers" "$email namespaces=`"git`" $key"
git config --global gpg.ssh.allowedSignersFile "$env:USERPROFILE\.ssh\allowed_signers"
```

Verifica: `git log --show-signature -1` deve dizer
`Good "git" signature for eduardoferdcarvalho@gmail.com`.

---

## 3. Hooks (auto-instalados)

O `bun install` na raiz do repo corre um `postinstall` que copia:

- `scripts/git-hooks/pre-commit` → `.git/hooks/pre-commit`
  - Corre `actionlint` + `shellcheck` em ficheiros de `.github/`
    alterados. Espelha o CI job `workflow-lint`.
- `scripts/git-hooks/commit-msg` → `.git/hooks/commit-msg`
  - Valida o subject contra Conventional Commits.

**Funciona em Windows** desde que tenhas Git Bash (acompanha o Git for
Windows). Os hooks são bash; o Git para Windows fornece o interpretador
automaticamente.

### Conventional Commits — formato

```
<type>(<scope>)?!?: <subject ≤ 72 chars>
```

Types aceites: `feat fix perf docs refactor test chore ci build style`.

Exemplos válidos:

```
fix(ci): vitest 5 beta workaround for Bun __esModule bug
feat(menu)!: drop legacy slug API
chore: bump deps
```

Bypass de emergência: `git commit --no-verify` (evita ambos os hooks —
usa só se souberes o que estás a fazer).

---

## 4. Push flow (dia-a-dia)

```bash
# branch + commit
git checkout -b fix/something
# ... edits ...
git add -A
git commit -m "fix(ci): mensagem curta"   # commit-msg + signing automáticos
git push gitea fix/something                # SSH auto via config

# opcional — PR via API (CLI gh do GitHub não fala Gitea)
curl -X POST -u eduvhc:$GITEA_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"title":"fix: something","head":"fix/something","base":"main"}' \
  https://git.iedora.com/api/v1/repos/eduvhc/iedora/pulls
```

Para empurrar direto ao `main` (trunk-based, default):

```bash
git checkout main
git pull --rebase gitea main
# ... edits ...
git commit -m "..."
git push gitea main
```

---

## 5. Onboarding nova máquina

Se a máquina é nova (sem `ci_ed25519` existente):

```bash
# 1. Gera chave dedicada (sem passphrase para auto-push, ou com passphrase + agent)
ssh-keygen -t ed25519 -f ~/.ssh/ci_ed25519 -C "ci@$(hostname)-$(date +%Y%m%d)"

# 2. Regista no Gitea
cat ~/.ssh/ci_ed25519.pub
# → cola em https://git.iedora.com/user/settings/keys com nome descritivo (ex: "operator-laptop2")

# 3. Aplica § 1, § 2 acima

# 4. Clona
git clone ssh://git@192.168.50.53:3022/eduvhc/iedora.git
cd iedora
bun install   # instala hooks automaticamente
```

---

## 6. Troubleshooting

**`Permission denied (publickey)` no push.** A `id_ed25519` default não
está registada no Gitea. Confirma que a SSH config aponta para a chave
correta:

```bash
ssh -v git@192.168.50.53 -p 3022 2>&1 | grep "Offering\|Server accepts"
# Deve mostrar: Offering public key: ~/.ssh/ci_ed25519
```

**Commit recusado por `✗ commit message não-conventional`.** Reescreve
o último commit: `git commit --amend -m "feat(scope): mensagem"`.

**Signing falha com `error: gpg failed to sign the data`.** Provavelmente
o caminho da chave está errado no config. Verifica:

```bash
git config --global --get user.signingkey
ls -la $(git config --global --get user.signingkey)
```

**Hooks não correm em Windows.** Garante que tens Git Bash instalado
(parte do Git for Windows) e que o ficheiro `.git/hooks/commit-msg`
tem permissões de execução (em Git Bash: `chmod +x .git/hooks/*`).
