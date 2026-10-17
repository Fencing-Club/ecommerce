# Dated conversions and automatic depletion imports

Implemented locally; migration 0054 is generated and not deployed. This feature processes existing stored evidence after successful Shopify or Amazon sales sync. It does not contact additional providers, publish inventory changes, or replace Overview reporting.

## Conversion resources

`/api/analytics/unit-mappings` supports GET history and POST creation. `/{id}` supports GET and DELETE retirement. The shared [analytics HTTP contract](analytics-api.md) applies: scoped permissions, origin checks, UUID Idempotency-Key, audit-preserving corrections using `supersedes`, private responses and snapshot pagination.

A mapping specifies `source`, `externalAccountId`, `sourceProductId`, target `shopifyDomain`/`variantId`, integer `piecesPerUnit` (1–1000), `validFrom`, exclusive `validTo`, `evidence`, and an explicit `automatic` boolean. The account must currently be connected. Shopify source identity is the fulfilled component variant ID and cannot be remapped to a different variant. Amazon source identity is seller SKU; an independent dated Amazon product mapping must also confirm the target at shipment time.

Mappings describe homogeneous physical pieces per fulfilled unit. They cannot split one Amazon bundle into different component products. Shopify component fulfillment lines retain their individual component identities. Historical pack specifications must support the conversion; today's catalog is not silently applied to history. Only one active mapping may cover a source identity at a timestamp. Adjacent periods are permitted; corrections and retirement retain history.

Manual source-linked depletion may specify `unitMappingId` to use a verified conversion. FIFO checks it against current active mappings. Retirement or correction of a used mapping blocks the prior calculation until its depletion evidence is corrected. Mappings with `automatic: false` remain usable for explicit imports but authorize no unattended writes.

## Automatic processing

After sales sync and shipment acquisition, a bounded worker scans up to 100 stored orders for the connected account in external-order-ID order. A persisted cursor advances with each committed order. Reaching the end resets the cursor for the next sync; later cycles discover changed evidence and late shipments. New mappings take effect as their orders are revisited. No separate timer or live run has been activated by this implementation.

Successful Shopify fulfillment lines require native channel, permitted tags, known in-transit date, and an explicitly classified merchant location. Amazon requires a matched US FBA shipment item, date and dated product identity. Both require an opted-in conversion covering shipment time and an opening balance at the same product/location before shipment. Unknown opening value stays unknown; importing a shipment does not make its cost known.

The importer uses the canonical depletion validator. Repeated processing reuses an unchanged active record. Changes to automatically created records create audited replacement revisions, restating FIFO from current evidence. A retired depletion is never resurrected automatically. Manually imported source records remain user-managed; stale manual evidence needs review. Unlinked manual depletions at the same product/location after cutover block automatic imports until reconciled, preventing silent double counting.

Stored orders now retain local IDs across refreshes. Orders absent from the refreshed source period are removed; existing depletion evidence then fails validation rather than losing inventory silently. Disappearing shipment events and cancellation changes do not automatically reverse physical stock movements.

## Gaps and limits

`GET /api/analytics/depletion-imports?source=shopify&externalAccountId=...` returns the latest per-order result, plus cursor state, using 100-row page/snapshot pagination. Results distinguish `processed` from `blocked`, count created and unchanged records, and list event-level gap codes. Gap details are capped at 100 per order. More than 2,000 shipment events in one order blocks that order without truncating its accounting.

Typical gaps include missing date/product/location, missing automatic conversion, missing opening balance, conflicting manual depletion, retired evidence and changed source mappings. One invalid event does not prevent other valid events in the order from importing; the order remains blocked. Source/database failures roll back the current order and cursor. A crash resumes after the last committed order.

Processed status describes recorded events, not complete source coverage or complete COGS. A bounded pass may leave older/newer orders pending until subsequent cycles. The existing FIFO source validation continues to block stale imported evidence between cycles. Large-account performance, live-account validation and customer-facing configuration/reporting remain pending.

## Next accounting work

Return-to-stock restoration still needs dated receipts, disposition and original depletion-lot cost links. Refunds and reimbursements alone cannot authorize restored stock. Heterogeneous Amazon bundles, FBM warehouse evidence and cross-currency policy remain separate work.
