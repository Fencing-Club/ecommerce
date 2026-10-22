# Amazon monthly reports

Copacker imports eight monthly Amazon reports after a sales sync copies Amazon's orders: fulfillment shipments,
returns, reimbursements, detailed inventory movements, monthly and aged storage fees, and removal orders and shipments.
What each one keeps is in its own page ([returns](amazon-returns.md), [reimbursements](amazon-reimbursements.md),
[movements](amazon-inventory-movements.md), [storage fees](amazon-storage-fees.md), [removals](amazon-removals.md) and
[shipment dates](shipment-date-evidence.md)). This page is how they are built.

## One definition per report

`src/server/amazon-monthly-reports.ts` is the registry: `amazonMonthlyReports`, in the order a sync runs them. Each
entry comes from `defineMonthlyReport` (`src/server/amazon-report-sync.ts`), which owns the shared lifecycle: which
months to request, the request with its [limits](amazon-report-limits.md), parsing and the date check, and the
month-by-month replacement and coverage under the account and sync locks. A definition says only what differs:

- `reportType`, `parse`, and `timestamp`, the column that places a row in a month (a timestamp or a day).
- `reports`, the table of each month's import state, and `rows`, the table of imported rows. `parse` is type-checked
  against `rows`.
- `kind` for a table that holds two reports, `values` for columns every row gets (a storage fee's basis), and `status`
  for what the status says about every month.
- Optional `replace` and `beforeRequest`. Fulfillment shipments use both: Amazon allows few of those requests, and
  their rows are keyed by shipment, not by month.
- Refresh options: `refreshReuseMs`, `minimumRefreshMs`, `unavailableRefreshMs`, `retryCreate`, `wholeMonths` and
  `combineMonths`.

Each definition returns `{ sync, status }`. `amazonReportCoverage` reads every status at once for the sales status.

## Steps after the orders

The sales job (`salesJob` in `src/server/sales-orders.ts`) runs one step per run after the orders, and saves the next
step's index in its checkpoint. So add new steps at the end. Amazon's steps are the registry's reports, then daily FBA
stock from the ledger, fees, inbound shipments, inbound receipts, seller-fulfilled returns with AWD costs, and exchange
rates.

Each step says what its failure does. `fail` fails the sync; `{ log: event }` logs the error under that event and goes
on. Only inbound shipments and exchange rates log. The reports, the ledger and the fees record their own provider
failures, so what fails the sync from them is a disconnect, a newer sync or the database.

Seller-fulfilled returns stay outside `defineMonthlyReport`: they keep each month's coverage as analytics evidence, not
in a report table, and refresh older months on their own schedule (see
[analytics ingestion](analytics-ingestion.md)).
