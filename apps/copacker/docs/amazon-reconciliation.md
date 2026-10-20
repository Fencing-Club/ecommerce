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

Financial searches filter by the current evidence page's exact order, SKU and ASIN identifiers before applying the
5,000-posting limit. Explicit order references rank ahead of product-only candidates. Unrelated recent postings no
longer hide historical matches. Marketplace/account isolation and search truncation remain explicit; candidates
still require source-specific allocation checks and are not additional costs.

Within reference priority, return candidates prefer `Refund` postings and reimbursement candidates prefer
`FBAInventoryReimbursement` postings before both the database bound and the per-row display bound. Nearby posting
dates rank ahead of distant ones. Ranking is an investigation aid, not proof of a financial relationship; ordinary
sales, release-linked postings and mismatched currencies remain visible as candidates where their identifiers match.

Report status/coverage intersecting the requested period and the financial sync's successful bounds/error/status accompany
the result. Empty report coverage or zero rows does not establish zero cost. Candidates can span posting dates to allow late postings; a `truncated` flag identifies excluded candidates.
The existing `amazon_transaction_posted` index begins with workspace and external account, supporting the search scope.
Only 20 candidates per source row are returned, with the full count within that search. Missing candidates never prove
missing recovery. Review the bounds and truncation before drawing conclusions. Live-account validation remains pending.

[Dated product mappings and direct item allocations](amazon-cost-allocation.md) are now implemented locally. The response
includes `historicalProduct` beside its current observation match. Source-to-posting links still remain candidates;
source-specific reconciliation, broader fee classification, reversal handling and batch identity are not complete.
The analytics data-readiness criteria remain open. Historical COGS, opening inventory and Shopify financial events
remain separate P0 dependencies.

Reference: [Amazon Finances model](https://github.com/amzn/selling-partner-api-models/blob/main/models/finances-api-model/finances_2024-06-19.json).

## Candidate diagnostics

Each financial candidate includes `checks.blockers`: missing order/item identity, missing marketplace, unreleased
status, deferred/release links, unexpected posting type, currency gaps and unbalanced totals. The signed source amount
is compared to the whole transaction using exact decimal arithmetic (`signedSourceToTransactionTotal`). Equality is
only a diagnostic: report rows and transaction totals can have different granularity. Amounts are never compared by
absolute value. Source allocation and reversal review remain mandatory even when all other checks pass.
`additionalRecognizedAmount` stays null; these diagnostics never add report amounts to postings or certify a recovery.

`currentCatalogProduct` supplies exact, case-sensitive SKU candidates from the connected Shopify account's saved stock
snapshot, with observation time and snapshot status. Multiple targets remain ambiguous. These observations neither
create nor confirm a dated mapping and never establish a cost or historical pack conversion.

## Continued financial search and reimbursement chains

`postingPage` (default 0) continues the matching financial search in 5,000-posting chunks. `nextPostingPage` in
`coverage.financialSearch` identifies the next chunk. Within a chunk, `candidatePage` (default 0) continues each source
row's 20-candidate display; each row returns `nextCandidatePage`. Both require the original snapshot on continuation;
changed source evidence or postings invalidates it. Reset candidatePage when advancing postingPage. Counts describe
only the current posting chunk, and later chunks remain explicitly partial. Continue both dimensions to inspect all
returned candidates; source `page` continues report rows independently. No provider request is made.

Reimbursement rows retain cash and inventory quantities separately, their reason, and original reimbursement IDs/types.
`relatedReimbursements` includes stored original records and records referring back to the current reimbursement IDs,
even outside the requested date period. These explicit references support reversal/replacement review, not automatic
recognition or netting. A 1,000-row related-record cap is disclosed; lack of a related row may reflect coverage gaps.

## Fee comparisons and posting links

`GET /api/analytics/amazon/allocations` accepts optional exact `postingType` and `transactionId` filters, bound into its
snapshot. Its evidence includes native transaction breakdown leaf paths and signed amounts only when every parent and
child sum validates. Parent totals and item breakdowns are not added to those leaves. These components are evidence,
not newly recognized fees. Unknown categories remain native labels for investigation.

Deferred/release references fetch account-scoped linked posting evidence, including postings outside the selected date
period. Missing IDs and a 1,000-ID truncation flag are explicit. Linked postings are not additional expenses or income.
The existing period is still required when filtering an individual transaction; linked evidence exposes its posting date.

`reportComparison` groups US storage and removal amounts separately by source kind and currency, with total row and
known-amount counts. Monthly storage is estimated; aged storage reports charges. Removal orders and shipment reports
may overlap and must never be added together. Report dates and financial posting dates can differ; the same selected
calendar window is not an assertion of matching accounting periods. Partial/empty totals do not prove zero charges,
and this comparison remains unreconciled pending source linkage and coverage checks. Cost basis remains unknown.
