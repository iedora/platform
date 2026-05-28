# home-infra

Infra base do homelab — services independentes do produto. Iedora vive
em `home-infra/iedora/` (próximo) e arranca **depois** destes.

## Convention

```
home-infra/<service>/
  bin.sh              # idempotent, zero flags
  .env                # COMMITTED — config hardcoded non-secret
  docker-compose.yml  # referencia ${SECRET} (BWS) e ${CONFIG} (.env)
  scripts/            # auxiliares idempotent (vazio por agora)
```

`bin.sh` (idêntico em todos os services):

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${BWS_ACCESS_TOKEN:?must be set}"
docker network inspect homelab-core >/dev/null 2>&1 || docker network create homelab-core
cd "$(dirname "${BASH_SOURCE[0]}")"
exec bws run -- docker compose up -d
```

`docker compose` é o orquestrador; `bin.sh` só prepara network e chama
`compose` via `bws run`.

## Config vs Secret

| | Onde | Visibilidade | Exemplo |
|---|---|---|---|
| **Config** (hardcoded) | `home-infra/<service>/.env` (committed) | público no repo | `ZO_ROOT_USER_EMAIL`, `GITEA_DOMAIN` |
| **Secret** (sensível) | Bitwarden Secrets (BWS) | injectado em runtime via `bws run` | `OPENOBSERVE_ADMIN_PASSWORD`, `CLOUDFLARE_API_TOKEN` |

Composes referenciam `${KEY}` — `compose` resolve via shell env (`bws
run`-injected) + `.env` file (next to compose). Nome do `${KEY}` no
compose == nome da key no BWS (para secrets) ou no `.env` (para config).

## Boot order

1. `home-infra/openobserve/bin.sh`
2. `home-infra/gitea/bin.sh`
3. *Depois*: `home-infra/iedora/bin.sh` (consumer)

Ordem entre os dois primeiros é livre (não há `depends_on`
cross-compose). Eu corro manualmente; sem orquestrador global.

## Local vs remote

```bash
export BWS_ACCESS_TOKEN='...'

# Local
./home-infra/openobserve/bin.sh
./home-infra/gitea/bin.sh

# Remote (mesmos scripts)
DOCKER_HOST=ssh://root@192.168.50.53 ./home-infra/openobserve/bin.sh
DOCKER_HOST=ssh://root@192.168.50.53 ./home-infra/gitea/bin.sh
```

## Services

| Service | Conteúdo | Portas | BWS keys consumidas |
|---|---|---|---|
| `openobserve/` | OpenObserve | 5080 (UI/OTLP HTTP), 5081 (OTLP gRPC) | `OPENOBSERVE_ADMIN_PASSWORD` |
| `gitea/` | Gitea (git/UI/Actions/registry) + Caddy (TLS `git.iedora.com` via CF DNS-01) + Actions runner | 3030 (UI), 3022 (SSH), 4443 (HTTPS via Caddy) | `CLOUDFLARE_API_TOKEN` |

## Volumes & migração

Volumes referenciam os nomes da config anterior
(`homelab-core-infra_*`) via `external: true` — preserva dados.

Para um homelab **novo**: apagar os blocos `external: true`; compose
cria volumes com o seu próprio prefix (`home-infra-gitea_*`).

Para migrar da config antiga (`homelab-core-infra/docker-compose.yml`)
para esta:

```bash
# Stop dos containers antigos (volumes mantêm-se):
DOCKER_HOST=ssh://root@192.168.50.53 \
  docker compose -f homelab-core-infra/docker-compose.yml --profile extras down

# Boot da config nova:
DOCKER_HOST=ssh://root@192.168.50.53 ./home-infra/openobserve/bin.sh
DOCKER_HOST=ssh://root@192.168.50.53 ./home-infra/gitea/bin.sh
```

`homelab-core-infra/` desaparece quando a migração do iedora terminar.
