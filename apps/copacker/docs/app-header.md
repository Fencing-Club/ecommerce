# App header

Every Copacker portal page has a top bar across the window (`components/top-bar.tsx`), with the sidebar and the page
under it (`components/shell.tsx`).

- **Left:** the workspace menu (`components/workspace-menu.tsx`): Copacker's mark and the workspace's name. The menu
  lists every workspace with its kind, the open one marked, then **New workspace** and **Workspace settings**. The bar
  doesn't name the kind, which leaves room for long names. Switching reloads, as `WorkspaceWatch` needs. On a computer
  the sidebar collapses from its rail or Ctrl+B, so the bar has no button for it.
- **Middle:** the search (`components/search-command.tsx`), a cmdk command menu: a 480px field, centered in the
  window, that says what it finds in the workspace ("Search purchase orders, products, and partners") with its
  shortcut.
- **Right:** **Create** (`components/create-menu.tsx`), the kind's create actions that the person can edit: a
  buyer's Purchase order, Import purchase order, Supplier and Forwarder; a supplier's Product, Catalog and Import
  products. A forwarder, or someone who can edit none of them, doesn't see it. Items link to their pages, and
  `/partners?add=supplier`, `/partners?add=forwarder` and `/products?import=true` open their sheet or dialog. Then
  the **Inbox** (`components/notifications-menu.tsx`), which opens an empty dropdown until its tasks and updates come,
  and the account menu (`components/account-menu.tsx`): the person's initials, then name and email, **Account
  settings**, Theme and **Sign out**.
- **On a phone:** a menu button that opens the sidebar as a sheet, the workspace, then search and the Inbox as 44px
  buttons. Create and the account move to the sheet's footer.

The sidebar (`components/app-sidebar.tsx`) lists the kind's pages in groups (`lib/navigation.ts`), with Settings
pinned at the bottom. A buyer's store orders are **Sales**. The open page, or the list a record belongs to, has a muted
fill and a primary marker on its leading edge. It's 240px wide, and 56px as a rail of icons.

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
