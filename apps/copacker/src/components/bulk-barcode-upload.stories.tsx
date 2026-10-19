import { delay, http, HttpResponse } from "msw"
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { BulkBarcodeUpload } from "./bulk-barcode-upload"

const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" })

// Each upload the story sent: the file and the SKU it was given, if any.
let uploads: { file: string; sku: string | null }[] = []

const variants: Record<string, { variantId: string; product: string; variant: string | null }> = {
  "TOTE-NAT": { variantId: "gid://shopify/ProductVariant/1001", product: "Canvas tote bag", variant: "Natural" },
  "TOTE-BLK": { variantId: "gid://shopify/ProductVariant/1002", product: "Canvas tote bag", variant: "Black" },
  "APRON-CHR": { variantId: "gid://shopify/ProductVariant/1003", product: "Linen apron", variant: null }
}

// The upload matches a file to a variation by the SKU in its name, or the SKU it was given.
const uploadApi = http.post("/api/inventory/barcodes", async ({ request }) => {
  const form = await request.formData()
  const file = form.get("file")
  const name = file instanceof File ? file.name : ""
  const given = form.get("sku")
  const sku = typeof given === "string" ? given : name.replace(/\.pdf$/i, "")
  uploads.push({ file: name, sku: typeof given === "string" ? given : null })
  const target = variants[sku]
  if (!target) {
    return HttpResponse.json({ error: `No variation has the SKU ${sku}` }, { status: 404 })
  }
  return HttpResponse.json({
    name,
    bytes: 8,
    uploadedAt: new Date().toISOString(),
    replaced: sku === "TOTE-BLK",
    target: { ...target, sku }
  })
})

async function openSheet() {
  await userEvent.click(screen.getByRole("button", { name: "Upload barcodes" }))
  return within(await screen.findByRole("dialog", { name: "Upload barcodes" }))
}

// The drop zone's file input, which a click on the zone opens.
function fileInput(sheet: ReturnType<typeof within>) {
  const input = sheet
    .getByRole("button", { name: "Choose barcode PDFs" })
    .parentElement?.querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("The drop zone has no file input")
  }
  return input
}

const meta = preview.meta({
  title: "Components/Products/Bulk barcode upload",
  component: BulkBarcodeUpload,
  args: { onChanged: fn() },
  beforeEach: ({ msw }) => {
    uploads = []
    msw.use(uploadApi)
  }
})

export const UploadMany = meta.story({
  play: async ({ args }) => {
    const sheet = await openSheet()
    await expect(sheet.getByText("Name each PDF after its SKU, such as ABC-123.pdf")).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "Upload file" })).toBeDisabled()

    await userEvent.upload(fileInput(sheet), [pdf("TOTE-NAT.pdf"), pdf("TOTE-XL.pdf"), pdf("APRON-CHR.pdf")])
    await expect(await sheet.findByText("3 PDFs chosen")).toBeInTheDocument()
    await userEvent.click(sheet.getByRole("button", { name: "Upload 3 files" }))

    const results = await sheet.findByRole("list", { name: "Upload results" })
    await expect(await sheet.findByText("2 of 3 saved")).toBeInTheDocument()
    await expect(within(results).getByText("Saved for Canvas tote bag, Natural (TOTE-NAT)")).toBeInTheDocument()
    await expect(within(results).getByText("Saved for Linen apron (APRON-CHR)")).toBeInTheDocument()
    await expect(within(results).getByText("No variation has the SKU TOTE-XL")).toBeInTheDocument()
    await expect(uploads).toEqual([
      { file: "TOTE-NAT.pdf", sku: null },
      { file: "TOTE-XL.pdf", sku: null },
      { file: "APRON-CHR.pdf", sku: null }
    ])
    await expect(args.onChanged).toHaveBeenCalledOnce()

    // A file whose SKU matched nothing can be saved to another SKU.
    const sku = within(results).getByRole("textbox", { name: "SKU for TOTE-XL.pdf" })
    // Its name reads left to right in every language, in its row and in the SKU's label.
    const names = within(results).getAllByText("TOTE-XL.pdf")
    await expect(names).toHaveLength(2)
    for (const name of names) {
      await expect(name).toHaveAttribute("dir", "ltr")
    }
    await expect(within(results).getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(sku, "TOTE-BLK")
    await userEvent.click(within(results).getByRole("button", { name: "Save" }))
    await expect(await within(results).findByText("Replaced for Canvas tote bag, Black (TOTE-BLK)")).toBeInTheDocument()
    await expect(uploads.at(-1)).toEqual({ file: "TOTE-XL.pdf", sku: "TOTE-BLK" })
    await expect(args.onChanged).toHaveBeenCalledTimes(2)
  }
})

