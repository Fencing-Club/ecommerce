# Amazon storage and aged-inventory fees

The Amazon sales worker imports monthly storage estimates (`GET_FBA_STORAGE_FEE_CHARGES_DATA`) and assessed
aged-inventory charges (`GET_FBA_FULFILLMENT_LONGTERM_STORAGE_FEE_CHARGES_DATA`) after inventory movements on first
connection, manual sync and the daily schedule. This implements analytics A04 acquisition for US FBA requests.
Live-account acceptance and reconciliation remain incomplete; this is not completed profitability reporting.

## Scope and periods

Requests use marketplace `ATVPDKIKX0DER`. Source country/currency remain independent of request scope. The initial
target is twelve completed calendar months, newest first. Current partial months are excluded. Requests span the
first day of a month to the first day of the next at UTC midnight, meeting the aged report's one-calendar-month
interval requirement. Rows must belong to that month; an out-of-period row rejects the whole document.

Each sync refreshes the two most recent completed months and incomplete windows, plus one older successful month
last checked more than 30 days ago. Older retained rows outside the moving target are not automatically refreshed.
Requested history is a target, not a guarantee of account availability. A newly completed month appears as missing
until imported. Monthly estimates can change on refresh and never become settled charges merely because a month ends.

Incomplete monthly imports first look for completed reports created within the previous 24 hours. Reuse requires the
exact report type, marketplace set and start/end instants, with no unverifiable report options. The bounded, paginated
lookup is shared across months within a client. Missing matches request a new report; successful coverage refreshes
always request fresh evidence. This lets parser repairs recover existing documents without consuming create-report
quota again. Reused documents still pass the same parsing, period, account and revision checks.

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

Scientific-notation decimals emitted by Amazon (for example `8.0E-4`) expand to exact decimal strings without using
floating-point arithmetic. Raw source values remain in evidence. Unknown/malformed values still reject the document.
The shared monthly importer requests untouched windows first, then incomplete windows, then covered refreshes,
so a limited provider budget does not repeatedly prevent older history from being attempted.

Failed monthly windows rotate by oldest attempt after untouched history. Safe failure logs include the report type,
month, stage, HTTP status and allowlisted validation fields; source values and provider messages are excluded.

### Aged snapshot dates

Aged charges accept ISO calendar dates, US month/day/year dates, and validated timezone-bearing ISO timestamps.
Timestamp normalization keeps the source calendar day rather than shifting it through UTC; the original snapshot
value remains in source evidence. Invalid dates, missing timestamp timezones and trailing garbage remain errors.
The October 18 live diagnostic identified `periodDay` as the September report's rejected field. Timestamp support
addresses a known Amazon output variant; a live retry must still verify that the affected report imports successfully.

### Unavailable aged-storage months

Aged-storage recovery also reuses exact CANCELLED reports from the previous 24 hours. They remain unavailable,
not imported or zero-charge evidence. This recovers earlier no-data/cancellation outcomes even if a later creation
was throttled. Other report sources continue to reuse DONE only. Report-option equivalence and exact account,
marketplace and period checks still apply; the selected report status is read again before reuse.

Unavailable aged months retry every seven days for the two most recent completed months and every 30 days for
older months. The age tier is recalculated at each sync, including calendar rollover. A failed
refresh retains its unavailable status and existing rows/bounds, while errorCode and checkedAt describe the latest
attempt. A new successful document replaces that state normally. The interval is application policy, not a claim
about Amazon's quota reset or a guarantee of zero fees. The daily scheduler continues to discover new months.

The October 18 investigation matched June report 402432020744 (CANCELLED; Seller Central: No Data Available)
against later retry 402504020744 (FATAL). All eleven unresolved months had earlier cancellation outcomes.
Repeated requests were replacing useful unavailable state with newer failures. Provider FATAL causes and the
precise aged-storage quota remain unconfirmed. No historical months are marked imported by this repair.
