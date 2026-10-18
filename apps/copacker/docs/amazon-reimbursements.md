# Amazon FBA reimbursement ingestion

The Amazon sales worker requests `GET_FBA_REIMBURSEMENTS_DATA` after returns, on the existing first-connection,
manual and daily sales sync paths. This implements report acquisition for analytics backlog A03 and is deployed in production as of
[release 02eeb1c](https://github.com/AndrewCraswell/ecommerce/actions/runs/39068570712), 2026-10-17. Fencing Club has
102 reimbursement rows across all 13 target windows at the [live acceptance checkpoint](specs/analytics/analytics-data-backlog.md#live-acceptance-checkpoint-2026-10-17).
Other accounts, older history and financial reconciliation remain unverified; this is not a completed recovery or profitability feature.

## Scope and refresh

Requests use the US marketplace, `ATVPDKIKX0DER`, matching the app's FBA inventory scope. This identifies the request
scope, not the sales marketplace of each row. Other marketplace scopes are not imported here.

The shared monthly report lifecycle requests twelve completed calendar months and the current month through yesterday,
using UTC boundaries and an exclusive stored end. That is a backfill target, not a promise of Amazon's available history.
This/last month and incomplete months refresh on each run. Each run also refreshes one older successful month that has
not been checked in 30 days. Historical rows outside the moving target remain stored but are not automatically refreshed.
Covered-window refreshes first look for an exact completed report created in the previous four hours. Amazon updates
this daily report's content no more than once every four hours, so another creation request inside that interval is
unnecessary. The reader requires the same report type, marketplace set and date bounds, chooses the newest matching
file, and still downloads and validates it before publication. Older files do not satisfy an ordinary refresh; if no
eligible file exists, it requests a new one. Incomplete-history recovery retains its existing one-day reuse window.
A failed refresh can therefore recover from a recent valid file without merely clearing the error. The report client
polls for up to 20 minutes per request; all failures preserve prior evidence.

## Evidence and accounting boundaries

`amazon_reimbursements` retains approval time, reimbursement/case/order references, reason, SKU/FNSKU/ASIN, condition,
currency, per-unit/total amounts, separate cash/inventory/total quantities, and original reimbursement references/type.
Unknown codes remain intact. Amounts are exact decimals in PostgreSQL `numeric`, without floating-point conversion or
rounding to cents. Signed values remain signed; missing optional values remain null, distinct from reported zero.
Product-name text is omitted. Missing product or order references remain unmatched rather than dropping the recovery.

One reimbursement ID can cover multiple rows, including multiple outcomes for a product. It is not a unique row key.
A successful report atomically replaces the approval-month rows and updates coverage. All source rows survive, including
identical rows; repeated imports cannot accumulate extra copies. Corrected/removed rows replace prior evidence.
The generated database IDs identify the current imported rows and are not stable external reconciliation keys.

The importer does not infer payment settlement, stock receipt, eligibility, or money owed. Original reimbursement
references support later reversal matching, but no positive value is automatically negated based on its reason.
Cash/inventory quantities are not added together with money. Unknown or inconsistent amounts/quantities remain evidence
for reconciliation. These rows do not alter `amazon_transactions`, profit, returns, or stock totals: financial postings
may already include the same recovery. Joining those postings and original/reversal rows must precede reporting totals.

## Coverage and failures

`amazon_reimbursement_reports` records monthly attempts, last successful coverage, row count, and timestamps.
The authenticated buyer-only sales-status endpoint (`GET /api/sales`) exposes this as the connected Amazon source's
`reimbursements`, alongside independent `returns` coverage. A successful header-only report means zero rows. Missing,
malformed, or cancelled reports do not. Parsing/date errors reject the entire month; prior successful rows survive.

- `not_imported`: no attempt recorded; row count and coverage are null.
- `imported`: last attempt succeeded; `complete` also requires coverage through the currently requested end.
- `unavailable` / `report_cancelled`: Amazon cancelled the report; this does not establish zero reimbursements.
- `failed` / `report_failed`: provider request or report download failed.
- `failed` / `report_invalid_document`: the downloaded document failed parsing.
- `failed` / `report_outside_period`: parsed rows fall outside the requested month.
- `failed` / `report_access_denied` or `report_throttled`: access/rate limit failure; stop this source's remaining
  requests until the next sync. Other monthly failures continue backfilling older windows.

Failure preserves last successful counts/coverage, but `complete` is false. Current-month coverage becomes incomplete
when the next UTC day begins. Account, workspace and request scope isolate data; worker lease and connection/revision
checks prevent stale publication. The sales job exposes queued/running state; no new reporting screen is included.

[Detailed inventory movements](amazon-inventory-movements.md) now have a separate importer. Next: resolve product/order
and movement-reference links, reconcile recoveries to financial postings,
then build loss/recovery diagnostics with explicit unmatched evidence and coverage gaps.

Source: [Amazon FBA report catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba).
