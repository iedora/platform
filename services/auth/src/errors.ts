import { HTTPException } from "hono/http-exception";

// Postgres unique-violation detection lives in server-kit; re-exported so the
// auth data layer keeps importing it from here.
export { isUniqueViolation } from "@iedora/server-kit";

/** 401 for any credential/session failure (don't leak which). */
export const unauthorized = (message = "invalid credentials"): HTTPException =>
  new HTTPException(401, { message });
