# Overview page

`/overview` is where buyers land (`/` redirects buyers there and suppliers to `/orders`). It summarizes data Copacker
already stores and reads nothing from Shopify or Amazon directly. `overview()` in `apps/copacker/src/server/overview.ts`
assembles it, with the sales queries and maths in `overview-sales.ts`. The page renders `components/overview.tsx`, the
cards in `overview-sections.tsx`, and Recharts charts in `overview-charts.tsx`.

## Days, channels and freshness

- **Time zone.** Days and months follow the store's time zone (Settings, `organizations.timeZone`; UTC until set).
  `lib/time-zone.ts` finds the instant each day starts, so days around daylight saving changes are 23 or 25 hours.
- **Channel filter.** `?channel=amazon` or `?channel=shopify:<location>` narrows every card: restock figures to that
  channel, sales to that source (a Shopify location shows the store's Shopify sales), and POs and their shipments to
  those going to Amazon or received at that location.
- **Freshness.** The line under the header says when each source's orders and stock last synced.

## What it shows

- **Setup checklist** until Shopify, Amazon, order copies, stock, unit costs, a supplier and the time zone are in place.
- **Needs attention:** items running out, shipments waiting or failing, reorders due, unreadable restock sources, failed
  or stale syncs, Amazon fees that couldn't be copied, orders still without prices, Shopify's 60-day order limit and
  unsent drafts. Critical first.
- **Sales, gross profit, units and orders** over the last 30 full days, against the 30 before when every source covers
  both. Sales are net product sales: after discounts, before tax, shipping and tips. Gross profit is sales less unit
  cost (Shopify's, a bundle's being its components') and Amazon's fees, counted only over sales with a known unit cost.
  Amazon posts fees about two days after shipping; orders without posted fees are estimated at the period's posted
  rate, and the card says so.
- **Sales by channel** chart: units or sales, 30 days, 90 days, or 12 months by week. Days a source's stored orders
  don't cover are gaps.
- **Inventory:** units on hand and on the way by channel, value at cost, retail value (each unit at its recent average
  selling price in that channel, else its Shopify price) and the potential gross profit between them.
- **Days of cover** with links into Restock per group, and the sales lost to stockouts (stockout days times the
  in-stock sales rate, valued at the selling price).
- **Upcoming spend:** reorders due now plus sent POs past due or due within 60 days, by PO due date.
- **Trending products** (units in the last 30 days against the 30 before; items under 5 units in both are left out) and
  **slow-moving stock** (over 3 months of cover, or no sales in 8 weeks), valued at cost.
- **Best sellers, shipments in progress, open POs by supplier, and purchasing by month.**

Restock figures come from `restockAllChannels()` with `restockDefaults` (56-day sales period and lead time). That's the
slowest part, so the result is cached per workspace for five minutes and dropped as soon as anything it reads changes
(POs, shipments, stock snapshots, order syncs, product details, suppliers, locations, connections).

## Links into Restock

Restock accepts `channel`, `q` (search), `cover` (a days-of-cover group from `lib/cover.ts`) and `status=order` (items to
reorder). A link calculates straight away; each filter can be cleared on the page.
