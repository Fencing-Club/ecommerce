# App redesign spec

Status: **proposed**. Nothing here is built yet. Written 2026-09-28 from an audit of the app and its Storybook pages.
When a part ships, its behavior moves into the regular docs (and [Roles and page access](../../permissions.md),
[App header](../../app-header.md), [Overview page](../../overview.md) change with it), and this spec is trimmed.

A redesign of the authenticated app for buyer, supplier and forwarder workspaces: the shell, navigation, every page
and its tertiary pages, and Settings. It keeps the product rules in [Copacker's product rules](../../domain.md), the
permission model and the stack (shadcn/ui on Base UI, Tailwind v4); it changes where things live and how pages behave.

## Pages

| Page                                                      | Covers                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Information architecture](information-architecture.md)   | Every surface as built, navigation by kind, objects, lifecycles, and findings   |
| [Foundations, shell and patterns](design-spec.md)         | Principles, tokens, top bar, sidebar, the five page templates, tasks, Inbox, states, permissions, responsive, accessibility |
| [Buyer workspace](buyer.md)                               | Home, Sales, Products, Restock, Purchase orders and their flows, Shipments, Partners, Analytics |
| [Supplier workspace](supplier.md)                         | Home, Orders, Propose changes, Pack shipment, Shipments, Customers, Products, Inventory, Catalogs, Analytics |
| [Forwarder workspace](forwarder.md)                       | Home, Shipments (legs), Purchase orders, Clients                                |
| [Settings and account](settings.md)                       | Account settings, Workspace settings, Team and member access, Integrations      |
| [Consistency](consistency.md)                             | One component or token per concept, canonical scenario data, the audit and how to repeat it |

The canvas in `apps/copacker/copacker.pen` holds the designs in frames named **Redesign**: a read me, the kit (top bar,
navigation item, status, buttons, tab), the as-built and proposed IA maps, and a row of desktop screens per area: buyer
home and lists, buyer purchasing records, buyer store, partners and analytics, supplier orders and fulfillment, supplier
products and catalogs, forwarder and shared surfaces (Inbox, command menu), Settings and account, and phone layouts (`Redesign — Mobile`).

The screens follow the [purchase order flow](../purchase-order-flow/README.md) and
[inventory sync](../inventory-sync/README.md) specs. An item those specs only propose carries the kit's **Optional**
marker: it's drawn now and built once it's decided.

## Decisions

| Topic                | Decision                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page         | **Home** for every kind: a task queue and a pipeline, open to everyone. Reports move to **Analytics**, which keeps the Overview's prices rule. |
| Naming               | A buyer's store orders are **Sales**. A PO is a **Purchase order** to the buyer and forwarder, and an **Order** to the supplier, with "From Harbor Goods" on the record. |
| Shared records       | A PO and its shipments have one URL for everyone: `/orders/[id]` and `/orders/[id]/shipments/[shipmentId]`, rendered from the viewer's side. Workspace-owned objects (products, customers, partners) are scoped to the workspace. |
| Shipments            | A shipment is a child of its PO in the URL and breadcrumb; the Shipments list stays as a cross-PO view. Packing becomes its own task flow. |
| Next step            | Every PO and shipment shows a lifecycle tracker and one **Next step** card from `server/workflow.ts`, instead of per-state alerts.       |
| Lists                | Views with counts replace stat cards; filters and sort live in the URL, through `nuqs`.                                                   |
| Save model           | One component, the **action bar**, for unsaved changes, task flows, proposals and bulk selection: floating on desktop, docked on a phone. Lifecycle trackers, next step cards and segmented controls are single components too. |
| Packing requirements | Each destination's rules (FBA, AWD US, your warehouse, and GWD once its rules are checked) show on the supplier's order before packing and check live in the Cartons step. They're added to a buyer's PO automatically, and the buyer confirms them before sending an order with several destinations or any AWD line. AWD US from China keeps AWD's rules and ships through Amazon Global Logistics. |
| Shipping and customs | Every PO says who arranges shipping (the supplier, you, the forwarder or Amazon) and who handles customs. Label, tracking, booking and bill of lading steps follow from them. |
| Acceptance           | A supplier on Copacker accepts or declines a PO before packing. Accepting holds the units; declining gives a reason, and the buyer edits and sends again or closes. |
| Receiving            | Shipments to your own locations are received on a task page, with received and rejected units per line. Amazon shipments show Amazon's counts. Closing a PO shows a per-line summary. |
| Combined shipments   | A forwarder combines shipments for the same buyer and destination into a combined shipment with its own page. Freight splits across the POs by chargeable weight. |
| Stock flow           | The inventory sync spec's Stock flow page lives in Workspace settings for buyers and suppliers: a map on desktop, a list on a phone. |
| Content density      | Only what the task needs now: a page description only where it adds something the page doesn't show, definitions in info tips, long rule lists behind Show all, consequences in confirm dialogs, one dismissible banner at most. |
| Phones               | Every horizontal visualization has a phone form (stage lists, compact lifecycle, stacked route bars, vertical timelines), and every page that uses one has a phone design. |
| Settings             | Split into Account and Workspace settings, a route per section, with its own navigation.                                                  |
| Forwarder            | Organized around shipment legs: Home, Shipments, Purchase orders, Clients. No new permission area.                                        |
| Notifications        | The bell becomes **Inbox**: To do from Copacker's own tasks now, Updates through Novu later.                                               |
| Visual               | Copacker's orange `primary`, Geist, borders over shadows. Workspace kind colors only in the workspace menu.                               |
| Lead times           | Analytics measures every handoff: supplier production, pickup to forwarder, and a forwarder's time per PO or combined shipment from the last arrival until received. Route history will estimate a new PO's arrival. |

