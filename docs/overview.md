# Overview page

`/overview` is where buyers land (`/` redirects buyers there and suppliers to `/orders`). It summarizes data Copacker
already stores and reads nothing from Shopify or Amazon directly. `overview()` in `apps/copacker/src/server/overview.ts`
assembles it, with the sales queries and maths in `overview-sales.ts`. The page renders `components/overview.tsx`, the
cards in `overview-sections.tsx`, and Recharts charts in `overview-charts.tsx`.

## Days, channels and freshness

- **Time zone.** Days and months follow the store's time zone: the one chosen in Settings (`organizations.timeZone`),
  or else the viewer's computer's, which the browser reports in the `tz` cookie (`components/system-time-zone.tsx`,
  `server/store-time-zone.ts`; UTC until it has).
  `lib/time-zone.ts` finds the instant each day starts, so days around daylight saving changes are 23 or 25 hours.
- **Channel filter.** `?channel=amazon` or `?channel=shopify:<location>` narrows every card: restock figures to that
  channel, sales to that source (a Shopify location shows the Shopify orders with a successful fulfillment from it, so
  unfulfilled orders count for no location), and POs and their shipments to those going to Amazon or received at that
  location.
- **Period.** A picker like Shopify's (`components/period-picker.tsx`, `lib/date-range.ts`) chooses the days every sales
  figure covers: presets relative to today in the store's time zone (Today, Yesterday, Last 7/30/90/365 days, last
  week, month, quarter, 12 months or year, week/month/quarter/year to date) or any range on the calendar, in the URL as
  `?period=` or `?from=&to=`. Last 30 days is the default. Figures compare with the same number of days just before.
  The sales chart draws the period by day (up to about 3 months), week (up to a year) or month, with the previous
  period's total dotted. Stock, cover, upcoming spend, slow stock, shipments and purchasing are as of now; retail value
  uses the last 60 days' prices and inbound freight the year up to the period's end, whatever the period.
- **Currency.** Money is reported in the Shopify store's currency (US dollars without Shopify sales). Sales, fees and
  charges in other currencies (Amazon Canada, Mexico and Brazil) are converted at the European Central Bank's rate on
  the day each was placed or posted: `exchange_rates`, copied through Frankfurter after each Amazon sync, and the
  `fx_rate()` SQL function. An order in a currency without rates counts as unpriced.

## What it shows

- **Setup checklist** until Shopify, Amazon, order copies, stock, unit costs and a supplier are in place.
- **Needs attention:** items running out, shipments waiting or failing, reorders due, unreadable restock sources, failed
  or stale syncs, Amazon fees that couldn't be copied, orders still without prices, Shopify's 60-day order limit and
  unsent drafts. Critical first.
- **Sales, gross profit, units, average order value and orders** over the period, against the previous period when
  every source covers both. Sales are net product sales: after discounts, before tax, shipping and tips. Cancelled orders aren't counted.
  An Amazon order is priced once Amazon adds its proceeds (pending orders wait); an order whose payments all post at
  zero (a free replacement) counts at zero, with its units' cost. Shopify orders with a tag in Settings' excluded
  Shopify tags (default `Amazon`) are left out, here and on the Orders page and Restock. Shopify's Amazon sales channel
  tags its copies of Amazon orders `Amazon`, and Amazon's own orders count them. Amazon orders are read from the US,
  Canada, Mexico and Brazil (whichever the seller sells in); when Amazon is connected, the card says how many copies
  came from other marketplaces.
