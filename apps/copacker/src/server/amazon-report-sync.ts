import { type Amazon, ProviderError, ReportDeferredError } from "@repo/copacker-marketplaces/amazon"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { and, eq, getTableColumns, gte, is, lt } from "drizzle-orm"
import { getTableConfig, type PgTable, PgTimestamp } from "drizzle-orm/pg-core"
import invariant from "tiny-invariant"
import { db, type Executor, type Transaction } from "@/db"
import { chunked } from "@/db/helpers"
import type {
  amazonFulfillmentShipments,
  amazonInventoryMovements,
  amazonMovementReports,
  amazonReimbursementReports,
  amazonReimbursements,
  amazonRemovalReports,
  amazonRemovals,
  amazonReturnReports,
  amazonReturns,
  amazonShipmentReports,
  amazonStorageFeeReports,
  amazonStorageFees
} from "@/db/schema"
import { salesSyncs } from "@/db/schema"
import { amazonFailureDetails } from "./amazon-diagnostics"
import { connectedAccount } from "./provider-accounts"
import { lockSyncScope, salesSyncScope } from "./sales-sync-coverage"

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
// The account a report's rows belong to. The marketplace is the request scope, not proof of a row's sales marketplace;
// it matches the app's US FBA inventory scope.
type ReportAccount = { orgId: string; externalAccountId: string; marketplaceId: string }

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

