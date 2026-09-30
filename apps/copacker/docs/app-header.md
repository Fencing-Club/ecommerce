# App header

Every Copacker portal page has a header across the top of the window (`components/site-header.tsx`), with the sidebar
and the page under it, like Shopify's admin.

- **Top left:** Copacker's logo and name, and nothing else. The sidebar's collapse button starts the page's first row
  instead, beside its breadcrumb or title (`components/shell.tsx`).
- **Middle:** the search (`components/search-command.tsx`), a cmdk command menu. With room, it's centered in the
  window. Narrower, it fills the space between the logo and the bell with equal gaps. Below 30rem it becomes a button
  beside the notifications.
- **Right:** notifications (`components/notifications-menu.tsx`). The bell opens an empty dropdown: Copacker
  doesn't deliver notifications in the app.

## Search

Clicking the search bar, or Ctrl+K (⌘K on a Mac) from anywhere, opens a panel over the bar with its text box where the
bar was, as Shopify's does. Before anything is typed it shows the pages and the newest POs. Typing finds, in the
sidebar's order and at most five of each:

- **Pages** from the sidebar's navigation (`lib/navigation.ts`), so both list the same pages.
- **Orders** (a buyer's sales orders), found on the server as the Orders page's search finds them. Choosing one opens
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
