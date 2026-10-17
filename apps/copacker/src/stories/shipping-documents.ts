import { expect, within } from "storybook/test"
import { ShippingDocumentPreview, shippingSettingsKey } from "@/components/shipping-document-preview"
import { shippingOverview, shippingScenarios } from "./fixtures/shipping-documents"

export function scenario(id: string) {
  const item = shippingScenarios.find((scenario) => scenario.id === id)
  if (!item) {
    throw new Error(`Missing document fixture: ${id}`)
  }
  return item.data
}

export const shippingDocumentStory = {
  component: ShippingDocumentPreview,
  args: { data: scenario("parcel-pickup"), shipments: shippingOverview },
  parameters: { layout: "fullscreen" as const },
  beforeEach: () => {
    if (process.env.NODE_ENV === "test") {
      for (const key of Object.keys(localStorage).filter((key) => key.startsWith(shippingSettingsKey))) {
        localStorage.removeItem(key)
      }
    }
  }
}

export const ready = async (
  { canvas }: { canvas: ReturnType<typeof within> },
  names = { download: "Download PDF", page: "PDF page 1" }
) => {
  const download = await canvas.findByRole("link", { name: names.download }, { timeout: 45000 })
  await expect(download).toHaveAttribute("download", expect.stringMatching(/\.pdf$/))
  await expect(canvas.getByRole("figure", { name: names.page })).toBeVisible()
  const url = download.getAttribute("href")
  if (!url) {
    throw new Error("Download URL missing")
  }
  const bytes = await (await fetch(url)).arrayBuffer()
  await expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
}
