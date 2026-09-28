import { randomBytes, createHmac } from "node:crypto"
import { PDFDocument, PDFName, PDFString } from "pdf-lib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { encrypt, decrypt, isAppOrigin, returnPath, siteUrlFor, verifyShopifyHmac } from "../src/server/security"
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
describe("The app's addresses", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it("accepts requests from APP_URL and its aliases only", () => {
    vi.stubEnv("APP_URL", "https://copacker.example")
    vi.stubEnv("APP_ALIAS_URLS", "https://staging.copacker.example/, not a url")
    expect(isAppOrigin("https://copacker.example")).toBe(true)
    expect(isAppOrigin("https://staging.copacker.example")).toBe(true)
    expect(isAppOrigin("https://evil.example")).toBe(false)
    expect(isAppOrigin("http://copacker.example")).toBe(false)
    expect(isAppOrigin(null)).toBe(false)
  })
  it("returns to the address a request came in on, or else APP_URL", () => {
    vi.stubEnv("APP_URL", "https://copacker.example")
    vi.stubEnv("APP_ALIAS_URLS", "https://staging.copacker.example")
    expect(siteUrlFor(new Headers({ host: "staging.copacker.example" }))).toBe("https://staging.copacker.example")
    expect(siteUrlFor(new Headers({ "x-forwarded-host": "staging.copacker.example", host: "10.0.0.1:3000" }))).toBe(
      "https://staging.copacker.example"
    )
    expect(siteUrlFor(new Headers({ host: "evil.example" }))).toBe("https://copacker.example")
    expect(siteUrlFor(new Headers())).toBe("https://copacker.example")
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
      "/login/google",
      "/signup",
      "/verify-email",
      "/forgot-password?email=a@b.example",
      "/reset-password?token=abc",
      "/callback",
      "/api/inventory"
    ]) {
      expect(returnPath(value)).toBe("/orders")
    }
  })
})
