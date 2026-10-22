# Operational workflows and acceptance

Status: **proposed**. These examples make the [command inventory](commands.md) and [shared contract](contract.md)
concrete. Angle-bracket values denote IDs returned by prior calls. Example JSON bodies are domain inputs passed inside
the HTTP request's `input`; workspace, auth and idempotency are supplied separately.
The [operation schemas](operations/README.md) define every input/result. The [worked envelopes](operations/examples.md)
show success, conflict and partial-failure responses; [bulk writes](bulk.md) and [credential setup](credentials.md)
complete the automation paths.

## Restock to draft purchase orders

```sh
copacker report restock --workspace <workspace-id> --json
copacker restock plan create --workspace <workspace-id> --from-report <report-id> --input selection.json --idempotency-key <key> --json
copacker restock plan show <plan-id> --workspace <workspace-id> --json
copacker restock plan create-pos <plan-id> --workspace <workspace-id> --revision 1 --idempotency-key <key> --json
copacker po submit <po-id> --workspace <workspace-id> --revision 1 --idempotency-key <key> --yes --json
```

Use a different idempotency key for each distinct mutation, and reuse it when resuming or replaying that mutation.

`report.restock` accepts optional channel selections, supplier, days, default lead time and row filters. Omitted days
and lead time use workspace settings; omitted channels means all eligible channels. It returns `reportId`, `expiresAt`,
resolved settings, channel/source coverage and rows. Each row includes:

- Stable row identity within the report, channel, product/account/variant identity, SKU and resolved supplier.
- Current status and blocking codes; missing suppliers remain discoverable even if omitted by the current UI table.
- Sold units, sales/rate/stockout days, available and incoming units, lead time, stock target, unrounded need, minimum
  order, case quantity, rounded purchase units, pack conversion and estimated costs when permitted.
- An explanation with raw inputs, supplier/default lead-time origin, inventory snapshot IDs, sales coverage and open-PO
  coverage. Preserve attribution gaps and unknown values.

Apply the existing stock/demand rules: no double subtraction of committed orders from already-available inventory, no
double counting AWD as a sales channel, no duplicate Amazon orders imported through Shopify, and the existing Amazon
inbound/open-PO reconciliation. Supplier case/MOQ rules and bundles are evaluated on the server. Amazon is a restock
channel; FBA versus AWD US is chosen on PO lines.

For this release, Amazon purchasing remains pooled. Interpret each FBA/AWD target as desired residual stock after
lead-time demand, normalize targets and balances to the report row's sellable unit, and sum the targets once:
`rawNeed = ceil(leadTimeDemand + fbaTarget + awdTarget - pooledAvailable - verifiedIncoming)`, then clamp at zero and
apply the existing MOQ/case rules. Count Amazon demand once. Reconcile provider inbound against open-PO coverage once
before using `verifiedIncoming`; preserve today's reconciliation rule rather than summing overlapping evidence.
An unresolved target migration or unit conversion blocks the affected recommendation.

Return both contributing pool targets, per-pool stock/incoming coverage and target gaps in the explanation. A pool gap
describes distribution, not another procurement recommendation: enough AWD stock can cover total purchasing need while
FBA still needs replenishment from that stock. Do not add pool gaps to pooled need or imply that a new PO performs an
AWD-to-FBA transfer. For example, targets 100 FBA and 200 AWD with 150 available, zero lead-time demand/incoming and no
MOQ/case adjustment give 150 purchase units, not two demand-bearing recommendations.

The reviewed plan explicitly assigns its selected row quantity to FBA/AWD PO lines; do not silently choose a network.
Show resulting per-pool projected coverage and any remaining gaps, and show differences from the recommendation when
the user changes quantities. Sum allocations across the row and display that total once; each selected line must pass
network-specific pack/MOQ checks, with any rounding increase included in the reviewed total. Mixed-network planning
does not duplicate the row's demand or incoming coverage.

Selection input for a plan:

```json
{
  "groups": [
    {
      "reference": "1043",
      "supplierId": "<supplier UUID>",
      "destination": "amazon",
      "currency": "USD",
      "lines": [
        { "rowId": "<report row ID>", "purchaseUnits": 120, "receiver": "fba" }
      ]
    }
  ]
}
```

