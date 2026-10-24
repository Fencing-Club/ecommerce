# Shipping document templates

The **Documents / Supplier packet** Storybook folder groups examples into:

- **Documents**: Packet Overview, Packing List, Packing Checklist, and Carton Label Reference.
- **Shipping arrangements**: Amazon, warehouse, and freight-forwarder scenarios.
- **Checklists**: parcel, freight, supplier transfer, forwarder pickup, and repacking requirements.
- **Languages**: German, Chinese, Urdu, and the current-user language default.
- **Layout**: pagination, large carton groups, Markdown instructions, and mobile.
- **States and settings**: loading, failure, missing label assignments, and saved download preferences.

**Simulators / Supplier packet** builds the whole packet from a shipment as production does, with sample labels, and
lists every checklist line with when it's printed (see [Storybook](storybook.md#simulators)).

It is the review surface for the Pen packing list, checklist,
label reference, and shipment overview. It generates a real PDF with `@react-pdf/renderer` and previews that same
file with PDF.js. No Chromium executable, backend service, customer data, or credentials are needed to generate it.
The shipment's supplier-packet page uses these same templates. Provider barcode artwork stays on the authenticated
label-download endpoint and is never recreated from the preview.

## One pipeline

Copacker makes its packing list and packing checklist one way: this pipeline. The framework-free parts live in
`@repo/copacker-shipments`, so a script or CLI builds the same snapshot the app does:

- `shipping-snapshot`: `shippingDocumentSnapshot` and `packingListSnapshot` turn an accepted PO, its packing, labels and
  transport into the document data.
- `shipping-model`: the snapshot's types, document settings, `documentIssues` and `cartonGroupLabel`.
- `shipping-rules`: the checklist lines for each product task and carton or pallet rule.
- `shipping-copy`: the documents' text in each language.

The app keeps only the React renderer: `src/documents/shipping-pdf.tsx` and `src/documents/supplier-packet.tsx`. The
package's own pdf-lib documents are the purchase order and commercial invoice.

## Composition

`@repo/copacker-shipments/shipping-model` describes the immutable shipment snapshot. Destination, booked transport,
recipient, incoming transfer, products, and explicit carton label assignments are independent inputs. Templates
share typography, page headers, footers, addresses, totals, and assignment rows. The scenario fixtures cover parcel
pickup/drop-off, FBA/AWD freight, AGL, own warehouses, both supplier-to-forwarder arrangements, and forwarder repacking.

Product tasks are an explicit list: absence means the recipient has no task. They are not inferred from the destination.
The approved Pen/Storybook packing modal offers None, Polybag, or Sealed polybag, plus independent optional SKU,
FNSKU, suffocation, and choking hazard labels. Country-of-origin labels are outside this scope. The shared
option IDs and validation live in `@repo/copacker-orders/packing-requirements`, with UI options in `src/lib/packing-requirements.ts`.
PO items persist explicit tasks in their JSON snapshot through the packing-details modal. Existing items without
explicit tasks must be confirmed before generating these documents; destination alone does not establish a labelling
task. Custom packaging with reference photos remains a planned follow-up.

Carton grouping includes contents, quantities, dimensions, and weight. Each physical carton retains its own Amazon
and carrier label identifier. The packing list leaves label numbers out; the carton label reference lists them, one row
per carton under Carton, Carton label, and Carrier label columns, then each pallet's label.
Carton groups stay intact with repeated headings on each page; a group too large for one page blocks generation for
layout review. Missing required assignments and duplicate IDs block download. Provider label PDFs
must be downloaded separately in their original form and page size; these templates are reference documents,
not replacements for barcode labels.

## Download preferences and localization

The shadcn Button Group joins the primary download action and settings trigger. Settings expose only language and
A4/US Letter. Direction follows the selected language. With no saved preference, use the current app language when
a PDF translation exists (English otherwise) and A4. Only explicit user choices are saved in browser local storage.
These preferences are local to the browser; they do not change the order or shipment.
English, German, Simplified Chinese, and Urdu are review samples drawn from the app's supported locales.
Translations require native-speaker review before customer release. Names, addresses, SKU/label IDs, and authored
Markdown remain source data. Urdu mirrors layout and table order; identifiers remain left to right.

Fonts are bundled under `public/document-fonts`, with their SIL Open Font Licenses. Inter comes from the repository's
print fonts. Noto Sans Arabic and Noto Sans SC come from Google Fonts' `ofl/notosansarabic` and `ofl/notosanssc`
directories. The variable TTFs were instantiated at weights 400 and 600 with fontTools, other axes at their defaults,
then saved as WOFF for Arabic and TTF for Chinese. Uncompressed Chinese fonts avoid expensive client-side WOFF
decompression. React-pdf requires static TTF/WOFF; do not substitute the app's WOFF2 fonts. Do not remove glyphs
to make a document fit or subset these fonts only to the fixture text.

All previews and exports use `renderShippingDocument`. It serializes rendering and registers fresh fonts per document:
reusing renderer font objects across exports can shift Unicode punctuation and word boundaries in later PDFs.

## Local packet exports

`pnpm --filter copacker export:shipment-packet` renders a supplier packet locally from JSON, so a packet can go to the
supplier before Copacker can release one: before Amazon has the shipment, or for the supplier's leg to a forwarder.
It never books transport, calls a provider, uploads or sends anything.

