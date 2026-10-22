# Automation credential lifecycle

This contract covers Copacker credentials for scripts and CI. It adds no provider-token passthrough. Interactive users
continue to use top-level `login` and `logout`; hosted MCP uses its resource-bound authorization flow. All credential
management described here is proposed work, including the equivalent workspace Settings UI.

## Identity and authority

An automation credential belongs to one workspace and the issuing user's stable principal ID. It has explicit scopes,
a name, expiry and a credential ID independent of its secret/generation. The issuing user must be a current owner/admin
using an interactive authenticated session. The credential cannot create, rotate or extend itself, and it cannot mint
other credentials. A removed/disabled principal immediately loses access; role/page/price changes reduce its effective
access on every request. No implicit service-account or new permission system is introduced in this release.

Creation requires a nonempty scope subset supported by that workspace. There is no wildcard scope and no default
“full access.” Data reads and writes use [the existing scope intersection](contract.md#authentication-and-authorization).
Scopes are immutable: narrowing/broadening creates a replacement credential after review. Rotation changes its secret,
not its scopes, principal or workspace. A replacement is required after expiry; there is no silent renewal.

Proposed lifetime: explicit `expiresAt`, at least one hour and at most 90 days after creation. CLI `--expires-in 30d`
computes that timestamp and shows it in the receipt. The server stores a verifier/hash of the bearer secret, not reusable
plaintext in the durable authentication record. The one-use delivery payload is encrypted, retained only for its
10-minute handoff lifetime and destroyed on consumption/expiry. Returned metadata includes `expiresAt`, `lastUsedAt`
and effective scope restrictions so expiry is visible
before unattended work fails. Ordinary requests using an expired/revoked credential fail with 401, never start login.

## Commands and schemas

All commands below require `--workspace`; their HTTP bodies use the same explicit context. `account credential` belongs
to account administration, not the business MCP tool catalog. The CLI and Settings UI call the same authorized handlers.
No secret is returned in JSON envelopes, normal stdout, logs, account detail or MCP content.

`Credential = {id, revision, name, workspaceId, principalId, scopes:string[], createdAt, expiresAt,
lastUsedAt:Instant|null, state:"pending_delivery" | "active" | "expired" | "revoked",
generation:integer, previousGenerationExpiresAt:Instant|null, pendingDeliveryExpiresAt:Instant|null}`.
Scope strings are the closed deployed scope enum. IDs/revisions/timestamps use [shared types](operations/shared.md).

| Operation and CLI | Input | Result data | Access, effects and specific errors |
| --- | --- | --- | --- |
| `account.credential.list` / `account credential list` | `PageInput & {state?:Credential.state}` | `Page<Credential>` sorted createdAt descending | Interactive admin; metadata only. |
| `account.credential.show` / `account credential show <id>` | `{id}` | `Credential` | Interactive admin; metadata only. |
| `account.credential.create` / `account credential create` | `{name:Text<100>, scopes:string[1..50], expiresAt:Instant}` | `{credential:Credential, delivery:SecretDelivery}` | Interactive admin; persists pending credential. `invalid_scope`, `invalid_expiry`. |
| `account.credential.rotate` / `account credential rotate <id>` | `Guard & {overlapSeconds?:integer 0..900 = 900}` | `{credential:Credential, delivery:SecretDelivery}` | Interactive admin; stages next generation. `credential_expired`, `rotation_pending`, `revision_conflict`. |
| `account.credential.revoke` / `account credential revoke <id>` | `Guard & {reason?:Text<255>}` | `{credential:Credential}` in revoked state | Interactive admin; revokes all generations and pending delivery. CLI requires `--yes` noninteractively. |

Create/rotate/revoke require idempotency keys. Repeating a completed revoke returns the same revoked receipt; a different
mutation with a stale revision conflicts. Listing/showing other users' credentials is admin-only, but secrets are never
recoverable through those reads. Operations use common auth/not-found/input errors; expiry/rotation-state failures use
409/CLI exit 5. Credential management is absent from automation-token capabilities even if the issuer is an admin.

## Protected secret delivery

`SecretDelivery = {id:Id, expiresAt:Instant, state:"available" | "consumed" | "expired",
download:{url:string,authentication:"interactive_required"}}`. It is bound to the exact actor, workspace, credential
generation and issuance intent; its reference is not a bearer credential. It expires after 10 minutes. This is the
credential operation's internal delivery, not a generic file resource or business attachment.

Create/rotate must select one local sink: `--store-as <profile-name>` for the operating-system credential store, or
`--secret-file <absolute-path>` for transfer into the user's CI secret manager. These flags are mutually exclusive and
are not domain fields. The CLI verifies the sink is available before requesting issuance. Secret files are created
without overwrite and restricted to the current OS user (owner-only permissions/ACL); failure to establish protection
aborts delivery. Normal `--output` never writes a credential. The JSON receipt reports only the credential metadata and
whether protected delivery completed. The Settings UI offers the equivalent authenticated secret-manager/download handoff.

The secret is transferred once over the authenticated delivery route; it is never reprinted from a saved operation
receipt. Activation occurs when that transfer consumes the handoff. A lost transfer response can therefore leave an
active secret the client did not store. Rerunning create with the original key returns the same credential and delivery
state, never a second credential. If still available, resume delivery; if consumed but locally missing, rotate or revoke
using the interactive session. Do not return the secret again from idempotency storage.

An unconsumed create expires without an active token. An unconsumed rotation expires without changing the old generation.
Only one rotation can be pending. Consuming a rotation activates the new generation and sets the old generation's
deadline to the earlier of `now + overlapSeconds` or the credential's original expiry. Metadata exposes that deadline.
Use the overlap to install and check the new CI secret; it does not extend the credential lifetime. Revoke ends all
generations immediately. A delivery failure reports its credential ID and recovery action, never the secret bytes.

## From an empty machine to an unattended command

On an administrator's trusted machine:

```sh
copacker login
copacker workspace list --json
copacker account credential create --workspace <workspace-id> --name restock-ci --scope reports:read --expires-in 30d --secret-file <absolute-protected-path> --json
```

The administrator transfers that file's contents through the CI platform's protected-secret interface. Configure
`COPACKER_TOKEN` from that secret and `COPACKER_WORKSPACE` as the non-secret workspace ID. No browser or interactive
profile is needed on the runner:

```sh
copacker account show --json
copacker workspace show --json
copacker report restock --json
```

`account show` reveals authentication kind, principal, credential ID, expiry and effective scopes, never token values.
With `COPACKER_TOKEN` set, use that credential instead of stored interactive credentials; an explicit conflicting
`--profile` fails locally rather than guessing. The client sends exactly one authentication method.
`workspace show` validates the explicit workspace against the credential binding. Its discovery metadata remains
available to any valid credential for its bound workspace; business data still needs its own scope. This example
returns unpriced restock data. Add `prices:read` explicitly when monetary values are required, and purchasing scopes
only when the automation is meant to create/send POs.

Rotate from the interactive administrator session, install the new secret, verify `account show` and one permitted
read on the runner, and let the displayed overlap expire. For suspected disclosure, revoke immediately and issue a
replacement. `logout` clears/revokes the interactive login grant; it does not silently revoke every automation
credential or erase a process's externally supplied `COPACKER_TOKEN`.

Revocation stops future requests and workers recheck authority before each dispatch. Already dispatched provider work
may still complete; it remains attributed to its original execution. A newly authenticated credential for the same
principal/workspace can read/resume permitted receipts under the normal idempotency rules. Rotation never changes an
operation's identity or causes a confirmed business write to run again.
