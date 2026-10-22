# Shared operation contract

Status: **proposed**. The operation registry is the single source of input/output schemas, permissions and behavior for
the CLI, HTTP API and MCP server. The [command inventory](commands.md) defines its intended coverage.
The [operation schemas](operations/README.md) define the concrete records and policies for every command. Their shared
types are reused by [bulk writes](bulk.md), [credentials](credentials.md) and [destination discovery](destinations.md).

## Operation identity and transport

Use named operations such as `report.restock`, `order.show`, `po.create`, `shipment.packing.save` and
`order.list`. Each registry entry declares its input/output schemas, applicable workspace kinds, required access,
price policy, side effects, revision requirements, idempotency policy and asynchronous status behavior.

Proposed JSON transport:

```http
POST /api/operations/order.show
Authorization: Bearer <copacker-access-token>
Content-Type: application/json

{
  "workspaceId": "<workspace UUID>",
  "input": { "reference": "1043", "connectionId": "<connection UUID>" }
}
```

Both queries and mutations use this typed operation transport. A query remains side-effect-free at the business level
even though its HTTP method is POST. Do not map HTTP method to MCP mutability. Binary transfers have dedicated routes.
Export the registry as JSON Schema and an OpenAPI document; include each operation explicitly rather than an untyped
`data: any` request.

`schema list` reports the deployed contract version and supported operations. Keep one unversioned route family and
one canonical schema implementation. Before public release, change all consumers together. After publication, require
an explicit migration decision for breaking contracts; additive optional fields must not break older clients. The
client reports `unsupported_contract` before a mutation when its required schema/capabilities are unavailable.

The web app migrates to these same operations as each workflow is exposed. Remove the replaced browser action/route in
that change; keep one implementation, with no permanent CLI-specific business path. Browser requests use the existing
session and same-origin checks. Bearer requests use token authentication, not a forged Origin or copied browser cookie.
Reject ambiguous mixed credentials. Explicit workspace IDs select context but never grant access.

Each registry entry declares `context: account | workspace`. `account.show` and `workspace.list` use account context
and omit `workspaceId`; all business operations require workspace context. Global account reads expose only the caller's
account and accessible-workspace summaries. Login/logout are client authentication flows, not workspace operations.

The registry records the CLI command path explicitly. Normally its words become a dotted operation ID, retaining
hyphens (`restock plan create-pos` becomes `restock.plan.create-pos`). MCP names replace dots and hyphens with
underscores; reject name collisions when building the registry. Uploads, imports, labels and exports remain entity
operations: `po.import`, `product.import`, `shipment.invoice.upload`, `shipment.label.download`. Local byte transfer and
polling adapt those operations; they do not create top-level file, document, import, job or retry command groups.

`partners.list` accepts optional `type: supplier | forwarder | customer`; initial `partners.create` requires supplier or
forwarder type in its discriminated input. Existing customer relationships support lookup/catalog assignment, not arbitrary
customer creation. Reads and mutations of an existing relationship
use its canonical ID. A supplied type must match; changing it is not a partner conversion operation. Shared names do not
imply that every relationship supports every verb. See [resource ownership](resources.md).

## Authentication and authorization

Interactive CLI login uses authorization code with PKCE and a loopback callback. Headless runs use a scoped, expiring,
revocable Copacker automation credential through `COPACKER_TOKEN` or a protected credential store. Tokens never appear
in command arguments, JSON output or diagnostic logs. Bind automation credentials to one workspace and an identifiable
principal; recheck that principal's current membership on every call. Short-lived access tokens and refresh-token
rotation support interactive sessions. Signing out revokes the grant when supported and clears the local credential.
The [credential lifecycle](credentials.md) defines interactive-admin issuance, protected delivery, a maximum 90-day
automation lifetime, rotation overlap and revocation. Login/logout remain top-level CLI commands. Secrets do not appear
in mutation receipts; credential control-plane operations are excluded from MCP business-tool discovery.

Authorization is the intersection of credential scope, current membership, workspace kind, page access, price access
and resource relationship. A supplier can see only linked buyer POs; a forwarder sees only the POs and shipment
legs assigned to it. Derived reports retain their existing page-access semantics rather than requiring every raw-data
permission. Price fields are omitted when forbidden, with `meta.redactedFields`; null means unknown, not hidden.
Preserve the existing forwarder commercial-invoice exception. File metadata, errors, exports, operation state and MCP resources
obey the same checks as their parent records.

