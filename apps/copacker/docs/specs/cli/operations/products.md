# Product catalog and inventory schemas

Use [shared types](shared.md), [write destinations](../destinations.md) and [bulk rules](../bulk.md). Product IDs identify
groups; variant IDs identify sellable/supplier items. Catalog membership names variants explicitly, even though the
current internal supplier field is called `productId`.

## Product records and editable fields

`Product = {id, revision, kind:"buyer"|"supplier", title, status:"active"|"archived", sourceRefs:SourceRef[],
variants:Variant[], metadata:ProductMetadata, writePolicy, fieldCapabilities, allowedActions:string[]}`.
Supplier products additionally return `category, productCode, url, description, optionNames, images:Artifact[]`.
`Variant = {id, revision, productId, sku:string|null, supplierSku:string|null, sourceRefs:SourceRef[],
options:{[optionName]:string}, piecesPerSellablePack:integer|null, sellablePacksPerCase:integer|null,
stockTargets:StockTarget[], listings:Listing[], price?:Money|null, cost?:Money|null, wholesale?:SupplierPricing}`.
Price/cost fields follow redaction. `ProductMetadata` has `supplierId:Id|null`, `caseQuantity:integer|null`,
`prepCategory`, `suffocationWarning:boolean` and `productLabel:"standard"|"uploaded"|"none"`.

`ProductPatch` permits `supplierId:Id|null`, `caseQuantity:integer 1..1000000|null`, the `PrepCategory` enum from `@repo/copacker-shipments` and
`suffocationWarning:boolean`. All fields are optional, but at least one must be present. `VariantPatch` permits
`supplierSku:Text<255>|null`, `asin:10 uppercase alphanumeric characters|null`, and `stockTargets:StockTargetChange[]`.
`StockTargetChange = {poolId:Id, quantity:integer 0..1000000|null, unit:"piece"|"sellable_unit"}`. Each pool occurs once;
entries update/clear only named targets, leaving other pools intact. `StockTarget` returns those fields plus revision.
Pool IDs must resolve in the workspace and have a compatible unit. These are desired stock targets, never counts.

Buyer titles/descriptions/images and arbitrary source fields are not patchable. Buyer SKU uses the dedicated SKU
branch below. Supplier-only variant patches also permit `options`, `SupplierPricing`, packaging, tracking,
continue-selling and active status, under the full-product constraints; no patch accepts `onHand`.

`SupplierPricing = {currency, priceMinor:integer 0..2147483647|null, priceBasis:"piece"|"sellable_pack"|"case",
priceBreaks:[{minimum:integer 1..10000000,priceMinor:integer 0..2147483647}],
quantityRules:{increment:positive integer,minimum:positive integer,maximum:positive integer|null}}`.
At most 25 breaks; reuse the increment/minimum/maximum and descending-price refinements from
[catalog pricing](../../../../src/lib/catalog-pricing.ts).

