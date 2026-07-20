// Per-surface PWA manifest. Next's app/manifest.ts is root-only; the tutor surface
// ships its own via a route handler, linked from the surface layout's metadata. On
// tutor.iedora.com the proxy rewrites /manifest.webmanifest → /tutor/manifest.webmanifest.
export function GET(): Response {
  return Response.json({
    name: "Tutor",
    short_name: "Tutor",
    description: "Book lessons, message your tutor, and level up — all in chat.",
    start_url: "/chat",
    display: "standalone",
    orientation: "portrait",
    background_color: "#101619",
    theme_color: "#101619",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  })
}
