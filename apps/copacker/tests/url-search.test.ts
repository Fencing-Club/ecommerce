import { describe, expect, it } from "vitest"
import { parseUrlSearch, stringifyUrlSearch } from "../src/lib/url-search"

describe("HTTP query-string contract", () => {
  it("round trips repeated values and opaque text without JSON interpretation", () => {
    const query = "?tag=one&tag=two&q=%5B%22literal%22%5D&id=001&flag=false&empty=&name=A%2BB+%26+%E6%BC%A2"
    const parsed = parseUrlSearch(query)
    expect(parsed).toEqual({
      tag: ["one", "two"],
      q: '["literal"]',
      id: "001",
      flag: "false",
      empty: "",
      name: "A+B & 漢"
    })
    const encoded = stringifyUrlSearch(parsed)
    expect(new URLSearchParams(encoded).getAll("tag")).toEqual(["one", "two"])
    expect(parseUrlSearch(encoded)).toEqual(parsed)
  })
  it("serializes typed navigation scalars and removes cleared keys", () => {
    expect(stringifyUrlSearch({ import: true, page: 2, add: undefined, removed: null })).toBe("?import=true&page=2")
    expect(stringifyUrlSearch({ add: undefined })).toBe("")
    expect(() => stringifyUrlSearch({ filter: { foreign: "record" } })).toThrow("Invalid input")
  })
  it("treats inherited-looking keys as data without altering prototypes", () => {
    const parsed = parseUrlSearch("?__proto__=one&__proto__=two&constructor=value")
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toEqual(["one", "two"])
    expect(new URLSearchParams(stringifyUrlSearch(parsed)).getAll("__proto__")).toEqual(["one", "two"])
  })
})
