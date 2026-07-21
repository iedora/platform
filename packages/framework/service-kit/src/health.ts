import { Hono } from "hono";

// Liveness probe shared by every service. `/up` returns 200 {ok:true} when the
// `ping` resolves (DB reachable) and 503 {ok:false} when it throws. Mount it on
// the service app with `.route("/", healthRoutes(() => deps.db.ping()))` so the
// 7-line probe isn't copy-pasted into every composition root.
export function healthRoutes(ping: () => Promise<void>) {
  return new Hono().get("/up", async (c) => {
    try {
      await ping();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });
}
