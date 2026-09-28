# Roles and page access

Everyone in a workspace has one of three roles, kept on their membership (`memberships.role` and `memberships.access`).
The model is in `src/lib/access.ts`; the server's checks are in `src/server/auth.ts`.

| Role   | Who                              | Can do                                                                      |
| ------ | -------------------------------- | --------------------------------------------------------------------------- |
| Owner  | The person who made the workspace | Everything. Nobody can change the owner's access or remove them.            |
| Admin  | Anyone the owner or an admin makes one | Everything the owner can, except changing or removing the owner.       |
| Member | Everyone else                    | Only the pages they're given, each at **View** or **Edit**.                 |

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

## Admins only

- The team: inviting, changing access, resending and cancelling invitations, and removing people. Nobody changes or
  removes themselves.
- Settings: store connections and their sync settings, the restock defaults, time zone, monthly costs, addresses, the
  supplier profile and the company website.
- Linking an existing supplier or forwarder workspace to a buyer's invitation, and retrying a failed job.

Monthly costs feed the Overview's profit, so members see them only with Overview access.

## How it's enforced

- Every page calls `requirePage(s, area, level)`, which renders the portal's `forbidden.tsx` ("No access") through
  Next's `forbidden()` (`experimental.authInterrupts`). The Overview and `/` send someone to their first page instead.
- Every request checks too: `requireAccess` and `requireAdmin` throw an `AccessError`, which routes answer with 403 and
  its message, and read-only routes call `requirePage`.
- The sidebar, the header's search and the pages hide what someone can't use; `components/access.tsx` gives client
  components `useCan`, and `PageLink` keeps a link to a page someone can't open as plain text.

Invitations carry the role and pages chosen for them (`team_invitations.role` and `access`), and the colleague joins
with them. Existing members kept what they could do when roles arrived: Edit on every page, and View on Partners.
