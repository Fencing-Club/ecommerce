# Copacker CLI and MCP contract proposal

Status: **partially implemented and deployed; remaining operations proposed**. The
[CLI package](../../../../../packages/copacker-cli/docs/README.md), shared client and portable registry now implement
the command vocabulary and client protocol. Server authentication, primary reads, restock reports, stock targets,
supplier catalog/stock management and guarded local writes are implemented; see [CLI server](../../cli-server.md).
Hosted MCP and several business workflows remain unimplemented. This specification describes the full intended
operational release. See [implementation status](implementation.md) for deployed coverage and remaining work;
client help alone does not prove that a command has a deployed handler.

Copacker should expose its primary business data and the operations that maintain it: ingested customer orders,
products, inventory, purchase orders, shipments, partners, connections and expenses. Restock adds Copacker's
replenishment logic over those records. The CLI, web app and MCP server should call the same authorized operations.
Shopify, Amazon, Amazon Ads and eBay remain integrations behind those operations.

## Proposal

- [Implementation and recovery audit](implementation.md): recovered files, current executable coverage and remaining work.
- [Command inventory](commands.md): commands, arguments, release scope and existing implementation to reuse.
- [Shared API contract](contract.md): transport, authentication, schemas, output, revisions, repeated operations and MCP mapping.
- [Operation schemas](operations/README.md): typed inputs, results, permissions, effects and errors for the command inventory, with worked examples.
- [Bulk writes](bulk.md): row identities, batch limits, previews, partial results and safe resumption through entity operations.
- [Automation credentials](credentials.md): issuing, protecting, rotating, expiring and revoking credentials for unattended use.
- [Write destination discovery](destinations.md): readable field ownership, exact destinations and per-target previews/results.
- [Operational workflows](workflows.md): restock to purchase orders, packing, files, reporting and acceptance criteria.
- [Resource ownership](resources.md): shipments and transport legs, product write destinations, expenses and ingestion.
- [Product and inventory writes](write-routing.md): Shopify-only SKU edits, linked price updates and location-specific stock writes.
- [LLM judge review](review.md): evaluation criteria, findings, resolutions and final verdicts for this proposal.

The latest documentation pass covers operation schemas, bulk semantics, credential setup and write destination
discovery. Pricing-rule configuration, additional change-history reads and incremental data consumption remain topics
for the next product discussion; this pass adds no commands for those three topics.

## Agreed release requirements

These requirements govern the proposal and its review. The latest user decision supersedes earlier brainstorming.

| ID | Requirement |
| --- | --- |
| R1 | `order` means ingested customer orders; `po` means purchase orders. Expose the primary data Copacker ingests. |
| R2 | Restock is central, with PO creation/editing, shipment operations and usable explanations of data coverage. |
| R3 | `partners` combines supported relationship types through a type field; lookup, creation and customer catalog assignment are initial functionality. |
| R4 | Connections, products, inventory and expenses belong in the initial command surface. |
| R5 | Suppliers can manage their own products, catalogs and inventory in the initial release. |
| R6 | Use top-level `login`/`logout`, without `whoami` or an Overview command. |
| R7 | Imports, exports, uploads and labels belong to their entities; no top-level file/import/job/retry groups. Repeat the original operation to recover. |
| R8 | Remove deferred endpoints from the inventory. Distinguish current services from implementation required for the initial release. |
| R9 | Buyer SKU edits write to Shopify only. Do not add an Amazon SKU handler; preserve Amazon listing identities. |
| R10 | Selling-price updates apply across linked price targets. Cost updates reach their configured source. Report partial outcomes. |
| R11 | Inventory writes require a location, which determines the balance and destination. Cover supported Amazon FBM writes; FBA/AWD remain reported stock. |
| R12 | Supplier SKU and operational metadata, including FBA/AWD/location targets, are maintained in Copacker after migration. |
| R13 | Shared operations serve CLI, UX and MCP, and prepare for inventory/order synchronization without claiming the Marketplace Connect replacement already exists. |

Core commands:

```sh
copacker report restock --json
copacker order show 1043 --json
copacker po show 1043 --json
copacker shipment list
```

