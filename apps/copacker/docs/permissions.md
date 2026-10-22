# Roles and page access

Everyone in a workspace has one of three roles, kept on their membership (`memberships.role` and `memberships.access`).
The model is in `src/lib/access.ts`; operation guards are in `src/server/authorization.ts` and current membership lookup
is in `src/server/workspace-session.ts`. Start's page and redirect boundary is in `src/server/auth.ts`.

| Role   | Who                                                  | Can do                                                                                   |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Owner  | The person who made the workspace, or who took it on | Everything. Nobody can change the owner's access or remove them.                         |
| Admin  | Anyone the owner or an admin makes one               | Everything the owner can, except changing or removing the owner, handing over or deleting the workspace. |
| Member | Everyone else                                        | Only the pages they're given, each at **View** or **Edit**, and prices if they're given them. |

## Pages

A member's pages are the sidebar's pages for their kind of workspace. Settings isn't one: everyone edits their own
profile there and sees the team, and admins change everything else.

| Workspace | Pages                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Buyer     | Overview, Orders, Products, Restock, Purchase orders, Shipments, Partners   |
| Supplier  | Overview, Orders, Shipments, Customers, Products, Inventory, Catalogs       |
| Forwarder | Purchase orders                                                             |

**View** opens the page and everything on it, read-only. **Edit** also changes what's there. The Overviews, a buyer's
Orders and Restock have nothing to change, so they're View only; Restock's Reorder needs Purchase orders: Edit.

What Edit covers where it isn't obvious:

- **Purchase orders:** creating, editing, sending, closing and deleting purchase orders, imports, answering a supplier's
  changes (or, for a supplier, proposing them), and landed costs. Commenting on a purchase order needs only View.
- **Shipments:** starting and packing a shipment, invoices, approving an invoice, shipping labels, marking shipped,
  forwarded or received, corrections, and Amazon retries, reconciliation and cancellation. A forwarder moves its leg on
  with Purchase orders: Edit.
- **Partners:** adding, inviting, editing and removing suppliers and forwarders, and the addresses kept for them.
- **Products (buyer):** barcodes and labels, supplier, case packs and preparation, and the other details Copacker
  keeps. Syncing stock needs only View.
- **Customers:** which catalog each customer sees.

## Prices and costs

A member sees prices and costs only with **See prices and costs** (`access.prices`, always `"view"`). A forwarder's
members don't get the switch, but a forwarder can download the commercial invoice, prices included. Without it:

- Pages about money close: the Overview (sales, profit and costs) and a supplier's Catalogs.
- Pages whose changes set prices are View only: Purchase orders, and a supplier's Products. `highestLevel` in
  `src/lib/access.ts` has the rules. Saving someone's access clamps their pages to them, and every check reads access
  through `effectiveAccess`, which applies them again, so a grant saved before a rule changed never gives more. So
  answering a supplier's proposed changes, which needs Purchase orders: Edit, needs prices too.
- Every other page leaves out prices, costs and totals: a purchase order's costs, totals, landed costs, its PDF and the
  commercial invoice; a shipment's invoice prices; products' prices, and the product export; Restock's costs and
  values; sales orders' amounts; and a supplier's order totals and what each customer spent.
- Approving an invoice accepts its prices, and shipping a leg on to a forwarder records its freight cost, so both need
  prices too. Packing without prices changes only supplier SKUs: the server keeps each line's purchase order price,
  whatever the form sends.

The server leaves them out, not only the page. Pages strip them before they reach the browser (`src/server/prices.ts`,
`withoutTotals`, `withoutPrices`, `unpricedChanges`), API routes leave them out of their JSON, and priced downloads
answer 403.

## Admins only

- The team: inviting, changing access, resending and cancelling invitations, and removing people. Nobody changes or
  removes themselves.
- Settings: store connections and their sync settings, the restock defaults, time zone, monthly costs, addresses, the
  supplier profile and the company website.
- Linking an existing supplier or forwarder workspace to a buyer's invitation, and retrying a failed job.

Monthly costs feed the Overview's profit, so members see them only with Overview access. A member sees a store that
needs reconnecting, and is asked to have an admin do it.

## The owner

A workspace always has exactly one owner. The owner makes a colleague the owner with **Transfer ownership** in the
team's menu (`transferOwnership` in `src/server/team.ts`): they take it on, and the previous owner stays on as an admin.

Only the owner deletes the workspace.

## Deleting

Settings ends with **Delete** (`src/server/deletion.ts`). Each is for good, and is confirmed by typing a name.

- **Delete workspace** (the owner, typing the workspace's name) deletes it and everything in it, for everyone: its
  team, invitations, settings, addresses, store connections and stored files, and a buyer's purchase orders and
  shipments or a supplier's products and catalogs. Its stores are disconnected first. A deleted supplier or forwarder
  shows as not on Copacker again to the buyers it worked with, who keep their purchase orders.
- **Delete account** (anyone, typing their email) deletes their sign-in, their place in every workspace and their
  profile, and signs them out. An owner transfers ownership of any workspace others use first. A workspace only they
  use closes with the account: its stores are disconnected, its partners unlinked and its invitations withdrawn. Its
  records stay, as its partners' purchase orders refer to them. Their comments and uploads stay with the purchase
  orders they're on.

## How it's enforced

- Every page calls `requirePage(s, area, level)` or `requireAccess`. Its loader reads through `pageResult`
  (`server/page-result.ts`), which answers the `AccessError` with a 403 and the No access title, and the route's
  `PortalPage` renders the portal's `forbidden.tsx` ("No access"). The Overview and `/` send someone to their first page
  instead. See [routes](routes.md).
- Every request checks too: `requireAccess`, `requireAdmin` and `requireOwner` throw an `AccessError`, which routes
  answer with 403 and its message, and read-only routes call `requirePage`.
- A route or page for one kind of workspace calls `requireBuyer` or `requireSupplier` (both `requireKind` in
  `server/authorization.ts`). Another kind throws an `AccessError` too: 403 with "Switch to a buyer workspace" or its
  supplier twin from a route, No access on a page. Switching workspace in another tab is the usual way to get there.
- The workspace session reads a member's access through `effectiveAccess`, so a membership whose saved grant no longer
  matches the team editor's rules, such as Purchase orders: Edit or Catalogs without prices, gets only what the rules
  allow, on every page and request. Catalog pages and downloads also check price access themselves.
- `server/workspace-pages.ts` prepares products, catalogs, customers, inventory, sales and restock data before rendering.
  It rechecks operation permissions, omits internal organization fields, removes unit prices and volume pricing when
  unavailable, and excludes customer order rows unless the member can open orders. Hiding a table in the browser does
  not protect the data sent to that browser.
- The sidebar, the header's search and the pages hide what someone can't use; `components/access.tsx` gives client
  components `useCan` and `useIsAdmin`, `ForAdmins` shows admins' controls, and `PageLink` keeps a link to a page
  someone can't open as plain text.

Invitations carry the role and pages chosen for them (`team_invitations.role` and `access`), and the colleague joins
with them.
