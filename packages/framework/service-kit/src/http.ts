import { type Env, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { HttpError, type ServiceEnv } from "@iedora/server-kit";

import { otelHttp, traceIds } from "./otel";

// createServiceApp returns a Hono app with one consistent global error handler:
// a Hono HTTPException renders its own response; a server-kit HttpError is shaped
// as `{ error: code, message }` with its status; anything else is logged and
// becomes a 500 JSON body. This is THE shared error layer — services throw
// `HttpError` and get correct status/code for free (no per-service handler).
// Generic over the Env so non-service apps (auth, menu — which carry user/tenant
// variables) can supply their own while reusing this.
export function createServiceApp<E extends Env = ServiceEnv>(
  otelOpts?: { captureRequestHeaders?: string[]; captureResponseHeaders?: string[] },
): Hono<E> {
  const app = new Hono<E>();
  app.use(otelHttp<E>(otelOpts)); // request tracing; no-op until OTel is configured
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    // server-kit HttpError extends Error (NOT HTTPException), so it must be
    // handled explicitly — otherwise its status/code are lost to the 500 below.
    if (err instanceof HttpError) {
      return c.json(
        { error: err.code, message: err.message },
        err.status as ContentfulStatusCode,
      );
    }
    // Correlate the error log with its trace so a log line is a jump-off point
    // into the full span tree (this is why per-layer breadcrumb logging isn't
    // needed). No ids when OTel is off.
    console.error(
      JSON.stringify({ level: "error", msg: "unhandled error", err: String(err), ...traceIds() }),
    );
    return c.json({ error: "internal error" }, 500);
  });
  return app;
}
