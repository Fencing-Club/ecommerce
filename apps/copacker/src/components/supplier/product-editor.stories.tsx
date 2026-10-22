import { http, HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { productCatalogs, toteProduct } from "@/stories/fixtures/supplier"
import { shownDialog, chooseOption } from "@/stories/play"
import { member } from "@/stories/workspace"
import { ProductEditor } from "./product-editor"

// What the form sent: each product saved, and each photo's file name.
const saved = fn()
const uploaded = fn()
const newId = "2f8c6b14-4b3e-4f5a-8c6d-000000000099"

const meta = preview.meta({
  title: "Components/Supplier workspace/Product editor",
  component: ProductEditor,
  args: { initial: toteProduct, catalogs: productCatalogs },
  beforeEach: ({ msw }) => {
    saved.mockClear()
    uploaded.mockClear()
    msw.use(
      http.post("/api/supplier-catalog/products", async ({ request }) => {
        saved(await request.json())
        return HttpResponse.json({ id: newId, revision: 1 })
      }),
      // Photos upload one at a time; a file named bad-* is refused, and one named offline-* never reaches the server.
      http.post("/api/product-images", async ({ request }) => {
        const file = (await request.formData()).get("file")
        const name = file instanceof File ? file.name : ""
        uploaded(name)
        if (name.startsWith("offline")) {
          return HttpResponse.error()
        }
        return name.startsWith("bad")
          ? HttpResponse.json({ error: "Photos must be under 10 MB" }, { status: 413 })
          : HttpResponse.json({ key: `supplier-images/org_supplier/${name}`, name, contentType: "image/png" })
      })
    )
  }
})

const saveBar = () => within(screen.getByRole("region", { name: "Unsaved changes" }))
const png = (name: string) => new File(["png"], name, { type: "image/png" })
const photoInput = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLInputElement>("input[type=file]")!

export const Existing = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Canvas tote bag" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products")
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toHaveValue("Canvas tote bag")
    await expect(canvas.getByRole("textbox", { name: "Product page" })).toHaveValue("https://lotus.example.com/tote")
    // The side cards are the same size as the main ones, so they line up when they stack on a phone.
    await expect(canvas.getByRole("textbox", { name: "Product page" }).closest("[data-slot=card]")).toHaveAttribute(
      "data-size",
      "default"
    )
    await expect(canvas.getByRole("img", { name: "tote.png" })).toBeVisible()
    // One Add for photos, one for a new option.
    await expect(canvas.getAllByRole("button", { name: "Add" })).toHaveLength(2)
    await expect(canvas.getByRole("textbox", { name: "Color for LM-TOTE-NAT" })).toHaveValue("Natural")
    await expect(canvas.getByRole("textbox", { name: "SKU for Black" })).toHaveValue("LM-TOTE-BLK")
    await expect(canvas.getByRole("textbox", { name: "Price for Black" })).toHaveValue("4.50")
    await expect(canvas.getByRole("cell", { name: "40" })).toBeVisible()
    // Its catalogs, with any that aren't active marked.
    await expect(canvas.getByRole("link", { name: "Wholesale 2026" })).toHaveAttribute(
      "href",
      `/catalogs/${productCatalogs[0]!.id}`
    )
    await expect(
      within(canvas.getByRole("link", { name: "Retail partners" }).closest("li")!).getByText("Draft")
    ).toBeVisible()
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const EditAndSave = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), " Holds 20 kg.")
    await userEvent.type(canvas.getByRole("textbox", { name: "Category" }), " and totes")
    const price = canvas.getByRole("textbox", { name: "Price for Natural" })
    await userEvent.clear(price)
    await userEvent.type(price, "4.40")
    await userEvent.tab()
    await chooseOption(canvas.getByRole("combobox", { name: "Status" }), "Archived")
    await expect(canvas.getByText("Customers can’t order archived products.")).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const body = saved.mock.calls[0]![0]
    await expect(body).toMatchObject({
      id: toteProduct.id,
      revision: 4,
      title: "Canvas tote bag",
      status: "archived",
      category: "Bags and totes",
      productCode: "TOTE",
      description: "Heavy canvas with a flat bottom. Holds 20 kg.",
      optionNames: ["Color"],
      images: toteProduct.images
    })
    await expect(body.variants[0]).toEqual({
      id: toteProduct.variants[0]!.id,
      supplierSku: "LM-TOTE-NAT",
      options: { Color: "Natural" },
      currency: "USD",
      priceMinor: 440,
      priceBasis: "piece",
      piecesPerSellablePack: 1,
      sellablePacksPerCase: 24,
      trackInventory: true,
      onHand: 120,
      continueSelling: false,
      priceBreaks: [],
      quantityRules: { increment: 1, minimum: 1, maximum: null },
      notes: null
    })
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull())
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/supplier-catalog/products", () =>
        HttpResponse.json({ error: "Another product has the SKU LM-TOTE-NAT" }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Product code" }), "-2")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(await saveBar().findByText("Another product has the SKU LM-TOTE-NAT")).toBeVisible()
    // Discard goes back to what's saved.
    await userEvent.click(saveBar().getByRole("button", { name: "Discard" }))
    await expect(canvas.getByRole("textbox", { name: "Product code" })).toHaveValue("TOTE")
  }
})

