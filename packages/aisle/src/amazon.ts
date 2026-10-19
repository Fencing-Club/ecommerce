import { gunzipSync } from "node:zlib"
import { z } from "zod"
import type { AmazonPrep } from "./index"

export type AmazonCredentials =
  | { clientId: string; clientSecret: string; refreshToken: string }
  // Grantless operations, such as managing notification destinations, act for the app rather than a seller.
  | { clientId: string; clientSecret: string; grantlessScope: string }
const requestTimeoutMs = 30000
const reportDownloadTimeoutMs = 120000
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

export const awdInboundShipmentSchema = z.object({
  shipmentId: z.string().min(1),
  orderId: z.string().min(1),
  shipmentStatus: z.string().min(1),
  originAddress: z.record(z.string(), z.unknown()),
  destinationAddress: z.record(z.string(), z.unknown()),
  shipmentContainerQuantities: z.array(packageSchema).min(1).max(1000)
})

const fbaInbound = "/inbound/fba/2024-03-20"
const operationStarted = z.object({ operationId: z.string() })
const fbaMoney = z.object({ amount: z.number(), code: z.string() })
const fbaIncentive = z.object({ type: z.string(), value: fbaMoney }).passthrough()
export const fbaPlanSchema = z
  .object({
    inboundPlanId: z.string(),
    name: z.string(),
    status: z.string(),
    packingOptions: z.array(z.object({ packingOptionId: z.string(), status: z.string() })).optional(),
    placementOptions: z.array(z.object({ placementOptionId: z.string(), status: z.string() })).optional(),
    shipments: z.array(z.object({ shipmentId: z.string(), status: z.string() })).optional()
  })
  .passthrough()
const fbaPackingOptionSchema = z
  .object({
    packingOptionId: z.string(),
    status: z.string(),
    packingGroups: z.array(z.string()),
    fees: z.array(fbaIncentive),
    discounts: z.array(fbaIncentive),
    supportedShippingConfigurations: z
      .array(z.object({ shippingMode: z.string().optional(), shippingSolution: z.string().optional() }))
      .optional()
  })
  .passthrough()
const fbaItemSchema = z.object({ msku: z.string(), quantity: z.number().int() }).passthrough()
const fbaPlacementOptionSchema = z
  .object({
    placementOptionId: z.string(),
    status: z.string(),
    shipmentIds: z.array(z.string()),
    fees: z.array(fbaIncentive),
    discounts: z.array(fbaIncentive)
  })
  .passthrough()
const fbaShipmentSchema = z
  .object({
    shipmentId: z.string(),
    placementOptionId: z.string(),
    shipmentConfirmationId: z.string().optional(),
    status: z.string().optional(),
    selectedTransportationOptionId: z.string().optional(),
    selectedDeliveryWindow: z.object({ deliveryWindowOptionId: z.string().optional() }).passthrough().optional(),
    destination: z.object({ destinationType: z.string(), warehouseId: z.string().optional() }).passthrough()
  })
  .passthrough()
const fbaBoxSchema = z
  .object({
    packageId: z.string(),
    boxId: z.string().optional(),
    items: z.array(fbaItemSchema).optional(),
    dimensions: z
      .object({ length: z.number(), width: z.number(), height: z.number(), unitOfMeasurement: z.string() })
      .optional(),
    weight: z.object({ value: z.number(), unit: z.string() }).optional()
  })
  .passthrough()
const fbaTransportationOptionSchema = z
  .object({
    transportationOptionId: z.string(),
    shipmentId: z.string(),
    shippingMode: z.string(),
    shippingSolution: z.string(),
    preconditions: z.array(z.string()),
    carrier: z.object({ name: z.string().optional(), alphaCode: z.string().optional() }).passthrough()
  })
  .passthrough()
const fbaDeliveryWindowSchema = z
  .object({
    deliveryWindowOptionId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    availabilityType: z.string(),
    validUntil: z.string()
  })
  .passthrough()
export type FbaPackingOption = z.infer<typeof fbaPackingOptionSchema>
export type FbaPlacementOption = z.infer<typeof fbaPlacementOptionSchema>
export type FbaTransportationOption = z.infer<typeof fbaTransportationOptionSchema>
export type FbaBox = z.infer<typeof fbaBoxSchema>
export type FbaDeliveryWindow = z.infer<typeof fbaDeliveryWindowSchema>

