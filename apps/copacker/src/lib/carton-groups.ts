import { cartonInputSchema, type PackingDraft, packingSchema, palletInputSchema } from "@repo/aisle"
import { z } from "zod"
import { zonedDay } from "./time-zone"

// Counts are an editor convenience. The saved packing list still identifies every physical carton.
export const cartonGroupSchema = cartonInputSchema.extend({
  count: z.number().int().min(1).max(1000),
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
      cartons: z.array(cartonGroupSchema).min(1).max(1000),
      palletized: z.boolean(),
      pallets: z.array(palletEditorSchema).max(1000)
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
const physicalCount = (count: number) => (Number.isInteger(count) && count > 0 && count <= 1000 ? count : 1)

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

export function cartonGroupLabel(cartons: { id: string }[]) {
  const first = cartons[0]?.id
  const sequence = first?.match(/^(.*?)(\d+)$/)
  if (sequence && cartons.length > 1) {
    const prefix = sequence[1]!
    const digits = sequence[2]!
    const start = Number(digits)
    if (
      cartons.every((carton, index) => carton.id === `${prefix}${String(start + index).padStart(digits.length, "0")}`)
    ) {
      return `${first}–${cartons.at(-1)!.id}`
    }
  }
  return cartons.map((carton) => carton.id).join(", ")
}
