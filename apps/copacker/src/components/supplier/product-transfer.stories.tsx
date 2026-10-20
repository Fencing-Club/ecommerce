import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { Permissions } from "@/lib/access"
import { member } from "@/stories/workspace"
import { ProductActions } from "./product-transfer"

// Each import request: its mode, file name and the hashes a commit sends back.
const imported = fn()

const importPreview = {
  products: 7,
  createdProducts: 2,
  variants: { created: 3, updated: 5, unchanged: 12 },
  sample: [
    { handle: "canvas-tote-bag", title: "Canvas tote bag", variants: 2, isNew: false },
    { handle: "market-basket", title: "Market basket", variants: 1, isNew: true }
  ],
  revisionHash: "rev-8f2a",
  fileHash: "file-51c9"
}

const meta = preview.meta({
  title: "Components/Supplier workspace/Product transfer",
  component: ProductActions,
  args: { onImported: fn() },
  beforeEach: ({ msw }) => {
    imported.mockClear()
    msw.use(
      http.post("/api/supplier-catalog/import", async ({ request }) => {
        const form = await request.formData()
        const file = form.get("file")
        const mode = form.get("mode")
        imported({
          mode,
          file: file instanceof File ? file.name : null,
          revisionHash: form.get("revisionHash"),
          fileHash: form.get("fileHash")
        })
        return HttpResponse.json(mode === "preview" ? importPreview : { imported: true })
      })
    )
  }
})

const spreadsheet = new File(["handle,title,sku\ncanvas-tote-bag,Canvas tote bag,LM-TOTE-NAT"], "products.csv", {
  type: "text/csv"
})

async function openImport(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
  await userEvent.click(await screen.findByRole("menuitem", { name: "Import products" }))
  return within(await screen.findByRole("dialog", { name: "Import products" }))
}

export const Menu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Import products" })).toBeInTheDocument()
    await expect(screen.getByRole("menuitem", { name: "Export to Excel" })).toHaveAttribute(
      "href",
      "/api/supplier-catalog/export?format=xlsx"
    )
    await expect(screen.getByRole("menuitem", { name: "Export to CSV" })).toHaveAttribute(
      "href",
      "/api/supplier-catalog/export?format=csv"
    )
    await expect(screen.getByRole("menuitem", { name: "Download template" })).toHaveAttribute(
      "href",
      "/api/supplier-catalog/template?format=xlsx"
    )
  }
})

// The top bar's Create > Import products lands here with ?import=true, which opens the import.
export const OpenedFromCreate = meta.story({
  parameters: { router: { navigation: { pathname: "/products", query: { import: "true" } } } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Import products" })
    await waitFor(() => expect(dialog).toBeVisible())
  }
})

export const Import = meta.story({
  play: async ({ canvas, args }) => {
    const dialog = await openImport(canvas)
    await expect(dialog.getByRole("link", { name: "Excel template" })).toHaveAttribute(
      "href",
      "/api/supplier-catalog/template?format=xlsx"
    )
    await expect(dialog.getByRole("link", { name: "Your products in Excel" })).toBeInTheDocument()
    await expect(dialog.getByRole("button", { name: "Preview" })).toBeDisabled()
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await waitFor(() => expect(imported).toHaveBeenCalledWith(expect.objectContaining({ mode: "preview" })))
    await expect(imported).toHaveBeenCalledWith({
      mode: "preview",
      file: "products.csv",
      revisionHash: null,
      fileHash: null
    })
    // What the file will change, with a sample of its products.
    await expect(await dialog.findByText("New variants")).toBeInTheDocument()
    await expect(dialog.getByText("12")).toBeInTheDocument()
    const basket = within(dialog.getByText("Market basket").closest("li")!)
    await expect(basket.getByText("New")).toBeInTheDocument()
    await expect(basket.getByText("1 variant")).toBeInTheDocument()
    await expect(dialog.getByText("And 5 more products")).toBeInTheDocument()
    await userEvent.click(dialog.getByRole("button", { name: "Import 8 variants" }))
    await waitFor(() =>
      expect(imported).toHaveBeenCalledWith({
        mode: "commit",
        file: "products.csv",
        revisionHash: "rev-8f2a",
        fileHash: "file-51c9"
      })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(args.onImported).toHaveBeenCalled()
  }
})

export const NothingToImport = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/supplier-catalog/import", () =>
        HttpResponse.json({ ...importPreview, variants: { created: 0, updated: 0, unchanged: 20 }, sample: [] })
      )
    )
  },
  play: async ({ canvas }) => {
    const dialog = await openImport(canvas)
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await expect(await dialog.findByRole("button", { name: "Nothing to import" })).toBeDisabled()
  }
})

