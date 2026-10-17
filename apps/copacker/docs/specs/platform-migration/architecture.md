# Previous and current platform architecture

Part of the [migration specification](README.md). The first diagram captures the live state immediately before the
final web cutover on October 16, 2026. The second shows the deployed Cloudflare architecture.
It incorporates the separately completed Neon
and private R2 transfers; the original Railway-only database plan is superseded. The deployment checks and final
[acceptance record](acceptance.md) identify the deployed commits and verification evidence.

## State before the web cutover

Staging and production have separate databases, private buckets, queues and secrets. Their public application and
Storybook domains still route to Railway. TanStack Start is merged and the Cloudflare PR preview is deployed; the
existing Railway web deployments still run the previous Next.js artifacts.

```mermaid
flowchart LR
  users["Buyers, suppliers and forwarders"]
  subgraph cloudflare["Cloudflare"]
    edge["DNS, TLS and proxied application domains"]
    media["Public R2 media and CDN: media.copacker.ai"]
    preview["TanStack Start PR Worker and static assets"]
    previewStories["Shared preview Storybook asset Worker"]
    hyperdrive["Preview Hyperdrive: verified TLS, caching off"]
    privateFiles[("Private R2: separate staging and production buckets")]
    previewFiles[("PR app and Storybook prefixes in staging R2")]
    queue["Environment job wake queues and dead-letter queues"]
    turbo["Turbo remote cache: turbo.copacker.ai"]
  end
  subgraph railway["Railway: retained services"]
    web["Next.js web containers: pages, APIs, OAuth and private downloads"]
    stories["Static Storybook containers"]
    executor["Node background executor: three job slots and SQS readers"]
    recovery["Old Postgres and object store retained for recovery"]
  end
  subgraph neon["Neon Postgres"]
    database[("Separate staging and production branches: business data, jobs, leases and tokens")]
    branch[("Isolated PR database branch")]
    history["Restore history and frozen cutover recovery branches"]
  end
  subgraph providers["Retained providers"]
    identity["WorkOS: Google and Microsoft sign-in, sessions, feature flags"]
    commerce["Shopify, Amazon SP-API and Ads, eBay"]
    events["AWS EventBridge, SQS and dead-letter queues"]
    processing["Resend, OpenRouter, Langfuse and Frankfurter"]
    maps["Google Maps Places"]
    ci["GitHub Actions"]
  end
  users --> edge
  edge --> web
  users --> stories
  users --> media
  users --> maps
  users --> preview
  users --> previewStories
  previewStories --> previewFiles
  preview --> hyperdrive --> branch
  preview --> previewFiles
  preview --> identity
  web --> identity
  web --> database
  executor --> database
  web --> privateFiles
  executor --> privateFiles
  web --> commerce
  executor --> commerce
  commerce --> events --> executor
  web -->|"Verified eBay events"| events
  web -->|"Wake after commit"| queue
  queue -->|"HTTP pull and acknowledgement"| executor
  executor --> processing
  database --> history
  database -->|"Isolated copy for each trusted PR"| branch
  ci --> preview
  ci --> previewStories
  ci <--> turbo
```

Live evidence includes Railway service configuration, Cloudflare DNS and Hyperdrive readback, database migration
inventories and the verified storage manifests. Old Railway databases are recovery material, not an alternative
writable source of truth. The retained web and executor already use Neon and R2; no second database or file transfer
is required for the web runtime switch. WorkOS's shared staging identity environment remains intentional.

## Final state: Cloudflare web, jobs, files and CDN

Keep the same public application, Storybook and integration callback URLs. Each release builds web and Storybook from
one tested commit, applies any pending migrations through one direct Neon connection, and deploys Workflows and the scheduler from that commit. Application responses and private downloads remain authenticated and uncached.

```mermaid
flowchart LR
  users["Buyers, suppliers and forwarders"]
  subgraph cloudflare["Cloudflare: separate staging and production"]
    edge["Existing custom domains: DNS, TLS and CDN"]
    web["TanStack Start Worker: SSR, APIs, OAuth and authorized downloads"]
    assets["Workers Static Assets: application bundles"]
    stories["Assets-only Storybook Worker"]
    media["Existing public R2 media and CDN"]
    hyperdrive["Hyperdrive: verified TLS, query caching disabled"]
    files[("Private R2 documents, labels and imports")]
    boundedQueue["Native executor signals and DLQ"]
    bounded["Queue handler: bounded jobs and AWS notification batches"]
    executor["Workflows: imports, sales checkpoints, shipments, documents and email"]
    cron["Scheduled Worker: minute AWS reads, hourly recovery, daily reconciliation"]
    telemetry["Workers logs, traces and release health"]
  end
  subgraph neon["Neon"]
    database[("Postgres: business records, durable job ledger, leases and encrypted tokens")]
    history["Verified restore history and recovery branches"]
  end
  subgraph external["Retained integrations"]
    identity["WorkOS identity and sessions"]
    commerce["Shopify, Amazon SP-API and Ads, eBay"]
    events["AWS EventBridge, SQS and DLQs"]
    email["Resend transactional email"]
    imports["OpenRouter document extraction and Langfuse traces"]
    rates["Frankfurter exchange rates"]
    maps["Google Maps Places"]
  end
  users --> edge
  edge --> web
  edge --> assets
  edge --> stories
  users --> media
  users --> maps
  web --> identity
  web --> hyperdrive --> database
  web --> files
  web --> commerce
  web -->|"Commit job, then publish wake"| boundedQueue
  cron --> boundedQueue --> bounded --> hyperdrive
  bounded -->|"Dispatch SQL claim"| executor
  executor -->|"Wake after checkpoint or completion"| boundedQueue
  bounded --> commerce
  executor -->|"Claim, lease, retry and finish"| hyperdrive
  executor -->|"Native R2 binding"| files
  executor --> commerce
  executor --> email
  executor --> imports
  executor --> rates
  commerce --> events --> bounded
  web -->|"Verified eBay notifications"| events
  database --> history
  web --> telemetry
  cron --> telemetry
```

