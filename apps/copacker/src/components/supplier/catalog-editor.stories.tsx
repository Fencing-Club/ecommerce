import { http, HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import {
  catalogIds,
  catalogProducts,
  catalogViewer,
  customerIds,
  manyCatalogProducts,
  newCatalog,
  wholesaleCatalog
} from "@/stories/fixtures/supplier"
import { CatalogEditor } from "./catalog-editor"

// What the form sent: each save's body and each delete's catalog.
const saved = fn()
const deleted = fn()
const newId = "6a2d4f80-4b3e-4f5a-8c6d-000000000009"

const meta = preview.meta({
  title: "Components/Supplier workspace/Catalog editor",
  component: CatalogEditor,
  args: { data: wholesaleCatalog },
  beforeEach: ({ msw }) => {
    saved.mockClear()
    deleted.mockClear()
    msw.use(
      http.post("/api/catalogs", async ({ request }) => {
        saved(await request.json())
        return HttpResponse.json({ id: newId })
      }),
      http.delete("/api/catalogs/:id", ({ params }) => {
        deleted(params.id)
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

const ids = {
  natural: catalogProducts[0]!.variants[0]!.id,
  black: catalogProducts[0]!.variants[1]!.id,
  apron: catalogProducts[1]!.variants[0]!.id,
  basket: catalogProducts[2]!.variants[0]!.id
}

const saveBar = () => within(screen.getByRole("region", { name: "Unsaved changes" }))

export const Existing = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Wholesale 2026" })).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toHaveValue("Wholesale 2026")
    await expect(canvas.getByText("14/255")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Price adjustment" })).toHaveValue("10")
    await expect(canvas.getByText("Applies to every price you don’t fix below. $100 becomes $90.")).toBeVisible()
    await expect(canvas.getByRole("tab", { name: /Included\s*2/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("tab", { name: /Excluded\s*1/ })).toBeVisible()
    // The tote's natural color is fixed at $4 and its black one is 10% off $4.50.
    await expect(canvas.getByRole("button", { name: "Price for Canvas tote bag: $4 – $4.05" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Price for Linen apron: $8.01" })).toBeVisible()
    await expect(
      canvas.getByRole("button", {
        name: "Quantity rules and volume pricing for Linen apron: 1 price break, min 12 units, steps of 6"
      })
    ).toBeVisible()
    await expect(canvas.getByText("Set per variant")).toBeVisible()
    // Nothing has changed, so there's nothing to save.
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const ExpandVariants = meta.story({
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("button", { name: "2 variants" })
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByRole("button", { name: "Price for Canvas tote bag, Natural: $4, fixed" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Price for Canvas tote bag, Black: $4.05" })).toBeVisible()
    await userEvent.click(toggle)
    await expect(canvas.queryByRole("button", { name: /Canvas tote bag, Black/ })).toBeNull()
  }
})

export const RenameAndSave = meta.story({
  play: async ({ canvas }) => {
    const title = canvas.getByRole("textbox", { name: /Title/ })
    await userEvent.clear(title)
    await userEvent.type(title, "Wholesale 2027")
    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }))
    await userEvent.click(await screen.findByRole("option", { name: "Draft" }))
    // Assigned customers see list prices until the catalog is active again.
    await expect(
      canvas.getByText("Customers see every active product at its own price until the catalog is active.")
    ).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    await expect(saved).toHaveBeenCalledWith({
      id: catalogIds.wholesale,
      revision: 3,
      title: "Wholesale 2027",
      status: "draft",
      adjustmentBasisPoints: -1000,
      includeNewProducts: true,
      customerIds: [customerIds.harbor, customerIds.summit],
      products: [
        { productId: ids.natural, priceMinor: 400, priceBreaks: null, quantityRules: null },
        { productId: ids.black, priceMinor: null, priceBreaks: null, quantityRules: null },
        {
          productId: ids.apron,
          priceMinor: null,
          priceBreaks: [{ minimum: 50, priceMinor: 780 }],
          quantityRules: { increment: 6, minimum: 12, maximum: null }
        }
      ]
    })
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    // Saved, the form has nothing left to save.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull())
  }
})

export const Customers = meta.story({
  play: async ({ canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Add customers" })
    await userEvent.click(input)
    await userEvent.type(input, "pine")
    // A customer on another catalog says it moves from there.
    const option = await screen.findByRole("option", { name: /Pine & Paper Co\./ })
    await expect(within(option).getByText("Moves from Retail partners")).toBeInTheDocument()
    await userEvent.click(option)
    await userEvent.keyboard("{Escape}")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({ customerIds: [customerIds.harbor, customerIds.summit, customerIds.pine] })
      )
    )
  }
})

export const NoMatchingCustomer = meta.story({
  play: async ({ canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Add customers" })
    await userEvent.click(input)
    await userEvent.type(input, "fencing")
    await expect(await screen.findByText("No customers found")).toBeInTheDocument()
  }
})

export const FixPrice = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Price for Linen apron: $8.01" }))
    const field = await screen.findByRole("textbox", { name: "Fixed price" })
    await expect(screen.getByText("Adjusted price: $8.01")).toBeInTheDocument()
    await userEvent.type(field, "7.5x")
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await expect(screen.getByRole("button", { name: "Done" })).toBeDisabled()
    await userEvent.type(field, "{Backspace}{Enter}")
    await expect(await canvas.findByRole("button", { name: "Price for Linen apron: $7.50, fixed" })).toBeVisible()
    // The fixed price goes back to the adjusted one.
    await userEvent.click(canvas.getByRole("button", { name: "Price for Linen apron: $7.50, fixed" }))
    await expect(await screen.findByRole("textbox", { name: "Fixed price" })).toHaveValue("7.50")
    await userEvent.click(screen.getByRole("button", { name: "Use adjusted price" }))
    await expect(await canvas.findByRole("button", { name: "Price for Linen apron: $8.01" })).toBeVisible()
  }
})

export const FixPriceForEveryVariant = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Price for Canvas tote bag: $4 – $4.05" }))
    const field = await screen.findByRole("textbox", { name: "Fixed price for 2 variants" })
    // The variants' fixed prices differ, so the field starts blank.
    await expect(field).toHaveValue("")
    await expect(screen.getByText("Adjusted prices: $3.83 – $4.05")).toBeInTheDocument()
    await userEvent.type(field, "3.95")
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await expect(await canvas.findByRole("button", { name: "Price for Canvas tote bag: $3.95, fixed" })).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const body = saved.mock.calls[0]![0]
    await expect(body.products.slice(0, 2)).toEqual([
      { productId: ids.natural, priceMinor: 395, priceBreaks: null, quantityRules: null },
      { productId: ids.black, priceMinor: 395, priceBreaks: null, quantityRules: null }
    ])
  }
})

export const VolumePricing = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "2 variants" }))
    await userEvent.click(
      canvas.getByRole("button", { name: "Quantity rules and volume pricing for Canvas tote bag, Black" })
    )
    const dialog = within(await screen.findByRole("dialog", { name: "Quantity rules and volume pricing" }))
    await expect(dialog.getByText("Canvas tote bag, Black")).toBeInTheDocument()
    await expect(dialog.getByRole("textbox", { name: "Base price" })).toHaveValue("$4.05")
    await userEvent.click(dialog.getByRole("button", { name: "Add break" }))
    await expect(dialog.getByRole("alert")).toHaveTextContent("Give every break a quantity and a price")
    await userEvent.type(dialog.getByRole("spinbutton", { name: "Break 1 quantity" }), "50")
    await userEvent.type(dialog.getByRole("textbox", { name: "Break 1 price" }), "4.10")
    // A break has to lower the price.
    await expect(dialog.getByRole("alert")).toHaveTextContent("Each break’s price must be lower than the one before")
    await expect(dialog.getByRole("button", { name: "Done" })).toBeDisabled()
    await userEvent.clear(dialog.getByRole("textbox", { name: "Break 1 price" }))
    await userEvent.type(dialog.getByRole("textbox", { name: "Break 1 price" }), "3.90")
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await expect(
      await canvas.findByRole("button", {
        name: "Quantity rules and volume pricing for Canvas tote bag, Black: 1 price break"
      })
    ).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    await expect(saved.mock.calls[0]![0].products[1]).toEqual({
      productId: ids.black,
      priceMinor: null,
      priceBreaks: [{ minimum: 50, priceMinor: 390 }],
      quantityRules: { increment: 1, minimum: 1, maximum: null }
    })
  }
})

