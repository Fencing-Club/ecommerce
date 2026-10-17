# Amazon storage and aged-inventory fees

The Amazon sales worker imports monthly storage estimates (`GET_FBA_STORAGE_FEE_CHARGES_DATA`) and assessed
aged-inventory charges (`GET_FBA_FULFILLMENT_LONGTERM_STORAGE_FEE_CHARGES_DATA`) after inventory movements on first
connection, manual sync and the daily schedule. This implements analytics A04 acquisition for US FBA requests.
Deployment, live-account validation and reconciliation remain pending; this is not completed profitability reporting.

## Scope and periods

Requests use marketplace `ATVPDKIKX0DER`. Source country/currency remain independent of request scope. The initial
target is twelve completed calendar months, newest first. Current partial months are excluded. Requests span the
first day of a month to the first day of the next at UTC midnight, meeting the aged report's one-calendar-month
interval requirement. Rows must belong to that month; an out-of-period row rejects the whole document.

Each sync refreshes the two most recent completed months and incomplete windows, plus one older successful month
last checked more than 30 days ago. Older retained rows outside the moving target are not automatically refreshed.
Requested history is a target, not a guarantee of account availability. A newly completed month appears as missing
until imported. Monthly estimates can change on refresh and never become settled charges merely because a month ends.

## Evidence and accounting boundary

`amazon_storage_fees` stores workspace, seller, request marketplace, source kind and cost basis (`estimate` or
`reported_charge`), period day, ASIN/FNSKU, available seller SKU, country, currency, amount, quantity, volume, rate,
volume units, age tier, fulfillment center and import time. Numeric values remain exact decimals, including fractional
average quantities and signed amounts. Missing values remain null, distinct from zero. Source dates remain calendar
dates; UTC midnight is only a comparison key, not a claim about when a fee posted.

Monthly reports do not document seller SKU; aged reports do not document fulfillment center. Those mappings remain
unknown. Raw source fields retain dimensions, utilization components, incentives and unknown future fields, excluding
product titles. Multiple tiers, facilities and countries stay separate, including identical source rows.

The source total and its component amounts are not added together. Imports do not create financial transactions,
change inventory or alter profit. Assessed aged charges still need reconciliation to financial postings. Product
matching, currency-aware reconciliation, explicit unallocated costs and double-count prevention are subsequent work.
These reports do not establish coverage of AWD costs, storage overage or every holding-cost category.

## Coverage and refresh safety

Buyer-only `GET /api/sales` exposes `sources[].storageFees.monthly` and `.aged` for the connected Amazon seller. Each
has `basis`, `marketplaceId` and monthly `windows` with requested/successful bounds, status, completeness, row counts,
error code and attempt/import timestamps. Coverage is independent for each kind and from other Amazon reports.

A successful refresh atomically replaces that month's rows and coverage. Repeating an import does not append duplicates;
corrected or removed source rows replace prior evidence. Internal row IDs are not durable reconciliation keys.
Header-only reports establish zero rows. Cancelled reports are unavailable, not zero. Invalid documents preserve prior
rows and successful bounds but mark the latest attempt incomplete. Permission/throttling failures stop that source's
remaining requests; other failures allow older months to continue. The other source can still succeed independently.
Account, workspace, sync revision and worker lease guard publication. See the shared
[failure codes](amazon-reimbursements.md#coverage-and-failures). Report polling has a 20-minute deadline per request.

[Removal/disposal detail](amazon-removals.md) now has separate acquisition. Reporting screens and reconciliation remain
separate deliverables.

Source: [Amazon FBA report catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba).
