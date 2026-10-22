# Stored payment and recovery reconciliation

These backend calculations use imported evidence only. They make no provider requests, schedule no sync or backfill,
and write no accounting records. Historical costs, inventory valuation and profit remain unknown.

## Shopify

`GET /api/analytics/evidence?source=shopify&externalAccountId=...&dataset=order_economics` adds
`paymentReconciliation` to each order. Existing workspace permissions, marketplace/test-order exclusions and snapshot
pagination apply. These are lifetime events for each saved order, not a financial-period aggregate.

- Canonical transactions are keyed by transaction ID across order transactions and refund payments. Identical copies
  count once; contradictory copies withhold payment totals. No timestamp or amount-only deduplication is used.
- Successful SALE/CAPTURE events are receipts; successful REFUND events are outflows. Authorizations, voids,
  failed/pending payments and unsupported kinds never become paid amounts. Unsupported successful kinds, invalid
  amounts and missing source collections explicitly block totals. Parent references and processing dates are retained.
- Totals use exact decimal arithmetic in shop currency, grouped by currency. Presentment money is not added or
  converted. Net payments are compared with the current order total as a diagnostic, not recognized revenue.
- Each refund compares successful referenced refund payments with its reported total. Shipping subtotals/taxes are
  refund components, never an additional deduction. Refunds do not restore inventory lots.
- Transaction fees and their taxes remain separate reported evidence. Fees attached to a duplicate transaction are
  counted once. Empty fee arrays do not establish zero external-gateway fees or complete settlement coverage.
- Saved balance transactions with the same workspace/account/order are grouped separately by native type and currency.
  Their gross-minus-fee arithmetic is checked against net. They are alternative evidence, never added to payment fees.
  The collector does not retain a direct payment-transaction link, so an order reference cannot certify settlement.
  The 5,000-balance-row cap applies to the current evidence page and is disclosed on every affected comparison.

Missing or conflicting evidence yields null/unavailable, not zero. An empty totals list means no included observed
events in that collection. It does not establish complete source history. Existing ingestion-status coverage still
describes updated-order collection; it is not coverage by transaction processing date. Balance changes invalidate
continuation snapshots. No current Overview/profit calculation changes in this delivery.

References: Shopify [OrderTransaction](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/OrderTransaction),
[Refund](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Refund), and
[TransactionFee](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/TransactionFee).

## Amazon reimbursement families

`GET /api/analytics/amazon/reconciliation?source=reimbursements&from=...&to=...` adds `reimbursementAccounting`.
Stored reimbursement/original IDs are followed in both directions across dates within the same seller, workspace and
marketplace. Retrieval is bounded to 1,000 rows and eight expansion passes; incomplete traversal blocks family totals.

An unambiguous original plus its direct referenced corrections can produce a signed report amount and separate cash,
inventory and total quantities for the exact SKU/ASIN/FNSKU/condition tuple. Missing originals, conflicting identities,
duplicate lines, currency differences, inconsistent quantities or multi-step reversals require review. For example,
a $20.45 cash reimbursement followed by -$20.45, -1 cash unit and +1 inventory unit yields zero report dollars and
one recovered inventory unit. It does not prove a financial posting match, restore a lot, or assign inventory value.

Family context repeats on each source row: never sum those family totals across rows or pages. Source row IDs identify
the participating evidence in the response snapshot. Report amounts never create additional recovery income. Missing
future/uningested corrections remain a coverage limitation even for an internally calculated family.

## Amazon released postings

`GET /api/analytics/amazon/allocations` adds `accounting` to each paginated posting. Forward and reverse
DEFERRED_TRANSACTION_ID/RELEASE_TRANSACTION_ID references are followed across dates in the current seller account.
Missing links, ambiguous chains, inconsistent statuses, currency/type/marketplace/order differences, or unbalanced
breakdowns withhold the contribution. Traversal allows 1,000 linked rows in addition to the current page and eight
expansion passes. Page postings never appear again in linked context, including truncated results. Reverse lookup
uses JSON containment supported by the `amazon_transaction_identifiers` GIN index; its migration indexes existing
stored evidence without requesting provider history or changing financial records.

An internally consistent RELEASED posting contributes its signed amount once under its transaction ID. A matching
DEFERRED_RELEASED copy contributes no second amount; DEFERRED remains excluded. No reference is inferred from amount,
product or date. The `releasedPostingAmount` is posting evidence, not proof of a bank payout. Linked rows outside the
requested page/period supply context only and are not included again. Existing item-fee allocations remain a separate
calculation; do not add them to this whole-posting amount or to reimbursement report totals.

Reference: [Amazon Finances model](https://github.com/amzn/selling-partner-api-models/blob/main/models/finances-api-model/finances_2024-06-19.json).

## Acceptance

### Stored-evidence diagnostics

Reimbursement responses include all stored report coverage windows for the seller/workspace/marketplace, independent
of the selected month. An absent original is distinguished from a truncated family search. Its date and cause remain
unknown; a gap before the collection horizon is a possibility, not a proven explanation. Original-type mismatch is
reported only when an unambiguous original with a known reason actually contradicts the reversal.
Original existence is checked by reimbursement ID before item matching. A stored original with incomplete or
conflicting product identifiers is reported as found with unresolved item identity; family totals remain withheld.

Shopify `orderComparison` exposes the exact successful-net-payment minus current-order-total difference, pending and
failed payment IDs, and foreign-presentment context. These observations do not establish the cause of a difference;
no rounding adjustment or inferred refund is applied. Refund comparisons expose the same signed difference.

Amazon financial candidates expose exact whole-posting minus source differences, date distance, and search-page
ambiguity. Reimbursement candidates prefer equal signed amounts within the existing reference/type ordering. Neither
amount equality nor a unique candidate proves a reimbursement link, allocation, or settlement.

Receipt evidence adds `receiptReconciliation` using stored FBA `Receipts` movements with the exact shipment reference
and SKU. The query is seller/workspace/US-marketplace scoped and capped at 5,000 rows per page; truncation withholds
comparison totals. Signed movement quantities may agree or differ from shipment-received units; neither confirms
acquisition, losses, a receipt date or a lot. Missing movement history remains unknown. AWD case quantities require
explicit network/reference and unit mappings and are not compared to FBA movements.

Regression tests cover duplicate/conflicting payments, pending refunds, exact precision, currency separation,
cross-account isolation, changed balance snapshots, reversals outside the period, multi-step chains, one-sided release
references and ambiguous releases. PR #70 deployed as `d93964ff`; read-only live checks confirmed Shopify deduplication,
reimbursement reversal netting and single released-posting contribution. PR #71 deployed the subsequent stored-evidence
diagnostics and receipt-movement comparison as `dae10ab0` on October 19, 2026. Read-only live acceptance confirmed the
diagnostics without starting a sync or backfill; see the dated results and remaining coverage limitations in the
[analytics data backlog](specs/analytics/analytics-data-backlog.md#pr-71-acceptance-october-19-2026-pacific).
External gateway fees, refund duty components, payout matching, historical product identity and return-to-stock lot
restoration remain separate data/accounting gaps.
