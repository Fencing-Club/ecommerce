# Route and endpoint inventory

Part of the [migration specification](README.md). This is the October 15, 2026 working-tree baseline from
`apps/copacker/src/app`: **40 pages, seven layouts and 62 HTTP route files**. Refresh it at M0 and reconcile any routes
added during implementation. A route row covers all of its roles and states, not just its successful render.

Paths below use `:id` notation for readability. Preserve actual URL spelling and query semantics while converting Next
file parameters to Router parameters. The [API contract](../../api-contract.md), [permissions](../../permissions.md),
[auth contract](../../auth.md) and each handler remain the behavioral authority; the tables are an implementation map.

## Page batches

| Batch | Page paths | Count | Required parity |
| --- | --- | --- | --- |
| P1: public and system | `/`, `/contact`, `/privacy`, `/terms`, `/unsubscribe`, `/maintenance`, `/setup` | 7 | Marketing SSR/SEO, localized forms, unsubscribe behavior, maintenance/status and setup restrictions |
| P2: identity and onboarding | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite`, `/onboarding`, `/workspaces/new` | 8 | Custom auth, invite/verification expiry, safe redirects, cookies, workspace creation and setup transitions |
| P3: workspace and partners | `/overview`, `/settings`, `/partners`, `/customers`, `/customers/:id`, `/suppliers`, `/forwarders` | 7 | Role gates, language/settings, workspace switch, partner sheets and existing redirect-only pages |
| P4: catalogs and products | `/catalogs`, `/catalogs/new`, `/catalogs/:id`, `/products`, `/products/new`, `/products/:id` | 6 | Buyer/supplier views, restricted prices, forms, import/export and nuqs product-import state |
| P5: inventory and sales | `/inventory`, `/restock`, `/sales` | 3 | Filtering, calculations, location/variant edits, restock actions and sync freshness |
| P6: orders and shipments | `/orders`, `/orders/new`, `/orders/import`, `/orders/import/:id`, `/orders/:id`, `/orders/:id/edit`, `/orders/:id/revise`, `/shipments`, `/shipments/:id` | 9 | All roles/revisions, document release, imports, proposal actions, labels, packets and job progress |

The seven layouts are the root, `(auth)`, `(portal)`, `maintenance`, `onboarding`, `setup` and `workspaces` layouts.
Preserve their provider, authorization and rendering responsibilities with root/pathless/nested Start routes. The
first proof route is a small slice of P3 plus P2 authentication, not a reason to delay proving auth until after all P1.

## Authentication HTTP routes

| Path | Methods |
| --- | --- |
| `/login/:provider` | GET |
| `/callback` | GET |
| `/logout` | POST |

These three handlers are included in the count of 62. Maintain registered WorkOS/provider callbacks and callback
validation. Redirect responses and multiple Set-Cookie headers must survive the Workers response path.

## Application HTTP routes

The following 59 handlers keep their HTTP contracts. Match status, content type, structured error shape, redirects,
download headers, input limits and origin/authentication rules. Preserve `/api/action`'s individual action validation
and authorization; moving one file does not count as testing every dispatched action.

| Path | Methods |
| --- | --- |
| `/api/action` | POST |
| `/api/catalog` | GET |
| `/api/catalogs` | POST |
| `/api/catalogs/:id` | DELETE |
| `/api/catalogs/:id/export` | GET |
| `/api/connections/amazon-ads` | GET, POST |
| `/api/connections/:provider` | GET |
| `/api/contact` | POST |
| `/api/customers/:id/catalog` | POST |
| `/api/documents` | POST |
| `/api/documents/:id` | GET |
| `/api/health` | GET |
| `/api/imports` | GET, POST |
| `/api/imports/:id` | GET, DELETE, PATCH, POST |
| `/api/imports/:id/catalog` | GET |
| `/api/imports/:id/save` | POST |
| `/api/imports/:id/source` | GET |
| `/api/inventory` | GET |
| `/api/inventory/barcodes` | POST, GET, DELETE |
| `/api/inventory/demand` | POST |
| `/api/inventory/labels` | POST |
| `/api/inventory/locations` | GET, PATCH |
| `/api/inventory/product-defaults` | PATCH |
| `/api/inventory/product-labels` | GET, PATCH |
| `/api/inventory/products` | GET |
| `/api/inventory/refresh` | POST |
| `/api/inventory/variant-fields` | PATCH |
| `/api/mailing-list` | POST |
| `/api/mailing-list/unsubscribe` | POST |
| `/api/maintenance` | GET |
| `/api/orders/summary` | GET |
| `/api/orders/:id/labels` | GET |
| `/api/orders/:id/labels/warning` | GET |
| `/api/orders/:id/labels/:itemId` | GET |
| `/api/orders/:id/po` | GET |
| `/api/orders/:id/proposal` | POST |
| `/api/orders/:id/workflow` | GET |
| `/api/product-images` | POST, GET |
| `/api/products/without-supplier` | GET |
| `/api/proposals/:id` | POST |
| `/api/restock/assign-supplier` | POST |
| `/api/restock/channels` | GET |
| `/api/restock/plan` | POST |
| `/api/restock/suppliers` | GET |
| `/api/sales` | GET |
| `/api/sales/orders` | GET |
| `/api/sales/sync` | POST |
| `/api/search` | GET |
| `/api/shipments/:id/packet` | GET |
| `/api/supplier-catalog/export` | GET |
| `/api/supplier-catalog/import` | POST |
| `/api/supplier-catalog/match` | POST |
| `/api/supplier-catalog/products` | POST |
| `/api/supplier-catalog/status` | POST |
| `/api/supplier-catalog/stock` | POST |
| `/api/supplier-catalog/template` | GET |
| `/api/supplier-catalog/tracking` | POST |
| `/api/webhooks/ebay` | GET, POST |
| `/api/workspace` | GET |

Keep static routes such as `/api/connections/amazon-ads` and `/orders/import` distinct from dynamic siblings. Verify
unsupported methods return the intended status rather than falling through to an HTML page. Preserve query-based
provider callbacks under `/api/connections/:provider` and Amazon Ads' dedicated path; do not assume `/callback` is the
only OAuth surface.

## Other routing and document behavior

- Port root and portal error/not-found boundaries and the portal forbidden screen with their actual status codes.
- Move `robots.ts`, `sitemap.ts`, `favicon.ico`, `icon.svg` and `apple-icon.png` to equivalent served outputs. Preserve
  canonical/social metadata, site-origin handling, public assets and font URLs. Review Next-generated output URLs when
  establishing the baseline; source filenames alone do not establish the public contract.
- Replace `src/proxy.ts`, including authentication, maintenance rewrite and resume-cookie behavior. Revisit path
  exclusions for the new asset/server-function routes; an old `_next` exclusion is not sufficient.
- Preserve query state such as `next`, provider state, filters, pagination, `add` and `import`; do not globally normalize
  unknown keys in a way that breaks callbacks or nuqs. Validate keys where they affect application behavior.
- Verify redirects, form POST responses, binary downloads, HEAD/OPTIONS behavior where used, browser history and
  direct deep links on the deployed runtime. Preserve relevant cache/security headers and do not expose private route
  data through SSR HTML, loader payloads or error serialization.

At implementation time, link the PR and relevant test evidence for each batch from the delivery record. Do not add a
test that only checks this Markdown inventory; runtime route and authorization tests are the acceptance evidence.
