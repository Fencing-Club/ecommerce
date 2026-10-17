# Amazon financial data audit

First implementation slice of the [analytics data backlog](analytics-data-backlog.md), covering existing evidence
before new feeds or profitability calculations. Code audit completed on 2026-10-16. Account-specific volumes,
attribution rates and actual history remain unverified until the command runs against that account's local data copy.

## Findings from the importer

| Area | Finding | Consequence |
| --- | --- | --- |
| Source | Finances API 2024-06-19 `listTransactions`, without a marketplace filter | Includes account-level activity; do not assume every charge names an order or marketplace |
| Stored columns | Transaction ID, order reference, posting date, type, currency, total, fee total and parsed payload | Detail extraction can reuse existing data before fetching overlapping sources |
| Payload preservation | Top-level transaction schema is loose; nested breakdown and amount schemas validate known fields | Top-level items/contexts survive when supplied, but this is not a byte-for-byte raw archive |
| Fee calculation | Recursively counts a fee/commission parent once; skips its children when that parent has an amount | Do not add parent, child and item breakdown totals together |
| Deferred releases | Fee total is zeroed when a deferred transaction reference is present; raw amount remains | Audit totals are evidence inventory, not business profit |
| History target | `syncAmazonFees` uses `syncChunks` with its default 729-day history, in 14-day chunks | The older comment saying one year is inaccurate; provider availability and actual coverage still require verification |
| Refresh | Re-reads the recent 30-day window; replaces each fetched interval and upserts transaction identity | Old posting-date records amended outside this window require a deliberate refresh strategy |
| Coverage | `feesCoveredFrom`, `feesCoveredTo`, `feesErrorCode` are stored separately from order coverage | Row min/max dates are not proof of complete history; a fee sync failure does not fail the order sync |
| Money | Existing importer converts amounts to hundredths | Audit keeps currencies separate and flags currencies outside the current USD/CAD/MXN/BRL reporting set for review |
| Presentation | Overview groups much account activity together and allocates some costs | Classification and product attribution are still required; retaining a payload is not reporting readiness |

Sources in code: [collector and schemas](../../../../../packages/aisle/src/sales.ts),
[fee sync](../../../src/server/amazon-fees.ts), [sync windows](../../../src/server/sales-orders.ts),
[Overview calculations](../../../src/server/overview-sales.ts).
Provider reference: [Amazon Finances API](https://developer-docs.amazon/sp-api/docs/finances-api).

## Read-only evidence inventory

Run `pnpm --filter copacker analytics:audit:amazon` with these explicit environment variables:

- `ANALYTICS_AUDIT_DATABASE_URL`: an isolated local Postgres database containing the records to inspect.
- `ANALYTICS_AUDIT_ORG_ID`: workspace UUID.
- `ANALYTICS_AUDIT_ACCOUNT_ID`: connected Amazon seller account ID.

The command does not load `.env` or fall back to `DATABASE_URL`. It accepts loopback Postgres hosts only, opens a
repeatable-read, read-only transaction, and scopes both transaction reads and order matching to the supplied workspace
and account. It performs no provider calls or database writes. Do not use a production tunnel as the local target.

JSON output includes recorded sync coverage, observed dates, transaction totals by currency/type/status/description,
breakdown paths, identifier kinds, and diagnostic counts with at most five example transaction IDs each. Raw payloads,
customer data and credentials are not printed. Treat the resulting financial report as workspace-private data.
Each query has a 30-second timeout; rows are read in batches of 1,000. A failure produces no partial report.

## Interpreting the output

- Transaction totals include cash movements and deferred releases; they are not a profit calculation.
- Breakdown amounts overlap across parent/child levels and item/transaction scopes. Never sum the breakdown table.
- Top-level reconciliation compares same-currency root amounts to the stored total. Missing/invalid amounts make the
  comparison unavailable, not zero. A difference is evidence to investigate, not proof of an accounting error.
- Missing order links can be legitimate account charges. Existing order IDs are checked against stored Amazon sales;
  SKU/ASIN presence is measured but catalog matching is not yet implemented.
- An empty account returns no observed dates. Coverage is unknown when no matching sync record exists.
- Unknown fee types and identifiers remain visible; this audit does not guess their business category.

## Next tasks

1. Run the audit on an isolated local account-data copy; record coverage, unmatched references and representative
   charge/refund/reimbursement/deferred-release examples without copying private payloads into source control.
2. Define a classification mapping from the observed types and provider definitions, with an explicit unclassified
   bucket; reconcile per currency before changing the Overview.
3. Add product/order attribution and explain legitimate shared costs separately from missing identities.
4. Acquire return, reimbursement, inventory movement and storage reports using the backlog's readiness criteria.

No report import, historical COGS migration, customer-facing screen or profit-calculation change is included in this slice.
