import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { test, expect } from "../fixtures"

// Token responses must never be retained in a Playwright trace artifact.
test.use({ role: "buyer", trace: "off" })

test("CLI approval preserves the browser origin and exchanges, refreshes and revokes its grant", async ({
  page,
  playwright,
  baseURL
}) => {
  const verifier = randomBytes(48).toString("base64url")
  const state = randomBytes(32).toString("base64url")
  const redirect = "http://127.0.0.1:45678/callback"
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "copacker-cli",
    redirect_uri: redirect,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256"
  })
  // Capture the one-use redirect without needing a CLI listener in the browser test worker.
  await page.route(`${redirect}*`, (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "CLI callback received" })
  )
  await page.goto(`/api/cli/authorize?${params}`)
  await expect(page.getByRole("heading", { name: "Connect your CLI" })).toBeVisible()
  const posted = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/cli/consent" && r.method() === "POST")
  const approved = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/cli/consent")
  await page.getByRole("button", { name: "Allow access" }).click()
  expect((await posted).headers().origin).toBe(new URL(baseURL!).origin)
  const response = await approved
  expect(response.status()).toBe(303)
  expect(response.headers()["referrer-policy"]).toBe("no-referrer")
  const callback = new URL(response.headers().location!)
  expect(callback.searchParams.get("state") === state).toBe(true)
  expect(callback.searchParams.has("code")).toBe(true)
  // A separate API context never sends the browser session cookie to token or operation endpoints.
  const api = await playwright.request.newContext({ baseURL })
  const tokens = z.object({ access_token: z.string(), refresh_token: z.string() })
  let revoke: string | undefined
  try {
    const exchanged = await api.post("/api/cli/token", {
      form: {
        grant_type: "authorization_code",
        client_id: "copacker-cli",
        code: callback.searchParams.get("code")!,
        code_verifier: verifier,
        redirect_uri: redirect
      }
    })
    expect(exchanged.status()).toBe(200)
    const initial = tokens.parse(await exchanged.json())
    revoke = initial.refresh_token
    const account = await api.post("/api/operations/account.show", {
      headers: { Authorization: `Bearer ${initial.access_token}` },
      data: { input: {} }
    })
    expect(account.status()).toBe(200)
    const refreshed = await api.post("/api/cli/token", {
      form: { grant_type: "refresh_token", client_id: "copacker-cli", refresh_token: initial.refresh_token }
    })
    expect(refreshed.status()).toBe(200)
    const rotated = tokens.parse(await refreshed.json())
    revoke = rotated.refresh_token
    expect(rotated.refresh_token !== initial.refresh_token).toBe(true)
    expect((await api.post("/api/cli/revoke", { form: { client_id: "copacker-cli", token: revoke } })).status()).toBe(
      200
    )
    revoke = undefined
    const rejected = await api.post("/api/operations/account.show", {
      headers: { Authorization: `Bearer ${rotated.access_token}` },
      data: { input: {} }
    })
    expect(rejected.status()).toBe(401)
  } finally {
    if (revoke) {
      await api.post("/api/cli/revoke", { form: { client_id: "copacker-cli", token: revoke } })
    }
    await api.dispose()
  }
})
