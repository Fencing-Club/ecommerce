# Product and inventory write contract

Status: **proposed for the initial release**. These operations are shared by the CLI, web app and MCP server. The
[inventory-sync spec](../inventory-sync/README.md) remains planned work; this contract prepares its identity, routing
and write adapters without claiming to replace Marketplace Connect yet.

## User-facing rules

| Change | Command | Where it writes |
| --- | --- | --- |
| Buyer SKU | `product variant update <id> --sku <value>` | Shopify only. No Amazon SKU handler in this release. |
| Selling price | `product price update <id>` | The configured price source and every linked price target, with per-target results. Initial external handlers cover Shopify and Amazon. |
| Unit cost | `product cost update <id>` | The configured cost source. No invented Amazon unit-cost field. |
| Supplier SKU, targets and other operational metadata | `product variant update`, `product update` | Copacker's database. |
| Absolute inventory | `inventory update <id> --location <id>` | The selected location's write target and quantity state. |
| Inventory correction | `inventory adjust <id> --location <id>` | The selected location, only when its adapter supports safe adjustment. |

There are no separate publish or retry commands. A price update performs the requested cross-channel work. An inventory
update changes one selected balance; it does not set every location to the same count. Supplier-owned SKUs, catalogs and
stock remain editable in Copacker through the same resource groups, without requiring Shopify.

## Identity, targets and capabilities

Product and variant identities are separate from provider identifiers. Durable links store connection/account,
marketplace, source product/variant/inventory-item ID, seller SKU where applicable, fulfillment mode and pack conversion.
A Shopify SKU change preserves these links and historical PO/order snapshots. It must not trigger Amazon relisting.

`product show` returns `writePolicy` and `fieldCapabilities`: field, authority, operation, supported targets, currency
or unit, concurrency mode and reason when unavailable. `location show` returns `kind`, `quantityState`, `unit`,
`writeTarget`, `writeCapabilities`, ownership and revision. Raw provider IDs are never accepted as proof of access.
The concrete [destination discovery schema](destinations.md) defines these records and human summaries, including
blocking reasons, amount/unit basis and source/target identity. Preview never silently drops an unavailable destination.

Initially, buyer SKU and default retail-price/cost authority follow the connected Shopify catalog; existing supplier
catalog and stock remain Copacker-owned. A Copacker retail-price/cost authority requires separate typed fields, not
reusing a supplier's wholesale price. Missing or ambiguous authority is an actionable error. The write contract can
consume the source settings from the planned stock model when implemented; it does not silently switch those settings.

| Location/balance | Read meaning | Write behavior |
| --- | --- | --- |
| Copacker supplier stock | Physical on-hand pieces; commitments are reported separately | Local count replacement or adjustment, revision checked |
| Shopify merchant location | Named inventory state at a specific inventory item/location | Controlled Shopify write; state and expected quantity are explicit |
| Amazon FBM offer availability | Merchant-controlled offer quantity for seller SKU/marketplace | Absolute availability write when not controlled by another stock source; not a physical warehouse count |
| Amazon FBA or AWD | Amazon's reported physical inventory | Read-only |
| Mirror, excluded or unresolved location | Copied, ignored or unclassified stock | Not a write destination |

An FBM availability target may be exposed in the location selector with `kind: channel_availability`. It must never be
added to physical inventory totals or used as a restock location. This is a new typed projection, not an assertion that
the current inventory-location table already models offers. An arbitrary Amazon SKU cannot substitute for a resolved
location/offer target.

When a quantity is already driven by an authoritative source, its channel balance is not independently editable.
Return `managed_by_source` and the source location instead of accepting a value that the next sync would overwrite.
The existing stock design has one managed-stock master per workspace, Shopify or Copacker; FBA/AWD are reported stock.
Location selection determines routing within that model, not a second arbitrary master selection on every request.

## Input and execution

