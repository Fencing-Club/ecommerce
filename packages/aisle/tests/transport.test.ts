import { describe, expect, it } from "vitest"
import { shipmentLabelRequirements, transportInstructions, transportProfiles, transportSchema } from "../src/transport"

describe("shipment label requirements", () => {
  it("requires an explicit transport choice rather than inferring pickup from Amazon", () => {
    expect(shipmentLabelRequirements("amazon", null)).toEqual({
      amazonCartonLabels: true,
      needsTransport: true,
      carrierLabels: false
    })
    expect(shipmentLabelRequirements("warehouse", null).needsTransport).toBe(false)
  })
  it("keeps receiving labels for AGL and allows a booking to override its carrier-label default", () => {
    const agl = transportSchema.parse({ service: "agl", handoff: "supplier", ...transportProfiles.agl })
    expect(shipmentLabelRequirements("amazon", agl)).toEqual({
      amazonCartonLabels: true,
      needsTransport: false,
      carrierLabels: false
    })
    expect(shipmentLabelRequirements("amazon", { ...agl, carrierLabels: "per_carton" }).carrierLabels).toBe(true)
    expect(transportInstructions(agl).join(" ")).toContain("pickup from the supplier")
    expect(transportInstructions({ ...agl, handoff: "forwarder", collection: "dropoff" }).join(" ")).toContain(
      "freight forwarder delivers"
    )
  })
})
