import { createSign, generateKeyPairSync } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import {
  Ebay,
  ebayAuthorizeUrl,
  ebayScopes,
  ebaySignatureHeader,
  exchangeEbayCode,
  verifyEbaySignature
} from "../src/ebay"
import { collectEbaySales } from "../src/sales"

const app = { clientId: "Copacker-PRD", clientSecret: "secret" }

function client(responses: unknown[]) {
  const calls: { url: URL; init: RequestInit | undefined }[] = []
  const tokens: URLSearchParams[] = []
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === "/identity/v1/oauth2/token") {
      tokens.push(new URLSearchParams(String(init?.body)))
      return Response.json({ access_token: "access", expires_in: 7200 })
    }
    calls.push({ url, init })
    const response = responses.shift()
    if (response === undefined) {
      throw new Error("Unexpected request")
    }
    return response instanceof Response ? response : Response.json(response)
  })
  return { api: new Ebay({ ...app, refreshToken: "refresh" }, transport), calls, tokens, transport }
}

const line = (id: string, sku: string, quantity = 1) => ({
  lineItemId: id,
  legacyItemId: "123456789",
  sku,
  title: "Fencing mask",
  quantity,
  lineItemCost: { value: "20.00", currency: "USD" },
  lineItemFulfillmentStatus: "FULFILLED"
})
const order = (orderId: string, creationDate: string, extra: Record<string, unknown> = {}) => ({
  orderId,
  creationDate,
  orderFulfillmentStatus: "FULFILLED",
  buyer: { username: "buyer_1", buyerRegistrationAddress: { fullName: "Pat Buyer" } },
  lineItems: [line(`${orderId}-1`, "MASK-M")],
  ...extra
})