## Routes

| Today                                  | Redesign                                             | Notes                                        |
| -------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `/` sends to `/overview` or `/orders`  | `/` sends to `/home`                                 | `homeFor` returns `/home` for every kind     |
| `/overview`                            | `/home` and `/analytics`                             | `/overview` redirects to `/analytics`, or `/home` without access |
| —                                      | `/inbox`                                             | New                                          |
| `/sales`                               | `/sales`, `/sales/[id]`                              | Renamed Sales; order page new                |
| `/products` (buyer)                    | `/products`, `/products/[id]`                        | Product page new                             |
| `/orders/[id]` shipments linked out    | `/orders/[id]?tab=items\|shipments\|documents\|activity` | Tabs in the URL                          |
| `/shipments/[id]`                      | `/orders/[id]/shipments/[shipmentId]`                | Redirect                                     |
| Packing inside `/shipments/[id]`       | `/orders/[id]/shipments/[shipmentId]/pack`           | Task flow                                    |
| Mark received on the shipment          | `/orders/[id]/shipments/[shipmentId]/receive`        | Task flow                                    |
| —                                      | `/shipments/combined/[id]`                           | New, for the forwarder and the buyer         |
| `/partners` sheets                     | `/partners`, `/partners/[id]`                        | Partner page new                             |
| —                                      | `/products/import` (supplier)                        | Was a dialog                                 |
| —                                      | `/shipments`, `/clients`, `/clients/[id]` (forwarder) | New for forwarders                          |
| `/settings#section`                    | `/settings/<section>`                                | Anchors redirect                             |
| —                                      | `/settings/customs` (buyer)                          | New                                          |
| —                                      | `/settings/stock-flow`, `/settings/integrations` (supplier) | New for suppliers; Stock flow is new for buyers too |

## Permissions

- The `overview` area becomes `analytics`, with the same rules (View only, needs prices). Existing access carries
  over. Home and Inbox need no area.
- A forwarder's Shipments and Clients follow its `orders` access. Record arrival, Combine and Ship onward need Edit.
- A supplier's Accept and Decline need `orders` Edit. A buyer's receiving needs `shipments` Edit.
- Stock flow and Customs are admin-only settings, read-only for members.
- Nothing else in `src/lib/access.ts` changes. `areasFor` and the member page list pages in the new sidebar order.

## Rollout

Each phase ships on its own, behind no flag, with its Storybook stories and play tests, e2e updates and browser
acceptance at desktop and phone sizes.

1. **Shell and names:** top bar with Copacker, Create and account menus; the sidebar's workspace switcher, groups and
   counts; Sales renamed;
   page header component; status tones.
2. **Settings split:** the settings layout, a route per section, the member page, the action bar.
3. **Records:** lifecycle tracker, Next step card and tabs on PO and shipment pages; nested shipment routes; the Pack
   shipment flow; proposal review inline.
4. **Home, Inbox and Analytics:** the task source, Home per kind, the Inbox with To do and Updates (on fixtures until
   Novu), Notifications preferences, Analytics tabs from the Overview's cards.
5. **Lists:** views, filter bar and URL state (`nuqs`) on every index; stat cards removed.
6. **New pages:** partner, buyer product, sales order, forwarder Shipments and Clients, supplier Import products.
   The forwarder's Record arrival step, and the Lead times tab once it has data.
7. **Novu:** the adapter that delivers Updates to the Inbox built in phase 4. Copacker launches once it's in.
8. **Route estimates:** a new PO's suggested required-by date and Restock's lead time from its route's history.

Screens for the purchase order flow and inventory sync specs ship with those features, not with a redesign phase:
acceptance, receiving and closing, shipping and customs fields, combined shipments, Global Logistics and GWD, Customs
settings and Stock flow. The inventory sync first slice comes first: supplier eBay, Stock flow, held units and Accept.

## Open questions

- ~~Should a forwarder receive a shipment at its warehouse?~~ Yes: Lead times measure a forwarder from arrival, so
  **Record arrival** is a new workflow step (and the buyer records the arrival date for a forwarder not on Copacker).
- ~~Lead times show no money. Should that tab open to members with Purchase orders or Partners access but no prices?~~
  No new access: Analytics stays one area that needs prices. Members without prices see measured lead times on the
  partner page, and they drive Restock and a new PO's required-by date.
- ~~AWD China: which rules does it need, and how is it booked?~~ It's AWD US shipped from China through Amazon Global
  Logistics, with AWD's rules. The buyer books it in Seller Central from Copacker's booking sheet.
- The purchase order flow spec plans the at-the-forwarder status, and its Closing section expects the arrival, but its
  Gates and Changes only propose forwarder arrival. Lead times need the arrival date; should it be planned everywhere?
- ~~Does Analytics need its own member access separate from prices, or is "prices" enough?~~ Prices is enough.
- ~~Should Home's pipeline count shipments or purchase orders when a PO ships in parts?~~ Each stage counts what it's
  about: purchase orders until they're with the supplier, shipments from Packing on ([Buyer Home](buyer.md#home-home)).
- Workspace rename in General: WorkOS organization names follow it?
