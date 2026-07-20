import { PRODUCTS, productUrl } from "@iedora/brand"

// Per-surface robots. Next's app/robots.ts is root-only (one per app), but the
// platform serves many surfaces, so tutor ships its own via a route handler. On
// tutor.iedora.com the proxy rewrites /robots.txt → /tutor/robots.txt → here.
// Crawl the public marketing surface; keep bots out of the authed app shell.
export function GET(): Response {
  const site = productUrl(PRODUCTS.tutor)
  const body = [
    "User-agent: *",
    "Allow: /",
    "Allow: /t/",
    "Allow: /for-tutors",
    "Allow: /vs",
    ...["/chat", "/lessons", "/account", "/settings", "/admin", "/book", "/room", "/vantage"].map(
      (p) => `Disallow: ${p}`,
    ),
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n")
  return new Response(body, { headers: { "content-type": "text/plain" } })
}
