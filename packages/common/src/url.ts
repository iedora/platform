/** Drop the `http://` / `https://` scheme from a URL for display. */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "")
}