`SupplierProductInput` reuses [productInputSchema](../../../../src/server/supplier-products.ts) with these public changes:
identity/revision are outside the replacement data; images are authorized `imageIds:Id[]`, never object keys; variants
have stable IDs for existing rows and `clientReference:Text<64>` for new rows; `onHand` is removed. Optional
`inventory:InitialStock[]` uses the union `{variantId,locationId,quantity,expectedQuantity,expectedRevision}` or
`{variantClientReference:Text<64>,locationId,quantity,expectedAbsent:true}`. Each entry is matched to one
included variant. An omitted stock entry preserves stock. Product import/creation applies these changes under the
[supplier stock guards](../resources.md#supplier-catalogs-and-inventory). Full product saves archive omitted variants.

## Single and bulk write inputs

`Write<T>` has `{mode:"preview", ...proposed T}`, `{mode:"direct", ...guarded T}` or
`{mode:"apply", previewId:Id, variantId?:Id, id?:Id}`. Apply identity is optional only when the preview uniquely supplies
it; if supplied it must match. A preview supplies observations, never missing desired values. Bulk replaces the direct/
preview body with `rows` and additionally supports `mode:"read",batchId` through the same operation.

| Change type | Exact direct fields |
| --- | --- |
| `BuyerProductChange` | `{id, expectedRevision, patch:ProductPatch}` |
| `VariantMetadataChange` | `{variantId, expectedRevision, expectedProductRevision, patch:VariantPatch}`; supplier patches use the supplier allowlist above. |
| `SkuChange` | `{variantId, expectedRevision, expectedProductRevision, expectedLinkRevision, expectedSku:string\|null, sku:Text<255>}`; supplier-local SKU instead uses its typed supplierSku patch. |
| `PriceChange` | `{variantId, expectedRevision, expectedLinkRevision, expectedSourceRevision, expectedSourceValue:Money\|null, amountMinor, currency, targetPrices?:[{listingId,amountMinor,currency}], pricingRule?:{id,expectedRevision}}` |
| `CostChange` | `{variantId, expectedRevision, expectedLinkRevision, expectedSourceRevision, expectedSourceValue:Money\|null, amountMinor, currency}`; cost is per source sellable unit, conversion to PO per-piece cost is explicit. |
| `SupplierAssignment` | `{id:productId, expectedRevision, supplierId:Id\|null}` |
| `StockChange` | `{variantId, locationId, quantityState:"on_hand"\|"available", quantity:signed integer, expectedQuantity:signed integer, expectedRevision, expectedLocationRevision, expectedLinkRevision, reason:Text<255>}` |
| `StockAdjustment` | StockChange with `delta:nonzero signed integer` instead of `quantity`; single record only. |

Preview permits guards/expected current values to be absent. Price and inventory unit/range constraints come from the
resolved binding; FBM availability cannot be negative. `targetPrices` has no duplicates and can name only linked
destinations. Pack/currency differences must resolve under [the existing price-basis contract](../write-routing.md).
This schema does not introduce pricing-rule CRUD or decide its configuration policy. All direct writes require guards
on every resolved destination; `targetGuards:[{targetId,expectedRevision,expectedValue:TypedValue|null}]` is additionally
required for PriceChange and for any write with more than one target. Preview captures this complete guard set.

## Product operations

`ProductFilter = {kind?:"buyer"|"supplier", connectionId?:Id, supplierId?:Id, status?:"active"|"archived",
sku?:Text<255>, query?:Text<500>}`. Lists sort by title then ID; allowed sort is `title|updatedAt` with `direction:asc|desc`.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `product.list` | `PageInput & ProductFilter & {sort?,direction?}` | `Page<Product>` | Products; stored read. |
| `product.search` | `PageInput & {query:Text<500>,connectionId?:Id,supplierId?:Id}` | `Page<Product>` ranked by exact SKU then title/ID | Products; stored read. |
| `product.show` | `{id, operationId?:Id}` | `Product & {write?:WriteResult}` | Products; exact execution, when requested, must belong to the product. |
| `product.create` | `{clientReference:Text<64>, data:SupplierProductInput}` | `Saved<Product>` | S ProductEdit + P; StockWrite if inventory supplied. Local product/variant creation; identity/collision validation. |
| `product.update` | B `Write<BuyerProductChange>`; S `{id,expectedRevision,expectedVariantRevisions:[{id,revision}],data:SupplierProductInput}` | B WritePreview/WriteResult/BatchResult; S Saved<Product> | ProductEdit, P for supplier save; local edit, no hidden stock writes. `identity_unresolved`. |
| `product.variant.update` | `Write<VariantMetadataChange \| SkuChange>` or matching bulk | WritePreview/WriteResult/BatchResult | Metadata: ProductEdit; buyer SKU: ChannelEdit. Supplier pricing requires P. Local metadata or Shopify-only SKU write. `identity_unresolved`, `route_unavailable`. |
| `product.price.update` | `Write<PriceChange>` or matching bulk | WritePreview/WriteResult/BatchResult | ChannelEdit + P; authority then every linked price target. `route_unavailable`, `partial_write`, `outcome_unknown`. |
| `product.cost.update` | `Write<CostChange>` or matching bulk | WritePreview/WriteResult/BatchResult | ChannelEdit + P for external authority; ProductEdit + P for local. Cost-authority write. Same routing failures. |
| `product.supplier.assign` | `Write<SupplierAssignment>` or matching bulk | WritePreview/WriteResult/BatchResult | B ProductEdit; local assignment, validates supplier relationship. |

`Listing = {id, revision, source:SourceRef, sellerSku:string, fulfillmentMode:"fbm"|"fba"|"other",
variantId:Id|null, linkRevision, piecesPerListing:integer|null, price?:Money|null, availability:Quantity|null,
capabilities:TargetCapability[], observedAt:Instant|null}`. An unlinked listing still has a canonical ID and revision.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `product.listing.list` | `PageInput & {connectionId?:Id, marketplaceId?:string, sellerSku?:Text<255>, unlinked?:boolean, variantId?:Id}` | `Page<Listing>`, sellerSku/ID sort | Products; `unlinked:true` excludes variantId. |
| `product.listing.show` | `{id}` | `Listing` | Products; stored read. |
| `product.listing.link` | `Guard & {variantId, expectedVariantRevision, expectedProductRevision, piecesPerListing:positive integer}` | `Saved<Listing>` | B ProductEdit; local durable binding only, no provider rename. Guard is linkRevision. Reject link to an already different item; unlink first. |
| `product.listing.unlink` | `Guard` | `Saved<Listing>` with variantId null | B ProductEdit; local detach; conflicts with unresolved writes using the link. |

## Supplier catalogs

`CatalogInput` reuses [catalogInputSchema](../../../../src/server/catalogs.ts), excluding outer id/revision and renaming
each membership `productId` to `variantId`. Fields are `title:Text<255>`, `status:active|draft|archived`,
`adjustmentBasisPoints:integer -10000..100000`, `includeNewProducts:boolean`, `customerIds:Id[0..5000]`, and
`products:[{variantId,priceMinor:integer|null,priceBreaks:PriceBreak[]|null,quantityRules:QuantityRules|null}]` (max 50000).
Null price overrides inherit the product price. `Catalog = {id,revision,...CatalogInput,allowedActions:string[]}`.

Catalog saves additionally require `expectedProductRevisions:[{variantId,revision}]` and
`expectedAssignments:[{customerId,expectedRelationshipRevision,expectedCatalogId:Id|null,expectedCatalogRevision:Revision|null}]`
for all assignments added, retained, moved or removed by the full save. Return affected relationship/catalog revisions.
These guards cover assignment changes outside this catalog; a full save cannot overwrite a concurrent customer reassignment.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `catalog.list` | `PageInput & {status?:Catalog.status,query?:Text<255>}` | `Page<Catalog>` sorted title/ID | CatalogRead. |
| `catalog.show` | `{id}` | `Catalog & {assignmentDependencies:Dependency[]}` | CatalogRead. |
| `catalog.create` | `{clientReference,data:CatalogInput,expectedProductRevisions,expectedAssignments}` | `Saved<Catalog> & {changedDependencies:Dependency[]}` | CatalogWrite + PartnersWrite when assigning customers; local transaction. |
| `catalog.update` | `Guard & {data:CatalogInput,expectedProductRevisions,expectedAssignments}` | Same as create | Same access; complete replacement, omitted membership removed, archived members retained under current rules. |
| `catalog.remove` | `Guard & {expectedAssignments}` | `Removed & {changedDependencies:Dependency[]}` | CatalogWrite + PartnersWrite for assignment effects; clear assignments atomically. |
| `catalog.export` | `Export<{id:Id,expectedRevision:Revision}>`, xlsx/pdf | `ExportResult` | CatalogRead; authorized generation, not a catalog mutation. |

## Inventory and locations

`Balance = {variantId,locationId,kind:"physical"|"reported"|"channel_availability",quantityState:string,
quantity:Quantity,revision,snapshotId:Id|null,observedAt:Instant|null,commitments:Quantity|null,
available:Quantity|null,tracking:boolean|null,continueSelling:boolean|null,target:TargetCapability,
nativeBalances:[{name:string,quantity:Quantity}]}`. Native names retain provider states; they are not automatically summable.
`StockFilter = {connectionId?:Id,locationId?:Id,variantId?:Id,sku?:Text<255>,kind?:Balance.kind}`.
`Location = {id,revision,name,kind:"merchant"|"supplier"|"amazon_reported"|"channel_availability",
classification:"merchant"|"amazon_mirror"|"excluded"|"unresolved",source:SourceRef|null,snapshotId:Id|null,
quantityStates:string[],writeCapabilities:TargetCapability[],observedAt:Instant|null}`.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `inventory.list` | `PageInput & StockFilter` | `Page<Balance>`, variant/location/state order on one snapshot | StockRead; `cursor_invalidated`. |
| `inventory.show` | `{id:productId,locationId?:Id,operationId?:Id}` | `{productId,balances:Balance[],write?:WriteResult}` | StockRead; no missing balance becomes zero. |
| `inventory.history` | `PageInput & {id:productId,locationId?:Id} & Period` | `Page<{variantId,locationId,date,quantity:Quantity,origin:SourceRef}>` | StockRead; stock-day observations only, date/variant/location order. |
| `inventory.export` | `Export<StockFilter>`, csv/json | `ExportResult` | StockRead. |
| `inventory.update` | `Write<StockChange>` or matching bulk | WritePreview/WriteResult/BatchResult | StockWrite; local transaction or one resolved external count per target. `route_unavailable`, `partial_write`. |
| `inventory.adjust` | `Write<StockAdjustment>` | WritePreview/WriteResult | StockWrite; supported local/Shopify delta only. `route_unavailable`, `outcome_unknown`. |
| `location.list` | `PageInput & {connectionId?:Id,kind?:Location.kind,classification?:Location.classification}` | `Page<Location>` sorted name/ID | B Products + `locations:read`, or S StockRead + `locations:read`. |
| `location.show` | `{id}` | `Location` | Same read policy. |
| `location.update` | `Guard & {snapshotId:Id,classification:Location.classification}` | `Saved<Location>` | B Admin(locations:write); observed Shopify locations only. Classification is local, not a provider or authority edit. |

## Product files and imports

`ProductImport = {id,revision,kind:"supplier_products"|"buyer_metadata",state:"processing"|"review"|"saved"|"failed",
operation:Operation|null,statusQuery:StatusQuery|null,expiresAt:Instant,rows:[{rowId,productId:Id|null,variantId:Id|null,
proposed:SupplierProductInput|VariantPatch|ProductPatch,issues:Issue[],dependencies:Dependency[]}],savedIds:Id[]}`.
Proposed row types are discriminated by kind and entity level; no upstream price/SKU/inventory write hides in buyer metadata.

| Operation | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `product.import` | `Transfer<{kind:"supplier_products"\|"buyer_metadata",locationId?:Id}>` or `{source:"shopify",connectionId,kind:"buyer_metadata"}` | Handoff or ProductImport | ProductEdit; StockWrite for supplier count rows. Stage/preview only; Shopify branch reads source metadata. |
| `product.import.show` | `{id,operationId?:Id}` | `ProductImport` | ProductEdit; includes proposed values under existing price access. |
| `product.import.apply` | `Guard & {reviewed:true}` | `Saved<ProductImport>` | Same plus StockWrite when counts; local atomic reviewed commit. Stale dependencies/expired preview fail. |
| `product.export` | `Export<ProductFilter>`, csv/xlsx/json | `ExportResult` | Products; redacts forbidden prices. |
| `product.template` | `{kind:"supplier_products"\|"buyer_metadata",fileFormat:"csv"\|"xlsx"}` | `Artifact` | Products; schema template, no mutation. |
| `product.label.show` | `{id:productId,variantId?:Id}` | `{productId,revision,setting:"standard"\|"uploaded"\|"none",labels:[{variantId,artifact:Artifact\|null,issues:Issue[]}]}` | Products. |
| `product.label.update` | `Guard & {setting:"standard"\|"uploaded"\|"none"}` | `Saved<Product>` | B ProductEdit; local label policy. |
| `product.label.upload` | `Transfer<{id:productId,variantId,expectedRevision}>` | Handoff or `{productId,variantId,revision,artifact:Artifact}` | B ProductEdit; authorized one-page PDF replacement. |
| `product.label.download` | `{id:productId,variantId?:Id}` | `Artifact` | Products; selected variation or sheets for included variants, max 1000. Missing labels produce declared coverage; none yields not_found. |
| `product.label.remove` | `Guard & {variantId}` | `{productId,variantId,revision,removed:true}` | B ProductEdit; removes uploaded barcode only. |
| `product.image.upload` | `Transfer<{id:productId,expectedRevision}>` | Handoff or `{productId,revision,image:Artifact}` | S ProductEdit; existing allowed image types/limits. |
| `product.image.remove` | `Guard & {imageId}` | `{productId,revision,imageId,removed:true}` | S ProductEdit; authorized catalog image only. |
