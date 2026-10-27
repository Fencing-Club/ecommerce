# Copacker application contract

The HTTP contract between the Copacker pages and `apps/copacker/src/app/api`: the `/api/action` commands, the other
routes, and the rules behind them.

The pages call these routes through RTK Query (`src/lib/api.ts`), mounted with `ApiProvider` in
`components/providers.tsx` and with no Redux store of its own. Forms submit `/api/action` commands through
`useActionForm` (`src/hooks/use-action-form.ts`), which pairs React Hook Form with the command's Zod schema.

A feature adds its routes with `api.injectEndpoints`, such as the supplier workspace's in `src/lib/supplier-api.ts`,
rather than calling `fetch` itself. Every request then gets the API's session handling: a redirect, such as to sign in,
becomes a full-page recovery navigation instead of being followed in the background. Failures show through
`useErrorMessage`: the route's `{ error }` text, the translated offline message, or the caller's fallback. Endpoints are
typed from the server function's return type, or checked with a Zod `responseSchema` where the page validates what
arrives. A file the API sends, such as a label PDF, is read with `fileOrError` (`src/lib/download.ts`) in a `queryFn`,
then saved with `downloadBlob` or previewed from an object URL, so its bytes never enter the store.

## Authentication and responses

Business routes use the WorkOS session ([Sign-in and getting started](auth.md)). The active workspace is selected with a
server-set HttpOnly cookie and checked against live database membership on every request. No client-supplied
organization grants access.

Every request other than GET or HEAD must come from the app: the browser's `Sec-Fetch-Site: same-origin`, or an Origin
(without one, a Referer) on APP_URL or one of its aliases. The request middleware in `src/start.ts`, with its policy in
`server/http-response.ts`, refuses anything else with 403 `{ error }` before a route runs. Provider webhooks (`/api/webhooks/*`) and the mailing list's unsubscribe link are
cross-site on purpose and skip it; they check their own signatures or tokens.

A route's handlers live in `server/http`, one module per path, exporting a function per HTTP method that takes the
request and `{ params }`. Its file in `src/routes` is only `server: { handlers: apiHandlers(handlers) }`, which serves
each exported method through `httpResponse` in `server/http-response.ts`. A response is `private, no-store` unless the
route set its own `Cache-Control` (product photos are immutable), and always `nosniff`. Failures a route throws are
answered there too, with `{ error }` in the person's language: an `AccessError` is 403, a missing record 404, a
`StatusError` its own status, and request input that doesn't parse or a refusal with a message for the person (a
`LocalizedError`, such as a PO that changed meanwhile) 400. Routes don't catch these themselves. Request input is the body, query or path, read
with `requestJson` and `requestInput` from `server/errors.ts`, which throw `InvalidRequestError`. Any other `ZodError`
or `SyntaxError`, such as stored data or a provider's answer that no longer fits its schema, is a bug: it's logged as
one JSON line with `event: "api_request_failed"`, the method, the path and the error, and answered 500. Anything else
is unexpected and goes on to Start. Downloads use `fileResponse`, which names the file with `filename*` (RFC 5987) and
adds `Content-Security-Policy: sandbox`.

A page's record id comes from its URL, so its server function accepts any string and its loader reads it with
`pageId` (`server/page-id.ts`). A malformed id, such as `/shipments/abc/packet`, is a record that doesn't exist, so the
page shows Not found rather than an error.

`POST /api/action`, content-type application/json, body `{ action, data }`. Each command is one entry in
`src/server/actions`, one file per area below, made with `defineAction` (`define.ts`): its `input` schema, a `guard`
naming who can run it (owner, admin, kind of workspace, page and level, prices), the function that `run`s it, and the
caches it `invalidates`. The route checks the guard before it reads `data`. `ActionName`, `ActionInput<K>` and
`ActionOutput<K>` type the pages' calls through `useAction` and `useActionForm`.

Success returns `{ ok: true }`, `{ id }`, `{ redirect }` or the command's own result. A command whose success changes a
cached list answers with `X-Invalidates` naming its RTK Query tags (`src/lib/api-tags.ts`), which the browser loads
again. Failure returns `{ error }`: 400 when the data doesn't parse or the command refuses it with a reason; 403 when
the person's role, page access or kind of workspace doesn't allow it ([Roles and page access](permissions.md)); 404
when the record doesn't exist or isn't the workspace's; and 500 for anything unexpected. Show multiline validation
errors in the relevant form. Refresh server data after successful mutations. Unexpected errors never show raw database
queries or tokens.

Send the last displayed numeric revision with every PO or shipment mutation. A revision conflict requires a refresh,
never a silent overwrite.

Private PDF responses (`/api/documents/:id`, `/api/shipments/:id/packet`, `/api/imports/:id/source`) recheck database
workspace membership after the storage read or packet assembly, before returning bytes. Removing a member during a slow
download stops that response. They are sent `private, no-store` with `Content-Security-Policy: sandbox`.

The single-document endpoint uses `server/document-download.ts` for private downloads. It opens a storage stream,
then rechecks the document, relationship, label release/revision and current membership's page/price grants before
returning it. Denial cancels the unread stream. The Node transport closes its S3 client after consumption, cancellation
or failure; Workers supply an invocation-scoped private R2 binding. PDF processors still materialize bytes explicitly.

The optional Amazon Ads development relay is a narrow exception: `GET /api/connections/amazon-ads` forwards a valid
signed callback ticket before requiring a session. It never accesses a workspace, exchanges tokens or fetches a
return URL. The originating app performs all authorization and single-use checks. See [Amazon Ads](amazon-ads.md).

## Commands

