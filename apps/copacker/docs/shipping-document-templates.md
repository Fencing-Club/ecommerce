# Shipping document templates

The **Documents / Supplier packet** Storybook folder groups examples into:

- **Documents**: Packet Overview, Packing List, Packing Checklist, and Carton Label Reference.
- **Shipping arrangements**: Amazon, warehouse, and freight-forwarder scenarios.
- **Checklists**: parcel, freight, supplier transfer, forwarder pickup, and repacking requirements.
- **Languages**: German, Chinese, Urdu, and the current-user language default.
- **Layout**: pagination, large carton groups, Markdown instructions, and mobile.
- **States and settings**: loading, failure, missing label assignments, and saved download preferences.

It is the review surface for the Pen packing list, checklist,
label reference, and shipment overview. It generates a real PDF with `@react-pdf/renderer` and previews that same
file with PDF.js. No Chromium executable, backend service, customer data, or credentials are needed to generate it.
The shipment's supplier-packet page uses these same templates. Provider barcode artwork stays on the authenticated
label-download endpoint and is never recreated from the preview.

## Composition

`src/documents/shipping-model.ts` describes the immutable shipment snapshot. Destination, booked transport,
recipient, incoming transfer, products, and explicit carton label assignments are independent inputs. Templates
share typography, page headers, footers, addresses, totals, and assignment rows. The scenario fixtures cover parcel
pickup/drop-off, FBA/AWD freight, AGL, own warehouses, both supplier-to-forwarder arrangements, and forwarder repacking.

Product tasks are an explicit list: absence means the recipient has no task. They are not inferred from the destination.
The approved Pen/Storybook packing modal offers None, Polybag, or Sealed polybag, plus independent optional SKU,
FNSKU, suffocation, and choking hazard labels. Country-of-origin labels are outside this scope. The shared
option IDs and validation live in `@repo/aisle/packing-requirements`, with UI options in `src/lib/packing-requirements.ts`.
PO items persist explicit tasks in their JSON snapshot through the packing-details modal. Existing items without
explicit tasks must be confirmed before generating these documents; destination alone does not establish a labelling
task. Custom packaging with reference photos remains a planned follow-up.

Carton grouping includes contents, quantities, dimensions, and weight. Each physical carton retains its own Amazon
and carrier label identifier. When both labels are required, the packing list pairs them on one row per carton under
Carton, Carton label, and Carrier label columns. Single-label shipments use the compact label-number grid.
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
Markdown remain source data. Urdu mirrors layout and table order; identifiers remain left to right. Language names
and reading direction reuse the app's locale definitions.

Fonts are bundled under `public/document-fonts`, with their SIL Open Font Licenses. Inter comes from the repository's
print fonts. Noto Sans Arabic and Noto Sans SC come from Google Fonts' `ofl/notosansarabic` and `ofl/notosanssc`
directories. The variable TTFs were instantiated at weights 400 and 600 with fontTools, other axes at their defaults,
then saved as WOFF for Arabic and TTF for Chinese. Uncompressed Chinese fonts avoid expensive client-side WOFF
decompression. React-pdf requires static TTF/WOFF; do not substitute the app's WOFF2 fonts. Do not remove glyphs
to make a document fit or subset these fonts only to the fixture text.

All previews and exports use `renderShippingDocument`. It serializes rendering and registers fresh fonts per document:
reusing renderer font objects across exports can shift Unicode punctuation and word boundaries in later PDFs.
The regression test renders a packing list followed by two checklist requests and checks their extracted text.

## Audited local exports

`pnpm --filter copacker export:shipment-packet <snapshot.json> <output-directory>` exports an audited AWD shipment
with a direct supplier handoff and no separate carrier labels. The input contains the accepted PO, packing,
explicit product tasks, transport, verified destination, original Amazon label file, language/paper settings,
and verification provenance. It never accesses a database or books transport.

`shippingDocumentSnapshot` validates packing with the same rules as the app and requires one explicit label assignment
per carton. The exporter matches original PDF labels by SKU, FNSKU and quantity, preserves the original PDF bytes,
and creates the packing list, checklist, carton reference, and combined packet (in the app's packet order). A verification manifest records
the assignments, source page numbers, totals, hashes and verification timestamp. Incomplete product tasks, missing
supplier SKUs, unmatched labels and unsupported handoffs stop export. The provider PDF retains its original page size.

`amazonCartonPolicies` in `@repo/aisle` supplies numeric limits to validation and these templates. Transport
requirements stay in `@repo/aisle/transport`.

## Shipment integration

`/shipments/:id/packet` reads the released shipment revision, not mutable PO values. It verifies access, readiness,
explicit product tasks, supplier SKUs and the destination returned for the exact linked Amazon shipment. The page
does not expose prices or storage keys. Incomplete input shows an explanation and a link back to the shipment.

The API serves `verify`, `carton_labels`, `carrier_labels` and `product_labels` sections. Each download checks current
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

The first supported live document arrangement is direct supplier-to-Amazon AGL pickup without separate carrier
labels. The templates demonstrate additional arrangements, but their live adapter requires persisted per-carton
carrier assignments and explicit freight/forwarder handoff data before enabling them. It rejects missing information
instead of inferring it from PDF order. Multiple Amazon destinations must be represented separately.

Transport configuration records the service, pickup/drop-off, handoff party, carrier-label requirement and instructions.
Selecting a service proposes defaults; it does not book transport. Confirming AGL pickup does not create a new Amazon
shipment or notify the supplier. FBA booking is independent of document generation.

## Acceptance

Review the actual downloadable PDF on A4 and Letter, plus German, Chinese, and Urdu. Check multi-page packing and
reference examples for repeated headings and intact carton groups. Stories cover download bytes, saved preferences,
mobile, loading, generation failure, and missing carrier assignments. Unit tests inspect actual PDFs for page size,
continuation headers, label identity, and group integrity. Fonts, complex scripts, and long content also require visual
review. Never treat the Pen screenshot of an Amazon label as printable label artwork.

## Carton import workbook

The download has one prefilled `Cartons` table and a localized `Instructions` sheet. Supplier SKU, product, variant,
and units per pack identify each product; unchanged reference cells are shaded. The importer rejects ambiguous supplier
SKUs instead of guessing, and ignores unused product rows until packing values are entered. Column headers and the
`Cartons` worksheet name remain stable in English for XLSX and CSV imports. Instructions use the current app language;
Urdu workbook sheets read right to left. A carton ID identifies a physical carton or an identical-carton group, not an
Amazon label. Group expansion and numbering follow the shared carton-group implementation.
