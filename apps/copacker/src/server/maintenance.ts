import { getFeatureFlagsRuntimeClient } from "@workos-inc/authkit-nextjs"
import { NextResponse, type NextRequest } from "next/server"
import { negotiateLocale } from "@/i18n/locales"
import { translatorFor } from "@/i18n/translator"
import { maintenanceHeader } from "@/lib/maintenance"

// Copacker is down for maintenance while the `maintenance` feature flag is on for everyone (All) in the environment's
// WorkOS dashboard. Each server reads the flags every 10 seconds, so switching it takes effect without a deploy.
const flag = "maintenance"

// The marketing site stays up, with its forms, its files and Next.js's own; everything else is behind sign-in.
const open = [
  "/privacy",
  "/terms",
  "/contact",
  "/unsubscribe",
  "/robots.txt",
  "/sitemap.xml",
  "/icon.svg",
  "/apple-icon.png",
  "/marketing",
  "/email",
  "/api/contact",
  "/api/mailing-list",
  "/api/maintenance",
  "/_next"
]

let ready: Promise<unknown> | undefined

// Whether Copacker is down for maintenance. A server that has just started waits up to 2 seconds for its first read of
// the flags; if WorkOS can't be reached, Copacker stays up, and after that each read keeps the flags it last had.
export async function underMaintenance() {
  if (!process.env.WORKOS_API_KEY) {
    return false
  }
  const flags = getFeatureFlagsRuntimeClient({ pollingIntervalMs: 10_000 })
  if (!flags.listenerCount("error")) {
    flags.on("error", (error) => console.warn("Couldn’t read the WorkOS feature flags", error))
  }
  ready ??= flags.waitUntilReady({ timeoutMs: 2_000 }).catch(() => undefined)
  await ready
  return flags.isEnabled(flag)
}

// Whether a request is closed while Copacker is down. Home is the marketing page, but it takes someone signed in on to
// their workspace, so it's closed to them.
export function closedForMaintenance(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === "/") {
    return request.cookies.has(process.env.WORKOS_COOKIE_NAME || "wos-session")
  }
  return !open.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

// A page, or an address the browser opens itself, such as a store connection's return, shows the maintenance page at
// its own address, so it reloads into that page once Copacker is back. Everything else, such as the app's API requests
// and server actions, gets the reason to show. Both are a 503, which tells crawlers and webhook senders to come back.
export async function maintenanceResponse(request: NextRequest) {
  const headers = { "Retry-After": "120", "Cache-Control": "no-store" }
  const page =
    (request.method === "GET" || request.method === "HEAD") &&
    !request.headers.has("next-action") &&
    (!request.nextUrl.pathname.startsWith("/api/") || request.headers.get("sec-fetch-dest") === "document")
  if (page) {
    const marked = new Headers(request.headers)
    marked.set(maintenanceHeader, "1")
    return NextResponse.next({ status: 503, headers, request: { headers: marked } })
  }
  const t = await translatorFor(negotiateLocale(request.headers.get("accept-language")))
  return NextResponse.json({ error: t("errors.underMaintenance") }, { status: 503, headers })
}
