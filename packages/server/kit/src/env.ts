// Env readers + the _FILE secret convention are now sourced from @iedora/config
// (identical impl). `siblingUrl` stays local: it's Kamal-topology-specific, not
// a generic config primitive.
export { durationMs, env, expandFileSecrets, isProd, requireEnv } from "@iedora/config";

/**
 * Resolves the base URL of a sibling service role under Kamal. Kamal runs each
 * role as `<service>-<role>-<version>` on the shared `kamal` network with no
 * stable alias, injecting KAMAL_VERSION + KAMAL_CONTAINER_NAME; we reconstruct
 * the sibling's versioned name from our own. Falls back to localhost off-Kamal
 * (compose sets an explicit *_BASE_URL env that should win over this).
 * `selfRole` is the caller's own role (the suffix in its container name).
 */
export function siblingUrl(role: string, port: number, selfRole: string): string {
  const version = process.env.KAMAL_VERSION;
  const self = process.env.KAMAL_CONTAINER_NAME; // <service>-<selfRole>-<version>
  const suffix = `-${selfRole}-${version}`;
  if (version && self?.endsWith(suffix)) {
    const service = self.slice(0, -suffix.length); // <service> (e.g. iedora-backend)
    return `http://${service}-${role}-${version}:${port}`;
  }
  return `http://localhost:${port}`;
}
