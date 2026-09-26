import { randomBytes, createHmac } from "node:crypto"
import { PDFDocument, PDFName, PDFString } from "pdf-lib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { encrypt, decrypt, returnPath, verifyShopifyHmac, verifyShopifyWebhook } from "../src/server/security"
import { validatePdf } from "../src/server/storage"
afterEach(() => {
  vi.unstubAllEnvs()
})
describe("Connection and document boundaries", () => {
  it("binds credentials to the exact organization and provider", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
    const encrypted = encrypt("merchant token", "org-one:shopify")
    expect(encrypted).not.toContain("merchant token")
    expect(decrypt(encrypted, "org-one:shopify")).toBe("merchant token")
    expect(() => decrypt(encrypted, "org-two:shopify")).toThrow(/authenticate/)
    expect(() => decrypt(encrypted, "org-one:amazon")).toThrow(/authenticate/)
  })
  it("rejects weak encryption configuration", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "bad")
    expect(() => encrypt("secret", "scope")).toThrow("32 random bytes")
  })
  it("validates Shopify callbacks and rejects tampering", () => {
    const params = new URLSearchParams({ code: "abc", shop: "test.myshopify.com", state: "nonce", timestamp: "123" }),
      secret = "test-secret"
    params.set("hmac", createHmac("sha256", secret).update(params.toString()).digest("hex"))
    expect(verifyShopifyHmac(params, secret)).toBe(true)
    params.set("state", "different")
    expect(verifyShopifyHmac(params, secret)).toBe(false)
  })
  it("accepts only webhook bodies signed with the app's client secret", () => {
    const body = '{"id":1}',
      signature = createHmac("sha256", "test-secret").update(body).digest("base64")
    expect(verifyShopifyWebhook(body, signature, "test-secret")).toBe(true)
    expect(verifyShopifyWebhook('{"id":2}', signature, "test-secret")).toBe(false)
    expect(verifyShopifyWebhook(body, signature, "other-secret")).toBe(false)
    expect(verifyShopifyWebhook(body, null, "test-secret")).toBe(false)
  })
  it("rejects non-PDF and active-content uploads", async () => {
    await expect(validatePdf(new Uint8Array([1, 2, 3]))).rejects.toThrow("PDF")
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.catalog.set(
      PDFName.of("OpenAction"),
      pdf.context.obj({ S: "JavaScript", JS: PDFString.of("app.alert('bad')") })
    )
    await expect(validatePdf(await pdf.save())).rejects.toThrow("active content")
  })
})
describe("Sign-in return path", () => {
  it("keeps pages on this app, including the query", () => {
    expect(returnPath("/inventory")).toBe("/inventory")
    expect(returnPath("/invite?token=abc")).toBe("/invite?token=abc")
    expect(returnPath("/orders/123?tab=lines#top")).toBe("/orders/123?tab=lines")
  })
  it("falls back for other origins and auth routes", () => {
    for (const value of [
      null,
      "",
      "https://evil.example/x",
      "//evil.example",
      "/\\evil.example",
      "inventory",
      "/login?next=/x",
      "/callback",
      "/api/inventory"
    ]) {
      expect(returnPath(value)).toBe("/orders")
    }
  })
})
