# eBay financial evidence

The daily sales workflow appends a financial-evidence step after exchange rates. It reads an independent rolling
30-day transaction/payout window, at most once per successful UTC-sized 24-hour interval. It does not request two
years again, query finances for each order notification, or infer that an order is already present in Finances.
Failed collection preserves the last successful coverage. Disconnected accounts and superseded syncs cannot publish.
Failed reads wait at least fifteen minutes and honor longer provider Retry-After delays before another attempt.
After an outage longer than 30 days, the continuous coverage start resets rather than hiding the gap.

New eBay consent requests `sell.finances`. Existing tokens retain their original permissions during refresh; the
financial feed reports `finance_permission_required` until the seller reconnects. A 403 reports
`finance_access_denied`; this can include eBay's digital-signature requirement for EU/UK sellers, which this collector
does not yet implement. These accounts must not be presented as having complete financial coverage.

`financial_transactions` and `payouts` are account-scoped analytics evidence. Transaction identity includes type and
ID. Monetary values remain exact strings; booking entry supplies their sign. Buyer details, bank instruments and
free-text memos are excluded. Pagination checks totals, duplicates, range and a 5,000-row bound. Oversized or changing
windows fail explicitly rather than claiming complete coverage.

Each daily collection also checks up to five saved payouts, failed reads first and then least recently checked. A run
does not mark financial sync complete while any saved payout read remains failed. Exact payout-ID
queries may retrieve related transactions outside the rolling window. They do not extend date-window coverage.
`payout_reconciliation` saves the transaction references, counts, signed net total and comparison against the payout's
total before express-payout fees. Missing counts, incomplete records, currency differences and split payouts remain
explicit. Provider errors have a separate `payout_reconciliation:<id>` feed status. Unknown types remain evidence.

These records are **not additional profit postings**. Orders already supply sales, refunds and `totalMarketplaceFee`.
Payouts are transfers, and transaction amounts already include their fees. Adding either the payout or all nested fee
components again would double-count. Posting additional non-order charges requires a separately verified classification;
the evidence is now available for that work without another historical import.

Read with `GET /api/analytics/evidence?source=ebay&externalAccountId=...&dataset=financial_transactions` (also `payouts`
and `payout_reconciliation`). Existing analytics authorization, account isolation and snapshot pagination apply.
`GET /api/analytics/ingestion-status` reports permission/failure/coverage state. No UI changes.

Sources: [Finances overview](https://developer.ebay.com/api-docs/sell/static/finances/finances-landing.html),
[official OpenAPI schema](https://developer.ebay.com/api-docs/master/sell/finances/openapi/3/sell_finances_v1_oas3.json),
[OAuth refresh](https://developer.ebay.com/api-docs/static/oauth-refresh-token-request.html).
