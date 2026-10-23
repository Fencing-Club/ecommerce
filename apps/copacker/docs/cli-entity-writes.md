# CLI entity writes

These handlers use the existing supplier catalog, supplier product, product metadata, partner and import services.
They are advertised only when the current workspace and page permissions permit them. Mutation receipts and local
business changes commit together; replaying the same execution key returns the saved result after rechecking access.

## Commands

| Command | Supported behavior |
| --- | --- |
| `catalog create` / `catalog update` | Save catalog settings, included variants, pricing overrides and customer assignments; archive through `status`. |
| `partners catalog assign` / `partners catalog remove` | Assign or clear a guarded customer catalog assignment. |
| `partners create` / `partners update` | Buyer-owned supplier and forwarder names, plus supplier lead time. Creation does not send an invitation. |
| `product settings show` | Read editable supplier product fields or buyer product defaults. |
| `product create` / `product update` | Supplier product creation/full saves; buyer-owned product defaults. Supplier edits preserve current stock counts. |
| `product variant update` | Copacker-owned supplier SKU and ASIN metadata for a connected Shopify variant. |
| `product supplier assign` | Assign or clear a buyer product's supplier, preserving other settings. Requires product-edit access and the current settings revision. |
| `inventory update` | Supplier on-hand pieces at an explicit supplier location, individually or as one atomic batch; `--dry-run` checks without changing counts. |
| `product import`, `product import show`, `product import apply` | Upload CSV/XLSX, inspect the retained preview, then explicitly apply it. |
| `inventory import`, `inventory import show`, `inventory import apply` | The same workflow for revision-guarded inventory CSVs. |
| `product export`, `inventory export`, `product template` | Private downloadable files owned by these entities. |

Use `schema show <operation>` for the exact deployed input and output. Complex saves use `--input` JSON. For a supplier
product, `product settings show <id> --json` returns the fields accepted by `product update`; use the envelope's `data`
as input. Buyer settings also carry `kind`, `id` and revision-guarded `fields`.

Supplier assignment takes `{id, supplierId, expectedRevision, mode: "direct"}`. Use the scoped product ID and revision
from `product settings show`; `supplierId: null` clears an assignment. The supplier must be a current relationship in
this buyer workspace. This single-product command has no provider effect and does not create a purchase order.

Catalog updates require `expectedRevision`. Every affected customer (selected or previously assigned) must have an
`expectedAssignments` entry containing its current `catalogId`, including null. Standalone assignment uses
`expectedCatalogId`. Assignment changes advance affected catalog revisions, preventing a stale full save from undoing
a newer assignment. Partner edits compare the supplied current name/lead time before saving.

Supplier product saves require the group revision and each existing variant's revision. Supplier SKU renames are
rejected because existing stock commitments identify supplier variants by SKU. Buyer metadata uses scoped read IDs
that pin the connection and account. Stock targets continue to use the existing `variant stock-targets` and
`location group` commands from the configurable location/group implementation; this change adds no fixed FBA/AWD targets.

## Inventory and transfers

Supplier locations have IDs `supplier:<workspace UUID>`. Read `inventory list` to obtain variant IDs, locations and
revisions. Count updates accept `variantId`, `locationId`, `quantity`, `expectedRevision` and `quantityState: "on_hand"`.
Batches use `rows`; one missing or stale variant rejects the entire batch. Dry-run revisions describe the proposed save,
not a persisted change or an immutable apply token. The browser inventory editor uses the same guarded count service.

Inventory CSVs have exactly `variantId,locationId,quantity,expectedRevision`, matching the export. Product imports use
the web app's parser and revision-hash validation. A product file containing on-hand values additionally requires
inventory-edit permission and `--location supplier:<workspace UUID>`.

```sh
copacker inventory export --output inventory.csv
copacker inventory import inventory.csv
copacker inventory import show <preview-id>
copacker inventory import apply <preview-id> --reviewed
copacker product export --file-format xlsx --output products.xlsx
```

Uploads are limited to 5 MiB and checked against their prepared size, media type and SHA-256 digest. Transfers require
CLI bearer authentication, the original user and workspace, and current permissions. Browser cookies cannot authorize
them. Uploads and downloads expire after 30 minutes. This is an access deadline, not an object-storage deletion promise;
stored bytes currently remain private under the application's storage retention. Repeating an apply with another key
cannot apply the same upload twice. A new upload is a new import and is checked against current revisions.

## Boundaries

Provider-owned fields use the separate [controlled write contract](cli-provider-writes.md), with listing identity,
retained previews and per-target execution outcomes. Local metadata success never stands in for provider acceptance.
Customer creation/invitations, catalog deletion, supplier product image uploads and retained supplier-count dry-run
application remain unimplemented. Supplier count previews return rows for a guarded direct save, not a preview ID.
Unsupported shapes fail validation and unimplemented commands are absent from server discovery.
Purchase-order and shipment operations remain deferred. No production data or provider writes are used by the tests.
