# Restock and purchase order schemas

These operations use [shared types and access profiles](shared.md). All quantities in a PO are pieces; restock rows
declare their sellable-unit conversion. The [workflow](../workflows.md#restock-to-draft-purchase-orders) defines pooled
Amazon targets, network allocation, report dependencies and transactional draft creation.

## Restock

`RestockSelection = {channelIds?:Id[],supplierId?:Id,days?:integer 1..730,leadTimeDays?:integer 1..730,
status?:"stockout"|"reorder"|"stocked"|"blocked"|"not_stocked"|"no_listing",sku?:Text<255>}`.
Defaults resolve from workspace settings; missing channel selection means all eligible channels, not an empty report.
`RestockRow` reuses [RestockLine](../../../../src/server/restock-plan.ts), with canonical product/variant/channel IDs,
source identifiers in SourceRef, monetary fields subject to redaction, and adds
`{rowId, dependencies:Dependency[], poolTargets:StockTarget[], poolCoverage:[{poolId,available:Quantity,
incoming:Quantity,targetGap:Quantity}], explanation:{rawNeed:number|null,leadTimeOrigin:"supplier"|"workspace"|"request",
inventorySnapshotIds:Id[],salesCoverageId:Id,openPoIds:Id[],issues:Issue[]}}`.

`RestockReport = {reportId,createdAt,expiresAt,settings:{days,leadTimeDays},channels:RestockChannel[],
rows:RestockRow[],dependencies:Dependency[]}`. `RestockChannel = {id,name,kind:"amazon"|"warehouse",connectionId:Id|null,
locationId:Id|null,eligible:boolean,issues:Issue[]}`. Source freshness and coverage also appear in the shared meta.

`PlanGroup = {reference:Text<80>,supplierId,destination:"amazon"|"warehouse",currency,deliveryId?:Id,
via?:{forwarderId,addressId},lines:[{rowId:string,purchaseUnits:positive integer,receiver?:"fba"|"awd_us"|"warehouse"}]}`.
Max 20 groups, 150 lines/group; duplicate row/network allocations in the same group fail. Warehouse groups require
deliveryId; Amazon lines require an explicit network in a reviewed plan. The same row may be split across networks
under the allocation policy; its combined selection is shown once in the plan's row totals.
`RestockPlan = {id,revision,reportId,expiresAt,state:"review"|"consumed",groups:PlanGroup[],
proposedOrders:PoDraft[],dependencies:Dependency[],issues:Issue[],totalsByCurrency:Money[],poIds:Id[]}`.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `restock.channel.list` | `{}` | `{items:RestockChannel[]}` | Restock; stored eligibility read. |
| `report.restock` | `RestockSelection` or `Export<RestockSelection>` csv/json | `RestockReport` or ExportResult | Restock; stores a reproducible report snapshot, no reservations. `source_unavailable`. |
| `restock.plan.create` | `{reportId,groups:PlanGroup[]}` | `RestockPlan` | Restock + B POWrite; stores reviewed plan, no POs or reservations. `stale_plan`, `validation_failed`. |
| `restock.plan.show` | `{id}` | `RestockPlan` | Restock + B PORead; redact money without P. |
| `restock.plan.create-pos` | `Guard` | `{planId,revision,poIds:Id[],orders:Po[],replayed:boolean}` | B POWrite; atomic creation of all reviewed drafts. `stale_plan`, `invalid_state`; no send/email/provider create. |

## PO input and records

`ProductRef = {variantId:Id}` or `{provider:"shopify",connectionId:Id,variantId:string}` where the second variantId is
a Shopify Variant GID. These branches are exclusive. Resolve and persist the Copacker identity before saving.

`PoDraft = {reference:Text<80>,supplierId,destination:"amazon"|"warehouse",deliveryId?:Id,
via?:{forwarderId,addressId},currency,dueDate?:Date,readyDate?:Date,paymentTerms?:Text<200>="",notes?:Text<8000>="",
adjustments?:[{description:Text<255>,amountMinor:signed integer -100000000..100000000}],items:PoLineInput[]}`.
Max 50 adjustments. `PoLineInput = {id?:Id,productRef:ProductRef,pieces:integer 1..1000000,
unitPriceMinor:integer 0..100000000,instructions?:Text<4000>,prepCategory?:PrepCategory,
suffocationWarning?:boolean,skuLabel?:boolean,receiver?:"fba"|"awd_us"|"warehouse"}`. Max 150 lines, unique resolved variants
under the existing order constraint; updates retain existing line IDs. Warehouse destination requires deliveryId.
Creation captures parent/supplier/address/product dependency revisions in `expectedDependencies:Dependency[]`.

The server supplies title, buyer SKU, inventory-item ID, ASIN/FNSKU, piecesPerSet and component/catalog snapshots using
the authoritative resolver. All current [orderInputSchema](../../../../../../packages/copacker-orders/src/index.ts) refinements
still apply, including valid pack multiples and nonnegative safe totals. `Po = {id,revision,state:"draft"|"sent"|"closed",
data:PoDraft,lines:PoLine[],shipmentIds:Id[],allowedActions:string[],documents:Artifact[],createdAt,sentAt:Instant|null}`.
`PoLine` is the normalized public `OrderItem` from that schema, with source IDs grouped into SourceRef, canonical
variantId retained separately, and `unitPrice` renamed `unitPriceMinor`. Price fields can be omitted on permitted reads.

`PoFilter = {state?:Po.state,supplierId?:Id,destination?:PoDraft.destination,dueFrom?:Date,dueTo?:Date,query?:Text<255>}`.
`PoHistoryEvent = {id,at:Instant,actor:{id:Id|null,name:string},kind:string,revision:Revision|null,
message:string|null,document:Artifact|null}`; kinds come from the existing event enum, with sensitive values redacted.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `po.list` | `PageInput & PoFilter & {sort?:"createdAt"\|"dueDate",direction?:"asc"\|"desc"}` | `Page<Po>`, default createdAt descending | PORead. |
| `po.show` | `ReadSelector` | `Po` | PORead; ambiguous display references fail. |
| `po.coverage` | `PageInput & {variantId?:Id,supplierId?:Id,destination?:PoDraft.destination}` | `Page<{poId,lineId,variantId,orderedPieces,reservedPieces,shippedPieces,receivedPieces,openPieces}>` | PORead; PO/line order; distinct stages, not additive totals. |
| `po.history` | `PageInput & {id}` | `Page<PoHistoryEvent>` sorted at/ID ascending | PORead; immutable versions/events/comments. |
| `po.check` | `{id}` or `{data:PoDraft}` | `Check` | B PORead + P for proposed commercial data; advisory provider identity reads, no writes. |
| `po.create` | `{clientReference:Text<64>,data:PoDraft,expectedDependencies:Dependency[]}` | `Saved<Po>` | B POWrite; local draft. |
| `po.update` | `Guard & {data:PoDraft,expectedDependencies:Dependency[]}` | `Saved<Po>` | B POWrite; draft replacement, omitted lines removed. `invalid_state`. |
| `po.submit` | `Guard` | `Saved<Po> & {shipmentIds:Id[]}` | B POWrite; sent revision, PDF/email and initial packing draft; document failures remain explicit. |
| `po.close` | `Guard` | `Saved<Po>` | B POWrite; closes eligible sent PO, cancels empty packing drafts. `invalid_state`. |
| `po.delete` | `Guard` | `Removed` | B POWrite; draft only, existing linked-import recovery semantics. |
| `po.comment` | `{id,message:Text<4000>}` | `{event:PoHistoryEvent}` | PORead + `purchase-orders:write`; no E/P requirement, append-only, idempotent. |
| `po.export` | `Export<{id:Id}>` pdf or `Export<PoFilter>` csv/json | `ExportResult` | PORead; PDF additionally P, collection redacts prices. |
| `po.label.list` | `{id,lineId?:Id}` | `{poId,revision,labels:[{lineId,type:"product"\|"warning",artifact:Artifact\|null,issues:Issue[]}]}` | PORead; existing supplier release/access rules. |
| `po.label.download` | `{id,lineId?:Id,type?:"product"\|"warning"}` | `Artifact` | Same policy; current permitted label sheets. |

## Supplier proposals and PO imports

`ProposalInput` reuses [proposalSchema](../../../../src/server/order-proposals.ts), renaming line `unitPrice` to
`unitPriceMinor`: `lines` (1..150), `paymentTerms`, nullable `readyDate` and `note`. Existing line IDs remain intact;
new lines require authoritative matching on approval. `Proposal = {id,revision,poId,poRevision,
state:"pending"|"approved"|"declined"|"withdrawn",data:ProposalInput,createdAt}`.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `po.proposal.create` | `{id:poId,expectedRevision:poRevision,data:ProposalInput}` | `Saved<Proposal>` | S POWrite; local proposal/notification; sent PO unchanged until approval. |
| `po.proposal.list` | `PageInput & {id:poId}` | `Page<Proposal>` sorted createdAt descending | PORead; priced values omitted without P. |
| `po.proposal.show` | `{id:proposalId}` | `Proposal` | PORead. |
| `po.proposal.approve` | `Guard & {expectedPoRevision}` | `Saved<Po> & {proposal:Proposal}` | B POWrite; new sent revision, documents and stock/identity checks. |
| `po.proposal.decline` | `Guard & {expectedPoRevision,reason?:Text<4000>}` | `Saved<Proposal>` | B POWrite. |
| `po.proposal.withdraw` | `Guard & {expectedPoRevision}` | `Saved<Proposal>` | S POWrite; own pending proposal only. |

`PoImport = {id,revision,state:"queued"|"running"|"review"|"saved"|"failed"|"cancelled",
connectionId,proposal:ImportProposal|null,issues:Issue[],poId:Id|null,source:Artifact,operation:Operation|null,
statusQuery:StatusQuery|null}`. `ImportProposal` reuses the exact
[import proposal schema](../../../../src/lib/import-proposal.ts), retaining extracted decimal strings and nullable
source evidence. Its Shopify candidate IDs stay scoped to the pinned connection and are resolved before draft creation.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `po.import` | `Transfer<{connectionId:Id}>` | Handoff or PoImport | B POWrite; stage PDF, extract/review, never send. |
| `po.import.list` | `PageInput & {state?:PoImport.state}` | `Page<PoImport>` sorted creation descending | B POWrite; import review contains commercial data. |
| `po.import.show` | `{id,operationId?:Id}` | `PoImport` | Same. |
| `po.import.source` | `{id}` | `Artifact` | Same; source PDF only. |
| `po.import.match` | `PageInput & {id,query:Text<500>}` | `Page<{variantId:Id,source:SourceRef,sku,title,supplierSku:string\|null}>` | Same; pinned-store identity read, no provider writes. |
| `po.import.update` | `Guard & {proposal:ImportProposal}` | `PoImport` | Same; revisioned corrections; unavailable identity lookup leaves proposal unchanged. |
| `po.import.apply` | `Guard & {reviewed:true,supplierId,destination,deliveryId?:Id,via?:{forwarderId,addressId},reference:Text<80>,dueDate?:Date,notes?:Text<8000>,expectedDependencies:Dependency[]}` | `{import:PoImport,po:Po}` | Same; one linked draft transaction; unresolved lines/totals fail. |
| `po.import.cancel` | `Guard` | `PoImport` | Same; cancel unsaved import, retain source. |

All proposal/import mutations can return revision/state/validation errors. Persistent import-to-PO and plan-to-PO links
make reapplication return the same drafts. Extraction evidence never becomes an instruction to invoke an operation.