Initial scope families: `reports:read`, `orders:read`, `purchase-orders:read/write`, `products:read/write`,
`products:write-channel`, `inventory:read/write`, `catalogs:read/write`, `locations:read/write`,
`shipments:read/write`, `partners:read/write`,
`connections:read/manage`, `sync:run`, `expenses:read/write`, plus `prices:read`. Here `read/write` means two scopes.
Channel-write scope is additionally constrained by granted provider scopes, product fields and location capabilities.
Scopes never elevate application permissions. Attachments, imports, exports and operation status inherit entity access checks;
there is no broad file scope that grants access to unrelated records. PO imports require PO-edit permission.

Expose effective capabilities in `workspace.show` and resource-specific `allowedActions` in detail reads. These describe
the current state; the server checks again during each mutation. A revoked membership immediately stops access,
including after slow document generation/storage reads and before returning bytes, as current private routes do.

## CLI conventions

| Option | Contract |
| --- | --- |
| `--workspace <id>` | Explicit workspace; wins over `COPACKER_WORKSPACE`, then the interactive profile default. Noninteractive workspace operations require an explicit flag or environment value. |
| `--profile <name>` | Local environment/login configuration; credentials remain separate from readable settings. |
| `--json` | One JSON success/error object on stdout, including metadata; no banners, progress or ANSI escapes. |
| `--format table\|json\|csv` | Stdout rendering only. Table is the human default; CSV is available only for documented tabular reads. `--json` means `--format json`; conflicting stdout options fail. |
| `--file-format <format>` | Artifact encoding, independent of stdout: an entity-declared `csv`, `json`, `xlsx` or `pdf`. A PDF/Excel export can therefore return a JSON receipt with `--json`. |
| `--input <path>` or `--input -` | Structured JSON from a file or stdin; reject unknown fields. Simple flags and JSON cannot supply the same field. |
| `--limit`, `--cursor`, `--all` | One page by default; explicit traversal of all pages. `--all --json` returns one envelope and fails on incomplete traversal. |
| `--output <path>` | Save a report or binary artifact. Use a temporary sibling file and atomic rename; never overwrite without `--overwrite`. |
| `--export-id <id>` | Read/poll a retained export run through its original entity operation. Cannot be combined with generation filters or a new artifact format. |
| `--batch-id <id>` | Read/poll a retained bulk run through its original entity mutation's side-effect-free read branch. Cannot accompany new rows, values or a preview ID. |
| `--revision <n>` | Expected revision of the resource being changed; no silent fetch-and-overwrite. |
| `--dry-run`, `--preview <id>` | Supported source/channel writes can preview resolved targets and values; apply that immutable preview only if its dependencies still match. |
| `--idempotency-key <key>` | Optional caller-supplied execution key. Otherwise the CLI generates and retains one; every transport replay uses the original key. Automation should supply a stable key for creates. |
| `--wait`, `--timeout <seconds>` | Poll the entity's operation state until completion or the client deadline. A client timeout does not cancel server work. |
| `--yes` | Suppress interactive confirmation of effects already specified by the command; does not bypass permissions, revisions, validation or domain approvals. |

Noninteractive commands never prompt. Commands that send, release, cancel, delete or revoke require explicit `--yes`
there; draft saves and reads do not. The API/MCP caller's explicit operation is its execution request, so there is no
second generic server confirmation flag. Domain approvals, such as accepting a supplier's invoice, remain separate
operations. Progress goes to stderr; JSON-mode errors produce the same structured error envelope on stdout.

No `--fresh` flag silently contacts all providers. Use `connection sync` and then rerun the read. Reads
that need a provider lookup (for example external shipment discovery or catalog identity validation) declare it in
their operation metadata and return observation times and failures.

## Identity and units

- Copacker records use UUIDs. A PO display reference resolves by exact match inside the caller's accessible workspace;
  zero matches is not found and multiple matches is `ambiguous_reference`. Mutations require UUIDs.
- Provider identity is typed: provider, connection/account, object kind and external ID. Product identity includes the
  store/account and variant ID. SKU is a filter or lookup hint, never a globally unique key.
- Shipments expose `origin: copacker | external`, nullable `poId`/Copacker shipment IDs, and structured
  `providerReferences[]`. A split FBA plan never becomes a comma-separated identifier in the public contract.
- PO/carton quantities are integer pieces. `piecesPerSet` defines the conversion to sellable units. Inventory/demand
  quantities state their unit and stock pool. Unknown stays null, signed stock stays signed, and overlapping states are
  never summed into an invented total.
- Commercial money uses safe integer minor units and an explicit currency. Precision-sensitive source amounts such as
  daily Ads spend use decimal strings with declared currency/scale until aggregate rounding. A PO's unit price is per
  piece; signed adjustments are separate. Totals across currencies are grouped or carry the existing reporting
  conversion basis and coverage.