export const Photos = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const images = () => canvas.getAllByRole("img").map((image) => image.getAttribute("alt"))
    await expect(images()).toEqual(["tote.png", "tote-back.png"])
    await userEvent.click(canvas.getByRole("button", { name: "Make tote-back.png the main photo" }))
    await expect(images()).toEqual(["tote-back.png", "tote.png"])
    await userEvent.click(canvas.getByRole("button", { name: "Remove tote.png" }))
    await expect(images()).toEqual(["tote-back.png"])
    await userEvent.upload(photoInput(canvasElement), [png("strap.png"), png("bad-scan.png")])
    await waitFor(() => expect(images()).toEqual(["tote-back.png", "strap.png"]))
    await expect(uploaded).toHaveBeenCalledWith("strap.png")
    await expect(uploaded).toHaveBeenCalledWith("bad-scan.png")
    // The refused photo's name reads left to right in every language.
    const refused = canvas.getByText("bad-scan.png")
    await expect(refused).toBeVisible()
    await expect(refused).toHaveAttribute("dir", "ltr")
    await expect(refused.parentElement).toHaveTextContent("bad-scan.png: Photos must be under 10 MB")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(saved.mock.calls[0]![0].images).toEqual([
        toteProduct.images[1],
        { key: "supplier-images/org_supplier/strap.png", name: "strap.png", contentType: "image/png" }
      ])
    )
  }
})

// Chooses photos as the browser's file picker does. userEvent.upload's list survives the input being cleared, but the
// browser's own list empties with it.
function choosePhotos(input: HTMLInputElement, names: string[]) {
  const transfer = new DataTransfer()
  for (const name of names) {
    transfer.items.add(png(name))
  }
  input.files = transfer.files
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

// A photo that never reaches the server is skipped: the photos around it still upload and stay, and the tile takes
// more.
export const PhotoUploadOffline = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const images = () => canvas.getAllByRole("img").map((image) => image.getAttribute("alt"))
    choosePhotos(photoInput(canvasElement), ["strap.png", "offline-scan.png", "handle.png"])
    await waitFor(() => expect(images()).toEqual(["tote.png", "tote-back.png", "strap.png", "handle.png"]))
    await expect(uploaded).toHaveBeenCalledTimes(3)
    await expect(canvas.getByText("offline-scan.png").parentElement).toHaveTextContent(
      "offline-scan.png: Couldn’t reach Copacker. Check your connection and try again."
    )
    // The Add tile comes before the variants' Add option button.
    await expect(canvas.getAllByRole("button", { name: "Add" })[0]).toBeEnabled()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(saved.mock.calls[0]![0].images.map((image: { name: string }) => image.name)).toEqual([
        "tote.png",
        "tote-back.png",
        "strap.png",
        "handle.png"
      ])
    )
  }
})

