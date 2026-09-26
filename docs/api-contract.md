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

`GET /api/orders/:id/workflow` is an authenticated, uncached view for the order handoff. It includes PO revision/status/destination, supplier name, ordered/assigned/remaining pieces, shipments with saved drafts, and current document download links. Each item also includes `assignedByStatus` (piece quantities by shipment status, absent statuses mean no assignment) and `overAssignedPieces` (positive discrepancy when assignments exceed ordered pieces). Remaining pieces are nonnegative; use the discrepancy rather than interpreting zero remaining as proof of a valid allocation. Packing drafts and cancelled shipments do not reserve pieces. Submitted packing in correction or needs-attention states continues to reserve quantities. Collected quantities are supplier-reported pickup, not confirmed warehouse receipts or available stock. Each shipment includes:

- `next`: responsible owner (`buyer`, `supplier`, `system`, or null), step, message and applicable command.
- `editable`, `canSubmit`, `canRelease`, structured `issues`, and the saved provider `issue` when work needs attention.
- Shipment and PO revisions, ready date, Amazon identifiers, and packetUrl after release.

Use the server's next step and issues for progress presentation rather than duplicating shipment rules in the UI. `canRelease` means documents are complete; the buyer must still enter a booking reference. Document metadata never includes storage keys. Supplier carton/carrier download links remain unavailable until release. UI integration and browser acceptance are pending with the design workstream.

## Open purchase-order coverage

`GET /api/orders/summary` returns `{ orders, nextCursor }` for the active buyer workspace. It reads submitted POs only; drafts and closed POs are excluded. Supplier workspaces receive 403. Responses use `Cache-Control: private, no-store`; this endpoint never calls Shopify/Amazon or queues work.

Optional query parameters:

| Parameter | Meaning |
| --- | --- |
| `supplierId` | Exact buyer-owned supplier UUID; unknown or unrelated IDs return an empty page. |
| `destination` | `awd_us`, `awd_china`, `fba`, or `forwarder`. |
| `limit` | Orders per page, integer 1–50, default 20. |
| `cursor` | Last order UUID returned as `nextCursor`; omit on the first page. |

Unknown parameters, duplicate parameters and invalid values return 400. Orders use immutable ID ascending order, not creation time. Keep filters unchanged between pages; restart without a cursor after changing filters. Each page reads orders and assignments in one repeatable-read transaction. Pages are not a frozen export: later submissions or closures can change subsequent results. A cursor remains usable if its order is closed or removed. `nextCursor: null` means no further matches were present when that page was read.

Each order includes `id`, `reference`, `revision`, `destination`, nullable `forwarderId`, supplier `id`/`name`, pinned `shopifyDomain`/`amazonSellerId`, and `items`. Each item includes the workflow coverage fields plus `variantId`, `supplierSku`, `asin`, `fnsku`, and `piecesPerSet`. Product identity is store plus variant, never SKU alone. No cross-order totals, price conversion, warehouse availability or receipt inference is performed.

For example, a 160-piece PO with 40 pieces reported collected and another 60 in an uncertain Amazon create has this quantity fragment:

```json
{
  "orderedPieces": 160,
  "assignedPieces": 100,
  "assignedByStatus": { "collected": 40, "needs_attention": 60 },
  "remainingPieces": 60,
  "overAssignedPieces": 0,
  "piecesPerSet": 2
}
```

The 60 uncertain pieces remain reserved. The 40 collected pieces are not confirmed received. A saved, unsubmitted packing draft reserves nothing. If assignments total 180, report `remainingPieces: 0` and `overAssignedPieces: 20`; do not interpret the zero as a reconciled PO. UI integration and connected warehouse-stock reporting remain separate tasks.

## Catalog identity and worker recovery

### Current Shopify, FBA and AWD stock

