import { PRODUCTS, productUrl } from "@iedora/brand"
import type { MetadataRoute } from "next"

import { listPublicTutorSlugs } from "@iedora/product-tutor/api/tutor-profile"
import { COMPETITORS } from "@iedora/product-tutor/features/marketing/marketing.competitors"

// The tutor surface's public host (tutor.iedora.com), from the brand registry —
// so the sitemap URLs point at the right surface regardless of environment.
const SITE = productUrl(PRODUCTS.tutor)

/**
 * Dynamic sitemap. Public marketing routes plus every tutor landing page and
 * competitor comparison, so search engines discover them without a crawl of the
 * app shell (which is auth-gated and noindex-worthy anyway).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listPublicTutorSlugs()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/for-tutors`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/vs`, changeFrequency: "monthly", priority: 0.5 },
  ]

  const tutorRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${SITE}/t/${slug}`,
    changeFrequency: "weekly",
    priority: 0.9,
  }))

  const competitorRoutes: MetadataRoute.Sitemap = COMPETITORS.map((c) => ({
    url: `${SITE}/vs/${c.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }))

  return [...staticRoutes, ...tutorRoutes, ...competitorRoutes]
}
