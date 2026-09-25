# Copacker application contract

This document is the integration handoff for the design agent. Page layout, components, styles, and visual design are owned by the design workstream. The backend workstream owns `src/server`, `src/db`, `src/app/api`, worker/scripts, shared `packages/aisle`, tests, infrastructure, and this contract.

## Authentication and responses

All business routes use the WorkOS session. The active workspace is selected with a server-set HttpOnly cookie and checked against live database membership on every request. No client-supplied organization grants access. Every mutation requires Origin equal to APP_URL. Never use browser-provided account credentials.

`POST /api/action`, content-type application/json, body `{ action, data }`. Success returns `{ ok: true }`, `{ id }`, or `{ redirect }`; failure returns HTTP 400 with `{ error }`. Show multiline validation errors in the relevant form. Refresh server data after successful mutations. Unexpected errors must not display raw database queries or tokens.

The UI should always send the last displayed numeric revision for a PO/shipment mutation. Revision conflicts require refresh, never silent overwrite.

## Commands

| Action | Data | Permission / result |
| --- | --- | --- |
| workspace.create | name, kind: buyer or supplier, optional next invitation URL | Authenticated user; creates owner membership |
| workspace.switch | id | Existing workspace member |
| team.invite | email | Workspace owner; exact-email invitation |
| team.accept | token | Verified invited email, no prior workspace needed |
| team.remove | userId | Owner; removes a member, cannot remove self |
| supplier.create | name, email | Buyer owner; invitation to supplier workspace |
| supplier.accept | token, orgId | Exact verified invited email; owner of the selected supplier workspace. Acceptance switches to that workspace and consumes the invitation once. |
| contact.create | name, kind: pickup or forwarder, address | Active workspace member |
| order.create | OrderInput | Buyer; catalog identities re-read from connected Shopify |
| order.submit | id, revision | Buyer; publishes PO, queues email with PDF attachment, creates first packing draft; returns ok and shipmentId |
| shipment.create | id (PO ID) | Buyer or assigned supplier; resumes the editable packing draft, or creates the next partial shipment; returns shipment URL |
| shipment.save | id, revision, orderRevision, draft | Buyer or assigned supplier; saves incomplete packing; returns revision and savedAt |
| shipment.check | id, optional packing | Buyer or assigned supplier; read-only preflight of provided packing or saved draft |
| shipment.submit | id, revision, optional packing | Buyer or assigned supplier; submits provided packing or saved draft, reserves quantities and queues approval or Amazon creation |
| shipment.approve | id, revision, updateCost: boolean | Buyer; updates PO and queues supplier SKU writeback |
| shipment.correct | id, reason | Buyer or assigned supplier; invalidates affected shipment documents |
| shipment.reconcile | id, amazonOrderId | Buyer; reads Amazon order and verifies reference before worker resumes |
| shipment.cancelled | id | Buyer; verifies CANCELLED in Amazon before releasing quantities |
| shipment.release | id, revision, bookingReference | Buyer; requires all carton, product and carrier label assignments |
| shipment.collected | id | Buyer or supplier; records reported collection, not carrier tracking proof |
| job.retry | id | Buyer owner; failed email/Shopify job for an accessible PO |

Canonical schemas are exported by `@repo/aisle`: orderInputSchema, itemSchema, packingDraftSchema, packingSchema, cartonInputSchema, addressSchema. Prices are integer minor currency units **per individual piece**; weights kg; dimensions cm. IDs are UUIDs. Buyer SKU, Shopify variant ID, and product names are read-only to suppliers. They propose supplier SKU and unit-price changes in `packing.changes`.

An order has one destination and one supplier. The first release permits submission only for `awd_us`; future destination values may appear as disabled/planned choices. Do not imply FBA/GWD support is live.

## Catalog and connections

