import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFile } from "node:fs/promises"
import { parseEnv } from "node:util"
import { NotFoundException, WorkOS } from "@workos-inc/node"
import { sessionEncryption, type Session } from "@workos/authkit-session"
import { PDFDocument } from "pdf-lib"
import { z } from "zod"
import { loadMessages } from "../src/i18n/messages"
import { checkStartPortal } from "./start-portal-checks"

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

function request(method: string, cookie?: string, body?: string, path = "/auth", language = "en") {
  return fetch(`${target.origin}${path}`, {
    method,
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${probeToken}`,
      Origin: target.origin,
      "Accept-Language": language,
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
  const flag = await workos.featureFlags.getFeatureFlag("maintenance").catch((error: unknown) => {
    if (error instanceof NotFoundException) {
      return null
    }
    throw error
  })
  const maintenance = await fetch(`${target.origin}/api/maintenance`, {
    headers: { Authorization: `Bearer ${probeToken}`, "x-probe-maintenance": "live" },
    signal: AbortSignal.timeout(30_000)
  })
  assert.equal(maintenance.status, 200)
  assert.deepEqual(await maintenance.json(), { active: Boolean(flag?.enabled && flag.defaultValue) })
  await expectIdentity(await request("GET"), null)
  const login = await request(
    "POST",
    undefined,
    JSON.stringify({ action: "auth.signIn", data: { email, password } }),
    "/api/action"
  )
  assert(login.status === 200, `WorkOS test-account login failed with HTTP ${login.status}`)
  assert.deepEqual(await login.json(), { redirect: "/" }, "The custom sign-in flow preserves its redirect")
  const initialCookie = cookieFrom(login)
  const initial = await unseal(initialCookie)
  await checkStartPortal(
    (path, options) =>
      fetch(`${target.origin}${path}`, {
        ...options,
        redirect: options?.redirect ?? "manual",
        headers: { ...Object.fromEntries(new Headers(options?.headers)), Authorization: `Bearer ${probeToken}` },
        signal: AbortSignal.timeout(30_000)
      }),
    target.origin,
    initialCookie
  )
  process.stdout.write("Protected overview and workspace-switch checks passed.\n")
  const user = initial.user.id
  await expectIdentity(await request("GET", initialCookie), user)
  await expectIdentity(await request("GET", "migration-session=tampered"), null)

  const signedInPage = await request("GET", initialCookie, undefined, "/login?next=%2Forders%3Ftab%3Dopen")
  assert.equal(signedInPage.status, 307)
  assert.equal(signedInPage.headers.get("Location"), "/orders?tab=open")
  const signedInSignUp = await request("GET", initialCookie, undefined, "/signup?next=https%3A%2F%2Fforeign.example")
  assert.equal(signedInSignUp.status, 307)
  assert.equal(signedInSignUp.headers.get("Location"), "/")

  const anonymousWorkspace = await request("POST", undefined, undefined, "/workspace")
  assert.equal(anonymousWorkspace.status, 401, "Workspace queries require a validated session")
  const workspace = await request("POST", initialCookie, undefined, "/workspace")
  assert.equal(workspace.status, 200, `Workspace probe failed with HTTP ${workspace.status}`)
  assert.deepEqual(await workspace.json(), {
    selectedRole: "member",
    deniedEdit: true,
    foreignCookieRejected: true,
    permissionChangeApplied: true,
    revokedMembershipRemoved: true,
    switcherKeys: ["id", "kind", "name"]
  })

  for (const kind of ["buyer", "supplier", "forwarder"]) {
    const download = await request("POST", initialCookie, undefined, `/private-document?case=${kind}`)
    assert.equal(download.status, 200, `Private ${kind} download: ${await download.clone().text()}`)
    assert.equal(download.headers.get("Content-Type"), "application/pdf")
    assert.equal(download.headers.get("Content-Disposition"), "attachment; filename*=UTF-8''Private%20label.pdf")
    assert.equal(download.headers.get("Cache-Control"), "private, no-store")
    assert.equal(download.headers.get("Content-Security-Policy"), "sandbox")
    assert.equal(download.headers.get("X-Content-Type-Options"), "nosniff")
    const pdf = await PDFDocument.load(await download.arrayBuffer())
    assert.equal(pdf.getPageCount(), 1)
    assert.equal(pdf.getTitle(), "Private document compatibility")
  }
  for (const [kind, status] of [
    ["foreign", 404],
    ["draft", 404],
    ["hidden-kind", 404],
    ["outdated", 404],
    ["unreleased", 409],
    ["wrong-revision", 409],
    ["replaced", 409],
    ["withdrawn", 409],
    ["removed-supplier", 404],
    ["removed-membership", 403],
    ["revoked-page", 403],
    ["revoked-prices", 403]
  ] as const) {
    const denied = await request("POST", initialCookie, undefined, `/private-document?case=${kind}`)
    assert.equal(denied.status, status, `Private download must reject ${kind}`)
    assert(!denied.headers.get("Content-Type")?.includes("application/pdf"))
    const text = await denied.text()
    assert(!text.includes("%PDF-"), "Denied responses must not contain private bytes")
    if (kind === "revoked-page") {
      assert.equal(text, "Ask an admin for access to Shipments")
    } else if (kind === "revoked-prices") {
      assert.equal(text, "Ask an admin for access to prices and costs")
    }
  }
  const urduDownload = await request("POST", initialCookie, undefined, "/private-document?case=outdated", "ur")
  assert.equal(urduDownload.status, 404)
  assert.equal(await urduDownload.text(), (await loadMessages("ur")).errors.documentNotFound)

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
  assert.equal(replacement.status, 200)
  assert.deepEqual(await replacement.json(), { redirect: "/" })
  const replaced = await unseal(cookieFrom(replacement))
  assert.equal(replaced.user.id, user)
  await expectIdentity(await request("GET", cookieFrom(replacement)), user)
  const logout = await request("POST", await needsRefresh(replaced), undefined, "/logout")
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
    "Deployed WorkOS test-account checks passed: maintenance flag parity, login, JWT validation, workspace authorization, private R2 downloads and withdrawal races, refresh persistence, replacement login, logout precedence and revoked refresh.\n"
  )
} finally {
  for (const sessionId of sessions) {
    await workos.userManagement.revokeSession({ sessionId })
  }
}
