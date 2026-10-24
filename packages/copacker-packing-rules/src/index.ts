import {
  type CartonField,
  type CartonPolicy,
  type CartonRuleIssue,
  checkCarton,
  type PolicyCarton
} from "./carton-policies"
import { checkPallet, type PalletRuleIssue, palletRuleCodes, type PolicyPallet } from "./pallet-policies"
import { type Receiver, type ReceiverId, receiverIds, receivers } from "./receivers"

// The packing rules: what cartons and pallets may be, by where they go. Each receiver's own rules are data, in its
// carton and pallet policies (carton-policies.ts, pallet-policies.ts); validatePacking checks them with the rules that
// hold wherever cartons go. The package reads purchase orders and packings by the fields below, so the app, the server,
// documents and any CLI check packing the same way.

export * from "./receivers"
export * from "./routes"
export * from "./units"

// A purchase order line as the rules read it: its product, the pieces it orders, how many make a sellable unit, its
// Amazon identifiers and the receiver it goes to.
export type PackingItem = {
  id: string
  buyerSku: string
  pieces: number
  piecesPerSet: number
  asin?: string
  fnsku?: string
  receiver: ReceiverId
}

// A purchase order as the rules read it: its lines, each with the receiver it goes to.
export type PackingOrder = { items: readonly PackingItem[] }

// A carton as the rules read it: its number, size in cm, weight in kg, and each product's pieces.
export type PackingCarton = {
  cartonId: string
  length: number
  width: number
  height: number
  weight: number
  items: readonly { itemId: string; pieces: number }[]
}

// A pallet as the rules read it: its size and weight, whether another may stand on it, and its cartons.
export type PackingPallet = PolicyPallet & { cartonIds: readonly string[] }

// A shipment's packing: its cartons, the invoice changes that come with them, and its pallets when packed on them, with
// Amazon's packing groups by SKU once Amazon has planned the shipment.
export type PackingInput = {
  cartons: readonly PackingCarton[]
  changes: readonly { itemId: string }[]
  palletized?: boolean
  pallets?: readonly PackingPallet[]
  packingGroups?: Readonly<Record<string, string>>
}

// A packing rule a carton or the whole packing breaks, as a code and the values it names, so the app can say it in each
// reader's language. The rules of where a carton goes come from its policy (see carton-policies.ts); the rest hold
// everywhere.
export type PackingRule =
  | { code: "duplicateCarton" | "mixedNetworks" | "repeatedProduct" | "unknownProduct" | "unknownChange" }
  | { code: "incompletePacks"; values: { sku: string; pack: number } }
  // The pieces the cartons hold, and what the PO has left after other shipments.
  | { code: "overQuantity"; values: { sku: string; packed: number; remaining: number } }
  | CartonRuleIssue
  // Cartons packed on pallets: each on exactly one pallet of this shipment.
  | { code: "noPallets" }
  | { code: "emptyPallet" | "duplicatePallet" | "palletMixedNetworks"; values: { pallet: string } }
  | { code: "unknownPalletCarton" | "palletCartonTwice"; values: { pallet: string; carton: string } }
  | { code: "cartonsOffPallets"; values: { count: number; cartons: string } }
  | PalletRuleIssue
// `source` is the page where the receiver states the rule an issue breaks, when it has one.
export type ValidationIssue = {
  cartonId?: string
  palletId?: string
  fields?: CartonField[]
  source?: string
} & PackingRule
// What each rule validatePacking checks itself, wherever the cartons go, asks for. A receiver's own rules describe
// themselves in its policy (CartonRule and PalletRule's `description`). A new code fails type checks until it's here.
export const packingRuleDescriptions: Record<
  Exclude<PackingRule["code"], CartonRuleIssue["code"] | PalletRuleIssue["code"]>,
  string
> = {
  duplicateCarton: "Every carton has its own ID.",
  repeatedProduct: "A carton lists each product once, with all its units.",
  mixedNetworks: "A carton to Amazon holds one network's products, FBA's or AWD's.",
  unknownProduct: "A carton holds only products on the purchase order.",
  incompletePacks: "A product sold in packs is packed in whole packs.",
  overQuantity: "The cartons hold no more of a product than the purchase order has left.",
  unknownChange: "Each invoice change names a line on the purchase order, once.",
  noPallets: "Cartons packed on pallets have pallets.",
  emptyPallet: "Every pallet holds cartons.",
  duplicatePallet: "Every pallet has its own number.",
  unknownPalletCarton: "A pallet holds only this shipment's cartons.",
  palletCartonTwice: "Each carton is on one pallet.",
  cartonsOffPallets: "Every carton packed on pallets is on a pallet.",
  palletMixedNetworks: "A pallet to Amazon holds one network's cartons, FBA's or AWD's."
}

export const palletRules = new Set<PackingRule["code"]>([
  "noPallets",
  "emptyPallet",
  "duplicatePallet",
  "unknownPalletCarton",
  "palletCartonTwice",
  "cartonsOffPallets",
  "palletMixedNetworks",
  ...palletRuleCodes
])

