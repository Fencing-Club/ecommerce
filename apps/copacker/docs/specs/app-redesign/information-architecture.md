# Information architecture: the app as built

Part of the [app redesign spec](README.md). An inventory of every surface Copacker has today (routes, who reaches
them, what each holds and where it links), taken from `src/app`, `src/lib/navigation.ts`, `src/lib/access.ts`, the
`messages/en` catalogs and the Storybook page stories. The [redesign](design-spec.md) is measured against it.

## Surfaces at a glance

| Surface                | Routes                                                                                  | Who                                        |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Public site            | `/`, `/contact`, `/privacy`, `/terms`, `/unsubscribe`                                    | Anyone. `/` sends a signed-in person home. |
| System                 | `/maintenance`, `/setup`, error, not found, No access (`forbidden.tsx`)                  | Anyone                                     |
| Sign-in                | `/login`, `/login/[provider]`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite`, `/callback`, `/logout` | Signed out, or accepting an invitation |
| Getting started        | `/onboarding`, `/workspaces/new`                                                        | Signed in, profile or workspace missing    |
| Portal (authenticated) | Everything under `(portal)`, inside the shell                                           | A member of the active workspace           |
| Downloads and actions  | `/api/*` (PO PDF, labels, packets, exports, documents), `POST /api/action`              | Authorized per request                     |

## The shell

Every portal page renders inside `components/shell.tsx`:

- **App header** (`site-header.tsx`): Copacker logo on the left, search in the middle (Ctrl+K command menu over pages,
  sales orders, products, POs, shipments and partners), notifications bell on the right. The bell's dropdown is empty
  until Novu delivers notifications.
- **Sidebar** (`app-sidebar.tsx`): the workspace switcher at the top (initials, name, kind, other workspaces, New
  workspace), the workspace kind's pages in groups, Settings pinned at the bottom, then the account menu (theme, sign
  out). It collapses to icons and becomes a sheet on a phone.
- **Page header** (`PageHeader` in `components/common.tsx`): the sidebar toggle, a breadcrumb of parents, the title,
  an optional status badge and the page's actions on the right.

`WorkspaceWatch` reloads a tab when another tab switches workspace. The active workspace is a cookie.

## Navigation by workspace kind

The sidebar comes from `navigationFor(kind, permissions)`. A member sees only the pages they were given; Settings is
everyone's.

### Buyer

| Group      | Label           | Route        | Area        | Home |
| ---------- | --------------- | ------------ | ----------- | ---- |
|            | Overview        | `/overview`  | `overview`  | Yes  |
| Store      | Orders          | `/sales`     | `sales`     |      |
| Store      | Products        | `/products`  | `products`  |      |
| Store      | Restock         | `/restock`   | `restock`   |      |
| Purchasing | Purchase orders | `/orders`    | `orders`    |      |
| Purchasing | Shipments       | `/shipments` | `shipments` |      |
| Purchasing | Partners        | `/partners`  | `partners`  |      |
|            | Settings        | `/settings`  |             |      |

### Supplier

| Group    | Label     | Route        | Area        | Home |
| -------- | --------- | ------------ | ----------- | ---- |
|          | Overview  | `/overview`  | `overview`  |      |
| Sales    | Orders    | `/orders`    | `orders`    | Yes  |
| Sales    | Shipments | `/shipments` | `shipments` |      |
| Sales    | Customers | `/customers` | `customers` |      |
| Products | Products  | `/products`  | `products`  |      |
| Products | Inventory | `/inventory` | `inventory` |      |
| Products | Catalogs  | `/catalogs`  | `catalogs`  |      |
|          | Settings  | `/settings`  |             |      |

### Forwarder

| Group      | Label           | Route       | Area     | Home |
| ---------- | --------------- | ----------- | -------- | ---- |
| Purchasing | Purchase orders | `/orders`   | `orders` | Yes  |
|            | Settings        | `/settings` |          |      |

## Page inventory

Depth: **L1** is a sidebar page, **L2** a record or sub-flow reached from one, **L3** a task inside a record.

### Buyer pages

| Level | Page                           | Route                         | Holds                                                                                                                                                                  | Links to                                        |
| ----- | ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| L1    | Overview                       | `/overview`                   | Period and channel filters, setup checklist, Needs attention, six KPIs, sales trend, gross profit breakdown, open POs by supplier, upcoming spend, trending, Shopify customers, best sellers, inventory, days of cover, slow stock | Restock (filtered), POs, Products, Settings |
| L1    | Orders (sales)                 | `/sales`                      | Shopify, Amazon and eBay orders: search, source filter, date range, status, units, sales and fees. Rows open the order in its platform.                                 | External platforms                              |
| L1    | Products                       | `/products`                   | Shopify products with variations, available, on hand, incoming and on order by location, sync menu, label and country filters. Barcodes, labels, supplier, case packs and prep edit in dialogs. Reorder starts a PO. | New PO (`?variant=`)                   |
| L1    | Restock                        | `/restock`                    | Channel and supplier filters, sales period and lead time, estimated cost with lines, units, cases, volume and weight, lost sales, groups by supplier with Reorder.     | New PO, Partners                                |
| L1    | Purchase orders                | `/orders`                     | Stat cards (open, with suppliers, drafts), tabs All, Draft, With supplier, Closed, table. Next-step empty states (connect Shopify, invite supplier, create).          | PO, New PO, Import                              |
| L2    | New purchase order             | `/orders/new`                 | PO builder: supplier, destination, forwarder stop, lines from the catalog, terms, dates, adjustments, notes                                                            | PO                                              |
| L2    | Import purchase order          | `/orders/import`              | File intake and past imports                                                                                                                                           | Import review                                   |
| L3    | Review import                  | `/orders/import/[id]`         | Matching the file's lines to Shopify variants and a supplier                                                                                                           | PO once saved                                   |
| L2    | Purchase order                 | `/orders/[id]`                | Header actions (send, continue packing, ⋯), route pills, lines, instructions, shipments, documents, timeline with comments; rail with cost summary, details, landed costs. Proposal panel when the supplier proposes changes. | Shipments, Edit                    |
| L3    | Edit draft                     | `/orders/[id]/edit`           | PO builder on a draft                                                                                                                                                  | PO                                              |
| L1    | Shipments                      | `/shipments`                  | Stat cards, tabs Active, Received, Cancelled, All, Copacker shipments and the Amazon account's own inbound shipments                                                  | Shipment, Seller Central                        |
| L2    | Shipment                       | `/shipments/[id]`             | One page that changes with the workflow step: packing form, approval of invoice changes, Amazon creation, shipping labels, release, packet, cartons, pickup, documents, corrections, reconcile, cancel | PO                          |
| L1    | Partners                       | `/partners`                   | Tabs All, Suppliers, Forwarders, search, table. Add, edit, invite, addresses and remove in sheets and dialogs.                                                        |                                                 |

### Supplier pages

| Level | Page             | Route                   | Holds                                                                                                               | Links to               |
| ----- | ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| L1    | Overview         | `/overview`             | Period, Needs attention, four KPIs, orders received chart, open orders by stage, top products, top customers, inventory health, recent orders | Inventory, Orders, Products, Customers |
| L1    | Orders           | `/orders`               | Tabs To pack, Waiting, To ship, Shipped, Closed, search, table                                                      | Order                  |
| L2    | Order            | `/orders/[id]`          | The buyer's PO page without landed costs: lines, shipments, documents, timeline, proposal status                    | Revise, Shipment       |
| L3    | Propose changes  | `/orders/[id]/revise`   | Quantities, prices, added and removed products, terms, ready date, note                                              | Order                  |
| L1    | Shipments        | `/shipments`            | Tabs and table, customer column                                                                                     | Shipment               |
| L2    | Shipment         | `/shipments/[id]`       | Packing: commercial invoice, invoice details, pickup address and ready date, cartons, sticky save bar. Then labels, ready, shipped. | Order      |
| L1    | Customers        | `/customers`            | Search, table with catalog, orders, last order, amount spent. Catalog picker per customer.                          | Customer               |
| L2    | Customer         | `/customers/[id]`       | Spent, orders, since; orders table; contact; catalog                                                                | Order, Catalog         |
| L1    | Products         | `/products`             | Import and export, Add product, table with status, inventory, category, catalogs, price                             | Product, New product   |
| L2    | Product          | `/products/[id]`, `/products/new` | Title, description, category, code, options, photos, variants with price, basis, packaging, pricing breaks, quantity rules, catalogs | Catalogs |
| L1    | Inventory        | `/inventory`            | Tabs Tracked, Short, Not tracked, in-place on hand editing with a save bar                                          |                        |
| L1    | Catalogs         | `/catalogs`             | Table with status, assigned to, overrides, adjustment, products                                                     | Catalog, New catalog   |
| L2    | Catalog          | `/catalogs/[id]`, `/catalogs/new` | Adjustment, customers, products with fixed prices, volume pricing and quantity rules                        | Customers              |

### Forwarder pages

| Level | Page            | Route          | Holds                                                                                                                  |
| ----- | --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| L1    | Purchase orders | `/orders`      | The shared list (`LogisticsList`): views Active, Closed and All; no drafts, Needs you or prices                      |
| L2    | Purchase order  | `/orders/[id]` | `forwarder-view.tsx`: route, ship-on address, products and quantities, shipments with Mark shipped (freight cost, carrier, reference), documents |

### Settings (every kind, one page)

`/settings` is a single long page of two-column sections, in this order. Admin-only sections render read-only for
members.

| Section                  | Buyer | Supplier | Forwarder | Scope     | Who changes it |
| ------------------------ | ----- | -------- | --------- | --------- | -------------- |
| Profile                  | Yes   | Yes      | Yes       | Person    | Everyone       |
| Language                 | Yes   | Yes      | Yes       | Person    | Everyone       |
| Team                     | Yes   | Yes      | Yes       | Workspace | Admins         |
| Integrations (Shopify, Amazon, eBay, each with sync rows, locations, excluded tags, marketplaces) | Yes | | | Workspace | Admins |
| Restock defaults         | Yes   |          |           | Workspace | Admins         |
| Time zone                | Yes   |          |           | Workspace | Admins         |
| Monthly costs            | Yes   |          |           | Workspace | Admins         |
| Supplier profile         |       | Yes      |           | Workspace | Admins         |
| Addresses (delivery, or pickup for a supplier; warehouse for a forwarder) | Yes | Yes | Yes | Workspace | Admins |
| Delete (workspace, account) | Yes | Yes    | Yes       | Both      | Owner, person  |

### Entry and getting started

| Page            | Route                         | Holds                                                                    |
| --------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Sign in         | `/login`                      | Email and password, Google, Microsoft, SSO redirect                      |
| Sign up         | `/signup`                     | Name, email, password                                                    |
| Verify email    | `/verify-email`               | Six-digit code                                                           |
| Forgot, reset   | `/forgot-password`, `/reset-password` | Email, then a new password                                       |
| Invitation      | `/invite?kind=invite\|forwarder\|team` | Names the inviting workspace, signs up or in, links an existing workspace |
| Getting started | `/onboarding`                 | About you, what the company does, company, first address, beside a live workspace preview |
| New workspace   | `/workspaces/new`             | The same steps from "what the company does"                              |

## Objects and how they relate

```text
Workspace (buyer | supplier | forwarder)
├── Members (owner, admin, member) with page access View or Edit, and prices
├── Buyer
│   ├── Store connections: Shopify, Amazon, eBay ─► Sales orders, Products (variants), stock, fees
│   ├── Partners: Suppliers (linked supplier workspace or off Copacker), Forwarders
│   ├── Purchase order ─► lines (Shopify variants), destination (Amazon | own location), via forwarder
│   │   ├── Revisions, proposals from the supplier, landed costs, timeline and comments, documents
│   │   └── Shipments (one per partial) ─► packing list, cartons, invoice, Amazon shipment, labels, legs
│   └── Addresses, monthly costs, restock defaults, time zone
├── Supplier
│   ├── Customers (buyers that invited it) ─► catalog (one each)
│   ├── Products ─► variants, pricing, quantity rules, photos, stock
│   ├── Catalogs ─► products with overrides
│   └── Orders = the buyers' purchase orders, from the supplier's side, and their shipments
└── Forwarder
    └── Purchase orders passing through it, their shipments and legs, without prices
```

The purchase order is the shared record. One PO page renders three ways (`/orders/[id]`): the buyer's, the supplier's
and the forwarder's. A shipment is a child of a PO but has its own top-level list and route.

## Lifecycles the pages follow

- **Purchase order:** Draft, With supplier (submitted), Closed. A supplier's proposal is pending, approved or declined.
- **Shipment workflow steps** (`server/workflow.ts`): packing, approval, processing, labels, release, ship, forward,
  receive, complete, with retry, reconcile and cancellation. Statuses: Packing, Approval needed, Creating shipment,
  Needs shipping labels, Ready for pickup, Shipped, Shipped by forwarder, Received, Correction requested, Needs
  attention, Cancelled.
- **Supplier order stage** (derived): To pack, Waiting on customers, Ready to ship, In transit (Shipped), Closed.

## Findings

What the inventory shows, which the redesign addresses. Each is referenced by number from the design spec.

1. **One word, three objects.** "Orders" is a buyer's store sales at `/sales`, a supplier's purchase orders at
   `/orders`, while the buyer's own purchase orders are also at `/orders`. Search lists "Orders" and "Purchase
   orders" side by side.
2. **Routes change meaning by workspace.** `/orders`, `/products` and `/overview` render different pages per kind, and
   buyer-only pages redirect elsewhere silently. Links shared between people in different workspaces land on
   different things.
3. **The forwarder borrows the buyer's list.** Its only page shows Drafts and With suppliers counts and buyer tabs. A
   forwarder's work (what arrives, what's at the warehouse, what to ship onward) has no list, and it can't open shipments.
4. **The next step is split across two pages.** A PO's actions live on the PO, a shipment's on the shipment, and the
   packing form, approval, labels and release all share one shipment page that reshapes with each step. There's no
   visible progress through the lifecycle.
5. **Home mixes doing and reporting.** The buyer Overview puts Needs attention above a long analytics report, and the
   whole page is closed to members without prices, so they lose the attention list too. A supplier lands on Orders,
   not its Overview.
6. **Lists repeat their tabs as stat cards.** Purchase orders and Shipments show counts in cards, then again as tabs,
   with no filters beyond tabs and search.
7. **Settings is one scroll.** Personal (profile, language, delete account) and workspace settings (team, stores,
   restock, costs, addresses, delete workspace) share one page with no sub-navigation. Integrations nest their own
   settings inside cards. Addresses are split between Settings and Partners.
8. **Some records have no page.** A buyer's product, a partner and a sales order open in dialogs, sheets or another
   platform, so they can't be linked, searched to or given a history.
9. **Notifications are an empty bell.** Attention items exist only on Overviews, and nothing tells a supplier a PO
   arrived except email.
10. **Editors save differently.** The product editor and inventory use a sticky save bar, packing uses a footer bar with
    three buttons, settings sections each have a Save in a card footer, and the PO builder saves from its header.
