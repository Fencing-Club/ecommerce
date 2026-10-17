import { http, HttpResponse } from "msw"
import { PDFDocument } from "pdf-lib"
import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { shippingSettingsKey } from "@/components/shipping-document-preview"
import { portalPage } from "@/stories/server"
import { ready, scenario } from "@/stories/shipping-documents"
import ShipmentPacketPage from "./page"

const id = "9ce7504a-df81-4255-9436-f4181c941071"
const meta = preview.meta({
  title: "Pages/Shared/Shipments/Supplier packet",
  component: ShipmentPacketPage,
  ...portalPage(`/shipments/${id}/packet`, "supplier"),
  args: {
    page: {
      id,
      orderId: "0ab1b779-3d72-4384-9e4e-136871c1d51d",
      version: "released-snapshot",
      data: scenario("agl-awd"),
      hasProductLabels: false
    }
  },
  beforeEach: ({ msw }) => {
    localStorage.removeItem(shippingSettingsKey)
    msw.use(
      http.get(`/api/shipments/${id}/packet`, async ({ request }) => {
        if (new URL(request.url).searchParams.get("section") === "verify") {
          return new HttpResponse(null, { status: 204 })
        }
        const pdf = await PDFDocument.create()
        pdf.addPage([288, 432]).drawText("STORYBOOK LABEL FIXTURE", { x: 18, y: 390, size: 12 })
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
    page: { unavailable: true, id, message: "Complete the shipment details before downloading the supplier packet." }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Complete the shipment details")
    await expect(canvas.getByRole("button", { name: "Back to shipment" })).toHaveAttribute("href", `/shipments/${id}`)
    await expect(canvas.queryByRole("button", { name: "Download packet" })).not.toBeInTheDocument()
  }
})