- `GET /api/catalog?q=`: buyer-only Shopify search; returns variant id/title/SKU, product title, inventory item id/unitCost, supplierSku, asin, plus Amazon ASIN/FNSKU when the connected listing exposes them. An empty mapping is unknown, never an invented barcode.
- `GET /api/connections/shopify?shop=store.myshopify.com`: buyer owner authorization redirect. The same path receives the HMAC-verified OAuth callback.
- `GET /api/connections/amazon`: buyer owner OAuth redirect and callback. Single-use state is tied to user, organization, and provider.

## Documents

`POST /api/documents` is multipart: orderId, kind, file, and:

- invoice: shipmentId; official commercial invoice PDF, mandatory before packing submission.
- product_label: itemId; exactly one PDF page per variation, uploaded by buyer. Multiple pages are rejected. Replacing a label used by a released shipment requires a correction first.
- shipping_label: shipmentId and `assignments`, JSON array of `{ cartonId, page }`. Page is 1-based in uploaded PDF. Each page can map to one supplier carton. The server splits pages, preserves their dimensions, and stores each assignment. Multiple files can be uploaded to cover all cartons.

PDFs are limited to 32 MB and 1,000 pages. Paths and bucket keys are never supplied by the user. `GET /api/documents/:id` authorizes order access and returns a private attachment. Outdated documents cannot be downloaded. Suppliers cannot download carton/carrier labels before buyer release.

`GET /api/shipments/:id/packet` returns the released merged supplier PDF: packing list, checklist, one sheet per product variation, carton labels, shipping labels. Individual files remain available. Original page dimensions are preserved; print at actual size. The packing list shows supplier carton number, buyer SKU, supplier SKU, pieces/sellable units, cm/kg, and SSCC label number. It does not show PDF filenames/page numbers as carton identity.

## Shipment state and UI actions

| State | Meaning | Next action |
| --- | --- | --- |
| packing | Supplier is entering invoice, contacts, ready date, cartons | Upload invoice; submit packing |
| approval | Commercial changes await buyer decision | Buyer approves or requests correction |
| queued / creating | Worker checks eligibility, creates/confirms, retrieves labels | Refresh status; no manual repeat create |
| waiting_labels | Amazon carton labels are available | Buyer books AGL externally, uploads carrier labels, releases packet |
| ready | Label assignments complete and packet released | Supplier prints; mark collected after pickup |
| collected | Collection reported by a participant | Read-only historical shipment |
| correction | Existing documents outdated | Edit uncreated shipment, or resolve Amazon shipment before replacement |
| needs_attention | Provider request failed or write outcome uncertain | Show actionable error; buyer reconciliation |
| cancelled | Amazon cancellation verified | Quantities available for a new shipment |

The ready date is the supplier's local calendar date, not a confirmed pickup appointment. Copacker does not book AGL. Avoid wording implying Amazon has agreed to the requested date.

## Required UI coverage for the design workstream

- Workspace creation/switching, invitation landing (including new users), team administration.
- Buyer connections/settings, suppliers, saved pickup/forwarder addresses.
- PO create, draft review, submit, commercial revision history, failed notification/writeback status.
- Supplier PO details, invoice upload, proposed changes, carton form with duplicate/remove and real carton IDs.
- Buyer approval; waiting-for-labels booking handoff; page-to-carton carrier label assignment; release.
- Document download, packet print/download, correction/reconciliation/cancellation verification/collection actions.
- Empty, loading, validation, conflicting-revision, unconfigured-integration, and provider-failure states.

Live WorkOS/merchant OAuth and actual Amazon shipment acceptance remain separate verification gates from local implementation.

## Resumable packing and next steps

Submitting a PO automatically creates its first packing draft. The supplier can enter packing immediately without a separate create step. `shipment.create` resumes the existing editable draft; it creates another shipment only when there is no editable draft and unassigned PO quantity remains. Submitted partial shipments reserve quantities; saved drafts do not.

