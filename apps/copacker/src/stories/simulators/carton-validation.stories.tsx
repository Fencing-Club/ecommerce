import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { CartonCatalog } from "./carton-catalog"
import { CartonSimulator } from "./carton-simulator"
import { reportedCodes } from "./report"

const meta = preview.meta({
  title: "Simulators/Carton validation",
  component: CartonSimulator,
  // A data set from the URL loads afresh.
  render: (args) => <CartonSimulator key={args.dataSet} {...args} />,
  parameters: { layout: "fullscreen" }
})

// Every carton error by code, the rule it breaks and its message, built from the carton policies; every code has an
// example.
export const EveryError = meta.story({
  render: () => <CartonCatalog />,
  play: async ({ canvas }) => {
    const table = canvas.getByRole("table", { name: "Every carton error" })
    await expect(within(table).queryAllByText("No example produces this code yet")).toEqual([])
    await expect(within(table).getAllByRole("row").length).toBeGreaterThan(10)
  }
})

// The simulator with an example from Every error loaded, as each row there links to it by the example's ID.
export const ErrorExample = meta.story({
  name: "Error example",
  args: { dataSet: "awd_us-oneSku" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["oneSku"])
  }
})

export const WithinLimits = meta.story({
  args: { dataSet: "withinLimits" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual([])
  }
})

export const FbaSizeAndWeight = meta.story({
  name: "FBA size and weight",
  args: { dataSet: "fbaSize" },
  play: async ({ canvasElement, canvas }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["cartonSize", "cartonWeight"])
    // B1 fits lying either way round; B2 is too wide.
    await expect(canvas.getByRole("spinbutton", { name: "Carton B2: Width (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.queryByRole("spinbutton", { name: "Carton B1: Width (cm)" })).not.toHaveAttribute(
      "aria-invalid"
    )
  }
})

export const FbaSingleUnit = meta.story({
  name: "FBA single oversize unit",
  args: { dataSet: "fbaSingleUnit" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton", { name: "Carton C1: Length (cm)" })).not.toHaveAttribute("aria-invalid")
    await expect(canvas.getByRole("spinbutton", { name: "Carton C2: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  }
})

export const AwdLimits = meta.story({
  name: "AWD units, size and weight",
  args: { dataSet: "awdLimits" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["unitsPerCarton", "cartonSize", "cartonWeight"])
  }
})

export const AwdMixedSkus = meta.story({
  name: "AWD mixed SKUs",
  args: { dataSet: "awdMixed" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["oneSku"])
  }
})

export const AwdPackingTemplate = meta.story({
  name: "AWD packing template",
  args: { dataSet: "awdTemplate" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["samePacking"])
  }
})

export const MissingIdentifiers = meta.story({
  name: "Missing ASIN and FNSKU",
  args: { dataSet: "identifiers" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["missingAsin", "missingFnsku"])
  }
})

export const IncompleteMultipacks = meta.story({
  name: "Incomplete multi-packs",
  args: { dataSet: "multipacks" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["incompletePacks"])
  }
})

export const OverQuantity = meta.story({
  name: "More than the PO orders",
  args: { dataSet: "overQuantity" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["overQuantity"])
  }
})

export const RepeatedCartonAndProduct = meta.story({
  args: { dataSet: "duplicates" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["duplicateCarton", "repeatedProduct"])
  }
})

export const MixedNetworks = meta.story({
  name: "FBA and AWD in one carton",
  args: { dataSet: "mixedNetworks" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toContain("mixedNetworks")
  }
})

export const BuyersWarehouse = meta.story({
  name: "Buyer's warehouse",
  args: { dataSet: "warehouse" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual([])
  }
})
