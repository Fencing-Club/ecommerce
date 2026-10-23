# Server query helpers

Shared helpers for server code that reads connections, writes provider copies, or pages analytics. Use them instead of
writing the query again.

## Database

- `Executor` (`@/db`): the database or a transaction. Helpers that can run in the caller's transaction take one as an
  explicit parameter. There is no ambient transaction.
- `excluded(table, ...columns)` (`@/db/helpers`): an upsert's `set` that takes those columns from the inserted row.
- `chunked(rows, size)` (`@/db/helpers`): batches for inserts, which stay under Postgres's parameter limit.
- Type a raw query's rows with `db().execute<Row>(sql)` rather than casting the result.

## Connected accounts

`src/server/provider-accounts.ts`:

- `connectedAccount(orgId, provider, { executor, externalId, lock })` is the workspace's connection, or null.
  `externalId` limits it to one account; `lock` locks the row for the rest of the transaction.
- `requireConnectedAccount` throws "Connect … in Settings first" instead of returning null.
- `shopifyStoreSnapshot(orgId, domain)` is the condition for the Shopify store's catalog snapshot.

`connection()` (`src/server/connections.ts`) adds the access token. It locks the row only to renew an expiring
Shopify token, so concurrent jobs renew it once.

## Purchase orders and shipments

- `accessibleShipment(s, id, { executor, lock })` (`src/server/access.ts`): a shipment on a PO the workspace can open,
  with that PO and its supplier, or a `NotFoundError` (404). `lock` reads the PO and then the shipment again `for
  update` in the caller's transaction, the order every shipment change locks them in.
- `src/server/order-history.ts`: `recordEvent(executor, orderId, actor, event)` adds to a PO's timeline;
  `reviseOrder(tx, order, data, { actor, reason, set })` saves the PO's next revision with its history row; and
  `queuePoEmail(tx, order, supplier)` emails a revision to a supplier that has joined, once per revision.
- `@repo/copacker-shipments/states`: the shipment states, their groups (released, packed, finished and the rest), and
  `canEditPacking` and `canReopenPacking`, shared by the server and the pages; see
  [shipment states](../../../packages/copacker-shipments/docs/README.md#shipment-states). `src/lib/shipment-states.ts`
  keeps only the label kinds a released shipment shares (`releasedLabelKinds`). `refusePendingChanges`
  (`src/server/orders.ts`) keeps packing waiting while a supplier's proposed changes are with the buyer.

## Sales sync copies

`src/server/sales-sync-coverage.ts`:

- `lockSyncScope(tx, scope)` locks the sales sync revision a copy belongs to, after its account's connection when the
  scope names one. It throws `SyncSupersededError` when the account was disconnected or a newer sync started.
- `syncCoveredPeriods(scope, assertOwned, copy)` copies a provider's history period by period into one of the sync's
  covered ranges: Amazon's fees, its daily FBA stock, and Shopify Payments' balance. A failure is recorded on the sync.
- `publishAnalyticsFeed` (`src/server/analytics-feed-store.ts`) saves a page of Amazon or Shopify evidence with its
  feed state, under the same locks.

## Analytics pages

`analyticsPage(orgId, input, scope, (tx, snapshot) => …)` (`src/server/analytics-snapshot.ts`) runs one page in a
read-only, repeatable-read transaction after taking its snapshot. The snapshot covers every table in its `versioned`
list; add a table there when a page starts reading it.
