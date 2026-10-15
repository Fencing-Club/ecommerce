# Database, storage and background execution

Part of the [migration specification](README.md). This page defines the backend contracts that must survive the move
from persistent Node services to event-driven Cloudflare runtimes. Railway Postgres remains authoritative; replacing
the database provider is outside this effort. Physical schema details are designed and reviewed during M1/M4, not
prescribed as hand-applied SQL here.

## Database and request lifetime

Retain Drizzle, PostgreSQL semantics, the existing schema and migration history. Workers use `pg` through Hyperdrive
with verified TLS to Railway's public proxy. Keep Hyperdrive query caching disabled. Establish and release clients
inside an invocation or durable Workflow step; do not reuse a process-wide `pg.Pool` across Worker requests or hold a
transaction across a Workflow sleep/checkpoint. Retained Node processes keep their existing pool and private connection.
Source: [Hyperdrive connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/).

Pass database access through a typed server context or another explicitly scoped server abstraction. Audit every caller
of the current globally cached DB export, including `@repo/aisle` consumers, authentication, email jobs and event
handlers. Shared schema/type imports must not instantiate a connection. Each transaction uses one connection and releases
it on success, validation error, provider failure and cancellation.

Prove JSON/array queries, row locking, `FOR UPDATE SKIP LOCKED`, read-after-write, reconnect behavior and shared
connection capacity under concurrent web/jobs traffic. Preserve the Shopify refresh-token lock that spans the provider
request until an equivalent serialization mechanism is proven. An isolate-local mutex cannot coordinate different
Workers. Budget connections for both deployment generations and the separate migration runner.

