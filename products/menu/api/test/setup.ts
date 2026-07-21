// The public routes import `getConnInfo` from "hono/bun". Hono's bun adapter
// barrel eagerly evaluates `const { write } = Bun` (its SSG helper) at import
// time, which throws under vitest's node runner because the Bun global is
// absent. getConnInfo itself is already guarded by try/catch in production
// (src/features/public/public.routes.ts falls back to "unknown"), so a bare
// stub object is enough to let the module load under vitest.
const g = globalThis as { Bun?: unknown };
g.Bun ??= { write: async () => {} };
