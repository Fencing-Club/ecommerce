import { describe, expect, it } from "vitest"
import { assertPreviewBranch, previewSettings } from "../scripts/preview-config"

describe("PR preview boundaries", () => {
  it.each([
    { id: "br-prod", name: "production", default: true },
    { id: "br-preview", name: "pr-42", parent_id: "br-production", default: false },
    { id: "br-preview", name: "pr-42", parent_id: "br-staging", default: false, protected: true },
    { id: "br-other", name: "pr-43", parent_id: "br-staging", default: false }
  ])("refuses to update or delete a different or protected branch", (branch) => {
    expect(() => assertPreviewBranch(branch, "pr-42", "br-staging")).toThrow("Refusing")
  })

  it("accepts only the PR's staging child", () => {
    expect(() =>
      assertPreviewBranch(
        { id: "br-preview", name: "pr-42", parent_id: "br-staging", default: false },
        "pr-42",
        "br-staging"
      )
    ).not.toThrow()
  })

  it.each(["production", "0", "../staging", "42;echo secret"])("rejects unsafe resource identifiers: %s", (number) => {
    expect(previewSettings.shape.PR_NUMBER.safeParse(number).success).toBe(false)
  })
})
