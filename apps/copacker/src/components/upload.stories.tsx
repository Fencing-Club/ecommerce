import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import type { SetupWorker } from "msw/browser"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { held } from "@/stories/fixtures/shared"
import { Upload } from "./upload"

// Answers document uploads with `answer`, keeping each one's form for the play function to check.
function recordUploads(
  msw: SetupWorker,
  answer: () => Response | Promise<Response> = () => HttpResponse.json({ ok: true })
) {
  const uploads: FormData[] = []
  msw.use(
    http.post("/api/documents", async ({ request }) => {
      uploads.push(await request.formData())
      return answer()
    })
  )
  return uploads
}

const pdf = (name: string) => new File([new Uint8Array(120 * 1024)], name, { type: "application/pdf" })

function fileInput(canvasElement: HTMLElement) {
  const input = canvasElement.querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("The upload has no file input")
  }
  return input
}

function fileName(form: FormData | undefined) {
  const file = form?.get("file")
  return file instanceof File ? file.name : null
}

const meta = preview.meta({
  component: Upload,
  args: { orderId: "order-1045", kind: "invoice" } satisfies React.ComponentProps<typeof Upload>,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>]
})

// An invoice uploads as soon as it's chosen.
export const Invoice = meta.story({
  play: async ({ canvas, canvasElement, msw }) => {
    const uploads = recordUploads(msw)
    await expect(canvas.getByText("Official commercial invoice")).toBeVisible()
    await userEvent.upload(fileInput(canvasElement), pdf("lotus-invoice-8812.pdf"))
    await expect(await canvas.findByText("Uploaded")).toBeVisible()
    await expect(uploads).toHaveLength(1)
    await expect(uploads[0]?.get("orderId")).toBe("order-1045")
    await expect(uploads[0]?.get("kind")).toBe("invoice")
    await expect(uploads[0]?.has("shipmentId")).toBe(false)
    await expect(fileName(uploads[0])).toBe("lotus-invoice-8812.pdf")
    await expect(getRouter().refresh).toHaveBeenCalled()
  }
})

export const ShipmentInvoice = meta.story({
  args: { shipmentId: "shipment-1", label: null },
  play: async ({ canvas, canvasElement, msw }) => {
    const uploads = recordUploads(msw)
    // In a card titled for the document, the field has no label of its own.
    await expect(canvas.queryByText("Official commercial invoice")).toBeNull()
    await userEvent.upload(fileInput(canvasElement), pdf("invoice.pdf"))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await expect(uploads[0]?.get("shipmentId")).toBe("shipment-1")
  }
})

