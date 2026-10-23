# CLI implementation status

Updated 2026-10-22. The original command inventory is the target contract; a command in client help is not proof of a deployed server handler. Use `schema list` and `schema show` for the current workspace's authorized capabilities.

## Released

Production release e20497d8 includes interactive browser/PKCE authentication, protected local credentials, refresh/logout, workspace selection, schema discovery, durable local mutation receipts and guarded resource reads/writes.

Implemented areas:
- Products, inventory, customer orders, PO and shipment reads, partners and supplier catalogs.
- Restock reports using shared planning, configurable per-variant targets, location groups and connector location selection.
- Supplier product/catalog saves, buyer metadata and supplier assignment, supplier/forwarder partner creation and updates, customer catalog assignments and supplier stock counts.
- Supplier product/inventory import previews and reviewed apply, exports and templates, with authenticated entity transfers.

Production acceptance exercised authenticated reads, unchanged-value guarded product/partner/catalog saves, supplier stock preview/save/replay/conflicts, inventory CSV upload/preview/apply and exports. Supplier assignment and private non-redirecting stock API authentication were also verified. Business quantities/settings/assignments were unchanged; guarded revisions advanced. Test entities were not created. Validation credentials were revoked.

## Current implementation slice

Connection `sync`, `sync show` and operational `status` reuse existing workers. Exact jobs are retained per run, grouped permissions are checked, and worker wakes follow the outer commit. See [connection sync](../../cli-connections.md). These changes require the current PR and its forward migration to pass CI and deployment before they are production capabilities.

## Remaining

The following listing slice adds Amazon US discovery, guarded variant links and provider adapter primitives; see
[CLI listings](../../cli-listings.md). It requires its own forward migration and deployment. Provider writes remain disabled.

- Write destinations, retained per-target execution and controlled Shopify SKU/cost/price/inventory and Amazon price/FBM inventory writes. No Amazon SKU rename handler is planned.
- Connection authorization lifecycle (connect/reconnect/disconnect).
- Expenses, demand reporting, additional read/export coverage, buyer metadata imports/exports, labels/images, catalog removal/export, partner invitations/removal and addresses.
- General bulk execution and immutable provider-write previews.
- Automation credential lifecycle, hosted MCP, publishable package distribution and native Linux/macOS credential-store acceptance. Packages remain private.
- PO and shipment lifecycle commands, coordinated with their active app workflows.

PR #185 provides internal restock draft preparation only. Durable reviewed plans, dependency validation and atomic draft creation are still required before advertising `restock plan` operations. It does not enable the end-to-end workflow.

## Recovery history

PR #117 preserved the original CLI/client/contract packages and specification, and fixed client transfer/output/recovery issues. PR #139 aligned tests and package verification. Subsequent releases added real server authentication and handlers. Older statements that no hosted API exists or no production authentication was tested are obsolete; provider writes remain unfinished.
