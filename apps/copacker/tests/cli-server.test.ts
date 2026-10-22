import { createHash, randomBytes, randomUUID } from "node:crypto"
import { CopackerClient } from "@repo/copacker-client"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  cliAuthorizations,
  cliGrants,
  cliTokens,
  connections,
  memberships,
  operationReceipts,
  organizations,
  stockSnapshots,
  salesSyncs,
  suppliers,
  restockReports,
  salesOrders
} from "../src/db/schema"
import {
  approveCliConsent,
  authorizationParams,
  cliPrincipal,
  exchangeCliCode,
  prepareCliConsent,
  refreshCliToken,
  revokeCliToken
} from "../src/server/cli-auth"
import { cliTokenResponse } from "../src/server/cli-http"
import { GET as authorizeResponse } from "../src/server/http/api/cli-authorize"
import { POST as consentResponse } from "../src/server/http/api/cli-consent"
import { operationResponse } from "../src/server/operations"
import { restockAllChannels } from "../src/server/restock-page"
import { stockScopes } from "../src/server/stock"
import { setExcludedShopifyTags } from "../src/server/workspace-settings"
import { database, setUpTestDatabase } from "./test-db"

vi.mock("@/db", () => import("./test-db"))
const user = {
  id: "user_cli",
  email: "alex@example.com",
  emailVerified: true,
  name: "Alex Example",
  firstName: "Alex",
  lastName: "Example"
}
const identity = vi.hoisted(() => ({ getUser: vi.fn<() => Promise<typeof user>>() }))
vi.mock("@/server/workos", () => ({ workos: () => ({ userManagement: identity }) }))
vi.mock("@/server/auth", () => ({ signedInUser: () => identity.getUser() }))
setUpTestDatabase({ truncate: [organizations, cliGrants, cliAuthorizations] })
const workspaceId = randomUUID(),
  otherId = randomUUID(),
  connectionId = randomUUID()
let access = ""
const authorize = () => {
  const verifier = randomBytes(48).toString("base64url")
  return {
    verifier,
    input: authorizationParams(
      new URLSearchParams({
        response_type: "code",
        client_id: "copacker-cli",
        redirect_uri: "http://127.0.0.1:45678/callback",
        state: randomBytes(32).toString("base64url"),
        code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(verifier).digest("base64url")
      })
    )
  }
}
async function login() {
  const { input, verifier } = authorize()
  const intent = await prepareCliConsent(user.id, input)
  const callback = new URL(await approveCliConsent(user.id, intent, input.state, true))
  const code = callback.searchParams.get("code") ?? ""
  return { tokens: await exchangeCliCode(code, verifier, input.redirect_uri), code, verifier, input, intent }
}
const request = (token = access, extra: HeadersInit = {}) =>
  new Request("https://copacker.example/api/operations/account.show", {
    headers: { Authorization: `Bearer ${token}`, ...extra }
  })
