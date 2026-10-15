import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFile } from "node:fs/promises"
import { parseEnv } from "node:util"
import { WorkOS } from "@workos-inc/node"
import { sessionEncryption, type Session } from "@workos/authkit-session"
import { z } from "zod"

// Explicit remote target only. These credentials belong to the existing test account, never a production account.
const origin = process.argv[2]
assert(origin && process.argv.length === 3, "Pass the protected staging compatibility Worker origin")
const target = new URL(origin)
assert(
  target.protocol === "https:" &&
    target.hostname.startsWith("copacker-start-compatibility.") &&
    target.hostname.endsWith(".workers.dev")
)
const secrets = parseEnv(await readFile(new URL("../.cloudflare/probe-secrets.env", import.meta.url), "utf8"))
const { WORKOS_API_KEY: apiKey, WORKOS_COOKIE_PASSWORD: cookiePassword, PROBE_ACCESS_TOKEN: probeToken } = secrets
assert(apiKey && apiKey.startsWith("sk_test_") && cookiePassword && probeToken, "Test-only probe secrets are required")
const workos = new WorkOS(apiKey)
const email = process.env.E2E_EMAIL ?? "copacker-e2e@example.net"
const password = `E2e-${createHmac("sha256", apiKey).update(email).digest("base64url")}`
const sessions = new Set<string>()
const identity = z.object({ userId: z.string().nullable() })
const claims = z.object({ sid: z.string() })

function request(method: string, cookie?: string, body?: string) {
  return fetch(`${target.origin}/auth`, {
    method,
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${probeToken}`,
      Origin: target.origin,
      ...(cookie && { Cookie: cookie }),
      ...(body && { "Content-Type": "application/json" })
    },
    body,
    signal: AbortSignal.timeout(30_000)
  })
}
function cookieFrom(response: Response) {
  const values = response.headers.getSetCookie().filter((value) => value.startsWith("migration-session="))
  assert(values.length === 1, "Exactly one session cookie must be emitted")
  return values[0]!.split(";")[0]!
}
async function unseal(cookie: string) {
  const session = await sessionEncryption.unsealData<Session>(
    decodeURIComponent(cookie.slice("migration-session=".length)),
    { password: cookiePassword! }
  )
  const payload = claims.parse(JSON.parse(Buffer.from(session.accessToken.split(".")[1]!, "base64url").toString()))
  sessions.add(payload.sid)
  return session
}
async function needsRefresh(session: Session) {
  // Exercise the public SDK's refresh branch without waiting for the access token to expire. The refresh token is real;
  // the deliberately invalid access token must never be accepted as authentication itself.
  const sealed = await sessionEncryption.sealData(
    { ...session, accessToken: "invalid-for-refresh-test" },
    { password: cookiePassword!, ttl: 0 }
  )
  return `migration-session=${encodeURIComponent(sealed)}`
}
async function expectIdentity(response: Response, expected: string | null) {
  assert(response.status === 200, `Authentication probe failed with HTTP ${response.status}`)
  assert(identity.parse(await response.json()).userId === expected, "Unexpected authenticated identity")
}

try {
  await expectIdentity(await request("GET"), null)
  const login = await request("POST", undefined, JSON.stringify({ email, password }))
  assert(login.status === 200, `WorkOS test-account login failed with HTTP ${login.status}`)
  const user = identity.parse(await login.json()).userId
  assert(user, "Login did not return an identity")
  const initialCookie = cookieFrom(login)
  const initial = await unseal(initialCookie)
  await expectIdentity(await request("GET", initialCookie), user)
  await expectIdentity(await request("GET", "migration-session=tampered"), null)

  const refresh = await request("GET", await needsRefresh(initial))
  await expectIdentity(refresh, user)
  const refreshedCookie = cookieFrom(refresh)
  const refreshed = await unseal(refreshedCookie)
  // WorkOS may return the same refresh token. Persist the returned pair and prove the next request validates without
  // another refresh, rather than imposing a rotation schedule on the provider.
  assert(refreshed.accessToken !== "invalid-for-refresh-test" && refreshed.refreshToken.length > 0)
  const steady = await request("GET", refreshedCookie)
  await expectIdentity(steady, user)
  assert(steady.headers.getSetCookie().length === 0, "A valid session must not refresh again")

  const replacement = await request("POST", await needsRefresh(refreshed), JSON.stringify({ email, password }))
  await expectIdentity(replacement, user)
  const replaced = await unseal(cookieFrom(replacement))
  const logout = await request("DELETE", await needsRefresh(replaced))
  assert(logout.status === 303, "Logout must redirect to WorkOS")
  assert(new URL(logout.headers.get("Location")!).hostname === "api.workos.com", "Unexpected logout destination")
  assert(cookieFrom(logout) === "migration-session=", "Refresh must not overwrite logout")
  assert(logout.headers.getSetCookie().some((value) => /Max-Age=0/.test(value)))

  // Revoke only sessions created by this run, then prove the revoked session cannot refresh. JWTs that have not yet
  // expired remain locally valid until their expiry; the revocation check deliberately exercises refresh rejection.
  for (const sessionId of sessions) {
    await workos.userManagement.revokeSession({ sessionId })
  }
  sessions.clear()
  const rejected = await request("GET", await needsRefresh(replaced))
  await expectIdentity(rejected, null)
  assert(cookieFrom(rejected) === "migration-session=", "Rejected sessions must clear their cookie")
  process.stdout.write(
    "Deployed WorkOS test-account checks passed: login, JWT validation, refresh persistence, replacement login, logout precedence and revoked refresh.\n"
  )
} finally {
  for (const sessionId of sessions) {
    await workos.userManagement.revokeSession({ sessionId })
  }
}
