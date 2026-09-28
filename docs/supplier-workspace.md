# Supplier workspace

A supplier's sidebar has Overview, then Sales (Orders, Shipments, Customers) and Products (Products, Inventory,
Catalogs). Overview, Orders and Products share their routes with the buyer's pages and render the supplier's version
when the workspace is a supplier.

## Overview

A supplier's Overview (`src/server/supplier-overview.ts`) covers its supply operations for a period picked like the
buyer's: orders received, their value (in the currency most orders use), pieces ordered and pieces shipped, each against
the previous period. It also shows what needs doing, where open orders stand, the most-ordered products and customers,
and inventory health against open orders. An order counts on the day its first shipment opened, which is when it was
sent. Pieces count as shipped on the day the supplier marked the shipment shipped.

## One workspace per page

The active workspace is a cookie every tab shares, and the portal's layout doesn't render again on navigation. So
`WorkspaceWatch` reloads a tab when another tab switches workspaces, and it checks `/api/workspace` on each page change
and on focus. That way a page never shows one workspace's data under another's sidebar.

## Products and variants

A product (`supplier_product_groups`) has a title, description, category, product code, store page, up to four option
names and photos. Each variant is a `supplier_products` row: one SKU with its price, currency, price basis (piece, pack
or case), packaging, stock and notes. A variant's `title` is the product's title followed by its option values, such as
"Blade (Left, 5)", because PO snapshots and matching read it. Saving a product archives variants left off the form
rather than deleting them, so earlier POs and stock records keep them.

The Inventory page edits on hand counts in place, as Shopify does. Each change shows as a green or red difference, and Save commits every changed row in one transaction (`/api/supplier-catalog/stock`).

Photos are stored under `supplier-images/<supplier workspace>/` and served by `/api/product-images`, which lets the
supplier and the buyers it supplies read them.

## Pricing

Pricing lives in `src/lib/catalog-pricing.ts`, shared by the browser and the server:

- **Volume pricing**: price breaks, each a minimum quantity and a unit price, lowest quantity first. Below the first
  break, the variant's own price applies.
- **Quantity rules**: minimum, maximum and increment. Quantities are in the variant's price basis. The PO match
  converts them, like prices, into pieces.
- Checks follow Shopify's: the minimum and maximum are multiples of the increment, break quantities rise above the
  minimum, and break prices fall.

## Catalogs

A catalog is a price list for some of the supplier's customers, like a Shopify catalog. A `catalog_products` row
includes a variant and can set a fixed price, volume pricing and quantity rules. Everything else follows the variant,
moved by the catalog's adjustment (`adjustmentBasisPoints`, where -1000 is 10% off). A fixed price drops the variant's
volume pricing unless the catalog sets its own. Each customer (`suppliers.catalogId`) has at most one catalog, and
only an active one applies. A customer without one orders every active product at its own price.

`customerProducts` in `src/server/catalogs.ts` is the one place that applies a customer's catalog. The PO builder's
catalog match, preparing a PO, the supplier's order edit and quantity-rule checks on sending a PO all read through it.
When a catalog is set to include new products, a new product joins it, and a new variant joins every catalog its
product is in.

Catalogs export as an Excel or PDF price list (`/api/catalogs/[id]/export`) to send to customers.

## Product template

`src/server/product-sheet.ts` defines one template for CSV and Excel, one row per variant. Rows with the same handle
are one product, whose details come from its first row. Import matches variants by SKU: it updates matching SKUs,
adds new ones and leaves everything missing from the file as it is. It previews first, and the preview's hash guards
the import against changes made in between. The Excel version adds dropdowns for fixed choices and an Instructions
sheet.

## Order changes

A supplier can edit a sent PO while its shipments are still being packed: quantities, prices, added and removed
products, payment terms and the ready date. A change to the ready date alone applies straight away. Other changes
become a pending `order_proposals` row that the buyer approves or declines on the PO page. Approving publishes the next
PO revision, which fills in added products from the buyer's Shopify variants with that supplier SKU. It also files the
supplier's commercial invoice with the shipment being packed, so the supplier doesn't upload one.
