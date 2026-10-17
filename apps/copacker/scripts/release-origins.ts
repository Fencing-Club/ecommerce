import invariant from "tiny-invariant"
import { z } from "zod"

const origin = z.url().transform((value, context) => {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    context.addIssue({
      code: "custom",
      message: "Release URLs must be HTTPS origins without credentials, paths or query strings"
    })
    return z.NEVER
  }
  return url.origin
})

// Validate both destinations before building, migrating, or deploying either service.
export function releaseOrigins(environment: NodeJS.ProcessEnv, mode: "staging" | "production") {
  const origins = z.object({ APP_URL: origin, STORIES_URL: origin }).parse(environment)
  invariant(origins.APP_URL !== origins.STORIES_URL, "Web and Storybook require separate origins")
  if (mode === "production") {
    for (const [url, names] of [
      [origins.APP_URL, environment.CLOUDFLARE_DOMAINS],
      [origins.STORIES_URL, environment.CLOUDFLARE_STORIES_DOMAINS]
    ]) {
      const domains = (names || "").split(",").map((name) => name.trim().toLowerCase())
      invariant(
        url && domains.includes(new URL(url).hostname),
        "Production origins must be attached to their respective Worker domains"
      )
    }
  }
  return origins
}
