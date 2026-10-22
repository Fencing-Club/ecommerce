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

The existing product Edit panel reads target identities and revisions alongside the quantities. Each quantity edit
preserves its target membership; multiple independent targets remain separate fields in the same panel. Existing
Amazon and Fencing Club fields retain their labels and placement. The restock channel selector includes saved pools,
and the existing report, calculations and Reorder action use the pooled recommendation. A member's physical channel
does not repeat stock or recommendations already represented by its target. Multi-location Reorder links leave the
receiving location for the existing purchase-order form to choose; a planning pool is not a delivery address.

## Locations and groups

A location exists independently of targets. A connector identifies it by provider, external account, inventory scope
and external location ID. Display names are editable metadata, never identity. Reconnecting the same account preserves
identity; connecting a different account never reassigns existing targets to it.

Today the collectors support Shopify inventory locations, Amazon FBA (US marketplace) and Amazon AWD US. The location
labels use the app's existing terminology: `FBA` and `AWD US`. Shopify collects every
inventory level and classifies locations using the fulfillment service and saved buyer decisions. There is no separate
location selection for collection. Only merchant-classified Shopify locations are eligible for targets. Amazon mirrors,
excluded locations and unresolved fulfillment services remain visible observations without purchase recommendations.
GWD, Amazon Europe and direct third-party logistics connectors are not implemented.

`connection.inventory.show` exposes locations for an owner/admin and reports whether selection is editable.
`connection.inventory.update` selects Shopify locations and requires the connection revision. Null selection uses
Shopify's defaults; an explicit empty list enables no locations. Shopify still collects its catalog and observes all
locations for discovery; selected locations are eligible for planning. Selections carry account identity and do not
transfer to a different connected account. Existing targets retain disabled Shopify members and report them as ineligible.

Amazon always exposes the fixed system-defined list `FBA` and `AWD US`. Connection-level location edits are rejected,
and any previously stored Amazon selection is ignored by discovery, inventory totals and stock refreshes. Both locations
are enabled even before their first sync; missing snapshots remain unavailable for planning until collected. Target
membership still chooses which locations to pool. Extending Amazon's list requires implementing another collector scope.

A target's `destination: {kind: "pool", locations: [...]}` is an explicit list, not a provider category or an expanding
query. It can select two of three Shopify warehouses, FBA plus AWD US, or supported locations across connectors.
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

Preserve each existing Amazon quantity on one FBA + AWD US group scoped to its existing Amazon account. Do not
associate an unconnected or different account by guessing. Preserve the Fencing Club store quantity on its one enabled Shopify location, never all Shopify locations. When the prior destination is ambiguous, retain the quantity as awaiting destination selection
and expose it through the target settings and target report. Do not make recommendations from that unresolved
target. Existing zero values must retain their intentional do-not-stock meaning during conversion.

Forward migration and import handling must preserve quantities from both stored variant fields and the one-time
Shopify metafield import. Never run migrations locally; database tests construct the current schema directly.

## Editing and contracts

The existing variant editor is unchanged. The backend accepts a target's selected checkbox values directly as a pool,
without requiring a separate group-creation step. Locations and groups are workspace scoped; variants also carry
their catalog account identity. The current product form edits mapped quantities without defining pooling on connections.

Pooled stockout-day history is not available: target reports use the full requested sales window rather than treating
any one member's outage as a pool-wide outage. Existing channel reports retain their established stockout-day adjustment.
Unassigned Amazon merchant-fulfilled demand blocks the relevant target rather than being copied into FBA demand.

CLI and MCP use generic location, group and variant-target operations, with the same authorized services as the UI.
Discovery advertises only implemented handlers. Reports include the target identity, resolved member identities,
quantity basis, missing-source/assignment issues and source evidence. A group recommendation is not a ready-to-send
shipping instruction. Existing retained reports keep their historical explanations.
