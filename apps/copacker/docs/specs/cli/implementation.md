# CLI implementation and recovery audit

Audited on 2026-10-22 against the saved `a658f250` snapshot, restoration `e063768c` (PR #117), and current main
`8e29fb12`. This records implementation state; the proposal's judge verdict is not an implementation review.

## Recovery

All three packages and all 18 CLI specification documents from the saved snapshot are tracked on main. The comparison
has no deleted files after accounting for test moves from `src/` to `tests/`. Package configuration, documentation
indexes, Knip entries and lockfile entries are present. There was no missing server implementation to recover: the
saved snapshot already documented authentication routes and operation handlers as unfinished.

PR #117 preserved the work and fixed transfer timeouts, empty environment values, printable table keys, deterministic
sorting, the `copacker_` MCP prefix, restock plan's `--from-report` binding and missing OS-keychain entries. PR #139
moved tests and aligned package verification. Domain package extractions replaced `aisle` references in the spec.
The app now runs on TanStack Start. Its newer typed browser action registry still depends on browser sessions; it is
not the proposed bearer operation API and must not be forwarded blindly from the CLI.

The audit checkout was fast-forwarded from `262e5e85` to `8e29fb12`. Existing local design and page work was preserved.

## Implemented

- CLI vocabulary: 138 operation commands plus local login, logout and workspace selection.
- Client protocol: schema discovery, validated inputs/results, retained execution keys, pagination, read-only polling,
  structured output and protected entity transfers. CLI sign-in now has the matching server PKCE flow.
- Ten executable setup schemas: account show, workspace list/show, schema list/show and credential list/show/create/
  rotate/revoke. Workspace definitions receive the app's canonical access schema. Credential schemas contain metadata
  and protected handoffs only; their policies still require enforcement by application handlers.
- Recovery-pass fixes: account schema inspection before workspace selection; result-schema compatibility and per-operation
  byte checks before effects; execution classification after defaults; complete OpenAPI envelopes, working local schema
  references and mutation-key requirements; a body deadline for one-use secret delivery after the transfer timeout refactor.
- First server slice: browser consent, durable grants, hashed access/refresh tokens, refresh-family replay revocation,
  logout revocation and current WorkOS identity/workspace checks. Local profile locking prevents concurrent refresh reuse.
- Nine authorized database handlers: account show, workspace list/show, schema list/show, connection list/show and
  connection settings show/update. Only these are advertised. The settings write shares the browser service and uses
  revisions and durable atomic idempotency receipts. See [server behavior and release instructions](../../cli-server.md).

## Next implementation work

1. Release the generated schema change through CI and perform deployed WorkOS/CLI login acceptance. No migration or
   deployment was run locally. Complete automation credential/delivery records and lifecycle handlers.
2. Expand the authorized operation registry with resource schemas and handlers. Keep discovery limited to deployed
   capabilities and preserve guarded transactions, permission checks and execution receipts.
3. Restock channel/report handlers now use real stored data; see [their supported scope](../../cli-restock.md).
   Complete canonical identities, target/dependency planning and export artifacts. Connect purchase-order detail and shipment list commands to real application data, with
   provenance, permissions and the contract's typed results. Then migrate each browser workflow onto the same handlers.
4. Implement the remaining entity contracts and handlers, including supplier catalogs/stock, customer catalog assignments,
   durable listing links, Shopify-only SKU changes, linked price changes, location-routed stock writes, bulk execution
   and entity transfers. Preserve per-target outcomes and never substitute optimistic local success for a provider result.
5. Add the hosted MCP adapter and native Linux/macOS credential-store acceptance before release.

The packages remain private and are not a live, publishable CLI release. No hosted API or provider write was deployed.
During the recovery audit, CodeRabbit could not run: its CLI was absent, its installer supports Linux/macOS, and this Windows host
had no general-purpose WSL distribution. Local tests establish client/contract behavior, not live provider compatibility.

## Verification

Server slice verification (2026-10-22): `pnpm verify` passes in the isolated implementation checkout, including 2,750
application tests and 41 package tests. Fourteen database/HTTP/client integration tests exercise the new server;
focused server coverage was also collected. Both consent stories pass their play tests, and the integrated browser
was used to inspect the desktop and 320-pixel phone layouts and keyboard focus. The production application build passes.
WorkOS/provider network calls in tests are mocked. The generated migration was neither applied nor tested, and no
production sign-in or provider operation was performed.

Recovery audit verification, before the server slice:

- All 40 package tests passed with coverage: contract 12, client 10, CLI 18. This includes native Windows credential
  protection, a real loopback PKCE exchange against a test server and actual CLI process execution.
- All three package builds, type checks and lint checks passed.
- `pnpm verify` passed in a temporary checkout of `8e29fb12` with only these CLI changes applied. The main checkout's
  run stopped on two pre-existing, empty, untracked files (`apps/copacker/page.tsx` and `page.stories.tsx`), which also
  fail Knip. They were left untouched. The temporary checkout was removed after verification.
- The current `pnpm verify` runs affected tests without coverage; the package coverage run above was separate.
  No migrations, live provider writes or production data were exercised.
