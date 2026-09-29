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

## Decisions

| Topic                | Decision                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page         | **Home** for every kind: a task queue and a pipeline, open to everyone. Reports move to **Analytics**, which keeps the Overview's prices rule. |
| Naming               | A buyer's store orders are **Sales**. A PO is a **Purchase order** to the buyer and forwarder, and an **Order** to the supplier, with "From Harbor Goods" on the record. |
| Shared records       | A PO and its shipments have one URL for everyone: `/orders/[id]` and `/orders/[id]/shipments/[shipmentId]`, rendered from the viewer's side. Workspace-owned objects (products, customers, partners) are scoped to the workspace. |
| Shipments            | A shipment is a child of its PO in the URL and breadcrumb; the Shipments list stays as a cross-PO view. Packing becomes its own task flow. |
| Next step            | Every PO and shipment shows a lifecycle tracker and one **Next step** card from `server/workflow.ts`, instead of per-state alerts.       |
| Lists                | Views with counts replace stat cards; filters and sort live in the URL.                                                                   |
| Save model           | One component, the **action bar**, for unsaved changes, task flows, proposals and bulk selection: floating on desktop, docked on a phone. Lifecycle trackers, next step cards and segmented controls are single components too. |
| Packing requirements | Each Amazon network's carton, unit-label and carton-label rules show on the supplier's order before packing, check live in the Cartons step, and are added to a buyer's PO automatically. AWD China waits for its booking method. |
| Content density      | Only what the task needs now: no page subtitles, definitions in info tips, long rule lists behind Show all, consequences in confirm dialogs, one dismissible banner at most. |
| Phones               | Every horizontal visualization has a phone form (stage lists, compact lifecycle, stacked route bars, vertical timelines), and every page that uses one has a phone design. |
| Settings             | Split into Account and Workspace settings, a route per section, with its own navigation.                                                  |
| Forwarder            | Organized around shipment legs: Home, Shipments, Purchase orders, Clients. No new permission area.                                        |
| Notifications        | The bell becomes **Inbox**: To do from Copacker's own tasks now, Updates through Novu later.                                               |
| Visual               | Copacker's orange `primary`, Geist, borders over shadows. Workspace kind colors only on the switcher's chip.                              |
| Lead times           | Analytics measures every handoff: supplier production, pickup to forwarder, and a forwarder's time per PO from its last shipment's arrival until received. Route history will estimate a new PO's arrival. |

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
| `/partners` sheets                     | `/partners`, `/partners/[id]`                        | Partner page new                             |
| —                                      | `/products/import` (supplier)                        | Was a dialog                                 |
| —                                      | `/shipments`, `/clients`, `/clients/[id]` (forwarder) | New for forwarders                          |
| `/settings#section`                    | `/settings/<section>`                                | Anchors redirect                             |

## Permissions

- The `overview` area becomes `analytics`, with the same rules (View only, needs prices). Existing access carries
  over. Home and Inbox need no area.
- A forwarder's Shipments and Clients follow its `orders` access. Mark shipped still needs Edit.
- Nothing else in `src/lib/access.ts` changes. `areasFor` and the member page list pages in the new sidebar order.

## Rollout

Each phase ships on its own, behind no flag, with its Storybook stories and play tests, e2e updates and browser
acceptance at desktop and phone sizes.

1. **Shell and names:** top bar with the switcher, Create and account menus; sidebar groups and counts; Sales renamed;
   page header component; status tones.
2. **Settings split:** the settings layout, a route per section, the member page, the action bar.
3. **Records:** lifecycle tracker, Next step card and tabs on PO and shipment pages; nested shipment routes; the Pack
   shipment flow; proposal review inline.
4. **Home, Inbox and Analytics:** the task source, Home per kind, Inbox To do, Analytics tabs from the Overview's cards.
5. **Lists:** views, filter bar and URL state on every index; stat cards removed.
6. **New pages:** partner, buyer product, sales order, forwarder Shipments and Clients, supplier Import products.
   The forwarder's Mark received step, and the Lead times tab once it has data.
7. **Inbox Updates** once Novu delivers notifications.
8. **Route estimates:** a new PO's suggested required-by date and Restock's lead time from its route's history.

## Open questions

- ~~Should a forwarder receive a shipment at its warehouse?~~ Yes: Lead times measure a forwarder from arrival, so
  **Mark received** is a new workflow step (and the buyer records the arrival date for a forwarder not on Copacker).
- Lead times show no money. Should that tab open to members with Purchase orders or Partners access but no prices?
- AWD China: which rules does it need beyond AWD US (country of origin marks, AGL carton labels), and how is it booked?
  Its column in the packing requirements waits for the answer.
- Does Analytics need its own member access separate from prices, or is "prices" enough?
- Should Home's pipeline count shipments or purchase orders when a PO ships in parts?
- Workspace rename in General: WorkOS organization names follow it?