describe("eBay sign-in", () => {
  it("asks for the order, identity and notification scopes and returns to the RuName", () => {
    const url = ebayAuthorizeUrl(app.clientId, "Andrew-Copacker-PRD-abc", "state-1")
    expect(url.origin).toBe("https://auth.ebay.com")
    expect(url.searchParams.get("redirect_uri")).toBe("Andrew-Copacker-PRD-abc")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(ebayScopes)
    expect(url.searchParams.get("state")).toBe("state-1")
  })

  it("trades the code for a refresh token with the app's basic credentials", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        access_token: "access",
        expires_in: 7200,
        refresh_token: "refresh",
        refresh_token_expires_in: 47304000
      })
    )
    const token = await exchangeEbayCode(app, "Andrew-Copacker-PRD-abc", "code-1", transport)
    expect(token.refreshToken).toBe("refresh")
    expect(token.refreshTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 500 * 86400000)
    const [url, init] = transport.mock.calls[0]!
    expect(String(url)).toBe("https://api.ebay.com/identity/v1/oauth2/token")
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("Copacker-PRD:secret").toString("base64")}`
    )
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "Andrew-Copacker-PRD-abc"
    })
  })

  it("explains a refused code", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "invalid_grant", error_description: "the code is expired" }, { status: 400 })
    )
    await expect(exchangeEbayCode(app, "ru", "old", transport)).rejects.toThrow(
      "eBay authorization failed (400): invalid_grant the code is expired"
    )
  })
})

describe("eBay requests", () => {
  it("refreshes the seller's token once and reads the seller's account", async () => {
    const { api, calls, tokens } = client([
      { userId: "abc123", username: "fencing_club", accountType: "BUSINESS" },
      { userId: "abc123", username: "fencing_club" }
    ])
    expect(await api.user()).toEqual({ userId: "abc123", username: "fencing_club" })
    await api.user()
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.get("grant_type")).toBe("refresh_token")
    expect(tokens[0]!.get("scope")).toBeNull()
    expect(calls[0]!.url.href).toBe("https://apiz.ebay.com/commerce/identity/v1/user/")
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer access")
  })

  it("names eBay's reasons and its retry delay", async () => {
    const { api } = client([
      Response.json(
        { errors: [{ errorId: 1100, message: "Access denied", longMessage: "Insufficient permissions" }] },
        { status: 429, headers: { "retry-after": "30" } }
      )
    ])
    const failure = await api.user().catch((error: unknown) => error)
    expect(failure).toMatchObject({ status: 429, retryAfterMs: 30000 })
    expect(String(failure)).toContain("1100 Insufficient permissions")
  })

  it("uses the app's own token for signing keys", async () => {
    const tokens: URLSearchParams[] = []
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/oauth2/token")) {
        tokens.push(new URLSearchParams(String(init?.body)))
        return Response.json({ access_token: "app", expires_in: 7200 })
      }
      return Response.json({ algorithm: "ECDSA", digest: "SHA1", key: "-----BEGIN PUBLIC KEY-----abc" })
    })
    await new Ebay(app, transport).publicKey("key-1")
    expect(Object.fromEntries(tokens[0]!)).toEqual({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope"
    })
    expect(String(transport.mock.calls[1]![0])).toBe("https://api.ebay.com/commerce/notification/v1/public_key/key-1")
  })

  it("creates a destination and reads its ID from the Location header", async () => {
    const { api, calls } = client([
      new Response(null, {
        status: 201,
        headers: { location: "https://api.ebay.com/commerce/notification/v1/destination/dest-9" }
      })
    ])
    expect(await api.createDestination("Copacker", "https://copacker.ai/api/webhooks/ebay", "token")).toBe("dest-9")
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      name: "Copacker",
      status: "ENABLED",
      deliveryConfig: { endpoint: "https://copacker.ai/api/webhooks/ebay", verificationToken: "token" }
    })
  })

  it("subscribes to a topic at the destination", async () => {
    const { api, calls } = client([new Response(null, { status: 201, headers: { location: "x/sub-1" } })])
    await api.subscribe("ORDER_CONFIRMATION", "dest-9")
    expect(calls[0]!.init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({
      topicId: "ORDER_CONFIRMATION",
      destinationId: "dest-9",
      payload: { format: "JSON", deliveryProtocol: "HTTPS" }
    })
  })
})

describe("eBay sales", () => {
  const window = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-15T00:00:00.000Z" }

  it("reads every page of the period and leaves the buyer out", async () => {
    const first = Array.from({ length: 200 }, (_, index) =>
      order(`01-${String(index).padStart(5, "0")}`, "2026-09-02T10:00:00.000Z")
    )
    const { api, calls } = client([
      { orders: first, total: 201 },
      { orders: [order("02-00001", "2026-09-14T23:59:59.000Z")], total: 201 }
    ])
    const sales = await collectEbaySales(api, window)
    expect(sales).toHaveLength(201)
    expect(calls.map((call) => call.url.searchParams.get("offset"))).toEqual(["0", "200"])
    expect(calls[0]!.url.searchParams.get("filter")).toBe(
      "creationdate:[2026-09-01T00:00:00.000Z..2026-09-15T00:00:00.000Z]"
    )
    expect(calls[0]!.url.searchParams.get("limit")).toBe("200")
    expect(sales[0]).not.toHaveProperty("buyer")
    expect(sales[0]!.lineItems[0]).toEqual(line("01-00000-1", "MASK-M"))
  })

  it("leaves out cancelled orders and one at the window's end", async () => {
    const { api } = client([
      {
        orders: [
          order("keep", "2026-09-03T00:00:00.000Z"),
          order("cancelled", "2026-09-03T00:00:00.000Z", { cancelStatus: { cancelState: "CANCELED" } }),
          order("requested", "2026-09-03T00:00:00.000Z", { cancelStatus: { cancelState: "CANCEL_REQUESTED" } }),
          order("next", "2026-09-15T00:00:00.000Z")
        ],
        total: 4
      }
    ])
    expect((await collectEbaySales(api, window)).map((sale) => sale.orderId)).toEqual(["keep", "requested"])
  })

  it("refuses an order outside the period or listed twice", async () => {
    const outside = client([{ orders: [order("old", "2026-08-01T00:00:00.000Z")], total: 1 }])
    await expect(collectEbaySales(outside.api, window)).rejects.toThrow("outside the sales window")
    const twice = client([
      { orders: [order("a", "2026-09-02T00:00:00.000Z"), order("a", "2026-09-02T00:00:00.000Z")], total: 2 }
    ])
    await expect(collectEbaySales(twice.api, window)).rejects.toThrow("Duplicate")
  })

  it("reads an empty period in one request", async () => {
    const { api, calls } = client([{ total: 0 }])
    expect(await collectEbaySales(api, window)).toEqual([])
    expect(calls).toHaveLength(1)
  })
})

describe("eBay notification signatures", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  // eBay hands its key over as PEM on one line.
  const key = publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "")
  const sign = (text: string) => createSign("sha1").update(text).sign(privateKey, "base64")
  const body = JSON.stringify({ metadata: { topic: "ORDER_CONFIRMATION" }, notification: { notificationId: "n-1" } })

  it("verifies the body eBay signed", () => {
    expect(verifyEbaySignature(body, sign(body), key)).toBe(true)
  })

  it("verifies a body reformatted in transit", () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2)
    expect(verifyEbaySignature(pretty, sign(body), key)).toBe(true)
  })

  it("refuses a changed body or a body that isn't JSON", () => {
    expect(verifyEbaySignature(body.replace("n-1", "n-2"), sign(body), key)).toBe(false)
    expect(verifyEbaySignature("not json", sign("not json"), key)).toBe(false)
  })

  it("reads the key ID and signature from the header", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "ecdsa", kid: "key-1", signature: "abc", digest: "SHA1" })
    ).toString("base64")
    expect(ebaySignatureHeader.parse(header)).toMatchObject({ kid: "key-1", signature: "abc" })
    expect(ebaySignatureHeader.safeParse("%%%").success).toBe(false)
  })
})
