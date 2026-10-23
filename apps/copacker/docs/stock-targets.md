# Variant stock targets

Implementation design for replacing the fixed Amazon and store target fields. This document describes the intended
replacement; the existing planner still uses those fields until the implementation is complete.

## Locations and groups

A location exists independently of targets. A connector identifies it by provider, external account, inventory scope
and external location ID. Display names are editable metadata, never identity. Reconnecting the same account preserves
identity; connecting a different account never reassigns existing targets to it.

Today the collectors support Shopify inventory locations, Amazon FBA US and Amazon AWD US. Shopify collects every
inventory level and classifies locations using the fulfillment service and saved buyer decisions. There is no separate
location selection for collection. Only merchant-classified Shopify locations are eligible for targets. Amazon mirrors,
excluded locations and unresolved fulfillment services remain visible observations without purchase recommendations.
GWD, Amazon Europe and direct third-party logistics connectors are not implemented.

A named group is an explicit set of locations, not a provider category or an automatically expanding query. An Amazon
group can contain FBA US and AWD US. New connector locations never silently join it. Groups do not schedule transfers,
choose shipment destinations or claim that every member can fulfill every sale.

## Targets and overlap

Each target belongs to a variant and selects either one location or one named group. Products never own targets.
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
and explain that state in the variant editor and restock reports. Do not make recommendations from that unresolved
target. Existing zero values must retain their intentional do-not-stock meaning during conversion.

Forward migration and import handling must preserve quantities from both stored variant fields and the one-time
Shopify metafield import. Never run migrations locally; database tests construct the current schema directly.

## Editing and contracts

The variant editor lists targets by destination and quantity, alongside an explicit add/remove workflow. Location
choices reflect current connector eligibility. Editing a group shows affected targets before saving and uses revision
checks so concurrent edits cannot introduce overlap. Locations and groups are workspace scoped; variants also carry
their catalog account identity.

CLI and MCP use generic location, group and variant-target operations, with the same authorized services as the UI.
Discovery advertises only implemented handlers. Reports include the target identity, resolved member identities,
quantity basis, missing-source/assignment issues and source evidence. A group recommendation is not a ready-to-send
shipping instruction. Existing retained reports keep their historical explanations.
