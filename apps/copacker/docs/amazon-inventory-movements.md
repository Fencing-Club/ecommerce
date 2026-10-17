# Detailed Amazon inventory movements

The Amazon sales worker imports `GET_LEDGER_DETAIL_VIEW_DATA` after reimbursement reports on first connection,
manual sales sync and the existing daily schedule. This implements analytics backlog A02 acquisition for the US FBA
request scope. Deployment and live-account validation remain pending. It does not complete inventory reconciliation,
historical COGS, or reimbursement discovery.

## Scope and history

Requests use US marketplace `ATVPDKIKX0DER` and omit event/product filters, requesting all movement types. The source
country, store, fulfillment center, disposition and event codes remain separate from the request marketplace.
Other marketplace request scopes and AWD movements are not covered by this importer.

The initial backfill target matches returns/reimbursements: twelve completed calendar months plus this month through
yesterday, with UTC request boundaries. Amazon documents up to 18 months of detailed-ledger history; the additional
older months are outside this initial target, not verified zero activity. Account-level availability remains unverified.
`inventoryMovements.windows` exposes the exact requested target and successful coverage.

The shared monthly importer refreshes this/last month and missing or failed windows. Each run also revisits one older
successful month last checked more than 30 days ago, picking the oldest check first. Previously imported rows outside
the moving target remain stored, without automatic refresh. Interrupted work retains completed months; the next sync
can request unfinished reports again. Report requests use the existing 20-minute polling deadline.

## Source evidence

`amazon_inventory_movements` retains reported event day, SKU/FNSKU/ASIN, event type, reference ID, signed quantity,
fulfillment center, disposition, reason, country, reconciled/unreconciled quantities, source date/time text and store.
Each row is scoped by workspace, seller and request marketplace and records its import time. Title text is omitted.
Missing product/reference values are null, and unknown codes remain intact. Zero quantities remain zero.

The report's `Date` accepts validated `MM/DD/YYYY` or `YYYY-MM-DD` and is stored as a calendar date. `Date and Time`
is retained as source text; absence of an explicit timezone does not become an invented UTC timestamp. That column
and `Store` may be absent, yielding null. The UTC midnight used by the importer is only a day-comparison key for
window validation. It is not the asserted time of the movement. Other required headers, valid dates and integer
quantities are checked before publishing any part of a month.

Reference IDs are external evidence, not assumed order IDs, shipment IDs or unique movement keys. Multiple rows with
the same reference remain separate, including transfer-out/transfer-in and disposition changes. A successful refresh
atomically replaces that month's rows and coverage, preserving identical source rows without appending duplicates on
repeat imports. Corrected and removed rows replace prior evidence. Internal row IDs are not stable reconciliation keys.

## Coverage and remaining work

The buyer-only `GET /api/sales` endpoint exposes `sources[].inventoryMovements` for the connected Amazon account:
monthly status, completeness, requested/successful ends, row counts and attempt/import timestamps. It is independent
of returns, reimbursements, and summary-ledger stock coverage. The existing sales job indicates queued/running state.

A valid header-only report establishes zero rows. Cancellation is unavailable, not zero. Malformed/out-of-window rows
reject the whole month. Failed attempts preserve prior evidence and successful coverage but mark the latest attempt
incomplete. Access-denied/throttling errors stop further requests for this source until the next sync; other failures
continue into older months. Workspace/account/revision and worker-lease checks guard publication. The shared failure
codes and refresh behavior are described in [reimbursement ingestion](amazon-reimbursements.md#coverage-and-failures).

Movement rows do not change current availability, summary stock days, demand, COGS or profit. Signed quantities and
Amazon's reconciliation quantities are retained without inferring claim eligibility or netting transfers into losses.
Before building diagnostics, resolve product/reference matches, reconcile movements against balances and recovery
evidence, and identify missing or contradictory evidence. [Storage/aged-inventory fees](amazon-storage-fees.md) now have separate acquisition. [Removal/disposal detail](amazon-removals.md) also has separate acquisition. Customer-facing diagnostics and live account verification are still outstanding.

Source: [Amazon FBA report catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba).
