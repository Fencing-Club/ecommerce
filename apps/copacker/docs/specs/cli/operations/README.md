# Operation schemas

These documentation schemas define the proposed initial command surface. Ten setup operations have executable Zod
schemas in [the contract package](../../../../../../packages/copacker-contract/src/setup.ts); these pages themselves
are not generated OpenAPI or implemented endpoints. Each business command maps to one named operation, its input/result types,
access policy, effects and errors. Implement the portable schema once and generate CLI, HTTP and MCP descriptions from it.

- [Shared types and policies](shared.md)
- [Restock and purchase orders](purchasing.md)
- [Products, supplier catalogs and inventory](products.md)
- [Shipments and documents](shipments.md)
- [Customer orders, expenses and reports](data.md)
- [Partners, addresses, connections and account reads](setup.md)
- [Worked requests and responses](examples.md)

[Bulk writes](../bulk.md), [automation credentials](../credentials.md) and [write destination discovery](../destinations.md)
define the corresponding reusable contracts. The command inventory remains the user-facing index, not a second schema.

## Reading the schemas

The notation is structural: `field?` is optional, `T | null` allows an explicit unknown/cleared value, `T[]` is an array,
`A & B` combines fields, and quoted strings denote exact enum values. All input objects reject unknown fields. Only
declared patch types allow omission to mean preserve; a full replacement must contain every required field. Null clears
only fields explicitly marked nullable. Empty strings are not silently converted to null unless a field says so.

Tables list the domain input inside `{workspaceId, input}`. Authentication, request IDs and idempotency keys follow
[the shared transport](../contract.md). Result types describe `data`, wrapped in the same `meta` envelope. Common errors
apply to every row; additional errors and effects are listed by operation. Local CLI adapters inject `mode: preview`
for `--dry-run`, `mode: apply` for `--preview`, and `mode: direct` otherwise; conflicting mode flags/JSON fail.

An explicitly named existing schema is an exact reuse reference, including its limits and refinements. Public field
renames and omissions are listed where used. It is not permission to accept raw provider responses, internal storage
keys or an arbitrary JSON object. Source-schema changes require updating the public schema and consumers together.

Every inventory entry is covered here or in the credential contract. `login`, `logout`, `workspace use`, local file
paths, stdout formatting and polling remain client behaviors. `schema show` must eventually publish the fully expanded
JSON Schema, including referenced types, filters, limits and conditional branches; prose references are not sufficient
for deployed discovery.

## Implementation acceptance

For each operation, translate these definitions to strict input/output schemas, map access and effects, and add behavioral
fixtures for a valid call and relevant failure. Shared fixtures must produce equivalent CLI JSON, HTTP and MCP results.
Begin with the worked restock/PO, supplier catalog/stock and linked-product-write sequences. A command is not implemented
until its result and error variants are validated as well as its input. Do not add tests that merely inspect these docs.