export const UseProductRules = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Quantity rules and volume pricing for Linen apron/ }))
    const dialog = within(await screen.findByRole("dialog"))
    await expect(dialog.getByRole("spinbutton", { name: "Increment" })).toHaveValue(6)
    await userEvent.click(dialog.getByRole("button", { name: "Use product settings" }))
    // Back to the apron's own rules: its break, 10% off, and its minimum.
    await expect(
      await canvas.findByRole("button", {
        name: "Quantity rules and volume pricing for Linen apron: 1 price break, min 12 units"
      })
    ).toBeVisible()
  }
})

export const IncludeAndExclude = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Linen apron" }))
    await expect(canvas.getByText("1 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Exclude" }))
    await expect(canvas.getByRole("tab", { name: /Included\s*1/ })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Linen apron/ })).toBeNull()
    await userEvent.click(canvas.getByRole("tab", { name: /Excluded\s*2/ }))
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products on this page" }))
    await expect(canvas.getByText("2 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Include" }))
    await expect(canvas.getByRole("tab", { name: /Excluded\s*0/ })).toBeVisible()
    await expect(canvas.getByText("No products here")).toBeVisible()
    await userEvent.click(canvas.getByRole("tab", { name: /All\s*3/ }))
    // The basket joins without a price of its own.
    await expect(canvas.getByRole("button", { name: "Price for Market basket: no price" })).toBeEnabled()
    // Discard goes back to what's saved.
    await userEvent.click(saveBar().getByRole("button", { name: "Discard" }))
    await expect(canvas.getByRole("tab", { name: /Included\s*2/ })).toBeVisible()
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const ClearOverrides = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products on this page" }))
    await userEvent.click(canvas.getByRole("button", { name: "Clear price overrides" }))
    await expect(canvas.getByRole("button", { name: "Price for Canvas tote bag: $3.83 – $4.05" })).toBeVisible()
    await expect(
      canvas.getByRole("button", {
        name: "Quantity rules and volume pricing for Linen apron: 1 price break, min 12 units"
      })
    ).toBeVisible()
    await expect(canvas.queryByText("Set per variant")).toBeNull()
  }
})

