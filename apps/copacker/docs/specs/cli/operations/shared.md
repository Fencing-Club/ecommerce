# Shared operation types and policies

These definitions apply to every [operation schema](README.md). Limits below are proposed public defaults unless an
existing referenced domain schema imposes a smaller limit. Credential secrets have their own protected delivery path.

## Scalar and collection types

| Type | Definition |
| --- | --- |
| `Id` | Copacker UUID; provider IDs occur only inside a typed `SourceRef`. |
| `Revision` | Nonnegative safe integer; zero means an explicitly uninitialized setting/link. Persisted aggregates start at one. |
| `Instant`, `Date` | UTC ISO 8601 timestamp; ISO calendar date respectively. |
| `Text<N>` | Trimmed string of at most N characters; identifiers/titles require at least one. Multiline is allowed only for notes/descriptions. |
| `Currency` | Uppercase ISO currency code supported by the selected operation/source; PO and supplier pricing currently allow USD/CNY/EUR/GBP/CAD/AUD. |
| `Money` | `{amountMinor: safe integer, currency: Currency}`; price inputs are nonnegative, costs/PO limits follow their domain schemas. |
| `Quantity` | `{value: number \| null, unit: "piece" \| "sellable_unit" \| "case", piecesPerUnit: positive integer \| null}`; integer for writes, decimal source demand may remain fractional. |
| `SourceRef` | `{provider: "shopify" \| "amazon" \| "ebay" \| "amazon_ads", connectionId: Id, accountId: string, kind: string, externalId: string, marketplaceId?: string}`; each operation constrains kind/provider. |
| `Guard` | `{id: Id, expectedRevision: Revision}`. |
| `PageInput` | `{limit?: integer 1..200 = 50, cursor?: string}`. Filters/sort must match the cursor's original selection. |
| `Page<T>` | `{items: T[], page: {nextCursor: string \| null, hasMore: boolean, consistency: "live" \| "snapshot", snapshotId?: Id}}`. |
| `ReadSelector` | `{id: Id}` or `{reference: Text<255>, connectionId?: Id}`; exactly one branch, account disambiguation required where stated. |
| `Period` | `{from: Date, to: Date, timeZone?: string}`; inclusive from, exclusive to. Invalid/empty ranges fail. |
| `Issue` | `{code: string, path: (string \| integer)[], message: string, rowId?: string, entityId?: Id}`; codes come from the operation's published enum. |
| `Check` | `{valid: boolean, issues: Issue[], warnings: Issue[], effects: Effect[], dependencies: Dependency[]}`. |
| `Dependency` | `{kind: "product" \| "variant" \| "stock" \| "location" \| "link" \| "source" \| "supplier" \| "catalog" \| "relationship" \| "po" \| "shipment" \| "snapshot", id: Id, revision?: Revision, snapshotId?: Id}`. |
| `Effect` | `{kind: "local_write" \| "provider_write" \| "reservation" \| "email" \| "document" \| "credential", entityId?: Id, targetId?: Id, description: string}`. |
| `Saved<T>` | `{resource: T, operation?: Operation, statusQuery?: StatusQuery}`; the latter two appear together for asynchronous work. |
| `Removed` | `{id: Id, removed: true, previousRevision: Revision}`. Removal can mean domain archival where specified. |

Unspecified list sort is the table's default with ID as final tie-breaker; allowed sorts are explicit, not arbitrary
database columns. Missing protected fields are omitted with `meta.redactedFields`; unknown permitted fields are null.

## Execution and transfers

`Operation = {id: Id, name: string, status: queued | running | succeeded | partially_succeeded | failed | needs_attention |
cancelled, stage: string, startedAt: Instant | null, completedAt: Instant | null, error: Failure | null,
recovery: Recovery | null}`. `StatusQuery` is a discriminated union of the named entity status-read inputs in these pages,
not an arbitrary caller-supplied operation string. Only returned selectors are used by `--wait`.
`Recovery` names a documented operation and a complete valid input for rereading, previewing or reconciling; it is a
suggested next step, never authorization to run it automatically. `Failure = {code:string,message:string,retryable:boolean,
issues:Issue[],recovery:Recovery|null}`. The top-level `Error` adds the code-specific `details` below. Embedded failures
do not embed another full WriteResult/BatchResult; this prevents recursive partial-write envelopes.

`Artifact = {id: Id, filename: string, mediaType: string, size: integer | null, sha256: string | null,
revision: Revision | null, sourceIds: Id[], download: {url: string, authentication: "required"}, expiresAt: Instant | null}`.
The URL is server-issued and access-checked; possession is not authorization. No bucket keys appear.

