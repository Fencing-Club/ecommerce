import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import { ShopifyPermissionError, ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { describe, expect, it } from "vitest"
import { ReconnectRequiredError } from "../src/server/errors"
import { describeError, stockErrorCode } from "../src/server/stock"

describe("Stock refresh failures", () => {
  it("says what the person can do about the failure", () => {
    expect(stockErrorCode(new ShopifyPermissionError("scope"))).toBe("shopify_permissions")
    expect(stockErrorCode(new ReconnectRequiredError("renew"))).toBe("reconnect")
    expect(stockErrorCode(new ShopifyRequestError(401))).toBe("reconnect")
    expect(stockErrorCode(new ProviderError(403, null, "denied"))).toBe("reconnect")
    expect(stockErrorCode(new ShopifyRequestError(429))).toBe("provider_unavailable")
    expect(stockErrorCode(new ProviderError(503, "req", "down"))).toBe("provider_unavailable")
    expect(stockErrorCode(new DOMException("slow", "TimeoutError"))).toBe("provider_unavailable")
    expect(stockErrorCode(new Error("Shopify stock page or store identity is invalid"))).toBe("refresh_failed")
    expect(stockErrorCode("not an error")).toBe("refresh_failed")
  })
  it("logs the status and the chain of causes", () => {
    const error = new Error("Stock refresh failed", { cause: new ShopifyRequestError(502) })
    expect(describeError(error)).toEqual({
      name: "Error",
      message: "Stock refresh failed",
      cause: { name: "Error", message: "Shopify request failed (502)", status: 502 }
    })
  })
})
