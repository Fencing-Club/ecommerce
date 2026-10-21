import { describe, expect, it } from "vitest"
import { readTrackingNumber, trackingNumberSchema } from "../src/lib/tracking-numbers"

describe("reading a carrier label's tracking number from its page text", () => {
  it("finds a UPS number in its printed groups", () => {
    expect(readTrackingNumber("UPS GROUND TRACKING #: 1Z 4F7 E21 03 9382 1041 BILLING: P/P")).toBe("1Z4F7E210393821041")
    expect(readTrackingNumber("ship to 1z4f7e21039382 1052")).toBe("1Z4F7E210393821052")
  })

  it("finds another carrier's number after its heading", () => {
    expect(readTrackingNumber("FedEx Ground TRK# 7712 3456 7890 0201 ORIGIN ID")).toBe("7712345678900201")
    expect(readTrackingNumber("USPS TRACKING # 9400 1000 0000 0000 0000 00")).toBe("9400100000000000000000")
    expect(readTrackingNumber("DHL Express WAYBILL 12 3456 7890")).toBe("1234567890")
  })

  it("finds nothing on a page without a number", () => {
    expect(readTrackingNumber("")).toBeNull()
    expect(readTrackingNumber("SHIP TO Amazon ONT8 24300 Nandina Ave")).toBeNull()
    expect(readTrackingNumber("TRACKING # 12")).toBeNull()
  })
})

describe("a typed tracking number", () => {
  it("is stored without spaces, in capitals", () => {
    expect(trackingNumberSchema.parse(" 1z 999 aa1 01 2345 6784 ")).toBe("1Z999AA10123456784")
  })

  it("is refused when it isn't one", () => {
    expect(trackingNumberSchema.safeParse("").success).toBe(false)
    expect(trackingNumberSchema.safeParse("12-34").success).toBe(false)
  })
})
