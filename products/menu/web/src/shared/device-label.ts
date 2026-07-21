/** A short human label for a session's user-agent ("Chrome · macOS"), for the
 *  admin Sessions tab and the owner's own Devices list. Falls back to a trimmed
 *  raw UA when it can't be parsed. Pure + dependency-free so both surfaces share
 *  one source of truth for the detection rules. */
export function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /iPhone|iPad|iPod|iOS/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua) && !/Chrome/.test(ua)
          ? 'Safari'
          : ''
  return [br, os].filter(Boolean).join(' · ') || ua.slice(0, 40)
}
