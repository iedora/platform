# Runbook — dev + deploy

## Dev local

```bash
bun install
bun run dev:up           # postgres + s3mock
bun run dev:migrate      # schema nas 3 DBs (core, menu, imopush)
bun run dev              # next dev em :3000
```

Env carrega de `dev/local.env` (tracked, sem secrets). Reset volumes com `bun run dev:reset`. Logs com `bun run dev:logs`.

## Deploy

**Auto (push a main):** `.gitea/workflows/deploy.yml` dispara em mudanças a source/Dockerfile/Kamal config. Faz `ssh root@beelink` que corre `git fetch` + `kamal deploy -d production`.

**Manual (Mac):**
```bash
ssh root@192.168.50.53 'cd /opt/iedora && git fetch && git checkout <SHA> && \
  BWS_ACCESS_TOKEN=$(bws-token) kamal deploy -d production'
```

**Rollback:**
```bash
ssh root@192.168.50.53 'cd /opt/iedora && kamal rollback <version> -d production'
```

Secrets vêm de Bitwarden Secrets Manager (`bws run` no Beelink lê via `BWS_ACCESS_TOKEN`). Kamal corre nativo no Beelink (não no runner) — build local, push localhost-to-localhost para o Gitea OCI registry.

## Ops

```bash
HOST=192.168.50.53
ssh root@$HOST docker logs -f --tail=200 iedora-web
ssh -t root@$HOST docker exec -it iedora-web-postgres psql -U postgres
ssh root@$HOST docker ps
```

## Day 0 (homelab novo)

```bash
export BWS_ACCESS_TOKEN='...' HOMELAB_HOST='ssh://root@<ip>'
./home-infra/scripts/bootstrap.sh                       # install-kamal + boot services
./home-infra/my-services/iedora/scripts/bootstrap.sh    # cf-tunnel + r2 + setup-repo
kamal setup -d production                               # primeiro boot
```