Every write carries the product/link/location revisions needed to pin its target and current source configuration.
The CLI can obtain a preview with `--dry-run`; applying it uses the returned `previewId` and rejects changed dependencies.
Without a preview, automation supplies the expected revisions and values directly. A preview does not reserve stock.
Exact single-record inputs are in [product schemas](operations/products.md); supported commands also accept
[bulk inputs](bulk.md) with the same guards and one retained execution per row/target.

The HTTP/MCP write input distinguishes `mode: preview | apply | direct` (bulk also has a side-effect-free `read` branch).
Preview takes proposed values and resolves missing
concurrency observations without performing business writes; direct requires the complete values and guards. Apply takes
`previewId` and optional matching target identity, not replacement values. The immutable preview binds principal, workspace,
operation, target, values, dependencies and permissions checked; return `createdAt` and `expiresAt` 24 hours later.
Apply rechecks current access and dependencies. A first apply after expiry returns `preview_expired` with instructions
to preview again. One preview binds to one execution; an identical repeated apply joins it and a conflicting intent
returns `preview_consumed`. Check the accepted execution/receipt before preview expiry so lost-response recovery still
works after expiry within the execution retention window. Never re-execute an expired preview after its receipt expires.

Example `inventory.update` domain input:

```json
{
  "mode": "direct",
  "variantId": "<Copacker variant UUID>",
  "locationId": "<location UUID>",
  "quantityState": "on_hand",
  "quantity": 120,
  "expectedQuantity": 100,
  "expectedRevision": 7,
  "expectedLocationRevision": 4,
  "expectedLinkRevision": 2,
  "reason": "physical_count"
}
```

For an Amazon FBM availability location, `quantityState` is `available`; requesting `on_hand` fails. Units come from the
location/item binding, with explicit pack conversions. An omitted location always fails, even if only one exists.
Bulk input requires a location and concurrency inputs on every row. Keep stock targets separate from actual quantities.

For price, accept `amountMinor`, `currency`, the variant identity, expected price/link revisions and expected source
value. The amount prices one sellable unit of the source variant. Resolve all linked price targets before any effect;
the preview/result includes each target listing ID, sellable-unit composition, currency, exact amount and calculation
basis. An identical sellable unit and currency can inherit the source amount. A non-1:1 pack mapping or different
currency requires `targetPrices[]` keyed by canonical listing ID with explicit amount/currency, or an existing pinned
pricing-rule ID/revision that resolves both unit and currency conversion. A marketplace alone cannot identify a price
when it contains differently sized offers. Stock pack conversion is not permission to invent a commercial pack price.

For example, changing a single-unit source to $12 cannot silently price a linked six-pack at $12 or $72. The caller
must specify that offer's price or use a reviewed rule. Round each computed target once using its declared currency
and rule, and reject unresolved targets before changing the source. Do not change business/sale prices or confuse the
supplier's wholesale catalog price with retail price. Missing mappings or unsupported requested targets fail preflight;
no success result may quietly omit a linked target.

