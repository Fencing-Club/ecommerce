import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import { ledgerReportOptions, ledgerReportType, parseLedgerSummary } from "@repo/copacker-marketplaces/ledger"
import type { Shopify } from "@repo/copacker-marketplaces/shopify"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { salesSyncs, stockDays } from "@/db/schema"

type StockData =
  | Awaited<ReturnType<Shopify["stock"]>>
  | Awaited<ReturnType<Amazon["fbaStock"]>>
  | Awaited<ReturnType<Amazon["awdStock"]>>

const dayMs = 86400000
const marketplace = "ATVPDKIKX0DER"
export const stockHistoryDays = 365

function isoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10)
}

// Records today's sellable stock from a finished stock sync, keeping the lowest count seen today so a stockout
// between syncs still shows. AWD isn't recorded: customers buy from FBA.
export async function recordStockDays(orgId: string, externalAccountId: string, data: StockData, now = Date.now()) {
  const day = isoDay(now)
  let rows: (typeof stockDays.$inferInsert)[] = []
  if (data.source === "shopify") {
    rows = data.rows.flatMap((row) =>
      row.tracked
        ? row.levels.flatMap((level) =>
            level.available === null
              ? []
              : [
                  {
                    orgId,
                    externalAccountId,
                    pool: "shopify" as const,
                    scope: level.locationId,
                    itemKey: row.variantId,
                    day,
                    units: level.available,
                    origin: "snapshot" as const
                  }
                ]
          )
        : []
    )
  } else if (data.source === "fba") {
    rows = data.rows.flatMap((row) => {
      const units = row.inventoryDetails?.fulfillableQuantity
      return units === null || units === undefined
        ? []
        : [
            {
              orgId,
              externalAccountId,
              pool: "fba" as const,
              scope: marketplace,
              itemKey: row.sellerSku,
              day,
              units,
              origin: "snapshot" as const
            }
          ]
    })
  }
  for (let index = 0; index < rows.length; index += 500) {
    await db()
      .insert(stockDays)
      .values(rows.slice(index, index + 500))
      .onConflictDoUpdate({
        target: [
          stockDays.orgId,
          stockDays.externalAccountId,
          stockDays.pool,
          stockDays.scope,
          stockDays.itemKey,
          stockDays.day
        ],
        set: { units: sql`least(${stockDays.units}, excluded.units)` }
      })
  }
}

// The periods of ledger to read, like order syncs: recent days again (Amazon revises the last few), then older
// history backwards. Days are whole UTC days ending before today.
export function ledgerChunks(now: number, coverage: { from: Date | null; to: Date | null }) {
  const end = Math.floor(now / dayMs) * dayMs
  const start = end - stockHistoryDays * dayMs
  const size = 30 * dayMs
  const chunks: { from: Date; to: Date }[] = []
  // A range that stopped over a month ago starts over from the newest days, as order syncs do.
  const usable = coverage.from && coverage.to && coverage.to.getTime() >= end - 30 * dayMs
  if (!usable) {
    for (let to = end; to > start; to -= size) {
      chunks.push({ from: new Date(Math.max(start, to - size)), to: new Date(to) })
    }
    return { chunks, fresh: true }
  }
  const storedFrom = coverage.from!.getTime()
  const storedTo = coverage.to!.getTime()
  for (let from = Math.max(start, storedFrom, storedTo - 7 * dayMs); from < end; from += size) {
    chunks.push({ from: new Date(from), to: new Date(Math.min(from + size, end)) })
  }
  for (let to = storedFrom; to > start; to -= size) {
    chunks.push({ from: new Date(Math.max(start, to - size)), to: new Date(to) })
  }
  return { chunks, fresh: false }
}

