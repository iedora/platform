import 'server-only'
import { drizzleAuditChainReader } from './adapters/drizzle'
import { verifyAuditChain, type AuditChainStatus } from './chain'

/**
 * Run chain verification against the production Drizzle reader. The
 * /admin/audit page calls this on render; the `verifyChainAction` server
 * action calls it after a `requireAdmin()` guard.
 *
 * Cheap on small tables (sub-100ms for 10K rows on PGLite, faster on real
 * Postgres). For very large tables (1M+ rows) we can move this off the
 * request path — until then a synchronous verify is fine.
 */
export async function verifyChainStatus(): Promise<AuditChainStatus> {
  return verifyAuditChain(drizzleAuditChainReader)
}