export const PreviewFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/supplier-catalog/import", () => HttpResponse.json({ error: "Row 4: add a SKU" }, { status: 400 }))
    )
  },
  play: async ({ canvas }) => {
    const dialog = await openImport(canvas)
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Row 4: add a SKU")
    // Another file clears the error.
    await userEvent.upload(dialog.getByLabelText("Product file"), new File(["x"], "fixed.xlsx"))
    await expect(dialog.queryByRole("alert")).toBeNull()
  }
})

export const AlreadyImported = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/supplier-catalog/import", async ({ request }) =>
        HttpResponse.json((await request.formData()).get("mode") === "preview" ? importPreview : { imported: false })
      )
    )
  },
  play: async ({ canvas, args }) => {
    const dialog = await openImport(canvas)
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await userEvent.click(await dialog.findByRole("button", { name: "Import 8 variants" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("You already imported this file.")
    await expect(args.onImported).not.toHaveBeenCalled()
  }
})

export const MalformedPreview = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/supplier-catalog/import", () => HttpResponse.json({ products: "invalid" })))
  },
  play: async ({ canvas, args }) => {
    const dialog = await openImport(canvas)
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Couldn’t import. Try again.")
    await expect(args.onImported).not.toHaveBeenCalled()
    await expect(dialog.queryByText("New variants")).toBeNull()
  }
})

export const CloseStartsOver = meta.story({
  play: async ({ canvas }) => {
    let dialog = await openImport(canvas)
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await expect(await dialog.findByText("New variants")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // Opened again, it starts over.
    dialog = await openImport(canvas)
    await expect(dialog.queryByText("New variants")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Preview" })).toBeDisabled()

    // So it does after Cancel.
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await expect(await dialog.findByText("New variants")).toBeInTheDocument()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    dialog = await openImport(canvas)
    await expect(dialog.queryByText("New variants")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Preview" })).toBeDisabled()

    // And after an import.
    await userEvent.upload(dialog.getByLabelText("Product file"), spreadsheet)
    await userEvent.click(dialog.getByRole("button", { name: "Preview" }))
    await userEvent.click(await dialog.findByRole("button", { name: "Import 8 variants" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    dialog = await openImport(canvas)
    await expect(dialog.queryByText("New variants")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Preview" })).toBeDisabled()
  }
})

// A member who edits products without seeing prices imports, but can't export what holds prices.
export const EditorWithoutPrices = meta.story({
  parameters: { permissions: { role: "member", access: { products: "edit" } } satisfies Permissions },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    const importItem = await screen.findByRole("menuitem", { name: "Import products" })
    await expect(screen.queryByRole("menuitem", { name: "Export to Excel" })).toBeNull()
    await userEvent.click(importItem)
    const dialog = within(await screen.findByRole("dialog", { name: "Import products" }))
    await expect(dialog.getByRole("link", { name: "CSV template" })).toBeInTheDocument()
    await expect(dialog.queryByRole("link", { name: "Your products in Excel" })).toBeNull()
  }
})

// A member who only views products gets the template.
export const ViewOnly = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Download template" })).toBeInTheDocument()
    await expect(screen.queryByRole("menuitem", { name: "Import products" })).toBeNull()
    await expect(screen.queryByRole("menuitem", { name: "Export to CSV" })).toBeNull()
  }
})