// The North American marketplaces orders are read from: the US, Canada, Mexico and Brazil. They share one seller
// account and one endpoint; orders from the others are fulfilled from US stock (FBA remote fulfillment) or shipped by
// the seller.
export const salesMarketplaceIds = ["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2", "A1AM78C64UM0Y8", "A2Q3Y263D00KWC"]
const fbaShipmentItemsPage = z.object({
  payload: z
    .object({
      ItemData: z
        .array(
          z.object({
            ShipmentId: z.string().optional(),
            SellerSKU: z.string().min(1),
            QuantityShipped: z.number().int().nonnegative().optional(),
            QuantityReceived: z.number().int().nonnegative().optional()
          })
        )
        .max(1000)
        .optional(),
      NextToken: z.string().min(1).nullish()
    })
    .optional()
})
// FBA's shipment statuses, all but DELETED: a shipment deleted in Seller Central never existed as far as the seller is
// concerned.
const fbaShipmentStatuses = [
  "WORKING",
  "READY_TO_SHIP",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  "CHECKED_IN",
  "RECEIVING",
  "CLOSED",
  "CANCELLED",
  "ERROR"
]
const fbaShipmentsPage = z.object({
  payload: z
    .object({
      ShipmentData: z
        .array(
          z.object({
            ShipmentId: z.string().min(1),
            ShipmentName: z.string().nullish(),
            ShipmentStatus: z.string().min(1)
          })
        )
        .max(1000)
        .optional(),
      NextToken: z.string().min(1).nullish()
    })
    .optional()
})
const awdShipmentsPage = z.object({
  shipments: z
    .array(
      z.object({
        shipmentId: z.string().min(1),
        orderId: z.string().min(1),
        shipmentStatus: z.string().min(1),
        createdAt: z.string().nullish()
      })
    )
    .max(1000)
    .nullish(),
  nextToken: z.string().min(1).nullish()
})
type AwdContents = {
  products?: { sku: string; quantity: number }[] | null
  packages?: { count: number; distributionPackage: { contents: AwdContents } }[] | null
}
const awdContents: z.ZodType<AwdContents> = z.lazy(() =>
  z.object({
    products: z
      .array(z.object({ sku: z.string().min(1), quantity: z.number().int().nonnegative() }))
      .max(1000)
      .nullish(),
    packages: z
      .array(z.object({ count: z.number().int().positive(), distributionPackage: z.object({ contents: awdContents }) }))
      .max(1000)
      .nullish()
  })
)
const awdShipment = z.object({
  shipmentContainerQuantities: z
    .array(
      z.object({
        count: z.number().int().positive(),
        distributionPackage: z.object({ contents: awdContents })
      })
    )
    .max(1000)
    .nullish()
})

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string | null,
    message: string,
    public readonly retryAfterMs: number | null = null,
    public readonly operation?: string
  ) {
    super(message)
  }
}
export class ReportDeferredError extends Error {
  constructor(public readonly retryAt: Date) {
    super("Amazon report creation is waiting for its request allowance")
  }
}
export type ReportRequestPolicy = {
  acquire: (input: { reportType: string; deadline: number; assertActive?: () => Promise<void> }) => Promise<void>
  observe: (input: {
    reportType: string
    status: number
    rateLimit: number | null
    retryAfterMs: number | null
    requestId: string | null
  }) => Promise<void>
}
export class ReportProcessingError extends Error {
  constructor(public readonly hasDiagnosticDocument: boolean) {
    super("Amazon report processing failed")
  }
}
// Each collection owns its pacing and deadline; mutations never use these retries.
function stockReader(deadline: number, assertActive?: () => Promise<void>, throttleMs = 1000) {
  let nextRequestAt = 0
  return async <T>(
    read: () => Promise<T>,
    pageDeadline = deadline,
    retry = true,
    throttleFloor = throttleMs
  ): Promise<T> => {
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
        if (
          !retry ||
          !(error instanceof ProviderError) ||
          ![429, 500, 502, 503, 504].includes(error.status) ||
          attempt >= 2
        ) {
          throw error
        }
        const delay = Math.max(error.retryAfterMs ?? 0, (error.status === 429 ? throttleFloor : 1000) * 2 ** attempt)
        if (Date.now() + delay >= Math.min(deadline, pageDeadline)) {
          throw error
        }
        nextRequestAt = Math.max(nextRequestAt, Date.now() + delay)
      }
    }
  }
}
export class Amazon {
  private access?: { token: string; expires: number }
  private reportLookups = new Map<string, Promise<unknown[]>>()
  constructor(
    private credentials: AmazonCredentials,
    private transport: typeof fetch = fetch.bind(globalThis),
    private reportPolicy?: ReportRequestPolicy
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
      signal: AbortSignal.timeout(requestTimeoutMs)
    })
    if (!response.ok) {
      throw new ProviderError(response.status, null, "Amazon authorization must be renewed")
    }
    const token = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await response.json())
    this.access = { token: token.access_token, expires: Date.now() + (token.expires_in - 60) * 1000 }
    return token.access_token
  }
  async request(method: string, path: string, body?: unknown, observe?: (response: Response) => Promise<void>) {
    const response = await this.transport(`https://sellingpartnerapi-na.amazon.com${path}`, {
      method,
      headers: { "x-amz-access-token": await this.token(), "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(requestTimeoutMs)
    })
    await observe?.(response)
    if (!response.ok) {
      // Amazon explains a rejection in its errors list; the codes and messages describe the request, not seller data.
      const reasons = z
        .object({
          errors: z.array(z.object({ code: z.string(), message: z.string(), details: z.string().optional() })).max(10)
        })
        .safeParse(await response.json().catch(() => null))
      const reason = reasons.success
        ? `: ${reasons.data.errors
            .map((error) => [error.code, error.message, error.details].filter(Boolean).join(" ").slice(0, 500))
            .join("; ")}`
        : ""
      const retryAfter = response.headers.get("retry-after")
      const retryAfterMs = retryAfter === null ? NaN : Number(retryAfter) * 1000
      const delay = Number.isFinite(retryAfterMs) ? retryAfterMs : Date.parse(retryAfter ?? "") - Date.now()
      throw new ProviderError(
        response.status,
        response.headers.get("x-amzn-RequestId"),
        `Amazon request failed (${response.status})${reason}`,
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
    // Amazon echoes the cartons with empty lists and prep instructions added, so only what identifies a carton is
    // compared: how many, the SKUs and quantities in it, and its size and weight.
    const signature = (value: unknown) => {
      const { count, distributionPackage: carton } = packageSchema.parse(value)
      const { dimensions, weight } = carton.measurements
      return JSON.stringify([
        count,
        carton.type,
        carton.contents.products.map((product) => [product.sku, product.quantity]).toSorted(),
        [dimensions.length, dimensions.width, dimensions.height, dimensions.unitOfMeasurement],
        [weight.weight, weight.unitOfMeasurement]
      ])
    }
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
  // How Amazon has each SKU prepared and labeled, by SKU. SKUs Amazon doesn't list for FBA are left out.
  async prepDetails(mskus: string[]) {
    const details = new Map<string, AmazonPrep>()
    const unique = [...new Set(mskus)]
    for (let start = 0; start < unique.length; start += 100) {
      // Amazon reads only the first of repeated mskus parameters, so they're sent as one comma-separated list.
      const query = new URLSearchParams({
        marketplaceId: "ATVPDKIKX0DER",
        mskus: unique.slice(start, start + 100).join(",")
      })
      const body = z
        .object({
          mskuPrepDetails: z.array(
            z.object({
              msku: z.string(),
              prepCategory: z.string(),
              prepOwnerConstraint: z.string().optional(),
              labelOwnerConstraint: z.string().optional(),
              allOwnersConstraint: z.string().optional()
            })
          )
        })
        .parse(await this.request("GET", `${fbaInbound}/items/prepDetails?${query}`))
      for (const { msku, ...detail } of body.mskuPrepDetails) {
        details.set(msku, detail)
      }
    }
    return details
  }
  // Cancels an AWD inbound order and its shipment.
  async cancel(id: string) {
    await this.request("POST", `/awd/2024-05-09/inboundOrders/${encodeURIComponent(id)}/cancellation`)
  }

  // FBA inbound plans (Fulfillment Inbound 2024-03-20). Amazon works on most steps in the background: each returns an
  // operation to wait for with fbaOperation.
  private fbaPath(planId: string, rest = "") {
    return `${fbaInbound}/inboundPlans/${encodeURIComponent(planId)}${rest}`
  }
  private async fbaStart(method: string, path: string, body?: unknown) {
    return operationStarted.parse(await this.request(method, path, body)).operationId
  }
  // Every page of a list, following Amazon's pagination token.
  private async fbaList<T>(path: string, key: string, item: z.ZodType<T>) {
    const results: T[] = []
    let token: string | undefined
    for (let page = 0; page < 50; page++) {
      const query = new URLSearchParams({ pageSize: "20", ...(token ? { paginationToken: token } : {}) })
      const body = z
        .object({ [key]: z.array(item), pagination: z.object({ nextToken: z.string().optional() }).optional() })
        .parse(await this.request("GET", `${path}${path.includes("?") ? "&" : "?"}${query}`))
      results.push(...(body[key] as T[]))
      token = (body.pagination as { nextToken?: string } | undefined)?.nextToken
      if (!token) {
        return results
      }
    }
    throw new Error("Amazon inbound plan pagination exceeds the supported page limit")
  }
  async fbaCreatePlan(body: unknown) {
    return z
      .object({ inboundPlanId: z.string(), operationId: z.string() })
      .parse(await this.request("POST", `${fbaInbound}/inboundPlans`, body))
  }
  async fbaOperation(operationId: string) {
    return z
      .object({
        operationStatus: z.enum(["SUCCESS", "FAILED", "IN_PROGRESS"]),
        operationProblems: z.array(z.object({ code: z.string(), message: z.string(), severity: z.string() }))
      })
      .parse(await this.request("GET", `${fbaInbound}/operations/${encodeURIComponent(operationId)}`))
  }
  async fbaPlan(planId: string) {
    return fbaPlanSchema.parse(await this.request("GET", this.fbaPath(planId)))
  }
  async fbaGeneratePackingOptions(planId: string) {
    return this.fbaStart("POST", this.fbaPath(planId, "/packingOptions"))
  }
  async fbaPackingOptions(planId: string) {
    return this.fbaList(this.fbaPath(planId, "/packingOptions"), "packingOptions", fbaPackingOptionSchema)
  }
  async fbaPackingGroupItems(planId: string, packingGroupId: string) {
    return this.fbaList(
      this.fbaPath(planId, `/packingGroups/${encodeURIComponent(packingGroupId)}/items`),
      "items",
      fbaItemSchema
    )
  }
  async fbaConfirmPackingOption(planId: string, packingOptionId: string) {
    return this.fbaStart(
      "POST",
      this.fbaPath(planId, `/packingOptions/${encodeURIComponent(packingOptionId)}/confirmation`)
    )
  }
  async fbaSetPacking(planId: string, body: unknown) {
    return this.fbaStart("POST", this.fbaPath(planId, "/packingInformation"), body)
  }
  // The boxes given for a plan with fbaSetPacking; none until its packing information is set.
  async fbaPlanBoxes(planId: string) {
    return this.fbaList(this.fbaPath(planId, "/boxes"), "boxes", fbaBoxSchema)
  }
  async fbaGeneratePlacementOptions(planId: string) {
    return this.fbaStart("POST", this.fbaPath(planId, "/placementOptions"), {})
  }
  async fbaPlacementOptions(planId: string) {
    return this.fbaList(this.fbaPath(planId, "/placementOptions"), "placementOptions", fbaPlacementOptionSchema)
  }
  async fbaConfirmPlacementOption(planId: string, placementOptionId: string) {
    return this.fbaStart(
      "POST",
      this.fbaPath(planId, `/placementOptions/${encodeURIComponent(placementOptionId)}/confirmation`)
    )
  }
  async fbaShipment(planId: string, shipmentId: string) {
    return fbaShipmentSchema.parse(
      await this.request("GET", this.fbaPath(planId, `/shipments/${encodeURIComponent(shipmentId)}`))
    )
  }
  async fbaShipmentBoxes(planId: string, shipmentId: string) {
    return this.fbaList(
      this.fbaPath(planId, `/shipments/${encodeURIComponent(shipmentId)}/boxes`),
      "boxes",
      fbaBoxSchema
    )
  }
  async fbaGenerateTransportationOptions(planId: string, body: unknown) {
    return this.fbaStart("POST", this.fbaPath(planId, "/transportationOptions"), body)
  }
  async fbaTransportationOptions(planId: string, placementOptionId: string, shipmentId: string) {
    return this.fbaList(
      this.fbaPath(planId, `/transportationOptions?${new URLSearchParams({ placementOptionId, shipmentId })}`),
      "transportationOptions",
      fbaTransportationOptionSchema
    )
  }
  async fbaGenerateDeliveryWindowOptions(planId: string, shipmentId: string) {
    return this.fbaStart(
      "POST",
      this.fbaPath(planId, `/shipments/${encodeURIComponent(shipmentId)}/deliveryWindowOptions`)
    )
  }
  async fbaDeliveryWindowOptions(planId: string, shipmentId: string) {
    return this.fbaList(
      this.fbaPath(planId, `/shipments/${encodeURIComponent(shipmentId)}/deliveryWindowOptions`),
      "deliveryWindowOptions",
      fbaDeliveryWindowSchema
    )
  }
  async fbaConfirmDeliveryWindow(planId: string, shipmentId: string, deliveryWindowOptionId: string) {
    return this.fbaStart(
      "POST",
      this.fbaPath(
        planId,
        `/shipments/${encodeURIComponent(shipmentId)}/deliveryWindowOptions/${encodeURIComponent(deliveryWindowOptionId)}/confirmation`
      )
    )
  }
  async fbaConfirmTransportation(planId: string, transportationSelections: unknown[]) {
    return this.fbaStart("POST", this.fbaPath(planId, "/transportationOptions/confirmation"), {
      transportationSelections
    })
  }
  async fbaCancelPlan(planId: string) {
    return this.fbaStart("PUT", this.fbaPath(planId, "/cancellation"))
  }
  // The address of one box's label PDF, on plain paper, for a confirmed FBA shipment.
  async fbaBoxLabel(shipmentConfirmationId: string, boxId: string) {
    const query = new URLSearchParams({
      PageType: "PackageLabel_Plain_Paper",
      LabelType: "UNIQUE",
      PackageLabelsToPrint: boxId
    })
    return z
      .object({ payload: z.object({ DownloadURL: z.url() }) })
      .parse(
        await this.request(
          "GET",
          `/fba/inbound/v0/shipments/${encodeURIComponent(shipmentConfirmationId)}/labels?${query}`
        )
      ).payload.DownloadURL
  }
  /**
   * The seller's store name and the North American marketplaces it sells in that orders are read from, the US first.
   */
  async sellerAccount() {
    const participations = z
      .object({
        payload: z.array(
          z.object({
            marketplace: z.object({ id: z.string() }),
            participation: z.object({ isParticipating: z.boolean() }).optional(),
            storeName: z.string().optional()
          })
        )
      })
      .parse(await this.request("GET", "/sellers/v1/marketplaceParticipations"))
    const active = participations.payload.filter((entry) => entry.participation?.isParticipating !== false)
    const ids = new Set(active.map((entry) => entry.marketplace.id))
    const marketplaceIds = salesMarketplaceIds.filter((id) => ids.has(id))
    const home = active.find((entry) => entry.marketplace.id === marketplaceIds[0]) ?? active[0]
    return { storeName: home?.storeName || null, marketplaceIds }
  }
  /** The North American marketplaces the seller sells in that orders are read from, the US first. */
  async salesMarketplaces() {
    return (await this.sellerAccount()).marketplaceIds
  }
  /**
   * The units of each seller SKU shipped in an FBA inbound shipment, by its shipment ID (such as FBA15ABC12). Null when
   * Amazon has no such shipment.
   */
  async fbaShipmentUnits(shipmentId: string) {
    const units = new Map<string, number>()
    const tokens = new Set<string>()
    // The first page comes from the shipment; later pages from Amazon's list of shipment items, by the page token.
    let path = `/fba/inbound/v0/shipments/${encodeURIComponent(shipmentId)}/items?${new URLSearchParams({
      MarketplaceId: "ATVPDKIKX0DER"
    })}`
    for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
      let response: unknown
      try {
        response = await this.request("GET", path)
      } catch (error) {
        if (pageNumber === 0 && error instanceof ProviderError && [400, 404].includes(error.status)) {
          return null
        }
        throw error
      }
      const page = fbaShipmentItemsPage.parse(response).payload
      for (const item of page?.ItemData ?? []) {
        if (item.ShipmentId && item.ShipmentId !== shipmentId) {
          continue
        }
        const quantity = item.QuantityShipped || item.QuantityReceived || 0
        units.set(item.SellerSKU, (units.get(item.SellerSKU) ?? 0) + quantity)
      }
      const next = page?.NextToken
      if (!next || !page?.ItemData?.length) {
        return units
      }
      if (tokens.has(next)) {
        throw new Error("FBA shipment items repeated a page token")
      }
      tokens.add(next)
      path = `/fba/inbound/v0/shipmentItems?${new URLSearchParams({
        MarketplaceId: "ATVPDKIKX0DER",
        QueryType: "NEXT_TOKEN",
        NextToken: next
      })}`
    }
    throw new Error("FBA shipment items exceed the supported page limit")
  }
  /** Received quantities stay separate from sent quantities; absence never becomes zero. */
  async fbaReceiptItems(shipmentId: string) {
    const rows: { sku: string; sent: number | null; received: number | null; unit: string }[] = []
    const seen = new Set<string>()
    let path = `/fba/inbound/v0/shipments/${encodeURIComponent(shipmentId)}/items?MarketplaceId=ATVPDKIKX0DER`
    for (let n = 0; n < 50; n++) {
      const page = fbaShipmentItemsPage.parse(await this.request("GET", path)).payload
      if (!page?.ItemData) {
        throw new Error("Missing FBA receipt items")
      }
      for (const row of page.ItemData) {
        if (row.ShipmentId && row.ShipmentId !== shipmentId) {
          throw new Error("FBA receipt shipment mismatch")
        }
        rows.push({
          sku: row.SellerSKU,
          sent: row.QuantityShipped ?? null,
          received: row.QuantityReceived ?? null,
          unit: "UNITS"
        })
      }
      if (!page.NextToken) {
        return rows
      }
      if (seen.has(page.NextToken)) {
        throw new Error("FBA receipt cursor stalled")
      }
      seen.add(page.NextToken)
      path = `/fba/inbound/v0/shipmentItems?${new URLSearchParams({ MarketplaceId: "ATVPDKIKX0DER", QueryType: "NEXT_TOKEN", NextToken: page.NextToken })}`
    }
    throw new Error("FBA receipt page limit")
  }
  async awdReceiptItems(shipmentId: string, assertActive?: () => Promise<void>) {
    const read = stockReader(Date.now() + 5 * 60 * 1000, assertActive)
    const quantity = z.object({ quantity: z.number().int().nonnegative().safe(), unitOfMeasurement: z.string() })
    return z
      .object({
        shipmentId: z.literal(shipmentId),
        shipmentStatus: z.string(),
        updatedAt: z.string().optional(),
        shipmentSkuQuantities: z
          .array(
            z.object({ sku: z.string().min(1), expectedQuantity: quantity, receivedQuantity: quantity.optional() })
          )
          .optional()
      })
      .parse(
        await read(() =>
          this.request("GET", `/awd/2024-05-09/inboundShipments/${encodeURIComponent(shipmentId)}?skuQuantities=SHOW`)
        )
      )
  }
  /** Every FBA inbound shipment to the US marketplace, whoever created it, in Amazon's order. */
  async fbaShipments() {
    const shipments: Array<{ shipmentId: string; name: string | null; status: string }> = []
    const tokens = new Set<string>()
    let query = new URLSearchParams({
      QueryType: "SHIPMENT",
      MarketplaceId: "ATVPDKIKX0DER",
      ShipmentStatusList: fbaShipmentStatuses.join(",")
    })
    for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
      const page = fbaShipmentsPage.parse(await this.request("GET", `/fba/inbound/v0/shipments?${query}`)).payload
      for (const row of page?.ShipmentData ?? []) {
        shipments.push({ shipmentId: row.ShipmentId, name: row.ShipmentName || null, status: row.ShipmentStatus })
      }
      const next = page?.NextToken
      if (!next) {
        return shipments
      }
      if (tokens.has(next)) {
        throw new Error("FBA shipments repeated a page token")
      }
      tokens.add(next)
      query = new URLSearchParams({ QueryType: "NEXT_TOKEN", MarketplaceId: "ATVPDKIKX0DER", NextToken: next })
    }
    throw new Error("FBA shipments exceed the supported page limit")
  }
  /** Every AWD inbound shipment, whoever created it, newest first. */
  async awdShipments(assertActive?: () => Promise<void>) {
    const read = stockReader(Date.now() + 5 * 60 * 1000, assertActive)
    const shipments: Array<{ shipmentId: string; orderId: string; status: string; createdAt: string | null }> = []
    const tokens = new Set<string>()
    let nextToken: string | undefined
    for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
      const query = new URLSearchParams({
        sortBy: "CREATED_AT",
        sortOrder: "DESCENDING",
        maxResults: "200",
        ...(nextToken ? { nextToken } : {})
      })
      const page = awdShipmentsPage.parse(
        await read(() => this.request("GET", `/awd/2024-05-09/inboundShipments?${query}`))
      )
      for (const row of page.shipments ?? []) {
        shipments.push({
          shipmentId: row.shipmentId,
          orderId: row.orderId,
          status: row.shipmentStatus,
          createdAt: row.createdAt ?? null
        })
      }
      if (!page.nextToken) {
        return shipments
      }
      if (tokens.has(page.nextToken)) {
        throw new Error("AWD shipments repeated a page token")
      }
      tokens.add(page.nextToken)
      nextToken = page.nextToken
    }
    throw new Error("AWD shipments exceed the supported page limit")
  }
  /** Reads an existing AWD shipment, including its actual cartons and destination. Never creates or confirms it. */
  async awdInboundShipment(shipmentId: string) {
    return awdInboundShipmentSchema.parse(
      await this.request("GET", `/awd/2024-05-09/inboundShipments/${encodeURIComponent(shipmentId)}`)
    )
  }
  /**
   * The units of each seller SKU in an AWD inbound shipment, by its shipment ID (such as STAR-ABC123): each carton's
   * products times the number of those cartons. Null when Amazon has no such shipment.
   */
  async awdShipmentUnits(shipmentId: string) {
    let response: unknown
    try {
      response = await this.request("GET", `/awd/2024-05-09/inboundShipments/${encodeURIComponent(shipmentId)}`)
    } catch (error) {
      if (error instanceof ProviderError && [400, 404].includes(error.status)) {
        return null
      }
      throw error
    }
    const shipment = awdShipment.parse(response)
    const units = new Map<string, number>()
    const add = (contents: AwdContents, multiplier: number) => {
      for (const product of contents.products ?? []) {
        units.set(product.sku, (units.get(product.sku) ?? 0) + product.quantity * multiplier)
      }
      for (const inner of contents.packages ?? []) {
        add(inner.distributionPackage.contents, multiplier * inner.count)
      }
    }
    for (const container of shipment.shipmentContainerQuantities ?? []) {
      add(container.distributionPackage.contents, container.count)
    }
    return units
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
    options: {
      deadline: number
      pollMs?: number
      assertActive?: () => Promise<void>
      retryCreate?: boolean
      reuseCreatedSince?: string
      // Preserve cancellation as unavailable; callers must not interpret it as an empty document.
      reuseCancelled?: boolean
    }
  ) {
    // Report reads need minute-scale backoff; creation can remain throttled for a five-minute quota window.
    // Keep the same report ID while retrying a throttled poll/document; never recreate it to retry a read.
    const retry = stockReader(options.deadline, options.assertActive, 60000)
    const read = async <T>(operation: string, request: () => Promise<T>, retryRequest = true) => {
      try {
        return await retry(request, options.deadline, retryRequest, operation === "createReport" ? 300000 : 60000)
      } catch (error) {
        if (error instanceof ProviderError) {
          throw new ProviderError(
            error.status,
            error.requestId,
            "Amazon report request failed",
            error.retryAfterMs,
            operation
          )
        }
        throw error
      }
    }
    let reportId: string | undefined
    // Callers opt in for recovery or a documented content-refresh interval; reuse requires the exact scope.
    // getReports does not expose reportOptions, so their equivalence cannot be established here.
    if (options.reuseCreatedSince && !input.reportOptions) {
      await options.assertActive?.()
      const since = z.iso.datetime({ offset: true }).parse(options.reuseCreatedSince)
      const query = new URLSearchParams({
        reportTypes: input.reportType,
        marketplaceIds: [...input.marketplaceIds].sort().join(","),
        processingStatuses: options.reuseCancelled ? "DONE,CANCELLED" : "DONE",
        createdSince: since,
        pageSize: "100"
      })
      const key = query.toString()
      let lookup = this.reportLookups.get(key)
      if (!lookup) {
        lookup = (async () => {
          const reports: unknown[] = []
          let next: string | undefined
          const seen = new Set<string>()
          for (let page = 0; page < 10; page++) {
            const params = next ? new URLSearchParams({ nextToken: next }) : query
            const result = z
              .object({ reports: z.array(z.unknown()), nextToken: z.string().optional() })
              .parse(await read("getReports", () => this.request("GET", `/reports/2021-06-30/reports?${params}`)))
            reports.push(...result.reports)
            next = result.nextToken
            if (!next) {
              return reports
            }
            if (seen.has(next)) {
              throw new Error("Amazon report pagination did not advance")
            }
            seen.add(next)
          }
          throw new Error("Amazon report lookup exceeded its page limit")
        })()
        this.reportLookups.set(key, lookup)
      }
      let reports: unknown[]
      try {
        reports = await lookup
      } catch (error) {
        if (this.reportLookups.get(key) === lookup) {
          this.reportLookups.delete(key)
        }
        throw error
      }
      const matching = reports
        .flatMap((value) => {
          const parsed = z
            .object({
              reportId: z.string().min(1),
              reportType: z.string(),
              marketplaceIds: z.array(z.string()),
              processingStatus: z.enum(["DONE", "CANCELLED"]),
              reportDocumentId: z.string().min(1).optional(),
              createdTime: z.iso.datetime({ offset: true }),
              dataStartTime: z.iso.datetime({ offset: true }),
              dataEndTime: z.iso.datetime({ offset: true })
            })
            .safeParse(value)
          if (!parsed.success) {
            return []
          }
          const report = parsed.data
          return (report.processingStatus === "DONE"
            ? Boolean(report.reportDocumentId)
            : options.reuseCancelled === true) &&
            report.reportType === input.reportType &&
            JSON.stringify([...new Set(report.marketplaceIds)].sort()) ===
              JSON.stringify([...new Set(input.marketplaceIds)].sort()) &&
            Date.parse(report.createdTime) >= Date.parse(since) &&
            Date.parse(report.dataStartTime) === Date.parse(input.dataStartTime) &&
            Date.parse(report.dataEndTime) === Date.parse(input.dataEndTime)
            ? [report]
            : []
        })
        .sort(
          (a, b) =>
            Number(b.processingStatus === "DONE") - Number(a.processingStatus === "DONE") ||
            Date.parse(b.createdTime) - Date.parse(a.createdTime)
        )
      reportId = matching[0]?.reportId
    }
    if (!reportId) {
      // Managed creation must leave room for creation, two status reads separated by one poll interval,
      // document metadata and download, using their actual transport timeouts. This is a minimum attempt
      // budget, not a guarantee that Amazon will finish generating the report within one polling cycle.
      const processingBudget = 4 * requestTimeoutMs + reportDownloadTimeoutMs + (options.pollMs ?? 15000)
      const creationDeadline = this.reportPolicy ? options.deadline - processingBudget : options.deadline
      reportId = z.object({ reportId: z.string().min(1) }).parse(
        await read(
          "createReport",
          async () => {
            if (this.reportPolicy) {
              await this.token()
            }
            await this.reportPolicy?.acquire({
              reportType: input.reportType,
              deadline: creationDeadline,
              assertActive: options.assertActive
            })
            await options.assertActive?.()
            if (Date.now() >= creationDeadline) {
              throw new ReportDeferredError(new Date(Date.now()))
            }
            return this.request("POST", "/reports/2021-06-30/reports", input, async (response) => {
              const rate = Number(response.headers.get("x-amzn-RateLimit-Limit"))
              const retry = response.headers.get("retry-after")
              const seconds = retry === null ? NaN : Number(retry)
              const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry ?? "") - Date.now()
              await this.reportPolicy?.observe({
                reportType: input.reportType,
                status: response.status,
                rateLimit: Number.isFinite(rate) && rate > 0 ? rate : null,
                retryAfterMs: Number.isFinite(delay) ? Math.max(0, delay) : null,
                requestId: response.headers.get("x-amzn-RequestId")
              })
            })
          },
          options.retryCreate !== false && !this.reportPolicy
        )
      ).reportId
    }
    for (;;) {
      const report = z
        .object({
          processingStatus: z.enum(["IN_QUEUE", "IN_PROGRESS", "DONE", "CANCELLED", "FATAL"]),
          reportDocumentId: z.string().min(1).optional()
        })
        .parse(
          await read("getReport", () =>
            this.request("GET", `/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`)
          )
        )
      if (report.processingStatus === "CANCELLED") {
        return null
      }
      if (report.processingStatus === "FATAL") {
        throw new ReportProcessingError(Boolean(report.reportDocumentId))
      }
      if (report.processingStatus === "DONE" && report.reportDocumentId) {
        const documentId = report.reportDocumentId
        const document = z
          .object({ url: z.url(), compressionAlgorithm: z.literal("GZIP").optional() })
          .parse(
            await read("getReportDocument", () =>
              this.request("GET", `/reports/2021-06-30/documents/${encodeURIComponent(documentId)}`)
            )
          )
        const response = await read("downloadReport", async () => {
          const response = await this.transport(document.url, { signal: AbortSignal.timeout(reportDownloadTimeoutMs) })
          if (!response.ok) {
            throw new ProviderError(response.status, null, "Amazon report download failed")
          }
          return response
        })
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
  async subscribeNotifications(
    notificationType: string,
    destinationId: string,
    processingDirective?: Record<string, unknown>
  ) {
    try {
      await this.request("POST", `/notifications/v1/subscriptions/${notificationType}`, {
        payloadVersion: "1.0",
        destinationId,
        ...(processingDirective && { processingDirective })
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
  // Workers supports manual redirects; the status check below rejects them without following another host.
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(requestTimeoutMs) })
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