function monthlyReportStatus(reports: ReportState[], now: Date, wholeMonths = false) {
  return {
    marketplaceId: usMarketplaceId,
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

// Each family's month-by-month import state, and the rows it imports.
type ReportTable =
  | typeof amazonShipmentReports
  | typeof amazonReturnReports
  | typeof amazonReimbursementReports
  | typeof amazonMovementReports
  | typeof amazonStorageFeeReports
  | typeof amazonRemovalReports
type RowTable =
  | typeof amazonFulfillmentShipments
  | typeof amazonReturns
  | typeof amazonReimbursements
  | typeof amazonInventoryMovements
  | typeof amazonStorageFees
  | typeof amazonRemovals
// Columns the import fills in itself, rather than the parsed rows.
type ImportColumns = "id" | "orgId" | "externalAccountId" | "marketplaceId" | "kind" | "importedAt"
type Parsed<Rows extends RowTable, Row, Values> = Row & Omit<Rows["$inferInsert"], ImportColumns | keyof Values>

// One monthly Amazon report family: the report it requests, the tables it keeps, and how its documents are read. The
// common lifecycle is below; a family only says what differs.
type MonthlyReport<Rows extends RowTable, Key extends string, Row, Values> = {
  reportType: string
  reports: ReportTable
  rows: Rows
  // The report within a table that holds two (removal orders and shipments, monthly and aged storage fees).
  kind?: "orders" | "shipments" | "monthly" | "aged"
  // Columns every imported row gets, besides its account.
  values?: Values
  parse: (text: string) => Parsed<Rows, Row, Values>[]
  // The column that places a row in a month: a timestamp, or a day.
  timestamp: Key
  // What the status says about every month: estimates or charges, and which date places a removal in a month.
  status?: { basis?: "estimate" | "reported_charge"; dateBasis?: "request" | "shipment" }
  // Replaces a month's rows; by default deletes the month's rows by `timestamp` and inserts the new ones.
  replace?: (
    tx: Transaction,
    account: ReportAccount,
    window: Window,
    rows: Parsed<Rows, Row, Values>[],
    importedAt: Date
  ) => Promise<void>
  // Runs just before a report is requested, at the sync's clock time; false skips this run's remaining requests.
  beforeRequest?: (account: ReportAccount, requestedAt: Date) => Promise<boolean>
  minimumRefreshMs?: number
  // Unavailable is evidence of cancellation, never proof of zero charges.
  unavailableRefreshMs?: { recent: number; older: number }
  // Covered windows can reuse an exact completed report within this content-refresh interval.
  refreshReuseMs?: number
  retryCreate?: boolean
  // Storage fees require completed calendar months and a request spanning exactly one calendar month.
  wholeMonths?: boolean
  // Removal reports support a date range. One complete file can establish coverage for sparse months.
  combineMonths?: boolean
}

// The common report lifecycle: which months to request, the request, validation, and the month-by-month replacement
// and coverage. Account and revision locks cover both the replacement and the coverage write, so neither can publish
// after disconnect/replacement.
export function defineMonthlyReport<
  Rows extends RowTable,
  Key extends string,
  Row extends Record<Key, Date | string | null>,
  Values extends Partial<Rows["$inferInsert"]> = Record<never, never>
>(source: MonthlyReport<Rows, Key, Row, Values>) {
  const { reports, kind } = source
  const readReports = (executor: Executor, account: ReportAccount): Promise<ReportState[]> =>
    executor
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.orgId, account.orgId),
          kind && "kind" in reports ? eq(reports.kind, kind) : undefined,
          eq(reports.externalAccountId, account.externalAccountId),
          eq(reports.marketplaceId, account.marketplaceId)
        )
      )
  const reportKey = getTableConfig(reports).primaryKeys[0]?.columns
  invariant(reportKey, "A monthly report table is keyed by account, marketplace and month")
  const save = async (tx: Transaction, account: ReportAccount, report: ReportState) => {
    await tx
      .insert(reports)
      .values({ ...account, ...(kind ? { kind } : {}), ...report })
      .onConflictDoUpdate({ target: reportKey, set: report })
  }
  const dateColumn = Object.entries(getTableColumns(source.rows)).find(([name]) => name === source.timestamp)?.[1]
  invariant(dateColumn, "A monthly report's timestamp is a column of its rows")
  // A day column compares with days; a timestamp column with times.
  const bound = (date: Date) => (is(dateColumn, PgTimestamp) ? date : date.toISOString().slice(0, 10))
  const timestamp = (row: Row) => {
    const value = row[source.timestamp]
    if (value === null) {
      throw new Error("Report row has no date")
    }
    // A day's UTC midnight is only a window-comparison key, not an asserted event time.
    return typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value
  }
  const replace: NonNullable<typeof source.replace> =
    source.replace ??
    (async (tx, account, window, rows, importedAt) => {
      const { rows: table } = source
      await tx
        .delete(table)
        .where(
          and(
            eq(table.orgId, account.orgId),
            kind && "kind" in table ? eq(table.kind, kind) : undefined,
            eq(table.externalAccountId, account.externalAccountId),
            eq(table.marketplaceId, account.marketplaceId),
            gte(dateColumn, bound(window.from)),
            lt(dateColumn, bound(window.to))
          )
        )
      // The type of `parse` already checks its rows against this table, so the insert can take the table's wide type.
      const into: PgTable = table
      for (const batch of chunked(rows, 500)) {
        await tx
          .insert(into)
          .values(batch.map((row) => ({ ...account, ...(kind ? { kind } : {}), ...source.values, ...row, importedAt })))
      }
    })

  async function sync(input: AmazonReportInput, assertOwned: () => Promise<void>, now = new Date()) {
    const { orgId, externalAccountId, revision } = input
    const startedAt = Date.now()
    const account = { orgId, externalAccountId, marketplaceId: usMarketplaceId }
    const saved = await readReports(db(), account)
    const windows = monthlyReportWindows(now, source.wholeMonths)
    // Spend the provider's limited report budget on missing history before refreshing covered months.
    // Rotate attempted gaps by their last attempt so a throttled recent month cannot starve older history.
    windows.sort((a, b) => {
      const priority = (window: Window) => {
        const prior = saved.find((report) => report.from.getTime() === window.from.getTime())
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
        saved.find((report) => report.from.getTime() === window.from.getTime())!.checkedAt.getTime()
      return checked(a) - checked(b)
    })
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (source.wholeMonths ? 2 : 1), 1))
    const stale = saved
      .filter(
        (report) =>
          report.status === "imported" &&
          report.checkedAt.getTime() < now.getTime() - 30 * day &&
          report.from < previousMonth &&
          windows.some((window) => window.from.getTime() === report.from.getTime())
      )
      .sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime())[0]
    const scope = { orgId, source: "amazon" as const, revision, externalAccountId }
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
      const previous = saved.find((report) => report.from.getTime() === window.from.getTime())
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
      if (
        source.unavailableRefreshMs &&
        previous?.status === "unavailable" &&
        previous.requestedTo >= window.to &&
        previous.checkedAt.getTime() >
          now.getTime() -
            (window.from >= previousMonth ? source.unavailableRefreshMs.recent : source.unavailableRefreshMs.older)
      ) {
        continue
      }
      await assertOwned()
      const [active] = await db()
        .select({ revision: salesSyncs.revision })
        .from(salesSyncs)
        .where(salesSyncScope(scope))
      const connected = await connectedAccount(orgId, "amazon", { externalId: externalAccountId })
      if (!active || !connected) {
        return
      }
      if (
        source.beforeRequest &&
        !(await source.beforeRequest(account, new Date(now.getTime() + Date.now() - startedAt)))
      ) {
        return
      }
      const recovering = periods.some((period) => {
        const prior = saved.find((report) => report.from.getTime() === period.from.getTime())
        return !prior?.coveredTo || prior.coveredTo < period.to
      })
      const reuseMs = recovering ? day : source.refreshReuseMs
      let rows: Parsed<Rows, Row, Values>[] | null = null
      let errorCode: string | null = null
      let stage: "request" | "parse" | "period" = "request"
      try {
        const text = await input.amazon.report(
          {
            reportType: source.reportType,
            marketplaceIds: [usMarketplaceId],
            dataStartTime: window.from.toISOString(),
            dataEndTime: new Date(window.to.getTime() - (source.wholeMonths ? 0 : 1000)).toISOString()
          },
          {
            deadline: Date.now() + 20 * 60 * 1000,
            assertActive: assertOwned,
            retryCreate: source.retryCreate,
            reuseCancelled: Boolean(source.unavailableRefreshMs && recovering && !previous?.coveredTo),
            reuseCreatedSince: reuseMs ? new Date(now.getTime() - reuseMs).toISOString() : undefined
          }
        )
        if (text === null) {
          errorCode = "report_cancelled"
        } else {
          stage = "parse"
          rows = source.parse(text)
          stage = "period"
          if (rows.some((row) => timestamp(row) < window.from || timestamp(row) >= window.to)) {
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
        await lockSyncScope(tx, scope)
        const checkedAt = new Date()
        for (const period of periods) {
          const prior = saved.find((report) => report.from.getTime() === period.from.getTime())
          const periodRows = rows?.filter((row) => timestamp(row) >= period.from && timestamp(row) < period.to) ?? null
          let status: ReportState["status"] = "failed"
          if (periodRows !== null) {
            await replace(tx, account, period, periodRows, checkedAt)
            status = "imported"
          } else if (
            errorCode === "report_cancelled" ||
            (source.unavailableRefreshMs && prior?.status === "unavailable" && prior.requestedTo >= period.to)
          ) {
            status = "unavailable"
          }
          await save(tx, account, {
            from: period.from,
            requestedTo: period.to,
            status,
            errorCode,
            checkedAt,
            coveredTo: periodRows !== null ? period.to : (prior?.coveredTo ?? null),
            rowCount: periodRows !== null ? periodRows.length : (prior?.rowCount ?? null),
            importedAt: periodRows !== null ? checkedAt : (prior?.importedAt ?? null)
          })
        }
      })
      // A denied or throttled source won't improve on older windows. Leave them missing and let the next sync retry.
      if (errorCode === "report_access_denied" || errorCode === "report_throttled") {
        return
      }
    }
  }

  // Each month's import state, for the sales status and the analytics API.
  async function status(orgId: string, externalAccountId: string, now = new Date(), executor: Executor = db()) {
    const saved = await readReports(executor, { orgId, externalAccountId, marketplaceId: usMarketplaceId })
    return { ...source.status, ...monthlyReportStatus(saved, now, source.wholeMonths) }
  }

  return { reportType: source.reportType, sync, status }
}
