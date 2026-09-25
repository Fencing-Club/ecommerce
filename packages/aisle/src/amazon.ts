import { z } from "zod"

export type AmazonCredentials = { clientId: string; clientSecret: string; refreshToken: string }
const packageSchema = z.object({
  count: z.number().int().positive(),
  distributionPackage: z
    .object({
      type: z.string(),
      contents: z.object({
        products: z.array(z.object({ sku: z.string(), quantity: z.number().int().positive() }).passthrough())
      }),
      measurements: z.object({
        dimensions: z.object({
          length: z.number(),
          width: z.number(),
          height: z.number(),
          unitOfMeasurement: z.string()
        }),
        weight: z.object({ weight: z.number(), unitOfMeasurement: z.string() })
      })
    })
    .passthrough()
})
export const amazonOrderSchema = z.object({
  orderId: z.string(),
  orderStatus: z.enum(["DRAFT", "VALIDATING", "CONFIRMED", "CLOSED", "EXPIRED", "CANCELLED"]),
  externalReferenceId: z.string().optional(),
  originAddress: z.record(z.string(), z.unknown()),
  packagesToInbound: z.array(packageSchema),
  destinationDetails: z
    .object({ shipmentId: z.string().optional(), destinationAddress: z.record(z.string(), z.unknown()).optional() })
    .optional()
})

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string | null,
    message: string
  ) {
    super(message)
  }
}
export class Amazon {
  private access?: { token: string; expires: number }
  constructor(
    private credentials: AmazonCredentials,
    private transport: typeof fetch = fetch
  ) {}
  private async token() {
    if (this.access && this.access.expires > Date.now()) {
      return this.access.token
    }
    const response = await this.transport("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.credentials.refreshToken,
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      throw new ProviderError(response.status, null, "Amazon authorization must be renewed")
    }
    const token = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await response.json())
    this.access = { token: token.access_token, expires: Date.now() + (token.expires_in - 60) * 1000 }
    return token.access_token
  }
  async request(method: string, path: string, body?: unknown) {
    const response = await this.transport(`https://sellingpartnerapi-na.amazon.com${path}`, {
      method,
      headers: { "x-amz-access-token": await this.token(), "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      throw new ProviderError(
        response.status,
        response.headers.get("x-amzn-RequestId"),
        `Amazon request failed (${response.status})`
      )
    }
    if (response.status === 204) {
      return null
    }
    return response.json() as Promise<unknown>
  }
  async eligibility(packagesToInbound: unknown[]) {
    const body = z
      .object({
        status: z.enum(["ELIGIBLE", "INELIGIBLE"]),
        ineligibilityReasons: z.array(z.object({ code: z.string(), description: z.string().optional() })).optional(),
        packagesToInbound: z.array(z.object({ status: z.string(), packageQuantity: packageSchema }))
      })
      .parse(await this.request("POST", "/awd/2024-05-09/inboundEligibility", { packagesToInbound }))
    const signature = (value: unknown) => JSON.stringify(packageSchema.parse(value))
    const expected = packagesToInbound.map(signature).sort(),
      returned = body.packagesToInbound.map((p) => signature(p.packageQuantity)).sort()
    if (JSON.stringify(expected) !== JSON.stringify(returned)) {
      throw new Error("Amazon eligibility did not match the submitted cartons")
    }
    if (
      body.status !== "ELIGIBLE" ||
      body.ineligibilityReasons?.length ||
      body.packagesToInbound.some((p) => p.status !== "ELIGIBLE")
    ) {
      throw new Error(
        body.ineligibilityReasons?.map((i) => i.description ?? i.code).join("; ") ||
          "Amazon rejected the carton configuration"
      )
    }
    return body
  }
  async create(body: unknown) {
    return z.object({ orderId: z.string() }).parse(await this.request("POST", "/awd/2024-05-09/inboundOrders", body))
  }
  async order(id: string) {
    return amazonOrderSchema.parse(await this.request("GET", `/awd/2024-05-09/inboundOrders/${encodeURIComponent(id)}`))
  }
  async confirm(id: string) {
    await this.request("POST", `/awd/2024-05-09/inboundOrders/${encodeURIComponent(id)}/confirmation`)
  }
  async labels(id: string) {
    return z
      .object({
        labelStatus: z.enum(["GENERATING", "GENERATED", "GENERATION_FAILED", "NOT_READY"]),
        labelDownloadURL: z.url().optional()
      })
      .parse(
        await this.request(
          "GET",
          `/awd/2024-05-09/inboundShipments/${encodeURIComponent(id)}/labels?pageType=PLAIN_PAPER&formatType=PDF`
        )
      )
  }
  async listings(sellerId: string, skus: string[]) {
    const marketplaceId = "ATVPDKIKX0DER"
    const listing = z.object({
      sku: z.string(),
      summaries: z
        .array(
          z.object({
            asin: z.string().optional(),
            fnSku: z.string().optional(),
            marketplaceId: z.string()
          })
        )
        .optional()
    })
    const result = new Map<string, { asin: string; fnsku: string }>()
    const unique = [...new Set(skus.filter(Boolean))]
    if (unique.length > 150) {
      throw new Error("At most 150 Amazon SKUs can be looked up at once")
    }
    const accept = (item: z.infer<typeof listing>, expected: string[]) => {
      if (!expected.includes(item.sku)) {
        throw new Error("Amazon returned an unexpected seller SKU")
      }
      const summaries = item.summaries?.filter((s) => s.marketplaceId === marketplaceId) ?? []
      if (summaries.length > 1) {
        throw new Error("Amazon returned ambiguous listing identities")
      }
      const summary = summaries[0]
      if (!summary) {
        return
      }
      const identity = { asin: summary.asin ?? "", fnsku: summary.fnSku ?? "" }
      const previous = result.get(item.sku)
      if (previous && (previous.asin !== identity.asin || previous.fnsku !== identity.fnsku)) {
        throw new Error("Amazon listing identity changed during lookup; retry the search")
      }
      result.set(item.sku, identity)
    }
    // The batch endpoint uses comma-separated identifiers. Read literal comma SKUs by path.
    for (const sku of unique.filter((s) => s.includes(","))) {
      const item = listing.parse(
        await this.request(
          "GET",
          `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?marketplaceIds=${marketplaceId}&includedData=summaries`
        )
      )
      accept(item, [sku])
    }
    const batchable = unique.filter((s) => !s.includes(","))
    for (let offset = 0; offset < batchable.length; offset += 20) {
      const batch = batchable.slice(offset, offset + 20)
      const query = new URLSearchParams({
        marketplaceIds: marketplaceId,
        includedData: "summaries",
        identifiersType: "SKU",
        identifiers: batch.join(","),
        pageSize: "20"
      })
      const seen = new Set<string>()
      while (true) {
        const page = z
          .object({ items: z.array(listing), pagination: z.object({ nextToken: z.string().optional() }).optional() })
          .parse(await this.request("GET", `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}?${query}`))
        for (const item of page.items) {
          accept(item, batch)
        }
        const next = page.pagination?.nextToken
        if (!next) {
          break
        }
        if (seen.has(next) || seen.size >= 50) {
          throw new Error("Amazon listing pagination did not complete")
        }
        seen.add(next)
        query.set("pageToken", next)
      }
    }
    return result
  }
}
export async function downloadAmazonLabels(raw: string) {
  const url = new URL(raw)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/(^|\.)amazonaws\.com$/.test(url.hostname)
  ) {
    throw new Error("Amazon returned an unsupported label download host")
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) })
  if (!response.ok || !response.body) {
    throw new Error("Amazon label download failed")
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 32 * 1024 * 1024) {
      throw new Error("Amazon label file exceeds 32 MB")
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
