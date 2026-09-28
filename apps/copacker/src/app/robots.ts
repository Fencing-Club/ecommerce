import type { MetadataRoute } from "next"
import { areas } from "@/lib/access"
import { appUrl } from "@/server/security"

// What search engines may read: the marketing pages, with sign-in and sign-up as the ways in. "/" stays open, as the
// marketing page anyone signed out sees there. The signed-in app's pages and its API are closed, and so are the steps
// of signing in and getting started, whose links carry one-time tokens.
const closed = [
  "/api/",
  // The portal: the sidebar's pages, Settings, and the old addresses that open Partners.
  ...[...areas, "settings", "suppliers", "forwarders"].map((page) => `/${page}`),
  "/onboarding",
  "/workspaces",
  "/invite",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/callback",
  "/logout",
  "/setup",
  // Each mailing list address's own unsubscribe link.
  "/unsubscribe"
]

// Rendered per request, like the pages, so the sitemap's address is the deployed one rather than the build's.
export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: closed },
    sitemap: `${appUrl()}/sitemap.xml`
  }
}
