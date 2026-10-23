# Targeted ingestion recovery

After Amazon's normal sales/financial sync, and after Shopify's order economics scan completes, an
`evidence-recovery` workflow checks saved references. Daily reconciliation queues these syncs, so recovery
does not require opening the app. Manual syncs share the same recovery limits.

- Shopify: fetch an exact order named by a saved balance transaction when its economics are missing;
  refresh an order whose saved payment names an absent parent transaction. Reuse the normal complete,
  paginated order collector, then follow up to ten exact missing parent-payment IDs, verifying that each
  belongs to the same order. A point lookup never advances the normal discovery cursor or history coverage.
- Amazon: missing original reimbursement IDs trigger a bounded monthly report search anchored to the
  saved reversal date. Closed FBA shipments with differing received totals use their earliest saved actual
  receipt event as a search anchor. Shipment names are never dates. Without a dated event, record that
  more evidence is required instead of guessing a period. AWD case/unit conversion remains unresolved.
- Amazon searches at most six calendar months around that original anchor, within a conservative
  18-month ledger / 24-month reimbursement horizon. These limits are search limits, not promises that
  Amazon retains or supplies every record. Already covered months are skipped. Unavailable reports are
  preserved, and other targets cannot re-request those months for 30 days.

`analytics_feeds` entries prefixed `recovery:` retain each target's attempts, immutable search anchor,
searched months, next attempt time, outcome and status. The account budget allows at most one Amazon
report or five Shopify orders per UTC day. Each target waits at least a day between attempts and stops
after six Amazon attempts or three Shopify attempts. Exhausted means unresolved, never zero money
or zero receipts. A later normal import can resolve an exhausted target.

Claims and publication lock the connected account and current sales-sync revision. Obsolete jobs cannot
publish. Amazon uses the existing report parser, account-scoped replacement, coverage records and shared
request pacing. No alternate importer or new financial posting is introduced.

After import, saved references and receipt/payment comparisons run again. Existing analytics snapshots
are invalidated by changed evidence tables; detailed reconciliation is recalculated from saved records.
Recovered references do not establish cost basis, confirmed loss or an unambiguous payment allocation.
No UI changes, full historical sync restarts or automatic financial adjustments are part of this workflow.

Shopify's [OrderTransaction contract](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/OrderTransaction)
supports the exact parent lookup; the query is validated against the app's pinned 2026-07 schema.