`Export<S> = {action:"generate", selection:S, fileFormat: declared format}` or `{action:"read", exportId:Id}`.
`ExportResult = {exportId:Id, operation:Operation, statusQuery:StatusQuery, artifactStatus:"pending" | "ready" | "expired" |
"failed", artifact:Artifact | null, consistency:"live" | "snapshot", snapshotId:Id | null, expiresAt:Instant | null}`.
Run/input retention and byte expiry follow [the export contract](../contract.md#pagination-and-exports).

`Transfer<D>` uses the [direct/prepare/complete protocol](../workflows.md#entity-transfers). Direct and prepare bind
typed domain fields D, `intentId`, and `{filename, mediaType, size, sha256}`; direct additionally transfers bytes.
Complete contains only `{phase:"complete", intentId, handoffId, sha256}`. Prepare returns
`{intentId, handoffId, expiresAt, upload:{url,method:"PUT",authentication:"required"}}`; complete/direct return the entity
result. A handoff cannot substitute a different D. Upload limits are validated against actual bytes.

## Access profiles

Every policy also requires live membership, resource relationship and credential scopes. Scope alone grants nothing.
`B/S/F` denote buyer/supplier/forwarder workspaces; `V/E` denote existing page View/Edit. `P` requires price access and
`prices:read`. Owner/admin status satisfies page access but never overrides workspace or relationship restrictions.

| Profile | Required application permission and credential scope |
| --- | --- |
| `Account` | Signed-in principal; account reads reveal that principal only. |
| `Admin(scope)` | Workspace owner/admin plus named scope; credential-management mutations additionally require an interactive user session. |
| `Orders` | B sales V + `orders:read`. |
| `PORead`, `POWrite` | Accessible B/S/F purchase-orders page V + `purchase-orders:read`; E + P + `purchase-orders:write` for writes, subject to actor constraints in each row. |
| `ShipRead`, `ShipWrite` | B/S shipments V/E or F purchase-orders V/E on an assigned leg + `shipments:read/write`; P additionally for approval/freight/invoice writes. |
| `Products`, `ProductEdit` | B/S products V/E + `products:read/write`; supplier edits that set prices additionally require P. |
| `ChannelEdit` | B products E + `products:write` + `products:write-channel`; price/cost edits additionally P and provider grants. |
| `StockRead`, `StockWrite` | B products V/E or S inventory V/E + `inventory:read/write`; external writes additionally `products:write-channel` and provider grants. |
| `CatalogRead`, `CatalogWrite` | S catalogs V/E + P + `catalogs:read/write`. |
| `PartnersRead`, `PartnersWrite` | B partners V/E or S customers V/E + `partners:read/write`; allowable verbs/types follow relationship ownership. |
| `Restock` | B restock V + `reports:read`; costs require P but unpriced quantities remain usable. |
| `Demand` | B sales V + `reports:read`; demand quantities do not require prices. |
| `ExpenseRead` | B overview V + P + `expenses:read` for platform/Ads/recurring records, or B purchase-orders V + P for landed rows of accessible POs. |

New buyer stock/channel writes use the named page-edit and scope intersection above; these permissions do not exist as
public credentials today. Schema publication must include the explicit policy, not just these shorthand labels.

## Errors

All operations may return `invalid_input` with `issues`; `unauthenticated`; `permission_denied`/`insufficient_scope`;
`not_found` without existence leaks; `rate_limited` with `retryAfterSeconds`; or sanitized `internal_error`. Reads can
return `source_unavailable`/partial source metadata. Mutations additionally use:

| Code | Typed details and recovery |
| --- | --- |
| `revision_conflict` | `{entityId, expectedRevision, currentRevision, dependencyKind?}`; reread/review, never silently replace the guard. |
| `invalid_state` | `{entityId, state, allowedActions:string[]}`; use the owning entity read. |
| `validation_failed` | `{issues:Issue[]}`; no effects from preflight rejection. |
| `idempotency_conflict` | `{operation, key}`; changed input needs a new intent, not a replay. |
| `stale_plan` | `{planId, changedDependencies:Dependency[]}`; create a new report/plan. |
| `preview_expired`, `preview_consumed` | `{previewId, expiresAt, operationId?:Id}`; receipt-first recovery or a new preview. |
| `route_unavailable` | `{issues:RouteIssue[]}` from [destination discovery](../destinations.md); zero effects on preflight failure. |
| `partial_write` | The complete typed `WriteResult`/`BatchResult` in `details.result`; includes confirmed effects and per-target failures. |
| `outcome_unknown` | `{operationId, targetId, recovery:StatusQuery}`; reconciliation before replay. |
| `superseded` | `{operationId, supersedingOperationId}`; never reapply the old desired state. |

Additional domain codes have their relevant entity IDs and `issues` where applicable. HTTP/CLI status mapping remains
in [contract.md](../contract.md#results-and-errors); `route_unavailable` and identity/state conflicts use 409/exit 5.
