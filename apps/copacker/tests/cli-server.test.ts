import { createHash, randomBytes, randomUUID } from "node:crypto"
import { CopackerClient } from "@repo/copacker-client"
import { orderInputSchema } from "@repo/copacker-orders"
import { eq, sql } from "drizzle-orm"
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
  salesOrders,
  orders,
  shipments,
  catalogs,
  catalogProducts,
  supplierProductGroups,
  supplierProducts,
  jobs,
  connectionSyncRuns,
  channelListings
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
import { stockScopes } from "../src/server/inventory-connectors"
import { cliTransfer } from "../src/server/operation-transfers"
import { operationResponse } from "../src/server/operations"
import { restockAllChannels } from "../src/server/restock-page"
import { amazonShipments } from "../src/server/shipments-page"
import { setExcludedShopifyTags } from "../src/server/workspace-settings"
import { database, setUpTestDatabase } from "./test-db"

vi.mock("@/db", () => import("./test-db"))
vi.mock("@/server/shipments-page", () => ({ amazonShipments: vi.fn<typeof amazonShipments>() }))
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
const storedFiles = vi.hoisted(() => new Map<string, { bytes: Uint8Array; contentType: string }>())
vi.mock("@/server/storage", () => ({
  putFile: async (key: string, bytes: Uint8Array, contentType: string) => {
    storedFiles.set(key, { bytes: new Uint8Array(bytes), contentType })
  },
  getFile: async (key: string) => {
    const file = storedFiles.get(key)
    if (!file) {
      throw new Error("Missing file")
    }
    return file.bytes
  },
  readFile: async (key: string) => {
    const file = storedFiles.get(key)
    return file
      ? { body: new Response(new Uint8Array(file.bytes)).body, size: file.bytes.length, contentType: file.contentType }
      : null
  }
}))
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
async function call(
  name: string,
  input: object = {},
  workspace: string | null = workspaceId,
  key: string | undefined = name === "report.restock" ? randomUUID() : undefined
) {
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
  await database.delete(jobs)
  vi.mocked(amazonShipments).mockReset().mockResolvedValue([])
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
describe("CLI ingestion", () => {
  it("reports listing price redactions and reapplies them to retained mutation receipts", async () => {
    const id = randomUUID(),
      amazonId = randomUUID()
    await database
      .insert(connections)
      .values({ id: amazonId, orgId: workspaceId, provider: "amazon", externalId: "SELLER", encryptedToken: "private" })
    await database.insert(channelListings).values({
      id,
      orgId: workspaceId,
      connectionId: amazonId,
      accountId: "SELLER",
      marketplaceId: "ATVPDKIKX0DER",
      sellerSku: "SKU",
      productType: "PRODUCT",
      fulfillmentMode: "fbm",
      amountMinor: 3000,
      currency: "USD",
      observedAt: new Date(),
      generation: randomUUID()
    })
    const input = { id, expectedRevision: 1, expectedLinkRevision: 0 }
    expect((await call("product.listing.unlink", input, workspaceId, "unlink")).body.data.price.amountMinor).toBe(3000)
    await database
      .update(memberships)
      .set({ role: "member", access: { products: "edit" } })
      .where(eq(memberships.orgId, workspaceId))
    const replay = await call("product.listing.unlink", input, workspaceId, "unlink")
    expect(replay.body.data.price).toBeNull()
    expect(replay.body.meta.redactedFields).toEqual(["price"])
    expect((await call("product.listing.show", { id })).body.meta.redactedFields).toEqual(["price"])
    expect((await call("product.listing.list")).body.meta.redactedFields).toEqual(["items.*.price"])
  })
  it("queues shared workers atomically, joins active work, and retains exact job identity", async () => {
    const key = randomUUID()
    const input = { id: connectionId, dataset: "all" }
    const first = await call("connection.sync", input, workspaceId, key)
    expect(first.status).toBe(200)
    expect(first.body.data.operation.status).toBe("queued")
    expect(first.body.data.requestedDatasets).toEqual(["products", "inventory", "orders", "financial_transactions"])
    expect((await database.select().from(jobs)).map((job) => job.kind).sort()).toEqual(["sales", "stock"])
    expect((await call("connection.sync", input, workspaceId, key)).body.data).toEqual(first.body.data)
    const joined = await call("connection.sync", input, workspaceId, randomUUID())
    expect(joined.status).toBe(200)
    expect(await database.select().from(jobs)).toHaveLength(2)
    await database.update(jobs).set({ status: "complete" })
    const show = await call("connection.sync.show", first.body.data.statusQuery.input)
    expect(show.body.data.operation.status).toBe("succeeded")
    const next = await call("connection.sync", input, workspaceId, randomUUID())
    expect(next.body.data.operation.status).toBe("queued")
    expect((await call("connection.sync.show", first.body.data.statusQuery.input)).body.data.operation.status).toBe(
      "succeeded"
    )
    await database.delete(jobs)
    expect((await call("connection.sync.show", first.body.data.statusQuery.input)).body.data.operation.status).toBe(
      "needs_attention"
    )
  })
  it("rejects unsupported datasets, foreign connections and missing grouped permissions before queueing", async () => {
    expect(
      (await call("connection.sync", { id: connectionId, dataset: "ad_spend" }, workspaceId, randomUUID())).status
    ).toBe(409)
    expect((await call("connection.sync", { id: randomUUID() }, workspaceId, randomUUID())).status).toBe(404)
    await database
      .update(memberships)
      .set({ role: "member", access: { sales: "view" } })
      .where(eq(memberships.orgId, workspaceId))
    expect(
      (await call("connection.sync", { id: connectionId, dataset: "orders" }, workspaceId, randomUUID())).status
    ).toBe(403)
    expect(await database.select().from(jobs)).toHaveLength(0)
    expect(await database.select().from(connectionSyncRuns)).toHaveLength(0)
  })
  it("rolls back all queued work on a producer error and rejects replaced accounts", async () => {
    await database.update(connections).set({ scopes: "read_products" })
    expect((await call("connection.sync", { id: connectionId }, workspaceId, randomUUID())).status).not.toBe(200)
    expect(await database.select().from(jobs)).toHaveLength(0)
    await database.update(connections).set({ scopes: "read_products,read_orders" })
    const queued = await call("connection.sync", { id: connectionId }, workspaceId, randomUUID())
    await database.update(connections).set({ externalId: "replacement.myshopify.com" })
    expect((await call("connection.sync.show", queued.body.data.statusQuery.input)).status).toBe(409)
  })
  it("shows permission-filtered operational health without provider secrets", async () => {
    const result = await call("status")
    expect(result.status).toBe(200)
    expect(result.body.data.attention.length).toBeGreaterThan(0)
    expect(JSON.stringify(result.body)).not.toContain("must-never-leak")
    await database.update(memberships).set({ role: "member", access: {} }).where(eq(memberships.orgId, workspaceId))
    expect((await call("status")).body.data.connections[0].datasets).toEqual([])
  })
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

describe("Supplier CLI changes", () => {
  it("creates partners without invitations and rejects changed partner details", async () => {
    const input = { data: { type: "supplier", name: "New Factory" }, clientReference: randomUUID() }
    const created = await call("partners.create", input, workspaceId, "partner")
    expect(created.status).toBe(200)
    const id = created.body.data.id
    expect((await call("partners.create", input, workspaceId, "partner")).body.data.id).toBe(id)
    const update = {
      type: "supplier",
      id,
      name: "Renamed",
      leadTimeDays: 12,
      expected: { name: "New Factory", leadTimeDays: null }
    }
    expect((await call("partners.update", update, workspaceId, "rename")).status).toBe(200)
    expect((await call("partners.update", update, workspaceId, "stale-rename")).status).toBe(409)
    const [row] = await database.select().from(suppliers).where(eq(suppliers.id, id))
    expect(row).toMatchObject({ email: null, invitationHash: null })
  })
  it("creates supplier products, preserves stock on edit, and imports guarded inventory through protected transfers", async () => {
    const org = randomUUID()
    await database.insert(organizations).values({ id: org, name: "Supplier", kind: "supplier" })
    await database.insert(memberships).values({ orgId: org, userId: user.id, email: user.email, role: "owner" })
    const data = {
      clientReference: randomUUID(),
      title: "Test product",
      status: "active",
      category: "",
      productCode: "",
      url: "",
      description: "",
      optionNames: [],
      images: [],
      variants: [
        {
          supplierSku: "CLI-1",
          options: {},
          currency: "USD",
          priceMinor: 120,
          priceBasis: "piece",
          piecesPerSellablePack: 1,
          sellablePacksPerCase: null,
          trackInventory: true,
          continueSelling: false,
          priceBreaks: [],
          quantityRules: { minimum: 1, increment: 1, maximum: null }
        }
      ]
    }
    const created = await call("product.create", data, org, "product")
    expect(created.status).toBe(200)
    const settings = await call("product.settings.show", { id: created.body.data.id }, org)
    expect(settings.status).toBe(200)
    expect(settings.body.data).toMatchObject({
      kind: "supplier",
      expectedRevision: 1,
      variants: [{ supplierSku: "CLI-1", expectedRevision: 1 }]
    })
    const [variant] = await database
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.groupId, created.body.data.id))
    const locationId = `supplier:${org}`
    const count = { variantId: variant!.id, locationId, quantity: 20, expectedRevision: 1 }
    expect(
      (await call("inventory.update", { ...count, mode: "preview" }, org, "count-preview")).body.data.items[0]
    ).toMatchObject({ before: 0, quantity: 20 })
    expect((await call("inventory.show", { id: variant!.id }, org)).body.data.items[0].quantity).toBe(0)
    expect((await call("inventory.update", count, org, "count")).status).toBe(200)
    expect((await call("inventory.update", count, org, "count")).status).toBe(200)
    expect((await call("inventory.update", count, org, "stale-count")).status).toBe(409)
    const { clientReference: _, ...fields } = data
    const edit = {
      ...fields,
      kind: "supplier",
      id: created.body.data.id,
      expectedRevision: 1,
      variants: [{ ...data.variants[0], id: variant!.id, expectedRevision: 2 }]
    }
    expect((await call("product.update", edit, org, "edit")).status).toBe(200)
    expect((await call("inventory.show", { id: variant!.id }, org)).body.data.items[0]).toMatchObject({
      quantity: 20,
      revision: 3
    })
    const csv = `variantId,locationId,quantity,expectedRevision\r\n${variant!.id},${locationId},31,3`
    const bytes = Buffer.from(csv),
      sha256 = createHash("sha256").update(bytes).digest("hex"),
      intentId = randomUUID()
    const prepare = await call(
      "inventory.import",
      {
        phase: "prepare",
        intentId,
        file: { filename: "counts.csv", mediaType: "text/csv", size: bytes.length, sha256 }
      },
      org,
      "import/prepare"
    )
    expect(prepare.status).toBe(200)
    const transfer = (token: string, digest = sha256) =>
      new Request(prepare.body.data.upload.url, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "text/csv", "x-content-sha256": digest },
        body: bytes
      })
    const id = prepare.body.data.handoffId
    expect((await cliTransfer(transfer(access, "bad"), id)).status).toBe(400)
    expect((await cliTransfer(transfer(access), id)).status).toBe(204)
    const complete = { phase: "complete", intentId, handoffId: id, sha256 }
    expect((await call("inventory.import", complete, org, "import/complete")).body.data.stockCounts).toBe(1)
    expect(
      (await call("inventory.import.apply", { previewId: id, reviewed: true }, org, "apply")).body.data.imported
    ).toBe(true)
    expect(
      (await call("inventory.import.apply", { previewId: id, reviewed: true }, org, "second-apply")).body.data.imported
    ).toBe(false)
    expect((await call("inventory.show", { id: variant!.id }, org)).body.data.items[0].quantity).toBe(31)
    const exported = await call(
      "inventory.export",
      { action: "generate", fileFormat: "csv", selection: {} },
      org,
      "export"
    )
    expect(exported.status).toBe(200)
    const download = await cliTransfer(
      new Request(exported.body.data.download.url, { headers: { authorization: `Bearer ${access}` } }),
      exported.body.data.id
    )
    expect(download.status).toBe(200)
    expect(await download.text()).toContain(`${variant!.id},${locationId},31,4`)
    const foreignTransfer = new URL(prepare.body.data.upload.url)
    foreignTransfer.searchParams.set("workspaceId", workspaceId)
    expect(
      (await cliTransfer(new Request(foreignTransfer, { headers: { authorization: `Bearer ${access}` } }), id)).status
    ).toBe(404)
    expect(
      (
        await cliTransfer(
          new Request(prepare.body.data.upload.url, { headers: { cookie: "session=browser-only" } }),
          id
        )
      ).status
    ).toBe(401)
    expect(
      (
        await call(
          "inventory.update",
          {
            rows: [
              { ...count, expectedRevision: 4, quantity: 90 },
              { ...count, variantId: randomUUID(), expectedRevision: 1 }
            ]
          },
          org,
          "atomic-failure"
        )
      ).status
    ).toBe(404)
    expect((await call("inventory.show", { id: variant!.id }, org)).body.data.items[0].quantity).toBe(31)
    const productsExport = await call("product.export", {}, org, "products-export")
    expect(productsExport.status).toBe(200)
    const productFile = await cliTransfer(
      new Request(productsExport.body.data.download.url, { headers: { authorization: `Bearer ${access}` } }),
      productsExport.body.data.id
    )
    const productBytes = new Uint8Array(await productFile.arrayBuffer())
    const productDigest = createHash("sha256").update(productBytes).digest("hex")
    const productIntent = randomUUID()
    const staged = await call(
      "product.import",
      {
        phase: "prepare",
        intentId: productIntent,
        locationId,
        file: { filename: "products.csv", mediaType: "text/csv", size: productBytes.length, sha256: productDigest }
      },
      org,
      "products-prepare"
    )
    expect(staged.status).toBe(200)
    expect(
      (
        await cliTransfer(
          new Request(staged.body.data.upload.url, {
            method: "PUT",
            headers: {
              authorization: `Bearer ${access}`,
              "content-type": "text/csv",
              "x-content-sha256": productDigest
            },
            body: productBytes
          }),
          staged.body.data.handoffId
        )
      ).status
    ).toBe(204)
    const productPreview = await call(
      "product.import",
      { phase: "complete", intentId: productIntent, handoffId: staged.body.data.handoffId, sha256: productDigest },
      org,
      "products-complete"
    )
    expect(productPreview.status).toBe(200)
    expect(productPreview.body.data.changes).toMatchObject({ created: 0, updated: 0, unchanged: 1 })
    expect(
      (await call("inventory.update", { ...count, expectedRevision: 4, quantity: 32 }, org, "newer-count")).status
    ).toBe(200)
    const completedAgain = await call(
      "product.import",
      {
        phase: "complete",
        intentId: productIntent,
        handoffId: staged.body.data.handoffId,
        sha256: productDigest
      },
      org,
      "products-complete-again"
    )
    expect(completedAgain.body.data).toEqual(productPreview.body.data)
    expect(
      (
        await call(
          "product.import.apply",
          { previewId: staged.body.data.handoffId, reviewed: true },
          org,
          "stale-product-import"
        )
      ).status
    ).toBe(400)
    expect((await call("inventory.show", { id: variant!.id }, org)).body.data.items[0].quantity).toBe(32)
    await database.update(memberships).set({ role: "member", access: {} }).where(eq(memberships.orgId, org))
    expect((await cliTransfer(transfer(access), id)).status).toBe(403)
  })
})

