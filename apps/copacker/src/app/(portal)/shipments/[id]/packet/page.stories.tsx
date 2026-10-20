import { http, HttpResponse } from "msw"
import { PDFDocument } from "pdf-lib"
import { expect, mocked, spyOn, userEvent, waitFor } from "storybook/test"
import invariant from "tiny-invariant"
import preview from "#.storybook/preview"
import { shippingSettingsKey } from "@/documents/shipping-model"
import { portalPage } from "@/stories/server"
import { ready, scenario } from "@/stories/shipping-documents"
import ShipmentPacketPage from "./page"

const id = "9ce7504a-df81-4255-9436-f4181c941071"
const released = {
  id,
  orderId: "0ab1b779-3d72-4384-9e4e-136871c1d51d",
  version: "released-snapshot",
  data: scenario("agl-awd"),
  hasProductLabels: false
}
const meta = preview.meta({
  title: "Pages/Shipments/Supplier packet",
  component: ShipmentPacketPage,
  ...portalPage(`/shipments/${id}/packet`, "supplier"),
  args: { page: released },
  beforeEach: ({ msw }) => {
    localStorage.removeItem(shippingSettingsKey)
    msw.use(
      http.get(`/api/shipments/${id}/packet`, async ({ request }) => {
        if (new URL(request.url).searchParams.get("section") === "verify") {
          return new HttpResponse(null, { status: 204 })
        }
        // Product labels come on small pages, carton labels on 4 × 6 inch ones.
        const small = new URL(request.url).searchParams.get("section") === "product_labels"
        const pdf = await PDFDocument.create()
        pdf.addPage(small ? [144, 72] : [288, 432]).drawText("STORYBOOK LABEL FIXTURE", { x: 8, y: 20, size: 8 })
        return new HttpResponse(await pdf.save(), { headers: { "Content-Type": "application/pdf" } })
      })
    )
  }
})

export const AglPickup = meta.story({
  play: async (context) => {
    await ready(context)
    const { canvas } = context
    await expect(canvas.getByRole("button", { name: "Carton labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${id}/packet?section=carton_labels&version=released-snapshot`
    )
    await expect(canvas.queryByRole("button", { name: "Product labels" })).not.toBeInTheDocument()
    await expect(canvas.queryByRole("button", { name: "Carrier labels" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: "Download packet" })).toBeEnabled()
  }
})

// The packet runs in the order the supplier works: the checklist, the product labels, the packing list, then the carton
// labels. The packing list pairs each carton with its labels, so the carton label reference stays out.
export const PacketOrder = meta.story({
  args: { page: { ...released, hasProductLabels: true } },
  beforeEach: () => {
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    return () => click.mockRestore()
  },
  play: async (context) => {
    await ready(context)
    const { canvas } = context
    await expect(
      canvas.getAllByRole("button", { name: /labels$/ }).map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Product labels", "Carton labels"])
    await userEvent.click(canvas.getByRole("button", { name: "Download packet" }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce(), { timeout: 30000 })
    const [link] = mocked(HTMLAnchorElement.prototype.click).mock.contexts
    invariant(link instanceof HTMLAnchorElement)
    const pdf = await PDFDocument.load(await (await fetch(link.href)).arrayBuffer())
    await expect(
      pdf
        .getPages()
        .map((page) => page.getSize())
        .map(({ width, height }) => [Math.round(width), Math.round(height)])
    ).toEqual([
      [595, 842],
      [144, 72],
      [595, 842],
      [288, 432]
    ])
  }
})

export const RevisionChanged = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get(`/api/shipments/${id}/packet`, () => new HttpResponse("Packet changed", { status: 409 })))
  },
  play: async (context) => {
    await ready(context)
    await userEvent.click(context.canvas.getByRole("button", { name: "Download packet" }))
    await expect(await context.canvas.findByRole("alert")).toHaveTextContent("Refresh the page")
  }
})

export const IncompletePacket = meta.story({
  args: {
    page: {
      unavailable: true,
      id,
      labelSections: [],
      message: "Complete the shipment details before downloading the supplier packet."
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Complete the shipment details")
    await expect(canvas.getByRole("button", { name: "Back to shipment" })).toHaveAttribute("href", `/shipments/${id}`)
    // The packing list needs neither the destination nor label assignments, so it still downloads.
    await expect(canvas.getByRole("button", { name: "Download packing list" })).toHaveTextContent("Packing list")
    await expect(canvas.queryByRole("button", { name: "Download packet" })).not.toBeInTheDocument()
  }
})

export const LabelsWithoutReferenceDocuments = meta.story({
  args: {
    page: {
      unavailable: true,
      id,
      message: "Complete the shipment details before downloading the supplier packet.",
      labelSections: ["product_labels", "carton_labels", "carrier_labels"]
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Carton labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${id}/packet?section=carton_labels`
    )
    await expect(canvas.getByRole("button", { name: "Carrier labels" })).toHaveAttribute("download")
    // The packing list, then the labels in the packet’s order.
    await expect(
      canvas.getAllByRole("button", { name: /^Download packing list$|labels$/ }).map((button) => button.textContent)
    ).toEqual(["Packing list", "Product labels", "Carton labels", "Carrier labels"])
  }
})