The complete operation input also contains the report ID. Validate group compatibility by supplier, destination,
delivery address, forwarder stop and currency. Convert purchase units to PO pieces with the authoritative pack
definition and preserve component identities. Reject missing suppliers, unresolved mappings, invalid multiples,
unknown demand/stock and unpriced PO lines. A row with an external supplier cannot silently become a Copacker order.

A plan has immutable proposed PO inputs, dependency revisions, errors and totals by currency, plus a revision for
its consumption state. It expires after 24 hours. It does not reserve inventory or create POs. Creating POs rechecks
permissions, identity, stock/sales snapshot dependencies, PO coverage and product/supplier revisions; drift returns `stale_plan`
with the changed dependencies. A new report and plan is required instead of silently changing quantities.

Create all drafts in the plan in one database transaction, limited initially to 20 POs with the existing 150-line limit
per PO. Resolve provider identities before the transaction and validate the pinned connection and local revisions
again inside it. Persist the plan-to-PO links; replay returns the same draft IDs. Drafts reserve no shipment
quantities, so independently created plans can overlap; detect changes in open draft coverage as a review warning and
reject reuse of an already consumed plan for different drafts. Each draft is sent with its own explicit `po.submit`.

## Creating and changing a purchase order

Public `po.create` input uses source identities and editable commercial fields; the server fills authoritative
product names, buyer SKU, inventory item IDs, ASIN and FNSKU. Do not require callers to manufacture the browser's full
hydrated `OrderInput`.

```json
{
  "clientReference": "restock-1043",
  "expectedDependencies": [
    { "kind": "supplier", "id": "<supplier UUID>", "revision": 2 },
    { "kind": "variant", "id": "<Copacker variant UUID>", "revision": 4 }
  ],
  "data": {
    "reference": "1043",
    "supplierId": "<supplier UUID>",
    "destination": "amazon",
    "currency": "USD",
    "paymentTerms": "Net 30",
    "items": [
      {
        "productRef": {
          "provider": "shopify",
          "connectionId": "<connection UUID>",
          "variantId": "gid://shopify/ProductVariant/123"
        },
        "pieces": 240,
        "unitPriceMinor": 325,
        "receiver": "fba"
      }
    ]
  }
}
```

The public input maps `unitPriceMinor` to the existing per-piece unit-price field. The server supplies `piecesPerSet`
from catalog/bundle data and rejects nondivisible quantities. Warehouse orders also require `deliveryId`; a forwarder
stop uses the existing `via: {forwarderId,addressId}`. Optional due/ready dates, notes, preparation overrides and signed
adjustments follow existing domain constraints. Connection IDs are validated selections, not credentials or authority.

`po.update` takes `id`, `expectedRevision` and a complete replacement of the editable order data, retaining existing
line IDs under `data`, plus `expectedDependencies`; omitted lines are removed. It applies only to drafts. `po.submit` validates again, publishes the sent PO,
creates the packing draft and returns PO/shipment IDs and operation progress. Provider reads may be required to resolve
identities; the client never chooses canonical ASIN/FNSKU values. A failed PO PDF write retains today's sent-order
behavior and surfaces a document warning/recovery state.

Submitted-order changes follow `po proposal` and invoice approval rules. There is no direct status patch or generic
edit that can rewrite an immutable sent revision. History preserves earlier revisions and their documents.

## Packing and shipment progression

1. `shipment create --po <id>` returns the existing editable draft or a new permitted partial shipment. Read its
   shipment and PO revisions, available pieces, requirements and allowed actions.
2. Upload the invoice, then save the complete packing draft with its returned document ID. Draft saves allow incomplete
   fields; they reserve nothing, create no Amazon shipment and send no email.
3. `shipment check` reports structured issues (`code`, `path`, `itemId`, `cartonId`), available pieces and whether
   commercial changes require approval. The checks repeat under the PO lock on submission.
4. `shipment submit` reserves quantities and returns **all** resulting shipment IDs, grouped by Amazon network, plus
   operation progress. Mixed FBA/AWD packing may create multiple Copacker shipments. FBA placement may also create multiple
   provider shipment references within one Copacker shipment.