- `POST /api/inventory/refresh` accepts `{ "source": "awd" }` or `{ "source": "shopify" }`, or `{ "source": "fba", "marketplaceId": "ATVPDKIKX0DER" }` in a buyer workspace. The account comes from the workspace connection for the selected provider. Returns 202 `{id, revision, status}`; repeated calls reuse an already queued/running revision. Missing connection returns 409, unsupported inputs return 400, supplier workspace returns 403. It queues a read-only US AWD, US FBA or complete Shopify store collection, never a shipment or inventory write.
- `GET /api/inventory?source=awd&limit=100&cursor=...` (or `source=shopify`) returns source/scope/account identity, `snapshotId`, collection `startedAt`/`observedAt`, latest `refresh` state and bounded `rows` plus `nextCursor`. Limit is 1–200. Omit cursor on the first page. Unknown filters, duplicates and malformed cursors return 400. A replaced or inaccessible cursor snapshot returns 409; restart pagination. Responses are private and uncached.
- Before the first successful collection, snapshot ID/timestamps are null and rows are empty: that is unknown stock, not a successful zero inventory result. Failed refreshes report `refresh_failed` while preserving the last complete snapshot. A disconnected account reports `not_connected`; switching accounts hides old account data.
- Each row preserves `sellerSku`, `unit: "amazon_sellable_unit"`, nullable `inbound`, `onHand`, `availableDistributable`, `reservedDistributable`, and `replenishment`. Do not add these overlapping states or equate sellable units with individual PO pieces. There are no per-shipment receipts, Shopify mappings or calculated available-stock totals in this response.
- Current implementation supports US AWD only. Shopify/FBA readers and refresh selection and hosted live acceptance remain tracked tasks. AWD reads are paced per collection and retry selected temporary errors at most twice within the collection deadline. No scheduled sync is enabled.

### AI document imports (backend available; UI integration pending)

Buyer-only endpoints bind every record and merchant lookup to the active organization:

- `POST /api/imports`: multipart `file` PDF; returns `202 {id,status:"queued"}`. Limit 10 MB / 50 pages. Source is private Railway storage; processing runs in the existing worker.
- `GET /api/imports`: latest 50 import summaries for this buyer.
- `GET /api/imports/{id}`: status, revision, proposal, error and model/prompt metadata. No private object keys or credentials.
- `GET /api/imports/{id}/source`: authorized inline PDF, no-store.
- `PATCH /api/imports/{id}`: `{revision,proposal}` saves corrections only in review state, rechecks candidate IDs against the pinned Shopify store, and returns the incremented revision. Stale revisions return 409.
- `DELETE /api/imports/{id}`: cancels processing by advancing the revision; source data is retained. Cannot cancel saved imports.
- `POST /api/imports/{id}`: explicitly retries a failed import with a fresh revision/job. Cannot rerun active, review, cancelled or saved imports.

Proposal schema: `src/server/import-proposal.ts`. It preserves source units/prices, product candidates, unresolved values and separate non-product charges. No automatic PO creation, submission or merchant writes occur. A review proposal becomes a saved draft only through the explicit save endpoint below. A production prompt label and OpenRouter configuration are required for live processing.

`GET /api/catalog?q=...` retains the Shopify variant array with `amazonAsin` and `fnsku`. `amazonError` is null after a successful Amazon lookup, or an actionable message if Amazon could not be queried. An empty FNSKU after a successful query means the listing has no US FNSKU available. Surface provider errors instead of presenting them as a missing listing.

PO creation re-fetches product names, buyer SKU, supplier SKU and inventory-item identity from Shopify, and ASIN/FNSKU from the connected Amazon seller's exact SKU listing. Client-supplied Amazon identities are not persisted. Disagreement with an existing Shopify ASIN stops creation for correction. Missing identities may be saved in a draft but cannot pass shipment packing validation. Listings are fetched in batches of 20 with bounded pagination; comma-containing SKUs use an exact item lookup.

`shipment.retry` takes `id` and `revision` and is buyer-only. It resumes an interrupted shipment with a known create outcome. An uncertain create must be reconciled first; requesting a correction is blocked until the original order is identified, preserving the reference needed for readback. Reconciliation and cancellation verification use the Amazon account pinned to the PO.

Workers refresh leases while active. Attempt ownership is checked before external operations, and an atomic create checkpoint prevents concurrent Amazon creation. Manual retries start a fresh job identity while retaining the stable business deduplication key, so an expired worker cannot regain ownership when attempt counts restart. Reconciled orders are re-read and matched against reference, carton contents and origin before confirmation.

Amazon model reference: https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json

Release requires current packing-list/checklist PDFs, a unique SSCC and current Amazon carton PDF for every supplier carton, a current carrier page assigned to every carton, and a product label for every shipped item. It rejects stale revisions and repeated release attempts. Uploading a replacement draft invoice makes the previous invoice outdated.

### Save a reviewed import

`POST /api/imports/{id}/save` accepts `{revision, reviewed: true, supplierId, destination, forwarderId?, reference, dueDate, notes?}` and returns `{id, redirect: "/orders/{id}"}`. Save proposal corrections with PATCH first and use its returned revision. All rows require resolved variants, positive whole-piece quantities, valid set conversion and prices representable in minor currency units. Known line and document totals must reconcile with products and signed adjustments.

