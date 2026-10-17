# Amazon removal and disposal evidence

The Amazon sales worker imports removal order detail and removal shipment detail after storage fees on initial
connection, manual sync and the daily schedule. This implements analytics A05 acquisition for US FBA requests.
Deployment, live-account validation and financial/inventory reconciliation remain pending.

## Sources and accounting boundary

`GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA` supplies request/update timestamps, removal order ID, type/source,
service speed, status, SKU/FNSKU, disposition, requested/cancelled/disposed/shipped/in-process quantities and removal
fee/currency. `GET_FBA_FULFILLMENT_REMOVAL_SHIPMENT_DETAIL_DATA` supplies request/shipment timestamps, order ID/type,
SKU/FNSKU, disposition, shipped quantity, carrier and tracking. Shipment status is retained when present.

`amazon_removals` stores each row with its source kind (`orders` or `shipments`), workspace, seller, request marketplace
and import time. Source codes remain unchanged, missing values remain null, and fee decimals remain exact. No ASIN,
fulfillment center, disposal completion date or fee posting date is invented. Optional order source/service speed and
shipment status may be absent. Timestamps must include an explicit timezone; ambiguous or invalid dates fail validation.

Order quantities are cumulative outcomes, not independent inventory events. Shipment quantities overlap order totals;
neither source updates stock, demand, COGS or profit. Shipment evidence cannot establish disposal or cancellation totals.
Fees remain reported evidence requiring currency-aware reconciliation against financial postings. Tracking is not proof
of warehouse receipt or a reimbursement entitlement. Order IDs are removal references, not customer sales order IDs.

## History and refresh

The target is twelve completed months plus this month through yesterday, requested in UTC monthly windows for US
marketplace `ATVPDKIKX0DER`. The importer validates order windows by request time and shipment windows by shipment time.
An old request can therefore have a shipment in a recent window; an order's later update stays in its request month.
The shipment date interpretation must be checked against live-account cross-month examples before rollout; the catalog
lists both dates but does not explicitly specify which filters the range. Out-of-window rows fail the whole import,
rather than being silently discarded or expanding claimed coverage. Target history is not verified account availability.

Current/previous months and incomplete windows refresh each sync. One older successful month last checked over 30 days
ago also refreshes, oldest check first. This catches later corrections on a rotating basis, not immediately for every old
open removal. Rows outside the moving target remain stored without automatic refresh. Longer history and monitoring old
unresolved removals are follow-up work. A successfully fetched month is source coverage, not completed removal operations.

A successful refresh replaces that source/month atomically with coverage. Identical source rows and split shipments are
preserved; repeat imports do not append duplicates. Internal row IDs are not stable reconciliation keys. Cancellation,
malformed documents or out-of-window rows preserve prior evidence but mark the latest attempt incomplete. Header-only
reports establish zero rows; missing reports do not. Permission/throttling errors stop that source for the current run.
Account/revision/lease checks guard publication. See shared [failure codes](amazon-reimbursements.md#coverage-and-failures).

## Coverage and next work

Buyer-only `GET /api/sales` exposes `sources[].removals.orders` and `.shipments`, each with `dateBasis`, `marketplaceId`
and `windows`. Window status includes exact target/successful bounds, completeness, row counts, import/check times and
error code. Other Amazon report coverage remains independent. No tracking or source rows are exposed by this status API.

Next, reconcile product/order references across returns, movements, removal outcomes, reimbursements and financial
postings, retaining unmatched or contradictory evidence. Live validation should confirm timestamp formats, shipment
range semantics, optional fields, historical availability, late changes and removal-fee granularity before analytics
allocation. Historical COGS and Shopify acquisition remain separate P0 dependencies; this does not close analytics P0.

Source: [Amazon FBA report catalog](https://developer-docs.amazon/sp-api/docs/report-type-values-fba).
