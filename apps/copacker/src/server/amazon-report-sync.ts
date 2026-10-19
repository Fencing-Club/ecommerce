import { type Amazon, ProviderError, ReportDeferredError } from "@repo/aisle/amazon"
import { and, eq } from "drizzle-orm"
import { db, type Transaction } from "@/db"
import { connections, salesSyncs } from "@/db/schema"
import { amazonFailureDetails } from "./amazon-diagnostics"

// Request scope, not proof of a row's sales marketplace. Matches the app's US FBA inventory scope.
export const fbaReportMarketplace = "ATVPDKIKX0DER"
const day = 86400000
export function amazonReportFailure(error: unknown, stage: "request" | "parse" | "period") {
  if (error instanceof ReportDeferredError) {
    return "report_throttled"
  }
  if (error instanceof ProviderError) {
    if ([401, 403].includes(error.status)) {
      return "report_access_denied"
    }
    if ([429, 503].includes(error.status)) {
      return "report_throttled"
    }
  }
  if (stage === "parse") {
    return "report_invalid_document"
  }
  if (stage === "period") {
    return "report_outside_period"
  }
  return "report_failed"
}

type Window = { from: Date; to: Date }
type ReportState = {
  from: Date
  requestedTo: Date
  coveredTo: Date | null
  status: "imported" | "unavailable" | "failed"
  errorCode: string | null
  rowCount: number | null
  importedAt: Date | null
  checkedAt: Date
}
export type AmazonReportInput = {
  orgId: string
  externalAccountId: string
  revision: number
  amazon: Pick<Amazon, "report">
}

export function monthlyReportWindows(now: Date, wholeMonths = false) {
  const end = new Date(Math.floor(now.getTime() / day) * day)
  const windows: Window[] = []
  // Twelve completed calendar months, optionally including this month through yesterday, newest first.
  for (let offset = wholeMonths ? 1 : 0; offset <= 12; offset++) {
    const from = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset, 1))
    const to = offset === 0 ? end : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset + 1, 1))
    if (from < to) {
      windows.push({ from, to })
    }
  }
  return windows
}

export function monthlyReportStatus(reports: ReportState[], now: Date, wholeMonths = false) {
  return {
    marketplaceId: fbaReportMarketplace,
    windows: monthlyReportWindows(now, wholeMonths).map((window) => {
      const report = reports.find((row) => row.from.getTime() === window.from.getTime())
      return {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        status: report?.status ?? "not_imported",
        complete: report?.status === "imported" && report.coveredTo !== null && report.coveredTo >= window.to,
        requestedTo: report?.requestedTo.toISOString() ?? null,
        coveredTo: report?.coveredTo?.toISOString() ?? null,
        errorCode: report?.errorCode ?? null,
        rows: report?.rowCount ?? null,
        importedAt: report?.importedAt?.toISOString() ?? null,
        checkedAt: report?.checkedAt.toISOString() ?? null
      }
    })
  }
}

