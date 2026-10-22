# Copacker API client

`@repo/copacker-client` implements the proposed Copacker operation transport. It depends on the portable contract,
Zod and Web APIs; it does not import provider SDKs, PDF generators, the database or the web framework.

```ts
import { CopackerClient } from "@repo/copacker-client"

const client = new CopackerClient({
  baseUrl: "https://copacker.ai",
  token: process.env.COPACKER_TOKEN!,
  workspaceId: process.env.COPACKER_WORKSPACE
})
const result = await client.call("report.restock", {})
```

This requires the operation API; it does not work against today's browser-only routes. `describe` reads the deployed
schema. `call` validates input and output, requires a compatible contract, and requires an explicit execution key for
mutations. `all` checks page consistency and preserves coverage. `wait` follows the entity's validated read selector.
Errors expose the shared sanitized envelope and HTTP status through `CopackerError`.

Requests send exactly one bearer credential, no browser cookies or forged Origin. Workspace context is explicit.
Transport retries keep the original key and body; only queries or declared idempotent mutations can retry transient
transport/429/502/503 failures. Business conflicts, unknown outcomes and partial writes are returned for review.
Redirects are refused, and authenticated artifact transfers cannot leave the configured origin.

## Server integration boundary

The application must implement:

- `POST /api/operations/<name>` with `{workspaceId?, input}`, shared envelopes, live membership/scope checks and the
  operation-specific Zod schemas. `schema.show` and `schema.list` publish only registered, authorized capabilities.
- Account-context schema discovery: `schema.show` for `account.show` and `workspace.list` must work without an active
  workspace. Other schema discovery and business operations require the explicit workspace. This allows bootstrap.
- `GET /api/cli/authorize`: public client `copacker-cli`, authorization code with S256 PKCE, exact loopback redirect,
  preserved state, authenticated browser consent and a short-lived single-use code. Do not grant a token from a GET
  request without user consent. Loopback callbacks bind to `127.0.0.1` with an ephemeral port and `/callback` path.
- `POST /api/cli/token`: form-encoded authorization-code and rotating-refresh-token grants. Return
  `{access_token,token_type:"Bearer",expires_in,refresh_token}` with no-store caching. Enforce the verifier, client and
  redirect binding. Refresh reuse must revoke or reconcile the affected grant according to the auth policy.
- `POST /api/cli/revoke`: form-encoded token and public client ID, revoke the interactive grant and refresh family.
- Entity-bound prepare/complete operations and same-origin protected byte routes. Successful credential delivery
  returns `{token}` only through its one-use interactive route, never an operation result or receipt.

Discovery descriptors add an explicit `execution` block to the proposal: `kind`, `idempotent`, `confirmation`, declared
`readBranches` (`mode:read` or `action:read`) and optional `csvColumns`. These prevent clients from inferring effects from
HTTP POST or command names. Input/output schemas are generated from the same Zod definitions as handlers; not a second
hand-maintained API. The server remains responsible for authorization, strict validation, atomic revision checks,
durable deduplication and external reconciliation. Client checks cannot substitute for those guarantees.

This package ships no application endpoint or authentication service. Its tests establish protocol behavior against
fixtures, including replay, partial outcomes and workspace isolation. Before release, add application integration tests
and exercise real browser consent, credential revocation and representative business workflows locally.