`shipment.save` replaces the complete draft snapshot, not a patch. It accepts incomplete addresses, missing measurements and blank form fields allowed by `packingDraftSchema`. Omit empty numeric fields or use zero while editing. Product IDs must still belong to the PO. Save on deliberate edits; the design workstream may debounce autosave. Use the returned shipment revision on the next save or submission. A conflicting revision requires reloading and reviewing changes, never silently overwriting another user's work. The current PO revision is required on every save. If another shipment's approved commercial changes update the PO, review the latest PO and save before submission.

```json
{
  "action": "shipment.save",
  "data": {
    "id": "<shipment UUID>",
    "revision": 1,
    "orderRevision": 1,
    "draft": {
      "readyDate": "",
      "origin": { "name": "Pickup contact" },
      "cartons": [{ "cartonId": "A6", "items": [{ "itemId": "<PO item UUID>", "pieces": 160 }] }]
    }
  }
}
```

Saving does not reserve quantities, queue a job, contact Amazon or send email. Invoice uploads return document IDs to include in the draft. Ordinary saves retain the uploaded invoice; corrections invalidate it. Avoid saving during an in-flight upload: if the shipment changes before upload completion, upload returns a conflict and must be retried.

`shipment.check` returns `{ revision, orderRevision, canSubmit, requiresApproval, issues, items }`. Each issue includes a stable code and message, plus field, cartonId or itemId where applicable. Each item reports orderedPieces, reservedPieces and availablePieces, excluding the shipment being checked. Preflight is advisory: final submission repeats the same rules under the order lock. It never creates an Amazon shipment.

`GET /api/orders/:id/workflow` is an authenticated, uncached view for the order handoff. It includes PO revision/status/destination, supplier name, ordered/assigned/remaining pieces, shipments with saved drafts, and current document download links. Each shipment includes:

- `next`: responsible owner (`buyer`, `supplier`, `system`, or null), step, message and applicable command.
- `editable`, `canSubmit`, `canRelease`, structured `issues`, and the saved provider `issue` when work needs attention.
- Shipment and PO revisions, ready date, Amazon identifiers, and packetUrl after release.

Use the server's next step and issues for progress presentation rather than duplicating shipment rules in the UI. `canRelease` means documents are complete; the buyer must still enter a booking reference. Document metadata never includes storage keys. Supplier carton/carrier download links remain unavailable until release. UI integration and browser acceptance are pending with the design workstream.

## Catalog identity and worker recovery

`GET /api/catalog?q=...` retains the Shopify variant array with `amazonAsin` and `fnsku`. `amazonError` is null after a successful Amazon lookup, or an actionable message if Amazon could not be queried. An empty FNSKU after a successful query means the listing has no US FNSKU available. Surface provider errors instead of presenting them as a missing listing.

PO creation re-fetches product names, buyer SKU, supplier SKU and inventory-item identity from Shopify, and ASIN/FNSKU from the connected Amazon seller's exact SKU listing. Client-supplied Amazon identities are not persisted. Disagreement with an existing Shopify ASIN stops creation for correction. Missing identities may be saved in a draft but cannot pass shipment packing validation. Listings are fetched in batches of 20 with bounded pagination; comma-containing SKUs use an exact item lookup.

`shipment.retry` takes `id` and `revision` and is buyer-only. It resumes an interrupted shipment with a known create outcome. An uncertain create must be reconciled first; requesting a correction is blocked until the original order is identified, preserving the reference needed for readback. Reconciliation and cancellation verification use the Amazon account pinned to the PO.

Workers refresh leases while active. Attempt ownership is checked before external operations, and an atomic create checkpoint prevents concurrent Amazon creation. Manual retries start a fresh job identity while retaining the stable business deduplication key, so an expired worker cannot regain ownership when attempt counts restart. Reconciled orders are re-read and matched against reference, carton contents and origin before confirmation.

Amazon model reference: https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json

Release requires current packing-list/checklist PDFs, a unique SSCC and current Amazon carton PDF for every supplier carton, a current carrier page assigned to every carton, and a product label for every shipped item. It rejects stale revisions and repeated release attempts. Uploading a replacement draft invoice makes the previous invoice outdated.
