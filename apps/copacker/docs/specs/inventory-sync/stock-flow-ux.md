# Stock flow page

Part of the [inventory sync spec](README.md). How people see where their stock numbers come from, change what syncs,
and audit every write. Every name and string here is a working draft. Customer-facing copy follows the repo's rules:

- as little text as possible;
- "units", never "pieces";
- "purchase order", never "PO";
- no dot glyph as a separator;
- clear, concise wording consistent with the surrounding UI.

## Why a page of its own

Two designs were considered on 2026-09-28:

- **Side panels only:** faster to build and enough to change settings, but it's hard to see the whole system or follow
  what a sync changed.
- **A node canvas:** shows the whole flow, including how orders come in, which data goes back to which platform, and
  every write's history. It's also where linking another store that shares stock would be configured later. But it's
  more work, and free wiring can build setups that make no sense.

**Decision: both, in steps, on one model.**

- **Step 1:** a Stock flow page with a map drawn from the settings, in fixed lanes. Everything is edited in side panels,
  and every line opens its own history.
- **Step 2 (later):** the same map becomes an editable canvas. Nodes can be dragged, and new connections can be drawn
  between typed ports that only accept valid pairs. A linked store would be a new kind of node.

The settings are stored as a graph of nodes and lines ([data model](data-model.md)), so step 2 changes the page, not the
data.

## The map

Lanes, left to right:

```
 SOURCES          PURCHASE ORDERS        STOCK                    CHANNELS
┌──────────┐                          ┌─────────────────┐      ┌──────────────────┐
│ Shopify  │─────────────────────────▶│ Warehouse       │─────▶│ Shopify store    │
│ Master   │      ┌──────────────┐    │ 1,240 available │  ┌──▶│ eBay        312  │ Marketplace Connect
└──────────┘      │ 3 open       │───▶│ 180 incoming    │──┤   ├──────────────────┤
┌──────────┐      └──────────────┘    └─────────────────┘  └──▶│ Amazon FBM  48   │ Copacker
│ Amazon   │             │            ┌─────────────────┐      ├──────────────────┤
│ Counts   │─────────────┼───────────▶│ FBA   860       │─────▶│ Amazon FBA       │
└──────────┘             └───────────▶│ AWD   2,100     │      └──────────────────┘
                                      └─────────────────┘
                                        Not counted (2)
```

- **Nodes:**
  - Sources: the master, and the platforms that count their own stock.
  - Purchase orders: open purchase orders, with their count.
  - Stock locations: each with its available units, and its incoming units when there are any.
  - Channels: each with its linked listings and a Needs linking count.
  - Suppliers also get a B2B channel showing accepted units held.
  - Mirror, excluded and unresolved locations fold into "Not counted".
- **Lines:** one per sync line. Parallel lines between the same two nodes (quantities out, orders in) are drawn as one
  bundle with a small chip per kind.
  - Owner: Copacker lines are solid in the accent color, other apps' lines are solid gray with the app's name, and the
    platform's own lines are thin gray. A line that's off is dashed.
  - State: paused is amber, error is red.
  - Hovering a line shows its last write time.
- **Problems:** a line or node that fails [validation](stock-model.md#validation) is red, and the page header shows a
  count ("2 problems") that jumps to them.
- **Rendering:** plain SVG with fixed lanes and automatic layout for step 1. No new dependency. A graph library such as
  `@xyflow/react` is a step 2 discussion (open question 8).

## Side panels

Clicking a node or line opens its panel on the right. On phones the panel is a sheet.

- **Master:**
  - The current master.
  - "Switch master", which starts the guided switch ([stock model](stock-model.md#switching-the-master)).
- **Location:**
  - Role, counts (on hand, available, committed, held, incoming) and its lines.
  - For Shopify locations, whether it's counted; this replaces the location dialog in Settings.
  - For the master's locations, a link to edit counts ([editing counts](#editing-counts)).
- **Channel:** three tabs:
  - Settings: sells from (in priority order) and the rule.
  - Listings: every listing with its linked item, rule and last pushed quantity.
  - Needs linking.
- **Line:** three tabs:
  - Settings: the owner (Copacker, another app with its name, or off), the switch, and any per-line options.
  - History.
  - Preview, shown before a Copacker line is turned on.
- **Missing access:** when a line needs a scope the account hasn't granted, the panel shows "Reconnect eBay" (or the
  platform in question) in place of the switch.

## Preview

Turning on a Copacker line opens its preview:

- **Quantities:** every listing with its current quantity, the new quantity, and the difference. Listings that will go to
  0 come first.
- **Prices:** current and new price per listing.
- **Orders:** the date orders will start being copied from, and what happens to earlier ones (they stay with the other
  app).
- **Confirming:**
  - "Turn on" confirms. Nothing is written until then.
  - The listings that need linking are listed underneath and aren't synced.

## History

Every write and movement can be traced to its cause ([quantity sync](quantity-sync.md#history)).

- **In a line's panel:** the writes on that line, newest first. Each shows the time, the listing, from and to, the cause
  (a linked order, receipt, hold, count change or reconcile) and the result, including the platform's error when it
  failed.
- **In an item's stock view** (from its row on Products): per location and per listing, the current numbers, then one
  merged timeline of movements and writes. Each entry expands to show its chain, for example the eBay order, then the
  on hand change, then the pushes to every channel.
- **Filters:** item, cause, platform and date.
- **Edits made outside the master:** an overwritten edit shows as its own entry ("Changed in eBay from 7 to 12, set back
  to 7").

## Editing counts

- **Shopify master:**
  - Stock numbers in Copacker are read-only, and each links to the item in Shopify.
  - Receiving and holds are the only changes Copacker makes, from their own screens.
- **Copacker master:**
  - The Inventory page (the supplier's today) edits on hand in place, and gains columns for committed, held and
    available.
  - Saving writes one "counted" movement per changed row, and pushes to channels follow within a minute.
  - With several Copacker locations later, a location picker sits above the table.
- **Channels:** with any master, numbers shown for channels are read-only.

## Purchase order screens

- **Supplier:** the purchase order shows Accept and Decline until it's answered. Decline asks for a reason. Accepting
  when stock is short shows the short lines and offers Propose changes.
- **Buyer:** the purchase order list and page show "Awaiting acceptance", "Accepted" or "Declined".
- **Receive:**
  - The Receive page replaces "Mark received" ([receiving](purchase-orders.md#receiving-at-your-own-locations)).
  - It has one row per item: shipped, received so far, and inputs for received and rejected.
  - "Receive all", Save and Finish receiving.
- **Amazon shipments:** Amazon's received counts show per line, with Amazon's status. There are no inputs.
- **Close:** a summary table of ordered, shipped, received, rejected, short and extra per line, then Close.

## Phones and accessibility

- **Phones:** the map becomes a list. Each channel has a section with its lines as rows (kind, owner, state), and
  tapping a row opens its panel as a sheet.
- **Desktop list view:** a "List" toggle shows the same list on desktop, for people who prefer it and for screen reader
  use.
- **Keyboard:**
  - Nodes and lines are focusable in lane order.
  - Each has an accessible name ("Quantities, Warehouse to eBay, Copacker, on").
  - Enter opens its panel.

## Storybook

Every new page and component gets a sibling `*.stories.tsx` with `play` tests ([Storybook](../../storybook.md)):

- the map, the node and line panels, the preview;
- the history list, the item stock view, Needs linking;
- the Receive page, the accept and decline bar, and the close summary.

Each is also checked in the integrated browser at desktop and phone sizes before it's done.
