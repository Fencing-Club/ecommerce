import { http, HttpResponse } from "msw"
import { expect, fn, mocked, screen, spyOn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { uploadedBarcode } from "@/stories/fixtures/catalog"
import { member } from "@/stories/workspace"
import { type BarcodeVariation, ProductBarcodes } from "./product-barcodes"

const variations: BarcodeVariation[] = [
  { variantId: "gid://shopify/ProductVariant/1001", title: "Natural", barcode: null, fnsku: "X00TOTE001" },
  { variantId: "gid://shopify/ProductVariant/1002", title: "Black", barcode: null, fnsku: null },
  { variantId: "gid://shopify/ProductVariant/1003", title: "Striped", barcode: uploadedBarcode, fnsku: null }
]

const pdf = () => new File(["%PDF-1.7"], "TOTE-NAT.pdf", { type: "application/pdf" })

// The label requests each story made: previews and downloads, uploads and removals.
let requests: { method: string; variantId: string | null; file?: string }[] = []

const labelApi = [
  http.get("/api/inventory/barcodes", ({ request }) => {
    requests.push({ method: "GET", variantId: new URL(request.url).searchParams.get("variantId") })
    return new HttpResponse(new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename*=UTF-8''TOTE-NAT%20label.pdf"
      }
    })
  }),
  http.post("/api/inventory/barcodes", async ({ request }) => {
    const form = await request.formData()
    const file = form.get("file")
    requests.push({
      method: "POST",
      variantId: String(form.get("variantId")),
      file: file instanceof File ? file.name : undefined
    })
    return HttpResponse.json({
      ...uploadedBarcode,
      name: "TOTE-NAT.pdf",
      replaced: false,
      target: { variantId: variations[0]!.variantId, sku: "TOTE-NAT", product: "Canvas tote bag", variant: "Natural" }
    })
  }),
  http.delete("/api/inventory/barcodes", ({ request }) => {
    requests.push({ method: "DELETE", variantId: new URL(request.url).searchParams.get("variantId") })
    return HttpResponse.json({ ok: true })
  })
]

const meta = preview.meta({
  component: ProductBarcodes,
  args: {
    productTitle: "Canvas tote bag",
    productLabel: "standard",
    variations,
    onChanged: fn()
  } satisfies React.ComponentProps<typeof ProductBarcodes>,
  beforeEach: ({ msw }) => {
    requests = []
    msw.use(...labelApi)
  }
})

export const Standard = meta.story({
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Labels" })
    await expect(within(list).getByText("Standard, FNSKU X00TOTE001")).toBeVisible()
    // Without an FNSKU, the standard label shows the SKU.
    await expect(within(list).getByText("Standard, SKU barcode")).toBeVisible()
    // The uploaded file's name reads left to right in every language.
    const uploaded = within(list).getByText("APRON-CHR.pdf")
    await expect(uploaded).toBeVisible()
    await expect(uploaded).toHaveAttribute("dir", "ltr")
    await expect(uploaded.parentElement).toHaveTextContent("Uploaded, APRON-CHR.pdf")
    await expect(canvas.getByRole("button", { name: "Upload label for Natural" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Replace label for Striped" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Remove uploaded label for Striped" })).toBeVisible()
    await userEvent.hover(canvas.getByRole("button", { name: "Download label for Natural" }))
    await expect(await screen.findByText("Download")).toBeInTheDocument()
  }
})

export const Preview = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Preview label for Natural" }))
    await expect(await canvas.findByTitle("Label for Natural")).toHaveAttribute(
      "src",
      expect.stringMatching(/^blob:.*#toolbar=0&view=FitH$/)
    )
    await expect(requests).toEqual([{ method: "GET", variantId: variations[0]!.variantId }])
    const hide = canvas.getByRole("button", { name: "Hide label for Natural" })
    await expect(hide).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(hide)
    await expect(canvas.queryByTitle("Label for Natural")).toBeNull()
  }
})

// A label that can't be made says why in its row.
export const PreviewFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/inventory/barcodes", () =>
        HttpResponse.json({ error: "Amazon doesn't list an FNSKU for TOTE-BLK" }, { status: 404 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Preview label for Black" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Amazon doesn't list an FNSKU for TOTE-BLK")
  }
})

// A download saves the PDF under the name the server gives it.
export const Download = meta.story({
  beforeEach: () => {
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    return () => click.mockRestore()
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Download label for Natural" }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce())
    const [link] = mocked(HTMLAnchorElement.prototype.click).mock.contexts
    await expect(link instanceof HTMLAnchorElement && link.download).toBe("TOTE-NAT label.pdf")
    await expect(requests).toEqual([{ method: "GET", variantId: variations[0]!.variantId }])
  }
})

export const DownloadFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory/barcodes", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Download label for Natural" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn’t load the label. Try again.")
  }
})

export const Upload = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.upload(canvas.getByLabelText("Label PDF for Natural"), pdf())
    await waitFor(() => expect(args.onChanged).toHaveBeenCalledOnce())
    await expect(requests).toEqual([{ method: "POST", variantId: variations[0]!.variantId, file: "TOTE-NAT.pdf" }])
  }
})

export const UploadFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/inventory/barcodes", () =>
        HttpResponse.json({ error: "The PDF has more than one page" }, { status: 400 })
      )
    )
  },
  play: async ({ canvas, args }) => {
    await userEvent.upload(canvas.getByLabelText("Label PDF for Black"), pdf())
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The PDF has more than one page")
    await expect(args.onChanged).not.toHaveBeenCalled()
  }
})

export const Remove = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove uploaded label for Striped" }))
    await waitFor(() => expect(args.onChanged).toHaveBeenCalledOnce())
    await expect(requests).toEqual([{ method: "DELETE", variantId: variations[2]!.variantId }])
  }
})

// A product that needs its own labels has nothing to show until one is uploaded.
export const UploadedLabels = meta.story({
  args: { productLabel: "uploaded" },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Label missing")).toHaveLength(2)
    await expect(canvas.queryByRole("button", { name: "Preview label for Natural" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Preview label for Striped" })).toBeVisible()
  }
})

export const NoLabel = meta.story({
  args: { productLabel: "none" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon only, FNSKU X00TOTE001")).toBeVisible()
    await expect(canvas.getByText("Amazon only")).toBeVisible()
  }
})

// A product's only variation goes by the product's name.
export const OneVariation = meta.story({
  args: {
    variations: [{ variantId: "gid://shopify/ProductVariant/1003", title: null, barcode: null, fnsku: "X00APRON01" }]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Preview label for Canvas tote bag" })).toBeVisible()
  }
})

// Someone who can only view products previews and downloads labels without changing them.
export const ViewOnly = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download label for Striped" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Replace label for Striped" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Remove uploaded label for Striped" })).toBeNull()
  }
})
