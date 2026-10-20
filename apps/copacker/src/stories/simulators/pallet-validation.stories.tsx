import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { PalletSimulator } from "./pallet-simulator"
import { reportedCodes } from "./report"

const meta = preview.meta({
  title: "Simulators/Pallet validation",
  component: PalletSimulator,
  parameters: { layout: "fullscreen" }
})

export const WithinLimits = meta.story({
  args: { dataSet: "withinLimits" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual([])
  }
})

export const LoadOverTheEdges = meta.story({
  args: { dataSet: "footprint" },
  play: async ({ canvasElement, canvas }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["palletFootprint"])
    await expect(canvas.getByRole("spinbutton", { name: "Pallet 1: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Pallet 2: Width (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.getByRole("spinbutton", { name: "Pallet 2: Length (cm)" })).not.toHaveAttribute("aria-invalid")
  }
})

export const TooTall = meta.story({
  args: { dataSet: "height" },
  play: async ({ canvasElement, canvas }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["palletHeight", "stackableHeight"])
    await expect(canvas.getByRole("spinbutton", { name: "Pallet 3: Height (cm)" })).not.toHaveAttribute("aria-invalid")
  }
})

export const TooHeavy = meta.story({
  args: { dataSet: "weight" },
  play: async ({ canvasElement, canvas }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["palletWeight"])
    await expect(canvas.getByRole("spinbutton", { name: "Pallet 1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  }
})

export const AwdPallets = meta.story({
  name: "AWD pallets",
  args: { dataSet: "awd" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["palletHeight", "palletWeight"])
  }
})

export const BuyersWarehouse = meta.story({
  name: "Buyer's warehouse",
  args: { dataSet: "warehouse" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual([])
  }
})

export const CartonsAndPalletsThatDontMatch = meta.story({
  name: "Cartons and pallets that don't match",
  args: { dataSet: "structure" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement).toSorted()).toEqual(
      ["cartonsOffPallets", "duplicatePallet", "emptyPallet", "palletCartonTwice", "unknownPalletCarton"].toSorted()
    )
  }
})

export const NoPallets = meta.story({
  args: { dataSet: "noPallets" },
  play: async ({ canvasElement }) => {
    await expect(reportedCodes(canvasElement)).toEqual(["noPallets"])
  }
})