export const Uploading = meta.story({
  play: async ({ canvas, canvasElement, msw }) => {
    recordUploads(msw, held)
    await userEvent.upload(fileInput(canvasElement), pdf("invoice.pdf"))
    await expect(await canvas.findByText("Uploading")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Remove invoice.pdf" })).toBeDisabled()
    await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull()
  }
})

export const Fails = meta.story({
  play: async ({ canvas, canvasElement, msw }) => {
    recordUploads(msw, () => new HttpResponse(null, { status: 500 }))
    await userEvent.upload(fileInput(canvasElement), pdf("invoice.pdf"))
    await expect(await canvas.findByText("Upload failed. Try again.")).toBeVisible()
    // The file stays, with Upload to try again.
    await expect(canvas.getByRole("button", { name: "Upload" })).toBeEnabled()
  }
})

// Product labels are for a variation, which is chosen after the file, so they wait for Upload.
export const ProductLabels = meta.story({
  args: {
    kind: "product_label",
    items: [
      { id: "item-tote", name: "Canvas tote bag", variant: "Natural" },
      { id: "item-apron", name: "Linen apron", variant: "Charcoal" }
    ]
  },
  play: async ({ canvas, canvasElement, msw }) => {
    const uploads = recordUploads(msw)
    await expect(canvas.getByText("One label sheet per variation, up to 32 MB")).toBeVisible()
    await userEvent.upload(fileInput(canvasElement), pdf("apron-labels.pdf"))
    await expect(await canvas.findByText("apron-labels.pdf")).toBeVisible()
    await expect(uploads).toHaveLength(0)
    await userEvent.click(canvas.getByRole("button", { name: "Upload" }))
    await expect(await canvas.findByText("Choose a product variation")).toBeVisible()
    await expect(uploads).toHaveLength(0)
    await userEvent.click(canvas.getByRole("combobox", { name: /Product variation/ }))
    await userEvent.click(await screen.findByRole("option", { name: "Linen apron / Charcoal" }))
    await userEvent.click(canvas.getByRole("button", { name: "Upload" }))
    await expect(await canvas.findByText("Uploaded")).toBeVisible()
    await expect(uploads[0]?.get("itemId")).toBe("item-apron")
    await expect(uploads[0]?.get("kind")).toBe("product_label")
  }
})

// Shipping labels say which page is each carton's label.
export const ShippingLabels = meta.story({
  args: { kind: "shipping_label", shipmentId: "shipment-1", cartons: [{ cartonId: "C-01" }, { cartonId: "C-02" }] },
  play: async ({ canvas, canvasElement, msw }) => {
    const uploads = recordUploads(msw)
    await expect(canvas.getByText("Carrier shipping labels")).toBeVisible()
    await userEvent.upload(fileInput(canvasElement), pdf("ups-labels.pdf"))
    await userEvent.click(await canvas.findByRole("button", { name: "Upload" }))
    await expect(await canvas.findByText("Enter the label page for at least one carton")).toBeVisible()
    await userEvent.type(canvas.getByLabelText("Carton C-02"), "2")
    await userEvent.click(canvas.getByRole("button", { name: "Upload" }))
    await expect(await canvas.findByText("Uploaded")).toBeVisible()
    await expect(JSON.parse(String(uploads[0]?.get("assignments")))).toEqual([{ cartonId: "C-02", page: 2 }])
    // The pages clear once the labels are in.
    await expect(canvas.getByLabelText("Carton C-02")).toHaveValue(null)
  }
})

// Upload without a file asks for one.
export const NoFile = meta.story({
  args: { kind: "shipping_label", cartons: [{ cartonId: "C-01" }] },
  play: async ({ canvas }) => {
    const form = canvas.getByRole("button", { name: /Drop a PDF/ }).closest("form")
    if (!form) {
      throw new Error("The upload has no form")
    }
    form.requestSubmit()
    await expect(await canvas.findByText("Choose a PDF")).toBeVisible()
  }
})

// The document already uploaded shows with Replace; the next one replaces it.
export const Replace = meta.story({
  args: { current: { id: "doc-invoice", name: "lotus-invoice-8790.pdf", size: 180 * 1024 } },
  play: async ({ canvas, canvasElement, msw }) => {
    const uploads = recordUploads(msw)
    await expect(canvas.getByRole("link", { name: "lotus-invoice-8790.pdf" })).toHaveAttribute(
      "href",
      "/api/documents/doc-invoice"
    )
    await expect(canvas.getByRole("button", { name: "Replace lotus-invoice-8790.pdf" })).toBeVisible()
    await userEvent.upload(fileInput(canvasElement), pdf("lotus-invoice-8812.pdf"))
    await waitFor(() => expect(fileName(uploads[0])).toBe("lotus-invoice-8812.pdf"))
  }
})

// The parent's problem, such as a required invoice that's missing, until a file is chosen.
export const Missing = meta.story({
  args: { error: "Upload the commercial invoice" },
  play: async ({ canvas, canvasElement, msw }) => {
    recordUploads(msw, held)
    await expect(canvas.getByText("Upload the commercial invoice")).toBeVisible()
    await userEvent.upload(fileInput(canvasElement), pdf("invoice.pdf"))
    await expect(await canvas.findByText("Uploading")).toBeVisible()
    await expect(canvas.queryByText("Upload the commercial invoice")).toBeNull()
  }
})
