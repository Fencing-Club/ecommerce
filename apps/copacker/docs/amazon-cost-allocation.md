# Historical product mappings and direct Amazon allocations

This backend adds explicit dated product mappings and reconciled item allocations. It does not seed historical identity
from current catalog data, change Overview profit, create COGS batches, or add report amounts to financial postings.
Deployment, live validation and a customer-facing mapping workflow remain pending.

The shared [analytics HTTP contract](analytics-api.md) defines errors, pagination, retry keys and resource URLs.

## Dated mappings

`GET /api/analytics/amazon/product-mappings` returns the connected Amazon seller's mapping history. It requires a buyer workspace
with Sales and Prices access. `POST` and `DELETE` require Products edit and Prices access plus a valid app Origin.

POST accepts `externalAccountId`, `sku`, optional nullable `asin`/`fnsku`, `shopifyDomain`, `variantId`, timezone-bearing
`validFrom` and `validTo`, and an `evidence` explanation. The interval is start-inclusive/end-exclusive and must increase.
The target variant must exist in this workspace's local variant fields or Shopify stock evidence. The connected seller
must still equal the supplied account. Nothing is inferred or automatically confirmed on behalf of a merchant.

Mappings are explicit user assertions, with creator and creation time. They confirm product identity for the stated
period, not physical batch identity. The service serializes writes on the Amazon connection and rejects active overlapping
SKU or FNSKU assignments. Shared ASINs are allowed; ASIN-only evidence is never sufficient for confirmation, even if only one mapping is stored.
Confirmation requires a matching SKU or FNSKU with compatible remaining identifiers. Multiple candidates remain ambiguous.

To correct a mapping, POST its ID as `supersedes` with the complete replacement and evidence. The old row is retired and
the replacement inserted atomically, retaining both for audit. Reusing a retired ID fails. Replacement validity may differ;
periods no longer covered become unmapped. `DELETE /api/analytics/amazon/product-mappings/{id}` retires a mistaken mapping without removing history.
No API mutates an existing mapping's identity or validity in place.

The reconciliation endpoint now returns `historicalProduct` beside its current-inventory match. It uses the source event's
date and all available compatible identifiers. No mapping, a retired mapping, or conflicting identifiers remain unresolved.
A current FBA snapshot alone never establishes historical identity. These mappings do not yet cover bundle conversions or
opening stock/batch ownership; D05 remains partially open.

## Allocation API

`GET /api/analytics/amazon/allocations?from=YYYY-MM-DD&to=YYYY-MM-DD&page=0` requires buyer Sales and Prices access. It reads only the
connected seller's stored transactions in a UTC half-open window of at most 31 days, 100 per page, with `hasMore` and
financial coverage/error state. Continue with the returned `snapshot` alongside the next page number; changed data returns 409 and requires restarting. Each response uses a consistent local snapshot and private/no-store caching. It includes
all posting types, but unsupported or uncertain transactions are explicitly unallocated. Source reports are not joined
into accounting totals, so repeated return/removal rows cannot multiply a posting.

Automatic direct allocation currently supports `RELEASED` Shipment/Refund transactions without deferred/release links.
A known, consistent marketplace and matching payload/stored currency are required. Item totals and top-level breakdowns
must independently equal the signed transaction total. Each item needs one unambiguous ProductContext identity and one
confirmed mapping valid at the **posting date**. The response states this date basis; it does not imply the expense was
incurred on that day or map a refund by its original sale date.

Exact decimal arithmetic produces `total`, `allocatedNet` and `unallocatedNet`, with allocated plus unallocated equal to
total. Each allocation includes transaction ID, item index, mapping ID/target, net amount and reason if unallocated.
These are signed net financial amounts, not sales revenue, COGS or profit. Missing/invalid total evidence remains null.

Recognized fees currently cover the `AmazonFees` subtree and explicit `Commission` and `FBAPerUnitFulfillmentFee` nodes.
Every subtree must reconcile to its children, and transaction fee totals must equal item fee totals. Leaves are counted
once, avoiding parent/child duplication. `recognizedFees`, `allocatedFees` and `unallocatedFees` preserve provider signs
(charges typically negative, reversals positive); allocations plus the remainder equal the recognized fee total.
An absent/malformed tree or disagreement leaves fee amounts null. A balanced zero means zero in these supported
categories only, never zero total business costs. Unsupported categories, statuses and posting types need classification.

Allocations are recomputed from current stored evidence and active mapping revisions, with no stale persisted links.
Changing a mapping therefore revises derived historical attribution while preserving mapping audit history. The API does
not update accounting ledgers or existing reports. Financial source completeness remains distinct from internal arithmetic.

## Remaining work

Live-account fixtures must validate taxonomy and status behavior. Storage/removal/reimbursement source-to-posting
reconciliation, more fee categories, deferred-release/reversal handling, historical order-date attribution, bundle units,
manual expense allocations and historical COGS remain open. Matching an imported report to a financial candidate still
has `reconciled: false`; direct item allocation does not prove a particular report record caused that posting.

Reference: [Amazon Finances model](https://github.com/amzn/selling-partner-api-models/blob/main/models/finances-api-model/finances_2024-06-19.json).