export const SearchProducts = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /All\s*3/ }))
    // Found by a variant's SKU or option too.
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "blk")
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.queryByText("Linen apron")).toBeNull()
    await userEvent.clear(canvas.getByRole("searchbox"))
    await userEvent.type(canvas.getByRole("searchbox"), "lantern")
    await expect(canvas.getByText("No products here")).toBeVisible()
  }
})

export const IncreaseAdjustment = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Adjustment direction" }))
    await userEvent.click(await screen.findByRole("option", { name: "Increase by" }))
    await expect(canvas.getByText(/\$100 becomes \$110/)).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Price for Linen apron: $9.79" })).toBeVisible()
    const percent = canvas.getByRole("textbox", { name: "Price adjustment" })
    await userEvent.clear(percent)
    await userEvent.type(percent, "1001")
    await expect(percent).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByText("Enter 0 to 1,000.")).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(saveBar().getByText("Increase by 0 to 1,000%")).toBeVisible()
    await expect(saved).not.toHaveBeenCalled()
  }
})

export const IncludeNewProducts = meta.story({
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("switch", { name: "Automatically include new products" })
    await expect(toggle).toBeChecked()
    // On a narrow card the switch moves under the title rather than squeezing its label onto two lines.
    const label = canvas.getByText("Automatically include new products")
    await expect(label.getBoundingClientRect().height).toBeLessThan(2 * parseFloat(getComputedStyle(label).lineHeight))
    await userEvent.click(toggle)
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ includeNewProducts: false })))
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/catalogs", () =>
        HttpResponse.json({ error: "Another catalog is called Wholesale 2027" }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: /Title/ }), "!")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(await saveBar().findByText("Another catalog is called Wholesale 2027")).toBeVisible()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
    // Discarding clears the error with the changes.
    await userEvent.click(saveBar().getByRole("button", { name: "Discard" }))
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const Delete = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Export to Excel" })).toHaveAttribute(
      "href",
      `/api/catalogs/${catalogIds.wholesale}/export?format=xlsx`
    )
    await expect(screen.getByRole("menuitem", { name: "Export to PDF" })).toHaveAttribute(
      "href",
      `/api/catalogs/${catalogIds.wholesale}/export?format=pdf`
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete catalog" }))
    const dialog = within(await screen.findByRole("alertdialog", { name: "Delete Wholesale 2026?" }))
    await expect(
      dialog.getByText("Its customers will see every active product at its own price. You can’t undo this.")
    ).toBeInTheDocument()
    await userEvent.click(dialog.getByRole("button", { name: "Delete catalog" }))
    await waitFor(() => expect(deleted).toHaveBeenCalledWith(catalogIds.wholesale))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/catalogs" }))
  }
})