5. Where required, the buyer uses `shipment approve`; Shopify unit-cost updates happen only when explicitly requested.
   System jobs create/confirm eligible Amazon shipments and obtain carton labels. Non-Amazon shipments retain their
   automatic release behavior once packing/approval requirements are met.
6. The buyer attaches shipping labels with one-based PDF page-to-carton assignments and releases an Amazon shipment
   with its booking reference. `shipment packet download` returns the current authorized printable packet.
7. The responsible supplier marks goods shipped, a forwarder records forwarding and freight where applicable, and the
   buyer marks receipt. Return the updated revision and next responsible party after each action.

`shipment.show` includes `revision`, `poRevision`, `state`, `allowedActions`, `next`, `issues`, carton contents,
provider references, tracking and current document metadata. Internal state uses today's shipment enum. Provider
statuses are separate values; do not translate an external Amazon shipment into an invented editable Copacker state.

Corrections retain reservations and outdate documents under existing rules. Once shipped, cartons/documents cannot be
edited. A known rejected Amazon create can be retried; an uncertain result requires reconciliation against the pinned
account, reference, contents and origin. Cancellation releases quantities only after the provider confirms it.

External shipment list/lookup results include origin, account, network, provider ID/state, observation time and the
available read details. Fields not supplied by the provider remain null. De-duplicate each provider shipment reference
already attached to a Copacker shipment; do not merge unrelated shipments because a name or SKU matches. A provider
outage yields Copacker records with a partial-coverage warning, never a claim that no other shipments exist.

## Entity transfers

Files appear only through the entity operation that uses them:

```sh
copacker po import ./supplier-po.pdf --wait --json
copacker po import show <import-id> --json
copacker po import apply <import-id> --input reviewed-po.json --revision <revision> --json
copacker product import ./products.xlsx --json
copacker product export --file-format xlsx --output ./products.xlsx --json
copacker shipment invoice upload <shipment-id> ./invoice.pdf --revision <revision> --po-revision <revision>
copacker shipment label upload <shipment-id> ./labels.pdf --input assignments.json --revision <revision>
copacker shipment packet download <shipment-id> --output ./packet.pdf
copacker product label download <product-id> --output ./barcode.pdf
copacker catalog export <catalog-id> --file-format pdf --output ./catalog.pdf --json
copacker order export --file-format csv --wait --output ./orders.csv --json
copacker order export --export-id <export-id> --wait --output ./orders.csv --json
```

Examples use the interactive workspace default. Scripts supply workspace explicitly. Upload and attach are one logical
operation; users do not upload an unowned file and then learn another command to associate it. `po import` and `product
import` return entity-scoped import IDs, processing status and review issues. Apply saves only the reviewed records;
repeating it returns those same records. Rerunning the import command resumes existing work for that source/target.

The operation accepts multipart input containing bytes and typed domain fields, or an entity-bound upload handoff for
clients without byte-transfer support. The typed input distinguishes `phase: direct | prepare | complete` under the same
entity operation. Direct contains the file and domain fields. Prepare contains an `intentId`, target/revisions, purpose,
media type, size and SHA256; complete contains that same intent, the issued `handoffId` and digest. The server binds the
handoff to the immutable prepare input and validates the transferred bytes, so complete cannot substitute new targets,
revisions or files. `po.import` binds workspace and intent before a PO exists.

The caller retains a logical key K. Direct uses K; handoff prepare and complete use distinct deterministic keys
`K/prepare` and `K/complete`. Both phases are scoped to the same principal/workspace/operation and recorded under one
intent; never reuse K with two different input hashes. The server rejects a conflicting intent/handoff binding even
under a new phase key. Replaying prepare returns the same handoff or its consumed state, and replaying complete returns
the same attachment/import result or current progress without attaching twice. Check a completed receipt before staging
expiry. If an unused handoff expires, return `handoff_expired`; a fresh prepare needs a new intent/key and current
revisions. CLI helpers hide these phases but use this same protocol. The resulting import is read through `po.import.show`;
no generic file-management tool is exposed.

Internal staging validates actual bytes, media type, size, target, purpose and access. Staged IDs are scoped to the
workspace, principal and operation; they are neither bucket keys nor access credentials. Recheck target revisions and
access after transfer, before linking. Unconsumed staging expires after 24 hours. Failed linking retains resumable
staging until expiry; cleanup cannot delete attached documents. HTTP transfer routes can remain internal helpers.