async function call(name: string, input: object = {}, workspace: string | null = workspaceId, key?: string) {
  const response = await operationResponse(
    new Request(`https://copacker.example/api/operations/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {})
      },
      body: JSON.stringify({ ...(workspace ? { workspaceId: workspace } : {}), input })
    }),
    name
  )
  return { status: response.status, body: await response.json() }
}
beforeEach(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  identity.getUser.mockReset().mockResolvedValue(user)
  await database.insert(organizations).values([
    { id: workspaceId, name: "Buyer", kind: "buyer" },
    { id: otherId, name: "Other", kind: "buyer" }
  ])
  await database.insert(memberships).values({ orgId: workspaceId, userId: user.id, email: user.email, role: "owner" })
  await database.insert(connections).values({
    id: connectionId,
    orgId: workspaceId,
    provider: "shopify",
    externalId: "shop.myshopify.com",
    encryptedToken: "must-never-leak",
    scopes: "read_products,read_orders"
  })
  access = (await login()).tokens.access_token
})
describe("CLI authorization", () => {
  it("completes browser approval and token exchange through the HTTP handlers", async () => {
    const { input, verifier } = authorize()
    const navigation = authorizeResponse(
      new Request(`https://copacker.example/api/cli/authorize?${new URLSearchParams(input)}`)
    )
    expect(navigation.status).toBe(303)
    expect(navigation.headers.get("location")).toContain("/cli/authorize?")
    const intent = await prepareCliConsent(user.id, input)
    const form = new URLSearchParams({ intent, state: input.state, decision: "allow" })
    const post = (origin: string) =>
      new Request("http://localhost:3000/api/cli/consent", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
        body: form
      })
    expect((await consentResponse(post("https://foreign.example"))).status).toBe(403)
    expect((await consentResponse(post("null"))).status).toBe(403)
    const approved = await consentResponse(post("http://localhost:3000"))
    expect(approved.status).toBe(303)
    const callback = new URL(approved.headers.get("location") ?? "")
    const response = await cliTokenResponse(
      new Request("https://copacker.example/api/cli/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "copacker-cli",
          code: callback.searchParams.get("code") ?? "",
          code_verifier: verifier,
          redirect_uri: input.redirect_uri
        })
      })
    )
    expect(response.status).toBe(200)
    const tokens = await response.json()
    expect(tokens.token_type).toBe("Bearer")
    await expect(cliPrincipal(request(tokens.access_token))).resolves.toMatchObject({ user })
  })
  it("binds explicit consent to the user and state, and code redemption to PKCE and redirect", async () => {
    const { input, verifier } = authorize()
    const intent = await prepareCliConsent(user.id, input)
    expect((await database.select().from(cliAuthorizations)).find((row) => !row.approvedAt)?.codeHash).toBeNull()
    await expect(approveCliConsent("another-user", intent, input.state, true)).rejects.toMatchObject({
      code: "invalid_grant"
    })
    await expect(approveCliConsent(user.id, intent, randomBytes(32).toString("base64url"), true)).rejects.toMatchObject(
      { code: "invalid_grant" }
    )
    const callback = new URL(await approveCliConsent(user.id, intent, input.state, true))
    const code = callback.searchParams.get("code") ?? ""
    await expect(exchangeCliCode(code, "wrong-verifier", input.redirect_uri)).rejects.toMatchObject({
      code: "invalid_grant"
    })
    await expect(exchangeCliCode(code, verifier, "http://127.0.0.1:45679/callback")).rejects.toMatchObject({
      code: "invalid_grant"
    })
    expect((await exchangeCliCode(code, verifier, input.redirect_uri)).access_token).toHaveLength(43)
    await expect(exchangeCliCode(code, verifier, input.redirect_uri)).rejects.toMatchObject({ code: "invalid_grant" })
    await expect(approveCliConsent(user.id, intent, input.state, true)).rejects.toMatchObject({ code: "invalid_grant" })
  })
  it("rejects non-loopback redirects, duplicate parameters and expired approvals", async () => {
    const { input } = authorize()
    for (const uri of [
      "https://example.com/callback",
      "http://localhost:45678/callback",
      "http://127.0.0.1:45678/callback?x=1",
      "http://127.0.0.1/callback"
    ]) {
      expect(() => authorizationParams(new URLSearchParams({ ...input, redirect_uri: uri }))).toThrow(
        "Invalid CLI authorization request."
      )
    }
    const duplicate = new URLSearchParams(input)
    duplicate.append("state", input.state)
    expect(() => authorizationParams(duplicate)).toThrow("Duplicate parameters.")
    const intent = await prepareCliConsent(user.id, input)
    await database.update(cliAuthorizations).set({ expiresAt: new Date(0) })
    await expect(approveCliConsent(user.id, intent, input.state, true)).rejects.toMatchObject({ code: "invalid_grant" })
  })
  it("denies consent without creating a code or grant", async () => {
    const { input } = authorize(),
      intent = await prepareCliConsent(user.id, input)
    const url = new URL(await approveCliConsent(user.id, intent, input.state, false))
    expect(url.searchParams.get("error")).toBe("access_denied")
    expect(url.searchParams.get("code")).toBeNull()
    expect(await database.select().from(cliGrants)).toHaveLength(1)
  })
  it("rejects expired access tokens and grants", async () => {
    await database
      .update(cliTokens)
      .set({ expiresAt: new Date(0) })
      .where(eq(cliTokens.kind, "access"))
    await expect(cliPrincipal(request())).rejects.toMatchObject({ code: "invalid_grant" })
    const { tokens } = await login()
    await database.update(cliGrants).set({ expiresAt: new Date(0) })
    await expect(cliPrincipal(request(tokens.access_token))).rejects.toMatchObject({ code: "invalid_grant" })
    await expect(refreshCliToken(tokens.refresh_token)).rejects.toMatchObject({ code: "invalid_grant" })
  })
  it("rotates refresh tokens, commits replay revocation, and never persists raw secrets", async () => {
    const { tokens } = await login()
    const fresh = await refreshCliToken(tokens.refresh_token)
    expect(fresh.refresh_token).not.toBe(tokens.refresh_token)
    await expect(cliPrincipal(request(fresh.access_token))).resolves.toMatchObject({ user })
    await expect(refreshCliToken(tokens.refresh_token)).rejects.toMatchObject({ code: "invalid_grant" })
    await expect(cliPrincipal(request(fresh.access_token))).rejects.toMatchObject({ code: "invalid_grant" })
    const stored = JSON.stringify(await database.select().from(cliTokens))
    expect(stored).not.toContain(tokens.access_token)
    expect(stored).not.toContain(fresh.refresh_token)
  })
  it("revokes from an access or refresh token and fails closed if identity lookup fails", async () => {
    await revokeCliToken(access)
    await expect(cliPrincipal(request())).rejects.toMatchObject({ code: "invalid_grant" })
    const { tokens } = await login()
    await revokeCliToken(tokens.refresh_token)
    await expect(refreshCliToken(tokens.refresh_token)).rejects.toMatchObject({ code: "invalid_grant" })
    await expect(revokeCliToken("unknown")).resolves.toBeUndefined()
    access = (await login()).tokens.access_token
    identity.getUser.mockRejectedValue(new Error("provider secret must not leak"))
    await expect(cliPrincipal(request())).rejects.toMatchObject({ code: "identity_unavailable", status: 503 })
  })
  it("refuses browser credentials at the bearer and token endpoints", async () => {
    const browserHeaders: Record<string, string>[] = [
      { Cookie: "session=anything" },
      { Origin: "https://copacker.example" },
      { "Sec-Fetch-Site": "same-origin" }
    ]
    for (const headers of browserHeaders) {
      await expect(cliPrincipal(request(access, headers))).rejects.toMatchObject({ code: "invalid_request" })
    }
    const response = await cliTokenResponse(
      new Request("https://copacker.example/api/cli/token", {
        method: "POST",
        headers: { Cookie: "session=anything", "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&client_id=copacker-cli&refresh_token=x"
      })
    )
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})
describe("Real-data operation handlers", () => {
  it("supports the actual CLI client discovery, result validation and mutation replay", async () => {
    const client = new CopackerClient({
      baseUrl: "https://copacker.example",
      token: access,
      workspaceId,
      attempts: 1,
      fetch: (url, init) => {
        const req = new Request(url, init)
        return operationResponse(req, new URL(req.url).pathname.split("/").at(-1) ?? "")
      }
    })
    expect((await client.call("account.show", {})).data).toMatchObject({ id: user.id })
    expect((await client.call("connection.list", {})).data).toMatchObject({ items: [{ id: connectionId }] })
    const input = {
      id: connectionId,
      expectedRevision: 0,
      settings: { provider: "shopify", excludedOrderTags: ["Amazon"] }
    }
    const first = await client.call("connection.settings.update", input, { idempotencyKey: "client-1" })
    expect(first.data).toMatchObject({ revision: 1 })
    expect((await client.call("connection.settings.update", input, { idempotencyKey: "client-1" })).data).toEqual(
      first.data
    )
  })
  it("bootstraps the account before workspace selection and discovers only deployed handlers", async () => {
    expect((await call("account.show", {}, null)).body.data).toMatchObject({ id: user.id, workspaceId: null })
    expect((await call("schema.show", { operation: "workspace.list" }, null)).status).toBe(200)
    expect((await call("workspace.list", {}, null)).body.data.items).toHaveLength(1)
    const discovered = await call("schema.list")
    expect(discovered.body.data.items.map((row: { operation: string }) => row.operation)).toContain(
      "connection.settings.update"
    )
    expect(discovered.body.data.items.map((row: { operation: string }) => row.operation)).not.toContain("po.create")
    expect((await call("schema.show", { operation: "account.credential.create" })).status).toBe(404)
  })
  it("reads only the selected workspace and returns no provider tokens", async () => {
    const result = await call("connection.list")
    expect(result.status).toBe(200)
    expect(result.body.data.items[0]).toMatchObject({
      id: connectionId,
      accountId: "shop.myshopify.com",
      provider: "shopify"
    })
    expect(JSON.stringify(result)).not.toContain("must-never-leak")
    expect((await call("connection.list", {}, otherId)).status).toBe(403)
    expect((await call("connection.show", { id: randomUUID() })).status).toBe(404)
    await database.delete(memberships).where(eq(memberships.orgId, workspaceId))
    expect((await call("connection.list")).status).toBe(403)
    expect((await call("workspace.list", {}, null)).body.data.items).toEqual([])
  })
  it("hides administrative handlers and dataset details after a role downgrade", async () => {
    await database.update(memberships).set({ role: "member", access: {} })
    expect((await call("connection.list")).body.data.items[0].datasets).toEqual([])
    expect((await call("schema.show", { operation: "connection.settings.update" })).status).toBe(404)
    expect((await call("connection.settings.show", { id: connectionId })).status).toBe(404)
  })
  it("makes a guarded change through the shared settings service and replays the same result", async () => {
    const input = {
      id: connectionId,
      expectedRevision: 0,
      settings: { provider: "shopify", excludedOrderTags: [" Amazon ", "amazon", "eBay"] }
    }
    expect((await call("connection.settings.update", input)).status).toBe(400)
    const first = await call("connection.settings.update", input, workspaceId, "change-1")
    expect(first.status).toBe(200)
    expect(first.body.data).toMatchObject({ revision: 1, settings: { excludedOrderTags: ["Amazon", "eBay"] } })
    expect((await call("connection.settings.update", input, workspaceId, "change-1")).body.data).toEqual(
      first.body.data
    )
    expect(
      (await call("connection.settings.update", { ...input, expectedRevision: 1 }, workspaceId, "change-1")).status
    ).toBe(409)
    expect((await call("connection.settings.update", input, workspaceId, "change-2")).status).toBe(409)
    expect(await database.select().from(operationReceipts)).toHaveLength(1)
    await setExcludedShopifyTags(workspaceId, ["Marketplace"])
    expect((await call("connection.settings.show", { id: connectionId })).body.data.revision).toBe(2)
  })
  it("binds cursors to the principal, workspace and filters", async () => {
    const first = await call("schema.list", { limit: 1 })
    const cursor = first.body.data.page.nextCursor
    expect(typeof cursor).toBe("string")
    expect((await call("schema.list", { limit: 2, cursor })).status).toBe(200)
    expect((await call("schema.list", { prefix: "connection", cursor })).status).toBe(409)
    expect((await call("schema.list", { cursor: `${cursor}x` })).status).toBe(409)
  })
})

describe("Restock operations", () => {
  const locationId = "gid://shopify/Location/1"
  const channelId = `shopify:${locationId}`
  const snapshotId = randomUUID()
  const observedAt = "2026-10-01T00:00:00.000Z"
  async function catalog() {
    await database
      .update(organizations)
      .set({ restockSalesDays: 30, restockLeadTimeDays: 45 })
      .where(eq(organizations.id, workspaceId))
    await database.insert(stockSnapshots).values({
      orgId: workspaceId,
      source: "shopify",
      externalAccountId: "shop.myshopify.com",
      scopeKey: "store",
      snapshotId,
      data: {
        source: "shopify",
        scopeKey: "store",
        shopifyDomain: "shop.myshopify.com",
        startedAt: observedAt,
        observedAt,
        rows: [1, 2].map((n) => ({
          variantId: `gid://shopify/ProductVariant/${n}`,
          productId: `gid://shopify/Product/${n}`,
          inventoryItemId: `gid://shopify/InventoryItem/${n}`,
          buyerSku: `SKU-${n}`,
          productTitle: `Product ${n}`,
          variantTitle: "Default Title",
          imageUrl: null,
          tracked: true,
          unit: "shopify_inventory_unit",
          storeStockTarget: 100,
          amazonStockTarget: 100,
          unitCostMinor: 250,
          costCurrency: "USD",
          priceMinor: 500,
          priceCurrency: "USD",
          levels: [
            {
              locationId,
              locationName: "Warehouse",
              locationKind: "merchant",
              available: 10,
              onHand: 20,
              committed: 10,
              incoming: 5
            }
          ]
        }))
      }
    })
    await database.insert(salesSyncs).values({
      orgId: workspaceId,
      source: "shopify",
      externalAccountId: "shop.myshopify.com",
      coveredFrom: new Date("2026-01-01"),
      coveredTo: new Date(observedAt)
    })
  }
  it("uses workspace defaults and the shared planner, retains missing suppliers and immutable report evidence", async () => {
    await catalog()
    const client = new CopackerClient({
      baseUrl: "https://copacker.example",
      token: access,
      workspaceId,
      attempts: 1,
      fetch: (url, init) => {
        const req = new Request(url, init)
        return operationResponse(req, new URL(req.url).pathname.split("/").at(-1) ?? "")
      }
    })
    expect((await client.call("restock.channel.list", {})).data).toMatchObject({
      items: [{ id: channelId, connectionId, kind: "warehouse", locationId }]
    })
    const response = await client.call("report.restock", {})
    const report = (await call("report.restock")).body.data
    const shared = await restockAllChannels(workspaceId, 30, 45)
    expect(report.settings).toEqual({ days: 30, leadTimeDays: 45 })
    expect(report.rows).toHaveLength(2)
    expect(report.rows[0]).toMatchObject(shared.channels[0]!.lines[0]!)
    expect(report.rows[0]).toMatchObject({
      purchaseUnits: 85,
      supplier: null,
      available: 10,
      source: { provider: "shopify", connectionId, accountId: "shop.myshopify.com" },
      explanation: {
        leadTimeOrigin: "workspace",
        inventorySnapshotIds: [snapshotId],
        issues: [{ code: "supplier_missing" }]
      }
    })
    expect(response.meta.sources).toContainEqual(
      expect.objectContaining({ observedAt, snapshotId, freshness: "unknown" })
    )
    expect(response.meta.completeness).toBe("complete")
    const [saved] = await database.select().from(restockReports).where(eq(restockReports.id, report.reportId))
    expect(saved?.data).toEqual(report)
    await database.update(stockSnapshots).set({ data: null })
    expect(
      (await database.select().from(restockReports).where(eq(restockReports.id, report.reportId)))[0]?.data
    ).toEqual(report)
    expect((await call("report.restock")).body.error.code).toBe("source_unavailable")
  })
  it("filters exact SKU, status and channels and rejects invalid selections", async () => {
    await catalog()
    const selected = await call("report.restock", {
      channelIds: [channelId],
      sku: "SKU-2",
      status: "reorder",
      days: 14,
      leadTimeDays: 20
    })
    expect(selected.status).toBe(200)
    expect(selected.body.data.rows).toHaveLength(1)
    expect(selected.body.data.rows[0]).toMatchObject({
      sku: "SKU-2",
      leadTimeDays: 20,
      explanation: { leadTimeOrigin: "request" }
    })
    expect((await call("report.restock", { sku: "SKU" })).body.data.rows).toEqual([])
    for (const input of [
      { channelIds: [] },
      { channelIds: [channelId, channelId] },
      { channelIds: ["other"] },
      { days: 731 },
      { days: 0 },
      { typo: true }
    ]) {
      expect((await call("report.restock", input)).status).toBe(400)
    }
    expect((await call("report.restock", { supplierId: randomUUID() })).status).toBe(404)
  })
  it("applies supplier lead time before the request default and resolves supplier filtering in the workspace", async () => {
    await catalog()
    const supplierId = randomUUID()
    await database
      .insert(suppliers)
      .values({ id: supplierId, buyerOrgId: workspaceId, name: "Maker", leadTimeDays: 10 })
    const [saved] = await database.select().from(stockSnapshots)
    if (saved?.data?.source !== "shopify") {
      throw new Error("Missing fixture")
    }
    await database.update(stockSnapshots).set({
      data: {
        ...saved.data,
        rows: saved.data.rows.map((row, i) => ({ ...row, supplierName: i === 0 ? "Maker" : null }))
      }
    })
    const response = await call("report.restock", { supplierId, leadTimeDays: 50 })
    expect(response.status).toBe(200)
    expect(response.body.data.rows).toHaveLength(1)
    expect(response.body.data.rows[0]).toMatchObject({
      supplier: { id: supplierId },
      leadTimeDays: 10,
      explanation: { leadTimeOrigin: "supplier" }
    })
  })
  it("enforces Restock access, workspace isolation and price redaction in both output and storage", async () => {
    await catalog()
    expect((await call("report.restock", {}, otherId)).status).toBe(403)
    await database.insert(memberships).values({ orgId: otherId, userId: user.id, email: user.email, role: "owner" })
    expect((await call("restock.channel.list", {}, otherId)).body.data.items).toEqual([])
    expect((await call("report.restock", {}, otherId)).body.error.code).toBe("source_unavailable")
    await database.update(memberships).set({ role: "member", access: {} })
    expect((await call("schema.show", { operation: "report.restock" })).status).toBe(404)
    expect((await call("restock.channel.list")).status).toBe(404)
    expect((await call("report.restock")).status).toBe(404)
    await database.update(memberships).set({ access: { restock: "view" } })
    const result = await call("report.restock")
    expect(result.status).toBe(200)
    expect(result.body.meta.redactedFields).toContain("rows.*.unitCostMinor")
    expect(result.body.data.rows[0]).toMatchObject({
      purchaseUnits: 85,
      unitCostMinor: null,
      priceMinor: null,
      costCurrency: null,
      lostSalesMinor: null,
      lostProfitMinor: null
    })
    expect((await database.select().from(restockReports))[0]?.data).toEqual(result.body.data)
    await database.update(organizations).set({ kind: "supplier" }).where(eq(organizations.id, workspaceId))
    expect((await call("report.restock")).status).toBe(404)
  })
  it("reports missing demand as partial, rather than zero sales or a successful empty report", async () => {
    expect((await call("restock.channel.list")).body.data.items).toEqual([])
    expect((await call("report.restock")).body.error.code).toBe("source_unavailable")
    await catalog()
    await database.delete(salesSyncs)
    const response = await call("report.restock")
    expect(response.status).toBe(200)
    expect(response.body.meta.completeness).toBe("partial")
    expect(response.body.meta.sources).toContainEqual(
      expect.objectContaining({ dataset: "orders", availability: "unavailable" })
    )
    expect(response.body.data.rows[0]).toMatchObject({
      status: "blocked",
      sold: null,
      purchaseUnits: null,
      blocked: ["demand_unknown"]
    })
  })
  it("preserves sales attribution gaps and their quantity counts in the report contract", async () => {
    await catalog()
    await database.insert(salesOrders).values({
      orgId: workspaceId,
      source: "shopify",
      externalAccountId: "shop.myshopify.com",
      orderId: "gap",
      orderedAt: new Date("2026-09-20"),
      data: {
        id: "gap",
        name: "#1",
        tags: [],
        transactions: [],
        createdAt: "2026-09-20T00:00:00Z",
        cancelledAt: null,
        test: false,
        sourceName: "unknown-app",
        fulfillments: [],
        lines: [
          {
            id: "line",
            quantity: 4,
            currentQuantity: 4,
            sku: "SKU-1",
            variant: { id: "gid://shopify/ProductVariant/1" },
            originalUnitPriceSet: { shopMoney: { amount: "5.00", currencyCode: "USD" } },
            discountAllocations: []
          }
        ]
      }
    })
    const response = await call("report.restock")
    expect(response.status).toBe(200)
    expect(response.body.meta.completeness).toBe("partial")
    expect(response.body.data.coverage[0]).toMatchObject({
      gapUnits: 4,
      gapReasons: { channel_unmapped: { units: 4, unknownCount: 0 } }
    })
    expect(response.body.data.rows[0]).toMatchObject({ status: "blocked", sold: null, purchaseUnits: null })
  })
  it("uses one pooled Amazon recommendation with the existing reconciliation and reveals its target basis", async () => {
    await catalog()
    await database
      .insert(connections)
      .values({ orgId: workspaceId, provider: "amazon", externalId: "seller", encryptedToken: "private" })
    await database.insert(salesSyncs).values({
      orgId: workspaceId,
      source: "amazon",
      externalAccountId: "seller",
      coveredFrom: new Date("2026-01-01"),
      coveredTo: new Date(observedAt)
    })
    await database.insert(stockSnapshots).values({
      orgId: workspaceId,
      source: "fba",
      externalAccountId: "seller",
      scopeKey: stockScopes.fba.scopeKey,
      snapshotId: randomUUID(),
      data: {
        source: "fba",
        scopeKey: stockScopes.fba.scopeKey,
        startedAt: observedAt,
        observedAt,
        rows: [
          {
            sellerSku: "SKU-1",
            unit: "amazon_sellable_unit",
            totalQuantity: 50,
            inventoryDetails: {
              fulfillableQuantity: 40,
              inboundWorkingQuantity: 10,
              inboundShippedQuantity: 0,
              inboundReceivingQuantity: 0
            }
          }
        ]
      }
    })
    const response = await call("report.restock", { channelIds: ["amazon"], sku: "SKU-1" })
    expect(response.status).toBe(200)
    expect(response.body.data.rows).toHaveLength(1)
    expect(response.body.data.rows[0]).toMatchObject({ available: 40, incoming: 10, purchaseUnits: 50 })
    expect(response.body.data.targetBasis).toBe("pooled")
    expect(response.body.meta.completeness).toBe("partial")
    expect(response.body.meta.warnings).toContainEqual(expect.objectContaining({ code: "pooled_target" }))
    expect(response.body.data.coverage.map((row: { provider: string }) => row.provider)).toEqual(["amazon"])
  })
  it("retains snapshot observation time after a failed refresh and prunes expired reports only in this workspace", async () => {
    await catalog()
    const first = await call("report.restock")
    await database.update(restockReports).set({ expiresAt: new Date(0) })
    const otherReportId = randomUUID()
    await database
      .insert(restockReports)
      .values({ id: otherReportId, orgId: otherId, userId: user.id, expiresAt: new Date(0), data: {}, metadata: {} })
    await database
      .update(stockSnapshots)
      .set({ status: "failed", attemptFinishedAt: new Date(), errorCode: "refresh_failed" })
    const next = await call("report.restock")
    expect(next.status).toBe(200)
    expect(next.body.meta.completeness).toBe("partial")
    expect(next.body.meta.sources).toContainEqual(
      expect.objectContaining({ dataset: "shopify_inventory", observedAt, freshness: "stale" })
    )
    const saved = await database.select().from(restockReports)
    expect(saved.map((row) => row.id)).not.toContain(first.body.data.reportId)
    expect(saved.map((row) => row.id)).toContain(otherReportId)
  })
})
