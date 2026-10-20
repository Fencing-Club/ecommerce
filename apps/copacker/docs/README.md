# Copacker

The buyer, supplier and forwarder portal in `apps/copacker`. The monorepo's shared conventions are in the
[engineering docs](../../../docs/README.md).

- [Product rules](domain.md)
- [API: routes, actions and document imports](api-contract.md)
- [Amazon inbound shipments: AWD orders, FBA plans, and future capacity preflight](amazon-inbound.md)
- [Packing: the carton and pallet tables, carton IDs and what Amazon gets](packing.md)
- [Amazon case packs: what they are, and why FBA cartons are individual units](amazon-case-packs.md)
- [Shipment document inventory](shipment-document-inventory.md)
- [Supplier packet templates, downloads and shipment snapshots](shipping-document-templates.md)
- [Amazon booking dialogs: AGL and FBA in Storybook](booking-dialogs.md)
- [Sales demand integration contract](sales-demand.md): Orders and Financial data sync cards
- [Overview page](overview.md)
- [Purchase order and shipment lists: views, waiting on, filters and export](logistics-lists.md)
- [Amazon Ads expense reporting](amazon-ads.md)
- [Amazon FBA returns ingestion](amazon-returns.md)
- [Amazon FBA reimbursement ingestion](amazon-reimbursements.md): daily-report reuse and refresh coverage
- [Detailed Amazon inventory movements](amazon-inventory-movements.md)
- [Amazon report request limits](amazon-report-limits.md): shared pacing, durable cooldowns and investigation evidence
- [Amazon storage and aged-inventory fees](amazon-storage-fees.md): acquisition, unavailable-month backoff and safe failure diagnostics
- [Amazon removal and disposal evidence](amazon-removals.md): date-range collection and monthly coverage
- [Amazon reconciliation evidence](amazon-reconciliation.md): continued search, reimbursement chains and fee comparisons
- [Stored payment and recovery reconciliation](payment-reconciliation.md): payment differences, missing-original coverage, financial candidates and receipt movements
- [Historical inventory cost inputs](historical-inventory-basis.md): unknown cost basis and historical product validation
- [Analytics HTTP contract](analytics-api.md)
- [Historical product mappings and Amazon allocations](amazon-cost-allocation.md)
- [Supplier workspace: products, catalogs and order changes](supplier-workspace.md)
- [App header: search and notifications](app-header.md)
- [Sign-in and getting started](auth.md)
- [Roles and page access](permissions.md)
- [Landing page: the signed-out home page](landing-page.md)
- [Run Copacker: setup, releases and infrastructure](operations.md)
- [Neon database operations, transfer usage, PR previews and provisioning performance](neon.md)
- [Background jobs and Cloudflare wake signals](background-jobs.md)
- [Cloudflare runtime, releases and private-storage migration](cloudflare.md)
- [Terraform ownership, reviewed applies and verified state backups](infrastructure.md)
- [Cloudflare cutover acceptance and recovery window](specs/platform-migration/acceptance.md)
- [Platform architecture before and after the Cloudflare cutover](specs/platform-migration/architecture.md)
- [Domains and provider configuration across environments](domains.md)
- [Local development domains with Buildkit and Portless](development.md)
- [End-to-end tests: the Playwright suite](e2e.md)
- [Shopify webhooks and Amazon notifications](notifications.md)
- [Styling](styling.md)
- [Storybook: stories and play tests](storybook.md)
- [Localization](localization.md)

Specs (planned work; the purchase order flow also maps how orders work today):

- [Novu notifications: implementation phases, event coverage, templates and settings](specs/novu-notifications/README.md)
- [Analytics: profitability reporting and analytics data backlog](specs/analytics/README.md)
- [TanStack Start and Cloudflare migration: tasks, milestones and cutover](specs/platform-migration/README.md)
- [CLI and MCP contract proposal](specs/cli/README.md)
- [App redesign: information architecture and design spec](specs/app-redesign/README.md)
- [Inventory sync](specs/inventory-sync/README.md)
- [Purchase order flow](specs/purchase-order-flow/README.md)

See [historical landed costs and FIFO](inventory-costing.md) for landed charges, depletion records and calculation resources.

See [sales-linked FIFO imports](sales-cost-imports.md) for importing stored Shopify and Amazon fulfillment evidence.

See [shipment-date evidence](shipment-date-evidence.md) for Shopify fulfillment timestamps and the Amazon FBA outbound-shipment report integration.

[Dated conversions and automatic depletion imports](automatic-depletion-imports.md) now provide opt-in processing after sales sync; live coverage and return-to-stock accounting remain pending.

- [Expanded analytics ingestion](analytics-ingestion.md): cost batches, merchant expenses, inbound receipts, Shopify financial events, Amazon evidence, receipt checkpoints and quota-aware report retry diagnostics.
