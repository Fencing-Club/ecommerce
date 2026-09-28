# Shopify webhooks, Amazon notifications and eBay notifications

Copacker learns about order and stock changes as they happen: Shopify, Amazon and eBay deliver events to SQS queues
that the worker reads (eBay's through Copacker's web service), so events wait through outages instead of depending on
Copacker answering. A daily reconciliation reads everything again to catch anything missed.

## Shopify events through Amazon EventBridge

Shopify delivers webhook events straight to AWS; nothing calls Copacker's web service.

- The production Shopify app ("Copacker", Dev Dashboard app `428016009217`) has an Amazon EventBridge source, added in
  the app's settings: `aws.partner/shopify.com/428016009217/copacker-production`, in AWS account `316338643347`,
  region `us-east-1`. It was accepted by creating an event bus of the same name.
- On that bus, rule `copacker-shopify-to-sqs` forwards every event to the SQS queue `copacker-shopify-events`. The
  queue only accepts messages from that rule. A message that fails five times moves to `copacker-shopify-events-dlq`,
  which keeps it for 14 days.
- The worker reads the queue with the same IAM user as the Amazon queue (`copacker-worker`, policy
  `read-amazon-notifications`, which covers both queues). It needs `SHOPIFY_EVENTS_QUEUE_URL` and, for subscribing,
  `SHOPIFY_EVENTBRIDGE_SOURCE_ARN` (`arn:aws:events:us-east-1::event-source/aws.partner/shopify.com/428016009217/copacker-production`).
- Subscriptions are created through the Admin API at the EventBridge source when a store connects and again daily,
  for every change to data Copacker copies. Orders (created, updated, edited, cancelled, deleted), refunds, order
  transactions and fulfillments start the order sync. Products, inventory items, inventory levels (updated, connected,
  disconnected) and locations start the stock refresh. App uninstalled disconnects the store. Fulfillment topics need
  `read_fulfillments`, so a store connected before Copacker asked for it subscribes to them after reconnecting; its
  shipments still arrive as order updates until then. Editing only a variant metafield (supplier SKU, ASIN, Amazon
  stock target, case quantity) in Shopify sends no event, so those edits reach Copacker with the
  next stock refresh, at the latest the daily reconciliation. Supplier SKUs edited in Copacker update its copy
  directly. Without `SHOPIFY_EVENTBRIDGE_SOURCE_ARN` (local development)
  nothing is subscribed, and syncs still copy orders.
- Each event carries the webhook's headers as metadata and its body as the payload. Events are gathered into
  five-minute periods; each period starts the existing order sync or stock refresh three minutes after it ends, so a
  burst of orders reads Shopify once.
- An uninstall disconnects the store only once Shopify refuses the stored authorization, so a quick reinstall is kept.
- The privacy topics (`customers/data_request`, `customers/redact`, `shop/redact`) can't be subscribed through the
  API; `apps/copacker/shopify.app.toml` routes them to the same EventBridge source and is released with
  `shopify app deploy`. A data request emails workspace owners the stored order details, a customer redaction removes
  the customer's Shopify ID from their orders, and a shop redaction erases the orders, stock snapshots and stock
  history copied from that store.
- Releasing `shopify.app.toml`: the Shopify CLI signed in with an account is refused for this app ("You are not a
  member of the requested organization"), because the app belongs to the store's organization. Signing in again, with
  any account, doesn't help: andrew@fencing.club is a member, and the Dev Dashboard works for it. The CLI's first
  request goes to App Management's global endpoint (`/app_management/unstable/graphql.json`), which can't place this
  account in an organization, so it refuses everything past the app's ID. The same token works on the organization's
  endpoint (`/app_management/unstable/organizations/104739197/graphql.json`). Deploy with the app's automation token
  instead (Dev Dashboard, Copacker, App settings, App automation token), kept out of git as
  `SHOPIFY_APP_AUTOMATION_TOKEN` in the local `apps/copacker/.env` and set in the environment of
  `shopify app deploy --config shopify.app.toml --no-release`. Compare the new version with the active one in the Dev
  Dashboard before releasing it. Scopes a new version adds reach a store when it reconnects.

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
- `ORDER_CHANGE` is subscribed with the event filter from Amazon's tutorial. A rejected subscription is logged with
  Amazon's error details and tried again on the next connect or daily run.

## Staging

Staging's worker reads `copacker-amazon-notifications-staging` and `copacker-shopify-events-staging` (each with a
`-dlq`) as IAM user `copacker-worker-staging`, which can read only those two. Its Shopify queue receives nothing until
Copacker Dev has an EventBridge source for staging with a rule to that queue, and `SHOPIFY_EVENTBRIDGE_SOURCE_ARN` is
set on staging's worker.

## Amazon apps per environment

The apps live in the Solution Provider Portal (Developer Central) under the Fencing Club developer account.

- **Aisle** (`amzn1.sp.solution.b446d45f-ec63-496a-bb76-4e541d313a82`): production.
- **Aisle Dev** (`amzn1.sp.solution.1a3ed765-2087-4715-adb3-01595ecc2e27`): local development and staging, with the
  same roles as Aisle.
- **Aisle Sandbox**: Amazon's sandbox API only, which returns sample data.

A refresh token works only with the client ID and secret of the app that issued it, so the local `.env` holds Aisle
Dev's `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET` and `AMAZON_APPLICATION_ID`. Never set local
`AMAZON_NOTIFICATIONS_QUEUE_URL` to the production queue: the local worker would take production's notifications. To
test notifications locally, create a separate queue and let Aisle Dev subscribe to it.

