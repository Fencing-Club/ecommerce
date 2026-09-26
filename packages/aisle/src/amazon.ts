import { gunzipSync } from "node:zlib"
import { z } from "zod"

export type AmazonCredentials =
  | { clientId: string; clientSecret: string; refreshToken: string }
  // Grantless operations, such as managing notification destinations, act for the app rather than a seller.
  | { clientId: string; clientSecret: string; grantlessScope: string }
const stockQuantity = z.number().int().nonnegative().safe()
const awdStockPage = z.object({
  inventory: z
    .array(
      z.object({
        sku: z.string().min(1).max(512),
        totalInboundQuantity: stockQuantity.optional(),
        totalOnhandQuantity: stockQuantity.optional(),
        inventoryDetails: z
          .object({
            availableDistributableQuantity: stockQuantity.optional(),
            reservedDistributableQuantity: stockQuantity.optional(),
            replenishmentQuantity: stockQuantity.optional()
          })
          .optional()
      })
    )
    .max(200),
  nextToken: z.string().min(1).max(16384).nullish()
})
const optionalStockQuantity = stockQuantity.optional().transform((value) => value ?? null)
const fbaStockPage = z.object({
  payload: z.object({
    granularity: z.object({ granularityType: z.literal("Marketplace"), granularityId: z.string().min(1) }),
    inventorySummaries: z
      .array(
        z.object({
          sellerSku: z.string().min(1).max(512),
          asin: z.string().min(1).max(32).optional(),
          fnSku: z.string().min(1).max(128).optional(),
          condition: z.string().min(1).max(128).optional(),
          // Informational only. Amazon sometimes sends an empty or zone-less time; an unreadable one is treated as absent
          // rather than rejecting the whole stock page.
          lastUpdatedTime: z
            .string()
            .transform((value) => (value && !Number.isNaN(Date.parse(value)) ? value : undefined))
            .optional(),
          totalQuantity: optionalStockQuantity,
          inventoryDetails: z
            .object({
              fulfillableQuantity: optionalStockQuantity,
              inboundWorkingQuantity: optionalStockQuantity,
              inboundShippedQuantity: optionalStockQuantity,
              inboundReceivingQuantity: optionalStockQuantity,
              reservedQuantity: z
                .object({
                  totalReservedQuantity: optionalStockQuantity,
                  pendingCustomerOrderQuantity: optionalStockQuantity,
                  pendingTransshipmentQuantity: optionalStockQuantity,
                  fcProcessingQuantity: optionalStockQuantity
                })
                .optional(),
              unfulfillableQuantity: z
                .object({
                  totalUnfulfillableQuantity: optionalStockQuantity,
                  customerDamagedQuantity: optionalStockQuantity,
                  warehouseDamagedQuantity: optionalStockQuantity,
                  distributorDamagedQuantity: optionalStockQuantity,
                  carrierDamagedQuantity: optionalStockQuantity,
                  defectiveQuantity: optionalStockQuantity,
                  expiredQuantity: optionalStockQuantity
                })
                .optional(),
              researchingQuantity: z
                .object({
                  totalResearchingQuantity: optionalStockQuantity,
                  researchingQuantityBreakdown: z
                    .array(
                      z.object({
                        name: z.enum([
                          "researchingQuantityInShortTerm",
                          "researchingQuantityInMidTerm",
                          "researchingQuantityInLongTerm"
                        ]),
                        quantity: stockQuantity
                      })
                    )
                    .max(3)
                    .optional()
                })
                .optional()
            })
            .optional()
        })
      )
      .max(1000)
  }),
  pagination: z.object({ nextToken: z.string().min(1).max(16384).optional() }).optional(),
  errors: z.array(z.unknown()).max(0).optional()
})
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
    message: string,
    public readonly retryAfterMs: number | null = null
  ) {
    super(message)
  }
}
// Each collection owns its pacing and deadline; mutations never use these retries.
function stockReader(deadline: number, assertActive?: () => Promise<void>) {
  let nextRequestAt = 0
  return async <T>(read: () => Promise<T>, pageDeadline = deadline): Promise<T> => {
    const check = async () => {
      await assertActive?.()
      if (Date.now() >= Math.min(deadline, pageDeadline)) {
        throw new Error("Stock collection timed out; restart the complete collection")
      }
    }
    for (let attempt = 0; ; attempt++) {
      await check()
      if (nextRequestAt >= Math.min(deadline, pageDeadline)) {
        throw new Error("Stock collection timed out; restart the complete collection")
      }
      const wait = nextRequestAt - Date.now()
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
      await check()
      nextRequestAt = Date.now() + 500
      try {
        const response = await read()
        await check()
        return response
      } catch (error) {
        if (!(error instanceof ProviderError) || ![429, 500, 502, 503, 504].includes(error.status) || attempt >= 2) {
          throw error
        }
        nextRequestAt = Math.max(nextRequestAt, Date.now() + (error.retryAfterMs ?? 1000 * 2 ** attempt))
      }
    }
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
        ...("refreshToken" in this.credentials
          ? { grant_type: "refresh_token", refresh_token: this.credentials.refreshToken }
          : { grant_type: "client_credentials", scope: this.credentials.grantlessScope }),
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
      const retryAfter = response.headers.get("retry-after")
      const retryAfterMs = retryAfter === null ? NaN : Number(retryAfter) * 1000
      const delay = Number.isFinite(retryAfterMs) ? retryAfterMs : Date.parse(retryAfter ?? "") - Date.now()
      throw new ProviderError(
        response.status,
        response.headers.get("x-amzn-RequestId"),
        `Amazon request failed (${response.status})`,
        Number.isFinite(delay) ? Math.max(0, delay) : null
      )
    }
    if (response.status === 204) {
      return null
    }
    return response.json() as Promise<unknown>
  }
  /** One complete API page, not a publishable stock snapshot. US routing only. */
  async fbaStockPage(marketplaceId: string, nextToken?: string) {
    z.literal("ATVPDKIKX0DER").parse(marketplaceId)
    z.string().min(1).max(16384).optional().parse(nextToken)
    const query = new URLSearchParams({
      details: "true",
      granularityType: "Marketplace",
      granularityId: marketplaceId,
      marketplaceIds: marketplaceId
    })
    if (nextToken !== undefined) {
      query.set("nextToken", nextToken)
    }
    const response = fbaStockPage.parse(await this.request("GET", `/fba/inventory/v1/summaries?${query}`))
    if (response.payload.granularity.granularityId !== marketplaceId) {
      throw new Error("FBA inventory response belongs to a different marketplace")
    }
    return {
      marketplaceId,
      rows: response.payload.inventorySummaries,
      nextToken: response.pagination?.nextToken ?? null
    }
  }
  async fbaStock(marketplaceId: string, assertActive?: () => Promise<void>) {
    z.literal("ATVPDKIKX0DER").parse(marketplaceId)
    const startedAt = new Date().toISOString()
    const deadline = Date.now() + 5 * 60 * 1000
    const read = stockReader(deadline, assertActive)
    const rows: (z.infer<typeof fbaStockPage>["payload"]["inventorySummaries"][number] & {
      unit: "amazon_sellable_unit"
    })[] = []
    const identities = new Set<string>(),
      tokens = new Set<string>()
    let nextToken: string | undefined
    let pageDeadline = deadline
    let bytes = 0
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const page = await read(() => this.fbaStockPage(marketplaceId, nextToken), pageDeadline)
      bytes += Buffer.byteLength(JSON.stringify(page), "utf8")
      if (bytes > 8 * 1024 * 1024 || rows.length + page.rows.length > 20000) {
        throw new Error("FBA stock collection exceeds the supported size")
      }
      for (const item of page.rows) {
        const identity = JSON.stringify([item.sellerSku, item.fnSku ?? null, item.condition ?? null])
        if (identities.has(identity)) {
          throw new Error("Amazon repeated an FBA stock identity; restart the collection")
        }
        identities.add(identity)
        rows.push({ ...item, unit: "amazon_sellable_unit" })
      }
      if (!page.nextToken) {
        rows.sort((a, b) => {
          const left = JSON.stringify([a.sellerSku, a.fnSku ?? null, a.condition ?? null])
          const right = JSON.stringify([b.sellerSku, b.fnSku ?? null, b.condition ?? null])
          if (left === right) {
            return 0
          }
          return left < right ? -1 : 1
        })
        return {
          source: "fba" as const,
          scopeKey: marketplaceId,
          startedAt,
          observedAt: new Date().toISOString(),
          rows
        }
      }
      if (tokens.has(page.nextToken)) {
        throw new Error("FBA stock pagination repeated a token")
      }
      tokens.add(page.nextToken)
      nextToken = page.nextToken
      // The provider token expires after 30 seconds. Leave a margin and fail closed.
      pageDeadline = Math.min(deadline, Date.now() + 25000)
    }
    throw new Error("FBA stock pagination exceeds the supported page limit")
  }
  /** US network stock only; creation and label methods are never called. */
  async awdStock(assertActive?: () => Promise<void>) {
    const startedAt = new Date().toISOString()
    const deadline = Date.now() + 5 * 60 * 1000
    const rows: {
      sellerSku: string
      unit: "amazon_sellable_unit"
      inbound: number | null
      onHand: number | null
      availableDistributable: number | null
      reservedDistributable: number | null
      replenishment: number | null
    }[] = []
    const skus = new Set<string>(),
      tokens = new Set<string>()
    const query = new URLSearchParams({ details: "SHOW", maxResults: "200" })
    let bytes = 0
    const read = stockReader(deadline, assertActive)
    const fetchPage = () => read(() => this.request("GET", `/awd/2024-05-09/inventory?${query}`))
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const parsed = awdStockPage.safeParse(await fetchPage())
      if (!parsed.success) {
        throw new Error("Amazon returned an invalid AWD stock page")
      }
      if (Date.now() >= deadline) {
        throw new Error("AWD stock collection timed out; no complete snapshot is available")
      }
      bytes += Buffer.byteLength(JSON.stringify(parsed.data), "utf8")
      if (bytes > 8 * 1024 * 1024) {
        throw new Error("AWD stock collection exceeds the supported size")
      }
      for (const item of parsed.data.inventory) {
        if (skus.has(item.sku)) {
          throw new Error("Amazon repeated an AWD stock SKU; restart the collection")
        }
        skus.add(item.sku)
        rows.push({
          sellerSku: item.sku,
          unit: "amazon_sellable_unit",
          inbound: item.totalInboundQuantity ?? null,
          onHand: item.totalOnhandQuantity ?? null,
          availableDistributable: item.inventoryDetails?.availableDistributableQuantity ?? null,
          reservedDistributable: item.inventoryDetails?.reservedDistributableQuantity ?? null,
          replenishment: item.inventoryDetails?.replenishmentQuantity ?? null
        })
      }
      const next = parsed.data.nextToken
      if (!next) {
        rows.sort((a, b) => {
          if (a.sellerSku === b.sellerSku) {
            return 0
          }
          return a.sellerSku < b.sellerSku ? -1 : 1
        })
        return {
          source: "awd" as const,
          scopeKey: "us" as const,
          startedAt,
          observedAt: new Date().toISOString(),
          rows
        }
      }
      if (tokens.has(next)) {
        throw new Error("AWD stock pagination repeated a token")
      }
      tokens.add(next)
      query.set("nextToken", next)
    }
    throw new Error("AWD stock pagination exceeds the supported page limit")
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
  /**
   * Requests a report and returns its text once Amazon has built it, or null when Amazon cancels it because there is
   * no data for the period. Building takes from seconds to many minutes; the caller's deadline bounds the wait.
   */
  async report(
    input: {
      reportType: string
      marketplaceIds: string[]
      dataStartTime: string
      dataEndTime: string
      reportOptions?: Record<string, string>
    },
    options: { deadline: number; pollMs?: number; assertActive?: () => Promise<void> }
  ) {
    const read = stockReader(options.deadline, options.assertActive)
    const created = z
      .object({ reportId: z.string().min(1) })
      .parse(await read(() => this.request("POST", "/reports/2021-06-30/reports", input)))
    for (;;) {
      const report = z
        .object({
          processingStatus: z.enum(["IN_QUEUE", "IN_PROGRESS", "DONE", "CANCELLED", "FATAL"]),
          reportDocumentId: z.string().min(1).optional()
        })
        .parse(
          await read(() => this.request("GET", `/reports/2021-06-30/reports/${encodeURIComponent(created.reportId)}`))
        )
      if (report.processingStatus === "CANCELLED") {
        return null
      }
      if (report.processingStatus === "FATAL") {
        throw new Error(`Amazon couldn't build the ${input.reportType} report`)
      }
      if (report.processingStatus === "DONE" && report.reportDocumentId) {
        const documentId = report.reportDocumentId
        const document = z
          .object({ url: z.url(), compressionAlgorithm: z.literal("GZIP").optional() })
          .parse(
            await read(() => this.request("GET", `/reports/2021-06-30/documents/${encodeURIComponent(documentId)}`))
          )
        const response = await read(() => this.transport(document.url, { signal: AbortSignal.timeout(120000) }))
        if (!response.ok) {
          throw new ProviderError(response.status, null, `Amazon report download failed (${response.status})`)
        }
        const bytes = Buffer.from(await response.arrayBuffer())
        return (document.compressionAlgorithm ? gunzipSync(bytes) : bytes).toString("utf8")
      }
      const wait = options.pollMs ?? 15000
      if (Date.now() + wait >= options.deadline) {
        throw new Error("Amazon is still building the report; try again later")
      }
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
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
  // The app's notification destination for an SQS queue, created the first time. Needs grantless credentials with the
  // sellingpartnerapi::notifications scope.
  async notificationDestination(queueArn: string, name: string) {
    const existing = z
      .object({
        payload: z
          .array(
            z.object({
              destinationId: z.string(),
              resource: z.object({ sqs: z.object({ arn: z.string() }).optional() }).optional()
            })
          )
          .max(100)
      })
      .parse(await this.request("GET", "/notifications/v1/destinations"))
      .payload.find((destination) => destination.resource?.sqs?.arn === queueArn)
    if (existing) {
      return existing.destinationId
    }
    return z.object({ payload: z.object({ destinationId: z.string() }) }).parse(
      await this.request("POST", "/notifications/v1/destinations", {
        name,
        resourceSpecification: { sqs: { arn: queueArn } }
      })
    ).payload.destinationId
  }
  // Subscribes the seller to a notification type at the destination. Returns false when the subscription already
  // exists there. A seller has one subscription per type for the app, so one pointing elsewhere (another environment
  // using the same app) is reported rather than taken over.
  async subscribeNotifications(notificationType: string, destinationId: string) {
    try {
      await this.request("POST", `/notifications/v1/subscriptions/${notificationType}`, {
        payloadVersion: "1.0",
        destinationId
      })
      return true
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 409) {
        throw error
      }
    }
    const current = z
      .object({ payload: z.object({ destinationId: z.string() }) })
      .parse(await this.request("GET", `/notifications/v1/subscriptions/${notificationType}`)).payload
    if (current.destinationId !== destinationId) {
      throw new Error(`Amazon already sends this seller's ${notificationType} notifications to another destination`)
    }
    return false
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