- `export:shipment-packet <packet.json | -> <output-directory>` renders the JSON in a file, or on stdin with `-`.
- `export:shipment-packet --shipment <id> <output-directory>` reads a packed shipment from the database in `.env`.
- `export:shipment-packet --shipment <id> --json` prints that shipment's JSON instead, to edit and render.

The JSON holds the accepted PO with each line's packing requirements, the packing, transport (from the database, worked
out from the shipment's route), destination, the company and supplier names, revision, shipment name and
language/paper settings. Its optional fields:

- `amazonPending`: an Amazon shipment before Amazon has it, so the packet has no carton labels or warehouse address.
- `onward`: for a PO through a forwarder, where the forwarder takes the cartons next. The destination is the
  forwarder's address, and the documents are the forwarder leg's.
- `originalLabels`: an AWD shipment's original Amazon carton labels PDF, relative to the JSON file. The exporter matches
  its labels to cartons by SKU, FNSKU and quantity, keeps the PDF's bytes, and adds the carton reference and labels.
- `evidence`: where the input came from, for the verification manifest.

Reading from the database refuses a shipment that already has Amazon's labels: its packet comes from the app.

`shippingDocumentSnapshot` validates packing with the same rules as the app and requires one explicit label assignment
per carton unless Amazon is pending. The exporter writes the packing list, the checklist, the carton reference when
there are labels, the combined packet in the app's packet order, and a verification manifest of totals, hashes, any
label assignments and their source pages. Unconfirmed packing requirements, missing supplier SKUs, unmatched labels
and unsupported handoffs stop export. The provider PDF retains its original page size.

`amazonCartonPolicies` in `@repo/copacker-shipments` supplies numeric limits to validation and these templates. Transport
requirements stay in `@repo/copacker-shipments/transport`.

## Shipment integration

`/shipments/:id/packet` reads the released shipment revision, not mutable PO values. It verifies access, readiness,
explicit product tasks, supplier SKUs and the destination returned for the exact linked Amazon shipment. The page
does not expose prices or storage keys. Incomplete input shows an explanation and a link back to the shipment.

The API serves `verify`, `carton_labels`, `carrier_labels`, `pallet_labels` and `product_labels` sections. Each download checks current
workspace membership and a snapshot hash before and after reading files. The browser verifies that same hash before
and after assembling a packet. A stale page cannot download a mixture of revisions. Responses are private and
uncacheable. Individual labels preserve provider page dimensions; the combined PDF retains those dimensions too.

The packet runs: the packing list, the checklist, the carton label reference, the carton labels (Amazon's, then the
carrier's), the pallet labels for an FBA shipment on pallets, then the product labels. The reference lists every carton with its labels in one table, right before the
label pages; a packet without carton labels leaves it out. `renderSupplierPacket` owns this order.

Before the packet, a read-only shipment page lists a Packing list under Documents once packing is finished.
`GET /api/shipments/:id/packing-list` returns `packingListSnapshot`: the packed cartons and products, with no label
assignments, handoff or destination address. The browser renders it with the packing-list template's `packingRecord`
layout, in the language and paper last chosen for shipping documents. A line without a supplier SKU is listed by the
buyer's, as the packing page shows it. When the packet page can't make its reference documents, it still offers the
packing list beside the label files.

The live packet covers a supplier handing its cartons to the carrier itself without separate carrier labels: by AGL,
or by freight, on pallets (with Amazon's pallet labels for FBA) or loaded loose. A freight packet names a freight
carrier pickup and asks the supplier to have the bill of lading ready; copacker doesn't record the carrier's name or the
bill of lading number, which the templates print when given. The templates demonstrate more arrangements, but the live adapter still needs
persisted carrier label numbers for each carton before a shipment with carrier labels can export, and a forwarder's
handoff is prepared as its own leg. It rejects missing information instead of inferring it from PDF order. Multiple
Amazon destinations must be represented separately.

The documents' service, pickup or drop-off, handoff party and carrier-label requirement come from the shipment's
route (`routeTransport`, see [Packing](packing.md)). Saving a route books nothing. Choosing AGL does not create a new
Amazon shipment or notify the supplier. FBA booking is independent of document generation.

## Acceptance

Review the actual downloadable PDF on A4 and Letter, plus German, Chinese, and Urdu. Check multi-page packing and
reference examples for repeated headings and intact carton groups. Stories cover download bytes, saved preferences,
mobile, loading, generation failure, and missing carrier assignments. `@repo/copacker-shipments`' tests cover the
snapshot, model, rules and copy; the app's cover only what `ShippingPdf` refuses or accepts. No test renders a PDF or
reads its text; the PDF stories carry the `documents` tag, which verify and CI skip. Fonts, complex
scripts, and long content require visual review. Never treat the Pen screenshot of an Amazon label as printable label artwork.

## Carton import workbook

The download has one prefilled `Cartons` table and a localized `Instructions` sheet. Supplier SKU, product, variant,
and units per pack identify each product; unchanged reference cells are shaded. The importer rejects ambiguous supplier
SKUs instead of guessing, and ignores unused product rows until packing values are entered. Column headers and the
`Cartons` worksheet name remain stable in English for XLSX and CSV imports. Instructions use the current app language;
Urdu workbook sheets read right to left. A carton ID identifies a physical carton or an identical-carton group, not an
Amazon label. Group expansion and numbering follow the shared carton-group implementation.
