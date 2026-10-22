import { describe, expect, it } from "vitest"
import {
  readTrackingFromBarcodes,
  readTrackingNumber,
  trackingCarrier,
  trackingNumberSchema
} from "../src/tracking-numbers"

describe("reading a carrier label's tracking number from its page text", () => {
  it("finds a UPS number in its printed groups", () => {
    expect(readTrackingNumber("UPS GROUND\nTRACKING #: 1Z 4F7 E21 03 9382 1041 BILLING: P/P")).toBe(
      "1Z4F7E210393821041"
    )
    expect(readTrackingNumber("ship to 1z4f7e21039382 1050")).toBe("1Z4F7E210393821050")
  })

  it("finds another carrier's number on its own line, whatever the heading", () => {
    expect(readTrackingNumber("FedEx\nHome Delivery\nTRK#\n7788 9900 1136")).toBe("778899001136")
    expect(readTrackingNumber("USPS TRACKING # USPS Ship\n9400 1118 9956 1234 5678 23")).toBe("9400111899561234567823")
    expect(readTrackingNumber("DHL Express\nWAYBILL 54 0321 9872")).toBe("5403219872")
  })

  it("takes the carrier's own number ahead of the USPS one for the last leg", () => {
    expect(
      readTrackingNumber("USPS TRACKING # e-VS\n9400 1118 9956 1234 5678 23\nFedEx Tracking ID# 7788 9900 1136")
    ).toBe("778899001136")
  })

  it("finds nothing on a page without a valid number", () => {
    expect(readTrackingNumber("")).toBeNull()
    expect(readTrackingNumber("SHIP TO Amazon ONT8 24300 Nandina Ave")).toBeNull()
    expect(readTrackingNumber("TRACKING # 12")).toBeNull()
    // A number whose check digit is wrong, and the zeros some labels print as filler.
    expect(readTrackingNumber("TRK# 7788 9900 1137")).toBeNull()
    expect(readTrackingNumber("0000 0000 0000 0000 0000 00")).toBeNull()
  })
})

describe("reading a carrier label's tracking number from its barcodes", () => {
  it("reads UPS's number as it is, past the postal barcode", () => {
    expect(readTrackingFromBarcodes(["42092551", "1Z8W2A1E0303760148"])).toBe("1Z8W2A1E0303760148")
  })

  it("reads USPS's number after 420 and the ZIP code", () => {
    expect(readTrackingFromBarcodes(["420925519400111899561200030146"])).toBe("9400111899561200030146")
    expect(readTrackingFromBarcodes(["4209255195349400111899561200030146"])).toBe("9400111899561200030146")
  })

  it("reads FedEx's number from the end of its 96 barcode, ahead of a USPS one", () => {
    expect(readTrackingFromBarcodes(["9622001900000000000000778899011090"])).toBe("778899011090")
    expect(readTrackingFromBarcodes(["420925519400111899561200030054", "9612019000778899011045"])).toBe("778899011045")
  })

  it("reads nothing from barcodes without a valid number", () => {
    expect(readTrackingFromBarcodes([])).toBeNull()
    expect(readTrackingFromBarcodes(["42092551", "12345"])).toBeNull()
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

describe("a tracking number's carrier", () => {
  it("comes from the number's format and check digit", () => {
    expect(trackingCarrier("1z 999 aa1 01 2345 6784")).toBe("UPS")
    expect(trackingCarrier("")).toBeNull()
    expect(trackingCarrier("12345")).toBeNull()
  })
})