export const CancelDelete = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete catalog" }))
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(deleted).not.toHaveBeenCalled()
  }
})

export const DeleteFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.delete("/api/catalogs/:id", () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete catalog" }))
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete catalog" })
    )
    await expect(await screen.findByText("Couldn’t delete the catalog. Try again.")).toBeVisible()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})

export const ExportWhileUnsaved = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: /Title/ }), "!")
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    // Exports show what's saved, so they wait for the changes.
    await expect(await screen.findByRole("menuitem", { name: "Export to Excel" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  }
})

export const New = meta.story({
  args: { data: newCatalog },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "New catalog" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "More actions" })).toBeNull()
    // A new catalog starts with every product.
    await expect(canvas.getByRole("tab", { name: /Included\s*3/ })).toBeVisible()
    await expect(canvas.getByText("Applies to every price you don’t fix below.")).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(saveBar().getByText("Add a title")).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: /Title/ }), "  Trade show  ")
    await userEvent.type(canvas.getByRole("textbox", { name: "Price adjustment" }), "{Backspace}12.5")
    await expect(canvas.getByText(/\$100 becomes \$87\.50/)).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const body = saved.mock.calls[0]![0]
    await expect(body).toMatchObject({
      title: "Trade show",
      status: "active",
      adjustmentBasisPoints: -1250,
      includeNewProducts: true,
      customerIds: []
    })
    await expect(body).not.toHaveProperty("id")
    await expect(body.products.map((entry: { productId: string }) => entry.productId)).toEqual([
      ids.natural,
      ids.black,
      ids.apron,
      ids.basket
    ])
    await waitFor(() =>
      expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/catalogs/${newId}`, replace: true })
    )
  }
})

export const NewDiscard = meta.story({
  args: { data: newCatalog },
  play: async () => {
    await userEvent.click(saveBar().getByRole("button", { name: "Discard" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/catalogs" })
  }
})

export const NoProductsOrCustomers = meta.story({
  args: { data: { ...newCatalog, products: [], customers: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No products yet")).toBeVisible()
    await expect(canvas.getByText("Add products before building a catalog.")).toBeVisible()
    await expect(canvas.getByText("Customers appear once a buyer adds you as their supplier.")).toBeVisible()
  }
})

export const ManyProducts = meta.story({
  args: { data: { ...newCatalog, products: manyCatalogProducts(30) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1–25 of 30")).toBeVisible()
    await expect(canvas.getByText("Stoneware mug 25")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("26–30 of 30")).toBeVisible()
    await expect(canvas.getByText("Stoneware mug 30")).toBeVisible()
    await expect(canvas.queryByText("Stoneware mug 01")).toBeNull()
  }
})

export const ReadOnly = meta.story({
  args: { readOnly: true },
  parameters: { permissions: catalogViewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toBeDisabled()
    await expect(canvas.getByRole("switch", { name: "Automatically include new products" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    // Prices and rules show as text, without buttons to change them.
    await expect(canvas.queryByRole("button", { name: /Price for/ })).toBeNull()
    await expect(canvas.getByText("$4 – $4.05")).toBeVisible()
    await expect(canvas.getByText("1 price break, min 12 units, steps of 6")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Export to PDF" })).toHaveAttribute("download")
    await expect(screen.queryByRole("menuitem", { name: "Delete catalog" })).toBeNull()
  }
})
