# Background jobs

Postgres stores payloads, status, idempotency keys and leases. Cloudflare Queues carries wake signals only. Credentials
and customer records never enter the queues. Each deployed job family has one canonical executor:

| Executor | Job families |
| --- | --- |
| Cloudflare native queue handler | `analytics`, `shopify-event`, `ebay-event` |
| Railway Node worker | Remaining families, long imports, shipment creation and AWS notification readers |
| Local Node worker | All families against the local database |

`analytics` processes one checkpointed page per attempt. The event handlers enqueue bounded sync requests. Each
Cloudflare delivery runs one SQL attempt, schedules the next due wake, and acknowledges only after both succeed.
An invocation owns its database pool; heartbeats finish before that pool closes. A later stage must checkpoint long
imports and replace the AWS readers before Railway can be retired. There is no compatibility toggle or dual ownership.

## Delivery and recovery

Producers wrap their insert or entire transaction in `withJobWake`. Both executors receive a wake after commit, never
inside the transaction. Publication failure is logged without failing an already committed action. The hourly signal
covers a crash between commit and publication; that failure can delay work by up to an hour.

A PostgreSQL advisory transaction lock serializes claims across both runtimes. They share a maximum of three running
jobs. Row locks, job keys and attempt fencing handle duplicate delivery. A runtime recovers only its own expired
leases, after ten minutes. SQL owns retry timing and payload checkpoints. Cloudflare schedules a delayed wake, with
a five-second minimum to avoid busy retries when all slots are occupied. Queue failures retry five times, then enter
the executor DLQ. Monitor both DLQs and `job_failed`, `job_signal_failed` and `queue_read_failed` logs.

Railway has three independent HTTP signal readers. Empty pulls wait five seconds without querying Postgres; active
work still consumes database compute. The local executor polls its Docker database without hosted queues. Preview
Workers have no executor trigger or executor binding and cannot consume staging or production jobs.

## Resources and configuration

Terraform owns four queues per persistent environment: `copacker-jobs-<environment>`, `copacker-executor-<environment>`
and each queue's `-dlq`. The jobs queue retains its HTTP consumer; `cloudflare.config.ts` owns the executor's native
consumer. Provision through the reviewed [infrastructure workflow](infrastructure.md) before releasing the consumer.
The native consumer uses batch size one and maximum concurrency three.

The web Worker publishes through native `JOBS` and `EXECUTOR_JOBS` bindings, without a queue API token. Set these on
Railway in each environment before releasing the new Node executor:

- `CLOUDFLARE_ACCOUNT_ID`: account ID.
- `CLOUDFLARE_JOBS_QUEUE_ID`: retained HTTP queue ID.
- `CLOUDFLARE_EXECUTOR_QUEUE_ID`: native executor queue ID.
- `CLOUDFLARE_JOBS_TOKEN`: account-scoped Queues Read and Write token covering both queues.

Production Node startup requires both queue IDs. Local development uses the same domain handlers without the deployed
split. `scheduler/` has only the two queue bindings, no database credentials or public HTTP handler. Its UTC schedules:

- `17 * * * *`: wake both executors for missed publications and abandoned leases.
- `0 7 * * *`: send daily reconciliation to Railway and wake Cloudflare.

Set `COPACKER_ENVIRONMENT` to `staging` or `production`, then run
`pnpm --filter copacker-scheduler exec cf deploy --dry-run` and `pnpm --filter copacker-scheduler exec cf deploy`.
The release workflow deploys the scheduler after the retained executor. Deployment and runtime queue tokens remain separate.

## Cutover and acceptance

Apply the queue infrastructure and set Railway's new queue ID first. Release the same tested commit to the web Worker,
Node executor and scheduler. A brief interruption during this unreleased application's cutover is acceptable; there
is no old-executor handoff protocol. Once both runtimes serve the new code, publish a wake to each queue.

PR CI runs `test:worker-jobs` against the exact built application and a disposable PostgreSQL database, alongside unit
coverage for routing, concurrency, delayed publication and failure. In staging, verify a new job, delayed retry,
lease recovery, downstream work reaching Railway and an empty executor queue. Record evidence before production promotion.
The full migration remains incomplete until long imports and AWS notification readers have moved.