// Carton IDs split into runs of a sequence, such as B1, B2, B3 or D8, D9, each in the order given.
export function cartonRuns(ids: readonly string[]) {
  const runs: string[][] = []
  let previous: { prefix: string; digits: number; number: number } | undefined
  for (const id of ids) {
    const sequence = id.match(/^(.*?)(\d+)$/)
    const next = sequence && { prefix: sequence[1]!, digits: sequence[2]!.length, number: Number(sequence[2]) }
    if (
      next &&
      previous &&
      next.prefix === previous.prefix &&
      `${previous.prefix}${String(previous.number + 1).padStart(previous.digits, "0")}` === id
    ) {
      runs.at(-1)!.push(id)
    } else {
      runs.push([id])
    }
    previous = next ?? undefined
  }
  return runs
}

// A run of cartons as a packing list writes it: "D8–D9", or "B4" alone.
export const cartonRunLabel = (run: readonly string[]) => (run.length > 1 ? `${run[0]}–${run.at(-1)}` : run[0]!)

// Carton IDs as a packing list writes them, with runs of a sequence as ranges: "B4, B6, D1, D8–D9, D11".
export const cartonList = (ids: readonly string[]) => cartonRuns(ids).map(cartonRunLabel).join(", ")

// Carton IDs as a packing list writes them, the inverse of cartonList: IDs and runs (A1–A6, B1), split by commas (Chinese and Urdu ones
// too), semicolons, new lines or spaces. A run is two IDs of one sequence joined by a dash, and the second can leave
// out the letters (A1–6). Text that's an ID of `known`, such as 01-2, stays one ID. Each carton once, in the order
// written.
export function readCartonIds(text: string, cartonIds: Iterable<string>) {
  const known = new Set([...cartonIds].map((id) => id.toLowerCase()))
  const ids = new Map<string, string>()
  const read = (token: string) => (known.has(token.toLowerCase()) ? [token] : expandRun(token))
  // A run of IDs with spaces in them (Box 1–Box 3) is one run; other text with spaces is several IDs or runs.
  const readPart = (whole: string) => {
    if (known.has(whole.toLowerCase()) || !/\s/.test(whole)) {
      return read(whole)
    }
    const run = expandRun(whole)
    return run.length > 1 ? run : whole.split(/\s+/).flatMap(read)
  }
  for (const part of text.replaceAll(/\s*([–—-])\s*/g, "$1").split(/[,;，；、،؛\n\r]+/)) {
    for (const id of readPart(part.trim())) {
      if (id && !ids.has(id.toLowerCase())) {
        ids.set(id.toLowerCase(), id)
      }
    }
  }
  return [...ids.values()]
}

