# Analytics reporting requirements

Planned P0 outcomes for [analytics](README.md), dependent on the [analytics data backlog](analytics-data-backlog.md).

## Product and order economics

Provide product comparisons and drill-down by channel, marketplace and period: sales, units, refunds, costs, profit,
margin and profit per unit. A product's financial history must explain:

- Historical purchase cost, prep, freight, duty, placement and inbound transport.
- Referral, fulfillment and payment fees; outbound shipping, pick-and-pack and packaging.
- Storage, aged inventory and other identifiable holding costs.
- Refunds, fees retained/credited, return processing, unsellable inventory, removal and disposal.
- Attributable advertising, shared expenses and their allocation basis.
- Cash reimbursements, inventory recoveries and reversals.

Each amount has source evidence and a classification: actual, allocated, estimated or missing. Keep business-level
unallocated costs visible. Separate gross profit, contribution after advertising and operating profit with documented
definitions; the current Overview's broad gross-profit calculation is not the final reporting taxonomy.

Historical cost corrections are allowed and explainable. Late landed-cost bills must update the relevant batches
without silently replacing all historical costs with current catalog prices. Show batch acquisitions, allocations,
remaining quantities/value and the effect of corrections.

## Returns

Refund, physical return and inventory loss are distinct events with separate dates. Report units and return rates by
product/reason, refunded revenue, recovered/retained fees, sellable and unsellable outcomes, unresolved dispositions,
shipping/processing/removal costs and resulting profit impact.

Support both event-period reporting and sales-cohort reporting: returns processed this month versus eventual returns
on this month's sales. State the denominator and observation window; recent cohorts may be incomplete. Link the views
without counting a refund twice or inferring that refunded inventory is sellable. Do not expense the same original
COGS again when an already-expensed returned unit is lost; restored inventory and later resale need consistent treatment.

## Reimbursements

Separate received reimbursements from potential recoveries. Explain reason, product, quantity, cash/inventory form,
matched incident and reversals. Discovery compares losses and discrepancies with recoveries and tracks evidence and
investigation status. Potential claims do not increase earned profit or confirmed receivables. Replacement inventory
must not become both cash income and inventory value without a justified accounting treatment.

## Shopify

Use the same economics and returns framework when a store is connected, including discounts, shipping revenue,
payment/dispute fees, bundles, shipping expense and pick-and-pack. Show unavailable billing, carrier, gateway and
advertising costs explicitly; allow imported actuals or labeled cost rules. Extend existing customer metrics only
after checking permission/history coverage. Repeat purchase and lifetime-value depth follow accurate order economics.

## Reconciliation and acceptance

- Product totals plus unallocated amounts reconcile to the business view.
- Posted/event dates and sale dates remain distinct; cash payouts/reserves are not operating expenses or revenue.
- Taxes, currencies, conversion dates, estimates and incomplete periods have explicit treatment.
- Report detail enriches stored financial transactions rather than duplicating their amounts.
- P1 marketplace copies retain original channel identity; copied Shopify orders never double-count marketplace sales,
  refunds, costs or inventory movements.
- A user can select a product/period, explain profit to source records and identify every remaining unknown cost.
