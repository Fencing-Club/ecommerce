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

## Profit accounting

`server/ebay-profit-charges.ts` classifies saved transactions for both the Overview query and the evidence API's
`profitTreatment`. No new imports or ledger copies are needed; overlapping imports upsert the same type/transaction ID.

| Saved record | Profit treatment |
| --- | --- |
| Shipping-label purchase, adjustment or credit | Signed transaction amount, including order-linked labels |
| Explicit listing upgrades/insertion, business subscriptions, standalone premium click ads, finance/NSF fees | Signed amount when no order/line reference is present |
| Sale or refund, including nested fees and `totalFeeAmount` | Not added; orders already supply revenue/refunds and `totalMarketplaceFee` |
| Payout, transfer | Not income or expense |
| Final-value/processing fees, sale-based `AD_FEE`, ambiguous order-linked non-sale charges, dispute principal, generic credits/adjustments, unknown types | Requires review; not added |
| Tax withholding | Not an operating expense; not added |

Credits reduce costs; debits increase costs. Charges count on their own transaction timestamp, never the payout or
import date. The selected account and workspace apply. Currency conversion uses the existing dated rates; if any
included charge has no rate, the eBay charge total is omitted rather than partially summed. No payout amount or
nested fee component is added again. A known payout status is not required to be paid: fees available for payout or
on hold are still incurred; unknown statuses remain for review.

This is an explicit allowlist, not a catch-all for `NON_SALE_CHARGE`: eBay also uses that type for ordinary selling
fees. Missing order links do not make final-value or sales-based advertising fees safe to add. Unknown fees remain
for review, as do non-sale charges with references other than item IDs (including claim/refund or unknown references).
Unclassified records remain
saved and visible through the existing evidence API. Express payout fees and general fee credits need further
reference-level evidence before posting. Manually entered monthly costs are separate inputs and must not also include
the same imported eBay subscription bill.

The October 22, 2026 saved-data audit found $1.05 net insertion fees in the last 30 days, while the imported window's two orders' $14.47
selling fees were already counted. The matching payout's $69.18 is a transfer, not additional revenue. Older charges
retrieved through its exact payout ID stay in their original periods; this does not imply complete older coverage.

Read with `GET /api/analytics/evidence?source=ebay&externalAccountId=...&dataset=financial_transactions` (also `payouts`
and `payout_reconciliation`). Existing analytics authorization, account isolation and snapshot pagination apply.
`GET /api/analytics/ingestion-status` reports permission/failure/coverage state. No UI changes.

Sources: [Finances overview](https://developer.ebay.com/api-docs/sell/static/finances/finances-landing.html),
[official OpenAPI schema](https://developer.ebay.com/api-docs/master/sell/finances/openapi/3/sell_finances_v1_oas3.json),
[OAuth refresh](https://developer.ebay.com/api-docs/static/oauth-refresh-token-request.html).
Fee classifications: [Finances release notes](https://developer.ebay.com/api-docs/sell/finances/release-notes-archive.html),
[Fulfillment fee definition](https://developer.ebay.com/api-docs/sell/fulfillment/release-notes-archive.html),
[account fee meanings](https://developer.ebay.com/DevZone/XML/Docs/Reference/eBay/types/AccountDetailEntryCodeType.html).
