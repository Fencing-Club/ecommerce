import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"
import { createFormatter, createTranslator } from "use-intl"
import { createBuilder, preview } from "vite"
import { direction, locales } from "../src/i18n/locales"
import { loadMessages } from "../src/i18n/messages"

const configFile = fileURLToPath(new URL("../tests/start-runtime/vite.config.ts", import.meta.url))
const remote = process.argv[2] === "--remote" ? process.argv[3] : undefined
assert(process.argv.length === 2 || (process.argv.length === 4 && remote), "Use --remote <origin> or no arguments")
if (!remote) {
  await (await createBuilder({ configFile, logLevel: "warn" })).buildApp()
}
const server = remote
  ? undefined
  : await preview({ configFile, logLevel: "warn", preview: { host: "127.0.0.1", port: 0, open: false } })
try {
  const address = server?.httpServer.address()
  assert(remote || (address && typeof address !== "string"))
  const origin = remote ?? `http://127.0.0.1:${address && typeof address !== "string" ? address.port : 0}`
  let token: string | undefined
  if (remote) {
    const url = new URL(remote)
    assert.equal(url.protocol, "https:")
    assert(url.hostname.startsWith("copacker-start-compatibility.") && url.hostname.endsWith(".workers.dev"))
    token = parseEnv(
      await readFile(new URL("../.cloudflare/probe-secrets.env", import.meta.url), "utf8")
    ).PROBE_ACCESS_TOKEN
    assert(token)
    const unauthenticated = await fetch(`${origin}/probe`, { signal: AbortSignal.timeout(30_000) })
    assert.equal(unauthenticated.status, 404)
    assert.equal(await unauthenticated.text(), "", "The probe must reject anonymous requests itself")
  }
  const request = (path: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers)
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    return fetch(`${origin}${path}`, { ...options, headers, signal: AbortSignal.timeout(30_000) })
  }
  const page = await request("/?add=supplier&import=true&keep=inventory")
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /data-testid="partner">supplier</)
  assert.match(html, /data-testid="import">open</)
  assert.match(html, /data-testid="marker">empty</)
  const rtl = await request("/?lang=ur")
  assert.equal(rtl.status, 200, "RTL page response")
  assert(/<html lang="ur" dir="rtl"/.test(await rtl.text()), "RTL markup is missing")
  const invalid = await request("/?add=invalid&import=invalid&filter=unrelated")
  assert.equal(invalid.status, 200, "Invalid query input must not break the page")
  const invalidHtml = await invalid.text()
  assert(/data-testid="partner">closed</.test(invalidHtml), "Invalid partner selection must close the sheet")
  assert(/data-testid="import">closed</.test(invalidHtml), "Invalid import selection must close the dialog")

  const foreign = await request("/probe", { method: "POST", headers: { Origin: "https://foreign.example" } })
  assert.equal(foreign.status, 403)
  assert.equal(foreign.headers.getSetCookie().length, 0)
  const missing = await request("/probe", { method: "POST" })
  assert.equal(missing.status, 403)

  const unknownProvider = await request("/login/unknown", { redirect: "manual" })
  assert.equal(unknownProvider.status, 404)
  assert.equal(unknownProvider.headers.getSetCookie().length, 0)
  for (const provider of ["google", "microsoft"]) {
    const oauth = await request(`/login/${provider}?next=%2Forders%3Ftab%3Dopen`, { redirect: "manual" })
    assert.equal(oauth.status, 307)
    const location = new URL(oauth.headers.get("Location")!)
    assert.equal(location.hostname, "api.workos.com")
    assert.equal(location.searchParams.get("code_challenge_method"), "S256")
    assert(location.searchParams.get("state") && location.searchParams.get("code_challenge"))
    const [cookie] = oauth.headers.getSetCookie()
    assert(cookie && cookie.startsWith("copacker-oauth=") && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie))
    assert(/Secure/i.test(cookie))
    assert.equal(
      location.searchParams.get("redirect_uri"),
      `${remote ?? "https://tanstack-start.e2e.local.copacker.ai"}/callback`
    )
    assert(/Max-Age=600/i.test(cookie) && !/Domain=/i.test(cookie))
    assert(!cookie.includes(location.searchParams.get("state")!))
    const rejected = await request("/callback?code=unused&state=forged", {
      redirect: "manual",
      headers: { Cookie: cookie.split(";")[0]! }
    })
    assert.equal(rejected.status, 307)
    assert.equal(rejected.headers.get("Location"), "/login?error=oauth")
    assert(rejected.headers.getSetCookie().some((value) => /^copacker-oauth=;.*Max-Age=0/i.test(value)))
    assert(!rejected.headers.getSetCookie().some((value) => value.startsWith("migration-session=")))
  }

  for (const query of ["", "?code=unused&state=forged"]) {
    const callback = await request(`/callback${query}`, { redirect: "manual" })
    assert.equal(callback.status, 307)
    assert.equal(callback.headers.get("Location"), "/login?error=oauth")
    assert(callback.headers.getSetCookie().some((cookie) => /^copacker-oauth=;.*Max-Age=0/i.test(cookie)))
    assert(!callback.headers.getSetCookie().some((cookie) => cookie.startsWith("migration-session=")))
  }

  const workspace = await request("/workspace", { method: "POST", headers: { Origin: origin } })
  assert.equal(workspace.status, 401, "Workspace queries require a validated session")

  // Each invocation must keep its own language and time zone while all nine catalogs load concurrently.
  await Promise.all(
    locales.flatMap((locale) =>
      ["America/Los_Angeles", "Asia/Tokyo"].map(async (timeZone) => {
        const response = await request("/localization", {
          headers: { "Accept-Language": locale, Cookie: `tz=${timeZone}` }
        })
        assert.equal(response.status, 200)
        assert.equal(response.headers.getSetCookie().length, 0)
        const messages = await loadMessages(locale)
        const config = { locale, messages, timeZone }
        assert.deepEqual(await response.json(), {
          locale,
          direction: direction(locale),
          timeZone,
          failure: messages.errors.requestFailed,
          pricing: messages.supplier.pricing.priceFirst,
          requirement: createTranslator({ ...config, namespace: "shipments.requirements" })("bundle", { count: 2 }),
          date: createFormatter(config).dateTime(new Date("2026-10-15T01:30:00Z"), { dateStyle: "full" }),
          label: messages.server.overview.due.overdue
        })
      })
    )
  )
  const fallback = await request("/localization", {
    headers: { "Accept-Language": "unsupported", Cookie: "tz=invalid" }
  })
  assert.equal(fallback.status, 200)
  const fallbackData = await fallback.json()
  assert.equal(fallbackData.locale, "en")
  assert.equal(fallbackData.timeZone, "UTC")

  const saved = await request("/probe", { method: "POST", headers: { Origin: origin } })
  assert.equal(saved.status, 200, await saved.text())
  const cookies = saved.headers.getSetCookie()
  assert.equal(cookies.length, 2)
  assert(cookies.some((cookie) => cookie.startsWith("migration-session=") && /httponly/i.test(cookie)))
  assert(cookies.every((cookie) => !/domain=/i.test(cookie)))
  const cookieHeader = cookies.map((cookie) => cookie.split(";")[0]).join("; ")
  const session = await request("/probe", { headers: { Cookie: cookieHeader } })
  assert.deepEqual(await session.json(), { userId: "user_compatibility" })
  const anonymous = await request("/probe")
  assert.deepEqual(await anonymous.json(), { userId: null })
  const cleared = await request("/probe", { method: "DELETE", headers: { Origin: origin, Cookie: cookieHeader } })
  assert.equal(cleared.status, 204)
  assert(
    cleared.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("migration-session=;") && /max-age=0/i.test(cookie))
  )

  const documents = await request("/probe?kind=document", { method: "POST", headers: { Origin: origin } })
  assert.equal(documents.status, 200, await documents.clone().text())
  const documentResult: unknown = await documents.json()
  assert(
    documentResult && typeof documentResult === "object" && "pages" in documentResult && "crypto" in documentResult
  )
  assert.equal(documentResult.pages, 1000)
  assert.equal(documentResult.crypto, true)

  // Overlapping requests must not reuse sockets or each other's transaction-local tables.
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      const database = await request("/probe?kind=database", { method: "POST", headers: { Origin: origin } })
      assert.equal(database.status, 200, await database.clone().text())
      assert.deepEqual(await database.json(), { rows: [{ value: 42 }] })
    })
  )
  process.stdout.write(
    "Start/Workers runtime passed: SSR, RTL, nuqs direct links, concurrent localization in all nine languages, CSRF, custom OAuth initiation/state rejection, session storage, cookies, PDF, crypto and concurrent PostgreSQL.\n"
  )
} finally {
  await server?.close()
}
