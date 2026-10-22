import { variantIdSchema } from "@repo/copacker-marketplaces/shopify"
import { arrayIncludes } from "ts-extras"
import { z } from "zod"
import { type CoverBucket, isCoverBucket } from "./cover"
import { type Comparison, comparisons, dayKey, type PresetKey, presetGroups } from "./date-range"
import { allViews } from "./logistics-list"

// Each page's search params, typed. The page's route validates its URL with them (`validateSearch`), the page reads
// them with `Route.useSearch()`, links build them with `search`, and a server function that reads them validates
// them again. A value that doesn't fit is dropped, so an old or hand-edited link still opens the page.

// One value: a repeated key, like anything else that isn't a string, is dropped.
const one = z.string().optional().catch(undefined)
// Search text from a link, such as the header search's, trimmed and cut to what the page searches.
const searchText = (max: number) =>
  z
    .string()
    .transform((value) => value.trim().slice(0, max))
    .optional()
    .catch(undefined)
const oneOf = <T extends string>(isValue: (value: string) => value is T) =>
  z
    .custom<T>((value) => typeof value === "string" && isValue(value))
    .optional()
    .catch(undefined)
// A list view, such as ?view=closed, which the list keeps in the URL as it changes.
const listView = z.enum(allViews).optional().catch(undefined)

const presetKeys: readonly string[] = Object.values(presetGroups).flatMap((group) => group.map((preset) => preset.key))
const comparisonKeys: readonly string[] = comparisons.map((comparison) => comparison.key)
const isPreset = (value: string): value is PresetKey => arrayIncludes(presetKeys, value)
const isComparison = (value: string): value is Comparison => arrayIncludes(comparisonKeys, value)
const day = z.string().regex(dayKey).optional().catch(undefined)

// The Overview's period (a preset, or `from` and `to` days) with what it's compared with, and its channel.
export const overviewSearch = z.object({
  period: oneOf(isPreset),
  from: day,
  to: day,
  compare: oneOf(isComparison),
  channel: one
})
export type OverviewSearch = z.infer<typeof overviewSearch>

// The purchase order list's view, or a supplier's order list's tab.
export const ordersSearch = z.object({ view: listView, tab: one })
export type OrdersSearch = z.infer<typeof ordersSearch>

export const shipmentsSearch = z.object({ view: listView })
export type ShipmentsSearch = z.infer<typeof shipmentsSearch>

// A variant to start a new purchase order with: "<id>", or "<id>@<units>" for its quantity in sellable units.
const reorderVariant = z.string().refine((entry) => {
  const [id, units, ...rest] = entry.split("@")
  return variantIdSchema.safeParse(id).success && (units === undefined || /^[1-9]\d{0,5}$/.test(units)) && !rest.length
})

// Up to 100 variants to start a new purchase order with (Reorder on Products, and Restock), and the supplier and
// destination it goes to. A list with one variant that doesn't fit is dropped whole.
export const newOrderSearch = z.object({
  variant: z
    .union([z.string().transform((entry) => [entry]), z.array(z.string())])
    .pipe(z.array(reorderVariant).max(100))
    .optional()
    .catch(undefined),
  supplierId: one,
  destination: z.enum(["amazon", "warehouse"]).optional().catch(undefined),
  locationId: one
})
export type NewOrderSearch = z.infer<typeof newOrderSearch>

// The partner list's tab and search, and `add`, which opens a new partner's dialog.
export const partnersSearch = z.object({
  type: z.enum(["supplier", "forwarder"]).optional().catch(undefined),
  q: searchText(200),
  add: z.enum(["supplier", "forwarder"]).optional().catch(undefined)
})
export type PartnersSearch = z.infer<typeof partnersSearch>

// A buyer's product search, and `import`, which opens a supplier's product import.
export const productsSearch = z.object({
  q: searchText(200),
  import: z.enum(["true", "false"]).optional().catch(undefined)
})
export type ProductsSearch = z.infer<typeof productsSearch>

export const salesSearch = z.object({ q: searchText(100) })
export type SalesSearch = z.infer<typeof salesSearch>

export const inventorySearch = z.object({ tab: one })
export type InventorySearch = z.infer<typeof inventorySearch>

// A link into Restock, such as the Overview's: what to show first. `status=order` keeps to the lines to order.
export const restockSearch = z.object({
  status: z.literal("order").optional().catch(undefined),
  channel: one,
  cover: oneOf<CoverBucket>(isCoverBucket),
  q: one
})
export type RestockSearch = z.infer<typeof restockSearch>

// An unsubscribe link's address and its signature, and how a request from the page went.
export const unsubscribeSearch = z.object({ email: one, token: one, done: one, failed: one })
