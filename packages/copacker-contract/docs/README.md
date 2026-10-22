# Copacker operation contract

`@repo/copacker-contract` contains portable protocol schemas, the CLI command vocabulary and the registry builder used
to publish operation descriptions and OpenAPI. It has no database, framework, provider SDK or file-generation imports.

- `protocol.ts`: scopes, requests, results, errors, metadata, pagination, operation state, artifacts and handoffs.
- `commands.ts`: entity command paths, argument bindings, confirmation and preview affordances.
- `registry.ts`: `defineOperation` combines typed Zod input/output schemas with context, scopes, effects and execution
  metadata. `createRegistry` rejects duplicate operation, CLI and MCP names, validates handler boundaries and emits
  OpenAPI. Authorization and database transactions belong to the application dispatcher.
- `json.ts`: duplicate-key-rejecting JSON input and canonical serialization for retained client intents.
- `setup.ts`: executable schemas for account reads, workspace reads, discovery and the five credential operations.
  Call `setupOperations(accessSchema)` with the application's existing access schema; page grants are not copied here.
  Credential result schemas reject secret fields, and credential administration has no MCP tool name.

The registry is a framework, not a deployed catalog. Ten setup operations have executable schemas; their application
handlers and the remaining domain schemas from [the spec](../../../apps/copacker/docs/specs/cli/operations/README.md)
still need implementation and registration. The credential handlers must enforce current interactive-admin authority,
workspace-supported scopes, the one-hour/90-day expiry window, rotation state and protected delivery transactions;
validating a schema alone grants no authority and creates no credential.
The CLI vocabulary includes the planned initial surface but does not assert server availability. Publish only
registered, authorized operations through discovery, using the actual schema objects supplied to the handlers.

Input JSON is limited to 1 MiB and 128 levels of nesting. Fields, IDs, revisions, typed money and dependencies are
validated by the operation schema. Unknown properties must be rejected by strict object schemas. JSON Schema
conversion must remain compatible with Zod's supported JSON Schema subset; use executable Zod refinements as well as
JSON Schema for server-only business invariants. A client-side schema check never replaces server validation.
The registry classifies execution after validation/defaults and enforces `maxInputBytes` on UTF-8 serialized input.
OpenAPI includes the complete success/error metadata, mandatory mutation keys (conditional for read branches), and
account-context discovery of `account.show` and `workspace.list` without an active workspace.

The current contract identifier is `2026-10-15`. Routes remain unversioned; clients fail before mutations when their
contract differs. Account bootstrap discovery and the execution metadata extension are documented in
[the client integration guide](../../copacker-client/docs/README.md). Hosted MCP can map registered operation names
by replacing dots/hyphens with underscores and sharing schemas and authorization, without spawning the CLI.