`order` means a customer sales order ingested from a connected platform. `po` means a purchase order between buyer
and supplier, including when the caller is that supplier. These names and their IDs never change meaning by workspace.
An order number resolves within provider/account context; a PO reference resolves within the accessible workspace.
Ambiguous display references need a source/account selection. Mutations use canonical IDs.

The landing page's `order show` example currently displays a supplier and PO progress. Change its example to `po show`
when the contract ships, or replace its output with an actual customer order. Its restock statuses are illustrative:
use the current domain states and `purchaseUnits`, with display labels separate from stored state.

## Command design

Use `login`, `logout`, `account show` and `status`. Resource commands use familiar verbs such as `list`, `show`,
`create`, `update`, `import` and `export`. `partners` unifies supplier, forwarder and eligible B2B customer relationships
through a `type` field. Connections include authorization, reconnecting and dataset sync in the initial scope.

Uploads, imports, exports and labels belong to their entity: `po import`, `product export`, `shipment invoice upload`,
`product label download`. File storage, import workers and queues are implementation details, not top-level command
groups. Running the original command again resumes or safely repeats work; recovery must not require learning a
generic retry command. An uncertain external create still needs reconciliation before another create is allowed.

There is no Overview command. Primary records support consumer-built summaries; focused reports can reuse the
application's calculations where useful. Restock is the central domain report.

## What exists and what needs building

| Area | Existing foundation | Required work |
| --- | --- | --- |
| Shared packages | `@repo/copacker-orders` (PO schemas and costs), `@repo/copacker-shipments` (packing and document schemas, labels, PDFs), `@repo/copacker-marketplaces` (Shopify, Amazon and eBay adapters) and `@repo/copacker-packing-rules` (receivers and packing rules) | Reuse server implementations and extract portable public schemas where needed. |
| Application API | Browser routes and `/api/action`; some reads live only in server page loaders | Introduce an operation registry with complete input and output schemas, normalized errors and list/detail reads. |
| Access | WorkOS browser sessions, live workspace membership, role/page permissions and price filtering | Add Copacker bearer credentials and explicit workspace selection for CLI and MCP. Browser cookies alone are insufficient. |
| Ingested data | Stored customer orders, products/variants, stock snapshots, stock days, transactions and Ads spend | Expose typed records, their provider identities and coverage, not just dashboard totals. |
| Restock | Stored sales, stock snapshots, supplier resolution, case rounding and PO creation from the UI | Add reproducible report identifiers and a reviewed plan-to-draft operation for automation. |
| Purchasing and shipping | Revisioned POs, resumable packing, approvals, durable jobs and Amazon reconciliation | Give every exposed mutation consistent concurrency and retry semantics, including commands currently missing explicit revision inputs. |
| Entity attachments | Authorized PDF uploads, document revisions, label assignments, imports and private downloads | Expose transfers and review through the owning entity; retain protected storage internally. |
| Partners and connections | Supplier/forwarder relationships, addresses and browser provider authorization | Initial lookup, creation, updates, explicit invitations, connect/reconnect/disconnect and dataset health. |
| Buyer product metadata | One-time imported supplier SKU, ASIN and operational settings; current buyer catalog seeded from Shopify | Keep SKU owned by Shopify, preserve durable provider links and add separate FBA/AWD/location targets in Copacker. |
| Supplier products, catalogs and stock | Product/variant editing, stock counts, price lists, customer assignments, imports and exports | Expose these initially; preserve commitments through durable IDs on SKU edits and guard every count path, including imports. |
| Product and inventory writes | Shopify unit-cost adapter and supplier-owned catalog/stock changes | Add Shopify SKU edits, Shopify/Amazon price updates and location-routed inventory writes. Amazon SKU has no handler; FBA/AWD counts remain read-only. |
| Expenses | Imported platform charges, Ads spend, monthly costs and PO landed costs | Unified typed expense reads and manual-cost operations with source provenance and counting rules. |
| Shipment discovery | Copacker shipments plus live Amazon FBA/AWD listings, deduplicated in the UI | Expose both origins with different capabilities and explicit provider freshness. External shipments are initially read-only. |
| MCP | Marketing setup points at `https://copacker.ai/mcp`; the hosted endpoint is not implemented | Add an authenticated adapter over the same operations, without invoking CLI subprocesses. |

