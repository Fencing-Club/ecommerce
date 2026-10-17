# Copacker infrastructure ownership

Terraform configuration lives in `apps/copacker/infra`. Terraform 1.16.6 and Cloudflare provider 5.28.0 are pinned.
Staging and production have separate root modules and state keys. They share one small module.

## First adoption

Terraform owns each environment's existing private document bucket and two queues. Declarative import blocks identify
the exact resources. The original adoption required three Cloudflare imports and **zero Cloudflare creates, updates or deletes** per environment,
plus one local `terraform_data.tags` creation that reconciles resource tags through the pinned `cf` CLI.
That adoption is complete; subsequent reviewed operations are recorded in [cutover acceptance](specs/platform-migration/acceptance.md).
`prevent_destroy` protects buckets and queues while their resource blocks exist;
removing a block also removes that protection, so review plans even for apparently small edits.

The configuration does not yet own queue consumers, Hyperdrive, DNS, Workers, Neon, runtime secrets or preview resources.
Worker builds and bindings stay with `cf` and the release workflows; PR resources stay with the preview lifecycle scripts.
Existing HTTP consumers cannot be imported by Cloudflare provider 5.28.0. Do not recreate them merely to get them into state.
Hyperdrive adoption follows the document/web cutover, when production's origin and credentials have been established.
Never let both a provisioning script and Terraform own the same resource.

Deleting a bucket outside Terraform loses its objects. Recreating the bucket does not restore data, consumers, tokens,
bindings or application health. This first adoption is not complete disaster recovery.

## State and credentials

Before the first state-writing operation, provision a dedicated private R2 state bucket, outside this module's lifecycle.
Do not use the document/preview bucket for state. Supply its name at initialization; state keys are fixed per environment.
Use a separate bucket-scoped Object Read & Write credential through `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
These environment-variable names belong to Terraform's S3-compatible backend; no AWS account or console is needed.
The Cloudflare provider reads a separately scoped `CLOUDFLARE_API_TOKEN` with R2 Storage and Queues read/write permissions.
Keep all credentials out of checked-in files, backend arguments and logs.

The same provider token also needs Tag Read and Tag Write. Install repository dependencies with `pnpm install --frozen-lockfile`
and use the repository's Node version before applying; Terraform's tag reconciler uses the pinned CLI and `tsx`.

From the selected environment directory:

```sh
terraform init -input=false \
  -backend-config="bucket=$TF_STATE_BUCKET" \
  -backend-config='endpoints={s3="https://544b5bfd594cd02a5da4b79a2038cc9f.r2.cloudflarestorage.com"}'
