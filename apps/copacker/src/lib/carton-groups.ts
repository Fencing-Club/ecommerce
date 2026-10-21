import { cartonInputSchema, type PackingDraft, packingSchema } from "@repo/aisle"
import { z } from "zod"

// Counts are an editor convenience. The saved packing list still identifies every physical carton.
export const cartonGroupSchema = cartonInputSchema.extend({
  count: z.number().int().min(1).max(1000),
  cartonIds: z.array(z.string()).default([])
})
export const packingEditorSchema = packingSchema.extend({ cartons: z.array(cartonGroupSchema).min(1).max(1000) })
export type CartonGroup = z.input<typeof cartonGroupSchema>
type DraftCarton = NonNullable<PackingDraft["cartons"]>[number]

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

export function expandCartonGroups(groups: CartonGroup[]) {
  const used = new Set(groups.flatMap((group) => (group.cartonIds?.length ? group.cartonIds : [group.cartonId])))
  return groups.flatMap(({ count, cartonIds, ...carton }) => {
    // Bound unfinished input too: editing a count must not allocate an unbounded array.
    const length = Number.isInteger(count) && count > 0 && count <= 1000 ? count : 1
    return Array.from({ length }, (_, index) => {
      let cartonId = cartonIds?.[index] ?? (index === 0 ? carton.cartonId : "")
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

export function nextCartonId(groups: CartonGroup[]) {
  const used = new Set(groups.flatMap((group) => [group.cartonId, ...(group.cartonIds ?? [])]))
  let number = groups.length + 1
  while (used.has(String(number))) {
    number++
  }
  return String(number)
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
