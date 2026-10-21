# Shipment and document schemas

Use [shared types](shared.md). Local shipments are editable workflow records; external-only provider discoveries are
read-only. The public `receive` operation maps to the existing received action. Public fields use poId/poRevision.

`ShipmentState = packing | approval | queued | creating | waiting_labels | ready | shipped | forwarded | received |
correction | needs_attention | cancelled`, retaining [current lifecycle rules](../../../api-contract.md#shipment-states).
`ShipmentFilter = {origin?:"copacker"|"external"|"all"="all",poId?:Id,supplierId?:Id,forwarderId?:Id,
destination?:"amazon"|"warehouse",state?:ShipmentState,network?:"fba"|"awd_us",connectionId?:Id}`.

`PackingDraft` and `Packing` reuse the exact corresponding
[shipment schemas](../../../../../../packages/copacker-shipments/src/index.ts), with `changes[].unitPrice` renamed `unitPriceMinor`.
The invoice ID is an authorized document ID; origin is a typed address. Drafts accept incomplete fields, submission
requires complete packing. Pieces, centimetres and kilograms retain existing validation and carton limits.

`Shipment = {id:Id|null,origin:"copacker"|"external",poId:Id|null,revision:Revision|null,poRevision:Revision|null,
state:ShipmentState|null,providerReferences:SourceRef[],providerStates:[{source:SourceRef,state:string}],
network:"fba"|"awd_us"|null,packing:Packing|null,route:Leg[],documents:ShipmentDocuments,
allowedActions:string[],next:{operation:string,actor:"buyer"|"supplier"|"forwarder"|"worker"}|null,
issues:Issue[],operation:Operation|null,statusQuery:StatusQuery|null,observedAt:Instant}`.
`Leg = {kind:"supplier_dispatch"|"forwarder"|"destination",partnerId:Id|null,addressId:Id|null,
state:"pending"|"shipped"|"received",carrier:string|null,reference:string|null,freight?:Money|null}`.
`ShipmentDocuments = {invoice:Artifact|null,labels:[{id,type:"carton"|"shipping",artifact:Artifact,
assignments:[{cartonId:string,page:positive integer}]}],packet:Artifact|null}`. Unavailable external fields remain null.

`ShipmentGuard = {id,expectedRevision,expectedPoRevision}`. All guarded operations validate both aggregate versions;
do not replace them with provider status strings. Lifecycle results include every split shipment, not only the first.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `shipment.list` | `PageInput & ShipmentFilter` | `Page<Shipment>` sorted observedAt/typed identity descending | ShipRead; declared provider reads for external discovery, partial coverage on outage. |
| `shipment.show` | `{id,operationId?:Id}` | `Shipment` | ShipRead; local ID only, exact associated run when selected. |
| `shipment.lookup` | `{provider:"amazon",connectionId,kind:"fba_shipment"\|"fba_inbound_plan"\|"awd_order",externalId}` | `{shipments:Shipment[]}` | ShipRead; typed provider lookup, may resolve one or several linked records. |
| `shipment.create` | `{poId,expectedPoRevision}` | `Saved<Shipment> & {resumed:boolean}` | B/S ShipWrite; create/resume permitted packing draft. |
| `shipment.packing.show` | `{id}` | `{shipmentId,revision,poRevision,draft:PackingDraft,availablePieces:[{itemId,pieces}],issues:Issue[]}` | ShipRead. |
| `shipment.packing.save` | `ShipmentGuard & {draft:PackingDraft}` | `{shipmentId,revision,poRevision,savedAt}` | B/S ShipWrite; full draft save only. P required to change prices; otherwise keep PO prices server-side. |
| `shipment.check` | `{id,packing?:Packing}` | `Check & {requiresApproval:boolean}` | B/S ShipWrite; advisory validation, no reservation. |
| `shipment.submit` | `ShipmentGuard & {packing?:Packing}` | `{shipments:Shipment[],operation:Operation,statusQuery:StatusQuery}` | B/S ShipWrite; validate/reserve, split networks, queue approval/provider creation. Without packing use saved draft. |
| `shipment.approve` | `ShipmentGuard & {updateCost:boolean,costPreviewId?:Id}` | `Saved<Shipment> & {poRevision,costWrite?:WriteResult}` | B ShipWrite + P; invoice acceptance. updateCost true additionally ChannelEdit + reviewed shared cost preview; external partial failure does not undo approval. |
| `shipment.correct` | `ShipmentGuard & {reason:Text<4000>}` | `Saved<Shipment>` | B ShipWrite; request correction/outdate documents, retain reservations under current rules. |
| `shipment.release` | `ShipmentGuard & {bookingReference:Text<255>}` | `Saved<Shipment>` | B ShipWrite; validate packet, release and notify supplier. No new carrier booking API. |
| `shipment.ship` | `ShipmentGuard` | `Saved<Shipment>` | S ShipWrite, or B for an unjoined supplier; dispatch physical leg. |
| `shipment.forward` | `ShipmentGuard & {freight:Money,carrier:Text<255>,reference:Text<255>}` | `Saved<Shipment>` | F ShipWrite, or B for unjoined forwarder; freight requires current invoice/price authority exception. Record forward leg and landed cost once. |
| `shipment.receive` | `ShipmentGuard` | `Saved<Shipment>` | B ShipWrite; current whole-shipment receipt. |
| `shipment.reconcile` | `ShipmentGuard & {providerReference:SourceRef}` | `Saved<Shipment>` | B ShipWrite; verify pinned account/origin/contents before binding uncertain create. `identity_unresolved`, `outcome_unknown`. |
| `shipment.cancel` | `ShipmentGuard & {reason?:Text<4000>}` | `Saved<Shipment>` | B ShipWrite; eligible cancellation, verify external cancellation before releasing reservation. |

State, revision, missing required documents and packing-validation failures apply to lifecycle mutations. An external
timeout never implies a provider create/cancel is safe to repeat. A forwarder can act only on its assigned leg; its
commercial-invoice access remains the existing explicit exception, not general price access to products or costs.

## Entity documents

`LabelSelection = {type?:"carton"|"shipping",documentId?:Id}`. Every upload uses `Transfer<D>` and returns either its
handoff or `{shipmentId,revision,poRevision,artifact:Artifact,issues:Issue[]}`. Each receipt names the resulting revision
for the next packing/lifecycle command. Uploaded files cannot be attached by supplying a storage key.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `shipment.invoice.upload` | `Transfer<ShipmentGuard>` | Upload receipt | B/S ShipWrite + P; invoice replacement, current state/revision checks after transfer. |
| `shipment.invoice.download` | `{id,documentId?:Id}` | `Artifact` | ShipRead + P, or assigned forwarder's explicit invoice exception. |
| `shipment.label.list` | `{id}` | `{shipmentId,revision,labels:ShipmentDocuments.labels}` | ShipRead; supplier access at release. |
| `shipment.label.upload` | `Transfer<ShipmentGuard & {type:"shipping",assignments:[{cartonId,page:positive integer}]}>` | Upload receipt with assignment coverage | B ShipWrite; one-based page mapping, no unassigned/nonexistent carton accepted on release. |
| `shipment.label.download` | `{id} & LabelSelection` | `Artifact` | ShipRead with entity/release checks; fixed PDF. |
| `shipment.packet.download` | `{id}` | `Artifact` | ShipRead under current packet/release rules; one consistent revision set. |

Uploads additionally return `invalid_media`, `file_too_large` or `validation_failed`; stale documents return
`document_outdated` (409). Operational PDFs are at most 32 MB/1000 pages. Once shipped, packing and documents cannot
change. Downloads recheck access after storage reads. None of these operations exposes an arbitrary file URL fetch.