The [application contract](../../api-contract.md), [permissions](../../permissions.md),
[sales demand rules](../../sales-demand.md), [Amazon inbound flow](../../amazon-inbound.md),
[supplier workspace](../../supplier-workspace.md) and [Overview](../../overview.md) remain the authority for current
behavior. The [inventory sync spec](../inventory-sync/README.md) describes planned behavior; it must not be advertised
as an existing capability.

## Package boundaries

Proposed directories, with published names to be chosen before release:

| Location | Responsibility |
| --- | --- |
| `packages/copacker-contract` | Portable Zod input/output schemas, operation names, error codes, units and capability metadata. No database, framework, provider credentials or PDF dependencies. |
| `packages/copacker-client` | Typed HTTP client, authentication hooks, pagination, retry policy and binary transfer. |
| `packages/copacker-cli` | The `copacker` executable, argument parsing, local profiles, tables, JSON/CSV output and local file handling. |
| `apps/copacker/src/server` | Canonical business handlers, authorization, transactions, jobs and integrations. |
| `apps/copacker/src/server/mcp` | Hosted MCP adapter and document resources using the same handlers and authorization context. |
| `packages/copacker-orders`, `packages/copacker-shipments`, `packages/copacker-marketplaces` | Domain schemas, documents and provider adapters, used by the server handlers. |

Extract shared schema definitions once and change their consumers together; do not copy the shipments schemas into a second
implementation. The public client should not pull in PDF generators or provider SDK internals. Each new package gets
its own documentation when implemented. No new CLI or MCP library is selected by this proposal.

## Delivery order

1. **Contract and access:** portable schemas, explicit caller/workspace context, credentials, capabilities, errors,
   pagination, idempotency records and revision checks. Translate the documented operation schemas and work through
   the credential bootstrap flow. Add the three advertised commands against real application data.
2. **Primary data and setup:** customer orders, products, inventory, expenses, partner/address creation and connection
   management. Include operational metadata migration, supplier catalog/stock management and customer catalog
   assignments. Add controlled product/price/cost writes and location-specific inventory writes with durable provider
   mappings and per-target outcomes. Return provenance, coverage and field ownership rather than only derived totals.
   Include the documented bulk contract and readable write destinations in the first implementation of these writes.
3. **Replenishment and purchasing:** complete restock explanations, PO CRUD and lifecycle, entity imports/exports,
   and reviewed creation of draft POs from restock.
4. **Shipping and documents:** packing, invoice approval, split shipments, entity labels/packets and operation status and
   recovery. Support buyer, supplier and forwarder permissions for these shared workflows.
5. **MCP:** expose the same initial operations at the advertised hosted endpoint. Validate authorization and file
   handoffs in actual clients before marking their marketing setup instructions supported.

The command inventory describes this initial release only; deferred endpoints are removed rather than listed as stubs.
Steps 1–4 form the first useful CLI release. Avoid publishing a read-only CLI as if it already fulfils the advertised
ability to act on purchasing and shipments.

Before implementation, judge the command inventory and contract against R1–R13, concrete end-to-end scenarios,
existing source behavior and provider limitations. Resolve blocking findings in the canonical documents, then have the
judges review the revision. A proposal review does not replace executable schema tests and integration acceptance when
the package is implemented.

## Boundaries

Initial scope includes reading customer sales orders, not fulfilling, refunding or cancelling them. Inventory writes
require a location and supported quantity state; FBA/AWD remain read-only. SKU writes target Shopify only for connected
buyer products. Supplier-owned products remain editable in Copacker. It includes shipment booking references and existing
Amazon workflows, not a new AGL booking integration. Receiving retains today's whole-shipment semantics; line-level
received/rejected quantities belong to the inventory-sync work.

Raw provider HTTP/GraphQL passthrough, arbitrary SQL, workspace/account deletion, ownership transfer and unrestricted
provider token entry are outside the initial public surface. Provider credentials stay on the server. Adding a new
operation should expose a named Copacker workflow with the same checks as the UX. The shared write adapters and durable
identities prepare for inventory/order synchronization and Marketplace Connect replacement; the CLI release itself
does not claim that the complete synchronization engine has shipped.