// Copies a year of daily FBA stock from Amazon's inventory ledger. A failure is recorded on the sync but doesn't fail
// the order sync: restock then just can't leave out stockout days it doesn't know about.
export async function syncLedger(
  input: { orgId: string; externalAccountId: string; revision: number; amazon: Pick<Amazon, "report"> },
  assertOwned: () => Promise<void>
) {
  const { orgId, externalAccountId, revision } = input
  const scope = and(eq(salesSyncs.orgId, orgId), eq(salesSyncs.source, "amazon"), eq(salesSyncs.revision, revision))
  const [sync] = await db().select().from(salesSyncs).where(scope)
  if (!sync) {
    return
  }
  let covered =
    sync.stockCoveredFrom && sync.stockCoveredTo ? { from: sync.stockCoveredFrom, to: sync.stockCoveredTo } : null
  const { chunks, fresh } = ledgerChunks(Date.now(), { from: covered?.from ?? null, to: covered?.to ?? null })
  if (fresh) {
    covered = null
  }
  try {
    for (const chunk of chunks) {
      const text = await input.amazon.report(
        {
          reportType: ledgerReportType,
          marketplaceIds: [marketplace],
          dataStartTime: chunk.from.toISOString(),
          // Amazon's end time is inclusive; stop just before the next day.
          dataEndTime: new Date(chunk.to.getTime() - 1000).toISOString(),
          reportOptions: ledgerReportOptions
        },
        { deadline: Date.now() + 20 * 60 * 1000, assertActive: assertOwned }
      )
      const fromDay = isoDay(chunk.from.getTime())
      const toDay = isoDay(chunk.to.getTime())
      const days = parseLedgerSummary(text ?? "").filter((row) => row.day >= fromDay && row.day < toDay)
      await assertOwned()
      covered = covered
        ? {
            from: chunk.from < covered.from ? chunk.from : covered.from,
            to: chunk.to > covered.to ? chunk.to : covered.to
          }
        : chunk
      const range = covered
      await db().transaction(async (tx) => {
        const [current] = await tx.select({ revision: salesSyncs.revision }).from(salesSyncs).where(scope).for("update")
        if (!current) {
          throw new Error("A newer sync replaced this one")
        }
        await tx
          .delete(stockDays)
          .where(
            and(
              eq(stockDays.orgId, orgId),
              eq(stockDays.externalAccountId, externalAccountId),
              eq(stockDays.pool, "fba"),
              eq(stockDays.scope, marketplace),
              gte(stockDays.day, fromDay),
              lt(stockDays.day, toDay)
            )
          )
        for (let index = 0; index < days.length; index += 500) {
          await tx.insert(stockDays).values(
            days.slice(index, index + 500).map((row) => ({
              orgId,
              externalAccountId,
              pool: "fba" as const,
              scope: marketplace,
              itemKey: row.sku,
              day: row.day,
              units: row.endingUnits,
              origin: "ledger" as const
            }))
          )
        }
        await tx
          .update(salesSyncs)
          .set({ stockCoveredFrom: range.from, stockCoveredTo: range.to, stockErrorCode: null })
          .where(scope)
      })
    }
  } catch (error) {
    // Logged here rather than with describeError, which lives in the stock module that imports this one.
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(JSON.stringify({ event: "ledger_sync_failed", orgId, error: message }))
    await db().update(salesSyncs).set({ stockErrorCode: "ledger_failed" }).where(scope)
  }
}

// Days in [from, to) each item was out of stock, from recorded days. For FBA, a day inside the ledger's period with no
// sellable row counts as out of stock; elsewhere only recorded zero days count, since a missing day is unknown.
export async function stockoutDays(input: {
  orgId: string
  externalAccountId: string
  pool: "fba" | "shopify"
  scope: string
  itemKeys: string[]
  from: Date
  to: Date
  ledger?: { from: Date; to: Date } | null
  // Days each item sold: it was buyable then, whatever a pool's count says (such as FBM orders while FBA was empty).
  saleDays?: ReadonlyMap<string, ReadonlySet<string>>
}) {
  const fromDay = isoDay(input.from.getTime())
  const toDay = isoDay(input.to.getTime())
  const result = new Map<string, number>()
  if (!input.itemKeys.length) {
    return result
  }
  const rows = await db()
    .select({ itemKey: stockDays.itemKey, day: stockDays.day, units: stockDays.units })
    .from(stockDays)
    .where(
      and(
        eq(stockDays.orgId, input.orgId),
        eq(stockDays.externalAccountId, input.externalAccountId),
        eq(stockDays.pool, input.pool),
        eq(stockDays.scope, input.scope),
        inArray(stockDays.itemKey, input.itemKeys),
        gte(stockDays.day, fromDay),
        lt(stockDays.day, toDay)
      )
    )
  const byItem = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const days = byItem.get(row.itemKey) ?? new Map<string, number>()
    days.set(row.day, row.units)
    byItem.set(row.itemKey, days)
  }
  const ledgerFrom = input.ledger ? isoDay(Math.max(input.ledger.from.getTime(), input.from.getTime())) : null
  const ledgerTo = input.ledger ? isoDay(Math.min(input.ledger.to.getTime(), input.to.getTime())) : null
  for (const itemKey of input.itemKeys) {
    const days = byItem.get(itemKey) ?? new Map<string, number>()
    let out = 0
    for (let time = Date.parse(fromDay); time < Date.parse(toDay); time += dayMs) {
      const day = isoDay(time)
      const units = days.get(day)
      const inLedger = ledgerFrom !== null && ledgerTo !== null && day >= ledgerFrom && day < ledgerTo
      const empty = (units !== undefined && units <= 0) || (units === undefined && inLedger)
      if (empty && !input.saleDays?.get(itemKey)?.has(day)) {
        out++
      }
    }
    result.set(itemKey, out)
  }
  return result
}
