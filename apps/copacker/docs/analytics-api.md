# Analytics HTTP contract

The locally implemented Amazon analytics API uses `/api/analytics/amazon`. These unreleased routes replace the former
`/api/sales/reconciliation`, `/api/sales/allocations` and `/api/sales/product-mappings` paths without aliases.
The existing `/api/sales` sync-status endpoint remains unchanged. Shared ingestion resources also expose Shopify evidence; see below.

| Method | Resource | Success |
| --- | --- | --- |
| GET | `/api/analytics/amazon/reconciliation` | 200 evidence and candidate matches |
| GET | `/api/analytics/amazon/allocations` | 200 derived posting allocations |
| GET | `/api/analytics/amazon/product-mappings` | 200 bounded mapping history |
| POST | `/api/analytics/amazon/product-mappings` | 201 `{mapping}`, Location header; 200 on replay |
| GET | `/api/analytics/amazon/product-mappings/{id}` | 200 `{mapping}`, including retirement metadata |
| DELETE | `/api/analytics/amazon/product-mappings/{id}` | 204, including an already-retired mapping |

## Authentication and errors

The server chooses the workspace from the authenticated session and checks live membership. Reads require a buyer
workspace with Sales and Prices access; writes require Products edit and Prices access plus a matching app Origin.
Session failures return JSON 401 (sign-in needed) or 403 (no authorized workspace), without page redirects.
The 401 response advertises the app-specific `Session` authentication scheme; authentication remains the existing WorkOS cookie session.
All handled responses are private/no-store. Writes accept JSON with `Content-Type: application/json`; DELETE has no body.

Failures use `application/problem+json` with `type: "about:blank"`, standard HTTP `title`, numeric `status`, safe `detail`,
stable `code`, and request-path `instance`. Clients branch on code/status, not prose. Malformed JSON, dates, UUIDs or
missing request keys return 400; denied access returns 403; missing or foreign mapping IDs return 404; stale state,
overlap or reused keys return 409; unsupported content type returns 415; an unavailable target variant returns 422.
Unexpected failures return a generic 500 without database details. This follows [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html).

## Pagination consistency

Collections use zero-based `page` (default 0, maximum 10000), a fixed maximum of 100 rows, and `hasMore`.
The first page returns `snapshot`. Every later page must include that token and the original filters. Missing tokens
return 400 `snapshot_required`; changed data or filters return 409 `snapshot_changed`. Restart at page 0 without a token.
Do not combine pages from different snapshots. Mapping history includes retired rows.

The token fingerprints relevant local row versions inside the same repeatable-read transaction used to read the page.
It binds the workspace, endpoint and filters. It is a change detector, not a retained historical snapshot or authorization
credential. It conservatively covers all analytics source rows in the workspace, so unrelated sync activity can also
require a restart. Fingerprinting scans row-version metadata; large-account performance needs measurement before rollout.
A future persisted dataset revision can reduce that cost without weakening the contract. No long-running database
transaction is retained between HTTP requests.

Reconciliation requires `source`, `from`, `to`; allocations requires `from`, `to`. Dates are UTC calendar dates in an
increasing, start-inclusive/end-exclusive window of at most 31 days. Disconnected accounts return empty collections.

## Mapping writes and retries

POST requires an `Idempotency-Key` UUID. Generate one for each intended write and reuse it with the same body when
retrying. The UUID becomes the mapping's resource ID. A retry by the same actor in the same workspace/account returns
200 with that mapping's current audit representation, even if subsequently retired; it never reactivates it. Reusing a
key with different content returns 409 `idempotency_key_reused`. Keys remain reserved for the life of the audit record.
The creation response includes a relative Location pointing to the individual mapping GET.

Corrections POST a complete replacement with `supersedes` naming the active revision being replaced. The service locks
the seller connection and atomically retires that revision and creates the replacement. A competing correction returns
409 `mapping_changed`; clients must refresh rather than silently resubmit against another revision. No in-place update
or PATCH is offered, so an ETag/If-Match update contract is unnecessary for these immutable identity revisions.
DELETE retires the named revision only; repeated retirement returns 204 and never changes the original retirement audit.
GET continues to expose its audit representation. There is no hard-delete API.

See [dated mappings and allocation rules](amazon-cost-allocation.md) and [reconciliation evidence](amazon-reconciliation.md).
Deployment, real-account validation and customer-facing screens remain pending.

## Shared inventory cost resources

[Historical inventory cost inputs](historical-inventory-basis.md) adds `/api/analytics/purchase-costs`,
`/api/analytics/opening-balances` and `/api/analytics/receipts`, independent of a connected marketplace. Their collection
and individual-resource routes share these authentication, error, retry and pagination conventions.

See [historical landed costs and FIFO](inventory-costing.md) for landed charges, depletion records and calculation resources.

See [sales-linked FIFO imports](sales-cost-imports.md) for importing stored Shopify and Amazon fulfillment evidence.

See [shipment-date evidence](shipment-date-evidence.md) for Shopify fulfillment timestamps and the Amazon FBA outbound-shipment report integration.

[Dated conversions and automatic depletion imports](automatic-depletion-imports.md) now provide opt-in processing after sales sync; live coverage and return-to-stock accounting remain pending.

## Shared ingestion resources

See [expanded analytics ingestion](analytics-ingestion.md) for the cost batch and evidence contracts.

| Method | Resource | Success |
| --- | --- | --- |
| POST | `/api/analytics/cost-import-previews` | 200 normalized, validated rows; nothing persisted |
| POST | `/api/analytics/cost-imports` | 201 audited import with Location; 200 on replay |
| GET | `/api/analytics/cost-imports/{id}` | 200 audited import |
| GET | `/api/analytics/operating-costs` | 200 active expenses, snapshot pagination |
| GET | `/api/analytics/evidence` | 200 source evidence, snapshot pagination |
| GET | `/api/analytics/ingestion-status` | 200 observed feed states and connected accounts |

Shopify order evidence now includes derived payment/refund diagnostics and separate saved-balance comparisons.
Amazon reconciliation and allocations expose reimbursement-family and released-posting accounting respectively.
See [stored payment and recovery reconciliation](payment-reconciliation.md) for counting rules and incomplete evidence.

Preview POST requires the same access and Origin as committing costs, but no Idempotency-Key because it persists nothing. A successful preview does not reserve inputs or bypass commit-time validation.
