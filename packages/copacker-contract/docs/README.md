# Copacker operation contract

`@repo/copacker-contract` contains portable protocol schemas, the CLI command vocabulary and the registry builder used
to publish operation descriptions and OpenAPI. It has no database, framework, provider SDK or file-generation imports.

- `protocol.ts`: scopes, requests, results, errors, metadata, pagination, operation state, artifacts and handoffs.
- `commands.ts`: entity command paths, argument bindings, confirmation and preview affordances.
- `registry.ts`: `defineOperation` combines typed Zod input/output schemas with context, scopes, effects and execution
  metadata. `createRegistry` rejects duplicate operation, CLI and MCP names, validates handler boundaries and emits
  OpenAPI. Authorization and database transactions belong to the application dispatcher.
- `json.ts`: duplicate-key-rejecting JSON input and canonical serialization for retained client intents.

The registry is a framework, not a deployed catalog. Application-specific operation schemas and handlers from
[the spec](../../../apps/copacker/docs/specs/cli/operations/README.md) still need implementation and registration.
The CLI vocabulary includes the planned initial surface but does not assert server availability. Publish only
registered, authorized operations through discovery, using the actual schema objects supplied to the handlers.

Input JSON is limited to 1 MiB and 128 levels of nesting. Fields, IDs, revisions, typed money and dependencies are
validated by the operation schema. Unknown properties must be rejected by strict object schemas. JSON Schema
conversion must remain compatible with Zod's supported JSON Schema subset; use executable Zod refinements as well as
JSON Schema for server-only business invariants. A client-side schema check never replaces server validation.

The current contract identifier is `2026-10-15`. Routes remain unversioned; clients fail before mutations when their
contract differs. Account bootstrap discovery and the execution metadata extension are documented in
[the client integration guide](../../copacker-client/docs/README.md). Hosted MCP can map registered operation names
by replacing dots/hyphens with underscores and sharing schemas and authorization, without spawning the CLI.
