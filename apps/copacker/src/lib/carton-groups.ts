import { type PackingOrder, validatePacking } from "@repo/copacker-packing-rules"
import { cartonInputSchema, type PackingDraft, packingSchema, palletInputSchema } from "@repo/copacker-shipments"
import { z } from "zod"
import { zonedDay } from "./time-zone"

// The most cartons a packing holds, as the saved packing list allows. Every pallet holds a carton, so it's the most
// pallets too.
export const maxCartons = 1000

// Counts are an editor convenience. The saved packing list still identifies every physical carton.
export const cartonGroupSchema = cartonInputSchema.extend({
  count: z.number().int().min(1).max(maxCartons),
  cartonIds: z.array(z.string()).default([])
})
// A pallet while it's edited, with blank numbers until they're entered. Pallets are checked only when the cartons are
// packed on pallets, so unchecking keeps them for the draft without blocking it.
const palletEditorSchema = palletInputSchema.extend({
  length: z.number().or(z.nan()),
  width: z.number().or(z.nan()),
  height: z.number().or(z.nan()),
  weight: z.number().or(z.nan())
})
// Finishing packing also needs a ready date of today or later in the supplier's time zone. Today is read when the form
// checks, so a form left open past midnight moves on to the next day.
export function packingEditorSchema(timeZone: string) {
  return packingSchema
    .extend({
      readyDate: packingSchema.shape.readyDate.refine(
        (date) => date >= zonedDay(Date.now(), timeZone),
        "orders.packing.readyDatePassed"
      ),
      cartons: z.array(cartonGroupSchema).min(1).max(maxCartons),
      palletized: z.boolean(),
      pallets: z.array(palletEditorSchema).max(maxCartons)
    })
    .superRefine((packing, ctx) => {
      if (!packing.palletized) {
        return
      }
      for (const [index, pallet] of packing.pallets.entries()) {
        for (const issue of palletInputSchema.safeParse(pallet).error?.issues ?? []) {
          ctx.addIssue({ code: "custom", message: issue.message, path: ["pallets", index, ...issue.path] })
        }
      }
    })
}
export type CartonGroup = z.input<typeof cartonGroupSchema>
export type PalletValue = z.input<typeof palletEditorSchema>
// The packing form's values: the cartons by configuration, and the pallets, kept while unchecked.
export type PackingValues = z.input<ReturnType<typeof packingEditorSchema>>
type DraftCarton = NonNullable<PackingDraft["cartons"]>[number]
type DraftPallet = NonNullable<PackingDraft["pallets"]>[number]

export function groupCartons(cartons: DraftCarton[] = []): CartonGroup[] {
  const groups: CartonGroup[] = []
  for (const [index, carton] of cartons.entries()) {
    const previous = groups.at(-1)
    // Keep consecutive identified cartons together, including an unfinished weight. Never combine empty new rows.
    const comparable = carton.cartonId && carton.items?.length && carton.length && carton.width && carton.height
    if (
      comparable &&
      previous &&
      previous.length === carton.length &&
      previous.width === carton.width &&
      previous.height === carton.height &&
      Object.is(previous.weight, carton.weight || Number.NaN) &&
      JSON.stringify(previous.items) === JSON.stringify(carton.items)
    ) {
      previous.count += 1
      previous.cartonIds?.push(carton.cartonId!)
      continue
    }
    groups.push({
      cartonId: carton.cartonId || String(index + 1),
      cartonIds: carton.cartonId ? [carton.cartonId] : [],
      count: 1,
      length: carton.length || Number.NaN,
      width: carton.width || Number.NaN,
      height: carton.height || Number.NaN,
      weight: carton.weight || Number.NaN,
      items: (carton.items ?? []).map((item) => ({ itemId: item.itemId ?? "", pieces: item.pieces || Number.NaN }))
    })
  }
  return groups
}

// Letter IDs: each carton configuration is a letter, as on supplier packing lists, and its cartons count from 1.
const lettered = /^([A-Z]+)(\d+)$/
const letters = (index: number): string =>
  (index < 26 ? "" : letters(Math.floor(index / 26) - 1)) + String.fromCharCode(65 + (index % 26))

