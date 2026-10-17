# Sales-linked FIFO inputs

Implemented locally using stored order evidence. No provider requests or production migration are required by this change. This is an explicit, evidence-backed import, not an unattended shipment sync. [Shipment-date acquisition](shipment-date-evidence.md) now supplies Shopify in-transit dates and Amazon FBA shipment records. Order creation time never substitutes for shipment time in FIFO.

## Read and import

`GET /api/analytics/sales-orders` accepts `source` (`amazon` or `shopify`), `externalAccountId`, `from`, exclusive `to` (UTC dates, maximum 31 days), and the usual page/snapshot fields. It returns workspace-scoped stored orders, 100 per page, selected by order-created date. This is evidence discovery, not a complete shipment-period report. All [analytics permissions and error conventions](analytics-api.md) apply.

POST to the existing `/api/analytics/depletions` with the normal depletion fields plus `sale`:

- Shopify: `{source: "shopify", salesOrderId, fulfillmentId, fulfillmentLineId}`.
- Amazon: `{source: "amazon", salesOrderId, orderItemId, shipmentReference, units, shipmentItemId?}`.

`salesOrderId` is the local UUID returned by the evidence endpoint. Supply a dated shipping document in `evidence`, its actual shipment timestamp in `occurredAt` (omit when provider shipment evidence supplies it), and the evidenced homogeneous `piecesPerUnit`. The server verifies that `quantity` equals fulfilled units times that conversion. Conversion is a merchant assertion, not inferred from today's catalog. Heterogeneous bundles require separate component accounting and must not be represented as a homogeneous pack.

Shopify imports a whole successful fulfillment line, using its stored variant and account. Component lines remain component identities. Only native web, POS and draft-order channels with known permitted tags are accepted; test/cancelled orders and integration channels are excluded. The source location must have an explicit saved merchant classification. Opening balances and receipts must use `shopify:<domain>:<locationId>` as their accounting location. Amazon mirrors and unknown locations are rejected.

Amazon imports explicitly evidenced shipment quantities against a shipped/partially shipped item and a unique active historical product mapping valid at shipment time. Only US marketplace FBA is supported, with location `amazon:<seller>:US:FBA`. FBM warehouses, remote marketplace routing and MCF are unresolved. Split shipment references are allowed, but their combined units cannot exceed fulfilled units and their product/conversion must agree.

## Corrections and safeguards

The existing UUID Idempotency-Key contract applies. Source identities, rather than user labels or request keys, prevent duplicate active imports. Shopify identity is account/order/fulfillment/line; Amazon is account/order/item/shipment reference. Imports snapshot source evidence. Corrections use `supersedes`; retirement preserves audit history.

FIFO checks imported evidence against current stored orders, product mappings, Shopify location classification and excluded tags. Any changed evidence in the calculation history returns 409 `sale_evidence_changed` until the affected records are corrected or retired. This conservative check also catches changes unrelated to quantity. Retrying the original write still returns its original audit record; it does not silently refresh the evidence. Later sales syncs invalidate pagination snapshots.

Manual depletions with unrelated references cannot automatically be reconciled to source imports. Retire an existing manual representation before importing the same physical shipment. Coverage remains incomplete until all required events are imported and reconciled. The current validation performs per-record source checks and needs large-account performance validation before rollout.

## Remaining acquisition work

Provider date acquisition is implemented; validate its live coverage before unattended imports. Shopify canceled orders with shipments need a policy for retaining physical movements. Amazon needs dated shipment events, FBM warehouse evidence and supported remote-fulfillment locations. Add historical pack/component mappings to replace per-import conversion assertions.

Returns are not inferred from refunds or reduced order quantities. Returned stock needs an actual dated receipt, disposition/location evidence and original depletion-lot cost links before restoration. Return-to-stock accounting, order-level profit views and live-account acceptance remain open.

[Dated conversions and automatic depletion imports](automatic-depletion-imports.md) now provide opt-in processing after sales sync; live coverage and return-to-stock accounting remain pending.