describe("Catalog mutations", () => {
  it("shares catalog saves, guards revisions and assignments, and rolls back failed intents", async () => {
    const supplierOrg = randomUUID(),
      customer = randomUUID()
    await database.insert(organizations).values({ id: supplierOrg, name: "Factory", kind: "supplier" })
    await database.insert(memberships).values({ orgId: supplierOrg, userId: user.id, email: user.email, role: "owner" })
    await database
      .insert(suppliers)
      .values({ id: customer, buyerOrgId: workspaceId, supplierOrgId: supplierOrg, name: "Factory" })
    const input = {
      clientReference: randomUUID(),
      title: "Trade",
      status: "draft",
      adjustmentBasisPoints: 0,
      includeNewProducts: false,
      products: [],
      customerIds: []
    }
    const created = await call("catalog.create", input, supplierOrg, "catalog-create")
    expect(created.status).toBe(200)
    const id = created.body.data.id
    expect((await call("catalog.create", input, supplierOrg, "catalog-create")).body.data.id).toBe(id)
    expect(await database.select().from(catalogs)).toHaveLength(1)
    const { clientReference: _, ...fields } = input
    const update = { ...fields, id, expectedRevision: 1, status: "archived" }
    expect((await call("catalog.update", update, supplierOrg, "archive")).body.data).toMatchObject({
      revision: 2,
      status: "archived"
    })
    expect((await call("catalog.update", update, supplierOrg, "stale")).status).toBe(409)
    const assignment = { id: customer, type: "customer", catalogId: id, expectedCatalogId: null }
    expect((await call("partners.catalog.assign", assignment, supplierOrg, "assign")).status).toBe(200)
    expect((await call("partners.catalog.assign", assignment, supplierOrg, "assign")).status).toBe(200)
    expect((await call("partners.catalog.assign", assignment, supplierOrg, "stale-assignment")).status).toBe(409)
    expect(
      (
        await call(
          "catalog.update",
          {
            ...update,
            expectedRevision: 3,
            customerIds: [randomUUID()],
            expectedAssignments: [{ customerId: customer, catalogId: id }]
          },
          supplierOrg,
          "bad-customer"
        )
      ).status
    ).toBe(400)
    expect((await call("catalog.show", { id }, supplierOrg)).body.data.revision).toBe(3)
    expect(
      (
        await call(
          "partners.catalog.remove",
          { id: customer, type: "customer", expectedCatalogId: id },
          supplierOrg,
          "remove-assignment"
        )
      ).status
    ).toBe(200)
    expect((await call("catalog.show", { id }, supplierOrg)).body.data).toMatchObject({ revision: 4, customerIds: [] })
    await database
      .update(memberships)
      .set({ role: "member", access: { catalogs: "view", prices: "view" } })
      .where(eq(memberships.orgId, supplierOrg))
    expect((await call("catalog.create", input, supplierOrg, "catalog-create")).status).toBe(404)
  })
})