Permissions below name the checks the route makes: _buyer_, _supplier_ and _forwarder_ are the workspace kind;
_admin_ means the owner or an admin; _Page: Edit_ is a member's page access; _prices_ is price access. Page access is
read through `effectiveAccess`, so Orders: Edit, and a supplier's Products: Edit, include prices
([Prices and costs](permissions.md#prices-and-costs)).

### Sign-in and getting started

| Action | Data | Permission / result |
| --- | --- | --- |
| auth.signIn, auth.signUp, auth.verifyEmail, auth.resendCode, auth.forgotPassword, auth.resetPassword | See [auth.md](auth.md) | Before sign-in |
| onboarding.workspace | person, kind: buyer, supplier or forwarder, company, address or null, invitation `{kind: supplier or forwarder, token}` or null | Signed in, no workspace needed. Creates the workspace with its owner, profile and first address, accepts the invitation that brought them, and switches to it; returns redirect |
| onboarding.join | kind: team, supplier or forwarder, token, orgId (supplier or forwarder), optional person | Verified invited email. A colleague joins the inviting workspace; a supplier or forwarder links a workspace it owns or administers; returns redirect |

### Workspace and team

| Action | Data | Permission / result |
| --- | --- | --- |
| workspace.switch | id | Member of that workspace; returns redirect |
| workspace.timeZone | timeZone (IANA name, or empty for each viewer's own) | Admin |
| workspace.restock | salesDays, leadTimeDays | Admin; Restock's sales period and default lead time |
| workspace.excludedShopifyTags | tags (up to 50) | Buyer admin; Shopify order tags left out of order counts, ignoring case |
| workspace.delete | name | Owner; the name confirms it. Deletes the workspace and everything in it; returns redirect |
| team.invite | email, role: admin or member, access | Admin; exact-email invitation with the role and a member's pages |
| team.access | userId or email, role, access | Admin; changes a colleague's or an invitation's access, never the owner's or your own |
| team.resend, team.cancel | email | Admin |
| team.remove | userId | Admin; removes anyone but the owner and yourself |
| team.transfer | userId | Owner; makes a colleague the owner and stays on as an admin |
| account.delete | email | Anyone; the email confirms it. Refused while they own a workspace others use. Deletes their sign-in and memberships, closes workspaces only they use, signs them out; returns redirect |

### Profile

| Action | Data | Permission / result |
| --- | --- | --- |
| profile.update | firstName, lastName, position, company, optional website | Anyone for their own profile; the website is the workspace's, buyer admin only |
| profile.locale | locale, or empty for the browser's language | Anyone |
| supplier.profile | website, contactName, contactEmail, phoneNumber | Supplier admin; the contact details its buyers see |

### Addresses

Contact kinds are `delivery`, `forwarder` and `pickup`. Buyers and forwarders save `delivery` addresses, suppliers
`pickup` ones. A buyer's addresses for its forwarders (`forwarder`) and for suppliers not on Copacker (`pickup`) are
kept with that partner and change through the partner's commands.

| Action | Data | Permission / result |
| --- | --- | --- |
| contact.create | name, kind, address, optional shopifyLocationId (delivery only) | Admin |
| contact.update | id, name, kind, address, optional shopifyLocationId | Admin; the workspace's own addresses only |
| contact.delete | id | Admin; the workspace's own addresses only |

### Partners

| Action | Data | Permission / result |
| --- | --- | --- |
| supplier.create | name, optional email | Buyer, Partners: Edit. Adds the supplier, or restores a removed one of that name; with an email, invites it in the same transaction; returns id |
| supplier.invite, supplier.resend | id, optional email | Buyer, Partners: Edit. Supplier not yet joined; a fresh token replaces earlier links |
| supplier.update | id, name, shopifySupplierName, leadTimeDays, contact details | Buyer, Partners: Edit. Contact details stay the supplier's own once it joins |
| supplier.remove | id | Buyer, Partners: Edit. Refused while it has open POs |
| supplier.address | supplierId, optional id, name, address, or `remove: true` | Buyer, Partners: Edit. Pickup addresses of a supplier not yet joined |
| forwarder.create | name, optional email | Buyer, Partners: Edit. Adds or restores a forwarder, inviting it with an email in the same transaction; returns id |
| forwarder.rename | id, name | Buyer, Partners: Edit |
| forwarder.invite | id, optional email | Buyer, Partners: Edit. Invites or re-invites a forwarder not yet joined |
| forwarder.address | forwarderId, optional id, name, address | Buyer, Partners: Edit. Addresses of a forwarder not yet joined |
| forwarder.remove | id | Buyer, Partners: Edit |

### Connections

| Action | Data | Permission / result |
| --- | --- | --- |
| connection.amazonSelfAuthorized | refreshToken | Buyer admin. Connects a self-authorized Amazon seller after checking the token with Amazon, then starts the first sync |
| connection.delete | provider: amazon, shopify or ebay | Buyer admin. Removes the credentials and reports whether the provider confirmed the revocation (eBay has no revocation, so it only forgets the token) |

### Purchase orders

| Action | Data | Permission / result |
| --- | --- | --- |
| order.create | OrderInput | Buyer, Orders: Edit. Catalog identities re-read from the connected stores; returns redirect |
| order.update | id, revision, order | Buyer, Orders: Edit. Saves a draft as its next revision; returns redirect |
| order.submit | id, revision | Buyer, Orders: Edit. Sends the PO, emails a supplier that has joined, stores the PO PDF and creates the first packing draft; returns ok and shipmentId |
| order.delete | id | Buyer, Orders: Edit. Deletes a draft with its documents, history and landed costs; a PO import saved as that draft goes back to review; returns redirect |
| order.close | id | Buyer, Orders: Edit. Closes a sent PO: unpacked shipments are cancelled; refused unless every shipment is received, cancelled, or still packing with no Amazon request in progress |
| order.comment | orderId, message, visibility (`internal` or `shared`) | Orders: View; internal comments are visible only to the authenticated workspace, shared comments to the buyer and supplier. Existing comments remain shared. |
| landedCost.create | orderId, kind: freight, duty or other, description, amount | Buyer, Orders: Edit; returns the cost |
| landedCost.delete | id | Buyer, Orders: Edit |
| monthlyCost.create, monthlyCost.delete | cost fields, or id | Buyer admin; costs paid monthly that no platform reports |
| job.retry | id | Buyer admin. A failed email or Shopify job for an accessible PO |

`OrderInput.items[].supplierCharges` optionally records product-specific supplier services. Each entry contains
`description`, `amount` (a nonnegative integer rate in currency minor units), and `basis` (`piece`, `pack`, or `flat`).
Pack charges use the Shopify bundle's `piecesPerSet`. They remain separate from product unit prices and PO-level
`adjustments`; totals include each charge once. See [supplier service costs](../../../packages/copacker-orders/docs/README.md#supplier-service-costs).

### Shipments

| Action | Data | Permission / result |
| --- | --- | --- |
| shipment.create | id (PO ID) | Shipments: Edit. Resumes the editable packing draft, or creates the next partial shipment; returns redirect |
| shipment.save | id, revision, orderRevision, draft | Shipments: Edit. Saves incomplete packing; returns revision and savedAt |
| shipment.check | id, optional packing | Shipments: Edit. Read-only preflight of the given packing or the saved draft |
| shipment.submit | id, revision, optional packing | Shipments: Edit. Submits packing, reserves quantities, then queues approval, Amazon creation, or (not to Amazon) marks it ready; returns `{approval}` |
| shipment.approve | id, revision, updateCost: boolean | Buyer, Shipments: Edit, prices. Approves the invoice's changes as the PO's next revision, saves supplier SKUs, and with updateCost writes unit costs to Shopify |
| shipment.reopenPacking | id, revision | Shipments: Edit. Returns a packed shipment to packing, with its cartons as the draft, until the buyer starts the Amazon shipment |
| shipment.correct | id, reason | Shipments: Edit. Moves the shipment to correction and outdates its documents |
| shipment.retry | id, revision | Buyer, Shipments: Edit. Requeues a shipment needing attention whose create outcome is known |
| shipment.linkExisting | id, revision, amazonShipmentId (STAR ID or null) | Buyer, Shipments: Edit. Verifies and links an existing AWD shipment to an editable AWD draft, or removes the link; returns the next revision |
| shipment.reconcile | id, amazonOrderId | Buyer, Shipments: Edit. Reads the AWD order or FBA inbound plan and checks it names this shipment before the worker resumes |
| shipment.cancelAmazon | id | Buyer, Shipments: Edit. Cancels the AWD order or FBA inbound plan and verifies it before releasing quantities. The shipment cancels, and its timeline says so, only if it hasn't changed meanwhile |
| shipment.route | id, revision, route `{stops, legs}`, expected | Buyer, Shipments: Edit. Saves the shipment's route. `expected` is the route the page showed, which must still be the shipment's. It keeps to the route rules and stops at one of the buyer's current forwarder addresses at most. A shipment that was waiting only on who moves its last leg goes to its supplier |
| shipment.ship | id | Shipments: Edit. The supplier, or the buyer for a supplier not on Copacker, marks released goods shipped; the invoice must be current |
| shipment.forward | id, freight `{amountMinor, currency}`, carrier, reference | The forwarder the shipment's route stops at (Orders: Edit), or the buyer for a forwarder not on Copacker (Shipments: Edit, prices). Freight is recorded as a landed cost |
| shipment.received | id | Buyer, Shipments: Edit. Goods arrived where the PO sent them |

## Schemas and units

Canonical schemas are exported by `@repo/copacker-orders` (orderInputSchema, itemSchema, addressSchema) and
`@repo/copacker-shipments` (packingDraftSchema, packingSchema, cartonInputSchema). Prices are integer minor currency units **per individual piece**; weights kg;
dimensions cm. IDs are UUIDs. Buyer SKU, Shopify variant ID and product names are read-only to suppliers. They propose
supplier SKU and unit-price changes in `packing.changes`.

An order has one supplier, and each line names its `receiver`: `fba` or `awd_us` for Amazon, or `warehouse` for the
buyer's own location. A PO's lines share one group of receivers, Amazon or the buyer's location, which is the PO's
destination (`orderDestination`); a PO to the buyer's location needs its `deliveryId`. A freight forwarder is never a destination,
only a stop on the way: `via` is `{forwarderId, addressId}`, one of the addresses the buyer saved for the forwarder or,
once it has joined, one of its own. It's the route the PO's shipments follow until they save their own, which can stop
at any one of the buyer's forwarder addresses instead. A forwarder's workspace sees a PO while one of its shipments'
routes stops at it, or before any shipment, the PO's own does, and sees only those shipments. Joining copies the saved
addresses POs and routes stop at into the forwarder's workspace and moves those POs, their revisions, their shipments
and the routes' stops to the copies. A new line on a PO to Amazon starts at the
product's `amazonNetwork` setting, `fba` by default. A submission splits into one shipment per Amazon network; see
[Amazon inbound shipments](amazon-inbound.md). Receivers and their packing rules are in
[`@repo/copacker-packing-rules`](../../../packages/copacker-packing-rules/docs/README.md#receivers).

PO data may include `adjustments: [{description, amount}]`, signed integer minor-unit amounts included in totals and the
PO PDF. A line's `skuLabel` overrides whether each unit gets its SKU label; left out, the product's label setting
decides.

## Routes

Page and price checks follow [permissions.md](permissions.md) and return 403 when access is missing.

### Public and session

- `GET /api/health`: `{status, service, commit}` for deploy checks.
- `GET /api/maintenance`: `{active}`, polled by the maintenance page.
- `GET /api/workspace`: the browser's current workspace ID, which another tab may have switched.
- `GET /api/search`: the app header's search index for the workspace.
- `POST /api/contact`: the contact page's message; anyone, five per ten minutes per address (429 after).
- `POST /api/mailing-list`: waitlist signup from the marketing page, a WorkOS waitlist entry; sends a welcome email in
  the page's language, and a notice to `CONTACT_EMAIL`.
- `POST /api/mailing-list/unsubscribe`: signed removal from the waitlist, from the page's form or a mail app's
  List-Unsubscribe post.
- `GET /login/:provider`, `GET /callback`, `POST /logout`: social sign-in, the WorkOS return, and sign-out
  ([auth.md](auth.md)).

### Connections

- `GET /api/connections/shopify?shop=store.myshopify.com`: buyer admin authorization redirect; the same path receives
  the HMAC-verified OAuth callback.
- `GET /api/connections/amazon`: buyer admin OAuth redirect and callback. Single-use state is tied to user, organization
  and provider. A new connection starts its first order and stock sync at once.
- `GET /api/connections/ebay`: buyer admin OAuth redirect and callback, the same way; eBay returns to it through the
  environment's RuName ([eBay](notifications.md#ebay)). A new connection starts its first order sync and subscribes the
  seller to notifications.
- `GET, POST /api/webhooks/ebay`: eBay's endpoint check (`challenge_code`) and its signed notifications, checked and
  sent on to the worker; 412 for a bad signature, 503 when one can't be checked yet, 429 for an address that looks up
  more than ten unknown signing keys in ten minutes ([eBay notifications](notifications.md#notifications)).

### Purchase orders

- `GET /api/catalog?ids=`: buyer, Orders: Edit. The Shopify variations the add-products dialog chose, with line
  defaults, supplier SKU and ASIN, plus Amazon `amazonAsin`/`fnsku` and `amazonError` (see
  [Catalog identity](#catalog-identity)). No IDs, no variations; the dialog searches through `/api/inventory/products`.
- `POST /api/supplier-catalog/match` `{supplierId, currency, supplierSkus}`: buyer, Orders: Edit. Each SKU's catalog
  match at this buyer's catalog prices, and `available`: the pieces the supplier can still sell, or null when the
  product has no stock limit.
- `GET /api/orders/summary`: open PO coverage ([below](#open-purchase-order-coverage)).
- `GET /api/orders/:id/workflow`: the order handoff view ([below](#order-workflow)).
- `GET /api/orders/:id/po`: Orders and prices. The PO PDF, to share with a supplier not on Copacker.
- `GET /api/orders/:id/labels`: the PO's product labels in line order, then its suffocation warning sheet; 404 when it
  has neither.
- `GET /api/orders/:id/labels/:itemId`: one line's product label; 404 when it needs none or can't be made yet.
- `GET /api/orders/:id/labels/warning`: the PO's suffocation warning sheet, when a line needs it.
- `GET /api/shipments/:id/labels`: Shipments. The product labels of the lines a shipment carries, for whoever packs
  it, including members who can't open purchase orders. `item` narrows them to one line; `kind` is one label type its
  packing details ask for, `sku`, `fnsku` or `suffocation` (the warning sheet), or `all` (the default). Choking hazard
  labels come from the buyer and aren't made here. 404 when there's nothing to print or the label can't be made yet.
- `GET /api/shipments/:id/packing-list`: Shipments, with the same access as its labels. Once packing is finished
  (`packed` and every later state, but not a correction or a cancellation), `{ data }`: the packing list's document
  data, which the browser renders into the PDF. It lists the cartons and products, without prices, label assignments or
  the destination's address, so it needs neither Amazon's labels nor the released packet. 409 with `{ error }` before
  packing is finished or when the cartons can't make a packing list.
- `POST /api/orders/:id/proposal` `{revision, proposal}`: supplier, Orders: Edit. Proposes changes to a sent PO:
  quantities, prices, added and removed products, payment terms and ready date. One can be pending at a time; packing
  waits while it is.
- `POST /api/proposals/:id` `{action: approve | decline (reason) | withdraw}`: Orders: Edit. The buyer approves or
  declines; the supplier withdraws.
- `POST /api/documents`, `GET /api/documents/:id`, `GET /api/shipments/:id/packet`: see [Documents](#documents).
- `/api/imports/*`: see [AI document imports](#ai-document-imports).

### Products and stock (buyer)

- `GET /api/inventory`, `POST /api/inventory/refresh`: store stock snapshots ([below](#shopify-fba-and-awd-stock)).
- `GET /api/inventory/products`: Products page or Orders: Edit. Inventory across counted Shopify locations, FBA and AWD,
  grouped by product and paged (`q`, `page`, `pageSize`, `barcode=missing`, `country=missing`).
- `GET, PATCH /api/inventory/locations`: Shopify location settings ([below](#inventory-location-settings)).
- `PATCH /api/inventory/product-defaults`: Products: Edit. A product's description, preparation, case packs, case
  quantity, minimum order, supplier, label type, suffocation warning and Amazon network, with `expectedRevision`;
  optional fields left out keep their saved values.
- `PATCH /api/inventory/variant-fields`: Products: Edit ([below](#variation-and-product-details)).
- `/api/inventory/product-labels` (GET, PATCH), `/api/inventory/labels` (POST) and `/api/inventory/barcodes` (GET,
  POST, DELETE): product labels ([below](#product-labels)).
- `GET /api/products/without-supplier`: Products. Products with no known supplier, for the Products page warning.
- `POST /api/inventory/demand`: Sales. Sales demand for a date range ([Sales demand](sales-demand.md)); 409 when a
  source can't be read, 503 when the refresh fails.
- `GET /api/sales`: Sales. Each connected source's order sync and how much history is stored. Amazon also includes
  independent monthly `returns`, `reimbursements` and `inventoryMovements` coverage ([returns](amazon-returns.md),
  [reimbursements](amazon-reimbursements.md), [movements](amazon-inventory-movements.md)).
  Amazon also exposes `storageFees.monthly` (estimate) and `storageFees.aged` (reported charge), each with independent
  twelve-completed-month coverage and an explicit `basis`; see [storage fees](amazon-storage-fees.md).
  `removals.orders` and `removals.shipments` expose separate monthly windows with `dateBasis` (request or shipment);
  see [removal/disposal evidence](amazon-removals.md). Status responses do not include source rows or tracking.
- `GET /api/sales/orders?source=&page=&q=`: Sales. Stored sales orders, newest first.
- `POST /api/sales/sync` `{source: shopify | amazon | ebay}`: Sales. Queues an order sync; 202.
- `GET /api/restock/channels`: Restock. Amazon and each counted Shopify location.
- `POST /api/restock/plan`: Restock. Restock suggestions for a channel from stored orders; without prices, lines omit
  costs, prices and lost sales.
- `GET /api/restock/suppliers`: the buyer's suppliers and lead times, for Restock's filter.
- `POST /api/restock/assign-supplier` `{productIds, supplierId}`: Products: Edit. Sets several products' supplier.

### Supplier catalog (supplier)

- `POST /api/supplier-catalog/products`: Products: Edit and prices. Creates or saves a product and its variants.
- `POST /api/supplier-catalog/status` `{ids, active}`: Products: Edit. Archives or restores products; archived products
  can't be ordered.
- `POST /api/supplier-catalog/stock` `{counts: [{id, onHand}]}`: Inventory: Edit. Replaces tracked products' on hand
  counts, all or none; returns `{saved}`, 404 when a product isn't the supplier's or isn't tracked.
- `POST /api/supplier-catalog/tracking` `{id, trackInventory?, continueSelling?}`: Inventory: Edit. Turns stock counting
  on or off, or lets POs order past what's on hand.
- `GET /api/supplier-catalog/template?format=csv`: the blank product template, an Excel workbook by default.
- `GET /api/supplier-catalog/export?format=csv`: Products and prices. Every product in the template, to edit and import.
- `POST /api/supplier-catalog/import`: Products: Edit and prices. Multipart `file` (CSV or XLSX) with `mode=preview`,
  then `mode=commit` with the preview's `fileHash` and `revisionHash`, which guard against changes made in between. Each
  file is imported once.
- `POST /api/product-images`: Products: Edit. Stores an uploaded product photo; `GET /api/product-images?key=` returns
  it to the supplier and the buyers it supplies.
- `POST /api/catalogs`: Catalogs: Edit. Creates or saves a catalog; `DELETE /api/catalogs/:id` deletes one.
- `GET /api/catalogs/:id/export?format=pdf`: Catalogs. The catalog's price list, an Excel workbook by default.
- `POST /api/customers/:id/catalog` `{catalogId | null}`: Customers: Edit. Gives a customer a catalog, or removes it so
  the customer sees every active product at its own price.

## Documents

`POST /api/documents` is multipart: orderId, kind, file, and:

- invoice: shipmentId; the commercial invoice PDF, required before packing submission. Only while the shipment is in
  packing or correction; a new invoice outdates the previous one.
- product_label: itemId; buyer, Orders: Edit; one PDF page stored with the PO line, refused once a released shipment
  carries that line. No page uploads one and label generation doesn't read it: product labels come from the Products
  page's barcodes ([Product labels](#product-labels)).

PDFs are limited to 32 MB and 1,000 pages and may not carry active content. Paths and bucket keys are never supplied by
the user. `GET /api/documents/:id` authorizes access to the order and returns a private attachment. Outdated documents
can't be downloaded. Suppliers can't download carton, pallet or shipping labels before release. The PO and commercial
invoice need prices. A forwarder reads only the invoice, packing list, carton labels, pallet labels and shipping labels.

Adding `?bundle=true` to a carton or shipping label download combines the current shipment revision's labels of that
type into one PDF, in numeric carton order. Carton and carrier labels stay separate. Original page sizes are preserved;
all source documents and workspace permissions are checked again after assembly. The PO and shipment document lists
show one download per label type and shipment. Individual source files remain stored for carton-to-label mapping.

### Carrier labels

A shipment whose route puts a carrier label on each carton (a carrier the buyer books) takes them from the
shipment page's Upload labels dialog. `POST /api/shipments/:id/carrier-labels` is multipart: `revision`, one or more
`file` PDFs, and `labels`, a JSON array with each labelled carton once:

- `{ cartonId, file, page, trackingNumber }`: page `page` (1-based) of the `file` at that index;
- `{ cartonId, documentId, trackingNumber }`: the carton's label as saved before.

Carriers give either one PDF with a page per label or, as Amazon does, a PDF for each label, so the files can be
several. Each label keeps the name of the file it came from, and its page when the file had more than one. A carton
left out has no label, and its saved one is outdated. The dialog reads each page's tracking number from the
PDF's text in the browser, or the buyer types it; it's stored with the label, capitals and digits only, and the supplier
packet lists it as the carton's carrier label number. Buyer, Shipments: Edit, while the shipment waits for labels at
that revision. Saving some cartons is allowed. The response is `{ sent }`: whether the labels went to the supplier.

Labels go to the supplier with no step of the buyer's: the shipment becomes ready, the `ready` email is queued for a
supplier that has joined, and the PO's timeline records it. That happens once nothing is missing, after Amazon's labels
arrive, carrier labels are saved, the route is saved or a product barcode is uploaded (`sendLabelsWhenComplete`).
Each of those changes queues a `labels` job in its own transaction, then sends straight away and removes the job. When
sending fails, the change still succeeds, `labels_send_failed` is logged, and the job tries again every five minutes.

Sending a PO stores its PDF with the PO; a storage failure is logged as `po_document_failed` and doesn't undo sending,
since the PDF is made again when it's emailed or downloaded.

`GET /api/shipments/:id/packet` serves the released supplier packet's label sections, and the browser assembles the
packet in this order: the packing list, the checklist, then, for a shipment with carton labels, the carton label
reference, the carton labels and the buyer's shipping labels, the pallet labels for an FBA shipment on pallets
(`section=pallet_labels`), then the product labels and suffocation warning sheet for the lines it carries. Original page dimensions are preserved; print at actual size. The packing list shows
supplier carton number, buyer SKU, supplier SKU, pieces/sellable units and cm/kg, with the destination warehouse codes as
its ship-to. The carton label reference lists each carton's label number (an AWD SSCC or an FBA box ID) and carrier
label, then each pallet's label.

A shipment to any other destination is released as soon as its packing is submitted (or its invoice changes approved)
and has no carton or shipping labels. Its packing list and checklist are made from its packing at download, with the
PO's delivery address as the ship-to. A packet with a shipped line whose product label can't be made yet is incomplete:
the route returns 409, the workflow gives no `packetUrl`, and the shipment's `issues` name the missing labels. An id
that names no shipment, malformed or unknown, returns 404.

A shipment's labels go to its supplier (`sendLabelsWhenComplete`), with no step of the buyer's, once it has its
route with someone chosen for every leg, a unique Amazon label and current carton PDF for every carton, a current
carrier label with its tracking number on every carton when its route needs them, Amazon's current pallet-label file for an FBA shipment on
pallets, and a product label for every shipped line. They go once: a shipment no longer waiting for labels is left as
it is.

## Shipment states

| State | Meaning | Next action |
| --- | --- | --- |
| packing | Supplier is entering invoice, addresses, ready date and cartons | Upload invoice; submit packing |
| approval | Commercial changes await the buyer | Buyer approves, or requests a correction |
| queued / creating | Worker creates the AWD order or FBA inbound plan, confirms it and retrieves labels | Refresh status; never repeat the create by hand |
| waiting_labels | Amazon carton labels are available | Buyer books AGL (AWD) or its own carrier or forwarder (FBA) and adds carrier labels; the labels go to the supplier once nothing is missing |
| ready | Packet released; for a shipment not to Amazon, packing submitted | Supplier prints and ships (`shipment.ship`) |
| shipped | The supplier shipped the goods, to the forwarder or straight to the destination | Forwarder ships on (`shipment.forward`), or buyer records receipt |
| forwarded | The forwarder shipped them on, with freight, carrier and tracking | Buyer records receipt (`shipment.received`) |
| received | Goods arrived where the PO sent them | None |
| correction | Existing documents outdated | Edit and resubmit, or cancel the Amazon shipment before replacing it |
| needs_attention | Provider request failed or its outcome is uncertain | Retry a known outcome; reconcile an uncertain one |
| cancelled | Unpacked on close, or Amazon cancellation verified | Quantities available for a new shipment |

Packets are downloadable from `ready` on. Once shipped, a shipment's cartons and documents can't change.

The ready date is the supplier's local calendar date, not a confirmed pickup appointment. Copacker doesn't book AGL.
Avoid wording implying Amazon has agreed to the requested date.

## Resumable packing

Submitting a PO creates one packing draft per Amazon network (one for a warehouse PO), so the supplier can enter packing at once. `shipment.create` resumes
the editable draft; it creates another shipment only when there is none and unassigned PO quantity remains. Submitted
shipments reserve quantities; saved drafts don't.

`shipment.save` replaces the complete draft snapshot, not a patch. It accepts incomplete addresses, missing measurements
and blank fields allowed by `packingDraftSchema`. Omit empty numeric fields or use zero while editing. Product IDs must
still belong to the PO. Use the returned shipment revision on the next save or submission. The current PO revision is
required on every save; if another shipment's approved changes update the PO, review it and save before submitting.

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

Saving doesn't reserve quantities, queue a job, contact Amazon or send email. Invoice uploads return document IDs to
include in the draft. Ordinary saves keep the uploaded invoice; corrections invalidate it. If the shipment changes while
an upload is in flight, the upload returns a conflict and must be retried.

`shipment.check` returns `{ revision, orderRevision, canSubmit, requiresApproval, issues, items }`. Each issue has a
stable code and message, plus field, cartonId or itemId where applicable. Each item reports orderedPieces,
reservedPieces and availablePieces, excluding the shipment being checked. Preflight is advisory: submission repeats the
same rules under the order lock. It never creates an Amazon shipment.

An invoice the buyer enters itself has its changes applied at once rather than waiting for approval, whether or not the
supplier is on Copacker.

## Order workflow

`GET /api/orders/:id/workflow` (Orders and prices, uncached) returns the PO's revision, status and destination, the
supplier's name, each item's coverage, the shipments with their saved drafts, and current document download links.
Each item has ordered, assigned and remaining pieces, `assignedByStatus` (pieces by shipment status; absent statuses
mean none) and `overAssignedPieces` (positive when assignments exceed the order). Packing drafts and cancelled shipments
reserve nothing; submitted packing in correction or needs-attention still reserves. Each shipment includes:

- `next`: responsible owner (`buyer`, `supplier`, `forwarder`, `system`, or null), step, message and applicable command.
- `editable`, `canSubmit`, structured `issues`, and the saved provider `issue` when work needs attention.
- Shipment and PO revisions, ready date, Amazon identifiers, and `packetUrl` once released while the packet is complete.

Use the server's next step and issues for progress rather than duplicating shipment rules in the UI. There's no release
step: a shipment waiting for labels goes to its supplier as soon as nothing in its `issues` is left (see
[Carrier labels](#carrier-labels)). Document metadata never includes storage keys.

## Open purchase-order coverage

`GET /api/orders/summary` returns `{ orders, nextCursor }` for the active buyer workspace (Orders page). It reads sent
POs only; drafts and closed POs are excluded. It never calls Shopify or Amazon or queues work.

| Parameter | Meaning |
| --- | --- |
| `supplierId` | A buyer-owned supplier UUID; unknown or unrelated IDs return an empty page. |
| `destination` | `amazon` or `warehouse`: the group the PO's line receivers are in. |
| `limit` | Orders per page, 1â€“50, default 20. |
| `cursor` | The previous page's `nextCursor`; omit on the first page. |

Unknown, duplicate or invalid parameters return 400. Orders come in ID order, not creation time. Keep filters unchanged
between pages. Each page is read in one repeatable-read transaction, but pages aren't a frozen export. A cursor stays
usable if its order is closed. `nextCursor: null` means no further matches when that page was read.

Each order includes `id`, `reference`, `revision`, `destination`, nullable `forwarderId` (its stop on the way), supplier
`id`/`name`, pinned `shopifyDomain`/`amazonSellerId`, and `items` with the workflow coverage fields plus `variantId`,
`supplierSku`, `asin`, `fnsku` and `piecesPerSet`. Product identity is store plus variant, never SKU alone. No
cross-order totals, price conversion or stock inference is performed.

A 160-piece PO with 40 pieces received and 60 in an uncertain Amazon create:

```json
{
  "orderedPieces": 160,
  "assignedPieces": 100,
  "assignedByStatus": { "received": 40, "needs_attention": 60 },
  "remainingPieces": 60,
  "overAssignedPieces": 0,
  "piecesPerSet": 2
}
```

The 60 uncertain pieces stay reserved. If assignments totalled 180, it would report `remainingPieces: 0` and
`overAssignedPieces: 20`; don't read the zero as a reconciled PO.

## Shopify, FBA and AWD stock

- `POST /api/inventory/refresh` (buyer, Products) accepts `{ "source": "shopify" }`, `{ "source": "awd" }` or
  `{ "source": "fba", "marketplaceId": "ATVPDKIKX0DER" }`. The account comes from the workspace's connection. Returns
  202 `{id, revision, status}`; a queued or running refresh is reused. No connection returns 409, other inputs 400. It
  queues a read of the whole Shopify store, US FBA or US AWD, never a write.
- Refreshes also start when a store connects, from Shopify inventory webhooks and Amazon FBA notifications, and in a
  daily reconciliation at 07:00 UTC for every stock scope already in use.
- `GET /api/inventory/status?source=...` (buyer, Products) is the sync polling endpoint. It accepts the same source and
  marketplace selection as refresh and returns only `externalAccountId`, `observedAt` and `refresh: {status, errorCode}`.
  It projects metadata inside Postgres; no inventory rows cross the database connection. Unknown or duplicate
  parameters return 400. The response is private and never cached.
- `GET /api/inventory?source=...&limit=100&cursor=...` (buyer, Products) returns source, scope and account identity,
  `snapshotId`, `startedAt`/`observedAt`, the latest `refresh` state (`status`, `revision`, `requestedAt`,
  `errorCode`), `locations`, `rows` and `nextCursor`. Limit is 1â€“200. FBA requires `marketplaceId=ATVPDKIKX0DER`;
  Shopify and AWD reject it. Unknown or duplicate parameters and malformed cursors return 400. A replaced snapshot or a
  changed location filter under a cursor returns 409; restart pagination. Without prices, rows omit cost and price.
- Before the first successful collection, snapshot ID and timestamps are null and rows are empty: unknown stock, not
  zero. A failed refresh keeps the last complete snapshot and reports `errorCode` `shopify_permissions`, `reconnect`,
  `provider_unavailable` or `refresh_failed`; no connection reports `not_connected`. Switching accounts hides the old
  account's data.
- AWD rows keep `sellerSku`, `unit: "amazon_sellable_unit"`, nullable `inbound`, `onHand`, `availableDistributable`,
  `reservedDistributable` and `replenishment`. FBA rows keep each seller SKU/FNSKU/condition identity with Amazon's
  inventory detail fields, in the same unit. Don't add these overlapping states or equate sellable units with PO pieces.
- Shopify rows use scope `store`: variant and inventory item, nullable buyer SKU, tracked status,
  `shopify_inventory_unit`, and location levels with available, on hand, incoming and committed quantities. Signed
  values stay signed and unknown quantities stay null. Variants without levels are kept with empty levels. Shopify,
  FBA and AWD quantities are never combined or converted to PO pieces by these routes. Missing Shopify permissions are
  reported, never requested automatically.
- Shopify reads accept `locationId` (a Shopify Location GID), applied to the whole snapshot before paging; only matching
  levels are returned. `locations` lists the snapshot's observed locations. An unobserved location, or a location on an
  Amazon source, returns 400.
- Amazon reads are paced within a five-minute collection deadline and retry 429 and 5xx responses at most twice.

## Inventory location settings

`GET /api/inventory/locations` returns the connected Shopify domain, current snapshot ID and time, observed locations
with their Shopify kind, classification, automatic classification, whether one is saved, and revision, plus saved but
unobserved location IDs. No connection or snapshot means no observed locations, not zero inventory. Names never decide
classification.

`PATCH /api/inventory/locations` (buyer admin) accepts only `locationId` (a Shopify Location GID), `classification`,
`snapshotId` (the current one) and `expectedRevision`. Classifications are `merchant`, `amazon_mirror`, `excluded` and
`unresolved`. Revision starts at 0 for an unsaved location; saves return the next one. A stale revision or snapshot, or
no connection, returns 409; invalid input or an unobserved location returns 400. These settings never write to Shopify
or Amazon. `amazon_mirror` excludes duplicate stock; it doesn't assert a verified FBA or AWD pool.

## Product labels

A PO line's product label is worked out from its product whenever it's needed, so it follows changes to the product's
barcode, label setting, title and FNSKU:

1. The barcode the buyer uploaded for the variation: a one-page PDF (32 MB or less, no active content).
2. Otherwise none, when the line's `skuLabel` is false or its product's `productLabel` is `none`, except on POs to
   Amazon, which label every unit.
3. Otherwise, for a product set to `uploaded` (such as uniforms whose labels show size measurements), nothing yet: the
   line is flagged until a barcode is uploaded.
4. Otherwise the standard label (`standard`, the default): a US Letter sheet of 30 labels (2 5/8 Ã— 1 in) with a Code 128
   barcode of the code, the code under it, the Shopify title with the variant's options in parentheses, and "Made in
   {country}" from Shopify's country of origin (left out when none is recorded). The code is the line's FNSKU; on a PO
   not to Amazon without one, the Shopify SKU. A line on a PO to Amazon gets its FNSKU when the PO is sent.

- `POST /api/inventory/barcodes` (buyer, Products: Edit, multipart) saves or replaces a barcode and returns `{name,
  bytes, uploadedAt, replaced, target: {variantId, sku, product, variant}}`. It names the variation with `variantId` or,
  for bulk uploads, by SKU: the `sku` field, or else the file name without `.pdf`, matched exactly ignoring case. A
  multi-page or invalid PDF returns 400; an unknown variation or SKU 404; a SKU several variations share, or no Shopify
  connection, 409. Replacing or removing a barcode deletes its stored file; a failed delete is logged as
  `barcode_file_delete_failed`.
- `GET /api/inventory/barcodes?variantId=gid://shopify/ProductVariant/1` (Products) downloads the variation's label: its
  upload, or else the standard sheet. The FNSKU comes from the latest FBA stock sync or else Amazon's listing; without
  either, the Shopify SKU is printed. `view=inline` shows it in the browser. 404 when the product needs an uploaded
  label or the variation has no SKU; 409 when Amazon can't be reached. `DELETE` with the same query removes the upload.
- `GET /api/inventory/products` adds `barcode`, `fnsku` and `countryOfOrigin` to each variant, plus `missingBarcodes`
  (variations whose product needs an uploaded label and has none), `missingCountries` (standard-label variations
  without a country) and `duplicateSkus` (SKUs more than one variation uses).
- `GET /api/inventory/product-labels` lists every synced product as `{productId, title, variations, productLabel}`.
  `PATCH` with `{productIds, productLabel}` sets `standard`, `uploaded` or `none` for up to 500 products and returns
  `{updated}`.
- `POST /api/inventory/labels` with `{productIds}` returns one PDF with a label sheet per variation. `X-Skipped-Labels`
  counts variations without a label yet; none at all returns 404, more than 1,000 variations 400.

A product's `suffocationWarning` setting (default false) starts each new PO line with the same value. A line's
`suffocationWarning` asks the supplier to put a suffocation warning label on each polybag; the PO, its checklist and the
PO page list it with the line's other requirements. The sheet (30 labels on the same stock: a warning triangle,
"WARNING:" in bold and the standard polybag warning) comes with the PO's labels download and the supplier packet.

## Variation and product details

Copacker keeps each variation's supplier SKU, ASIN, Amazon stock target and store stock target, and each product's case
quantity and supplier. The first Shopify stock sync for a store copies them once from the Shopify metafields
`custom.supplier_sku`, `custom.asin`, `custom.amazon_fulfillment_stock_target`, `custom.fencing_club_stock_target`,
`custom.case_quantity` and `custom.supplier`, keeping values Copacker already has; each Supplier name joins the buyer's
suppliers. Copacker doesn't read or write those metafields after that.

Stock syncs fill these into stored Shopify rows, and catalog reads (PO lines, imports, catalog search) add each
variant's `supplierSku` and `asin` and its bundle components' supplier SKUs. `GET /api/inventory/products` returns
`supplierSku`, `asin`, `amazonStockTarget` and `storeStockTarget` on each variant, and `caseQuantity` in each product's
`defaults`.

`PATCH /api/inventory/variant-fields` (buyer, Products: Edit) accepts `{ "variantId": "gid://shopify/ProductVariant/1",
"supplierSku": "AB-100", "asin": "B000000001", "amazonStockTarget": 0, "storeStockTarget": 12 }`; fields left out are
kept. Text is trimmed, one line and up to 255 characters, and empty removes it; targets are whole units or null. The
variation must be in the synced Shopify snapshot (404 otherwise). It refreshes the stored rows and returns all four
values. Invalid input returns 400, no Shopify connection 409. Approving a supplier's invoice saves its supplier SKU
changes the same way.

## AI document imports

The intake page keeps the PDF attachment, Import action and previous imports in one card. UploadCN handles file
selection, drops, pasting and validation. Selecting a PDF only stages it locally: the buyer can remove it before
clicking Import. Upload failures keep the attachment for another attempt. Worker status `running` displays as
"Processing".

The review keeps source descriptions and matching explanations behind each line's **Source details** action. Money
inputs show a prefix derived from the order currency and the reader's locale. Empty supplier lists explain how to add
a supplier without leaving the review. Optional `notes` preserve informational context; `warnings` are reserved for
unresolved issues needing buyer action. The importer includes non-product charges in `adjustments`, using the printed
charge total, negative discounts and source pages, without double-counting subtotals or included taxes.

Buyer routes (Orders: Edit) that bind every record and store lookup to the active workspace:

- `POST /api/imports`: multipart `file` PDF, up to 10 MB and 50 pages; returns `202 {id, status: "queued"}` once the
  source is stored in private object storage and the import and its job commit together. An upload failure creates no
  retryable import. Needs a Shopify connection and the OpenRouter and Langfuse configuration.
- `GET /api/imports`: the latest 50 imports.
- `GET /api/imports/:id`: status, revision, proposal, error and model/prompt metadata. No object keys or credentials.
- `GET /api/imports/:id/source`: the source PDF inline, no-store.
- `GET /api/imports/:id/catalog?q=&cursor=`: searches one 100-variant page of the import's pinned store by buyer SKU,
  supplier SKU and description; returns `results`, `nextCursor` and `complete`. Exact SKU matches rank first within a
  page. No Amazon calls or writes.
- `PATCH /api/imports/:id` `{revision, proposal}`: saves corrections in review, rechecks candidates against the pinned
  store and returns the next revision. 400 for invalid input, 409 when not in review or stale, 503 when catalog
  verification is unavailable (the saved proposal is unchanged; keep local corrections and retry).
- `DELETE /api/imports/:id`: cancels by advancing the revision; the source is kept. Saved imports can't be cancelled.
- `POST /api/imports/:id`: retries a failed import with a fresh revision and job; 409 otherwise.
- `POST /api/imports/:id/save` `{revision, reviewed: true, supplierId, destination, deliveryId?, via?, reference,
  dueDate?, notes?}`: returns `{id, redirect: "/orders/:id"}`. Every row needs a resolved variant, whole-piece
  quantities, a valid set conversion and prices representable in minor units; known totals must reconcile. The server
  re-fetches Shopify and Amazon identities and rejects changed store connections. The import and the new draft PO are
  linked in one transaction; saving again returns the same PO. Saving sends no email and creates no Amazon shipment.

The proposal schema is `src/lib/import-proposal.ts`. It keeps source units and prices, product candidates, unresolved
values and non-product charges. `src/lib/import-totals.ts` adds a proposal up (`importTotals`), so the review page and
the save's document-total check agree. Source SKU stays extraction evidence; it never replaces the canonical buyer or supplier
SKU. Processing runs in the worker with the prompt's `production` label.

Catalog search accepts up to 50 SKU or description queries per call and returns compact identity matches, with full
variant details fetched only when needed. This avoids one model round trip per line on large orders. The model has
32,000 output tokens for proposals of up to 150 lines, a cumulative 600,000-token budget and an eight-minute deadline.
Catalog access remains read-only and scoped to the import's pinned store; candidates must have been returned by a tool.

Each import attempt sends Langfuse a root observation and bounded generation and catalog-tool child observations.
Children carry only timing, fixed operation names and status; document content, model responses, tool arguments and
results, and error text are never sent. The root carries prompt version, model, token and call counts and reported cost
as metadata. Export failure doesn't fail or retry an import.

## Catalog identity

`GET /api/catalog` adds `amazonAsin` and `fnsku` from the connected seller's listings. `amazonError` is null after a
successful lookup, or a message when Amazon couldn't be queried; surface it rather than presenting a missing listing.
Without an Amazon connection both are empty and identities are looked up when the PO is sent.

PO creation re-reads product names, buyer SKU, supplier SKU and inventory item from Shopify, and ASIN and FNSKU from the
connected seller's exact SKU listing. Client-supplied Amazon identities are never kept. An ASIN that disagrees with the
one Copacker holds stops creation. Sending a PO to Amazon fills missing ASINs and FNSKUs and refuses SKUs Amazon doesn't
list. Listings are fetched in batches of 20; SKUs containing commas use an exact item lookup.

## Worker recovery

Workers refresh leases while active. Attempt ownership is checked before external operations, and an atomic create
checkpoint prevents concurrent Amazon creation. Never blindly retry a create: an uncertain outcome must be reconciled
with `shipment.reconcile`, and a correction is refused until the original order is identified. Manual retries start a
fresh job identity with the same business key, so an expired worker can't regain ownership. Reconciled orders are
re-read and matched against reference, carton contents and origin before confirmation. Reconciliation and cancellation
use the Amazon account pinned to the PO.

## Amazon reconciliation evidence

`GET /api/analytics/amazon/reconciliation` requires a buyer workspace with Sales and Prices access. Query `source`, `from`, `to`
and optional zero-based `page`; ranges use UTC dates and are limited to 31 days. Returns paginated source evidence,
observed product matches, financial candidates, independent transaction arithmetic checks and explicit coverage/search
limits. It does not write matches or change accounting totals. See [reconciliation](amazon-reconciliation.md).

## Historical Amazon mappings and allocations

`GET /api/analytics/amazon/product-mappings` lists the connected seller's dated mappings, including retired audit records, with
buyer Sales/Prices access. POST creates or atomically supersedes a mapping; DELETE retires it. Writes require Products
edit, Prices, app Origin and current seller identity; targets must be known locally in the workspace. Overlap/stale
conflicts return 409, invalid input 400. See [mapping contract](amazon-cost-allocation.md).

`GET /api/analytics/amazon/allocations` takes UTC `from`, `to` (maximum 31 days) and optional zero-based `page`. Buyer Sales/Prices
access is required. Returns at most 100 transaction allocations with explicit net/recognized-fee remainders and coverage.
It does not change Overview profit or COGS. Reconciliation source rows now include `historicalProduct`.

## Analytics HTTP resources

The Amazon analytics routes use the [analytics HTTP contract](analytics-api.md): individual mapping URLs, bounded
collections with change-detecting pagination, idempotent creation retries, and JSON Problem Details errors. These rules
apply to `/api/analytics/amazon`; the existing action and sales-status contracts above remain separate.

## Historical inventory cost inputs

The [historical inventory basis contract](historical-inventory-basis.md) defines purchase-cost, opening-balance and
receipt resources under `/api/analytics`, including audited revisions, exact money, source deduplication and receipt
quantity limits. These records do not yet change Overview or calculate historical COGS.

See [historical landed costs and FIFO](inventory-costing.md) for landed charges, depletion records and calculation resources.

## Inventory snapshots

Shopify stock snapshots always include product IDs, product titles, variation titles and nullable image URLs.
Products are grouped and searched by product ID; variant IDs are not substitute product identities. The inventory API
does not expose an upgrade or resync flag for old snapshots. Sync remains available for ordinary inventory refreshes.
