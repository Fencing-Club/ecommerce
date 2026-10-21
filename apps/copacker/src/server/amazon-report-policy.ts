import { createHash } from "node:crypto"
import { ReportDeferredError, type ReportRequestPolicy } from "@repo/copacker-marketplaces/amazon"
import { and, eq } from "drizzle-orm"
import invariant from "tiny-invariant"
import { db, type Transaction } from "@/db"
import { amazonReportQuotas } from "@/db/schema"
import { logLine } from "./log"

const spacing = 120000
const hour = 3600000
const key = (scope: string, reportType: string) =>
  and(eq(amazonReportQuotas.scope, scope), eq(amazonReportQuotas.reportType, reportType))

async function locked(tx: Transaction, scope: string, reportType: string, now: Date) {
  await tx.insert(amazonReportQuotas).values({ scope, reportType, nextRequestAt: now }).onConflictDoNothing()
  const [row] = await tx.select().from(amazonReportQuotas).where(key(scope, reportType)).for("update")
  invariant(row, "Report quota must exist after insertion")
  return row
}

// Reserve only an immediately available slot. Waiting callers recheck after sleeping, so concurrent jobs cannot
// accumulate stale future reservations or bypass a cooldown recorded while they were waiting.
export async function reserveAmazonReportRequest(scope: string, reportType: string, at?: Date) {
  return db().transaction(async (tx) => {
    const account = await locked(tx, scope, "", at ?? new Date())
    const report = await locked(tx, scope, reportType, at ?? new Date())
    const now = at ?? new Date()
    const retryAt = new Date(Math.max(account.nextRequestAt.getTime(), report.nextRequestAt.getTime()))
    if (retryAt > now) {
      return retryAt
    }
    await tx
      .update(amazonReportQuotas)
      .set({
        nextRequestAt: new Date(now.getTime() + account.intervalMs),
        updatedAt: now
      })
      .where(key(scope, ""))
    return null
  })
}

export async function observeAmazonReportRequest(
  scope: string,
  result: Parameters<ReportRequestPolicy["observe"]>[0],
  at?: Date
) {
  const observedAt = at ?? new Date()
  await db().transaction(async (tx) => {
    const account = await locked(tx, scope, "", observedAt)
    const report = await locked(tx, scope, result.reportType, observedAt)
    const now = at ?? new Date()
    // Do not speed up beyond our conservative baseline when Amazon advertises a higher nominal rate.
    const intervalMs =
      result.rateLimit === null
        ? account.intervalMs
        : Math.min(86400000, Math.max(spacing, Math.ceil(1000 / result.rateLimit)))
    const isThrottled = result.status === 429
    const accountWait = isThrottled ? Math.max(300000, result.retryAfterMs ?? 0) : intervalMs
    await tx
      .update(amazonReportQuotas)
      .set({
        intervalMs,
        nextRequestAt: new Date(Math.max(account.nextRequestAt.getTime(), now.getTime() + accountWait)),
        updatedAt: now
      })
      .where(key(scope, ""))
    if (isThrottled) {
      const throttleCount = Math.min(4, report.throttleCount + 1)
      await tx
        .update(amazonReportQuotas)
        .set({
          throttleCount,
          nextRequestAt: new Date(
            Math.max(
              report.nextRequestAt.getTime(),
              now.getTime() + Math.max(hour * 2 ** (throttleCount - 1), result.retryAfterMs ?? 0)
            )
          ),
          updatedAt: now
        })
        .where(key(scope, result.reportType))
    } else if (result.status >= 200 && result.status < 300) {
      await tx
        .update(amazonReportQuotas)
        .set({ throttleCount: 0, nextRequestAt: now, updatedAt: now })
        .where(key(scope, result.reportType))
    }
  })
  // Request timing and quota headers only: no credentials, URLs, date scopes, response bodies or seller records.
  logLine(
    JSON.stringify({
      event: "amazon_report_request",
      scope,
      at: observedAt.toISOString(),
      reportType: /^[A-Z0-9_]{1,128}$/.test(result.reportType) ? result.reportType : "other",
      status: result.status,
      rateLimit: result.rateLimit,
      retryAfterMs: result.retryAfterMs,
      requestId: result.requestId && /^[a-zA-Z0-9-]{1,128}$/.test(result.requestId) ? result.requestId : undefined
    })
  )
}

export function amazonReportPolicy(sellerId: string, clientId: string): ReportRequestPolicy {
  const scope = createHash("sha256")
    .update(JSON.stringify(["na", clientId, sellerId]))
    .digest("hex")
  return {
    async acquire({ reportType, deadline, assertActive }) {
      for (;;) {
        await assertActive?.()
        if (Date.now() >= deadline) {
          throw new ReportDeferredError(new Date(Date.now()))
        }
        const retryAt = await reserveAmazonReportRequest(scope, reportType)
        if (!retryAt) {
          return
        }
        if (retryAt.getTime() >= deadline) {
          throw new ReportDeferredError(retryAt)
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, retryAt.getTime() - Date.now())))
      }
    },
    observe: (result) => observeAmazonReportRequest(scope, result)
  }
}
