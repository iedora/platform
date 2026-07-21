/** The set of top-level keys whose value differs between two states (deep-equal
 *  by JSON). Used to record `changed_fields` so "what changed" is queryable
 *  without diffing the JSONB at read time. Sorted for stable output. */
export function changedFields(
  oldData?: Record<string, unknown> | null,
  newData?: Record<string, unknown> | null,
): string[] {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})])
  const changed: string[] = []
  for (const k of keys) {
    if (JSON.stringify(oldData?.[k]) !== JSON.stringify(newData?.[k])) changed.push(k)
  }
  return changed.sort()
}