// Common report lifecycle; the importer supplies its own typed row storage. Account and revision locks cover both
// the replacement and the coverage write, so neither can publish after disconnect/replacement.
export async function syncMonthlyAmazonReport<Row>(
  input: AmazonReportInput,
  assertOwned: () => Promise<void>,
  now: Date,
  source: {
    reportType: string
    beforeRequest?: () => Promise<boolean>
    minimumRefreshMs?: number
    // Covered windows can reuse an exact completed report within this content-refresh interval.
    refreshReuseMs?: number
    retryCreate?: boolean
    // Storage fees require completed calendar months and a request spanning exactly one calendar month.
    wholeMonths?: boolean
    // Removal reports support a date range. One complete file can establish coverage for sparse months.
    combineMonths?: boolean
    reports: ReportState[]
    parse: (text: string) => Row[]
    timestamp: (row: Row) => Date
    replace: (tx: Transaction, window: Window, rows: Row[], checkedAt: Date) => Promise<void>
    save: (tx: Transaction, report: ReportState) => Promise<void>
  }
) {
  const { orgId, externalAccountId, revision } = input
  const windows = monthlyReportWindows(now, source.wholeMonths)
  // Spend the provider's limited report budget on missing history before refreshing covered months.
  // Rotate attempted gaps by their last attempt so a throttled recent month cannot starve older history.
  windows.sort((a, b) => {
    const priority = (window: Window) => {
      const prior = source.reports.find((report) => report.from.getTime() === window.from.getTime())
      if (!prior) {
        return 0
      }
      return prior.coveredTo && prior.coveredTo >= window.to ? 2 : 1
    }
    const difference = priority(a) - priority(b)
    if (difference || priority(a) !== 1) {
      return difference
    }
    const checked = (window: Window) =>
      source.reports.find((report) => report.from.getTime() === window.from.getTime())!.checkedAt.getTime()
    return checked(a) - checked(b)
  })
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (source.wholeMonths ? 2 : 1), 1))
  const stale = source.reports
    .filter(
      (report) =>
        report.status === "imported" &&
        report.checkedAt.getTime() < now.getTime() - 30 * day &&
        report.from < previousMonth &&
        windows.some((window) => window.from.getTime() === report.from.getTime())
    )
    .sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime())[0]
  const syncScope = and(
    eq(salesSyncs.orgId, orgId),
    eq(salesSyncs.source, "amazon"),
    eq(salesSyncs.externalAccountId, externalAccountId),
    eq(salesSyncs.revision, revision)
  )
  const connectionScope = and(
    eq(connections.orgId, orgId),
    eq(connections.provider, "amazon"),
    eq(connections.externalId, externalAccountId)
  )
  const requests = source.combineMonths
    ? [
        {
          from: new Date(Math.min(...windows.map((window) => window.from.getTime()))),
          to: new Date(Math.max(...windows.map((window) => window.to.getTime())))
        }
      ]
    : windows
  for (const window of requests) {
    const periods = source.combineMonths ? windows : [window]
    const previous = source.reports.find((report) => report.from.getTime() === window.from.getTime())
    // Refresh the newest two months and incomplete windows; rotate one older stale successful month per run.
    if (
      !source.combineMonths &&
      window.from < previousMonth &&
      previous?.status === "imported" &&
      previous.coveredTo &&
      previous.coveredTo >= window.to &&
      previous !== stale
    ) {
      continue
    }
    if (
      source.minimumRefreshMs &&
      previous &&
      previous.checkedAt.getTime() > now.getTime() - source.minimumRefreshMs &&
      previous.requestedTo >= window.to
    ) {
      continue
    }
    await assertOwned()
    const [active] = await db().select({ revision: salesSyncs.revision }).from(salesSyncs).where(syncScope)
    const [connected] = await db()
      .select({ externalId: connections.externalId })
      .from(connections)
      .where(connectionScope)
    if (!active || !connected) {
      return
    }
    if (source.beforeRequest && !(await source.beforeRequest())) {
      return
    }
    const recovering = periods.some((period) => {
      const saved = source.reports.find((report) => report.from.getTime() === period.from.getTime())
      return !saved?.coveredTo || saved.coveredTo < period.to
    })
    const reuseMs = recovering ? day : source.refreshReuseMs
    let rows: Row[] | null = null
    let errorCode: string | null = null
    let stage: "request" | "parse" | "period" = "request"
    try {
      const text = await input.amazon.report(
        {
          reportType: source.reportType,
          marketplaceIds: [fbaReportMarketplace],
          dataStartTime: window.from.toISOString(),
          dataEndTime: new Date(window.to.getTime() - (source.wholeMonths ? 0 : 1000)).toISOString()
        },
        {
          deadline: Date.now() + 20 * 60 * 1000,
          assertActive: assertOwned,
          retryCreate: source.retryCreate,
          reuseCreatedSince: reuseMs ? new Date(now.getTime() - reuseMs).toISOString() : undefined
        }
      )
      if (text === null) {
        errorCode = "report_cancelled"
      } else {
        stage = "parse"
        rows = source.parse(text)
        stage = "period"
        if (rows.some((row) => source.timestamp(row) < window.from || source.timestamp(row) >= window.to)) {
          throw new Error("Report contains dates outside the requested month")
        }
      }
    } catch (error) {
      // Never log source rows, provider messages, URLs or input-bearing validation errors.
      console.warn("Amazon monthly report failed", {
        reportType: source.reportType,
        from: window.from.toISOString(),
        stage,
        errorCode: amazonReportFailure(error, stage),
        ...amazonFailureDetails(error)
      })
      rows = null
      errorCode = amazonReportFailure(error, stage)
    }
    await assertOwned()
    await db().transaction(async (tx) => {
      const [account] = await tx
        .select({ externalId: connections.externalId })
        .from(connections)
        .where(connectionScope)
        .for("update")
      const [current] = await tx
        .select({ revision: salesSyncs.revision })
        .from(salesSyncs)
        .where(syncScope)
        .for("update")
      if (!account || !current) {
        throw new Error("Amazon report sync was superseded")
      }
      const checkedAt = new Date()
      for (const period of periods) {
        const saved = source.reports.find((report) => report.from.getTime() === period.from.getTime())
        const periodRows =
          rows?.filter((row) => source.timestamp(row) >= period.from && source.timestamp(row) < period.to) ?? null
        let status: ReportState["status"] = "failed"
        if (periodRows !== null) {
          await source.replace(tx, period, periodRows, checkedAt)
          status = "imported"
        } else if (errorCode === "report_cancelled") {
          status = "unavailable"
        }
        await source.save(tx, {
          from: period.from,
          requestedTo: period.to,
          status,
          errorCode,
          checkedAt,
          coveredTo: periodRows !== null ? period.to : (saved?.coveredTo ?? null),
          rowCount: periodRows !== null ? periodRows.length : (saved?.rowCount ?? null),
          importedAt: periodRows !== null ? checkedAt : (saved?.importedAt ?? null)
        })
      }
    })
    // A denied or throttled source won't improve on older windows. Leave them missing and let the next sync retry.
    if (errorCode === "report_access_denied" || errorCode === "report_throttled") {
      return
    }
  }
}