- Instants are UTC ISO 8601; supplier ready dates and PO due dates are calendar dates. Report calendar ranges use
  inclusive `from`, exclusive `to`, and an explicit resolved IANA time zone: request, workspace setting, then UTC.
  Return the resolved instants. A ready date is not a confirmed carrier pickup appointment.

## Results and errors

The same result shape is used by the HTTP client and CLI JSON. Its `data` has an operation-specific schema.

```json
{
  "data": {
    "items": [],
    "page": { "nextCursor": null, "hasMore": false, "consistency": "live" }
  },
  "meta": {
    "requestId": "<request UUID>",
    "workspaceId": "<workspace UUID>",
    "generatedAt": "2026-10-15T12:00:00Z",
    "completeness": "complete",
    "sources": [],
    "warnings": [],
    "redactedFields": []
  }
}
```

`sources[]` identifies provider/account/dataset, snapshot or sync ID, observation time, covered period, freshness
(`current`, `stale`, `unknown`) and availability. `completeness` is `complete`, `partial` or `unavailable` relative to
the requested scope. This differs from pagination: a complete source result may still have more pages. `warnings[]`
contains stable codes, affected source/row IDs and actionable messages. Never return missing history as an empty
successful sales or restock report.

Return each source's `staleAfter` threshold or timestamp so “current” has a reproducible meaning; a generated report's
timestamp never substitutes for the age of its underlying inventory or sales data.

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "This shipment changed. Read it again before saving.",
    "retryable": false,
    "details": { "expectedRevision": 4, "currentRevision": 5 },
    "issues": [],
    "recovery": { "operation": "shipment.show", "input": { "id": "<shipment UUID>" } }
  },
  "meta": { "requestId": "<request UUID>", "workspaceId": "<workspace UUID>" }
}
```

| HTTP status | Example stable codes | CLI exit |
| --- | --- | --- |
| 200, 201, 202 | Successful read, mutation or accepted operation | 0 |
| 400, 422 | `invalid_input`, `validation_failed` with field paths | 2 |
| 401, 403 | `unauthenticated`, `permission_denied`, `insufficient_scope` | 3 |
| 404 | `not_found`, including inaccessible object identifiers | 4 |
| 409 | `revision_conflict`, `invalid_state`, `stale_plan`, `preview_expired`, `preview_consumed`, `handoff_expired`, `identity_unresolved`, `cursor_invalidated`, `idempotency_conflict`, `ambiguous_reference`, `outcome_unknown`, `superseded`, `unsupported_contract` | 5 |
| 410 | `artifact_expired`, with the owning export operation and original selection | 5 |
| 409 | `partial_write`, including confirmed effects and failed target details | 9 |
| 429 | `rate_limited`, with Retry-After | 6 |
| 502, 503 | `provider_unavailable`, `source_unavailable` | 6 |
| 500 | `internal_error`, sanitized | 1 |

Client-only usage errors use 2, transport failures 6, and wait timeouts 7, with a structured error and resource/operation ID.
`--require-complete` on report/list commands treats partial/unavailable source coverage as exit 8 while retaining the
result and warnings for inspection. A waited failed operation returns the corresponding error exit; accepted work without
`--wait` returns 0 to mean accepted, not completed.

When none of the requested scope can be evaluated, return `source_unavailable` with source details. Partial results are
successful only when they contain usable data plus explicit blocked/unavailable portions; an empty set of eligible
restock channels cannot masquerade as “nothing needs ordering.”

## Pagination and exports

Lists accept `limit` (default 50, maximum 200 unless an operation has a smaller documented limit), an opaque `cursor`,
allowlisted filters and sort. Each cursor is bound to workspace, filters, sort, account identity and applicable snapshot.
Use deterministic ordering with an ID tie-breaker. Reject unknown/duplicate parameters. No silent truncation.

Inventory pages stay on the same snapshot; a replacement or changed account/classification invalidates the cursor.
Ordinary PO/customer-order lists declare `consistency: live`, so pagination is not represented as a frozen export. Restock plans
use an immutable report snapshot with a 24-hour expiry. Large exports may run asynchronously under their entity; until then
`--all` respects the endpoint's declared consistency and never describes a live traversal as a point-in-time export.

Each export-capable operation accepts a discriminated input: `{action:"generate", selection, fileFormat}` or
`{action:"read", exportId}`. The registry defines the typed selection and allowable formats. Generation uses an
idempotency key to retain one run and artifact; read is side-effect-free. Reports can additionally use their normal read
input when no file is requested. Export generation fixes a snapshot/selection and declares its actual consistency.
The same key returns the same run, including after a lost response; a new requested export uses a new key.

Supported artifact formats are CSV/JSON for customer orders, inventory, expenses and tabular reports; CSV/XLSX/JSON
for products; XLSX/PDF for catalogs; and PDF for an individual PO or CSV/JSON for a PO collection. PDF labels and packets
have a fixed format. `--format` never chooses file encoding. The chosen file format appears in the typed operation
input; local `--output` and stdout rendering do not.

For example, an accepted `order.export` returns `exportId`, operation progress and
`statusQuery: {operation:"order.export", input:{action:"read", exportId:"<export UUID>"}}`. Read returns the exact run,
any terminal failure, and on success the authorized artifact with `expiresAt`, size/hash and source coverage. Retain
the status receipt for at least seven days and generated bytes for 24 hours after completion. After byte expiry, status
remains readable and reports `artifactStatus: expired`; an attempted download returns `artifact_expired`. A fresh
generation is explicit and may use newer data. Recheck current entity/price access before returning any saved result.

## Mutation concurrency and repeating operations

The [bulk contract](bulk.md) supplies limits, stable row IDs, whole-request preflight, local-versus-provider atomicity,
child effect identities and recovery. Bulk support is explicit per operation, not inferred for every mutation. Protected
credential delivery has the receipt/replay exception documented in [credentials](credentials.md#protected-secret-delivery).

All mutations that change an existing aggregate accept `expectedRevision`. Packing and other actions whose correctness
depends on both the shipment and PO also accept `expectedPoRevision`. Extend existing handlers that currently lack
these guards, and update the UX callers together. Append-only comments need an idempotency key and current access but
do not replace an aggregate snapshot. Creates have no target revision; they validate parent/dependency revisions where
applicable. Upload attachment must recheck the target revision after reading bytes.

Require an `Idempotency-Key` header on API mutations; CLI adapters supply it automatically unless the caller sets it.
Scope records to stable principal ID, workspace and operation (not the rotating access-token value); store the canonical
input hash, actor, operation result and internal job IDs atomically with mutation/outbox work. The same key and input
returns the completed result without repeating effects, or joins its resumable execution. Different input returns
`idempotency_conflict`; concurrent
duplicates join the same result or return its in-progress job. Recheck current access before returning a saved result.
Keep records for at least seven days and expose expiry; do not retry beyond it without checking the business resource.
Persistent plan-to-PO and import-to-PO links prevent duplicates beyond this replay window.

Local multi-step helpers derive distinct stable child keys from the caller's key for upload and attachment. Replaying a
helper resumes its recorded steps instead of reuploading/reattaching blindly. Multipart input hashes include the actual
file digest, purpose and target; repeated transfers use the same checks as JSON mutations. These are implementation
steps within the owning entity operation, not commands users have to sequence themselves.
Remote handoffs use the same retained logical intent and distinct prepare/complete keys, as specified in
[entity transfers](workflows.md#entity-transfers); the phases never reuse a key with changed input.

Running the original command again is the recovery interface. Keep transport replay separate from a new attempt:

- The same execution key and input returns the completed result or current progress; a known transient failure with no
  effect can resume its failed stage. Confirmed effects are never repeated. Terminal validation failures require corrected
  input and a new key. Read [write routing](write-routing.md) for multi-target execution and partial outcomes.
- A new invocation for the same resource and desired action joins existing pending work, returns completed work when
  already satisfied, or schedules a new attempt of a known failed stage. It does not submit a second shipment or reserve
  its cartons again. Validate the caller's revisions against the accepted operation/dependencies before resuming.
- Relative inventory adjustments are distinct intents: a new execution key means a new delta. To recover an interrupted
  adjustment, the CLI reuses its retained key; it must never generate a new key as a network-recovery strategy. A deliberate
  second adjustment creates a new execution with newly observed concurrency inputs.
- For entity imports, retain a workspace/target/source-digest link and show the existing import when the same bytes are
  submitted again. Changed corrections increment its revision; applying it twice returns the same saved entity.
- Resource creates retain a stable client reference or CLI execution receipt. An uncertain create without a recoverable
  key/reference must be looked up first, not automatically repeated. A deliberately separate create uses a new reference.
- Invitation resend and a newly requested sync are inherently new executions once the earlier execution has completed;
  replaying their original key still does not send another message or queue a duplicate run.

Retry safe reads with bounded backoff and Retry-After. Retry a mutation transport failure only with the identical key
and input within the retention window. Never “resolve” a revision conflict by substituting the new revision. An uncertain
Amazon create is `outcome_unknown`; use `shipment.reconcile` before any further create. Idempotency at Copacker's HTTP
boundary does not prove an external provider completed or rejected a request.

`po check` and `shipment check` are advisory and perform no reservation, email or provider mutation. Saving/submitting
repeats validation inside the transaction. Declare effects such as draft creation, quantity reservation, supplier email,
provider shipment creation and Shopify cost updates in operation schemas and results. Record actor, credential/client,
workspace, request/key, affected records and revisions in the existing business audit trail without logging secrets or
entire uploaded documents.

## Asynchronous entity operations

A response with asynchronous work uses HTTP 202 and returns affected resource IDs/revisions plus
`data.operation: {id, name, status, stage, startedAt, completedAt, error, recovery}` and a typed
`statusQuery: {operation, input}` selecting that exact run through its owning entity. The ID is an opaque progress
identifier, not an invitation to operate the worker queue. Synchronous success uses the operation's normal typed result.
Never return only a browser redirect.

Public operation states are `queued`, `running`, `succeeded`, `partially_succeeded`, `failed`, `needs_attention`, `cancelled`.
Map worker states centrally; do not expose leases or secrets. Read progress through `po import show`, `product import show`, `shipment show`
or `connection sync show`, using the returned resource ID and optional operation ID to select the exact run. Product
and inventory writes expose progress and per-target results through `product show` or `inventory show`. `--wait`
uses the returned status query internally, including the product ID and exact operation ID for variant writes. Collection
exports use their original export/report operation with `action: read` and `exportId`; no individual order must own a
collection export. Bulk changes use their original operation with `mode: read` and `batchId`. A sync with no standalone
business entity is owned by its connection.

Import review and shipment approval are business states, not completion of the whole workflow. Waiting stops at the
submitted operation's completion or required intervention, not the eventual physical receipt of goods. Cancellation
belongs to the entity workflow. There is no top-level job, wait or retry command.

On terminal partial writes, return `partial_write` with confirmed and failed target outcomes in `error.details`;
CLI exit 9 and MCP `isError` prevent partial application being mistaken for complete success. A source write can
succeed while a destination fails. The operation read retains the full progress/result record and the same entity
command resumes eligible failed stages. There is no distributed rollback promise.

## MCP mapping

Each business operation becomes a named tool: `report.restock` becomes `copacker_report_restock`, `po.create` becomes
`copacker_po_create`, and `shipment.packing.save` becomes `copacker_shipment_packing_save`. Inputs use the same JSON
schemas plus explicit `workspaceId` and, for mutations, `idempotencyKey`. Return the contract envelope as structured
content; business failures are tool errors with the same stable error data. Local CLI conveniences (`login`, `logout`,
`workspace use`, local file paths and `--wait` polling) do not become server tools. `partners.create` becomes
`copacker_partners_create` with its typed partner input; do not generate separate supplier/forwarder CRUD tools.
Credential-management operations also remain outside the business MCP tool catalog; no credential secret enters model
content. Product/inventory capability and preview schemas are identical across all three business adapters.

The MCP specification supports input/output schemas, structured results, resource links and tool-execution errors;
use these for typed operations and document references. See the
[MCP tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

Declare read-only, destructive, idempotent and external-interaction annotations accurately. They help clients describe
effects, but are not authorization enforcement. Refreshes/imports mutate Copacker even when their provider access is
read-only. When one tool has read/preview and execute branches, its tool-level annotations conservatively describe
all branches; the typed input and registry additionally describe each branch's effects. See
[MCP tool annotations](https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations).

The hosted `/mcp` endpoint uses authenticated Streamable HTTP. Implement protected-resource metadata, authorization
server discovery, resource-bound token validation and the selected OAuth flow. Prefer client ID metadata documents or
pre-registration; add dynamic registration only for clients that require it. Verify the advertised client setup paths,
issuer validation, loopback redirects and refresh behavior against the chosen authorization service before release.
The current [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
defines the interoperability requirements; WorkOS browser sign-in alone does not establish them.

Expose curated business tools, not one `execute` tool with arbitrary operation names or a provider proxy. Schemas may
describe the full surface, but discovery returns only deployed capabilities for the current caller. Document resources
recheck access on every read and never reveal bucket keys. Server-side file handling accepts authorized uploaded file
IDs through entity-bound transfer handoffs, never arbitrary URLs or paths supplied by a model. For example,
`copacker_shipment_invoice_upload` accepts the shipment and expected revisions plus either an uploaded attachment
reference or a request for an upload handoff. The same operation finishes the attachment after transfer; no generic
file-management tool is needed. See [entity transfers](workflows.md#entity-transfers).
