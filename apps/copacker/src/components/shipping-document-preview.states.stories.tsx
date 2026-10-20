import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { shippingSettingsKey } from "@/documents/shipping-model"
import { ready, scenario, shippingDocumentStory } from "@/stories/shipping-documents"

const meta = preview.meta({
  ...shippingDocumentStory,
  title: "Components/Shipping documents/States"
})

export const Loading = meta.story({
  args: { renderPdf: () => new Promise<Blob>(() => undefined) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Preparing PDF")
    await expect(canvas.getByRole("button", { name: "Download PDF" })).toBeDisabled()
  }
})

export const Failure = meta.story({
  args: {
    renderPdf: async () => {
      throw new Error("Render unavailable")
    }
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The PDF could not be generated")
  }
})

export const MissingCarrierAssignment = meta.story({
  args: { data: scenario("missing-label") },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("F1: Carrier label assignment missing")
    await expect(canvas.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument()
  }
})
export const MissingShippingAddress = meta.story({
  args: {
    data: { ...scenario("parcel-pickup"), destination: { ...scenario("parcel-pickup").destination, address: [] } }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("A shipping address is missing")
    await expect(canvas.getByRole("button", { name: /^Download PDF$/ })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Download settings" })).toBeEnabled()
  }
})

export const RememberDownloadSettings = meta.story({
  play: async (context) => {
    await ready(context)
    const { canvas, canvasElement } = context
    const screen = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole("button", { name: "Download settings" }))
    await userEvent.click(screen.getByRole("combobox", { name: "Page size" }))
    await userEvent.click(screen.getByRole("option", { name: "US Letter" }))
    await expect(screen.getByRole("combobox", { name: "Language" })).toBeVisible()
    await expect(screen.queryByRole("combobox", { name: "Reading direction" })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(shippingSettingsKey) ?? "{}")).toMatchObject({ paper: "LETTER" })
    )
    await userEvent.keyboard("{Escape}")
    await ready(context)
    await expect(canvas.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "download",
      expect.stringContaining("LETTER")
    )
  }
})
