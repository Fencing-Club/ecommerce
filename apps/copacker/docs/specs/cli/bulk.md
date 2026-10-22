# Bulk write contract

Bulk writes use the entity operation that changes one record. The initial bulk surface covers `product.update`
(buyer metadata), `product.variant.update` (SKU or metadata), `product.price.update`, `product.cost.update`,
`product.supplier.assign` and absolute `inventory.update`. Supplier full-product imports retain their own reviewed
import workflow. Other commands reject a `rows` input rather than silently looping client-side.

## Inputs and limits

Use one operation and one field family per request. SKU, operational metadata, selling price, unit cost and stock counts
cannot be mixed in one batch. One request covers one workspace, with at most 100 rows, 500 resolved write targets and
1 MiB of JSON. A single row's linked price targets count toward the target limit. The server rejects an oversized
request before effects; the CLI does not silently split it into separately committed requests.

Each row is `{rowId: string, change: T}`. `rowId` is caller-assigned, unique in the batch, 1–64 ASCII letters/digits,
hyphens or underscores, and stable across replays. T is the operation's single-record change type without `mode`.
Every inventory row names its location/state; product/location/link/source guards are identical to a single write.
Duplicate resource/field or resolved target/field pairs fail validation, even under different row IDs. Input order is
preserved in results but never establishes dependencies between rows. SKU swaps/collisions require review, not an
assumption that one row executes before another.

| Input branch | Fields |
| --- | --- |
| Preview | `{mode:"preview", rows:[{rowId, change: proposed T}]}`; guards may be resolved from current observations. |
| Direct | `{mode:"direct", rows:[{rowId, change: guarded T}]}`; all required expected values/revisions supplied. |
| Apply | `{mode:"apply", previewId:Id}`; the preview already pins every row, location and target. No replacement rows. |
| Read | `{mode:"read", batchId:Id}`; side-effect-free retrieval through the same entity operation. |

Preview returns one immutable 24-hour preview with row-level routes, exact values, dependencies and issues. `canApply`
is false if any row is blocked. Apply checks the complete set again. Initial validation/authentication/routing failure
rejects the whole batch before any effect, with paths such as `rows/3/change/locationId`; there is no implicit
skip-invalid-rows option. Corrected input is a new preview/intent.

The CLI accepts `--input changes.json --dry-run`, `--preview <id>` or `--batch-id <id>` under the original command.
`--wait` polls its returned `{operation: originalOperation, input:{mode:"read",batchId}}`. MCP uses these same branches;
local paths never appear in server input. Single-record input remains valid and returns a single-record result.

## Atomicity and results

The server declares `atomicity: "local" | "per_target"` during preview; callers cannot request unsupported atomicity.
All-Copacker batches, including supplier stock counts, validate and commit all rows in one transaction or none. Mixed
local/external batches and any provider write have per-target outcomes; there is no transaction across providers.
Within a price row, the authority writes first and only then do its reviewed linked targets run. Independent rows may
progress concurrently under the [target serialization rules](write-routing.md#delivery-conflicts-and-repeat-execution).

`BatchResult = {batchId, operationName, atomicity, operation, statusQuery, rows, counts, expiresAt}`.
Each result row contains `{rowId, entityId, status, operationId, targets:TargetOutcome[], error:Failure|null}`.
Row status is `pending | running | succeeded | failed | partially_succeeded | needs_attention | superseded`.
`counts` reports integer totals for each row status and `total`; every input row appears exactly once, including rows
blocked by an execution-time conflict. Target outcomes use the [write destination schema](destinations.md).

Return 202 while work is accepted/running. A terminal mixed result uses `partial_write`, HTTP 409, CLI exit 9 and MCP
`isError:true`, with the complete BatchResult in `error.details.result`. Unknown outcomes stop waiting with
`needs_attention`; they are not silently classified as failures safe to resend. A wholly failed batch returns the
specific conflict/provider error with its BatchResult. Complete success requires all required rows/targets confirmed.
No bytes from a partial export or write result are presented as a complete replacement file.

## Rerunning a batch

Persist the batch, rows, desired generations and effect records before dispatch. Derive child idempotency identities
from principal/workspace/operation + parent key + rowId + targetId. Canonical input hashing sorts rows by rowId, so
reordering alone does not change intent; the original display order stays in the receipt. Changing any row's payload,
removing a row or changing its ID under the same parent key returns `idempotency_conflict` before further effects.

Rerunning the same command with the same key/input joins the batch, returns confirmed rows unchanged and resumes only
known failed stages whose effect is proven absent and whose dependencies still permit that accepted intent. Compare
against the execution's recorded accepted source revisions/values, not a freshly substituted revision. This permits
recovery after the operation's own source write while rejecting unrelated later edits. Uncertain targets reconcile
first; superseded targets never replay. Preview expiry does not erase an already accepted execution.

Retain receipts and row keys for at least seven days and return `expiresAt`. The CLI retains the key/batch ID locally
and uses them on an interrupted-command resume. CI supplies a stable parent key. A missing/expired receipt requires
reading the business entities before issuing a new intent. The CLI must not invent a new key to recover a network error.

To correct a non-retryable row, read its current state, submit only the corrected rows as a new reviewed batch and use
a new parent key. A key deliberately identifying a new desired change is not recovery. `inventory.adjust` remains a
single-record signed-delta command; repeating its original key never applies the delta twice.

## Example

`prices.json` contains `{mode:"direct",rows:[{rowId:"red",change:PriceChange},{rowId:"blue",change:PriceChange}]}`,
with complete guarded PriceChange objects from [product schemas](operations/products.md). A failed Amazon target on
the blue row does not invalidate or resend the confirmed red row:

```sh
copacker product price update --workspace <workspace-id> --input prices.json --idempotency-key price-list-oct15 --wait --json
copacker product price update --workspace <workspace-id> --batch-id <batch-id> --json
copacker product price update --workspace <workspace-id> --input prices.json --idempotency-key price-list-oct15 --wait --json
```

The final line resumes eligible failed stages of the original batch. It is not a new whole-batch application.
