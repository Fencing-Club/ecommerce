# CLI server

The server implements interactive CLI authentication and eleven operations against Copacker's database.
It is not the entire planned command inventory. Discovery publishes only implemented, authorized handlers.

## Available operations

- `account.show`, `workspace.list`, `workspace.show`
- `schema.list`, `schema.show`
- `connection.list`, `connection.show`
- `connection.settings.show`, `connection.settings.update`
- `restock.channel.list`, `report.restock` ([report behavior and current boundaries](cli-restock.md))

Connections include saved Shopify, Amazon, eBay and Amazon Ads accounts. Reads omit provider credentials and do not
probe providers. `authorization_unchecked` distinguishes a saved connection from freshly verified provider access.
Order, stock and financial sync metadata comes from stored acquisition state, filtered by existing page/price grants.
The source metadata describes these Copacker records; it does not claim the underlying provider data is fresh.
Ads acquisition details and additional resource handlers remain unimplemented.

Settings require a current buyer owner/admin. Shopify's excluded order tags use the same service as Settings in the
web app. The settings revision advances for both browser and CLI writes. Other providers expose no editable settings.
An update requires `expectedRevision` and `Idempotency-Key`. The change and receipt commit together. The same key/input
replays the original result; changed input conflicts. Receipts reject re-execution after seven days rather than issuing
a fresh write. Failed transactions roll back their receipts. This first mutation has no provider or email effects.

## Authentication

`copacker-marketplaces` handles provider OAuth. It does not authenticate Copacker CLI callers. Browser approval reuses
Copacker's WorkOS sign-in, while CLI access has separate database grants and opaque tokens:

1. `/api/cli/authorize` validates the fixed public client, S256 challenge and exact IPv4 loopback callback, then opens
   `/cli/authorize`. Signed-out visitors return there after normal sign-in.
2. The approval page creates a ten-minute intent bound to the signed-in user, state, redirect and challenge. Only an
   explicit same-origin POST to `/api/cli/consent` approves it. Denial issues no code. Approval produces a five-minute,
   single-use code.
3. `/api/cli/token` exchanges the code and verifier for a fifteen-minute access token and rotating refresh token.
   The grant has a fixed thirty-day lifetime. Refresh replay revokes its entire family, including previously issued
   access tokens. Only hashes are stored. `/api/cli/revoke` revokes the grant from either token and is idempotent.
4. Bearer requests verify the token and resolve the current WorkOS user, then resolve the explicit workspace through
   current database memberships. They never use the browser's workspace cookie. Removed memberships and reduced roles
   take effect on the next request. Writes also lock/recheck the grant and membership inside their transaction.

Token/revoke/operation routes are narrowly exempted from browser CSRF middleware because they authenticate independently.
They reject browser cookies, Origin and Fetch Metadata headers; token forms also reject Authorization headers.
Browser consent remains protected by both the middleware and its own exact-origin check. No CORS access is enabled.
Token and operation responses are private/no-store; errors never include provider failures, credentials or request bodies.

The client serializes refresh, credential replacement and logout per local profile across processes. A crashed process
can leave a `.lock` file in its protected credentials directory. A timeout identifies that file; remove it only after
confirming no Copacker process is still using the profile. Locks are not stolen on a timer, which could reuse a refresh token.

This follows native-app [loopback/PKCE guidance](https://www.rfc-editor.org/rfc/rfc8252.html) and
[refresh replay guidance](https://www.rfc-editor.org/rfc/rfc9700.html). It is not hosted MCP authorization.
Automation credentials and one-use secret delivery remain unavailable, including in discovery.

## Run after deployment

Release the generated forward schema change through the existing CI migration gate, then deploy the application.
No migration was applied during development. The existing WorkOS and token-encryption configuration is reused;
no new marketplace credential is needed. The local loopback callback is to Copacker's CLI authorization endpoint,
not an additional WorkOS redirect URL.

```sh
copacker login
copacker workspace list --json
copacker workspace use <workspace-id>
copacker schema list --workspace <workspace-id> --json
copacker connection list --workspace <workspace-id> --json
copacker connection settings show <connection-id> --workspace <workspace-id> --json
copacker connection settings update --workspace <workspace-id> --input reviewed-settings.json --json
```

The settings input contains `id`, `expectedRevision` and
`settings: {"provider":"shopify","excludedOrderTags":["Amazon","eBay"]}`. The CLI retains an execution key.
Use `COPACKER_API_URL` for another trusted deployment. Never place access tokens in command arguments.

Tests build the schema directly from `src/db/schema.ts`. They exercise consent/PKCE, expiry, rotation/replay,
revocation, credential separation, live membership checks, redaction, cursor binding, guarded changes, rollback,
idempotency and the actual shared client's schema discovery and result validation. Provider/WorkOS network calls
are mocked; signing in against a deployed WorkOS environment still needs release acceptance.
