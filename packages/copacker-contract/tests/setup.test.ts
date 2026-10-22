import { describe, expect, it } from "vitest"
import { z } from "zod"
import { commands } from "../src/commands.ts"
import { usesAccountContext } from "../src/protocol.ts"
import { createRegistry } from "../src/registry.ts"
import { credentialOperations, setupOperations } from "../src/setup.ts"

const id = "10000000-0000-4000-8000-000000000001"
// The application supplies its own existing grant schema; the factory preserves it, including its refinements.
const access = z.strictObject({ products: z.literal("view").optional() })
const definitions = setupOperations(access)
const registry = createRegistry(Object.values(definitions))
const credential = {
  id,
  revision: 1,
  name: "restock-ci",
  workspaceId: id,
  principalId: "user_stable_identity",
  scopes: ["reports:read"],
  createdAt: "2026-10-22T00:00:00Z",
  expiresAt: "2026-11-21T00:00:00Z",
  lastUsedAt: null,
  state: "pending_delivery",
  generation: 1,
  previousGenerationExpiresAt: null,
  pendingDeliveryExpiresAt: "2026-10-22T00:10:00Z"
}

describe("setup operation contracts", () => {
  it("defines discoverable shapes without publishing unimplemented business operations", () => {
    expect(registry.list()).toHaveLength(10)
    const commandNames = new Set(commands.map((command) => command.operation))
    for (const definition of Object.values(definitions)) {
      expect(commandNames.has(definition.descriptor.operation)).toBe(true)
      expect(() => z.fromJSONSchema(definition.descriptor.inputSchema)).not.toThrow()
      expect(() => z.fromJSONSchema(definition.descriptor.outputSchema)).not.toThrow()
    }
    expect(registry.get("po.create")).toBeUndefined()
    expect(definitions["account.show"].descriptor.mcpName).toBe("copacker_account_show")
  })

  it("keeps credential administration out of MCP and validates explicit scopes and guarded rotation", () => {
    for (const definition of Object.values(credentialOperations)) {
      expect(definition.descriptor.context).toBe("workspace")
      expect(definition.descriptor.mcpName).toBeNull()
    }
    const create = credentialOperations["account.credential.create"]
    const valid = { name: "restock-ci", scopes: ["reports:read"], expiresAt: "2026-11-21T00:00:00Z" }
    expect(create.input.parse(valid)).toEqual(valid)
    for (const invalid of [
      { ...valid, scopes: [] },
      { ...valid, scopes: ["*"] },
      { ...valid, scopes: ["reports:read", "reports:read"] },
      { ...valid, principalId: "someone-else" },
      { ...valid, workspaceId: id },
      { ...valid, name: " " },
      { ...valid, name: "two\nlines" }
    ]) {
      expect(create.input.safeParse(invalid).success).toBe(false)
    }
    const rotate = credentialOperations["account.credential.rotate"].input
    expect(rotate.parse({ id, expectedRevision: 1 }).overlapSeconds).toBe(900)
    expect(rotate.safeParse({ id, expectedRevision: 1, overlapSeconds: 901 }).success).toBe(false)
    expect(rotate.safeParse({ id, expectedRevision: -1 }).success).toBe(false)
    expect(rotate.safeParse({ id, expectedRevision: 1, scopes: ["prices:read"] }).success).toBe(false)
  })

  it("rejects secrets in credential receipts and requires an actual revoked state", () => {
    const data = {
      credential,
      delivery: {
        id,
        expiresAt: "2026-10-22T00:10:00Z",
        state: "available",
        download: { url: "/private/delivery", authentication: "interactive_required" }
      }
    }
    const output = credentialOperations["account.credential.create"].output
    expect(output.safeParse(data).success).toBe(true)
    expect(output.safeParse({ ...data, token: "must-not-leak" }).success).toBe(false)
    expect(output.safeParse({ ...data, credential: { ...credential, token: "must-not-leak" } }).success).toBe(false)
    expect(output.safeParse({ ...data, delivery: { ...data.delivery, token: "must-not-leak" } }).success).toBe(false)
    const revoked = credentialOperations["account.credential.revoke"].output
    expect(revoked.safeParse({ credential }).success).toBe(false)
    expect(revoked.safeParse({ credential: { ...credential, state: "revoked" } }).success).toBe(true)
  })

  it("uses the supplied grant schema and supports identity-provider principal IDs", () => {
    const workspace = {
      id,
      name: "Buyer",
      kind: "buyer",
      role: "member",
      access: { products: "view" },
      effectiveScopes: [],
      capabilities: []
    }
    const output = definitions["workspace.show"].output
    expect(output.shape.access).toBe(access)
    expect(output.safeParse(workspace).success).toBe(true)
    expect(output.safeParse({ ...workspace, access: { products: "edit" } }).success).toBe(false)
    expect(
      definitions["account.show"].output.safeParse({
        id: "user_stable_identity",
        name: null,
        email: "person@example.net",
        workspaceId: null,
        authentication: { kind: "interactive", credentialId: null, expiresAt: null, scopes: [] }
      }).success
    ).toBe(true)
  })

  it("exposes only account reads and their discovery before workspace selection", () => {
    for (const name of ["account.show", "workspace.list"]) {
      expect(usesAccountContext(name, {})).toBe(true)
      expect(usesAccountContext("schema.show", { operation: name })).toBe(true)
    }
    for (const name of ["workspace.show", "account.credential.create", "schema.show", "po.create"]) {
      expect(usesAccountContext(name, {})).toBe(false)
      expect(usesAccountContext("schema.show", { operation: name })).toBe(false)
    }
    const api = registry.openapi()
    const bootstrap = z.fromJSONSchema(
      api.paths["/api/operations/schema.show"]!.post.requestBody.content["application/json"].schema
    )
    expect(bootstrap.safeParse({ input: { operation: "account.show" } }).success).toBe(true)
    expect(bootstrap.safeParse({ input: { operation: "po.create" } }).success).toBe(false)
    expect(bootstrap.safeParse({ workspaceId: id, input: { operation: "po.create" } }).success).toBe(true)
  })

  it("exports complete envelopes and required mutation execution keys in OpenAPI", () => {
    const post = registry.openapi().paths["/api/operations/account.credential.revoke"]!.post
    expect(post.parameters?.[0]?.required).toBe(true)
    const success = z.fromJSONSchema(post.responses["200"].content["application/json"].schema)
    expect(success.safeParse({ data: { credential: { ...credential, state: "revoked" } }, meta: {} }).success).toBe(
      false
    )
    expect(
      success.safeParse({
        data: { credential: { ...credential, state: "revoked" } },
        meta: {
          requestId: "request-1",
          workspaceId: id,
          generatedAt: "2026-10-22T00:00:00Z",
          completeness: "complete",
          sources: [],
          warnings: [],
          redactedFields: []
        }
      }).success
    ).toBe(true)
    const failure = z.fromJSONSchema(post.responses.default.content["application/json"].schema)
    expect(
      failure.safeParse({
        error: {
          code: "permission_denied",
          message: "No access",
          retryable: false,
          issues: [],
          recovery: null,
          details: {}
        },
        meta: {}
      }).success
    ).toBe(false)
  })
})
