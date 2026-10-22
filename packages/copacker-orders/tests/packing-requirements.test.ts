import { describe, expect, it } from "vitest"
import { packingRequirementsSchema, packingTasks } from "../src/packing-requirements"

describe("packing requirements", () => {
  const config = { preparation: "none", labels: ["sku", "fnsku"], countryCode: "", instructions: "" } as const

  it("validates independent label tasks and origin information", () => {
    expect(packingRequirementsSchema.safeParse(config).success).toBe(true)
    expect(packingRequirementsSchema.safeParse({ ...config, labels: ["sku", "sku"] }).success).toBe(false)
    expect(packingRequirementsSchema.safeParse({ ...config, labels: ["countryOfOrigin"] }).success).toBe(false)
    expect(
      packingRequirementsSchema.safeParse({ ...config, labels: ["countryOfOrigin"], countryCode: "CN" }).success
    ).toBe(true)
  })

  it("lists the preparation, then each label, as the supplier's tasks", () => {
    expect(packingTasks({ ...config, labels: [...config.labels] })).toEqual(["sku", "fnsku"])
    expect(packingTasks({ ...config, preparation: "sealedPolybag", labels: ["suffocation"] })).toEqual([
      "sealedPolybag",
      "suffocation"
    ])
  })
})
