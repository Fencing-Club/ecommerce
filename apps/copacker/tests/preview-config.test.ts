import { describe, expect, it } from "vitest"
import { assertPreviewBranch, previewSettings, previewSource } from "../scripts/preview-config"

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

  it("does not pass integration credentials through the preview allowlist", () => {
    const parsed = previewSource.parse({
      WORKOS_API_KEY: "test",
      WORKOS_CLIENT_ID: "client",
      TOKEN_ENCRYPTION_KEY: "test",
      S3_ENDPOINT: "https://storage.example.com",
      S3_BUCKET: "staging",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      SHOPIFY_CLIENT_SECRET: "never-copy",
      AWS_SECRET_ACCESS_KEY: "never-copy",
      EMAIL_API_KEY: "never-copy"
    })
    expect(parsed).not.toHaveProperty("SHOPIFY_CLIENT_SECRET")
    expect(parsed).not.toHaveProperty("AWS_SECRET_ACCESS_KEY")
    expect(parsed).not.toHaveProperty("EMAIL_API_KEY")
  })

  it.each(["production", "0", "../staging", "42;echo secret"])("rejects unsafe resource identifiers: %s", (number) => {
    expect(previewSettings.shape.PR_NUMBER.safeParse(number).success).toBe(false)
  })
})