// Bound unfinished input too: editing a count must not allocate an unbounded array.
const physicalCount = (count: number) => (Number.isInteger(count) && count > 0 && count <= maxCartons ? count : 1)

export function expandCartonGroups(groups: CartonGroup[]) {
  const used = new Set(groups.flatMap((group) => (group.cartonIds?.length ? group.cartonIds : [group.cartonId])))
  return groups.flatMap(({ count, cartonIds, ...carton }) => {
    const length = physicalCount(count)
    const sequence = carton.cartonId.match(lettered)
    return Array.from({ length }, (_, index) => {
      let cartonId = cartonIds?.[index] ?? (index === 0 ? carton.cartonId : "")
      // A lettered group carries on its letter's numbers (A1–A10); any other ID, or a number taken, gets a suffix.
      const next = sequence && `${sequence[1]}${Number(sequence[2]) + index}`
      if (!cartonId && next && !used.has(next)) {
        cartonId = next
        used.add(cartonId)
      }
      if (!cartonId) {
        let suffix = index + 1
        do {
          cartonId = `${carton.cartonId}-${suffix++}`
        } while (used.has(cartonId))
        used.add(cartonId)
      }
      return { ...carton, cartonId, items: carton.items.map((item) => ({ ...item })) }
    })
  })
}

// Each group's physical carton IDs, as expandCartonGroups numbers them.
export function groupCartonIds(groups: CartonGroup[]) {
  const ids = expandCartonGroups(groups).map((carton) => carton.cartonId)
  let start = 0
  return groups.map((group) => ids.slice(start, (start += physicalCount(group.count))))
}

// Each physical carton as the pallets list it: its configuration (the row it belongs to), size, weight, units and
// contents by supplier SKU.
export function palletCartons(
  groups: CartonGroup[],
  products: { id: string; name: string; supplierSku: string; buyerSku: string }[]
) {
  const ids = groupCartonIds(groups)
  return groups.flatMap((group, index) =>
    ids[index]!.map((id) => ({
      id,
      group: index,
      length: group.length,
      width: group.width,
      height: group.height,
      weight: group.weight,
      units: group.items.reduce((sum, item) => sum + (item.pieces || 0), 0),
      contents: group.items.map((content) => {
        const item = products.find((product) => product.id === content.itemId)
        return { sku: item?.supplierSku || item?.buyerSku || "", name: item?.name ?? "", pieces: content.pieces || 0 }
      })
    }))
  )
}
export type PalletCarton = ReturnType<typeof palletCartons>[number]

// The first carton of a new configuration: the next letter not yet used, numbered 1.
export function nextCartonId(groups: CartonGroup[]) {
  const used = new Set(
    groups.flatMap((group) => [group.cartonId, ...(group.cartonIds ?? [])]).map((id) => id.match(lettered)?.[1])
  )
  let index = groups.length
  while (used.has(letters(index))) {
    index++
  }
  return `${letters(index)}1`
}

export function nextPalletId(pallets: PalletValue[]) {
  const used = new Set(pallets.map((pallet) => pallet.palletId))
  let number = pallets.length + 1
  while (used.has(String(number))) {
    number++
  }
  return String(number)
}

export function editorPallets(pallets: DraftPallet[] = []): PalletValue[] {
  return pallets.map((pallet, index) => ({
    palletId: pallet.palletId || String(index + 1),
    length: pallet.length || Number.NaN,
    width: pallet.width || Number.NaN,
    height: pallet.height || Number.NaN,
    weight: pallet.weight || Number.NaN,
    stackable: pallet.stackable ?? true,
    cartonIds: pallet.cartonIds ?? []
  }))
}

export function cartonTotals(groups: CartonGroup[]) {
  return groups.reduce(
    (total, carton) => {
      // A count being typed still shows one carton, as expandCartonGroups renders it.
      const count = Number.isInteger(carton.count) && carton.count > 0 ? carton.count : 1
      return {
        cartons: total.cartons + count,
        pieces: total.pieces + count * carton.items.reduce((sum, item) => sum + (item.pieces || 0), 0)
      }
    },
    { cartons: 0, pieces: 0 }
  )
}

