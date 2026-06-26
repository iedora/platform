// OTLP header parsing, shared by both register paths (kept dependency-free of
// @vercel/otel so register-node.ts can use it). OpenObserve authenticates OTLP
// ingestion with `Authorization: Basic <base64(email:password)>`, supplied via
// the standard OTEL_EXPORTER_OTLP_HEADERS env as "Authorization=Basic%20<b64>".
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    if (!key) continue;
    // Values may be URL-encoded so colon-heavy basic creds / bearer tokens
    // survive the `,`-delimited shape. decodeURIComponent is a no-op on
    // already-decoded strings.
    out[key] = decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
