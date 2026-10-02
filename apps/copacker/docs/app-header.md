# App header

Every Copacker portal page has a top bar across the window (`components/top-bar.tsx`), with the sidebar and the page
under it (`components/shell.tsx`).

- **Left:** Copacker's mark and name, linking home. The workspace isn't in the bar; its switcher tops the sidebar.
- **Middle:** the search (`components/search-command.tsx`), a cmdk command menu: a 480px field, centered in the
  window, that says what it finds in the workspace ("Search purchase orders, products, and partners") with its
  shortcut. In a window too narrow to center it, it narrows rather than covering Copacker or the actions.
- **Right:** **Create** (`components/create-menu.tsx`), the kind's create actions that the person can edit: a
  buyer's Purchase order and Import purchase order; a supplier's Product, Catalog and Import products. A forwarder, or
  someone who can edit none of them, doesn't see it. Items link to their pages, and `/products?import=true` opens its
  dialog. Suppliers and forwarders are added from Partners. Then the **Inbox** (`components/notifications-menu.tsx`),
  which opens an empty dropdown until its tasks and updates come.
- **On a phone:** a menu button that opens the sidebar as a sheet, Copacker, then search and the Inbox as 44px
  buttons. Create isn't on a phone; each list page's primary action covers it.

The sidebar (`components/app-sidebar.tsx`) starts with the workspace switcher (`components/workspace-menu.tsx`): the
workspace's kind tile with its initials, its name and chevrons, and on the rail just the tile. The menu lists every
workspace with its kind, the open one marked, then **New workspace** and **Workspace settings**. The switcher doesn't
name the kind, which leaves room for long names. Switching reloads, as `WorkspaceWatch` needs. Under it, the sidebar
lists the kind's pages in groups (`lib/navigation.ts`), with Settings pinned at the bottom, and the account menu
(`components/account-menu.tsx`) in its footer: the person's initials, name and email (just the initials on the rail),
opening to **Account settings**, Theme and **Sign out**. A buyer's store orders are
**Sales**. The open page, or the list a record belongs to, has a muted fill and a primary marker on its leading edge.
It's 240px wide, as is its sheet on a phone, and 56px as a rail of icons. On a computer, a toggle in the page's top
corner (`SidebarToggle`) collapses it to the rail and expands it again, as its rail and Ctrl+B do.

## Search

Clicking the search bar, or Ctrl+K (⌘K on a Mac) from anywhere, opens a panel over the bar with its text box where the
bar was, as Shopify's does. Before anything is typed it shows the pages and the newest POs. Typing finds, in the
sidebar's order and at most five of each:

- **Pages** from the sidebar's navigation (`lib/navigation.ts`), so both list the same pages.
- **Sales orders** (a buyer's), found on the server as the Sales page's search finds them. Choosing one opens
  `/sales?q=<order number>`.
- **Products** (a buyer's), one per Shopify product as the Products page lists it, matched on title, variation names
  and SKUs. Choosing one opens `/products?q=<title>`.
- **Purchase orders** the workspace can open, matched on reference, supplier and Amazon IDs.
- **Shipments** of those POs, named as their pages name them and matched on Amazon IDs, booking reference and the
  forwarder's tracking. A forwarder's workspace has none, since it can't open shipment pages.
- **Partners** (a buyer's suppliers and forwarders), matched on name, a supplier's legal name in Shopify and its
  contact. Choosing one opens `/partners?q=<name>`.

`GET /api/search` (`server/search.ts`) returns everything but sales orders once when the panel opens, and the browser
ranks matches with cmdk's scoring as the person types. Sales orders come from `GET /api/sales/orders?q=` once typing
pauses.
