# Customer order expense and demand schemas

Use [shared types](shared.md). These reads expose ingested primary records with source coverage. They do not imply a
complete retail CRM, financial ledger or mutation API for customer orders.

## Customer orders

`OrderFilter = {provider?:"shopify"|"amazon"|"ebay",connectionId?:Id,marketplaceId?:string,from?:Date,to?:Date,
timeZone?:string,sku?:Text<255>,paymentStatus?:string,fulfillmentStatus?:string,query?:Text<255>}`. Date filters select
source-created time. From/to must be supplied together. Status values are provider-scoped, allowlisted by the deployed
connection schema; a bare status shared by incompatible providers is rejected. Sort is `createdAt` or `updatedAt`,
ascending/descending, default createdAt descending with ID tie-breaker.

`CustomerOrder = {id,source:SourceRef,reference:string,createdAt,updatedAt,observedAt,
paymentStatus:string|null,fulfillmentStatus:string|null,items:CustomerOrderLine[],
totals?:{gross:Money|null,discount:Money|null,refund:Money|null,net:Money|null},
fulfillments:[{sourceId:string|null,state:string|null,carrier:string|null,trackingReference:string|null}],
refunds:[{sourceId:string|null,at:Instant|null,amount?:Money|null}],coverageIssues:Issue[]}`.
`CustomerOrderLine = {sourceLineId:string,variantId:Id|null,sku:string|null,title:string,quantity:Quantity,
fulfilledQuantity:Quantity,unitPrice?:Money|null,discount?:Money|null,fulfillmentOrigin:string|null}`.
Never populate fields absent from ingestion with invented zeroes or inferred tracking. Refund/fulfillment arrays carry
coverage issues when unavailable, distinguishing “not ingested” from known empty.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `order.list` | `PageInput & OrderFilter & {sort?,direction?}` | `Page<CustomerOrder>` | Orders; stored read, price redaction. |
| `order.show` | `{id}` or `{reference:Text<255>,connectionId,marketplaceId?:string}` | `CustomerOrder` | Orders; exact reference in provider account context, `ambiguous_reference` when needed. |
| `order.export` | `Export<OrderFilter & {columns?:OrderColumn[]}>`, csv/json | `ExportResult` | Orders; retained export, price redaction. |

`OrderColumn` is `id|provider|accountId|marketplaceId|reference|createdAt|updatedAt|paymentStatus|fulfillmentStatus|sku|
quantity|unit|gross|discount|refund|net|currency|observedAt`. Explicit unauthorized monetary columns fail permission checks;
default projections omit them. One CSV row represents a source order line and includes the order ID; order totals are
identified as order-level fields, never a per-line amount to sum. JSON preserves the nested records.

## Expenses

`ExpenseFilter = {type?:"platform_charge"|"ad_accrual"|"landed"|"recurring",connectionId?:Id,channel?:"amazon"|"shopify"|"ebay",
currency?:Currency,poId?:Id,shipmentId?:Id,orderId?:Id,from?:Date,to?:Date,timeZone?:string,
dateBasis?:"posted"|"incurred"|"effective"}`. Date range requires a basis and both endpoints; the requested type must
support that basis. Omitted type returns only types the caller may read and declares coverage/omissions.

`Expense = {id,type,revision:Revision|null,source:SourceRef|null,category:string,description:string,
amount:{value:string,scale:integer,currency:Currency},dateBasis,at:Instant|null,date:Date|null,
poId:Id|null,shipmentId:Id|null,orderId:Id|null,
inclusion:{basis:"posted_charge"|"accrual"|"manual_cost"|"recurring_definition"|"allocation",
replacesIds:Id[],underlyingExpenseId:Id|null,issues:Issue[]},recurrence:RecurringInput|null}`.
Source amounts retain decimal precision. Recurring definitions and allocated views are not extra incurred transactions.

`LandedInput = {type:"landed",poId,expectedPoRevision,kind:"freight"|"duty"|"other",
description:Text<200>,amountMinor:integer 1..100000000,currency}`; currency must equal the PO's, without implicit conversion.
`RecurringInput = {type:"recurring",name:Text<100>,amountMinor:integer 1..100000000,currency,
channel:"amazon"|"shopify"|"ebay"|null,startsOn:Date|null,endsOn:Date|null}`; monthly, inclusive end date, end not before start.
These preserve [landed](../../../../src/server/landed-costs.ts) and [monthly](../../../../src/server/monthly-costs.ts) rules,
with proposed revisioned updates. Imported charges/Ads accruals have no mutation input branch.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `expense.list` | `PageInput & ExpenseFilter` | `Page<Expense>` sorted selected date basis descending/ID | ExpenseRead, enforced per type and related entity. |
| `expense.show` | `{id}` | `Expense` | Same; allocation provenance retained. |
| `expense.export` | `Export<ExpenseFilter>`, csv/json | `ExportResult` | Same; measurement/inclusion columns cannot be dropped from default CSV. |
| `expense.create` | `{clientReference,data:LandedInput|RecurringInput}` | `Saved<Expense>` | Landed: B POWrite + `expenses:write`; recurring: B Admin(expenses:write) + P. Local cost record. |
| `expense.update` | `Guard & {data:LandedInput|RecurringInput}` | `Saved<Expense>` | Same by type; full replacement, cannot change type/PO binding. |
| `expense.remove` | `Guard & {expectedPoRevision?:Revision}` | `Removed` | Same; PO revision required for landed costs. |

## Demand report

`DemandSelection = Period & {connectionId?:Id,channelId?:Id,productId?:Id,locationId?:Id,sku?:Text<255>}`.
`DemandRow = {productId,variantId,channelId,locationId:Id|null,quantity:Quantity,soldAlone:number|null,
soldInBundles:number|null,stockoutDays:integer|null,observedDays:integer,issues:Issue[]}`.
`DemandReport = {period:Period & {fromInstant,toInstant},basis:"fulfilled_units_by_order_created_date",
rows:DemandRow[],totals:[{unit,piecesPerUnit,value:number}],issues:Issue[]}`. Totals group compatible units only.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `report.demand` | `DemandSelection` or `Export<DemandSelection>` csv/json | DemandReport or ExportResult | Demand; ingested fulfilled demand with existing bundle/stockout attribution. |

Coverage, retention, excluded orders and incomplete fees remain explicit in all results. These contracts do not add
incremental change feeds, deletion checkpoints or a general field-projection API; those remain a separate discussion.