## eBay

Copacker reads a seller's eBay orders the way it reads Amazon's and Shopify's: a sync copies two years of orders, a
notification of a new order starts another, and the daily reconciliation reads the recent orders again.

### Keys and signing in

- The eBay Developers Program account (`acraswell00`) has one production keyset, "Copacker" (App ID
  `AndrewCr-Copacker-PRD-bc60a5fe0-8ce7ab14`), created on 2026-09-28. eBay allows one production keyset per account
  without a support ticket, so local development shares its keys. A refresh token works from any environment with the
  same keys. eBay only returns sign-in to an HTTPS address, so a seller connects through a deployed environment;
  local development reads the orders a deployed one would, but can't complete sign-in on `http://localhost`.
- Copacker needs `EBAY_CLIENT_ID` (App ID), `EBAY_CLIENT_SECRET` (Cert ID) and `EBAY_RU_NAME` (the redirect URL
  name). Without all three, Settings shows eBay as coming soon.
- The RuName is `Andrew_Craswell-AndrewCr-Copack-gjttg` (display title Copacker, OAuth enabled). Its accepted URL is
  `https://copacker.ai/api/connections/ebay`, its declined URL `https://copacker.ai/settings#integrations`, and its
  privacy policy `https://copacker.ai/privacy`. Sign-in asks for `sell.fulfillment.readonly` (orders),
  `commerce.identity.readonly` (the seller's user ID and username) and `commerce.notification.subscription`.
- A connection is stored under the seller's immutable eBay user ID; Settings shows their username. The refresh token
  lasts about 18 months; after that the order sync fails with `reconnect` and Settings offers Reconnect.
- Owners and admins of a buyer workspace connect and disconnect eBay, as with the other stores. eBay has no revocation
  call, so Disconnect only forgets the token.

### Orders

- Orders come from the Fulfillment API (`getOrders`, by creation date, two weeks at a time). Cancelled orders aren't
  copied, and a sync reads the last 30 days again, so an order cancelled later disappears. Nothing about the buyer is
  kept: no username, address or tax details.
- Sales are each line's price less the seller's promotions (no shipping or tax); fees are eBay's
  `totalMarketplaceFee`. eBay orders appear on the Orders page, the Overview (their own chart series) and in gross
  profit, with each line matched to a product by its custom label (SKU).
- Restock counts eBay units at the Shopify location that shipped the most of the store's own orders over the sales
  period, since eBay doesn't say where an order shipped from. A line without a SKU can't be placed and is reported
  with the eBay source's gaps.
- Shopify's eBay sales channel copies eBay orders into Shopify, tagged `eBay` and `eBay-US` (source `ebay`). With eBay
  connected, add `eBay` to the excluded Shopify order tags in Settings so each sale counts once.

### Notifications

eBay delivers notifications only to HTTPS, so they come to Copacker's web service, which sends them on through
EventBridge to a queue the worker reads.

- `/api/webhooks/ebay` answers eBay's endpoint check (a GET with `challenge_code`: the SHA-256 of the code,
  `EBAY_VERIFICATION_TOKEN` and the endpoint URL) and checks each POST against eBay's signature (the
  `X-EBAY-SIGNATURE` header, ECDSA, the key read with the app's token and kept for an hour). A notification that
  fails the check gets 412. One that can't be checked (no keys, or eBay won't hand over its key) gets 503 so eBay
  sends it again, except an account deletion notice, which is acknowledged.
- A checked notification goes to EventBridge as source `copacker.ebay` on the bus named by `EBAY_EVENT_BUS` (the
  account's `default` bus). Without `EBAY_EVENT_BUS` (local development) the route queues its work directly.
- On the default bus in account `316338643347`, `us-east-1`, rule `copacker-ebay-to-sqs` forwards source
  `copacker.ebay` to the SQS queue `copacker-ebay-events`. The queue only accepts messages from that rule. A message
  that fails five times moves to `copacker-ebay-events-dlq`, which keeps it for 14 days.
- The web service sends as IAM user `copacker-web`, which can only put events on the default bus. The worker reads the
  queue as `copacker-worker` (policy `read-amazon-notifications` covers it) with `EBAY_EVENTS_QUEUE_URL`.
- When a seller connects, and daily, a job makes sure the app's notification destination points at the webhook (the
  same address and verification token as the account deletion endpoint) and subscribes the seller to
  `ORDER_CONFIRMATION`, turning a subscription eBay disabled back on. Confirmed orders are gathered into five-minute
  periods, and each period starts one order sync three minutes after it ends. Local development skips subscribing:
  eBay only delivers to public HTTPS addresses.
- An account deletion notice for a connected seller erases their connection, orders and order syncs from every
  workspace. Copacker keeps nothing about buyers, so a buyer's notice changes nothing.
- eBay keeps a new production keyset disabled until the account deletion endpoint is set in the developer portal
  (Alerts & Notifications). The redirect URL name settings under User Tokens only appear once the keyset is compliant.
  The endpoint and token were entered on 2026-09-28, which enabled the keyset; eBay made the destination the order
  subscriptions reuse.

## Daily reconciliation and failures

- Each worker makes sure a `reconcile:<date>` job is queued for 07:00 UTC; the job key keeps it to one run a day. It
  starts an order sync for every buyer connection, refreshes the stock scopes already in use and renews Shopify and
  Amazon subscriptions.
- A job that fails logs a `job_failed` event with its kind, key, attempt and error, and keeps the error on its row.
