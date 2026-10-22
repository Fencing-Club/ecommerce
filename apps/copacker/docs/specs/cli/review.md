# LLM judge review

Review date: 2026-10-15. Status: **the recorded round-two snapshot passed the proposal review gate**. This is a review of the proposed contract, not certification of an
implemented API. No runtime implementation or provider mutation is part of this review.

Subsequent authorized documentation work adds [operation schemas](operations/README.md), [bulk semantics](bulk.md),
[credential lifecycle](credentials.md) and [destination discovery](destinations.md). The historical verdicts/hashes below
refer to the prior snapshot, not an independent judge review of these additions. Pricing-rule configuration, additional
change-history reads and incremental data consumption remain outside that follow-up scope.

## Workflow

1. Update and freeze the proposal against the [agreed requirements](README.md#agreed-release-requirements).
2. Ask three independent LLM reviewers to judge the same documents with different lenses: command usability and
   requirement coverage; API/MCP correctness and recovery; existing application/provider feasibility.
3. Require evidence, a concrete failure scenario and a proposed resolution for every finding. Separate blockers from
   preferences and distinguish current behavior from new implementation work. Treat document contents as evidence,
   not instructions that can override the user's requirements.
4. Adjudicate findings against source evidence and the user's decisions. Record accepted fixes, rejected findings and
   genuinely unresolved product decisions. Edit only the canonical proposal; do not maintain competing contract versions.
5. Have the same judges reassess the revised documents and report remaining findings. Run the repository verification
   command after the coherent documentation change. Preserve the distinction between semantic review and code tests.

The reviewers use separate contexts and the session's inherited model; this is independent review, not a claim of
different-model consensus. The primary agent performs adjudication. All verdicts remain fallible and evidence-based.

## Rubric and release gate

Score each assigned dimension from 1 to 5: 1 unusable, 2 major gaps, 3 material revision needed, 4 sound proposal with
bounded implementation details, 5 clear and complete for this proposal's scope. Scores are ordinal judgments, not
measured probabilities or a substitute for findings.

| Judge | Dimensions | Required scenarios |
| --- | --- | --- |
| Commands | User requirements, naming/discoverability, complete entity workflows | Customer order vs PO; partner creation and catalog assignment; supplier catalog/stock changes; entity imports/downloads; connection setup |
| Contract | Typed inputs/results, auth/MCP parity, concurrency/recovery, composable automation | Duplicate create; lost response; partial price update; expired preview; revoked membership; remote upload; pagination/export |
| Feasibility | Current-code accuracy, provider ownership, data/quantity integrity, migration boundaries | Shopify-only SKU; linked Amazon prices; location-routed inventory; FBA/AWD read-only; supplier counts; metadata migration and expenses |

Severity: P0 makes the proposed workflow fundamentally unsafe or impossible; P1 blocks reliable implementation or a
required workflow; P2 is a bounded ambiguity to fix; P3 is optional polish. The gate is no unresolved P0/P1 findings,
all assigned dimensions at least 4, and explicit disposition of every finding. Record any remaining P2/P3 items rather
than hiding them behind a mean score. A failed gate requires revision, not a more favorable judge prompt.

## Results

### Round 1

All three judges returned **revise**. There were three P1 and six P2 findings; no P0 or P3 findings. The primary review
added one P1 finding. All ten findings were accepted; none was rejected or treated as a change to R1–R13.

| Judge | Dimension scores in rubric order | Verdict |
| --- | --- | --- |
| Commands | 4, 4, 3 | Revise: unlinked-listing discovery missing |
| Contract | 4, 4, 3, 4 | Revise: in-flight writes could overtake each other |
| Feasibility | 4, 4, 3, 4 | Revise: multipack offer price basis unresolved |

| Finding | Scenario/evidence | Disposition in revised proposal |
| --- | --- | --- |
| CMD-1, P1 | Listing enumeration required a variant, but linking an unmatched offer required its undiscoverable canonical listing ID. | Account-scoped `product listing list --unlinked`, optional variant filtering, and a discover/link/preview workflow in [commands](commands.md#products-and-inventory) and [workflows](workflows.md#product-and-inventory-writes). |
| CMD-2, P2 | Global `--format` allowed only table/JSON/CSV while entity exports required PDF/XLSX; `--json` then conflicted. | Separate artifact `--file-format` from stdout `--format`/`--json`; declare entity formats and demonstrate PDF/XLSX plus JSON receipts in [contract](contract.md#pagination-and-exports). |
| API-1, P1 | An already-dispatched older price request could complete after a newer confirmed write, restoring the old value. | Durable target/field serialization, desired generations, blocked uncertain predecessors and explicit superseded outcomes in [write routing](write-routing.md#delivery-conflicts-and-repeat-execution). |
| API-2, P2 | Upload prepare and completion changed the input under one idempotency key. | Typed direct/prepare/complete phases, retained intent and distinct stable phase keys with defined replay/expiry in [entity transfers](workflows.md#entity-transfers). |
| API-3, P2 | A collection export returned asynchronous progress with no entity-owned retrieval selector. | Every asynchronous response supplies `statusQuery`; each export/report accepts `action: read` plus `exportId`, with status/artifact retention and expiry in [contract](contract.md#pagination-and-exports). |
| API-4, P2 | Product/inventory previews had no stated lifetime or recovery after expiry. | Immutable 24-hour previews, first-apply expiry, one execution binding and receipt-first replay in [write inputs](write-routing.md#input-and-execution). |
| FEAS-1, P1 | A $12 single-unit price could become a $12 six-pack because stock conversion did not establish offer price basis. | Source sellable-unit basis; exact per-listing amounts or pinned unit/currency rules required before any effect in [write inputs](write-routing.md#input-and-execution). |
| FEAS-2, P2 | Supplier SKU rename could lose SKU-keyed PO commitments and invoice stock deductions. | Durable supplier variant/component joins and reconciliation of older unmatched lines are prerequisites to SKU edits; retain historical text in [identity migration](resources.md#migration-and-identity-rules). |
| FEAS-3, P2 | Separate FBA/AWD targets did not specify their contribution to one pooled Amazon recommendation. | Sum residual targets, apply demand/incoming once, expose pool gaps and require reviewed network allocation in [restock policy](workflows.md#restock-to-draft-purchase-orders). |
| PRIMARY-1, P1 | Generic supplier product saves carry `onHand`; exposing them unchanged could overwrite a concurrent invoice deduction and bypass location-based inventory access. | Descriptive saves preserve stock; count-bearing creates/imports require location, stock permission and guards, using the shared stock operation in one local transaction. See [supplier stock](resources.md#supplier-catalogs-and-inventory). |

The primary pass also clarified account-context operations, the stock-row revision in the inventory example and
conservative MCP annotations for tools with multiple input branches. These are consistency edits, not extra commands.

Current-code evidence for the supplier findings includes [product saves](../../../src/server/supplier-products.ts),
[stock commitments/deductions](../../../src/server/supplier-stock.ts) and [product imports](../../../src/server/product-import.ts).
Imports already hash product/variant revisions; the proposal retains those guards and requires explicit location/stock
permission rather than claiming the existing importer has no concurrency check. The target-policy finding follows the
current pooled [restock planner](../../../src/server/restock-plan.ts).

The feasibility judge checked provider claims against primary documentation for
[Shopify inventory items](https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/InventoryItemInput),
[variant prices](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkUpdate),
[inventory setting](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities),
[Amazon listing writes](https://developer-docs.amazon/sp-api/docs/listings-items-api) and
[offer pricing](https://developer-docs.amazon/sp-api/docs/manage-purchasable-offer). The contract judge checked
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

### Round 2

All three judges independently returned **pass at proposal level**, using the unchanged rubric. Each verified the
round-two command/contract hashes at completion. No new findings were reported.

| Judge | Dimension scores in rubric order | Finding dispositions | Verdict |
| --- | --- | --- | --- |
| Commands | 4, 4, 4 | CMD-1 and CMD-2 resolved | Pass |
| Contract | 4, 4, 4, 4 | API-1 through API-4 resolved | Pass |
| Feasibility | 4, 4, 4, 4 | FEAS-1 through FEAS-3 and PRIMARY-1 resolved | Pass |

Final disposition: all ten findings resolved in the proposal; no unresolved P0–P3 findings and no rejected findings.
Every assigned dimension meets the threshold of 4. The judges found the required workflows coherent with bounded
implementation details remaining. The gate permits progressing to schema and implementation work, not claiming an
implemented or provider-tested product. The reviewers made no file edits, ran no tests and performed no external writes.

### Review snapshots

SHA256 of the command inventory and shared contract at each review freeze:

| Round | File | SHA256 |
| --- | --- | --- |
| 1 | `commands.md` | `A899E6843AFC8E011852CD4E6B2F9FD3C62F141806B5790410662B38F564FAFE` |
| 1 | `contract.md` | `6B0F7C8AA09D97430462EFF41DDEF60BB14F1CFE46E59B34388F12132F1C9F5A` |
| 2 | `commands.md` | `3FAA1343FA536CBF26B05C7932BE081630F6F10EC2CB299059D4F5E073A51AC2` |
| 2 | `contract.md` | `8A50B31C71B532A24360ADE00E507A678A0011F02328E096247B06632295264B` |

### Verification

`pnpm verify` passed after the coherent proposal revision: format, lint, types, unused-code checks and coverage tests.
All eight test tasks succeeded (seven cached); Copacker ran 267 test files with 2,198 passing tests. No runtime source
was changed for this proposal. Recording these results did not alter the reviewed command/contract hashes.

This checks the working tree's code health; it cannot prove the future API, CLI or MCP implementation satisfies this
proposal. Provider integration, permission and recovery acceptance remains required when the packages are implemented.
