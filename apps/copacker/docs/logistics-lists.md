# Purchase order and shipment lists

`/orders` (for buyers and forwarders) and `/shipments` (for every workspace) render `LogisticsList` from
`src/components/logistics-list.tsx`, the approved Pen list layouts `awIJu` and `OzQcA`. A supplier's Orders page keeps
its own `SupplierOrderIndex`.

## Rows

The server sends every row the workspace can see, and the list sorts them into views and filters them in the browser.
`src/server/logistics-rows.ts` works out each row:

- **Route**: the forwarder the goods pass through, if any, then the destination.
- **Shipped** (purchase orders): the pieces in shipments that have shipped, been shipped on or been received, out of
  the order's pieces.
- **Status**: a purchase order shows Changes proposed while its supplier waits on a decision, otherwise the status of
  its shipment most in need of someone (needs attention, then approval, labels, corrections and packing), or With
  supplier before it has any.
- **Waiting on**: who acts next. The supplier packs, corrects and ships; the buyer approves, buys labels and fixes
  problems; Amazon creates and receives its shipments; a forwarder ships the goods on; a carrier delivers to the
  buyer's own location. A Seller Central shipment waits on the buyer while it's still being worked on there.
- **Stage**: draft, active, closed (received, or closed in Amazon's words) or cancelled.

## Views

Views live in the URL as `?view=`:

| View      | Holds                                    | Shown to                            |
| --------- | ---------------------------------------- | ----------------------------------- |
| Needs you | Rows waiting on the viewer               | Buyers' orders, every shipment list |
| Drafts    | Draft purchase orders                    | Buyers' orders                      |
| Active    | Rows still moving                        | Everyone                            |
| Closed    | Closed purchase orders                   | Orders                              |
| Received  | Received shipments                       | Shipments                           |
| All       | Everything, cancelled shipments included | Everyone                            |

Buyers' orders open on Needs you; everything else opens on All, or Active for a forwarder's orders. The list changes
`?view=` in place, and the page reads it from the URL rather than its loader, so a new view loads nothing. `?status=` is
no longer read: `/orders?status=draft` opens the default view.

## Finding and exporting

Search matches the reference, the supplier or customer, and Amazon shipment IDs. The supplier (or customer) menu sits
beside search; Status, Destination, Forwarder, Source (a buyer's shipments) and Ready date (shipments) are under
Filters. Each applied filter shows as a removable chip. Purchase orders can be selected and exported; the shipment list
exports what it shows. Columns other than the reference can be hidden. Lists show 25 rows a page.

Below 640 px of width the column chooser goes away and each row keeps its reference and status, with the supplier,
route and totals beneath them. A view with no rows says so inside the table.

## Code

`src/lib/logistics-list.ts` holds the rows' type and the pure parts, with unit tests: `filterRows` (search, filters
and the ready-date range), `sortRows`, `routeText`, the views each viewer has, and `listReducer`, the list's state,
where searching, filtering, sorting or another view goes back to the first page. The list kit's `usePagedRows` does the
page math on the page `listReducer` keeps. `LogisticsList` puts together `LogisticsToolbar` (the kit's `SearchField`,
filters, sort and columns), `AppliedFilterChips`, `LogisticsTable` and `LogisticsPagination` (the kit's
`PageButtons`), which word rows through `useLogisticsText`.
