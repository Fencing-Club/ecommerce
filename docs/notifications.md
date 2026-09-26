# Shopify webhooks and Amazon notifications

Copacker learns about order and stock changes as they happen: Shopify sends webhooks and Amazon sends notifications
to a queue. A daily reconciliation reads everything again to catch anything missed.

## Shopify webhooks

- Shopify posts to `/api/webhooks/shopify`. The route checks the HMAC of the raw body against `SHOPIFY_CLIENT_SECRET`
  and answers at once; the work is queued. `src/proxy.ts` leaves `/api/webhooks/` out of sign-in.
- Subscriptions are created through the Admin API when a store connects and again daily: orders create, update, cancel
  and delete, inventory level updates, and app uninstalled. Shopify only delivers to HTTPS, so a local app with an
  `http://` `APP_URL` skips subscribing.
- Events are gathered into five-minute periods. Each period starts the existing order sync or stock refresh three
  minutes after it ends, so a burst of orders reads Shopify once.
- An uninstall disconnects the store only once Shopify refuses the stored authorization, so a quick reinstall is kept.
- The privacy topics (`customers/data_request`, `customers/redact`, `shop/redact`) arrive at the same address. Shopify
  doesn't allow subscribing to them through the API: set the compliance webhooks URL to
  `<APP_URL>/api/webhooks/shopify` in each Shopify app's settings. Copacker stores no customer contact details, so a data
  request emails workspace owners the stored order details, a customer redaction needs no deletion, and a shop
  redaction erases the orders, stock snapshots and stock history copied from that store.

## Amazon notifications

Amazon delivers notifications only to Amazon SQS or EventBridge, not to HTTPS.

- Production queue: `copacker-amazon-notifications` in AWS account `316338643347`, region `us-east-1`. Its policy lets
  Amazon's notification account `437568002678` send messages. A message that fails five times moves to
  `copacker-amazon-notifications-dlq`, which keeps it for 14 days.
- The worker reads the queue as IAM user `copacker-worker`, which can only receive, delete, change the visibility of
  and read attributes on that queue. The worker service needs `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION=us-east-1` and `AMAZON_NOTIFICATIONS_QUEUE_URL`. Without the queue URL the worker doesn't read the queue
  and subscribing is skipped.
- When a seller connects, and daily, a job registers the queue as the app's notification destination (a grantless
  call) and subscribes the seller to `ORDER_CHANGE` and `FBA_INVENTORY_AVAILABILITY_CHANGES`. Amazon allows one
  subscription per type for each app and seller; a subscription pointing at another destination is reported, never
  taken over.
- An order change reads only the orders updated since the stored orders' end (`lastUpdatedAfter`), saves them and
  extends the stored period. Without a recent stored period in the current shape, a full sync runs instead. A
  throttled read reschedules itself rather than holding the worker. An FBA stock change starts an FBA stock refresh.
- As of 2026-09-26 the production destination is registered, and the seller's subscription was rejected with
  `400 InvalidInput`. Commit `3e9cad2` subscribes to `ORDER_CHANGE` with the event filter from Amazon's tutorial and
  keeps Amazon's error details; the subscription runs again on the next Amazon connect or daily run.

## Amazon apps per environment

The apps live in the Solution Provider Portal (Developer Central) under the Fencing Club developer account.

- **Aisle** (`amzn1.sp.solution.b446d45f-ec63-496a-bb76-4e541d313a82`): production.
- **Aisle Dev** (`amzn1.sp.solution.1a3ed765-2087-4715-adb3-01595ecc2e27`): local development. Created on 2026-09-26
  with the same roles as Aisle.
- **Aisle Sandbox**: Amazon's sandbox API only, which returns sample data.

A refresh token works only with the client ID and secret of the app that issued it, so the local `.env` holds Aisle
Dev's `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET` and `AMAZON_APPLICATION_ID`. Never set local
`AMAZON_NOTIFICATIONS_QUEUE_URL` to the production queue: the local worker would take production's notifications. To
test notifications locally, create a separate queue and let Aisle Dev subscribe to it.

## Daily reconciliation and failures

- Each worker makes sure a `reconcile:<date>` job is queued for 07:00 UTC; the job key keeps it to one run a day. It
  starts an order sync for every buyer connection, refreshes the stock scopes already in use and renews Shopify and
  Amazon subscriptions.
- A job that fails logs a `job_failed` event with its kind, key, attempt and error, and keeps the error on its row.
