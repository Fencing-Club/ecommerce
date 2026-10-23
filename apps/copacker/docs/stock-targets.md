# Variant stock targets

Per-variation buffers with explicit location membership. Connections expose inventory capabilities; each target owns
its selected pool. A variation can have several disjoint targets. No UI layout or interaction changes are included.

The target quantity remains a buffer beyond supplier lead-time demand. A target of 100 with 40 units of expected
lead-time sales requires 140 units before subtracting available and incoming stock and applying MOQ/case rounding.

## Storage and operations implemented

`inventory_location_groups` stores workspace-owned named memberships; `variant_stock_target_sets` stores each catalog
account/variant's targets, unresolved imported quantities and revision. A generated forward migration preserves current
Amazon values on an explicit account-scoped US group. A forward conversion assigns untouched warehouse imports when
the connected account has exactly one authoritative warehouse, and retains ambiguous store values for destination selection.
New Shopify metafield imports preserve their quantities as unresolved rather than overwriting saved target edits.

`variant.stock-targets.show`, `variant.stock-targets.update`, `location.group.list`, `location.group.save` and
`location.group.remove` share the browser services. Reads need Products access and writes need Products edit access.
CLI writes use the existing idempotency receipts; updates require the current revision, with zero for creation. Target
updates replace the full variant set. `resolveImported: true` explicitly acknowledges resolving/removing imported
quantities. Group saves reject overlaps across affected variants and deletion rejects groups still in use.

The browser endpoints are `/api/inventory/stock-targets` (GET/PATCH) and `/api/inventory/location-groups`
(GET/POST/DELETE). The target selection includes `accountId` and `variantId`. Group and variant writes serialize on the
workspace and lock current connections, preventing concurrent group edits from introducing overlapping targets.

`report.restock.targets` and POST `/api/restock/targets` calculate every saved target separately using the shared
recommendation calculation. Inputs are `days` and `leadTimeDays`; supplier lead time still takes precedence. Unassigned
imports are returned separately and never cause purchase recommendations. Prices use the existing permission checks.
The target report is a live calculation, not a retained purchase plan or shipment instruction.

Existing product-field responses retain their shape: one target for a provider projects to its existing scalar field.
Updating that quantity preserves its membership. Several independent targets project to null; saving unchanged nulls
with a SKU edit preserves them, and changing the scalar is rejected rather than collapsing those targets. Snapshot
reads overlay the current mapped quantities. Existing channel reports support exact single-warehouse and FBA/AWD
member sets. Pools that those channels cannot represent block that channel's recommendation; use the target report
for their pooled recommendation. This keeps existing screens unchanged without generating duplicate purchases.

## Locations and groups

A location exists independently of targets. A connector identifies it by provider, external account, inventory scope
and external location ID. Display names are editable metadata, never identity. Reconnecting the same account preserves
identity; connecting a different account never reassigns existing targets to it.

Today the collectors support Shopify inventory locations, Amazon FBA US and Amazon AWD US. Shopify collects every
inventory level and classifies locations using the fulfillment service and saved buyer decisions. There is no separate
location selection for collection. Only merchant-classified Shopify locations are eligible for targets. Amazon mirrors,
excluded locations and unresolved fulfillment services remain visible observations without purchase recommendations.
GWD, Amazon Europe and direct third-party logistics connectors are not implemented.

`connection.inventory.show` and `connection.inventory.update` expose and select locations for an owner/admin. Updates
require the connection revision. Null selection uses connector defaults; an explicit empty list enables no locations.
Shopify still collects its catalog and observes all locations for discovery; selected locations are eligible for
planning. Disabled Amazon pools cannot queue new stock refreshes. Selections carry account identity and do not transfer
to a different connected account. Existing targets retain disabled members and report them as ineligible.

A target's `destination: {kind: "pool", locations: [...]}` is an explicit list, not a provider category or an expanding
query. It can select two of three Shopify warehouses, FBA US plus AWD US, or supported locations across connectors.
New connector locations never silently join a target. A single-location destination and reusable named groups are
also supported; a named group is optional and is not a connection setting. Pools do not schedule transfers, choose
shipment destinations or claim that every member can fulfill every sale.

## Targets and overlap

Each target belongs to a variant and selects one location, an inline pool, or one named group. Products never own targets.
Quantities use the variant's sellable unit. A location with no target still has a balance.

For one variant, active targets must have disjoint physical inventory membership. Reject single/group and group/group
overlap when saving targets or changing a group's members. Different variants can use the same group. A mirror cannot
be a group member or target destination. Resolve membership again when planning so stale or invalid configuration
blocks recommendations rather than producing duplicate purchases.

Demand is attributed before grouping, using the maintained sales attribution and bundle logic. Count each attributed
sale once in its owning target. FBA sales contribute to the FBA member; AWD is a storage pool and does not receive a
second copy of FBA demand. An FBA/AWD group pools both balances with FBA demand once. Separate targets do not imply an
AWD-to-FBA transfer. Unassigned demand remains an explicit gap, never copied to every target.

Pool raw quantities and demand before supplier lead-time calculations, MOQ and case rounding. Never sum independently
rounded purchase recommendations. Keep the shared recommendation calculation and supplier/bundle policies. Missing
member stock is unknown, not zero. Keep Amazon inbound/open-PO reconciliation and count an open PO line once per
destination membership; lines for different destinations on the same PO must remain distinguishable.

## Existing values

Preserve each existing Amazon quantity on one FBA US + AWD US group scoped to its existing Amazon account. Do not
associate an unconnected or different account by guessing. Preserve store quantities without distributing or copying
them across warehouses. When the prior destination is ambiguous, retain the quantity as awaiting destination selection
and expose it through the target settings and target report. Do not make recommendations from that unresolved
target. Existing zero values must retain their intentional do-not-stock meaning during conversion.

Forward migration and import handling must preserve quantities from both stored variant fields and the one-time
Shopify metafield import. Never run migrations locally; database tests construct the current schema directly.

## Editing and contracts

The existing variant editor is unchanged. The backend accepts a target's selected checkbox values directly as a pool,
without requiring a separate group-creation step. Locations and groups are workspace scoped; variants also carry
their catalog account identity. A future target editor can use these services without defining pooling on connections.

Pooled stockout-day history is not available: target reports use the full requested sales window rather than treating
any one member's outage as a pool-wide outage. Existing channel reports retain their established stockout-day adjustment.
Unassigned Amazon merchant-fulfilled demand blocks the relevant target rather than being copied into FBA demand.

CLI and MCP use generic location, group and variant-target operations, with the same authorized services as the UI.
Discovery advertises only implemented handlers. Reports include the target identity, resolved member identities,
quantity basis, missing-source/assignment issues and source evidence. A group recommendation is not a ready-to-send
shipping instruction. Existing retained reports keep their historical explanations.