describe("Operational resource reads", () => {
  it("distinguishes external Amazon shipments and reports provider outages as partial", async () => {
    await database
      .insert(connections)
      .values({ orgId: workspaceId, provider: "amazon", externalId: "SELLER", encryptedToken: "never-public" })
    vi.mocked(amazonShipments).mockResolvedValue([
      {
        shipmentId: "FBA123",
        network: "fba",
        status: "SHIPPED",
        name: "Inbound",
        createdAt: null,
        url: "https://sellercentral.amazon.com/"
      }
    ])
    const result = await call("shipment.list")
    expect(result.status).toBe(200)
    expect(result.body.data.items).toMatchObject([
      {
        origin: "external",
        id: null,
        providerReferences: [{ accountId: "SELLER", network: "fba", externalId: "FBA123" }],
        allowedActions: []
      }
    ])
    vi.mocked(amazonShipments).mockRejectedValue(new Error("sensitive upstream error"))
    const failed = await call("shipment.list")
    expect(failed.status).toBe(200)
    expect(failed.body.meta.completeness).toBe("partial")
    expect(JSON.stringify(failed.body)).not.toContain("sensitive upstream error")
    expect((await call("shipment.list", { origin: "copacker" })).body.meta.completeness).toBe("complete")
  })
  it("reads partners without invitation secrets and isolates supplier catalogs and stock", async () => {
    const supplierOrg = randomUUID(),
      partnerId = randomUUID(),
      groupId = randomUUID(),
      variantId = randomUUID(),
      catalogId = randomUUID()
    await database.insert(organizations).values({ id: supplierOrg, name: "Supplier workspace", kind: "supplier" })
    await database.insert(memberships).values({ orgId: supplierOrg, userId: user.id, email: user.email, role: "owner" })
    await database.insert(suppliers).values({
      id: partnerId,
      buyerOrgId: workspaceId,
      supplierOrgId: supplierOrg,
      name: "Factory",
      invitationHash: "secret-invitation"
    })
    const partner = await call("partners.show", { id: partnerId })
    expect(partner.status).toBe(200)
    expect(JSON.stringify(partner.body)).not.toContain("secret-invitation")
    expect((await call("partners.list", { type: "supplier" })).body.data.items).toHaveLength(1)
    expect((await call("partners.show", { id: partnerId, type: "forwarder" })).status).toBe(404)
    await database.insert(supplierProductGroups).values({ id: groupId, supplierOrgId: supplierOrg, title: "Widget" })
    await database.insert(supplierProducts).values({
      id: variantId,
      groupId,
      supplierOrgId: supplierOrg,
      supplierSku: "S1",
      title: "Widget",
      currency: "USD",
      priceMinor: 100,
      trackInventory: true,
      onHand: 24
    })
    await database.insert(catalogs).values({ id: catalogId, supplierOrgId: supplierOrg, title: "Wholesale" })
    await database.insert(catalogProducts).values({ catalogId, productId: variantId })
    await database.update(suppliers).set({ catalogId }).where(eq(suppliers.id, partnerId))
    expect((await call("catalog.show", { id: catalogId }, supplierOrg)).body.data).toMatchObject({
      customerIds: [partnerId],
      products: [{ variantId }]
    })
    expect((await call("catalog.list", {}, supplierOrg)).body.data.items).toHaveLength(1)
    expect((await call("catalog.show", { id: catalogId })).status).toBe(404)
    expect((await call("partners.list", { type: "customer" }, supplierOrg)).body.data.items).toMatchObject([
      { id: partnerId, catalogId }
    ])
    expect((await call("product.show", { id: groupId }, supplierOrg)).body.data).toMatchObject({
      identityBasis: "copacker",
      variants: [{ id: variantId }]
    })
    expect((await call("inventory.list", {}, supplierOrg)).body.data.items).toContainEqual(
      expect.objectContaining({ quantityState: "available", quantity: 24, unit: "piece" })
    )
    await database
      .update(memberships)
      .set({ role: "member", access: { products: "view", inventory: "view", customers: "view" } })
      .where(eq(memberships.orgId, supplierOrg))
    expect((await call("catalog.list", {}, supplierOrg)).status).toBe(404)
    expect((await call("partners.show", { id: partnerId }, supplierOrg)).body.data.catalogId).toBeNull()
  })
  it("shares PO and shipment visibility, hides supplier drafts and redacts commercial fields", async () => {
    const supplierOrg = randomUUID(),
      supplierId = randomUUID(),
      poId = randomUUID(),
      shipmentId = randomUUID()
    await database.insert(organizations).values({ id: supplierOrg, name: "Supplier", kind: "supplier" })
    await database.insert(memberships).values({ orgId: supplierOrg, userId: user.id, email: user.email, role: "owner" })
    await database
      .insert(suppliers)
      .values({ id: supplierId, buyerOrgId: workspaceId, supplierOrgId: supplierOrg, name: "Factory" })
    const data = orderInputSchema.parse({
      supplierId,
      reference: "PO-READ",
      currency: "USD",
      items: [
        {
          id: randomUUID(),
          variantId: "gid://shopify/ProductVariant/1",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          name: "Widget",
          variant: "Default Title",
          buyerSku: "SKU-1",
          supplierSku: "SUP-1",
          asin: "",
          fnsku: "",
          pieces: 10,
          piecesPerSet: 1,
          unitPrice: 250,
          receiver: "fba"
        }
      ]
    })
    await database
      .insert(orders)
      .values({ id: poId, buyerOrgId: workspaceId, supplierId, shopifyDomain: "shop.myshopify.com", data })
    await database.insert(shipments).values({ id: shipmentId, orderId: poId, orderRevision: 1 })
    expect((await call("po.show", { id: poId })).body.data.lines[0].unitPriceMinor).toBe(250)
    expect((await call("po.show", { id: poId }, supplierOrg)).status).toBe(404)
    expect((await call("shipment.show", { id: shipmentId }, supplierOrg)).status).toBe(404)
    await database.update(orders).set({ status: "submitted" }).where(eq(orders.id, poId))
    expect((await call("po.list", { state: "sent" }, supplierOrg)).body.data.items).toHaveLength(1)
    expect((await call("shipment.list", { origin: "copacker" }, supplierOrg)).body.data.items).toHaveLength(1)
    expect((await call("shipment.show", { id: shipmentId }, supplierOrg)).body.data.poId).toBe(poId)
    await database.update(orders).set({ status: "closed" }).where(eq(orders.id, poId))
    expect((await call("po.show", { id: poId })).body.data.state).toBe("closed")
    await database.execute(sql`update orders set status = 'unsupported' where id = ${poId}::uuid`)
    expect((await call("po.list")).body.error.code).toBe("source_invalid")
    await database.update(orders).set({ status: "submitted" }).where(eq(orders.id, poId))
    await database
      .update(memberships)
      .set({ role: "member", access: { orders: "view" } })
      .where(eq(memberships.orgId, workspaceId))
    const redacted = await call("po.show", { id: poId })
    expect(redacted.body.data.lines[0].unitPriceMinor).toBeNull()
    expect(redacted.body.meta.redactedFields).toContain("lines.unitPriceMinor")
    expect((await call("shipment.list")).status).toBe(404)
    await database.update(suppliers).set({ removedAt: new Date() }).where(eq(suppliers.id, supplierId))
    expect((await call("po.show", { id: poId }, supplierOrg)).status).toBe(404)
  })
  it("reads customer orders separately from POs and binds them to the current connection", async () => {
    const orderId = randomUUID()
    await database.insert(salesOrders).values({
      id: orderId,
      orgId: workspaceId,
      source: "shopify",
      externalAccountId: "shop.myshopify.com",
      orderId: "gid://shopify/Order/1",
      orderedAt: new Date("2026-10-01"),
      data: {
        id: "gid://shopify/Order/1",
        name: "#1043",
        tags: [],
        createdAt: "2026-10-01T00:00:00Z",
        cancelledAt: null,
        lines: [],
        fulfillments: [],
        transactions: [],
        test: false,
        sourceName: "web"
      }
    })
    // Unrelated orders must be filtered before the 10,000-row read limit and before summary parsing.
    await database.execute(sql`insert into sales_orders ("orgId", source, "externalAccountId", "orderId", "orderedAt", data)
      select ${workspaceId}::uuid, 'shopify', 'shop.myshopify.com', 'noise-' || n, '2020-01-01'::timestamptz,
      '{"tags":[]}'::jsonb from generate_series(1, 10001) n`)
    const row = await call("order.show", { reference: "#1043", connectionId })
    expect(row.status).toBe(200)
    expect(row.body.data.id).toBe(orderId)
    expect(row.body.meta.completeness).toBe("partial")
    expect((await call("order.list", { from: "2026-10-01", to: "2026-10-01" })).body.data.items).toHaveLength(1)
    expect((await call("order.list", { from: "2026-10-01" })).status).toBe(400)
    expect((await call("order.show", { id: orderId })).status).toBe(200)
    await database.update(memberships).set({ role: "member", access: { sales: "view" } })
    expect((await call("order.show", { id: orderId })).body.data.netProductSales).toBeNull()
    await database.update(connections).set({ externalId: "other.myshopify.com" })
    expect((await call("order.show", { id: orderId })).status).toBe(404)
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
  it("guards supplier assignment while preserving product settings and checking current access", async () => {
    await catalog()
    const product = (await call("product.list")).body.data.items[0]
    const settings = (await call("product.settings.show", { id: product.id })).body.data
    expect(
      (
        await call(
          "product.update",
          {
            ...settings,
            fields: { ...settings.fields, description: "Keep this description", minimumOrder: 12 }
          },
          workspaceId,
          "initial-settings"
        )
      ).status
    ).toBe(200)
    const supplierId = randomUUID(),
      foreignSupplier = randomUUID()
    await database.insert(suppliers).values([
      { id: supplierId, buyerOrgId: workspaceId, name: "Current maker" },
      { id: foreignSupplier, buyerOrgId: otherId, name: "Other workspace maker" }
    ])
    await database
      .update(memberships)
      .set({ role: "member", access: { products: "edit" } })
      .where(eq(memberships.orgId, workspaceId))
    const input = { id: product.id, supplierId, expectedRevision: 1 }
    const saved = await call("product.supplier.assign", input, workspaceId, "assign-supplier")
    expect(saved.status).toBe(200)
    expect(saved.body.data).toEqual({ id: product.id, revision: 2 })
    expect((await call("product.supplier.assign", input, workspaceId, "assign-supplier")).body.data).toEqual(
      saved.body.data
    )
    expect((await call("product.settings.show", { id: product.id })).body.data.fields).toMatchObject({
      supplierId,
      description: "Keep this description",
      minimumOrder: 12,
      expectedRevision: 2
    })
    expect((await call("product.supplier.assign", input, workspaceId, "stale-supplier")).status).toBe(409)
    expect(
      (
        await call(
          "product.supplier.assign",
          { ...input, expectedRevision: 2, supplierId: foreignSupplier },
          workspaceId,
          "foreign-supplier"
        )
      ).status
    ).toBe(409)
    await database.update(suppliers).set({ removedAt: new Date() }).where(eq(suppliers.id, supplierId))
    expect(
      (
        await call(
          "product.supplier.assign",
          { ...input, expectedRevision: 2 },
          workspaceId,
          "removed-current-supplier"
        )
      ).status
    ).toBe(409)
    expect(
      (
        await call(
          "product.supplier.assign",
          { ...input, expectedRevision: 2, supplierId: null },
          workspaceId,
          "clear-supplier"
        )
      ).body.data.revision
    ).toBe(3)
    expect(
      (await call("product.supplier.assign", { ...input, expectedRevision: 3 }, workspaceId, "removed-supplier")).status
    ).toBe(409)
    await database.update(connections).set({ externalId: "replacement.myshopify.com" })
    expect(
      (await call("product.supplier.assign", { ...input, expectedRevision: 3 }, workspaceId, "old-account")).status
    ).toBe(404)
    await database.update(memberships).set({ access: { products: "view" } })
    expect((await call("product.supplier.assign", input, workspaceId, "assign-supplier")).status).toBe(404)
  })
  it("shares revision-checked target editing with idempotent CLI receipts and current Product permissions", async () => {
    await catalog()
    const selection = { accountId: "shop.myshopify.com", variantId: "gid://shopify/ProductVariant/1" }
    const before = await call("variant.stock-targets.show", selection)
    expect(before.status).toBe(200)
    expect(before.body.data).toMatchObject({ revision: 0, targets: [] })
    const group = {
      id: randomUUID(),
      name: "Main warehouse",
      locations: [before.body.data.locations[0].ref],
      expectedRevision: 0
    }
    expect((await call("location.group.save", group)).body.error.code).toBe("idempotency_key_required")
    const created = await call("location.group.save", group, workspaceId, "group-create")
    expect(created.status).toBe(200)
    expect((await call("location.group.save", group, workspaceId, "group-create")).body.data).toEqual(created.body.data)
    const update = {
      ...selection,
      expectedRevision: 0,
      targets: [{ id: randomUUID(), quantity: 125, destination: { kind: "group", groupId: group.id } }]
    }
    const saved = await call("variant.stock-targets.update", update, workspaceId, "targets-save")
    expect(saved.status).toBe(200)
    expect(saved.body.data).toMatchObject({ revision: 1, targets: update.targets })
    expect((await call("variant.stock-targets.update", update, workspaceId, "targets-save")).body.data).toEqual(
      saved.body.data
    )
    expect((await call("variant.stock-targets.update", update, workspaceId, "stale-save")).body.error.code).toBe(
      "revision_conflict"
    )
    await database.update(memberships).set({ role: "member", access: { products: "view" } })
    expect((await call("variant.stock-targets.show", selection)).status).toBe(200)
    expect((await call("variant.stock-targets.update", update, workspaceId, "targets-save")).status).toBe(404)
  })

  it("exposes fixed Amazon locations and rejects every connection selection update", async () => {
    const id = randomUUID()
    await database.insert(connections).values({
      id,
      orgId: workspaceId,
      provider: "amazon",
      externalId: "seller",
      encryptedToken: "private",
      inventoryLocations: []
    })
    const before = await call("connection.inventory.show", { id })
    expect(before.status).toBe(200)
    expect(before.body.data.editable).toBe(false)
    expect(before.body.data.locations).toMatchObject([
      { name: "FBA", enabled: true, available: false },
      { name: "AWD US", enabled: true, available: false }
    ])
    const locations = before.body.data.selected
    expect(locations).toHaveLength(2)
    for (const [index, selection] of [null, [], [locations[0]], locations].entries()) {
      const updated = await call(
        "connection.inventory.update",
        {
          id,
          expectedRevision: before.body.data.revision,
          locations: selection
        },
        workspaceId,
        `fixed-amazon-${index}`
      )
      expect(updated.status).toBe(409)
      expect(updated.body.error.code).toBe("fixed_locations")
    }
    expect((await call("connection.inventory.show", { id })).body.data).toEqual(before.body.data)
    const [stored] = await database.select().from(connections).where(eq(connections.id, id))
    expect(stored).toMatchObject({ revision: before.body.data.revision, inventoryLocations: [] })
  })

  it("plans target-owned pools through the dispatcher and honors connection selections and price permissions", async () => {
    await catalog()
    const connection = await call("connection.inventory.show", { id: connectionId })
    expect(connection.status).toBe(200)
    const member = connection.body.data.locations[0].ref
    const targetId = randomUUID()
    expect(
      (
        await call(
          "variant.stock-targets.update",
          {
            accountId: "shop.myshopify.com",
            variantId: "gid://shopify/ProductVariant/1",
            expectedRevision: 0,
            targets: [{ id: targetId, quantity: 125, destination: { kind: "pool", locations: [member] } }]
          },
          workspaceId,
          "pool-save"
        )
      ).status
    ).toBe(200)
    const input = { days: 30, leadTimeDays: 45 }
    const report = await call("report.restock.targets", input)
    expect(report.status).toBe(200)
    expect(report.body.data.rows).toHaveLength(1)
    expect(report.body.data.rows[0]).toMatchObject({
      targetId,
      members: [member],
      line: { targetStock: 125, purchaseUnits: 110 }
    })
    await database.update(memberships).set({ role: "member", access: { restock: "view" } })
    const redacted = await call("report.restock.targets", input)
    expect(redacted.body.data.rows[0].line.unitCostMinor).toBeNull()
    expect(redacted.body.meta.redactedFields).toContain("rows.*.line.unitCostMinor")
    expect((await call("connection.inventory.show", { id: connectionId })).status).toBe(404)
    await database.update(memberships).set({ role: "owner", access: {} })
    expect(
      (
        await call(
          "connection.inventory.update",
          { id: connectionId, expectedRevision: connection.body.data.revision, locations: [] },
          workspaceId,
          "disable-stock"
        )
      ).status
    ).toBe(200)
    const blocked = await call("report.restock.targets", input)
    expect(blocked.body.meta.completeness).toBe("partial")
    expect(blocked.body.data.rows[0].issues).toContain("ineligible_location")
  })

  it("reads scoped products and location balances, redacts prices and invalidates changed pages", async () => {
    await catalog()
    const first = await call("product.list", { limit: 1 })
    expect(first.status).toBe(200)
    const product = first.body.data.items[0]
    expect(product).toMatchObject({
      title: "Product 1",
      identityBasis: "provider",
      source: { connectionId },
      variants: [{ price: { amountMinor: 500 } }]
    })
    const detail = (await call("product.show", { id: product.id })).body.data
    expect(detail).toMatchObject(product)
    expect(detail.variants[0].writePolicy).toMatchObject({ skuScope: "shopify_only", preflightRequired: true })
    expect((await call("product.search", { query: "SKU-2" })).body.data.items).toHaveLength(1)
    const inventory = await call("inventory.list", { variantId: product.variants[0].id })
    expect(inventory.status).toBe(200)
    expect(inventory.body.data.items).toContainEqual(
      expect.objectContaining({ quantityState: "on_hand", quantity: 20, unit: "shopify_inventory_unit", snapshotId })
    )
    expect((await call("inventory.show", { id: product.variants[0].id })).body.data.items).toHaveLength(4)
    expect((await call("location.list")).body.data.items).toHaveLength(1)
    expect((await call("product.list", { cursor: first.body.data.page.nextCursor })).status).toBe(200)
    await database.update(memberships).set({ role: "member", access: { products: "view" } })
    expect((await call("product.show", { id: product.id })).body.data.variants[0]).toMatchObject({
      price: null,
      cost: null
    })
    expect((await call("product.list", { cursor: first.body.data.page.nextCursor })).status).toBe(409)
    await database.update(connections).set({ externalId: "replacement.myshopify.com" })
    expect((await call("product.show", { id: product.id })).status).toBe(404)
    expect((await call("inventory.list")).body.meta.completeness).toBe("partial")
  })
  it("retains one report and its coverage metadata across replays", async () => {
    await catalog()
    const first = await call("report.restock", {}, workspaceId, "same-report")
    const replay = await call("report.restock", {}, workspaceId, "same-report")
    expect(first.status).toBe(200)
    expect(replay.body.data).toEqual(first.body.data)
    expect(replay.body.meta.sources).toEqual(first.body.meta.sources)
    expect(replay.body.meta.completeness).toBe(first.body.meta.completeness)
    expect(await database.select().from(restockReports)).toHaveLength(1)
    expect((await call("report.restock", { days: 10 }, workspaceId, "same-report")).status).toBe(409)
    const [receipt] = await database.select().from(operationReceipts)
    expect(receipt?.result).toEqual({ reportId: first.body.data.reportId })
    await database.update(restockReports).set({ expiresAt: new Date(0) })
    expect((await call("report.restock", {}, workspaceId, "same-report")).body.error.code).toBe("idempotency_expired")
    await database.delete(restockReports)
    expect((await call("report.restock", {}, workspaceId, "same-report")).body.error.code).toBe("idempotency_expired")
  })
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
    const response = await client.call("report.restock", {}, { idempotencyKey: "report-client" })
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
    expect(response.body.meta.warnings).not.toContainEqual(expect.objectContaining({ code: "pooled_target" }))
    expect(response.body.data.coverage.map((row: { provider: string }) => row.provider)).toEqual(["amazon"])
    await database.delete(stockSnapshots).where(eq(stockSnapshots.source, "shopify"))
    expect((await call("restock.channel.list")).body.data.items).toContainEqual(
      expect.objectContaining({
        id: "amazon",
        eligible: false,
        issues: [expect.objectContaining({ code: "source_unavailable" })]
      })
    )
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
