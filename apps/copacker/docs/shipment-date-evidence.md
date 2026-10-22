# Shipment-date evidence

Implemented locally. Migration 0053 is generated, not deployed. No live provider account was accessed during implementation.

## Shopify

Regular and bulk order readers retain fulfillment `createdAt` and nullable `inTransitAt`. Stored orders without these fields remain distinguishable from observed null values. Newly granted customer access triggers a complete history read. Order-history permissions and retention still limit available history.

A source-linked depletion can omit `occurredAt` when its fulfillment has `inTransitAt`. The server uses that timestamp and rejects a conflicting supplied date. Creation time is retained as evidence only, never substituted for shipment time. If in-transit time is missing, a dated merchant shipping document is still required. See [Shopify's field definitions](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Fulfillment).

## Amazon

The sales worker imports `GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL` for monthly windows in the existing US report scope. It retains order/item IDs, shipment/item IDs, shipment date, seller SKU, quantity, fulfillment center and channel codes. Customer, address and tracking fields are discarded. Malformed rows, timezone-free dates and duplicate shipment-item identities reject the report. Replacing a successful month is atomic with coverage; failed or cancelled refreshes preserve earlier evidence but do not claim current completeness.

The report has a provider limit of 12 requests per eight hours, shared with Seller Central. The app reserves at most ten attempts per seller/workspace in a persisted eight-hour window, including failed attempts (creation retries are disabled), and avoids repeating a checked window within eight hours. Other requesters remain outside this budget, so provider throttling can still occur. A first backfill may span multiple sync runs; unrequested months remain explicitly missing. There is no new autonomous timer. [Amazon report contract](https://developer-docs.amazon/sp-api/docs/report-type-values-fba).

`GET /api/analytics/amazon/fulfillment-shipments` accepts `externalAccountId`, UTC `from`/exclusive `to` dates (maximum 31 days), `page` and `snapshot`. It returns 100 scoped shipment rows per page plus monthly coverage, using the shared analytics authorization and change-detection contract. Its period is shipment-based, unlike the order-created evidence endpoint.

Supply `shipmentItemId` in an Amazon depletion's `sale`, alongside its `shipmentReference` (provider shipment ID), order item and units. The server requires an exact match on stored order/item, SKU and units, plus US FBA channel evidence. It derives the date, and rejects conflicting dates or unmatched shipments. Unknown channel codes are retained by ingestion but cannot authorize stock depletion. Current supported codes are `AFN` and `Amazon.com`; account-level validation is pending.

Provider-linked imports are part of FIFO's stale-evidence check. Report refreshes that change shipment facts require correction; unchanged re-imports do not become stale solely because ingestion time changed. Cross-month date corrections move the existing shipment identity and invalidate the former month's coverage until refreshed. Manual shipment references cannot be mixed with provider item identities for the same shipment without correcting the original import.

## Remaining work

Historical unit/component conversions and unattended depletion scheduling remain open. Date acquisition does not prove complete sales history. Validate report access, source codes, identifier agreement and timestamp coverage with a connected seller. Shipment receipts, return dispositions and original-cost restoration are separate from outbound shipment evidence. Current Overview and inventory postings are unchanged.

[Dated conversions and automatic depletion imports](automatic-depletion-imports.md) now provide opt-in processing after sales sync; live coverage and return-to-stock accounting remain pending.
