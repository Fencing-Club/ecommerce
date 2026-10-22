import { minorUnits } from "@repo/copacker-marketplaces/sales"
import { z } from "zod"

const record = z.record(z.string(), z.unknown())
const records = z.array(record)
const text = z.string().min(1)
const amount = z.object({ currencyCode: text, currencyAmount: z.union([z.number(), z.string()]) })
const input = z.object({
  transactionId: text,
  orderId: text.nullable(),
  postedAt: z.iso.datetime({ offset: true }),
  type: text,
  currency: text,
  totalMinor: z.number().int().safe(),
  feesMinor: z.number().int().safe(),
  hasStoredOrder: z.boolean().nullable(),
  data: record
})

function objects(value: unknown) {
  return records.safeParse(value).data ?? []
}

// Match the existing importer's hundredths convention. Unsupported currencies are flagged, never combined or converted.
function money(value: unknown) {
  const parsed = amount.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const raw = parsed.data.currencyAmount
  if (typeof raw === "string" && !/^-?\d+(\.\d+)?$/.test(raw)) {
    return null
  }
  try {
    return { currency: parsed.data.currencyCode, minor: minorUnits(raw) }
  } catch {
    return null
  }
}

function sum(left: number, right: number) {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new Error("Audit amount exceeds safe integer range")
  }
  return result
}

type Group = { key: string[]; count: number; signedMinor: number }

function add(groups: Map<string, Group>, key: string[], minor = 0) {
  const identity = JSON.stringify(key)
  const group = groups.get(identity) ?? { key, count: 0, signedMinor: 0 }
  group.count++
  group.signedMinor = sum(group.signedMinor, minor)
  groups.set(identity, group)
}

function sorted(groups: Map<string, Group>) {
  return [...groups.values()].toSorted((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)))
}

/** Inventories stored evidence; it does not classify business profit or assert product attribution. */
export function amazonFinanceAudit() {
  const transactions = new Map<string, Group>()
  const fees = new Map<string, Group>()
  const breakdowns = new Map<string, Group>()
  const identifiers = new Map<string, Group>()
  const issues = new Map<string, { count: number; examples: string[] }>()
  let count = 0
  let firstPostedAt: string | null = null
  let lastPostedAt: string | null = null

  function inspect(raw: unknown) {
    const row = input.parse(raw)
    const reported = new Set<string>()
    function issue(name: string) {
      if (reported.has(name)) {
        return
      }
      reported.add(name)
      const entry = issues.get(name) ?? { count: 0, examples: [] }
      entry.count++
      if (entry.examples.length < 5) {
        entry.examples.push(row.transactionId)
      }
      issues.set(name, entry)
    }
    const postedAt = new Date(row.postedAt).toISOString()
    count++
    if (!firstPostedAt || postedAt < firstPostedAt) {
      firstPostedAt = postedAt
    }
    if (!lastPostedAt || postedAt > lastPostedAt) {
      lastPostedAt = postedAt
    }
    const status = text.safeParse(row.data.transactionStatus).data ?? "unspecified"
    const description = text.safeParse(row.data.description).data ?? "unspecified"
    add(transactions, [row.currency, row.type, status, description], row.totalMinor)
    add(fees, [row.currency, row.type, status], row.feesMinor)
    if (!row.orderId) {
      issue("noOrderReference")
    } else if (row.hasStoredOrder === false) {
      issue("orderNotInStoredSales")
    }
    if (!["USD", "CAD", "MXN", "BRL"].includes(row.currency)) {
      issue("currencyConventionNeedsReview")
    }
    const total = money(row.data.totalAmount)
    if (!total) {
      issue("missingOrInvalidPayloadTotal")
    } else if (total.currency !== row.currency || total.minor !== row.totalMinor) {
      issue("storedTotalDiffersFromPayload")
    }

    function references(value: unknown, scope: "transaction" | "item") {
      for (const ref of objects(value)) {
        const name = text.safeParse(scope === "item" ? ref.itemRelatedIdentifierName : ref.relatedIdentifierName).data
        const value = text.safeParse(
          scope === "item" ? ref.itemRelatedIdentifierValue : ref.relatedIdentifierValue
        ).data
        if (!name || !value) {
          issue("invalidIdentifier")
          continue
        }
        add(identifiers, [scope, name])
        if (scope === "transaction" && name === "DEFERRED_TRANSACTION_ID") {
          issue("deferredReleasePresent")
        }
      }
    }
    references(row.data.relatedIdentifiers, "transaction")
    const items = objects(row.data.items)
    if (!items.length) {
      issue("noItemDetail")
    }
    let hasProductReference = false
    for (const item of items) {
      references(item.relatedIdentifiers, "item")
      for (const context of objects(item.contexts)) {
        if (text.safeParse(context.sku).success || text.safeParse(context.asin).success) {
          hasProductReference = true
        }
      }
    }
    if (!hasProductReference) {
      issue("noItemSkuOrAsin")
    }

    // Each level is evidence, not an additive ledger: a parent includes its children, and item and transaction trees overlap.
    function walk(value: unknown, path: string[], depth = 0) {
      if (value === null || value === undefined) {
        return
      }
      if (depth > 20) {
        issue("breakdownDepthLimit")
        return
      }
      const parsed = records.safeParse(value)
      if (!parsed.success) {
        issue("invalidBreakdownList")
        return
      }
      for (const entry of parsed.data) {
        const name = text.safeParse(entry.breakdownType).data ?? "unspecified"
        const next = [...path, name]
        const value = money(entry.breakdownAmount)
        if (value) {
          add(breakdowns, [value.currency, ...next], value.minor)
        } else {
          add(breakdowns, ["unknown", ...next])
          issue("breakdownWithoutValidAmount")
        }
        walk(entry.breakdowns, next, depth + 1)
      }
    }
    walk(row.data.breakdowns, ["transaction"])
    for (const item of items) {
      walk(item.breakdowns, ["item"])
    }

    const roots = objects(row.data.breakdowns)
    if (!roots.length) {
      issue("noTransactionBreakdown")
    } else {
      const amounts = roots.map((entry) => money(entry.breakdownAmount))
      if (amounts.every((value) => value !== null) && amounts.every((value) => value.currency === row.currency)) {
        const rootSum = amounts.reduce((total, value) => sum(total, value.minor), 0)
        if (rootSum !== row.totalMinor) {
          issue("topLevelBreakdownDiffersFromTotal")
        }
      } else {
        issue("topLevelReconciliationUnavailable")
      }
    }
  }

  function report() {
    return {
      transactionCount: count,
      observedPostingRange: { first: firstPostedAt, last: lastPostedAt },
      transactions: sorted(transactions),
      storedFees: sorted(fees),
      breakdowns: sorted(breakdowns),
      identifiers: sorted(identifiers),
      issues: [...issues.entries()]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ({ name, ...value })),
      notes: [
        "Observed dates do not prove complete coverage. Compare with the separate sync coverage record.",
        "Transaction totals are raw signed cash/event amounts, not profit; releases and cash movements remain included.",
        "Stored fees use the existing importer's positive-charge convention and deferred-release exclusions.",
        "Breakdown rows overlap across depths and item/transaction scopes. Never sum this table as costs.",
        "Missing order or product references can be legitimate account-level charges; product matching is not checked.",
        "Amounts use the existing importer's hundredths convention, without FX conversion. Review flagged currencies.",
        "Issue counts are transactions, with at most five example transaction IDs per issue."
      ]
    }
  }
  return { inspect, report }
}