// Each physical carton as it saves, or none past maxCartons, since those can't save.
export function physicalCartons(groups: CartonGroup[]) {
  return cartonTotals(groups).cartons > maxCartons ? [] : expandCartonGroups(groups)
}
type PhysicalCarton = ReturnType<typeof expandCartonGroups>[number]

// The cartons, or pallets, with every field filled in, as they'd save.
export function completeCartons(cartons: readonly PhysicalCarton[]) {
  return cartons.flatMap((carton) => {
    const result = cartonInputSchema.safeParse(carton)
    return result.success ? [result.data] : []
  })
}
export function completePallets(pallets: readonly PalletValue[]) {
  return pallets.flatMap((pallet) => {
    const result = palletInputSchema.safeParse(pallet)
    return result.success ? [result.data] : []
  })
}

// The pallets as they save: each holds only cartons the packing still has.
export function packedPallets(pallets: readonly PalletValue[], cartons: readonly { cartonId: string }[]) {
  const ids = new Set(cartons.map((carton) => carton.cartonId))
  return pallets.map((pallet) => ({ ...pallet, cartonIds: pallet.cartonIds.filter((id) => ids.has(id)) }))
}

// The pieces of each product the cartons hold, by the product's line.
export function packedPieces(cartons: readonly { items: readonly { itemId: string; pieces: number }[] }[]) {
  const packed: Record<string, number> = {}
  for (const { itemId, pieces } of cartons.flatMap((carton) => carton.items)) {
    packed[itemId] = (packed[itemId] ?? 0) + (pieces || 0)
  }
  return packed
}

// The pieces of a line this shipment packs: what the purchase order has left after its other shipments.
export function piecesLeft(item: { id: string; pieces: number }, reserved: Readonly<Record<string, number>>) {
  return Math.max(0, item.pieces - (reserved[item.id] ?? 0))
}
// The pieces this shipment packs across the lines.
export function totalPiecesLeft(
  items: readonly { id: string; pieces: number }[],
  reserved: Readonly<Record<string, number>>
) {
  return items.reduce((total, item) => total + piecesLeft(item, reserved), 0)
}

// The packing rules the cartons break: validatePacking over each complete physical carton, against what the purchase
// order has left after its other shipments (`reserved`). An incomplete carton shows its own fields' errors instead, and
// past maxCartons only the limit applies.
export function checkCartons(
  order: PackingOrder,
  groups: CartonGroup[],
  reserved: Readonly<Record<string, number>>,
  packingGroups?: Readonly<Record<string, string>>
) {
  const cartons = completeCartons(physicalCartons(groups))
  return validatePacking(order, { cartons, changes: [], packingGroups }, reserved).issues
}

type Load = { length: number; width: number; height: number; weight: number }

// What a shipment's cartons come to, as Shipment details sums them up: how many, their units, and the gross weight in kg
// and volume in m³, which are its pallets' when packed on them. Weight and volume stay null until every carton, or every
// pallet, is complete.
export function cartonMeasures(groups: CartonGroup[], pallets?: readonly PalletValue[]) {
  const totals = cartonTotals(groups)
  const cartons = physicalCartons(groups)
  const loads = pallets ?? cartons
  const complete: readonly Load[] = pallets ? completePallets(pallets) : completeCartons(cartons)
  const isMeasured = loads.length > 0 && complete.length === loads.length
  return {
    cartons: totals.cartons,
    units: totals.pieces,
    weight: isMeasured ? complete.reduce((sum, load) => sum + load.weight, 0) : null,
    volume: isMeasured
      ? complete.reduce((sum, load) => sum + (load.length * load.width * load.height) / 1000000, 0)
      : null
  }
}

// Blank number fields (NaN, or null once someone empties one) are left out of drafts.
const withoutBlanks = (values: z.input<typeof packingSchema>): PackingDraft =>
  JSON.parse(
    JSON.stringify(values, (_, value) =>
      value === null || (typeof value === "number" && Number.isNaN(value)) ? undefined : value
    )
  )

// The packing as a draft saves it: each physical carton, and the pallets only when the cartons are packed on them.
export function packingDraft(values: PackingValues) {
  const cartons = expandCartonGroups(values.cartons)
  return withoutBlanks({
    ...values,
    cartons,
    pallets: values.palletized ? packedPallets(values.pallets, cartons) : undefined
  })
}
