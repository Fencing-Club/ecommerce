# CLI restock draft preparation

The first implementation slice prepares one proposed PO from selected retained-report rows. It is an internal
service, not an enabled operation: `restock.plan.create`, `restock.plan.show` and `restock.plan.create-pos` remain
unavailable until durable plans and dependency validation are implemented.

`prepareRestockDraft` requires buyer Restock access, PO editing and prices. It validates explicit receiver selections,
supplier/currency/channel compatibility, report expiry, known stock/demand/price/pack inputs and MOQ/case multiples.
It rejects duplicate variants rather than silently combining FBA/AWD allocations that the current order schema cannot
represent in one PO. Separate drafts can select different receivers. No target names or FBA/AWD target arithmetic are
introduced here: the shared restock report remains the source of recommendations.

Selected sellable units become pieces using the catalog's pack definition. A changed SKU or pack size fails, and a
sellable-unit cost that cannot be expressed exactly as integer minor units per piece requires review. Clients never
supply product names, inventory-item IDs, ASINs or FNSKUs.

## Reused services

- `orderLineCatalog` loads variants and local fields from the pinned Shopify account, then uses
  `@repo/copacker-orders.orderLine` and the product's saved defaults. Supplier-document imports use this same loader.
- `prepareOrder` remains the authoritative resolver for product identities, bundles, supplier catalog matching and
  pack validation. The proposed order passes the existing `orderInputSchema`.
- The future consumption transaction will call `persistOrder`, which already performs account, supplier, address
  and stock checks and writes the initial order revision. Preparation creates no PO, shipment, reservation or email.

## Remaining before exposing operations

Persist immutable reviewed plans, their revision/expiry, original report selection, dependency evidence and PO links.
Load reports by authenticated workspace/user and retain coverage metadata; reject incomplete relevant evidence.
Capture and recheck connection, stock/sales, open-PO, target, product, supplier/catalog, address and permission
dependencies. In particular, warehouse delivery addresses must match the selected connector location, not merely
belong to the buyer. Preparation alone is not a freshness guarantee.

Create all selected drafts with the plan's consumption transition and idempotency receipt in one transaction. Replays
must return the same IDs, including when a caller supplies a different key for an already consumed plan. No implicit
submission or provider write is part of this workflow. Add dispatcher/client acceptance for authorization, drift,
rollback, concurrent consumption and replay before advertising the handlers.

The separate per-variant location/pool target stack (#172, #174, #178, #181) is still unmerged at this point. Integrate
its report identities and preserved PO destination quantities before finalizing plan dependency records.