export const EditVariant = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Black" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit variant" }))
    const sheet = await shownDialog("Black")
    await expect(sheet.getByText("Canvas tote bag")).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: "1 price break" })).toBeInTheDocument()
    await userEvent.clear(sheet.getByRole("textbox", { name: "Color" }))
    await userEvent.type(sheet.getByRole("textbox", { name: "Color" }), "Charcoal")
    await userEvent.type(sheet.getByRole("textbox", { name: "SKU" }), "-2")
    await userEvent.clear(sheet.getByRole("spinbutton", { name: "Packs per case" }))
    await userEvent.type(sheet.getByRole("spinbutton", { name: "Packs per case" }), "12")
    await userEvent.click(sheet.getByRole("switch", { name: "Continue selling when out of stock" }))
    await userEvent.type(sheet.getByRole("textbox", { name: "Notes" }), "  Dyed to order  ")
    await userEvent.click(sheet.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByRole("textbox", { name: "SKU for Charcoal" })).toHaveValue("LM-TOTE-BLK-2")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    await expect(saved.mock.calls[0]![0].variants[1]).toMatchObject({
      supplierSku: "LM-TOTE-BLK-2",
      options: { Color: "Charcoal" },
      sellablePacksPerCase: 12,
      continueSelling: true,
      notes: "Dyed to order"
    })
  }
})

export const VariantPricing = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Natural" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit variant" }))
    const sheet = await shownDialog("Natural")
    await chooseOption(sheet.getByRole("combobox", { name: "Price per" }), "Case")
    await userEvent.click(sheet.getByRole("button", { name: "Add rules" }))
    const rules = await shownDialog("Quantity rules and volume pricing")
    await expect(rules.getByText("Canvas tote bag, Natural")).toBeInTheDocument()
    await userEvent.clear(rules.getByRole("spinbutton", { name: "Minimum" }))
    await userEvent.type(rules.getByRole("spinbutton", { name: "Minimum" }), "5")
    await userEvent.click(rules.getByRole("button", { name: "Done" }))
    await expect(await sheet.findByRole("button", { name: "min 5 cases" })).toBeInTheDocument()
    // Turning tracking off hides the stock fields.
    await userEvent.click(sheet.getByRole("switch", { name: "Track inventory" }))
    await expect(sheet.queryByRole("spinbutton", { name: "On hand" })).toBeNull()
    await userEvent.click(sheet.getByRole("button", { name: "Done" }))
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    await expect(saved.mock.calls[0]![0].variants[0]).toMatchObject({
      priceBasis: "case",
      trackInventory: false,
      quantityRules: { increment: 1, minimum: 5, maximum: null }
    })
  }
})

export const CancelVariantEdit = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Natural" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit variant" }))
    const sheet = await shownDialog("Natural")
    await userEvent.clear(sheet.getByRole("textbox", { name: "SKU" }))
    // A variant needs its SKU.
    await expect(sheet.getByRole("button", { name: "Done" })).toBeDisabled()
    await userEvent.click(sheet.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByRole("textbox", { name: "SKU for Natural" })).toHaveValue("LM-TOTE-NAT")
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const AddAndRemoveVariants = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add variant" }))
    // The new variant opens to fill in, with the last one's price.
    const sheet = await shownDialog("Variant")
    await expect(sheet.getByRole("textbox", { name: "Price" })).toHaveValue("4.50")
    await userEvent.type(sheet.getByRole("textbox", { name: "Color" }), "Olive")
    await userEvent.type(sheet.getByRole("textbox", { name: "SKU" }), "LM-TOTE-OLV")
    await userEvent.click(sheet.getByRole("button", { name: "Done" }))
    await expect(await canvas.findByRole("textbox", { name: "SKU for Olive" })).toHaveValue("LM-TOTE-OLV")
    await expect(canvas.getByText("New variants join the catalogs this product is in.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Natural" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove variant" }))
    await expect(canvas.queryByRole("textbox", { name: "SKU for Natural" })).toBeNull()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const variants = saved.mock.calls[0]![0].variants
    await expect(variants.map((variant: { supplierSku: string }) => variant.supplierSku)).toEqual([
      "LM-TOTE-BLK",
      "LM-TOTE-OLV"
    ])
    // A new variant has no id until it's saved.
    await expect(variants[1]).not.toHaveProperty("id")
  }
})