The server re-fetches canonical Shopify and Amazon identities and rejects changed merchant connections. The import and newly created draft PO are linked in one transaction. Repeated saves of the same completed import return the existing PO even when providers are unavailable. Saving sends no email and creates no Amazon shipment. Source SKU remains extraction evidence; it never replaces the canonical buyer or supplier SKU.

PO data may include `adjustments: [{description, amount}]`, with signed integer minor-unit amounts. These are included in totals and the generated purchase-order PDF.

Import uploads return 202 only after the source PDF is stored and the import/job records commit together. An upload failure returns an error without creating a retryable import. Retry applies to failed processing of an existing stored source; upload the document again after a source-upload failure.

Review PATCH returns 400 for malformed JSON or invalid fields, 409 for stale revisions, and 503 when catalog verification is unavailable. A 503 leaves the saved proposal and revision unchanged; retain local corrections and retry.

Import attempts emit sanitized operational spans to Langfuse. Export failure does not fail or retry a PO import. Successful attempts include resolved prompt version, model and token/tool counts; failed attempts currently include outcome and duration but may lack partial usage. Original PDFs and catalog results remain outside trace payloads.

GET /api/imports/{id}/catalog?q=...&cursor=... searches one 100-variant Shopify page for buyer SKU, supplier SKU and description. Uses the import's pinned store and authenticated tenant. Returns results, nextCursor and complete. Follow nextCursor to search remaining pages; exact SKU matches rank first within each page. No Amazon calls or writes occur.

Shopify stock uses scope `store`. Each row identifies a variant and inventory item, nullable buyer SKU, tracked status, `shopify_inventory_unit`, and location levels with available/on-hand/incoming/committed quantities. Signed values remain signed and unknown quantities remain null. Variants without levels are retained with an empty levels array. These units are not automatically converted to PO pieces or combined with Amazon stock. Authorization failures preserve the previous snapshot; no OAuth permissions are automatically added. Live merchant grant and hosted acceptance remain pending.

FBA reads use `GET /api/inventory?source=fba&marketplaceId=ATVPDKIKX0DER`. The marketplace is required for FBA and rejected for Shopify/AWD. Only the US marketplace is currently supported; unsupported values fail before queueing work. FBA uses the marketplace ID as its snapshot scope and retains each seller SKU/FNSKU/condition identity with its individual inventory detail fields and Amazon sellable-unit quantity basis. No FBA quantity is added to AWD or mirrored Shopify locations by these routes. Hosted deployment and live acceptance remain separate gates.

Shopify inventory reads accept optional `locationId` (a Shopify Location GID). Filtering is applied to the entire tenant snapshot before row pagination, and only matching levels are returned. `locations` lists observed location IDs/names from the complete snapshot. Unknown observed locations and location filters on Amazon sources return 400. Cursors bind to both snapshot ID and selected location; reusing a cursor after changing the filter returns 409. A location filter changes the view only; it does not classify merchant stock or Amazon mirrors.


### Product labels

Each PO line needs a product label for the supplier to print. A variation's label is, in order:

1. The barcode the buyer uploaded for it: a one-page PDF (32 MB or less, no active content), on the Products page or in bulk.
2. Otherwise, when its product's `productLabel` setting is `standard` (the default), the standard label: a US Letter sheet of 30 labels (2 5/8 × 1 in), laid out like Fencing Club's glove labels: a Code 128 barcode of the code with the code centered under it, then, left-aligned, the Shopify title with the variant's options in parentheses ("Pro-Grip Fencing Glove (10, Left)") and "Made in {country}" from the country of origin Shopify records on the inventory item (left out when none is recorded). No condition is printed. The code is Amazon's FNSKU, or the Shopify SKU without Amazon or for a product Amazon doesn't list. Lines on POs to Amazon only get the FNSKU, filled in when the PO is sent.
3. A product set to `uploaded`, such as uniforms and chest protectors whose labels show size measurements, gets no standard label; its variations are flagged until a label is uploaded.

New POs get their labels when the PO is created or imported, and again after it is sent (when missing FNSKUs have been filled in) for lines still without one. A label uploaded on the PO itself is never replaced. Replacing or removing a barcode doesn't change POs that already have its label.

