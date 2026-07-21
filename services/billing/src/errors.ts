import { HTTPException } from "hono/http-exception";

/** 400 — the requested plan code has no registered entry (ports ErrPlanUnknown). */
export const unknownPlan = (): HTTPException => new HTTPException(400, { message: "unknown plan" });

/** 404 — no active subscription matched the cancel (ports ErrSubscriptionNotFound). */
export const noSubscription = (): HTTPException =>
  new HTTPException(404, { message: "no active subscription" });
