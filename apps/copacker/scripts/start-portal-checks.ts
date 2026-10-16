import assert from "node:assert/strict"
import { loadMessages } from "../src/i18n/messages"

type Requester = (path: string, options?: RequestInit) => Promise<Response>
const buyer = "00000000-0000-4000-8000-000000000011"
const supplier = "00000000-0000-4000-8000-000000000012"
const markup = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")

// Run the same protected portal acceptance against workerd and the deployed Worker. The caller supplies only the
// fixture gate and (remotely) a WorkOS test session. These scenarios never read or mutate existing workspace data.
export async function checkStartPortal(request: Requester, origin: string, sessionCookie = "") {
  const headers = (scenario = "owner", extra?: Record<string, string>) => ({
    "x-probe-portal": scenario,
    Origin: origin.startsWith("http://127.0.0.1:") ? "https://tanstack-start.e2e.local.copacker.ai" : origin,
    "Sec-Fetch-Site": "same-origin",
    ...(sessionCookie && { Cookie: sessionCookie }),
    ...extra
  })
  if (sessionCookie) {
    const anonymous = await request("/overview?period=today", {
      headers: { "x-probe-portal": "owner" },
      redirect: "manual"
    })
    assert.equal(anonymous.status, 307)
    assert.equal(anonymous.headers.get("Location"), "/login?next=%2Foverview%3Fperiod%3Dtoday")
    await anonymous.body?.cancel()
  }
  const buyerPage = await request("/overview?period=today&keep=stock", { headers: headers() })
  assert.equal(buyerPage.status, 200)
  const buyerHtml = markup(await buyerPage.text())
  assert(buyerHtml.includes("Harbor Goods, switch workspace"))
  assert(buyerHtml.includes("No stores connected"))
  assert.match(buyerPage.headers.get("Cache-Control") ?? "", /private, no-store/)
  const supplierHeaders = headers("owner", {
    Cookie: `${sessionCookie}${sessionCookie ? "; " : ""}copacker-workspace=${supplier}; sidebar_state=false`
  })
  const supplierPage = await request("/overview?period=today&keep=stock", { headers: supplierHeaders })
  assert.equal(supplierPage.status, 200)
  const supplierHtml = markup(await supplierPage.text())
  assert(supplierHtml.includes("Lotus Manufacturing, switch workspace"))
  assert(supplierHtml.includes("Units shipped"))
  assert(supplierHtml.includes('data-state="collapsed"'))
  assert(!supplierHtml.includes("No stores connected"))

  const urdu = await request("/overview", {
    headers: headers("owner", { "x-probe-locale": "ur", "Accept-Language": "en" })
  })
  assert.equal(urdu.status, 200)
  assert((await urdu.text()).includes('<html lang="ur" dir="rtl"'), "Profile locale must win over Accept-Language")

  const denied = await request("/overview", { headers: headers("no-prices"), redirect: "manual" })
  assert.equal(denied.status, 403, "Denied HTML must not report success")
  const deniedHtml = markup(await denied.text())
  assert(deniedHtml.includes((await loadMessages("en")).common.pages.forbidden.askAdmin))
  assert(!deniedHtml.includes("No stores connected"))
  for (const [scenario, destination] of [
    ["no-overview", "/orders"],
    ["no-membership", "/onboarding"],
    ["incomplete", "/onboarding?next=%2Foverview%3Fperiod%3Dtoday"]
  ]) {
    const response = await request("/overview?period=today", { headers: headers(scenario), redirect: "manual" })
    assert.equal(response.status, 307)
    assert.equal(response.headers.get("Location"), destination)
    await response.body?.cancel()
  }
  const switched = await request("/api/action", {
    method: "POST",
    headers: headers("owner", { "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "workspace.switch", data: { id: supplier } })
  })
  assert.equal(switched.status, 200)
  assert.deepEqual(await switched.json(), { redirect: "/" })
  const workspaceCookie = switched.headers.getSetCookie().find((cookie) => cookie.startsWith("copacker-workspace="))
  assert(workspaceCookie && /HttpOnly/i.test(workspaceCookie) && /SameSite=Lax/i.test(workspaceCookie))
  if (origin.startsWith("https:")) {
    assert(/Secure/i.test(workspaceCookie))
  }
  const selected = await request("/api/workspace", { headers: supplierHeaders })
  assert.deepEqual(await selected.json(), { id: supplier })
  const foreign = await request("/api/action", {
    method: "POST",
    headers: headers("owner", { "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "workspace.switch", data: { id: "00000000-0000-4000-8000-000000000099" } })
  })
  assert.equal(foreign.status, 400)
  assert.equal(foreign.headers.getSetCookie().filter((cookie) => cookie.startsWith("copacker-workspace=")).length, 0)
  await foreign.body?.cancel()
  const current = await request("/api/workspace", { headers: headers() })
  assert.deepEqual(await current.json(), { id: buyer })
  const foreignOrigin = await request("/api/action", {
    method: "POST",
    headers: headers("owner", { Origin: "https://other.example", "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "workspace.switch", data: { id: supplier } })
  })
  assert.equal(foreignOrigin.status, 403)
  assert.equal(foreignOrigin.headers.getSetCookie().length, 0)
  await foreignOrigin.body?.cancel()
  for (const path of ["/api/search", "/api/sales/orders?q=sample"]) {
    const response = await request(path, { headers: headers() })
    assert.equal(response.status, 200, path)
    await response.body?.cancel()
  }
  const overlapping = await Promise.all([
    request("/overview", { headers: headers("owner", { "x-probe-locale": "ur" }) }),
    request("/overview?period=today", { headers: supplierHeaders })
  ])
  const [buyerConcurrent, supplierConcurrent] = await Promise.all(
    overlapping.map(async (response) => {
      assert.equal(response.status, 200)
      return markup(await response.text())
    })
  )
  assert(buyerConcurrent?.includes('<html lang="ur" dir="rtl"'))
  assert(!buyerConcurrent?.includes("Units shipped"))
  assert(supplierConcurrent?.includes('<html lang="en" dir="ltr"'))
  assert(supplierConcurrent?.includes("Units shipped"))
}
