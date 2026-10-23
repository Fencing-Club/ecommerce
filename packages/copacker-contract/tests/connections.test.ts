import { expect, it } from "vitest"
import { connectionOperations } from "../src/connections.ts"
import { createRegistry } from "../src/registry.ts"

const id = "10000000-0000-4000-8000-000000000001"
it("validates provider-specific settings and rejects credential leakage in connection results", async () => {
  const registry = createRegistry(Object.values(connectionOperations))
  const update = connectionOperations["connection.settings.update"]
  expect(
    update.input.safeParse({ id, expectedRevision: 0, settings: { provider: "amazon", excludedOrderTags: [] } }).success
  ).toBe(false)
  expect(update.input.safeParse({ id, settings: { provider: "shopify", excludedOrderTags: [] } }).success).toBe(false)
  const saved = { connectionId: id, revision: 1, settings: { provider: "shopify", excludedOrderTags: ["Amazon"] } }
  await expect(
    registry.execute(
      "connection.settings.update",
      { id, expectedRevision: 0, settings: saved.settings },
      async (_, mutation) => {
        expect(mutation).toBe(true)
        return saved
      }
    )
  ).resolves.toEqual(saved)
  expect(
    connectionOperations["connection.settings.show"].output.safeParse({ ...saved, accessToken: "secret" }).success
  ).toBe(false)
  expect(connectionOperations["connection.list"].input.safeParse({ provider: "amazon_ads", limit: 200 }).success).toBe(
    true
  )
  expect(connectionOperations["connection.list"].input.safeParse({ provider: "unknown" }).success).toBe(false)
  const openapi = registry.openapi()
  expect(openapi.paths["/api/operations/connection.settings.update"]?.post.parameters?.[0]?.required).toBe(true)
  expect(openapi.paths["/api/operations/connection.show"]?.post.parameters).toBeUndefined()
})
