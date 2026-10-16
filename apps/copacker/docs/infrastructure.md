# Copacker infrastructure ownership

Terraform configuration lives in `apps/copacker/infra`. Terraform 1.16.6 and Cloudflare provider 5.28.0 are pinned.
Staging and production have separate root modules and state keys. They share one small module.

## First adoption

This PR adopts each environment's existing private document bucket and two queues. Declarative import blocks identify
the exact resources. The first plan must show three imports and **zero creates, updates or deletes** per environment.
Stop and investigate any other result. `prevent_destroy` protects buckets and queues while their resource blocks exist;
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
infrastructure. An operator reviews and applies the saved plan after backend/locking qualification. Automatic applies
and drift repair are not enabled until that adoption succeeds. App deploys currently do not run Terraform.

## Resource tags

These tags were written and read back on October 16, 2026, preserving existing tags with an ETag-checked update:

| Resource | Environment | Component | Lifecycle |
| --- | --- | --- | --- |
| `copacker-staging-private` | staging | documents | persistent |
| `copacker-production-private` | production | documents | persistent |
| `copacker-media` | production | marketing | persistent |
| `copacker-staging` | staging | web | persistent |
| `copacker-stories-staging` | staging | storybook | persistent |
| `copacker-preview-assets` | preview | storybook | shared |
| `copacker-scheduler-staging` | staging | scheduler | persistent |
| `copacker-scheduler-production` | production | scheduler | persistent |
| `copacker-start-compatibility` | staging | qualification | temporary |
| `copacker-jobs-staging` and `copacker-jobs-production` | respective environment | jobs | persistent |
| Both `-dlq` queues | respective environment | dead-letter | persistent |

Every resource also has `app=copacker`. The production document bucket was created empty and private on that date;
its existence does not mean production documents have moved. Both private buckets' r2.dev access was verified disabled.

Cloudflare's current Terraform provider does not expose the generic Resource Tagging API. Manage these tags through
`cf account-tags get` followed by a merged `cf account-tags update --if-match <etag> --body @file.json`, then read them
back. Never replace someone else's tags. Hyperdrive is not currently a supported generic tag resource. Preview folders
are object prefixes, not independent taggable resources. Per-PR Worker/Queue tagging still needs Tag Write on the preview
CI token before it can be automated; current cleanup relies on exact resource names and PR ownership, not tags.

## Cutover and retirement status

PR 21 merged as `89e034cc012e8f9a0bf4e20f95df29b51207285b`; its merge-triggered preview cleanup succeeded.
The shared preview Storybook server was rehearsed with 797 files, including browser acceptance and repeated cleanup.
The rehearsal namespace was removed and unrelated staging objects preserved.

Document cutover remains pending bucket-scoped Node credentials, final checksum reconciliation, coordinated writer
switching and deployed access checks. Hosted preview and release configuration remain gated. Retain Railway web,
Storybook and document storage until the replacement is verified and its observation/recovery gates pass. The Railway
Node executor remains required. Delete only verified obsolete resources, including the stale `pr-999999` bucket after
confirming it has no dependencies. Follow [the cutover runbook](specs/platform-migration/cutover.md) for the actual switch.

References: [Cloudflare R2 backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/),
[resource tags](https://developers.cloudflare.com/resource-tagging/how-to/manage-tags/),
[provider resources](https://github.com/cloudflare/terraform-provider-cloudflare/tree/v5.28.0/docs/resources).
