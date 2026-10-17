# Amazon FBA returns ingestion

The Amazon sales worker imports `GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA` after orders, before stock and finances.
It runs on first connection, manual sales sync and the existing daily sales schedule. This implements the acquisition
portion of analytics backlog A01; returns diagnostics and financial reconciliation remain separate work.

## Scope and history

Requests use the US marketplace (`ATVPDKIKX0DER`), matching the current US FBA inventory scope. The request marketplace
is provenance, not proof of an order's sales marketplace. FBM and other FBA marketplace scopes are not covered.
The target is twelve completed calendar months plus the current month through yesterday, using UTC exclusive ends.
This is a requested history target, not a guarantee of Amazon's historical availability.

Each month succeeds or fails independently. This and the previous month refresh on every run; missing/failed/unavailable
months retry. Access-denied/rate-limit failures stop further requests for this report until the next sync, using
`report_access_denied` / `report_throttled`; other failures continue into older months. One older successful month
last checked over 30 days ago is revisited per run, oldest check first, to pick
up later corrections. Interruptions retain completed months. Report requests use the existing 20-minute polling deadline;
a worker restart can request a report again, but cannot append duplicate stored returns.

## Stored evidence

`amazon_returns` retains return timestamp, order ID, seller SKU, ASIN, FNSKU, quantity, fulfillment center, disposition,
reason, status and license plate number, scoped to workspace, seller and request marketplace, with import time.
Unknown codes and missing optional values remain intact. Customer comments and product-name text are not stored.
Order IDs and SKUs are external join references; no match to an internal product, individual order line, refund or
reimbursement is invented. Returned quantity is in Amazon sellable units, not bundle component pieces.

Amazon does not supply a reliable unique return ID. A successful report atomically replaces rows in its month and
updates that month's coverage. Identical rows within one source report are preserved because they may be separate
physical returns. Re-importing a month cannot multiply its rows, and corrected or removed rows replace the older copy.
Malformed headers/rows, invalid quantities/dates, and dates outside the requested window reject the entire month.
A valid header-only report establishes zero rows; an empty document does not.

`amazon_return_reports` records each attempted month's requested end, last successful end, last row count/import time,
latest attempt time, status and error code. Cancelled reports are `unavailable` (`report_cancelled`), since cancellation
does not prove zero returns. Failures use `failed` with `report_failed`, or the access/throttling codes above, and preserve
earlier rows and coverage. Apart from access/throttling failures, backfill continues into older months. Worker-lease loss
or account/revision replacement aborts publication.

## Status and remaining work

The authenticated buyer-only `GET /api/sales` response includes `sources[].returns` for the connected Amazon seller:
request marketplace and monthly windows with status, `complete`, requested/successful ends, row count and attempt/import
times. Missing months have null row counts, not zero. `complete` requires a successful latest attempt covering the entire
requested window; a current-month import becomes incomplete as the next UTC day begins. The sales job's existing state
indicates whether work is queued/running. There is no new customer-facing returns screen in this acquisition slice.

This does not change profit, net demand or inventory totals. A return receipt is not a refund, financial loss, sellable
restock or reimbursement. [Reimbursement ingestion](amazon-reimbursements.md) is implemented separately. Next: resolve
product/order matches explicitly and reconcile [imported inventory movements](amazon-inventory-movements.md) and physical
returns against financial transactions, then show diagnostics with coverage warnings.
Live account permissions and report availability still require an actual connected-account run after deployment.

Source: [Amazon FBA report catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba).
