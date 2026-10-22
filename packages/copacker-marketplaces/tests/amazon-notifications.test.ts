import { describe, expect, it, vi } from "vitest"
import { Amazon, ProviderError } from "../src/amazon"
import { collectUpdatedAmazonSales } from "../src/sales"

type Call = { method: string; url: URL; body: unknown }
// Answers each Selling Partner API request in turn; token requests are recorded separately.
function client(responses: Response[], credentials: ConstructorParameters<typeof Amazon>[0]) {
  const calls: Call[] = []
  const tokenRequests: URLSearchParams[] = []
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === "api.amazon.com") {
      tokenRequests.push(new URLSearchParams(String(init?.body)))
      return Response.json({ access_token: "test", expires_in: 3600 })
    }
    calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const response = responses.shift()
    if (!response) {
      throw new Error("Unexpected request")
    }
    return response
  })
  return { api: new Amazon(credentials, transport), calls, tokenRequests }
}
const grantless = { clientId: "id", clientSecret: "secret", grantlessScope: "sellingpartnerapi::notifications" }
const seller = { clientId: "id", clientSecret: "secret", refreshToken: "refresh" }
const queueArn = "arn:aws:sqs:us-east-1:316338643347:copacker-amazon-notifications"

describe("Amazon notification setup", () => {
  it("signs in as the app for grantless operations and reuses the queue's destination", async () => {
    const { api, calls, tokenRequests } = client(
      [
        Response.json({
          payload: [
            { destinationId: "other", resource: { sqs: { arn: "arn:aws:sqs:us-east-1:1:other" } } },
            { destinationId: "existing", resource: { sqs: { arn: queueArn } } }
          ]
        })
      ],
      grantless
    )
    expect(await api.notificationDestination(queueArn, "copacker")).toBe("existing")
    expect(Object.fromEntries(tokenRequests[0]!)).toMatchObject({
      grant_type: "client_credentials",
      scope: "sellingpartnerapi::notifications"
    })
    expect(calls.map((call) => call.method)).toEqual(["GET"])
  })

  it("creates the destination when the queue has none", async () => {
    const { api, calls } = client(
      [Response.json({ payload: [] }), Response.json({ payload: { destinationId: "created" } })],
      grantless
    )
    expect(await api.notificationDestination(queueArn, "copacker")).toBe("created")
    expect(calls[1]).toMatchObject({
      method: "POST",
      body: { name: "copacker", resourceSpecification: { sqs: { arn: queueArn } } }
    })
  })

  it("subscribes a seller, keeps an existing subscription, and won't take over another destination's", async () => {
    const created = client([Response.json({ payload: {} })], seller)
    expect(await created.api.subscribeNotifications("ORDER_CHANGE", "dest")).toBe(true)
    expect(created.calls[0]).toMatchObject({
      method: "POST",
      body: { payloadVersion: "1.0", destinationId: "dest" }
    })
    expect(created.calls[0]!.url.pathname).toBe("/notifications/v1/subscriptions/ORDER_CHANGE")
    const filtered = client([Response.json({ payload: {} })], seller)
    await filtered.api.subscribeNotifications("ORDER_CHANGE", "dest", {
      eventFilter: { eventFilterType: "ORDER_CHANGE" }
    })
    expect(filtered.calls[0]?.body).toEqual({
      payloadVersion: "1.0",
      destinationId: "dest",
      processingDirective: { eventFilter: { eventFilterType: "ORDER_CHANGE" } }
    })

    const conflict = () => new Response(null, { status: 409 })
    const same = client([conflict(), Response.json({ payload: { destinationId: "dest" } })], seller)
    expect(await same.api.subscribeNotifications("ORDER_CHANGE", "dest")).toBe(false)
    const elsewhere = client([conflict(), Response.json({ payload: { destinationId: "dev" } })], seller)
    await expect(elsewhere.api.subscribeNotifications("ORDER_CHANGE", "dest")).rejects.toThrow("another destination")
    const failing = client([new Response(null, { status: 403 })], seller)
    await expect(failing.api.subscribeNotifications("ORDER_CHANGE", "dest")).rejects.toBeInstanceOf(ProviderError)
  })
})

describe("Amazon rejections", () => {
  it("keeps Amazon's reason for rejecting a request", async () => {
    const { api } = client(
      [
        Response.json(
          {
            errors: [
              {
                code: "InvalidInput",
                message: "Destination already exists",
                details: "EventFilter payload failed to validate"
              }
            ]
          },
          { status: 400 }
        ),
        new Response("not json", { status: 500 })
      ],
      grantless
    )
    await expect(api.request("GET", "/notifications/v1/destinations")).rejects.toThrow(
      "Amazon request failed (400): InvalidInput Destination already exists EventFilter payload failed to validate"
    )
    await expect(api.request("GET", "/notifications/v1/destinations")).rejects.toThrow(
      /^Amazon request failed \(500\)$/
    )
  })
})

describe("orders changed since a time", () => {
  it("reads by last update with prices, keeping orders placed long before", async () => {
    const order = {
      orderId: "old-order",
      createdTime: "2026-01-05T00:00:00Z",
      salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
      fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
      orderItems: [
        {
          orderItemId: "i1",
          quantityOrdered: 1,
          product: { sellerSku: "SKU" },
          fulfillment: { quantityFulfilled: 1, quantityUnfulfilled: 0 }
        }
      ]
    }
    const request = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ orders: [order] })
    expect(await collectUpdatedAmazonSales({ request }, "2026-09-25T10:00:00Z")).toEqual([order])
    const url = new URL(String(request.mock.calls[0]?.[1]), "https://example.com")
    expect(url.searchParams.get("lastUpdatedAfter")).toBe("2026-09-25T10:00:00Z")
    expect(url.searchParams.get("includedData")).toBe("FULFILLMENT,PROCEEDS")
    expect(url.searchParams.has("createdAfter")).toBe(false)
    await expect(collectUpdatedAmazonSales({ request }, "yesterday")).rejects.toThrow("Invalid ISO datetime")
  })
})
