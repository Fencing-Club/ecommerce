import { afterEach, expect, it, vi } from "vitest"
import { Amazon } from "../src/amazon"
import { Ebay } from "../src/ebay"
import { Shopify } from "../src/shopify"

afterEach(() => vi.unstubAllGlobals())

it("keeps the native fetch receiver when commerce clients use their default transport", async () => {
  const calls: string[] = []
  vi.stubGlobal("fetch", async function (this: unknown, input: RequestInfo | URL) {
    // workerd rejects a native fetch called as a client instance's method. Node's permissive fetch hides this bug.
    expect(this).toBe(globalThis)
    calls.push(String(input))
    if (String(input).includes("token")) {
      return Response.json({ access_token: "test", expires_in: 3600 })
    }
    return Response.json({ data: { shop: { name: "Test shop" } }, userId: "seller", username: "Test seller" })
  })
  await new Shopify("test.myshopify.com", "test").graphql("query { shop { name } }")
  await new Amazon({ clientId: "test", clientSecret: "test", refreshToken: "test" }).request("GET", "/test")
  await new Ebay({ clientId: "test", clientSecret: "test", refreshToken: "test" }).user()
  expect(calls).toHaveLength(5)
})
