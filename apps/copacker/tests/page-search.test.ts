import { describe, expect, it } from "vitest"
import { documentKey } from "../src/lib/document-key"
import {
  newOrderSearch,
  ordersSearch,
  overviewSearch,
  partnersSearch,
  productsSearch,
  restockSearch,
  salesSearch,
  unsubscribeSearch
} from "../src/lib/page-search"
import { pageTitle } from "../src/lib/page-title"
import { parseUrlSearch, stringifyUrlSearch } from "../src/lib/url-search"

// A URL's search as the router reads it, then as the page's route validates it.
const read = <T>(schema: { parse: (value: unknown) => T }, search: string) => schema.parse(parseUrlSearch(search))

describe("page search", () => {
  it("reads the Overview's period and channel, and drops what doesn't fit", () => {
    expect(read(overviewSearch, "?channel=shopify%3A42&period=today&compare=none")).toEqual({
      channel: "shopify:42",
      period: "today",
      compare: "none"
    })
    expect(read(overviewSearch, "?from=2026-09-01&to=2026-09-10")).toEqual({ from: "2026-09-01", to: "2026-09-10" })
    expect(read(overviewSearch, "?period=30d&compare=year&from=yesterday&channel=a&channel=b&keep=1")).toEqual({})
  })

  it("keeps a list's view, and no longer reads the old ?status=", () => {
    expect(read(ordersSearch, "?view=closed")).toEqual({ view: "closed" })
    expect(read(ordersSearch, "?view=archived&tab=pack")).toEqual({ tab: "pack" })
    expect(read(ordersSearch, "?status=draft")).toEqual({})
  })

  it("trims and bounds search text from links", () => {
    expect(read(salesSearch, `?q=${encodeURIComponent(` ${"q".repeat(150)} `)}`)).toEqual({ q: "q".repeat(100) })
    expect(read(productsSearch, `?q=${"q".repeat(250)}&import=true`)).toEqual({ q: "q".repeat(200), import: "true" })
    expect(read(partnersSearch, "?type=forwarder&q=+lotus+&add=supplier")).toEqual({
      type: "forwarder",
      q: "lotus",
      add: "supplier"
    })
    expect(read(partnersSearch, "?type=all&q=a&q=b")).toEqual({})
  })

  it("reads a Restock link's filters", () => {
    expect(read(restockSearch, "?status=order&channel=amazon&cover=out&q=TOTE")).toEqual({
      status: "order",
      channel: "amazon",
      cover: "out",
      q: "TOTE"
    })
    expect(read(restockSearch, "?status=all&cover=soon")).toEqual({})
  })

  it("starts a new purchase order only with variants that fit", () => {
    const variant = "gid://shopify/ProductVariant/1"
    expect(read(newOrderSearch, `?variant=${encodeURIComponent(variant)}`).variant).toEqual([variant])
    expect(
      read(newOrderSearch, `?variant=${encodeURIComponent(variant)}&variant=${encodeURIComponent(`${variant}@12`)}`)
    ).toMatchObject({ variant: [variant, `${variant}@12`] })
    expect(read(newOrderSearch, `?variant=${encodeURIComponent(`${variant}@0`)}&destination=moon`)).toEqual({})
    expect(read(newOrderSearch, "?supplierId=s1&destination=warehouse&locationId=81234")).toEqual({
      supplierId: "s1",
      destination: "warehouse",
      locationId: "81234"
    })
  })

  it("validates the same fields again on the server, and writes them back to the same URL", () => {
    const search = read(unsubscribeSearch, "?email=jordan%40example.com&token=abc&done=1")
    expect(unsubscribeSearch.parse(search)).toEqual(search)
    expect(stringifyUrlSearch(search)).toBe("?email=jordan%40example.com&token=abc&done=1")
    expect(read(unsubscribeSearch, "?email=a%40example.com&email=b%40example.com")).toEqual({})
  })
})

describe("documents and titles", () => {
  it("gives every portal page the same document, and each page with its own head its own", () => {
    expect(documentKey("/orders")).toBe("app")
    expect(documentKey("/shipments/00000000-0000-4000-8000-000000000001")).toBe("app")
    expect(documentKey("/workspaces")).toBe("app")
    expect(documentKey("/login")).toBe("public")
    expect(documentKey("/workspaces/new")).toBe("public")
    expect(documentKey("/contact")).toBe("/contact")
    expect(documentKey("/setup")).toBe("/setup")
  })

  it("names every page, then the app", () => {
    expect(pageTitle("Purchase orders")).toBe("Purchase orders | Copacker")
    expect(pageTitle()).toBe("Copacker")
  })
})
