# Auth — the iedora identity layer

> One-line purpose: how identity is deployed, configured, and rotated
> across iedora. The Zitadel cutover (issue #20) is done — Zitadel is
> the sole IdP, menu is a thin OIDC client.

## Shape

Identity in iedora is a **single OIDC issuer** (`auth.iedora.com`) that
every product federates to. Menu owns no user/session tables locally;
it holds a single JWE session cookie minted by `openid-client` + `jose`
after the auth-code/PKCE dance, and calls Zitadel's management API via
a TF-minted IAM_OWNER PAT for memberships + org provisioning. The
former `genkan` IdP has been deleted.

## Components

```
                  ┌────────────────────────────────────────┐
                  │ Cloudflare DNS (grey-cloud A record)   │
                  │  auth.iedora.com → Hetzner IPv4        │
                  └────────────────┬───────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │ infra-caddy (TLS via Let's Encrypt)     │
              │  /ui/v2/* ─┐                            │
              │  everything else ─┐                     │
              └─────────┬─────────┼─────────────────────┘
                        │         │
                        ▼         ▼
        ┌──────────────────────┐ ┌────────────────────────────┐
        │ infra-zitadel-login  │ │ infra-zitadel              │
        │ (Next.js, :3000)     │ │ (Go binary, :8080)         │
        │ login-app v4.15.0    │ │ ghcr.io/zitadel:v4.15.0    │
        └──────────────────────┘ └──────────┬─────────────────┘
                        │                   │
                        │  PAT file         │
                        │  via shared       ▼
                        │  volume    ┌────────────────────────────┐
                        └────────────│ infra-postgres / `zitadel` │
                                     └────────────────────────────┘
```

Two containers, not one. The Go binary serves the API + Console + OIDC
endpoints; a separate Next.js container (`zitadel-login`) serves the v2
login UI (Zitadel's chosen architecture in v4 — the v1 login that used
to live in the Go binary is deprecated and only stays as a fallback for
the Console). Both run on the single Hetzner CPX22; ZITADEL is ~80 MB RAM
idle, the login app ~50 MB. Caddy uses h2c upstream to the Go binary
(required for gRPC — that's why this hostname doesn't sit behind a
Cloudflare proxy).

### `infra-zitadel` container

Declared as `docker_container.zitadel` in `infra/tofu/containers.tf`. Key bits:

- **Image** — `ghcr.io/zitadel/zitadel:v4.15.0` (pinned exact;
  Renovate held back to manual review for the auth stack).
- **Cmd** — `start-from-init --masterkeyFromEnv --tlsMode external`.
  `start-from-init` runs migrations + seeds the default instance on
  first boot, then serves traffic. Idempotent: re-running is a no-op
  because the projection state shows the init steps already happened.
  `--tlsMode external` because Caddy terminates TLS on the box; the
  internal Docker network sees plain HTTP/h2c. We still set
  `ZITADEL_EXTERNALSECURE=true` so generated URLs use `https://`.
- **Database** — talks to the shared `infra-postgres` (database
  `zitadel`, pre-created by `infra/postgres/init.sql` on first
  cluster init). Both the User and Admin Postgres connections reuse
  the `postgres` superuser — same convention menu follows.
- **First instance seed** — `ZITADEL_DEFAULTINSTANCE_ORG_*` envs
  create the `iedora` org, the `zitadel-admin` human user, and the
  `login-client` machine user with a 75-year PAT on the very first
  boot. The PAT is written to `/zitadel-bootstrap/login-client.pat`
  (a shared named volume — see below); `zitadel-login` reads from
  the same path.
- **LoginV2 BaseURI** — `ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_BASEURI=https://auth.iedora.com/ui/v2/login`
  so the main binary's authRequest redirects target the Caddy
  path-routing rule instead of trying to serve `/ui/v2/*` itself (which
  returns `{"code":5,"message":"Not Found"}` — that's what `/ui/v2/*`
  on the Go binary looks like).

### `infra-zitadel-login` container

- **Image** — `ghcr.io/zitadel/zitadel-login:v4.15.0` (Next.js,
  pinned to the same major as the main binary — the Login app and
  the main binary share the same gRPC contracts and are released
  together).
- **Listens on `:3000`** — Caddy routes only `/ui/v2/*` here;
  everything else stays on `infra-zitadel`.
- **Auth back to the main binary** — `ZITADEL_SERVICE_USER_TOKEN_FILE
  =/zitadel-bootstrap/login-client.pat`. The PAT belongs to the
  `login-client` machine user with the `IAM_LOGIN_CLIENT` role —
  the minimum scope that lets the login app verify sessions,
  create authRequests, and look up users without being able to
  modify identity data.
- **Shared bootstrap volume** — Docker named volume
  `zitadel-bootstrap` (declared as `docker_volume.zitadel_bootstrap`)
  mounted on both `zitadel` and `zitadel-login`.
  ZITADEL writes the PAT during FirstInstance; the login app reads
  it on every request. Loss of the volume = loss of the login app's
  ability to authenticate; recovery is the wipe-and-reinit path.

### `auth.iedora.com` routing

No CF Tunnel — the hostname resolves directly to the Hetzner IPv4 via
a grey-cloud `cloudflare_dns_record.auth_iedora` (see `infra/tofu/main.tf`).
The Caddyfile inlined in `docker_container.caddy` does the path-routing:

```caddy
auth.iedora.com {
  handle_path /ui/v2/* {
    reverse_proxy infra-zitadel-login:3000
  }
  reverse_proxy infra-zitadel:8080 {
    transport http {
      versions h2c
    }
  }
}
```

The h2c upstream is required for the Zitadel TF provider's gRPC calls
to land — that's the entire reason this hostname doesn't sit behind a
Cloudflare proxy (CF Free blocks gRPC at the edge). Order matters:
`handle_path` MUST come before the catch-all `reverse_proxy` so the
login UI catches `/ui/v2/*` before the Go binary returns
`{"code":5,"message":"Not Found"}`.

### `zitadel` database

Sibling to `menu` in `infra/postgres/init.sql`. Daily `pg_dumpall`
covers it automatically (the `infra-backups` container dumps every
database on the cluster). The former `genkan` database has been
dropped.

### `zitadel-bootstrap` named volume

Docker named volume created by `docker_volume.zitadel_bootstrap` in
`infra/tofu/containers.tf`. Both `infra-zitadel` and `infra-zitadel-login`
mount it at `/zitadel-bootstrap`. Holds exactly one file:
`login-client.pat` — the PAT Zitadel writes during FirstInstance and
the login app reads on every flow.

**Permissions quirk** — Zitadel runs as the non-root `zitadel` user
(UID 1000), `zitadel-login` as `nextjs` (UID 1001). Docker creates
named volumes as `root:root 755` by default, which means neither
user can write. A one-shot init container
(`docker_container.zitadel_bootstrap_chmod`, busybox `chmod 777 /x`)
runs once at create time and exits; the main zitadel container has
a `depends_on` to it so the chmod always wins the race. The volume
is namespace-isolated to these two containers, so 777 isn't a real
surface area increase. Symptom of a missing chmod (don't ask how I
know): Zitadel logs `open /zitadel-bootstrap/login-client.pat:
permission denied`, followed by `unique_constraints_pkey` violations
on retry because the half-completed FirstInstance step leaves rows
behind.

## Secrets

All in BWS, project `iedora-deploy`. Two new for Phase 1:

| Key | Length / format | What it does | Rotation |
|---|---|---|---|
| `INFRA_ZITADEL_MASTERKEY` | **exactly 32 ASCII chars** | Encrypts every internal Zitadel secret (signing keys, OAuth client secrets, action target keys) | **Do not rotate casually.** Re-keying requires a documented multi-step flow with downtime. Generate once at bootstrap via `openssl rand -base64 24 \| head -c 32` |
| `INFRA_ZITADEL_FIRST_ADMIN_PASSWORD` | strong; mix of upper/lower/digit/symbol | Seeds the `zitadel-admin` human user **on the first boot only** | Rotate the live password via the Zitadel UI — this BWS entry is ignored on subsequent boots |

Reused (no new BWS entries needed):

- `INFRA_POSTGRES_PASSWORD` — the `infra-postgres` superuser; serves
  Zitadel's User and Admin DB connections.

Tofu-managed write-throughs:

- `INFRA_ZITADEL_SA_KEY_JSON` — JSON service-account key for the
  Terraform provider. **Cannot be created by Tofu** (chicken-and-egg
  — the provider needs it to authenticate). FirstInstance writes it
  to the `zitadel-bootstrap` named volume; `just zitadel-fetch-sa-key`
  lifts it into BWS. One-time per Zitadel re-bootstrap.

Full rotation guidance: [`docs/secrets.md`](../secrets.md) §
App secrets.

## Bootstrap (first-time-only flow)

After the infra code changes from #19 Phase 1 land:

1. **Mint the BWS secrets** (already done 2026-05-19, kept for
   reproducibility):

   ```sh
   # masterkey — EXACTLY 32 chars
   openssl rand -base64 24 | head -c 32
   # first-admin password — ≥ 8 chars, mix of upper/lower/digit/symbol
   PW=$(openssl rand -base64 18 | tr -d '/+=' | head -c 24); printf '%s!9Aa\n' "$PW"

   # Push to BWS (project iedora-deploy)
   bws secret create -o none -- INFRA_ZITADEL_MASTERKEY              "<32-char value>"      "$BWS_PROJECT_ID"
   bws secret create -o none -- INFRA_ZITADEL_FIRST_ADMIN_PASSWORD   '<strong password>'    "$BWS_PROJECT_ID"
   ```

2. **Deploy** — `just infra::deploy` runs one `tofu apply` that does
   everything in order via `depends_on` and the docker provider's
   create/start semantics:
   - Cloudflare resources land (R2 buckets, grey-cloud A records for
     auth/menu/obs).
   - `docker_network.kamal` + `docker_volume.zitadel_bootstrap` come up
     (the volume's chmod init container fixes perms so non-root
     container users can write).
   - `docker_container.postgres` boots; init.sql is auto-uploaded and
     runs the `CREATE DATABASE` statements on a brand-new cluster.
   - `docker_container.zitadel` boots; `start-from-init` migrates the
     empty `zitadel` Postgres database, creates the `iedora` org, the
     `zitadel-admin` human user with the bootstrap password, and the
     `login-client` machine user with a 75-year PAT. The PAT is
     written to `/zitadel-bootstrap/login-client.pat`.
   - `docker_container.zitadel_login` boots; reads the PAT from the
     shared volume and starts serving `/ui/v2/login/*` on `:3000`.
   - `docker_container.caddy` boots; auto-provisions a Let's Encrypt
     cert for `auth.iedora.com` and starts path-routing per the
     Caddyfile (`/ui/v2/*` → login app, everything else → main binary
     over h2c).

3. **Mint the service-account key for Terraform** — one-shot, manual,
   in the Zitadel UI:
   - Log in to `https://auth.iedora.com/ui/v2/login` with the
     `zitadel-admin` user and the bootstrap password from BWS.
     Change the password on first login.
   - Settings → Service Users → New → role `IAM_OWNER`.
   - On the service user, Keys → Add → Type = JSON. Download the
     `.json` file.
   - Push to BWS as a single multiline secret:

     ```sh
     bws secret create -o none -- INFRA_ZITADEL_SA_KEY_JSON "$(cat ~/Downloads/sa-key.json)" "$BWS_PROJECT_ID"
     ```

4. **Declare the IdP shape in Tofu** (Phase 1.5) — `infra/tofu/zitadel.tf`
   gets the `zitadel/zitadel` provider block + the first declarative
   resources (`zitadel_org.iedora`, `zitadel_project.iedora`). From
   this point on, every OAuth client and policy iedora ever needs is
   HCL-declared, never UI-clicked. Honors `infra/CLAUDE.md` hard
   rule #1 (declarative-first).

### Re-bootstrap (wipe-and-redo)

The `login-client` PAT is written ONLY during FirstInstance — once
the `zitadel` database has any events, the FirstInstance step is
skipped on subsequent `start-from-init` runs. Symptoms when this
goes wrong: HTTP 502 on `/ui/v2/login/*` (login app blocked
"Awaiting file") or repeating `Errors.Instance.Domain.AlreadyExists`
in zitadel logs (FirstInstance crashed mid-way leaving the unique
constraint behind). Recovery:

```sh
HOST=$(tofu -chdir=infra/tofu output -raw hetzner_ipv4)

# 1. Stop the two containers that touch the volume.
ssh root@$HOST 'docker stop infra-zitadel-login infra-zitadel'

# 2. Drop + recreate the zitadel database (menu untouched).
ssh root@$HOST 'docker exec infra-postgres psql -U postgres \
  -c "DROP DATABASE zitadel;" -c "CREATE DATABASE zitadel;"'

# 3. Re-chmod the bootstrap volume (in case it was newly created)
#    AND ensure no stale PAT file lingers.
ssh root@$HOST 'docker run --rm -v zitadel-bootstrap:/x busybox \
  sh -c "rm -f /x/login-client.pat && chmod 777 /x"'

# 4. Start zitadel — FirstInstance reruns and writes a fresh PAT.
ssh root@$HOST 'docker start infra-zitadel'

# 5. Wait for the PAT to land, then start the login app.
until ssh root@$HOST 'docker run --rm -v zitadel-bootstrap:/x busybox test -s /x/login-client.pat'; do sleep 3; done
ssh root@$HOST 'docker start infra-zitadel-login'
```

Menu sessions are invalidated by a fresh Zitadel instance (new issuer
keys), but that's just a forced re-login — no data loss in menu's DB.

**Common gotcha** — Zitadel splits its config across two viper
namespaces. The Console UI defaults (`ZITADEL_DEFAULTINSTANCE_*`)
DO NOT reach the FirstInstance step; that step reads from a separate
setup viper using `ZITADEL_FIRSTINSTANCE_*`. The Go source override
sits at `cmd/setup/03.go: mig.instanceSetup.Org = mig.Org`. Using
the wrong prefix is silent — the human admin and login-client fall
back to steps.yaml defaults (`zitadel-admin@zitadel.<domain>` with
password `Password1!`) and you wonder why your BWS credentials
don't work.

## Day-2 operations

```sh
# Tail logs (any infra-* container; `just infra::logs zitadel` etc.).
just infra::logs zitadel

# Drop into the Zitadel container — debug only; image has no shell,
# so use `docker exec` against the binary directly if you need a one-shot.
ssh root@$(tofu -chdir=infra/tofu output -raw hetzner_ipv4) 'docker exec infra-zitadel /zitadel --help'

# psql into the zitadel database.
just infra::console        # then: \c zitadel

# Reboot zitadel (e.g. to pick up a rotated INFRA_POSTGRES_PASSWORD).
ssh root@$(tofu -chdir=infra/tofu output -raw hetzner_ipv4) 'docker restart infra-zitadel infra-zitadel-login'

# Rotate the operator login password (NOT the masterkey).
# → log in to auth.iedora.com → Profile → Password
```

Zitadel reboots independently of the menu app — `docker restart`
works without disturbing other containers on the `kamal` Docker network
(name kept as tombstone; see `infra/CLAUDE.md`). The menu app
re-establishes OIDC sessions on the next request.

## OIDC client integration

`infra/tofu/zitadel.tf` declares `zitadel_application_oidc.menu` plus
the `zitadel_machine_user.menu_sa` + `zitadel_personal_access_token.menu_sa`
pair that menu's management adapter uses. Producer (Zitadel TF
resources) and consumer (`docker_container.menu_web` env) share the
same TF state, so the OIDC `client_id`/`client_secret`, the session
secret (`random_password.menu_session_secret`), and the management PAT
all flow as direct resource references — no BWS round-trip, no
write-through.

