# Analytics

Decision date: 2026-10-16. Planned work, not a statement of shipped capabilities.

Make every product's economics explainable: sales, historical product costs, fulfillment, storage, returns,
advertising and reimbursements. Amazon leads; connected Shopify stores use the same reporting foundation.
**Within analytics, acquiring and reconciling missing P0 data comes before additional reporting screens.**
This folder covers analytics requirements and their data dependencies. It is not an overall Copacker roadmap or
release-readiness checklist; priorities here do not rank unrelated engineering or product work.

## Analytics scope and related priorities

These priorities preserve the seller-reporting discussion from 2026-10-16. P0 is the analytics scope detailed here;
P1 and P2 are related workstreams, not additional requirements of the analytics data backlog.

| Priority | Scope |
| --- | --- |
| P0 | Historical COGS and batch accounting; detailed profitability reporting; returns diagnostics; reimbursement discovery; Shopify profit depth |
| P1 | Copy marketplace orders into Shopify; sync Shopify price and inventory to eBay and Amazon |
| P2 | Seller alerts and review requests; PPC analysis and optimization |

Product-attributable advertising costs belong in P0. Campaign optimization remains P2. P1 follows the existing
[inventory sync specification](../inventory-sync/README.md), including its
[marketplace order contract](../inventory-sync/marketplace-orders.md); do not create a competing sync design.

## Documents

- [Amazon financial audit](amazon-financial-audit.md): current ingestion findings and the read-only evidence inventory command.
- [Analytics data backlog](analytics-data-backlog.md): missing P0 analytics inputs, sources, dependencies, acquisition order and readiness criteria.
- [Reporting requirements](reporting.md): product economics, returns, recoveries and Shopify behavior.
- [Competitive context](competitive-context.md): Sellerboard's audience, focus and implications for positioning.

## Analytics delivery sequence

Completed implementation is tracked in the [done checklist](analytics-data-backlog.md#completed-implementation).
The financial audit, A01-A05 US FBA report importers, report backfill/refresh and coverage status, reconciliation evidence,
dated product mappings, direct item/recognized-fee allocations, and [analytics API contract cleanup](../../analytics-api.md)
are **done locally**. The API cleanup passed 39 focused tests and full `pnpm verify`.

Deployment, live-account validation and large-account pagination performance remain pending. Source-to-posting and
reversal reconciliation, broader fee classification, returns accounting and FX policy remain open. Supported automatic sale depletion is implemented locally.
Historical landed-cost allocation and FIFO over explicit depletion records are implemented locally; see
[historical costing](../../inventory-costing.md).
[Historical inventory cost inputs](../../historical-inventory-basis.md) now provide local purchase-cost, opening-balance
and actual receipt records with audit history; provider receipt reconciliation and entry/import screens remain subsequent work. Supported COGS depletion is implemented. These pending acceptance and product tasks do not undo the completed implementation checklist.

The sequence below describes the overall dependency order; it is not an unchecked task list.

1. Audit stored financial payloads and account coverage; extract usable detail before requesting overlapping feeds.
2. Acquire Amazon returns, reimbursements, inventory movements, storage and removal detail.
3. Establish historical costs, opening balances and item-level receipts alongside those imports.
4. Expand Shopify refund, return, payment and shipping data.
5. Close fulfillment, gateway, AWD and advertising cost gaps; implement traceable product/order reporting.
6. Build recovery investigation workflows on reconciled losses and reimbursements.

This is a dependency order, not a promise that every provider exposes every field. Data readiness is evaluated per
account and period. Supported reports may proceed with explicit coverage gaps; missing costs must never appear as zero.

## Analytics completion standard

For a product and period, explain profit down to source records, account for returns and reimbursements without
duplication, and identify unknown costs. Product totals plus unallocated business amounts must reconcile to the
business report. No reporting feature is complete merely because its API connection works.

The [expanded ingestion batch](../../analytics-ingestion.md) adds historical cost batches, merchant bills, inbound receipt snapshots, Shopify financial/return evidence, FBM returns, AWD cost evidence and product advertising detail. Live acceptance remains separate.
