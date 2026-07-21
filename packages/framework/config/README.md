# @iedora/config

Zero-dependency environment config for any service.

- `requireEnv(name)` / `env(name, fallback)` — required + optional string readers.
- `numEnv` / `boolEnv` — parsed number/boolean readers.
- `expandFileSecrets()` — the `_FILE` convention: `<NAME>_FILE` pointing at a path
  is read into `<NAME>` (Docker/Kamal mounted secrets); an explicit value wins.
- `isProd()` — DEPLOYMENT_ENV = production|prod.
- `durationMs("15m", fallback)` — parse `ms|s|m|h|d` durations.

```ts
import { expandFileSecrets, requireEnv, numEnv, durationMs } from "@iedora/config"
expandFileSecrets()
const url = requireEnv("DATABASE_URL")
const port = numEnv("PORT", 4000)
const ttl = durationMs(env("ACCESS_TTL", "15m"), 900_000)
```
