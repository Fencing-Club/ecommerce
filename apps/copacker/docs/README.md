# Copacker

The buyer, supplier and forwarder portal in `apps/copacker`. The monorepo's shared conventions are in the
[engineering docs](../../../docs/README.md).

- [Product rules](domain.md)
- [API: routes, actions and document imports](api-contract.md)
- [Amazon inbound shipments: AWD orders and FBA inbound plans](amazon-inbound.md)
- [Sales demand integration contract](sales-demand.md)
- [Overview page](overview.md)
- [Amazon Ads expense reporting](amazon-ads.md)
- [Supplier workspace: products, catalogs and order changes](supplier-workspace.md)
- [App header: search and notifications](app-header.md)
- [Sign-in and getting started](auth.md)
- [Roles and page access](permissions.md)
- [Landing page: the signed-out home page](landing-page.md)
- [Run Copacker: setup, releases and infrastructure](operations.md)
- [Neon database operations and PR previews](neon.md)
- [Background jobs and Cloudflare wake signals](background-jobs.md)
- [Cloudflare runtime, releases and private-storage migration](cloudflare.md)
- [Domains and provider configuration across environments](domains.md)
- [Local development domains with Buildkit and Portless](development.md)
- [End-to-end tests: the Playwright suite](e2e.md)
- [Shopify webhooks and Amazon notifications](notifications.md)
- [Styling](styling.md)
- [Storybook: stories and play tests](storybook.md)
- [Localization](localization.md)

Specs (planned work; the purchase order flow also maps how orders work today):

- [TanStack Start and Cloudflare migration: tasks, milestones and cutover](specs/platform-migration/README.md)
- [CLI and MCP contract proposal](specs/cli/README.md)
- [App redesign: information architecture and design spec](specs/app-redesign/README.md)
- [Inventory sync](specs/inventory-sync/README.md)
- [Purchase order flow](specs/purchase-order-flow/README.md)
