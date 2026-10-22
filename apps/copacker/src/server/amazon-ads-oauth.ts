import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { StatusError } from "./errors"
import { logEvent } from "./log"
import { token } from "./security"

const path = "/api/connections/amazon-ads"
const prefix = "ads-relay."
const lifetime = 10 * 60_000
const clockSkew = 60_000
// Only these owned development namespaces accept patterns. No generic Railway wildcard, paths or ports.
const worktrees = "https://*.local.copacker.ai"
const previews = "https://pr-*.preview.copacker.ai"
const ticketSchema = z
  .object({
    origin: z.string(),
    callback: z.string(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expires: z.number().int()
  })
  .strict()
type Ticket = z.infer<typeof ticketSchema>

// Why a relayed OAuth state was refused: it was forged or changed, it expired, or it belongs to another app. The person
// sees that the connection expired, and connects again.
type RelayRefusal = {
  refused: "invalid state" | "invalid signature" | "expired" | "wrong destination" | "wrong origin" | "invalid response"
}

function refuse(reason: RelayRefusal["refused"]): RelayRefusal {
  logEvent("warn", "amazon_ads_relay_refused", { reason })
  return { refused: reason }
}

// A relay that's set up wrong. It's logged, and connecting answers that Amazon Ads can't be reached until it's fixed.
function misconfigured(problem: string) {
  logEvent("error", "amazon_ads_relay_misconfigured", { problem })
  return new StatusError("amazonConnectionFailed", 503)
}

// Exactly an https origin, such as https://copacker.ai: no path, query, credentials or trailing slash.
function isHttpsOrigin(value: string) {
  const url = URL.parse(value)
  return url?.protocol === "https:" && url.origin === value && !url.username && !url.password
}

// The relay's settings, or null when this app doesn't use one. Throws when they're set up wrong.
function relayConfig() {
  const callback = process.env.AMAZON_ADS_RELAY_URL
  const secret = process.env.AMAZON_ADS_RELAY_SECRET
  const listed = process.env.AMAZON_ADS_RELAY_ORIGINS
  if (!callback && !secret && !listed) {
    return null
  }
  if (!callback || !secret) {
    throw misconfigured("AMAZON_ADS_RELAY_URL and AMAZON_ADS_RELAY_SECRET are both required")
  }
  const url = URL.parse(callback)
  if (!url || !isHttpsOrigin(url.origin) || callback !== `${url.origin}${path}`) {
    throw misconfigured(`AMAZON_ADS_RELAY_URL must be an https origin followed by ${path}`)
  }
  const key = Buffer.from(secret, "base64")
  if (key.length !== 32) {
    throw misconfigured("AMAZON_ADS_RELAY_SECRET must be 32 bytes")
  }
  const origins = (listed ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (!origins.length) {
    throw misconfigured("AMAZON_ADS_RELAY_ORIGINS is required")
  }
  if (!origins.every((origin) => origin === worktrees || origin === previews || isHttpsOrigin(origin))) {
    throw misconfigured("AMAZON_ADS_RELAY_ORIGINS must list https origins")
  }
  return { callback, origin: url.origin, key, origins }
}
type RelayConfig = NonNullable<ReturnType<typeof relayConfig>>

// Whether the relay may return to an origin.
function allows(origin: string, config: RelayConfig) {
  if (!isHttpsOrigin(origin)) {
    return false
  }
  return config.origins.some((allowed) => {
    if (allowed === worktrees) {
      // Folder names identify worktrees. Service labels are not app login origins.
      const label = new URL(origin).hostname.slice(0, -".local.copacker.ai".length)
      return (
        /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local\.copacker\.ai$/.test(origin) &&
        !["stories", "e2e", "hooks"].includes(label)
      )
    }
    if (allowed === previews) {
      return /^https:\/\/pr-[1-9]\d*\.preview\.copacker\.ai$/.test(origin)
    }
    return allowed === origin
  })
}

function signature(value: string, key: Buffer) {
  return createHmac("sha256", key).update(`amazon-ads-oauth:${value}`).digest("base64url")
}

function decodeTicket(encoded: string) {
  try {
    return ticketSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
  } catch {
    return null
  }
}

// The ticket a relayed state carries, once its signature, expiry and destination check out.
function readTicket(state: string, config: RelayConfig): Ticket | RelayRefusal {
  if (state.length > 2048 || !state.startsWith(prefix)) {
    return refuse("invalid state")
  }
  const [encoded, supplied, extra] = state.slice(prefix.length).split(".")
  if (!encoded || !supplied || extra) {
    return refuse("invalid state")
  }
  const expected = Buffer.from(signature(encoded, config.key))
  const actual = Buffer.from(supplied)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return refuse("invalid signature")
  }
  const ticket = decodeTicket(encoded)
  if (!ticket?.success) {
    return refuse("invalid state")
  }
  const { expires, callback, origin } = ticket.data
  // The workstation and relay clocks can differ; the originating database still enforces its ten-minute expiry.
  if (expires <= Date.now() || expires > Date.now() + lifetime + clockSkew) {
    return refuse("expired")
  }
  if (callback !== config.callback || origin === config.origin || !allows(origin, config)) {
    return refuse("wrong destination")
  }
  return ticket.data
}

// The originating app stores the hash of the entire ticket in its own single-use OAuth state table.
export function startAdsOAuth(origin: string) {
  const config = relayConfig()
  if (!config || config.origin === origin) {
    return { state: token(), callback: `${origin}${path}` }
  }
  if (!allows(origin, config)) {
    throw misconfigured(`${origin} isn't in AMAZON_ADS_RELAY_ORIGINS`)
  }
  const ticket = { origin, callback: config.callback, nonce: token(), expires: Date.now() + lifetime }
  const encoded = Buffer.from(JSON.stringify(ticket)).toString("base64url")
  return { state: `${prefix}${encoded}.${signature(encoded, config.key)}`, callback: config.callback }
}

// Both authorization and token exchange must use the very same provider-registered callback. A relayed state that this
// app didn't start is refused.
export function adsOAuthCallback(origin: string, state: string): string | RelayRefusal {
  if (!state.startsWith(prefix)) {
    return `${origin}${path}`
  }
  const config = relayConfig()
  // An app without a relay never starts a relayed state.
  if (!config) {
    return refuse("invalid state")
  }
  const ticket = readTicket(state, config)
  if ("refused" in ticket) {
    return ticket
  }
  return ticket.origin === origin ? ticket.callback : refuse("wrong origin")
}

// The relay only forwards a signed, expiring response. It has no need for an originating app's session or database,
// and never exchanges a code or stores a grant. The originating app still checks user, workspace, seller and replay.
// Null when the response isn't the relay's to forward: it handles it itself.
export function relayAdsOAuth(request: Request, origin: string): Response | RelayRefusal | null {
  const params = new URL(request.url).searchParams
  const state = params.get("state") ?? ""
  if (!state.startsWith(prefix)) {
    return null
  }
  const config = relayConfig()
  if (!config) {
    return refuse("invalid state")
  }
  const ticket = readTicket(state, config)
  if ("refused" in ticket) {
    return ticket
  }
  if (params.getAll("state").length !== 1) {
    return refuse("invalid response")
  }
  if (origin !== config.origin) {
    return origin === ticket.origin ? null : refuse("wrong origin")
  }
  const code = params.get("code"),
    error = params.get("error")
  if (
    Boolean(code) === Boolean(error) ||
    params.getAll("code").length > 1 ||
    params.getAll("error").length > 1 ||
    (code?.length ?? error?.length ?? 0) > 4096
  ) {
    return refuse("invalid response")
  }
  const target = new URL(`${ticket.origin}${path}`)
  target.searchParams.set("state", state)
  target.searchParams.set(code ? "code" : "error", code || error || "")
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  })
}
