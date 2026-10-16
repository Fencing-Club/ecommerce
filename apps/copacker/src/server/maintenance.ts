import { AsyncLocalStorage } from "node:async_hooks"
import { z } from "zod"
import { negotiateLocale } from "@/i18n/locales"
import { translatorFor } from "@/i18n/translator"

const flag = z.object({ enabled: z.boolean(), default_value: z.boolean() })
const refreshMs = 10_000
const timeoutMs = 2_000

// Cache only completed, environment-wide values. Every cache miss owns its network request: Workers cannot share
// another invocation's pending fetch. A newer observation must not be overwritten by an older, slower request.
export function maintenanceReader(apiKey: string) {
  let snapshot = { active: false, checkedAt: -Infinity, sequence: 0 }
  let sequence = 0
  return async () => {
    if (Date.now() - snapshot.checkedAt < refreshMs) {
      return snapshot.active
    }
    const attempt = ++sequence
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // This public API exposes the same global default used by WorkOS's no-context runtime evaluation. "Some"
      // does not close the whole service. Keep the deadline active through body consumption, not just headers.
      const response = await fetch("https://api.workos.com/feature-flags/maintenance", {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: controller.signal,
        redirect: "error"
      })
      let active = false
      if (response.status === 404) {
        await response.body?.cancel()
      } else {
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error("Feature flag request failed")
        }
        const value = flag.parse(await response.json())
        active = value.enabled && value.default_value
      }
      if (attempt > snapshot.sequence) {
        snapshot = { active, checkedAt: Date.now(), sequence: attempt }
      }
    } catch {
      // A cold process stays available; a warm one keeps its last completed setting. Retry on the next request after
      // ten seconds. Do not log provider response bodies, API credentials or request cookies.
      if (attempt > snapshot.sequence) {
        snapshot = { ...snapshot, checkedAt: Date.now(), sequence: attempt }
      }
      console.warn("Could not refresh the maintenance flag; retaining its last known value")
    } finally {
      clearTimeout(timer)
    }
    return snapshot.active
  }
}

let configured: { key: string; read: ReturnType<typeof maintenanceReader> } | undefined
export async function underMaintenance() {
  const key = process.env.WORKOS_API_KEY
  if (!key) {
    configured = undefined
    return false
  }
  if (configured?.key !== key) {
    configured = { key, read: maintenanceReader(key) }
  }
  return configured.read()
}

// The marketing site, health check and their static files remain available. Framework assets are served directly;
// Vite serves its development assets before the app.
const open = [
  "/privacy",
  "/terms",
  "/contact",
  "/unsubscribe",
  "/robots.txt",
  "/sitemap.xml",
  "/icon.svg",
  "/apple-icon.png",
  "/favicon.ico",
  "/marketing",
  "/email",
  "/fonts",
  "/assets",
  "/api/contact",
  "/api/mailing-list",
  "/api/maintenance",
  "/api/health",
  "/@vite"
]

export function closedForMaintenance(request: Request) {
  const { pathname } = new URL(request.url)
  if (pathname === "/") {
    const name = process.env.WORKOS_COOKIE_NAME || "wos-session"
    return (request.headers.get("cookie") ?? "").split(";").some((part) => part.trim().startsWith(`${name}=`))
  }
  return !open.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function maintenanceDocument(request: Request) {
  const { pathname } = new URL(request.url)
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    !pathname.startsWith("/_serverFn/") &&
    (!pathname.startsWith("/api/") || request.headers.get("sec-fetch-dest") === "document")
  )
}

export const maintenanceHeaders = { "Retry-After": "120", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }

export async function maintenanceUnavailable(request: Request) {
  const t = await translatorFor(negotiateLocale(request.headers.get("accept-language")))
  return Response.json({ error: t("errors.underMaintenance") }, { status: 503, headers: maintenanceHeaders })
}

// Internal invocation state, never a caller-supplied header. The Start maintenance route and document loader use it
// without authentication, profile reads or database access.
const invocation = new AsyncLocalStorage<boolean>()
export function withMaintenance<T>(active: boolean, run: () => T): T {
  return invocation.run(active, run)
}
export function maintenanceActive() {
  return invocation.getStore() === true
}
