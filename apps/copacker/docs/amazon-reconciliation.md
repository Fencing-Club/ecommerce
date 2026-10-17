# Amazon reconciliation evidence

The buyer-only `GET /api/analytics/amazon/reconciliation` endpoint compares acquired evidence with current FBA product identities
and stored financial postings. It requires both Sales and Prices access. This is a local, read-only reconciliation
foundation, not completed financial allocation or a reporting screen. It makes no provider calls or accounting writes.

## Request and result

Required query fields are `source` (`returns`, `reimbursements`, `movements`, `storage`, or `removals`), `from` and `to`
(UTC calendar dates, start inclusive/end exclusive, increasing and at most 31 days). `page` starts at zero. Responses
contain at most 100 source rows, ordered by event time then ID, and `hasMore`. Storage/removal rows retain their kind.
Each row carries the source table's ID for inspection; refreshes may replace these IDs. Clients must restart pagination
after refresh. Continuation requires the first response's `snapshot` token; changed data returns 409 instead of silently shifting rows. See the [analytics HTTP contract](analytics-api.md).

The connected Amazon seller, workspace and US report scope determine evidence and inventory access. A repeatable-read
transaction keeps each request consistent. Disconnected accounts return no evidence. Responses are private/no-store.
The endpoint does not expose raw transaction payloads, descriptions or tracking details.

## Product identity

Exact, case-sensitive SKU/ASIN/FNSKU comparisons use the scoped stored FBA snapshot. A unique consistent tuple is
`matched_current`; shared identifiers are `ambiguous`, contradicting identifiers are `conflicting_identifiers`, and
missing/unmatched identifiers remain explicit. Identical tuples across inventory conditions are deduplicated.
Results include up to 20 candidate identities and their count, snapshot time/status and availability.

These are observed Amazon product identities, not Shopify variant mappings, stable historical identities or batch
assignments. Snapshot freshness is exposed, not assumed. Historical SKU changes, deleted products and bundle identity
still need effective-dated mapping. No matching by product name, fuzzy SKU, or inferred ASIN occurs.

## Financial candidates and amount checks

Exact order references and compatible item ProductContext SKU/ASIN values produce candidate links. Item indexes and
match basis are retained. Explicitly different marketplaces are excluded; missing marketplace remains visible. A product
candidate can span many transactions and does not establish that a report row caused any of them. No amount/date-only
matching, invented reimbursement identifier, inferred movement reference type, or automatic claim eligibility is used.
Removal order references remain candidates, not assumed customer orders.

Candidates show transaction ID, posting date/type/status, identifiers, currency compatibility and deferred/release links.
Transaction-level breakdown roots and item totals are each independently checked against the payload total using signed
exact decimal arithmetic, yielding `balanced`, `amount_mismatch`, `currency_mismatch` or `unavailable`. Parent and child
breakdowns are never added together, nor are transaction and item totals combined. Decimal strings preserve precision;
numbers in stored JSON already have JavaScript's precision limits. Balanced trees only establish internal arithmetic,
not correct fee classification, settled cash, or agreement with a source report.

All source-to-finance results remain `reconciled: false`: even a unique reference needs currency, status, reversals,
source granularity and amount allocation checks. Storage estimates, removal fees and reimbursement totals are not added
to financial postings. Multiple source records may point to the same posting without multiplying accounting amounts.

## Coverage and limits

Report status/coverage intersecting the requested period and the financial sync's successful bounds/error/status accompany
the result. Empty report coverage or zero rows does not establish zero cost. The candidate search scans the latest 5,000
stored account postings across dates to allow late postings; a `truncated` flag identifies excluded older postings.
Only 20 candidates per source row are returned, with the full count within that search. Missing candidates never prove
missing recovery. Review the bounds and truncation before drawing conclusions. Live-account validation remains pending.

[Dated product mappings and direct item allocations](amazon-cost-allocation.md) are now implemented locally. The response
includes `historicalProduct` beside its current observation match. Source-to-posting links still remain candidates;
source-specific reconciliation, broader fee classification, reversal handling and batch identity are not complete.
The analytics data-readiness criteria remain open. Historical COGS, opening inventory and Shopify financial events
remain separate P0 dependencies.

Reference: [Amazon Finances model](https://github.com/amzn/selling-partner-api-models/blob/main/models/finances-api-model/finances_2024-06-19.json).