Remote MCP clients use the same entity tools and handoffs. A local filesystem path never means a path on the hosted
server. Do not fetch arbitrary model-supplied URLs or require base64 PDFs in conversation. Clients with byte support
can use the authenticated transfer route, then complete the owning operation.

Retain current PDF limits: operational PDFs up to 32 MB/1,000 pages, PO imports up to 10 MB/50 pages, barcode PDFs exactly
one page up to 32 MB. Validate bytes rather than extensions. Product CSV/XLSX and images retain their current operation
limits, exported through the schema. Invoices bind to shipment and PO revisions. Shipping labels use one-based
`assignments: [{cartonId,page}]`; the result reports document IDs, aggregate revision and assignment coverage.

Attachment status belongs in `shipment show`, `shipment label list`, `product label show` or `po import show`.
Corrections can outdate documents; the corresponding entity download refuses outdated bytes. Entity exports/downloads
return media type, filename, revision, source IDs, authorized byte route and hash/size where known. `--output` saves
bytes locally and returns a receipt in JSON mode. Without it, return metadata, never binary bytes mixed with JSON.
Packets must use one consistent authorized revision set and preserve page dimensions.

MCP returns protected resource links or an authenticated browser handoff. Recheck access on every download; retain price
redactions, supplier label access at release and the forwarder commercial-invoice exception.

## Supplier products, catalogs and stock

A supplier can import/create products, edit variants and images, set wholesale pricing/quantity rules, create a catalog,
assign it to B2B customers and maintain physical stock in the initial release:

```sh
copacker product create --input product.json --json
copacker catalog create --input catalog.json --json
copacker partners list --type customer --json
copacker partners catalog assign <customer-id> --input assignment.json --revision <relationship-revision>
copacker inventory show <product-id> --json
copacker inventory update <variant-id> --location <location-id> --quantity 120 --state on_hand --reason physical_count --dry-run --json
copacker inventory update <variant-id> --preview <preview-id> --json
```

Supplier-local bulk stock counts commit all or none with expected row revisions. Cross-provider batches cannot promise
that atomicity; return per-target outcomes. Supplier inventory does not require Shopify. Catalog assignments are owned
by the supplier and do not change sent-PO prices. Full catalog/product saves preserve current archive and omitted-row
semantics. Product edits, catalog changes and stock updates recheck their shared dependencies to avoid lost changes.
The assignment input includes the selected catalog's revision and the expected previous assignment/catalog revision;
`reviewed-po.json` includes `reviewed:true` and the selected PO header/dependency fields. See the typed schemas rather
than manufacturing these fields from names. The read and preview results supply IDs and guards.

