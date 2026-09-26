# Overview page

`/overview` is where buyers land (`/` redirects buyers there and suppliers to `/orders`). It summarizes data Copacker
already stores; it reads nothing from Shopify or Amazon directly. The data comes from `overview()` in
`apps/copacker/src/server/overview.ts`, rendered by `components/overview.tsx`, with Recharts charts in
`components/overview-charts.tsx`.

## What it shows

- **Needs attention.** Items out of stock or running out before a reorder arrives, shipments waiting on the buyer or
  needing attention, items due for a reorder, restock sources that can't be read, failed or stale order and stock syncs
  (older than 2 days), Shopify's 60-day order limit, and unsent draft POs. Critical first, then warnings, then notes.
- **Units sold and orders** over the last 30 full UTC days against the 30 before. The comparison appears only when every
  connected source's stored orders cover both periods.
- **Units sold chart** by source (Amazon, then Shopify) for 30 days, 90 days, or 12 months summed by week. Days a
  source's stored orders don't cover are gaps, not zeros. Units are counted in SQL as the Orders page counts them: a
  bundle once, other lines at their current quantity.
- **Restock-derived figures**: stock by channel, stock value at cost, days of cover, lost selling days, reorder
  estimate and best sellers. They come from `restockAllChannels()`, which runs the restock plan for every channel with
  `restockDefaults` (56-day sales period, 56-day default lead time). Stock without a Shopify unit cost isn't valued, and
  the page says "Not available" instead of showing $0.
- **Purchasing**: open and draft PO value, open value by supplier, and PO value sent each month over the last year, in
  the currency most of the spend is in. A PO's month is when it was first submitted to its supplier.
- **Shipments in progress** grouped by stage; received, collected-and-closed and cancelled shipments are left out.

## Not shown yet

Sales orders carry no prices, so there is no revenue, margin, fee, refund or ad spend figure. Adding them means storing
line prices, discounts and refunds in the order sync first.