export const Options = meta.story({
  play: async ({ canvas }) => {
    const name = canvas.getByRole("textbox", { name: "New option name" })
    await userEvent.type(name, "Size{Enter}")
    await expect(canvas.getByText("Size", { selector: "[data-slot=badge]" })).toBeVisible()
    await expect(name).toHaveValue("")
    const size = canvas.getByRole("textbox", { name: "Size for LM-TOTE-NAT" })
    await expect(size).toHaveAttribute("aria-invalid", "true")
    // Every variant needs a value for every option.
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(saveBar().getByText("Give LM-TOTE-NAT a value for every option")).toBeVisible()
    await expect(saved).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole("button", { name: "Remove option Size" }))
    await userEvent.click(canvas.getByRole("button", { name: "Remove option Color" }))
    // Without an option two variants can't be told apart.
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(saveBar().getByText("Add an option to tell the variants apart")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Add variant" })).toBeDisabled()
  }
})

export const New = meta.story({
  // Without a product, the editor starts a blank one.
  args: { initial: undefined, catalogs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Add product" })).toBeVisible()
    await expect(canvas.queryByText("Catalogs")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Add photos" })).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(saveBar().getByText("Add a title")).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: /Title/ }), "Market basket")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(saveBar().getByText("Give every variant a SKU")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "SKU for new variant" })).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(canvas.getByRole("textbox", { name: "SKU for new variant" }), " LM-BASKET ")
    await userEvent.type(canvas.getByRole("textbox", { name: "Price for LM-BASKET" }), "14.5")
    await userEvent.tab()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const body = saved.mock.calls[0]![0]
    await expect(body).not.toHaveProperty("id")
    await expect(body).toMatchObject({ title: "Market basket", status: "active", optionNames: [], images: [] })
    await expect(body.variants).toEqual([
      expect.objectContaining({ supplierSku: "LM-BASKET", priceMinor: 1450, options: {}, notes: null })
    ])
    await waitFor(() =>
      expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/products/${newId}`, replace: true })
    )
  }
})

export const NewDiscard = meta.story({
  args: { initial: undefined },
  play: async () => {
    await userEvent.click(saveBar().getByRole("button", { name: "Discard" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/products" })
  }
})

export const NotInCatalogs = meta.story({
  args: { catalogs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not in any catalog")).toBeVisible()
  }
})

// A member who views products without prices: every field is off, and prices are left out.
export const ReadOnlyWithoutPrices = meta.story({
  args: { readOnly: true },
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toBeDisabled()
    await expect(canvas.getByRole("textbox", { name: "SKU for Natural" })).toBeDisabled()
    await expect(canvas.queryByRole("columnheader", { name: "Price" })).toBeNull()
    await expect(canvas.queryByRole("textbox", { name: "Price for Natural" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Add variant" })).toBeDisabled()
    // Catalogs aren't a page the member opens, so they're listed without links.
    await expect(canvas.queryByRole("link", { name: "Wholesale 2026" })).toBeNull()
    await expect(canvas.getByText("Wholesale 2026")).toBeVisible()
  }
})