- Buyer-only `POST /api/inventory/barcodes` (same origin, multipart) saves or replaces the barcode and returns `{name, bytes, uploadedAt, replaced, target: {variantId, sku, product, variant}}`. It names the variation with `variantId` or, for bulk uploads, by SKU: the `sku` field, or else the file name without `.pdf`, matched exactly ignoring case. A multi-page or invalid PDF returns 400; an unknown variation or a SKU no variation has returns 404; a SKU several variations share, or no Shopify connection, returns 409.
- Replacing or removing a barcode deletes its stored file. POs keep their own copy. A failed delete is logged as `barcode_file_delete_failed` and leaves the file behind.
- `GET /api/inventory/barcodes?variantId=gid://shopify/ProductVariant/1` downloads the variation's label: its upload, or else the standard sheet. Its FNSKU comes from the latest FBA stock sync or else Amazon's listing for the SKU; without either, the Shopify SKU is printed. `view=inline` shows it in the browser instead. It returns 404 when the product needs an uploaded label or the variation has no SKU, and 409 when Amazon can't be reached. `DELETE` with the same query (same origin) removes the upload. Supplier workspaces get 403.
- `GET /api/inventory/products` adds `barcode` (or null) and `fnsku` (or null) to each variant; `missingBarcodes`, the number of variations whose product needs an uploaded label and has none; and `duplicateSkus`, the SKUs more than one variation uses. `barcode=missing` lists only products with such a variation.
- `GET /api/inventory/product-labels` lists every synced product as `{productId, title, variations, productLabel}`. `PATCH` (same origin) with `{productIds, productLabel}` sets the label type for up to 500 products at once and returns `{updated}`.
- `POST /api/inventory/labels` (same origin) with `{productIds}` returns one PDF with a label sheet for each of their variations, made the same way as a single download with batched Amazon and Shopify lookups. `X-Skipped-Labels` counts variations left out because they have no label yet; none at all returns 404, and more than 1,000 variations returns 400.
- `GET /api/inventory/products` also adds `countryOfOrigin` to each variant (null when Shopify has none; left out until a Shopify stock sync collects it) and `missingCountries`, the number of standard-label variations without one. `country=missing` lists only products with such a variation.
- Action `order.labels` (buyer only, open POs) adds missing product labels and makes again the ones Copacker added, from current barcodes and Shopify and Amazon details. Labels uploaded on the PO and lines in released shipments are kept; replaced labels stay as outdated versions. It returns `{updated}`.
- `GET /api/orders/{id}/labels` returns the PO's current product labels as one PDF in line order, for anyone who can see the PO; 404 when it has none.
- Action `order.delete` (buyer only) deletes a draft PO with its documents, history and landed costs, and returns `{redirect: "/orders"}`. A PO import saved as that draft goes back to review. Sent POs are closed instead.

### Supplier SKUs

A variation's supplier SKU is Shopify's `custom.supplier_sku` variant metafield; supplier catalog matching and PO lines use it. `GET /api/inventory/products` returns it on each variant as `supplierSku` (or null), from the latest Shopify stock sync.

Buyer-only `PATCH /api/inventory/supplier-sku` (same origin) accepts `{ "variantId": "gid://shopify/ProductVariant/1", "supplierSku": "AB-100" }`. The SKU is trimmed, one line and up to 255 characters; an empty string removes it. The variation must be in the synced Shopify stock snapshot (404 otherwise). It's written to Shopify, then to that variation's row in the stored snapshot, and returns `{supplierSku}` (null when removed). Invalid input returns 400, supplier workspaces 403, no Shopify connection 409, and a Shopify failure 502 (logged as `supplier_sku_failed`).

### Inventory location settings

Buyer-only `GET /api/inventory/locations` returns the connected Shopify domain, current snapshot ID/time, observed locations with classification and revision, and previously configured but unobserved location IDs. No connection/snapshot means no observed locations, not zero inventory. Names never determine classification.

`PATCH /api/inventory/locations` accepts only `{ "locationId": "gid://shopify/Location/123", "classification": "merchant", "snapshotId": "<current UUID>", "expectedRevision": 0 }`. Classifications are `merchant`, `amazon_mirror`, `excluded`, `unresolved`. Revision starts at 0 for an unset location; saves return the next revision. The account/workspace come from the session. Stale revision/snapshot or missing connection returns 409; invalid input/unobserved location returns 400; supplier access returns 403. Both responses are private/no-store. Database/provider internals are not returned on unexpected failures. These settings do not write to Shopify or Amazon. Amazon mirror classification excludes duplicate stock; it does not assert a verified FBA/AWD pool association.

Deployment prerequisite: apply the additive inventory_location_mappings table before enabling these endpoints or their UI on the shared database. Local database tests pass; shared database DDL and live acceptance remain pending.