Migrations run once per environment/release through serialized CI using a direct verified Railway connection, not
through application startup. Stage additive schema changes before code that uses them; defer destructive cleanup until
old code, old queue messages and in-flight Workflows are drained. Keep the existing generated-migration and deployed-hash
process. See [cutover.md](cutover.md#railway-postgres-connectivity-and-continuity).

## Durable dispatch and execution contract

Queues are delivery transport, Workflows are durable orchestration, and the Postgres job ledger remains the application
record for progress, attempts, cancellation, revision and audit. Do not maintain independent, contradictory job status
in three systems. Record the queue/workflow identifiers needed to reconcile transport state back to the ledger.
Delivery is at least once and unordered; this is a correctness constraint, not an exceptional condition.
Source: [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

The proposed schema capabilities are:

| Capability | Required persisted information and invariant |
| --- | --- |
| Inbox | Environment/provider identity, stable event ID, receipt time, payload or private object reference, processing state; unique provider/event identity prevents duplicate effects |
| Outbox | Stable message ID, job/reference, destination, availability time, publication lease/attempts, last error, published time; business change and outbox row commit atomically |
| Job ownership | Executor family/owner, fenced attempt, revision, availability, progress, heartbeat or Workflow identity, terminal outcome; only one valid executor may commit results |
| Side-effect record | Stable business operation key, request fingerprint, provider idempotency key/result and ambiguity state where needed; retry cannot blindly repeat a create |
| Coordination | Shared workspace/provider/source concurrency or rate-limit state where correctness requires it; no reliance on one process's memory |

Reuse existing job fields and deduplication records where their semantics already fit. Add only missing capabilities
through new migrations. Define uniqueness, retention, indexes and cleanup explicitly. Keep payloads bounded and store
large/sensitive artifacts privately in R2; inbox/outbox rows are not an indefinite archive of raw merchant data.

Dispatch must follow this sequence:

1. The domain transaction writes the business change, job and outbox record together. A rolled-back transaction cannot
   publish work. An endpoint reports accepted work only after that transaction commits.
2. A post-commit wakeup can accelerate dispatch, but correctness never depends on it. A scheduled sweep discovers due
   unpublished rows, claims them with expiring leases, and retries interrupted publication. `waitUntil` is not the
   durable queue.
3. The dispatcher sends stable identifiers, environment and the minimum validated routing data. Mark publication only
   after queue acceptance. A crash between those operations can publish twice; consumers must tolerate it.
4. Consumers validate message shape, load canonical job state, check executor ownership and revision, and claim a fenced
   attempt atomically. Completed, superseded or cancelled jobs are safe no-ops. Concurrent duplicates cannot both own a
   side effect. Do not acknowledge the only wakeup while an abandoned claim would otherwise strand the job.
5. A short job acknowledges after a durable terminal outcome or after a durable reschedule that has its own outbox row.
   A long job acknowledges only after a Workflow with a stable, recoverable identity has been created or confirmed.
   If Workflow creation succeeds but recording its ID fails, retry resolves the same instance rather than creating a
   second execution. Reconcile stale claims and stranded starts periodically.
6. Delayed work remains durable in the ledger/outbox. Use bounded queue delays where supported and a due-work sweep for
   longer delays; never keep an invocation sleeping to wait for a future run. Retries preserve existing attempt policy,
   provider Retry-After handling and manual-retry semantics.

Avoid nested retry storms. Assign transport retries to delivery, step retries to recoverable operations, and explicit
business policy to exhausted or ambiguous work. After limits are exhausted, persist an actionable job failure and send
the message to the appropriate DLQ. Replaying a DLQ item must reuse its business identity and recheck current revision,
permissions/configuration and execution ownership.

## Workflows and job families

The current worker has three continuously running claim loops, SQS long polls and a timer. These loops do not move
unchanged into a Worker. Replace them with queue, Workflow and scheduled entry points. Preserve the current lease/attempt
fencing during coexistence, including ten-minute leases and thirty-second heartbeats where the Node executor still
owns work. A sleeping Workflow must not be reclaimed merely because the old heartbeat model expects a live Node loop.

The following is the initial routing plan. M0 measurements can change which bounded tasks need a Workflow, but cannot
remove existing job behavior. Each kind needs a parity fixture and recovery drill before ownership transfers.

| Existing kind | Proposed executor | Contract to preserve |
| --- | --- | --- |
| `email` | Queue consumer for bounded send | Locale/template, durable send identity, retry policy and duplicate-send handling |
| `shopify-event`, `amazon-event`, `ebay-event` | Queue consumer; start sync Workflow when needed | Inbox deduplication, event coalescing, ordering tolerance and workspace/source ownership |
| `shopify-subscribe`, `amazon-subscribe`, `ebay-subscribe` | Consumer or Workflow if provider polling is needed | Existing subscription identity, renewal, environment isolation and idempotent reconciliation |
| `shopify-compliance` | Consumer, with steps if cleanup exceeds its budget | Required data-handling behavior, authentication, audit and retry safety |
| `stock`, `sales`, `shopify` | Workflow | Pagination, checkpoints, provider throttling, watermarks and per-source serialization |
| `amazon-ads` | Workflow | Report creation, durable polling, compressed download, parsing, attribution and restart safety |
| `amazon` | Workflow | Shipment/report create, poll, download, revision checks and ambiguous-create reconciliation |
| `import` | Workflow plus measured processing executor | PDF validation, AI timeout, progress, cancellation and result persistence |
| `reconcile` | Cron creates durable job; Workflow for bounded batches | One daily identity at 07:00 UTC, missed-trigger recovery and idempotent repairs |

Persist outputs needed by later steps. Use deterministic step identities, provider idempotency keys when supported and
durable sleeps for `PollAgain` behavior; keep its delay/progress semantics. Store large outputs in R2 and checkpoint
references, not PDF bytes or complete reports. A DB connection is acquired within a step and released before sleeping.
Version deployments so existing instances can finish under compatible code/data; do not rename steps underneath live
instances without a migration plan. Source: [Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

For creates without reliable provider idempotency, persist intent before the call, preserve the provider correlation
reference, then record the result. On a timeout or crash after sending, enter reconciliation/needs-attention state and
look for the existing provider object before repeating the operation. Database fencing prevents stale local commits;
it does not reverse an external side effect. Do not claim exactly-once email or shipment creation unless the provider
contract actually guarantees it. Cancellation stops future steps but cannot undo completed effects.

Use an explicit, persisted owner per job family during cutover. Configure the Node claim query, expired-lease sweeper and
new executors to respect it before the new executor receives production work. Drain/checkpoint active attempts, transfer ownership, then enable
dispatch. Never run two owners as a comparison test. Shadow evaluation may read fixtures or captured sanitized inputs,
but must not send email, rotate tokens or call commerce writes.

## Provider event ingress

Retain AWS destinations required by Amazon and the current Shopify EventBridge topology. The default bridge is a small
SQS-triggered Lambda forwarding to authenticated Cloudflare ingress. The proposed internal ingress endpoint is new
infrastructure, not a replacement of an existing public API. Select its exact path and authentication contract in M4.

The bridge must preserve the original provider/event ID, payload and relevant receive metadata. Derive a stable event
identity from the provider contract when SQS message identity alone is insufficient; do not invent a new random ID on
each delivery. Authenticate the bridge with scoped credentials/signatures, bind signatures to method/path/body and
timestamp where applicable, reject stale/invalid requests, and support key rotation. Keep request sizes bounded and
avoid logging payloads or signatures.

Ingress validates the envelope, commits the inbox plus processing outbox, then returns success. A duplicate committed
event returns a safe success without repeating business effects. A failed commit returns a retryable failure. Lambda
uses partial-batch failure reporting so one failed event does not cause successful items to be needlessly retried;
configure visibility timeouts, retry limits, DLQs and alarms for the actual bridge duration. Sources:
[Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html) and
[partial-batch handling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html).

Preserve eBay's public challenge and verified notification route, signature checks and accepted status behavior. Do not
enable currently disabled staging subscriptions as an incidental migration step. If the measured latency requirement
permits bounded scheduled SQS polling instead of Lambda, record that decision before implementation; deploy one bridge
strategy only. Retain AWS DLQs and deduplication history through the transition.

## Private documents and runtime limits

R2 stores private documents/imports separately from the existing public media bucket. Keep object keys stable so
database records need no rewrite. Node services first use R2's S3-compatible API; Workers can then use native bindings
through the same domain storage contract. Preserve content types, filenames, disposition, validation and private
no-store responses. Native bindings do not need long-lived S3 credentials in the web runtime.

Authorize every download against current membership, document state, release rules and revision before returning
bytes. Do not introduce public objects or long-lived presigned links that bypass withdrawal checks. Stream downloads
where possible, bound uploads and decompressed inputs, handle cancellation, and never log document content.

Preserve the current PDF contract: up to 32 MiB and 1,000 pages, with the existing active-content rejection. The 34 MiB
multipart/request handling and the eight-minute AI-import deadline must be evaluated against actual routes and provider
calls; a Next server-action configuration is not itself proof of the endpoint's limit. Test `pdf-lib`, `pdfjs-dist`,
`yauzl`, ExcelJS, Node streams/crypto, AWS clients, Resend/email rendering, OpenRouter and Langfuse in the deployed runtime.
Exercise compressed expansion, malformed input, base64 expansion, concurrency and generated packet/label output.

Workers' memory/CPU limits apply to document processing even when a Workflow orchestrates it. M0 must measure peak
memory and CPU with representative worst cases and choose admission/concurrency limits with headroom. Never accept a
file and silently truncate it, skip validation or reduce the product's supported size to fit the runtime. Sources:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and
[Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/).

If a workload fails, retain a narrowly scoped Node/container processor and give it private object references plus
fenced job identities. Authenticate requests, keep its retries consistent with the job ledger, and document its owner,
cost and recovery. Moving that processor to Cloudflare Containers is a separately evaluated option. The web can still
leave Next and Railway while this exception remains. Any change from synchronous download/upload to asynchronous UX
requires a specific product decision and browser acceptance; it is not silently assumed by this specification.

Define object retention and deletion alongside DB recovery. A restored database must still find the documents it
references. Use the manifest, writer-pause and reverse-delta procedure in [cutover.md](cutover.md#private-bucket-cutover).

## Configuration, observability and operations

Give staging and production separate Workers, Hyperdrive bindings, private buckets, queues/DLQs, Workflow bindings,
credentials and execution controls. Use generated binding types and validated configuration at the correct runtime
boundary. Public browser values, server secrets, binding names and CI credentials need separate inventories. Preserve
encryption keys and callback origins. Never copy production merchant tokens/jobs into a writable preview.

Use service bindings for internal Worker calls where supported. Set explicit request/provider timeouts and bounded
retries. Separate web maintenance, job pause and ingress pause controls: pausing execution must retain accepted work,
and pausing ingress must make upstream retry behavior predictable. Scheduled dispatch/recovery must tolerate skipped
or duplicate invocations. Cron is a wakeup, not the only record that a daily task exists.

Enable both logs and traces explicitly and correlate deployment, ingress ID, job, attempt and Workflow instance. Track
web errors/latency, Hyperdrive/DB connection pressure, queue age, outbox lag, DLQs, stuck jobs, provider throttles/token
refresh failures, document failures and memory/CPU exhaustion. Avoid high-cardinality sensitive payloads; retain the
existing Langfuse allowlist. Alerts must lead to documented pause, inspect, retry/reconcile and resume procedures.
Source: [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

Set retention and access controls for logs, queue payloads, Workflow state and R2 intermediates. Cleanup must respect
running jobs and recovery windows. Expose safe health/deployment status without leaking secrets; distinguish liveness
from dependency failure and measure the latter separately. The [verification matrix](verification.md) is required
before declaring the replacement operational.