// Anything that isn't a PDF is left out, and said so.
export const NotPdfs = meta.story({
  play: async () => {
    const sheet = await openSheet()
    const upload = userEvent.setup({ applyAccept: false })
    await upload.upload(fileInput(sheet), [
      pdf("TOTE-NAT.pdf"),
      new File(["sku,qty"], "labels.csv", { type: "text/csv" })
    ])
    await expect(await sheet.findByText("1 PDF chosen")).toBeInTheDocument()
    await expect(sheet.getByText("Left out 1 file that isn’t a PDF up to 32 MB")).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "Upload file" })).toBeEnabled()
  }
})

// While files upload, the list shows progress and the zone and button wait.
export const Uploading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/inventory/barcodes", async () => {
        await delay("infinite")
        return HttpResponse.json({})
      })
    )
  },
  play: async () => {
    const sheet = await openSheet()
    await userEvent.upload(fileInput(sheet), [pdf("TOTE-NAT.pdf"), pdf("TOTE-BLK.pdf")])
    await userEvent.click(await sheet.findByRole("button", { name: "Upload 2 files" }))
    await expect(await sheet.findByText("Uploading 1 of 2…")).toBeInTheDocument()
    await expect(sheet.getByText("Waiting")).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "Uploading…" })).toBeDisabled()
  }
})

// A failure that another SKU can't fix offers no retry.
export const UploadFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/inventory/barcodes", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ args }) => {
    const sheet = await openSheet()
    await userEvent.upload(fileInput(sheet), pdf("TOTE-NAT.pdf"))
    await userEvent.click(await sheet.findByRole("button", { name: "Upload file" }))
    await expect(await sheet.findByText("Couldn’t upload the barcode. Try again.")).toBeInTheDocument()
    await expect(sheet.getByText("0 of 1 saved")).toBeInTheDocument()
    await expect(sheet.queryByRole("textbox")).toBeNull()
    await expect(args.onChanged).not.toHaveBeenCalled()
  }
})

// Closing the panel clears what was chosen.
export const CloseClears = meta.story({
  play: async () => {
    const sheet = await openSheet()
    await userEvent.upload(fileInput(sheet), pdf("TOTE-NAT.pdf"))
    await expect(await sheet.findByText("1 PDF chosen")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const reopened = await openSheet()
    await expect(reopened.getByText("Choose PDFs or drop them here")).toBeInTheDocument()
  }
})

export const DropAndPaste = meta.story({
  play: async () => {
    const sheet = await openSheet()
    const zone = sheet.getByRole("button", { name: "Choose barcode PDFs" })
    const transfer = new DataTransfer()
    transfer.items.add(pdf("TOTE-NAT.pdf"))
    transfer.items.add(new File([new Uint8Array(32 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }))
    fireEvent(zone, new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }))
    await waitFor(() => expect(sheet.getByText("1 PDF chosen")).toBeVisible())
    await expect(sheet.getByText("Left out 1 file that isn’t a PDF up to 32 MB")).toBeVisible()
    const clipboard = new DataTransfer()
    clipboard.items.add(pdf("TOTE-BLK.pdf"))
    clipboard.items.add(pdf("APRON-CHR.pdf"))
    fireEvent(zone, new ClipboardEvent("paste", { bubbles: true, clipboardData: clipboard }))
    await expect(await sheet.findByText("2 PDFs chosen")).toBeVisible()
    await userEvent.click(sheet.getByRole("button", { name: "Upload 2 files" }))
    await expect(await sheet.findByText("2 of 2 saved")).toBeVisible()
    await expect(uploads.map((upload) => upload.file)).toEqual(["TOTE-BLK.pdf", "APRON-CHR.pdf"])
  }
})
