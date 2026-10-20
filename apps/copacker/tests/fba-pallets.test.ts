import { packingSchema } from "@repo/aisle"
import { PDFDocument } from "pdf-lib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { chooseTransportationOption, fbaPalletLabelFile, palletConfiguration } from "../src/server/fba-shipments"
import { bagOrder, bagPacking } from "../src/stories/fixtures/packing"

const option = (shippingMode: string, shippingSolution = "USE_YOUR_OWN_CARRIER") => ({
  transportationOptionId: `${shippingMode}-${shippingSolution}`,
  shipmentId: "sh1",
  shippingMode,
  shippingSolution,
  preconditions: [],
  carrier: {}
})
const pallet = (palletId: string, cartonIds: string[]) => ({
  palletId,
  length: 120,
  width: 100,
  height: 90,
  weight: 62,
  stackable: false,
  cartonIds
})

describe("FBA shipments on pallets", () => {
  it("books the buyer's own carrier: small parcels for loose cartons, less than a truckload for pallets", () => {
    const options = [
      option("GROUND_SMALL_PARCEL", "AMAZON_PARTNERED_CARRIER"),
      option("FREIGHT_FTL_PALLET"),
      option("GROUND_SMALL_PARCEL"),
      option("FREIGHT_LTL")
    ]
    expect(chooseTransportationOption(options)?.transportationOptionId).toBe("GROUND_SMALL_PARCEL-USE_YOUR_OWN_CARRIER")
    expect(chooseTransportationOption(options, true)?.transportationOptionId).toBe("FREIGHT_LTL-USE_YOUR_OWN_CARRIER")
    expect(chooseTransportationOption(options.slice(0, 2), true)?.shippingMode).toBe("FREIGHT_FTL_PALLET")
    // A parcel option can't take pallet labels, so pallets without freight get no option at all.
    expect(chooseTransportationOption([option("GROUND_SMALL_PARCEL")], true)).toBeNull()
  })

  it("sends each Amazon shipment its whole pallets and the declared value of its goods", () => {
    const packing = packingSchema.parse({
      ...bagPacking(),
      palletized: true,
      pallets: [pallet("1", ["A1", "B1"]), pallet("2", ["C1"])]
    })
    const shipments = [
      { cartonId: "A1", shipmentId: "sh1" },
      { cartonId: "B1", shipmentId: "sh1" },
      { cartonId: "C1", shipmentId: "sh2" }
    ]
    expect(palletConfiguration(bagOrder, packing, shipments, "sh1")).toEqual({
      pallets: [
        {
          quantity: 1,
          dimensions: { length: 120, width: 100, height: 90, unitOfMeasurement: "CM" },
          weight: { value: 62, unit: "KG" },
          stackability: "NON_STACKABLE"
        }
      ],
      // A1 and B1 hold 90 bags at $1.80 and 50 tea towels at $1.55.
      freightInformation: { declaredValue: { amount: 239.5, code: "USD" }, freightClass: "NONE" }
    })
    expect(palletConfiguration(bagOrder, { ...packing, palletized: false }, shipments, "sh1")).toEqual({})
  })

  it("refuses a pallet whose cartons Amazon sends to two warehouses", () => {
    const packing = packingSchema.parse({
      ...bagPacking(),
      palletized: true,
      pallets: [pallet("1", ["A1", "B1", "C1"])]
    })
    expect(() =>
      palletConfiguration(
        bagOrder,
        packing,
        [
          { cartonId: "A1", shipmentId: "sh1" },
          { cartonId: "B1", shipmentId: "sh1" },
          { cartonId: "C1", shipmentId: "sh2" }
        ],
        "sh1"
      )
    ).toThrow("Amazon is sending the cartons on pallet 1 to different warehouses.")
  })

  describe("pallet labels", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // Amazon's labels for one of its shipments: four pages for each pallet, each page as wide as its shipment's number
    // and the page's place in the file, so the pages can be told apart.
    async function sheet(shipment: number, pallets: number) {
      const pdf = await PDFDocument.create()
      for (let page = 0; page < pallets * 4; page++) {
        pdf.addPage([shipment * 100 + page, 400])
      }
      return pdf.save()
    }

    it("keeps each pallet's four labels together, the pallets in packing order", async () => {
      const files: Record<string, Uint8Array> = { FBA18AAAA: await sheet(1, 2), FBA18BBBB: await sheet(2, 1) }
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => new Response(Buffer.from(files[new URL(String(url)).pathname.slice(1)]!)))
      )
      const api = {
        fbaPalletLabels: vi.fn<(shipmentId: string, pallets: number) => Promise<string>>(
          async (shipmentId) => `https://fba-labels.s3.amazonaws.com/${shipmentId}`
        )
      }
      const bytes = await fbaPalletLabelFile(
        api,
        [pallet("1", ["A1", "B1"]), pallet("2", ["C1"]), pallet("3", ["D1"])],
        [
          { cartonId: "A1", labelNumber: "FBA18AAAAU000001", destinationCode: "SMF3", amazonShipmentId: "FBA18AAAA" },
          { cartonId: "B1", labelNumber: "FBA18AAAAU000002", destinationCode: "SMF3", amazonShipmentId: "FBA18AAAA" },
          { cartonId: "C1", labelNumber: "FBA18BBBBU000003", destinationCode: "ONT8", amazonShipmentId: "FBA18BBBB" },
          { cartonId: "D1", labelNumber: "FBA18AAAAU000004", destinationCode: "SMF3", amazonShipmentId: "FBA18AAAA" }
        ]
      )
      expect(api.fbaPalletLabels.mock.calls).toEqual([
        ["FBA18AAAA", 2],
        ["FBA18BBBB", 1]
      ])
      const widths = (await PDFDocument.load(bytes!)).getPages().map((page) => page.getWidth())
      expect(widths).toEqual([100, 101, 102, 103, 200, 201, 202, 203, 104, 105, 106, 107])
    })

    it("refuses labels that don't divide among the shipment's pallets, and asks for none without labelled cartons", async () => {
      const file = await sheet(1, 1)
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async () => new Response(Buffer.from(file.slice())))
      )
      const api = {
        fbaPalletLabels: vi.fn<() => Promise<string>>(async () => "https://fba-labels.s3.amazonaws.com/FBA18AAAA")
      }
      const labels = [
        { cartonId: "A1", labelNumber: "FBA18AAAAU000001", destinationCode: "SMF3", amazonShipmentId: "FBA18AAAA" },
        { cartonId: "C1", labelNumber: "FBA18AAAAU000002", destinationCode: "SMF3", amazonShipmentId: "FBA18AAAA" }
      ]
      // Four pages for three pallets, and for two: two labels each aren't Amazon's four.
      await expect(
        fbaPalletLabelFile(api, [pallet("1", ["A1"]), pallet("2", ["C1"]), pallet("3", ["C1"])], labels)
      ).rejects.toThrow("Amazon's pallet labels don't match the shipment's pallets")
      await expect(fbaPalletLabelFile(api, [pallet("1", ["A1"]), pallet("2", ["C1"])], labels)).rejects.toThrow(
        "Amazon's pallet labels don't match the shipment's pallets"
      )
      expect(await fbaPalletLabelFile(api, [pallet("1", ["Z1"])], labels)).toBeUndefined()
      expect(api.fbaPalletLabels).toHaveBeenCalledTimes(2)
    })
  })
})