- **Gross profit** (with a line-by-line card) is sales with a unit cost, less:
  - the landed cost of the units sold (Shopify's unit cost, a bundle's being its components', plus the PO markup).
    Units Amazon resells after a return (Grade and Resell, SKUs starting `amzn.gr.`) cost nothing more: their cost
    and freight were counted when they first sold;
  - each order's own fees: Amazon's fees on the order payment, and Shopify Payments' processing fees (Amazon posts
    fees about two days after shipping; orders without them are estimated at the period's posted rate);
  - Amazon's inbound freight (its freight service, inbound placement and transport, AWD transport) posted over the last
    year (or the stretch Amazon's orders cover), as a cost per Amazon unit sold. Each charge names its shipment
    (`FBA…` or `STAR-…`); after each Amazon sync, `syncInboundShipments()` reads the units of each seller SKU in it
    (`amazon_inbound_shipments`), and the shipment's freight is shared by those units, so a SKU carries the freight of
    the shipments it came in. Freight for a shipment sent from a Copacker PO is in that PO's landed costs instead.
    What can't be traced to a shipment's contents (transfers from AWD to FBA, shipments Amazon has no record of) is
    spread over every Amazon unit sold;
  - monthly costs from Settings (costs no platform reports, such as an app billed to a card): each month's amount
    over the average month's days, for the days in the period it was paid. One set for a channel counts on the whole
    business and on that channel's view;
  - what the platforms posted in the period beyond order fees: Amazon refunds (net of the fees Amazon returns), Amazon
    ads, Amazon account charges (storage, placement, adjustments, less reimbursements), Amazon's multi-channel
    fulfillment fees for Shopify orders (shipments described as a fulfillment fee), and Shopify Payments'
    shipping labels, the Shopify bill when it's paid from payouts (plan and apps), dispute fees, and duties and
    import taxes. Payouts,
    transfers and reserves are cash movements and aren't counted. A Shopify location's view leaves out store-wide
    charges.
- **Sales by channel** chart: units or sales, 30 days, 90 days, or 12 months by week. Days a source's stored orders
  don't cover are gaps.
- **Inventory:** units on hand and on the way by channel, value at cost (a bundle held as its own item, such as a
  2-pack at Amazon, at its components' cost; Shopify's bundles are made from component stock and aren't counted), retail value (each unit at its recent average
  selling price in that channel, else its Shopify price) and the potential gross profit between them.
- **Days of cover** with links into Restock per group, and the sales lost to stockouts (stockout days times the
  in-stock sales rate, valued at the selling price).
- **Upcoming spend:** reorders due now plus sent POs past due or due within 60 days, by PO due date.
- **Trending products** (units in the last 30 days against the 30 before; items under 5 units in both are left out) and
  **slow-moving stock** (over 3 months of cover, or no sales in 8 weeks), valued at cost.
- **Best sellers, shipments in progress, open POs by supplier, and purchasing by month.**

Restock figures come from `restockAllChannels()` with the workspace's sales period and lead time from Settings
(`restockSettings()`, 60 days each by default). That's the slowest part, so the result is cached per workspace for five
minutes and dropped as soon as anything it reads changes (POs, shipments, stock snapshots, order syncs, product details,
suppliers, locations, connections, the sales period or lead time).

## Links into Restock

Restock accepts `channel`, `q` (search), `cover` (a days-of-cover group from `lib/cover.ts`) and `status=order` (items to
reorder). A link calculates straight away; each filter can be cleared on the page.

## Landed costs

A PO page has a buyer-only **Landed costs** card for freight, duty and other bills, entered in the PO's currency
(`landed_costs`, kept apart from the PO so the supplier never sees them and they can be added as bills arrive). A PO's
landed markup is its landed costs plus its charges and discounts, as a share of its products' price. Freight Amazon
charges for the PO's shipments (matched by the Amazon shipment or inbound order ID Copacker recorded when it created
them) is added automatically and listed on the card. Each product takes
the markup of its latest sent PO that has landed costs, so a PO whose freight isn't entered yet doesn't hide the one
before. The Overview applies it to Shopify unit costs for stock value, slow-stock value and gross profit; a bundle's
components use their own markup, else the bundle's. Shopify's unit cost and Restock's reorder estimate stay the
supplier's price.

Charges on the Shopify bill (Shopify Shipping labels, apps, the plan, tax transaction fees) aren't included unless the
bill is paid from Shopify Payments payouts: Shopify's API doesn't expose bills or label costs otherwise, and a bill paid
by card or the Shopify Balance card never appears in payouts. Shopify only takes a card or PayPal for bills, so apps and
the plan go in Settings as monthly costs; Shopify Shipping labels bought through the bill stay out. The gross profit
card says so.