For non-OIDC services (OpenObserve OSS in particular), an
`oauth2-proxy` accessory will sit between the tunnel and the
upstream. That replaces the Cloudflare Access workaround from #13.
Phase 2 of #19.

## See also

- **[issue #19][issue-19]** — original Zitadel migration plan
  (closed); the resource shapes were verified against
  `zitadel/zitadel@2.12.7`.
- **[issue #20][issue-20]** — menu cutover off Better Auth onto
  native Zitadel OIDC (closed).
- **[issue #13][issue-13]** — Cloudflare Access redirect-loop bug
  whose root cause was "OpenObserve OSS doesn't speak OIDC"; pending
  proper close via `oauth2-proxy`.
- **[`docs/secrets.md`](../secrets.md)** — every BWS key, rotation
  cadence, zero-downtime patterns. The two new Zitadel secrets are
  listed there.
- **[`docs/deploy.md`](../deploy.md)** — overall deploy flow;
  `just infra::deploy` runs one `tofu apply` that brings up the
  auth.iedora.com tunnel + the Zitadel containers in the right order.
- **[`infra/CLAUDE.md`](../../infra/CLAUDE.md)** — what the shared
  `infra/` workspace owns, the six hard rules (declarative-first,
  Tofu write-through, bootstrap order, Terraform style, encrypted
  state, one root per blast-radius unit).
- **[`docs/architecture.md`](../architecture.md)** — vertical-slice
  layout in each product. `src/features/identity/` is where the
  per-product Zitadel HTTP adapter will live after Phase 4.

[issue-19]: https://github.com/eduvhc/iedora/issues/19
[issue-20]: https://github.com/eduvhc/iedora/issues/20
[issue-13]: https://github.com/eduvhc/iedora/issues/13
