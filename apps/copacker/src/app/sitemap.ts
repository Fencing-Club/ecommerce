import type { MetadataRoute } from "next"
import { appUrl } from "@/server/security"

// Rendered per request, like the pages, so its addresses are the deployed ones rather than the build's.
export const dynamic = "force-dynamic"

// The marketing site's pages: the home page (what anyone signed out sees at /), contact, and the privacy policy and
// terms.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/contact", "/privacy", "/terms"].map((path) => ({ url: new URL(path, appUrl()).href }))
}