// A run such as A1–A6, B01–B12 or C1–4 as its IDs, or the text itself when it isn't a run of up to 1,000 cartons.
function expandRun(token: string) {
  const ends = token.split(/[–—]/).length === 2 ? token.split(/[–—]/) : token.split("-")
  const first = ends.length === 2 ? ends[0]!.match(/^(.*?)(\d+)$/) : null
  const last = ends.length === 2 ? ends[1]!.match(/^(.*?)(\d+)$/) : null
  if (!first || !last || (last[1] && last[1].toLowerCase() !== first[1]!.toLowerCase())) {
    return [token]
  }
  const [, prefix = "", digits = ""] = first
  const start = Number(digits)
  const count = Number(last[2]) - start + 1
  if (count < 2 || count > 1000) {
    return [token]
  }
  return Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(digits.length, "0")}`)
}

// Each carton on exactly one pallet, and every pallet holding cartons of this shipment.
export function validatePallets(packing: {
  cartons: readonly { cartonId: string }[]
  pallets?: readonly Pick<PackingPallet, "palletId" | "cartonIds">[]
}) {
  const issues: ValidationIssue[] = []
  const pallets = packing.pallets ?? []
  if (!pallets.length) {
    issues.push({ code: "noPallets" })
    return issues
  }
  const cartons = new Set(packing.cartons.map((carton) => carton.cartonId.toLowerCase()))
  const placed = new Set<string>()
  const palletIds = new Set<string>()
  for (const { palletId, cartonIds } of pallets) {
    const values = { pallet: palletId }
    if (palletIds.has(palletId.toLowerCase())) {
      issues.push({ palletId, code: "duplicatePallet", values })
    }
    palletIds.add(palletId.toLowerCase())
    if (!cartonIds.length) {
      issues.push({ palletId, code: "emptyPallet", values })
    }
    for (const carton of cartonIds) {
      if (!cartons.has(carton.toLowerCase())) {
        issues.push({ palletId, code: "unknownPalletCarton", values: { ...values, carton } })
      } else if (placed.has(carton.toLowerCase())) {
        issues.push({ palletId, code: "palletCartonTwice", values: { ...values, carton } })
      }
      placed.add(carton.toLowerCase())
    }
  }
  const off = packing.cartons.filter((carton) => !placed.has(carton.cartonId.toLowerCase()))
  if (off.length) {
    issues.push({
      code: "cartonsOffPallets",
      values: { count: off.length, cartons: cartonList(off.map((carton) => carton.cartonId)) }
    })
  }
  return issues
}

export function validatePacking(order: PackingOrder, packing: PackingInput, reserved: Record<string, number> = {}) {
  const issues: ValidationIssue[] = []
  const totals: Record<string, number> = {}
  const cartonIds = new Set<string>()
  // The cartons checked so far under each policy, for its rules across cartons.
  const checked = new Map<CartonPolicy, PolicyCarton[]>()
  for (const carton of packing.cartons) {
    const add = (rule: PackingRule, fields?: ValidationIssue["fields"], source?: string) =>
      issues.push({ cartonId: carton.cartonId, ...rule, ...(fields && { fields }), ...(source && { source }) })
    if (cartonIds.has(carton.cartonId.toLowerCase())) {
      add({ code: "duplicateCarton" })
    }
    cartonIds.add(carton.cartonId.toLowerCase())
    const networks = cartonReceivers(order, carton)
    if (networks.length > 1) {
      add({ code: "mixedNetworks" })
    }
    if (carton.items.length !== new Set(carton.items.map((i) => i.itemId)).size) {
      add({ code: "repeatedProduct" })
    }
    const contents: PolicyCarton["contents"] = []
    for (const content of carton.items) {
      const item = order.items.find((i) => i.id === content.itemId)
      if (!item) {
        add({ code: "unknownProduct" })
        continue
      }
      totals[item.id] = (totals[item.id] ?? 0) + content.pieces
      const units = content.pieces / item.piecesPerSet
      if (!Number.isInteger(units)) {
        add({ code: "incompletePacks", values: { sku: item.buyerSku, pack: item.piecesPerSet } })
      }
      contents.push({ item, pieces: content.pieces, units })
    }
    const policy = strictest(networks, (receiver) => receiver.cartonPolicy)
    if (policy) {
      const earlier = checked.get(policy) ?? []
      const current = { ...carton, contents }
      for (const { issue, fields, source } of checkCarton(policy, current, earlier, packing.packingGroups)) {
        add(issue, fields, source)
      }
      checked.set(policy, [...earlier, current])
    }
  }
  for (const item of order.items) {
    const packed = totals[item.id] ?? 0
    const remaining = item.pieces - (reserved[item.id] ?? 0)
    if (packed > remaining) {
      issues.push({ code: "overQuantity", values: { sku: item.buyerSku, packed, remaining } })
    }
  }
  const changedIds = new Set<string>()
  for (const change of packing.changes) {
    if (!order.items.some((i) => i.id === change.itemId) || changedIds.has(change.itemId)) {
      issues.push({ code: "unknownChange" })
    }
    changedIds.add(change.itemId)
  }
  if (packing.palletized) {
    issues.push(...validatePallets(packing), ...checkPallets(order, packing))
  }
  return { issues, totals, valid: issues.length === 0 }
}

// The policy of a carton's or pallet's receivers: its receiver's, or, when it wrongly mixes receivers, the strictest of
// theirs. A receiver without one, such as the buyer's own locations, takes any carton or pallet.
function strictest<P>(ids: readonly ReceiverId[], policyOf: (receiver: Receiver) => P | undefined) {
  const registry: Record<ReceiverId, Receiver> = receivers
  const policies = ids.flatMap((id) => {
    const policy = policyOf(registry[id])
    return policy ? [policy] : []
  })
  return policies.at(-1) ?? null
}

// The rules each pallet breaks of the policy of where its cartons go (see pallet-policies.ts). A pallet goes to one
// receiver, so it holds one receiver's cartons. The buyer's own locations and forwarders take any pallet.
export function checkPallets(
  order: Pick<PackingOrder, "items">,
  packing: {
    cartons: readonly Pick<PackingCarton, "cartonId" | "items">[]
    pallets?: readonly PackingPallet[]
  }
) {
  return (packing.pallets ?? []).flatMap((pallet): ValidationIssue[] => {
    const cartons = packing.cartons.filter((carton) =>
      pallet.cartonIds.some((id) => id.toLowerCase() === carton.cartonId.toLowerCase())
    )
    const networks = receiverIds.filter((id) => cartons.some((carton) => cartonReceivers(order, carton).includes(id)))
    const mixed: ValidationIssue[] =
      networks.length > 1
        ? [{ palletId: pallet.palletId, code: "palletMixedNetworks", values: { pallet: pallet.palletId } }]
        : []
    const policy = strictest(networks, (receiver) => receiver.palletPolicy)
    return [
      ...mixed,
      ...(policy
        ? checkPallet(policy, pallet).map(({ issue, fields, source }) => ({
            palletId: pallet.palletId,
            ...issue,
            fields,
            ...(source && { source })
          }))
        : [])
    ]
  })
}

// The receivers a carton's products go to, in registry order. A carton should have exactly one.
export function cartonReceivers(order: Pick<PackingOrder, "items">, carton: Pick<PackingCarton, "items">) {
  const ids = new Set(
    carton.items.flatMap((content) => {
      const item = order.items.find((row) => row.id === content.itemId)
      return item ? [item.receiver] : []
    })
  )
  return receiverIds.filter((id) => ids.has(id))
}
