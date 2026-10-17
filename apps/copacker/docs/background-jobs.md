# Background jobs

Postgres stores job payloads, status, idempotency keys and leases. Cloudflare Queues carries only wake-up signals;
credentials and customer records never enter the queue. The existing Railway Node worker executes the handlers,
including long imports. AWS queues remain isolated readers for the marketplace integrations that currently use them.

Job producers wrap their insert or entire transaction in `withJobWake`. The signal is published after commit, never
inside a transaction. A publication failure is logged without failing an already committed customer action. New job
producers must use the same boundary, including manual retries. The hourly recovery signal covers a process crash
between commit and publication; work can be delayed by up to an hour in that failure case.

Three independent signal readers share a global limit of three executing jobs, so a long import cannot block free
slots from handling new signals. Existing Postgres row locks, job keys and attempt leases
handle duplicate delivery. The worker then reads the earliest pending job or lease expiry once and publishes a delayed
signal. The signal is acknowledged only after draining and scheduling succeed. Cloudflare delivery is at least once;
handlers must retain their existing idempotency checks. Long batches can outlive the signal's ten-minute visibility
lease, causing harmless duplicate signals rather than loss of the durable jobs.

Empty Cloudflare HTTP pulls wait five seconds before the next pull and never query Postgres. This is queue polling,
not a permanently open database listener. Local development without queue settings retains the Docker polling loop;
a production worker refuses to start without a queue ID. Active jobs and user traffic still consume database compute.

## Resources and configuration

Provision separate `copacker-jobs-staging` and `copacker-jobs-production` Cloudflare queues, each with an HTTP pull
consumer. Use `cf queues create` and `cf queues consumers create` after checking their current schemas. Configure a
dead-letter queue for each consumer and monitor it, plus `job_signal_failed` application logs. Do not share queues
between environments or provide these credentials to PR previews.

The web Worker publishes through its invocation-scoped native `JOBS` binding. It has no queue API token. The local
web emulator suppresses hosted wake signals; its local Node worker uses database polling. Set these secrets/settings
on the retained Node worker in each deployed environment:

- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `CLOUDFLARE_JOBS_QUEUE_ID`: that environment's queue ID.
- `CLOUDFLARE_JOBS_TOKEN`: an account-scoped API token with Queues Read and Write permissions.

The `scheduler/` workspace uses the official `cf` CLI and Vite plugin. Its configuration derives the Worker and queue
names from the required `COPACKER_ENVIRONMENT` (`staging` or `production`). The scheduler has only a queue binding,
no database credentials and no public HTTP handler. Logs and traces are enabled. Its UTC schedules are:

- `17 * * * *`: recover missed publications and abandoned jobs.
- `0 7 * * *`: daily reconciliation of marketplace subscriptions, orders, stock and ads.

From the repository root, set `COPACKER_ENVIRONMENT`, then run
`pnpm --filter copacker-scheduler exec cf deploy --dry-run` to validate and `pnpm --filter copacker-scheduler exec cf deploy`
to deploy. The release workflow deploys it after the retained executor, using the protected environment's
`CLOUDFLARE_API_TOKEN` with Worker deployment and queue binding permissions.
Runtime queue credentials should be separate from that deployment token.

## Acceptance before cutover

Provision queues and credentials before deploying the new worker. Verify a newly queued job, a delayed retry, a worker
restart, a failed publication recovered by the hourly signal, and daily reconciliation in staging. Confirm an empty
worker produces no recurring Postgres activity and Neon suspends after its configured idle period. Only then deploy
production and retire the Railway databases using the [migration checklist](neon.md).