The SQL job ledger owns work and retries; queues carry delivery signals. Bounded jobs execute directly in the queue
handler; long jobs use Workflows. Both share three SQL slots and the same domain handlers. Sales progress checkpoints
create separate attempts, while active jobs heartbeat. The hourly signal recovers missed publication and abandoned
leases; daily reconciliation retains its job identity. Scheduled SQS reads do not query Neon when empty.
See [background-job contracts](../../background-jobs.md) for cutover and live acceptance requirements.

Private R2 has no public document origin. Downloads recheck workspace membership, document revision and release state.
The web and Workflow steps use native R2 bindings. Public
media keeps its existing CDN origin. Returning to an old object store after new writes requires a verified reverse
delta; changing an endpoint alone is insufficient.

Hyperdrive has separate configurations for staging, production and each PR, with query caching disabled and certificate
and hostname verification enabled. Migrations use a verified direct Neon endpoint with an advisory lock. Local administrative tools use an explicitly selected database connection. Request language is resolved before action transactions so a nested profile
lookup cannot exhaust the small connection pool. See [database operations](../../neon.md).

## Delivery, previews and recovery

```mermaid
flowchart LR
  change["Pull request"] --> checks["Format, lint, types, unused code, unit coverage, Storybook and browser journeys"]
  checks --> preview["PR Worker, isolated Neon branch and isolated R2 prefix"]
  preview --> qualify["Hosted functional and integrated-browser qualification"]
  qualify --> merge["Merge tested source"]
  merge --> staging["Serialized staging release: migrate, web, Workflows, Storybook and scheduler"]
  staging --> acceptance["Custom-domain, role, file, integration and job checks"]
  acceptance --> promote["Manual promotion of the exact tested staging commit"]
  promote --> production["Serialized production release and smoke checks"]
  production --> observe["Observe live behavior; keep previous origins and recovery data"]
  infra["Manual infrastructure plan"] --> review["Review saved plan and exact commit"]
  review --> apply["Apply that unexpired plan with unchanged state"]
  apply --> backup["Private R2 state backups before and after; verify bytes and restore readability"]
  scheduled["Six-hour state backup schedule"] --> backup
```

The GitHub plan does not support required reviewers for this private repository. Manual dispatch with an explicit
commit and saved-plan checks supplies the current approval mechanism. See [infrastructure operations](../../infrastructure.md)
and [release procedure](../../cloudflare.md). Terraform state backups are not database or document backups.

PR previews copy staging into an isolated Neon branch, use a private R2 prefix and receive no merchant integration
secrets. They have no background executor. Their static Storybook files are served through an assets-only Worker per PR. Preview expiration and closed-PR cleanup are independent of production retention.

Production acceptance includes existing sessions, role boundaries, authorized and unauthorized file access, immutable
file checksums, current provider callbacks, queue delivery, and matching web/Storybook commit metadata. Observe at least
one daily reconciliation cycle before retiring recovery services. Restore history and frozen recovery branches have
explicit expiry; record their actual retention in the release evidence.

## Background execution boundary

Cloudflare Queues executes bounded jobs and dispatches longer jobs to Workflows. Sales imports checkpoint each
14-day period and each follow-up operation. SQL retains job status, leases, retries and domain idempotency; native R2
serves documents in both web requests and Workflow steps. The scheduler reads AWS notification queues in bounded
batches. AWS EventBridge/SQS remains the external transport, with the existing reader credentials and permissions.

No D1, KV, Durable Object or separately hosted Node processor is required. Local development still runs a Node worker
against local Postgres. Deployed verification and Railway retirement are recorded in [acceptance](acceptance.md).

Sources: [runtime entry](../../../src/server.ts), [database context](../../../src/db/index.ts),
[private storage](../../../src/server/storage.ts), [document authorization](../../../src/server/http/api/documents/$id.ts),
[executor](../../../src/server/worker.ts), [job delivery](../../../src/server/job-delivery.ts),
[release workflow](../../../../../.github/workflows/release.yml), [preview lifecycle](../../neon.md#pr-previews),
[domain inventory](../../domains.md), and [cutover and recovery](cutover.md).
