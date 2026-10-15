import { describe, expect, it } from "vitest"
import { addressRegions } from "../src/lib/address-regions"

describe("postal region options", () => {
  it("uses postal codes for US and Canadian regions", () => {
    expect(addressRegions("us", "en")).toContainEqual({
      value: "CA",
      label: "California",
      aliases: ["CA", "California", "California"]
    })
    expect(addressRegions("CA", "en").find((region) => region.value === "ON")?.label).toBe("Ontario")
  })
  it("offers native and Latin names without changing stored region keys", () => {
    expect(addressRegions("CN", "zh-CN").find((region) => region.value === "浙江省")?.label).toBe("浙江省")
    expect(addressRegions("CN", "en").find((region) => region.value === "浙江省")?.label).toBe("Zhejiang Sheng")
  })
  it("allows manual entry when postal metadata has no region list", () => {
    expect(addressRegions("GB", "en")).toEqual([])
    expect(addressRegions("", "en")).toEqual([])
  })
})
