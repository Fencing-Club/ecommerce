import { describe, expect, it, vi } from "vitest"
import { Amazon } from "../src/amazon"

function client(responses: unknown[]) {
  const calls: URL[] = []
  const transport = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.hostname === "api.amazon.com") {
      return Response.json({ access_token: "test", expires_in: 3600 })
    }
    calls.push(url)
    const response = responses.shift()
    if (response === undefined) {
      throw new Error("Unexpected request")
    }
    return Response.json(response)
  })
  return { api: new Amazon({ clientId: "test", clientSecret: "test", refreshToken: "test" }, transport), calls }
}
const listing = (sku: string, marketplaceId = "ATVPDKIKX0DER") => ({
  sku,
  summaries: [{ marketplaceId, asin: "B000000001", fnSku: "X000000001" }]
})
describe("Amazon listing identities", () => {
  it("batches unique SKUs in groups of twenty and uses exact seller identities", async () => {
    const skus = Array.from({ length: 21 }, (_, i) => `SKU-${i}`)
    const { api, calls } = client([
      { items: skus.slice(0, 20).map((s) => listing(s)) },
      { items: [listing(skus[20]!)] }
    ])
    const result = await api.listings("seller/1", [...skus, skus[0]!])
    expect(result.size).toBe(21)
    expect(result.get("SKU-0")).toEqual({ asin: "B000000001", fnsku: "X000000001" })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.pathname).toContain("seller%2F1")
    expect(calls[0]?.searchParams.get("identifiers")?.split(",")).toHaveLength(20)
    expect(calls[1]?.searchParams.get("identifiers")).toBe("SKU-20")
  })
  it("follows pagination with the same exact SKU filter", async () => {
    const { api, calls } = client([
      { items: [listing("a")], pagination: { nextToken: "token+/=" } },
      { items: [listing("b")] }
    ])
    expect((await api.listings("seller", ["a", "b"])).size).toBe(2)
    expect(calls[1]?.searchParams.get("pageToken")).toBe("token+/=")
    expect(calls[1]?.searchParams.get("identifiers")).toBe("a,b")
  })
  it("does not use another marketplace or fabricate a missing FNSKU", async () => {
    const { api } = client([
      {
        items: [
          listing("foreign", "OTHER"),
          { sku: "missing", summaries: [{ marketplaceId: "ATVPDKIKX0DER", asin: "B000000001" }] }
        ]
      }
    ])
    const result = await api.listings("seller", ["foreign", "missing"])
    expect(result.has("foreign")).toBe(false)
    expect(result.get("missing")?.fnsku).toBe("")
  })
  it("rejects results for an unrequested SKU", async () => {
    const { api } = client([{ items: [listing("wrong")] }])
    await expect(api.listings("seller", ["wanted"])).rejects.toThrow("unexpected seller SKU")
  })
  it("stops repeated pagination tokens", async () => {
    const { api } = client([
      { items: [], pagination: { nextToken: "loop" } },
      { items: [], pagination: { nextToken: "loop" } }
    ])
    await expect(api.listings("seller", ["wanted"])).rejects.toThrow("pagination")
  })
  it("handles comma-containing SKUs through the exact item path", async () => {
    const { api, calls } = client([listing("cord,2")])
    expect((await api.listings("seller", ["cord,2"])).has("cord,2")).toBe(true)
    expect(calls[0]?.pathname).toContain("cord%2C2")
  })
})