Supplier product imports with counts explicitly select the stock location and pin stock-row revisions during preview;
blank counts preserve existing stock. Generic descriptive product saves cannot carry a stale count. A supplier SKU
rename preserves existing commitments and invoice deductions through durable variant/component IDs. These service
changes are prerequisites for exposing the existing product-save/import workflows; see [supplier rules](resources.md#supplier-catalogs-and-inventory).

## Product and inventory writes

An unlinked listing is discoverable before its product mapping exists:

```sh
copacker product listing list --connection <amazon-connection-id> --unlinked --json
copacker product listing show <listing-id> --json
copacker product listing link <listing-id> --input listing-link.json --revision <link-revision> --json
copacker product price update <variant-id> --input price-change.json --dry-run --json
```

The link input names the canonical variant and reviewed pack conversion. The price input includes explicit
`targetPrices` for different packs/currencies unless a pinned pricing rule resolves them; discovery alone never matches
products solely because their names resemble each other. Applying the returned price preview includes every linked
target and its resolved amount.

```sh
copacker product variant update <variant-id> --sku NEW-SKU --dry-run --json
copacker product variant update <variant-id> --preview <sku-preview-id> --json
copacker product price update <variant-id> --amount 19.95 --currency USD --dry-run --json
copacker product price update <variant-id> --preview <price-preview-id> --wait --json
copacker product cost update <variant-id> --amount 4.50 --currency USD --dry-run --json
copacker product cost update <variant-id> --preview <cost-preview-id> --json
copacker inventory update <variant-id> --location <location-id> --quantity 120 --state on_hand --reason physical_count --dry-run --json
copacker inventory update <variant-id> --preview <inventory-preview-id> --json
```

Simple amount flags convert exactly to minor-unit API inputs. Source/link revisions, location and expected remote values
come from the reviewed `--dry-run` preview. Automation can instead provide complete inputs and guards directly as specified
in [the write contract](write-routing.md). A SKU edit writes only Shopify for buyer
products; a price update writes linked price targets and reports every outcome. Every inventory row requires a location.
Operational metadata remains local; provider callbacks refresh observations without re-triggering the same write.

## Sales and inventory reads

`order list/show` returns only ingested fields: provider account/order IDs, timestamps, source statuses, items,
quantities, fulfillment attribution, permitted amounts and coverage. It does not promise customer addresses or carrier
tracking that Copacker does not hold. `report demand`
separately identifies gross fulfilled units for orders created in the window, including stockout/bundle attribution
where available; it is not net sales after returns or units shipped in the window.

`inventory list/show` retains raw Shopify, FBA and AWD balances and their units/snapshot identities, alongside Copacker's
counting classifications and explanations. Supplier balances and channel availability retain their distinct kinds.
No first snapshot means unknown stock.
Failed syncs may leave a prior complete snapshot, with its actual timestamp and failed-refresh state. Reads do not
quietly refresh sources. Order and expense data preserve incomplete fees, FX and Ads coverage.

## Acceptance for implementation

- The three advertised commands run against authorized real workspace data and use the shipped JSON schemas.
- Equivalent CLI, web and MCP operations produce the same business results and price redactions for buyers, suppliers
  and forwarders. Cross-workspace IDs, removed members and unauthorized attachment/operation reads reveal no protected data.
- A stored-data report remains usable during provider outages and distinguishes stale, incomplete and unknown sources.
  Raw inventory, demand and restock quantities preserve units and do not double count mirrors, bundles or incoming POs.
- Replaying PO creation, submission, import-save, label attachment or plan consumption with the same key does not
  duplicate records, email jobs, quantity reservations or provider jobs. Changed inputs and stale revisions fail.
- A restock selection creates only the reviewed drafts; dependency changes require a new plan. Submission stays explicit.
- Mixed-network packing returns every resulting shipment. Uncertain Amazon creates cannot be retried blindly; packets
  cannot be released with missing/stale labels or mutated after shipment.
- JSON stdout is parseable on success, failure and timeout. Pagination has no silent truncation; broken traversal does
  not leave an output file presented as complete. Expired credentials and insufficient scopes have actionable errors.
- MCP tools expose schemas and accurate effects. Upload/download handoffs work in the advertised clients and recheck
  access; no tool treats a remote user's filesystem path as a server path.
- Suppliers manage products, variants, images, catalogs, customer assignments and local stock with their current ownership
  rules. Catalog changes do not rewrite sent POs; concurrent stock changes cannot be overwritten by stale automation.
- SKU writes reach Shopify only, preserve Amazon listing links and refresh the observed product. Price updates account
  for every linked target; partial failures and unknown outcomes never report complete success. Inventory writes require
  a resolved location/state and reject reported FBA/AWD stock. Replayed deltas cannot move stock twice.
- Unlinked offers can be discovered and linked before pricing. A single-unit price cannot silently overwrite a multipack
  offer price. Delayed older price/count requests block newer writes to that target until their outcome is resolved.
- Preview expiry rejects a first apply but does not prevent recovery of an already accepted execution. Upload prepare
  and complete replays recover the same entity result; export polling retrieves the exact run with a JSON file receipt.
- Supplier SKU changes retain commitments and invoice deductions. Concurrent deductions invalidate count-bearing import
  previews, and descriptive product saves preserve stock. FBA/AWD targets feed pooled demand exactly once.
- Imported operational metadata remains Copacker-owned after sync; distinct FBA/AWD/location targets count once. Durable item/order identities support the planned sync engine without silently enabling it.
- Run the repository's focused behavioral tests and `pnpm verify` for implementation. Verify any changed UX in the
  integrated browser. Do not create tests whose only purpose is to assert this proposal's prose or command count.

