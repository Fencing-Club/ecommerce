import { createHmac, timingSafeEqual } from "node:crypto"
import invariant from "tiny-invariant"
import { z } from "zod"
import { token } from "./security"

const path = "/api/connections/amazon-ads"
const prefix = "ads-relay."
const lifetime = 10 * 60_000
const clockSkew = 60_000
const ticketSchema = z
  .object({
    origin: z.string(),
    callback: z.string(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expires: z.number().int()
  })
  .strict()

function httpsOrigin(value: string) {
  const url = new URL(value)
  invariant(url.protocol === "https:" && url.origin === value && !url.username && !url.password, "Invalid relay origin")
  return url
}

function relayConfig() {
  const callback = process.env.AMAZON_ADS_RELAY_URL
  const secret = process.env.AMAZON_ADS_RELAY_SECRET
  if (!callback && !secret && !process.env.AMAZON_ADS_RELAY_ORIGINS) {
    return null
  }
  invariant(callback && secret, "Incomplete Amazon Ads relay configuration")
  const url = new URL(callback)
  httpsOrigin(url.origin)
  invariant(callback === `${url.origin}${path}`, "Invalid Amazon Ads relay callback")
  const key = Buffer.from(secret, "base64")
  invariant(key.length === 32, "Amazon Ads relay key must be 32 bytes")
  const origins = (process.env.AMAZON_ADS_RELAY_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  invariant(origins.length, "Amazon Ads relay origins are required")
  for (const origin of origins) {
    // Only these owned development namespaces accept patterns. No generic Railway wildcard, paths or ports.
    if (origin !== "https://*.local.copacker.ai" && origin !== "https://pr-*.preview.copacker.ai") {
      httpsOrigin(origin)
    }
  }
  return { callback, origin: url.origin, key, origins }
}

function allows(origin: string, config: NonNullable<ReturnType<typeof relayConfig>>) {
  httpsOrigin(origin)
  return config.origins.some((allowed) => {
    if (allowed === "https://*.local.copacker.ai") {
      // Folder names identify worktrees. Service labels are not app login origins.
      const label = new URL(origin).hostname.slice(0, -".local.copacker.ai".length)
      return (
        /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local\.copacker\.ai$/.test(origin) &&
        !["stories", "e2e"].includes(label)
      )
    }
    if (allowed === "https://pr-*.preview.copacker.ai") {
      return /^https:\/\/pr-[1-9]\d*\.preview\.copacker\.ai$/.test(origin)
    }
    return allowed === origin
  })
}

function signature(value: string, key: Buffer) {
  return createHmac("sha256", key).update(`amazon-ads-oauth:${value}`).digest("base64url")
}

function readTicket(state: string, config: NonNullable<ReturnType<typeof relayConfig>>) {
  invariant(state.length <= 2048 && state.startsWith(prefix), "Invalid relay state")
  const [encoded, supplied, extra] = state.slice(prefix.length).split(".")
  invariant(encoded && supplied && !extra, "Invalid relay state")
  const expected = Buffer.from(signature(encoded, config.key))
  const actual = Buffer.from(supplied)
  invariant(actual.length === expected.length && timingSafeEqual(actual, expected), "Invalid relay signature")
  const ticket = ticketSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
  // The workstation and relay clocks can differ; the originating database still enforces its ten-minute expiry.
  invariant(ticket.expires > Date.now() && ticket.expires <= Date.now() + lifetime + clockSkew, "Expired relay state")
  invariant(
    ticket.callback === config.callback && ticket.origin !== config.origin && allows(ticket.origin, config),
    "Invalid relay destination"
  )
  return ticket
}

// The originating app stores the hash of the entire ticket in its own single-use OAuth state table.
export function startAdsOAuth(origin: string) {
  const config = relayConfig()
  if (!config || config.origin === origin) {
    return { state: token(), callback: `${origin}${path}` }
  }
  invariant(allows(origin, config), "Origin is not enabled for Amazon Ads relay")
  const ticket = { origin, callback: config.callback, nonce: token(), expires: Date.now() + lifetime }
  const encoded = Buffer.from(JSON.stringify(ticket)).toString("base64url")
  return { state: `${prefix}${encoded}.${signature(encoded, config.key)}`, callback: config.callback }
}

// Both authorization and token exchange must use the very same provider-registered callback.
export function adsOAuthCallback(origin: string, state: string) {
  if (!state.startsWith(prefix)) {
    return `${origin}${path}`
  }
  const config = relayConfig()
  invariant(config, "Amazon Ads relay is not configured")
  const ticket = readTicket(state, config)
  invariant(ticket.origin === origin, "Wrong OAuth return origin")
  return ticket.callback
}

// The relay only forwards a signed, expiring response. It has no need for an originating app's session or database,
// and never exchanges a code or stores a grant. The originating app still checks user, workspace, seller and replay.
export function relayAdsOAuth(request: Request, origin: string) {
  const params = new URL(request.url).searchParams
  const state = params.get("state") ?? ""
  if (!state.startsWith(prefix)) {
    return null
  }
  const config = relayConfig()
  invariant(config, "Amazon Ads relay is not configured")
  const ticket = readTicket(state, config)
  invariant(params.getAll("state").length === 1, "Duplicate OAuth state")
  if (origin !== config.origin) {
    invariant(origin === ticket.origin, "Wrong OAuth return origin")
    return null
  }
  const code = params.get("code"),
    error = params.get("error")
  invariant(
    Boolean(code) !== Boolean(error) && params.getAll("code").length <= 1 && params.getAll("error").length <= 1,
    "Invalid OAuth response"
  )
  invariant((code?.length ?? error?.length ?? 0) <= 4096, "Invalid OAuth response")
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
