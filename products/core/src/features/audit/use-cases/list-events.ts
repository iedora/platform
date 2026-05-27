import type { AuditGateway, ListAuditInput, ListAuditResult } from '../ports'

/**
 * Thin use-case — input normalization + page clamps + delegation.
 * Pure function over the gateway; testable with a fake gateway.
 */
export async function listEvents(
  gateway: AuditGateway,
  input: ListAuditInput,
): Promise<ListAuditResult> {
  return gateway.list({
    ...input,
    page: Math.max(1, Math.floor(input.page)),
    pageSize: Math.max(1, Math.min(200, Math.floor(input.pageSize))),
  })
}