For SKU, the initial buyer operation targets Shopify and refreshes Copacker's observed SKU. Results declare
`scope: shopify_only`; Amazon links stay unchanged. Supplier product SKU edits use the existing local product service.
Reuse requires the [supplier stock identity migration](resources.md#migration-and-identity-rules) first; a rename must
not erase existing PO commitments or invoice deductions. Do not present either operation as an Amazon seller-SKU rename.
Mixed metadata and upstream fields in one patch are rejected; callers use separate typed operations rather than
receiving an implied cross-system transaction.

## Delivery, conflicts and repeat execution

1. Authorize all selected targets; pin account/link ownership and current revisions. Check actual granted provider
   scopes, supported fields and currency/quantity semantics before the first effect. Resolve all target prices first.
2. Persist the desired change and one execution record per target. Where a field has a price/cost authority, update
   that authority first; dependent writes use the preflight amounts derived from that source value and the pinned
   rules/explicit offer prices. A different accepted source value requires a new review, not silent recalculation.
   A source failure stops those writes.
3. Mark each target `pending`, `accepted`, `confirmed`, `failed`, `outcome_unknown` or `superseded`. An accepted Amazon Listings
   submission is not proof that the live offer has changed. Read back or consume processing results before confirmation.
4. Return the source result and every target result. External fan-out cannot be atomic. Source success plus a failed
   channel is a partial result with actionable error details; do not roll back another seller's concurrent edit or label
   the whole operation successful. `--wait` exits nonzero for unresolved required-target failures.
5. Running the same command again with the same execution key resumes/polls the recorded change and only retries known
   failed stages. Do not repeat confirmed writes or apply an inventory delta twice. An explicitly new input gets a new
   execution, and a newer desired value supersedes unsent older work. Reconcile uncertain remote outcomes before replay.

Serialize conflicting dispatches by durable remote target and field, across executions and workers. A price target is
connection/account + marketplace/offer + price field; an inventory target is the authoritative item/location/quantity
state. Persist a monotonically increasing desired generation and an exclusive dispatch owner. An earlier dispatched,
accepted or unknown request must reach a proven terminal outcome before a newer generation can write that same target.
A worker lease timeout or a single unchanged read is not proof that the remote request can no longer apply.

Unsent superseded stages terminate with `superseded`; they never replay an older desired value. Already dispatched
stages retain their execution/generation identity, and late acknowledgements update that older receipt only. The newer
generation waits, then rechecks its source and routing dependencies before dispatch. If the older outcome cannot be
resolved, mark the affected executions `needs_attention` with the blocking execution ID; do not dispatch the newer write
or claim it confirmed. An execution with superseded required stages ends `failed` with a `superseded` conflict when
it had no effects, or `partially_succeeded` with `partial_write` and superseded target details when effects remain.
Other independent targets retain their individual outcomes. This applies to price and
absolute inventory writes and complements idempotent delta handling; it does not create a provider-side lock against
edits from other applications.

Use provider-side conditional writes where available. Shopify's
[`inventorySetQuantities`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities)
supports expected-quantity checks and distinguishes authoritative count setting from adjustment. Verify the exact
mutation and concurrency inputs against the pinned API version during implementation. No blanket bypass flag belongs
in the initial CLI. Delta adjustments require provider idempotency or an equivalent recoverable effect record.

Shopify price/SKU/cost edits and Amazon listing patches do not gain an atomic cross-system lock from a Copacker revision.
Use read-check-write-readback and expose that weaker guarantee where no provider conditional operation exists. Amazon
absolute availability replaces an offer quantity; it is not an atomic delta. Known conflicts stop with source details.
Workers must verify routing again before dispatch, so a changed connection or newer operation cannot receive a stale write.
Dispatch-time checks and the serialization rule are both required; a newer operation cannot invalidate a request
already in flight. If a queued write's accepted source value has since changed, supersede that unsent stage instead.

## Preparing for Marketplace Connect replacement

The CLI performs named business operations over the same adapters the sync engine will use. Capture origin, actor,
operation ID, provider event/order identity and target outcome now, so provider callbacks can be recognized as echoes
instead of starting a write loop. Re-ingesting the resulting Shopify/Amazon state updates the existing projection.

The eventual handoff also needs durable order mappings, per-channel ownership/cutover, reconciliation and prevention of
double inventory deductions: copying an order into Shopify must replace, not accompany, a separate deduction for that
same sale. FBA orders copied for reporting must not reduce merchant stock. These are requirements of the existing
inventory/order-sync design, not new deferred command listings here.

While another application owns a sync flow, Copacker must respect that ownership. A product edit does not disable
Marketplace Connect, take over its order history or imply that continuous propagation is active. Initial manual writes,
automatic sync ownership and complete replacement are separate capabilities reported in results and connection health.
