import { randomBytes, createHmac } from "node:crypto"
import { PDFDocument, PDFName, PDFString } from "pdf-lib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { encrypt, decrypt, verifyShopifyHmac } from "../src/server/security"
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
