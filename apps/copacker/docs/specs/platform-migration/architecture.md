# Current and proposed platform architecture

Part of the [migration specification](README.md). The first diagram captures the live state immediately before the
final web cutover on October 16, 2026. The second is the release target. It incorporates the separately completed Neon
and private R2 transfers; the original Railway-only database plan is superseded. The deployment checks and final
acceptance record determine whether a target has been activated.

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

## Release target: Cloudflare web, files and CDN

Keep the same public application, Storybook and integration callback URLs. Each release builds web and Storybook from
one tested commit, applies any pending migrations through one direct Neon connection, and deploys the retained Node
executor from that commit. Application responses and private downloads remain authenticated and uncached.

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
    queues["Queues: wake and reconcile messages, retries and DLQ"]
    cron["Scheduled Worker: hourly recovery and daily reconciliation"]
    telemetry["Workers logs, traces and release health"]
  end
  subgraph neon["Neon"]
    database[("Postgres: business records, durable job ledger, leases and encrypted tokens")]
    history["Verified restore history and recovery branches"]
  end
  subgraph railway["Retained execution and recovery"]
    executor["Node executor: claims SQL jobs, processes files and polls providers"]
    oldOrigins["Previous web and Storybook artifacts retained for rollback"]
    oldStorage["Previous storage retained through observation"]
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
  web -->|"Commit job, then publish wake"| queues
  cron --> queues
  queues -->|"HTTP pull"| executor
  executor -->|"Claim, lease, retry and finish"| database
  executor -->|"Scoped S3 credentials"| files
  executor --> commerce
  executor --> email
  executor --> imports
  executor --> rates
  commerce --> events --> executor
  web -->|"Verified eBay notifications"| events
  database --> history
  web --> telemetry
  cron --> telemetry
```

The SQL job ledger owns work and retries; queue messages are delivery signals. Only the Railway executor claims jobs.
Startup recovery and hourly wake signals cover missed publication; reconciliation retains its daily identity. This
release does not introduce a second executor or move live shipment creation into a new retry model. See
[background-job contracts](../../background-jobs.md).

Private R2 has no public document origin. Downloads recheck workspace membership, document revision and release state.
The web uses native R2 bindings; the retained executor uses credentials limited to its environment's bucket. Public
media keeps its existing CDN origin. Returning to an old object store after new writes requires a verified reverse
delta; changing an endpoint alone is insufficient.

Hyperdrive has separate configurations for staging, production and each PR, with query caching disabled and certificate
and hostname verification enabled. Migrations use a verified direct Neon endpoint with an advisory lock. The Node
executor uses Neon's pooled endpoint. Request language is resolved before action transactions so a nested profile
lookup cannot exhaust the small connection pool. See [database operations](../../neon.md).

## Delivery, previews and recovery

```mermaid
flowchart LR
  change["Pull request"] --> checks["Format, lint, types, unused code, unit coverage, Storybook and browser journeys"]
  checks --> preview["PR Worker, isolated Neon branch and isolated R2 prefix"]
  preview --> qualify["Hosted functional and integrated-browser qualification"]
  qualify --> merge["Merge tested source"]
  merge --> staging["Serialized staging release: migrate, web, Storybook, executor and scheduler"]
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
secrets. They have no background executor. Their static Storybook files are served through the shared preview asset
Worker. Preview expiration and closed-PR cleanup are independent of production retention.

Production acceptance includes existing sessions, role boundaries, authorized and unauthorized file access, immutable
file checksums, current provider callbacks, queue delivery, and matching web/Storybook commit metadata. Observe at least
one daily reconciliation cycle before retiring recovery services. Restore history and frozen recovery branches have
explicit expiry; record their actual retention in the release evidence.

## Later background execution migration

Moving the remaining Node executor to Cloudflare is a separate milestone. Short bounded jobs can move to Queue
consumers; long syncs, report polling and shipment preparation need durable Workflow checkpoints. Preserve provider
idempotency, SQL leases, ownership fencing, delayed retries and recovery of ambiguous external creates. Keep AWS
notification transport until a separately verified bridge replaces the current SQS readers. Any file workload that
fails Workers runtime limits needs an explicit processing exception.

The final executor migration requires one owner per job family and duplicate-delivery, restart and rollback drills.
Until those gates pass, Railway remains part of the deployed architecture. No D1, KV or Durable Object is required for
this web release.

Sources: [runtime entry](../../../src/server.ts), [database context](../../../src/db/index.ts),
[private storage](../../../src/server/storage.ts), [document authorization](../../../src/server/http/api/documents/$id.ts),
[executor](../../../src/server/worker.ts), [job delivery](../../../src/server/job-delivery.ts),
[release workflow](../../../../../.github/workflows/release.yml), [preview lifecycle](../../neon.md#pr-previews),
[domain inventory](../../domains.md), and [cutover and recovery](cutover.md).
