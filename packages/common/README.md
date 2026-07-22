# @iedora/common

Small, dependency-free primitives shared across services. The home for the bits
that otherwise get re-derived in every service (`60_000`, `24 * 60 * 60 * 1000`,
"is this jsonb a string or an object?"). Keep it tiny and general — domain logic
does not belong here.

## Durations

Milliseconds per time unit. Compose them instead of writing raw millisecond math.

```ts
import { SECOND, MINUTE, HOUR, DAY, WEEK } from "@iedora/common"

setTimeout(sweep, 5 * MINUTE)
const expiresAt = new Date(Date.now() + 7 * DAY)
const deadline = new Date(start - 24 * HOUR)
```

## JSON

```ts
import { parseJson } from "@iedora/common"

// jsonb comes back parsed on some drivers, as a string on others — normalise it.
const payload = parseJson(row.payload)
```
