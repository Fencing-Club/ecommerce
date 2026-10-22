# Write destination discovery

Users should know where a change will go before applying it. `product.show`, `product.listing.show`, `inventory.show`
and `location.show` expose the same route information used by write previews. These are discovered capabilities,
not a permission grant or a new settings editor.

## Read model

`product.show` includes `writePolicy: {sku, sellingPrice, unitCost, metadata, inventory}`. Each entry is a `FieldRoute`:

```text
FieldRoute = {
  field: "sku" | "selling_price" | "unit_cost" | "metadata" | "inventory",
  operation: one of the declared product/inventory mutation names,
  authority: TargetRef | null,
  propagation: "authority_only" | "all_linked_price_targets" | "selected_location" | "local",
  availability: "writable" | "location_required" | "read_only" | "blocked",
  targets: TargetCapability[],
  issues: RouteIssue[],
  dependencies: Dependency[],
  observedAt: Instant
}
TargetRef = {
  id: Id, provider: "copacker" | "shopify" | "amazon",
  connectionId: Id | null, accountId: string | null, marketplaceId: string | null,
  listingId: Id | null, locationId: Id | null,
  displayName: string, sourceRef: SourceRef | null
}
TargetCapability = {
  target: TargetRef, role: "authority" | "destination", field: FieldRoute.field,
  writable: boolean, reason: RouteIssue | null,
  currency: Currency | null, quantityState: string | null,
  unit: "piece" | "sellable_unit" | "case" | null, piecesPerUnit: integer | null,
  concurrency: "local_revision" | "provider_compare" | "read_check_write_readback",
  expectedRevision: Revision, linkRevision: Revision | null
}
RouteIssue = {
  code: "location_required" | "mapping_missing" | "authority_ambiguous" | "provider_scope_missing" |
    "permission_denied" | "managed_by_source" | "reported_stock" | "excluded_location" |
    "unsupported_field" | "price_basis_unresolved" | "connection_unavailable",
  field: FieldRoute.field, targetId: Id | null, message: string,
  recovery: StatusQuery | null
}
```

`fieldCapabilities` lists the exact editable paths within metadata and source-owned fields, pointing to the appropriate
FieldRoute. SKU, title and supplierSku are separate paths. An Amazon seller SKU remains visible as listing identity;
it is not a second writable SKU destination. Missing price permission omits price values and amount-bearing issues,
while still explaining that the operation is unavailable. Target identities are shown only when the caller can access them.

Inventory is `location_required` at product level until a location is selected. `inventory.show` returns one binding
per variant/location/state, including its specific TargetCapability, native quantity, ownership, snapshot and revision.
`location.show` distinguishes physical supplier/merchant stock, Amazon-reported stock and channel availability. An FBM
offer target displays “Amazon FBM offer availability,” never “Amazon warehouse.” FBA/AWD display “Reported by Amazon;
read-only.” A source-managed copy includes the source location's ID in its permitted recovery selector.

## Preview and execution results

`WritePreview = {previewId, operationName, createdAt, expiresAt, canApply, rows: PreviewRow[], dependencies, issues}`.
`PreviewRow = {rowId, entityId, routes: FieldRoute[], targets: PlannedTarget[], issues}`. Single writes use rowId `single`.
`PlannedTarget = {target: TargetRef, field, before: TypedValue | null, after: TypedValue,
basis: "direct" | "same_sellable_unit" | "explicit_target_price" | "pinned_rule",
quantityState: string | null, unit: string | null, dependencies: Dependency[], effect: Effect}`.
`TypedValue` is a closed union of `{kind:"text",value:string}`, `{kind:"money",amountMinor,currency}`,
`{kind:"quantity",value:integer,unit,quantityState}`, or `{kind:"metadata",patch:the operation's declared patch type}`.

Preview may return HTTP 200 with `canApply:false` and actionable issues; this is a successful inspection, not a write.
Apply/direct with blocked routes returns `route_unavailable` and performs no effects. Resolve every required target
before changing the authority. Actual writes retain the reviewed identities, exact amounts and existing price-basis
rules; this addition does not settle pricing-rule configuration, which remains a separate discussion.

`TargetOutcome = {target:TargetRef, field, desired:TypedValue, observed:TypedValue|null,
status:"pending" | "accepted" | "confirmed" | "failed" | "outcome_unknown" | "superseded",
providerRequestId:string|null, confirmedAt:Instant|null, revision:Revision|null, error:Failure|null}`.
`WriteResult = {entityId, operation:Operation, statusQuery:StatusQuery, targets:TargetOutcome[]}`. Both success and
partial-failure responses retain every required target. Provider acceptance and confirmed live values stay distinct.

## Human output

Product detail shows a compact routing summary, without requiring `schema show`:

| Change | Authority and destinations |
| --- | --- |
| SKU | Shopify store Main; Shopify only |
| Selling price | Shopify store Main, then linked Amazon US and Amazon CA offers |
| Unit cost | Shopify store Main |
| Supplier SKU and stock targets | Copacker |
| Inventory | Choose a location; physical stock and offer availability are listed separately |

A preview adds old/new values, units, account/marketplace, per-target effects and blocking reasons. It names unresolved
mappings rather than quietly omitting them. Connection grant problems point to the connection detail; missing identity
points to unlinked-listing discovery; an inventory choice points to location detail. Human labels are presentation only;
JSON/MCP retain stable codes and IDs. Product reads use stored observations; previews declare any live provider reads.
