# Background jobs

Postgres stores payloads, status, idempotency keys, checkpoints and leases. Cloudflare Queues carries wake signals;
Workflows receives only the SQL claim identity. Credentials and customer records remain out of both transports.

| Executor | Job families |
| --- | --- |
| Cloudflare native queue handler | `analytics`, `shopify-event`, `ebay-event` |
| Cloudflare Workflow | All remaining families, including imports, sales, shipments, documents, email and reconciliation |
| Local Node worker | All families against the local database only |

Sales imports commit one 14-day period per attempt, then checkpoint each post-import operation. They do not buffer a
whole historical Shopify bulk export. Other long handlers run inside a Workflow step, with a 24-hour wall timeout and
300-second CPU budget. A Workflow step owns its Hyperdrive pool and native R2 context; no sockets cross step boundaries.
External side effects retain their domain idempotency and ownership checks. Workflow execution does not automatically
retry a failed step: SQL owns retry timing, payload checkpoints and failure status.

## Delivery and recovery

Producers publish to the native executor queue after commit. Publication failure is logged without failing an already
committed action. The hourly recovery signal covers a crash between commit and publication; it can delay work by up
to an hour. Empty notification reads never query Postgres.

A PostgreSQL advisory transaction lock serializes claims. Queues and Workflows share three running SQL slots. Row
locks, job keys and ownership checks handle duplicate delivery. Ten-minute expired leases become eligible again;
active handlers heartbeat every 30 seconds. Workflow IDs combine job ID and claim timestamp, so progress checkpoints
that reset the retry counter still create distinct instances. An ambiguous Workflow create keeps its SQL lease until
recovery rather than dispatching a concurrent attempt. The initial Workflow read rejects stale claim timestamps.

Each delivery acknowledges only after processing and publishing its next wake. Queue failures retry five times, then
enter the executor DLQ. Monitor `job_failed`, `job_signal_failed`, Workflow errors and executor/AWS DLQs. Native delivery
has a five-second minimum retry wake to avoid busy polling when all SQL slots are occupied.

## Notification readers

The scheduler publishes one read signal per provider each minute. Each handler reads at most ten SQS messages without
long polling; it deletes each message only after its application handler succeeds. A message that fails stays in its
queue for another try (and its dead-letter queue after five), the rest of the batch is still handled, and then the read
fails. A full batch schedules another read one second later. AWS clients receive explicit region and credentials because the Workers browser bundle has no Node
credential-provider chain. Configure `AWS_REGION`, `AWS_NOTIFICATION_ACCESS_KEY_ID`, `AWS_NOTIFICATION_SECRET_ACCESS_KEY` and optional `AWS_NOTIFICATION_SESSION_TOKEN`,
plus each enabled provider's `AMAZON_NOTIFICATIONS_QUEUE_URL`, `SHOPIFY_EVENTS_QUEUE_URL` or `EBAY_EVENTS_QUEUE_URL`.
Notification credentials are separate from the web EventBridge publisher credentials, preserving the existing IAM boundaries.
AWS EventBridge/SQS remains the provider notification transport; no Railway reader is required.

## Resources and releases

Terraform owns `copacker-executor-<environment>` and its `-dlq`. The application's `cloudflare.config.ts` owns its native
consumer and `copacker[-staging]-jobs` Workflow. The scheduler has only a queue binding and no database credentials:

- `* * * * *`: publish bounded AWS notification reads.
- `17 * * * *`: recover missed publications and abandoned leases.
- `0 7 * * *`: enqueue daily reconciliation.

The release deploys web, Storybook and Workflows from one tested commit, then the scheduler. Administrative Node tools
can publish using `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_JOBS_QUEUE_ID` (the **executor** queue ID) and a scoped
`CLOUDFLARE_JOBS_TOKEN`. Hosted Workers use native bindings. Preview Workers have only their isolated wake queue;
they have no executor trigger or Workflow binding and cannot execute staging or production work.

## Cutover and verification

Copy each environment's AWS reader settings and integration secrets before releasing. Stop its Railway worker, deploy
the tested Worker and scheduler, then publish a wake. Verify bounded work, Workflow completion, delayed retry, lease
recovery, downstream publication, document access and AWS consumption before removing obsolete Railway resources.
Inspect SQL failures and both providers' DLQs. Confirm old storage against the R2 transfer manifests before deletion.
Apply the reviewed Terraform removal of the unused HTTP-pull queues only after both environments have cut over.

PR CI runs `test:worker-jobs` against the exact application artifact and a disposable local PostgreSQL database.
It checks real Workflow execution, signed AWS SQS requests, queue jobs, downstream publication, duplicates, delayed
retry, lease recovery and database failure. Unit coverage also verifies sales checkpoints and SQS acknowledgement.
Deployed acceptance is recorded in [migration acceptance](specs/platform-migration/acceptance.md).