terraform plan -out=change.tfplan
terraform apply change.tfplan
```

The backend requires lock files. Before adoption, prove that a second concurrent operation is rejected while the first
holds the lock. Do not disable locking to bypass an incompatible backend or an unexplained lock. Confirm secure state
backup/recovery separately; R2 state storage is not a state history policy. Never upload plan/state files as public CI
artifacts: future resources may contain sensitive values. Ignore rules are configured at repository root.

PR CI runs formatting, initialization without a backend and schema validation without credentials. It never applies
infrastructure. App deploys do not run Terraform.

## Reviewed operations and automatic backups

The **Terraform operations** workflow runs only from `main`. Its `infrastructure` GitHub environment holds
`TF_STATE_CREDENTIALS` (the existing bucket-scoped S3 JSON) and a scoped `CLOUDFLARE_API_TOKEN`. It uses the private
`copacker-terraform-state` bucket and the existing state keys. GitHub concurrency serializes each environment, and
Terraform's backend lock also protects against another operator. Neither lock is disabled.

1. Manually run `plan` for staging or production. Review the resource-action summary and download the full
   `plans/<environment>/<run>/<attempt>/review.txt` from private R2. The saved binary plan stays beside it.
2. Manually run `apply`, supplying that planning run ID, attempt and exact SHA-256 from the reviewed plan. The runner
   rejects a different environment, source commit, changed state, modified plan, future timestamp or plan older than
   two hours. A new `main` commit therefore requires a new plan. It applies that saved artifact without re-planning.
3. Each operation first backs up state; every apply, including a failed partial apply, also backs up the resulting
   state. A six-hour schedule backs up both environments independently of infrastructure changes.

Each backup gets a unique timestamp/UUID key under `backups/<state-key>/`, is downloaded and byte-verified, and is
read by `terraform show` from an isolated local file. This tests recovery readability without restoring over live state.
Backup history has no automatic deletion policy yet; it is not immutable storage or a backup of document contents.
For disaster recovery, first stop applies, review the selected snapshot and compare its lineage/serial with the live
state. Restoring an older state can forget real resources; restoration remains a separately reviewed operator action.

The private repository's current GitHub billing plan does not support required environment reviewers. The accepted
approval mechanism is an explicit manual workflow dispatch with the exact saved plan hash. This is an operator
confirmation, not an independent reviewer or separation-of-duties control. Scheduled runs only back up; they never
apply changes or repair drift. Keep workflow/secret administration limited to trusted maintainers.

Provider diagnostics, full plans and state values never enter Actions artifacts or job output. The private operation
log is `operations/<environment>/<run>/<attempt>/terraform.log`. A failed verification fails the workflow; inspect
that private log and re-plan when needed. No automatic restore, force unlock, retry of an apply, or destructive cleanup
is performed.

## Resource tags

These tags were written and read back on October 16, 2026, preserving existing tags with an ETag-checked update:

| Resource | Environment | Component | Lifecycle |
| --- | --- | --- | --- |
| `copacker-staging-private` | staging | documents | persistent |
| `copacker-production-private` | production | documents | persistent |
| `copacker-media` | production | marketing | persistent |
| `copacker-staging` | staging | web | persistent |
| `copacker-stories-staging` | staging | storybook | persistent |
| `copacker-stories-pr-<number>` | preview | storybook | ephemeral |
| `copacker-scheduler-staging` | staging | scheduler | persistent |
| `copacker-scheduler-production` | production | scheduler | persistent |
| `copacker-start-compatibility` | staging | qualification | temporary |
| `copacker-jobs-staging` and `copacker-jobs-production` | respective environment | jobs | persistent |
| Both `-dlq` queues | respective environment | dead-letter | persistent |

Every resource also has `app=copacker`. The production document bucket was created private on that date.
Both private buckets' r2.dev access was verified disabled.

Cloudflare's current Terraform provider does not expose the generic Resource Tagging API. Terraform owns the desired tags
for its buckets and queues through `terraform_data.tags`, invoking the shared reconciler on every apply. Its planned local
replacement is expected, does not replace Cloudflare resources, and has no destroy provisioner. This repairs tag drift on
apply; tag drift is not visible during plan. Read/merge/ETag-checked updates preserve unrelated tags and readback verifies
success. Failed reads, concurrent edits or failed verification fail the apply; retry after resolving the cause. The token
stays in the process environment, outside state and command arguments. Other persistent resources retain their current
owners and tags. Native provider support should replace this adapter when available.

Preview deployment uses the same reconciler for both its app and Storybook Workers and its Queue before reporting success.
It sets `app=copacker`, `environment=preview`, `lifecycle=ephemeral`, `pr=<number>`, and `component=web` or `jobs` on every
deployment. The preview token must have Tag Read and Tag Write; failures block successful publication rather than silently
skipping tags. Hyperdrive is not a supported generic tag resource and folders are object prefixes, not taggable resources.
Cleanup continues to rely on exact resource names and verified PR ownership, never on mutable tags.

## Cutover and retirement status

PR 21 merged as `89e034cc012e8f9a0bf4e20f95df29b51207285b`; its merge-triggered preview cleanup succeeded.
The shared preview Storybook server was rehearsed with 797 files, including browser acceptance and repeated cleanup.
The rehearsal namespace was removed and unrelated staging objects preserved.

Document storage switched to R2 on October 16, 2026. Writers were stopped for the final reconciliation. Staging copied
and verified 30 objects (103,331 bytes); production copied and independently verified 1,116 objects (234,313,194 bytes).
Every referenced key was present and every copied object's bytes and content type matched. Existing target-only staging
objects were preserved. Both environments' retained Railway web and Node executor use bucket-scoped R2 credentials, also saved
in their GitHub environment secrets as `R2_DOCUMENTS_CREDENTIALS`. Production services restarted successfully and its
public health endpoint returned HTTP 200.

Staging authenticated HTTP checks verified an existing document checksum, denied signed-out and unauthorized access,
and uploaded/downloaded a new test product label through R2. That test label remains in staging. The final hosted
qualification also passed 145 browser tests on preview and staging. Production retained the existing signed-in browser
session, loaded and searched its real products, and downloaded the existing PO36 PDF through the Cloudflare Worker;
its bytes exactly matched the pre-cutover checksum. No production test accounts or test documents were created.

Recovery branches `recovery-staging-r2-20261016` and `recovery-production-r2-20261016` preserve the database at the writer
pause, without compute, until October 23, 2026 at 21:00 UTC. Original Railway document objects remain for recovery.
New R2 writes mean rollback requires reconciling the object delta, not merely restoring old endpoint variables.
Staging's old pre-deploy seed command was disabled during the restart; keep migrations under the serialized release
runner and do not re-enable automatic reseeding. Unrelated staged WorkOS settings were left untouched.

Hosted preview and release configuration are enabled. The Railway Node executor remains required; previous web and
Storybook artifacts and original document storage remain recovery material through the observation window.
The user deferred deletion of the unprovisioned `pr-999999` bucket until final Railway retirement.
Follow [the cutover runbook](specs/platform-migration/cutover.md) for recovery and retirement. The
[acceptance record](specs/platform-migration/acceptance.md) links the successful saved-plan applies and verified state
backups for both environments and records the release's remaining limits.

References: [Cloudflare R2 backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/),
[resource tags](https://developers.cloudflare.com/resource-tagging/how-to/manage-tags/),
[provider resources](https://github.com/cloudflare/terraform-provider-cloudflare/tree/v5.28.0/docs/resources).
