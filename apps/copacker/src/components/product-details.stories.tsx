import { http, HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { editable, productDefaults, suppliers } from "@/stories/fixtures/catalog"
import { chooseOption } from "@/stories/play"
import { member } from "@/stories/workspace"
import { ProductDetails } from "./product-details"

// What each story's panel saved, in order: the product's details and each variation's fields.
let saved: { url: string; body: Record<string, unknown> }[] = []

function saves(respond?: (url: string) => Response | undefined) {
  return http.patch(/\/api\/inventory\/(product-defaults|variant-fields)$/, async ({ request }) => {
    const body = await request.json()
    const url = new URL(request.url).pathname
    saved.push({ url, body: typeof body === "object" && body !== null ? { ...body } : {} })
    return (
      respond?.(url) ??
      HttpResponse.json(url.endsWith("product-defaults") ? { ...productDefaults(), revision: 4 } : body)
    )
  })
}

const panel = () => screen.findByRole("dialog")

const meta = preview.meta({
  title: "Components/Products/Product details",
  component: ProductDetails,
  args: { product: editable(1), open: true, onOpenChange: fn(), onSaved: fn() },
  beforeEach: ({ msw }) => {
    saved = []
    msw.use(
      http.get("/api/restock/suppliers", () => HttpResponse.json(suppliers)),
      saves()
    )
  }
})

// A product with one untitled variation edits that variation's fields beside the product's own.
export const OneVariation = meta.story({
  play: async ({ args }) => {
    const details = within(await panel())
    await expect(details.getByRole("heading", { name: "Linen apron" })).toBeInTheDocument()
    await expect(details.getByText("APRON-CHR")).toBeInTheDocument()
    await expect(details.getByRole("button", { name: "Save" })).toBeDisabled()

    await chooseOption(details.getByRole("combobox", { name: "Supplier" }), "Lotus Manufacturing")
    await userEvent.type(details.getByRole("spinbutton", { name: "Minimum order quantity" }), "50")
    await userEvent.type(details.getByRole("textbox", { name: "ASIN" }), "B0APRON001")
    await userEvent.click(details.getByRole("checkbox", { name: "Suffocation warning label" }))
    await userEvent.click(details.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
    await expect(args.onSaved).toHaveBeenCalledOnce()
    await expect(saved).toEqual([
      {
        url: "/api/inventory/product-defaults",
        body: expect.objectContaining({
          productId: "gid://shopify/Product/502",
          supplierId: suppliers[0]!.id,
          minimumOrder: 50,
          suffocationWarning: true,
          productLabel: "uploaded",
          // An unset preparation left on sealed polybag stays unset.
          prepCategory: null,
          expectedRevision: 3
        })
      },
      {
        url: "/api/inventory/variant-fields",
        body: {
          variantId: "gid://shopify/ProductVariant/1003",
          supplierSku: "",
          asin: "B0APRON001",
          amazonStockTarget: 0,
          storeStockTarget: null
        }
      }
    ])
  }
})

// Variations share the product's details; only the ones that changed are saved.
export const Variations = meta.story({
  args: { product: editable(0) },
  play: async ({ args }) => {
    const details = within(await panel())
    await expect(details.getByText("2 variations")).toBeInTheDocument()
    await expect(details.getByRole("heading", { name: "Variations" })).toBeInTheDocument()
    // One variation's fields aren't repeated for the product.
    await expect(details.queryByRole("textbox", { name: "ASIN" })).toBeNull()
    await userEvent.type(details.getByRole("spinbutton", { name: "Warehouse minimum for Black" }), "12")
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledOnce())
    await expect(saved).toEqual([
      {
        url: "/api/inventory/variant-fields",
        body: {
          variantId: "gid://shopify/ProductVariant/1002",
          supplierSku: "",
          asin: "",
          amazonStockTarget: null,
          storeStockTarget: 12
        }
      }
    ])
  }
})

// Emptied, a number stays empty and clears what was saved.
export const ClearCaseQuantity = meta.story({
  args: { product: editable(0) },
  play: async ({ args }) => {
    const details = within(await panel())
    const caseQuantity = details.getByRole("spinbutton", { name: "Case quantity" })
    await expect(caseQuantity).toHaveValue(24)
    await userEvent.clear(caseQuantity)
    await expect(caseQuantity).toHaveValue(null)
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledOnce())
    await expect(saved).toEqual([
      { url: "/api/inventory/product-defaults", body: expect.objectContaining({ caseQuantity: null }) }
    ])
  }
})

export const CasePacks = meta.story({
  args: { product: editable(0) },
  play: async ({ args }) => {
    const details = within(await panel())
    await userEvent.click(details.getByRole("button", { name: "Add case pack" }))
    // A first case pack starts from the product's case quantity.
    await expect(details.getByRole("textbox", { name: "Name" })).toHaveValue("Standard case")
    await expect(details.getByRole("spinbutton", { name: "Units per case" })).toHaveValue(24)
    await userEvent.click(details.getByRole("button", { name: "Add case pack" }))
    await expect(details.getAllByRole("textbox", { name: "Name" })[1]).toHaveValue("Case 2")
    await expect(details.getByText("Default")).toBeInTheDocument()

    // Sizes must be filled in before saving.
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await expect((await details.findAllByText("Enter a number greater than 0")).length).toBeGreaterThan(0)
    await expect(saved).toEqual([])

    await userEvent.click(details.getByRole("button", { name: "Remove case pack 2" }))
    await userEvent.click(details.getByRole("button", { name: "Remove case pack 1" }))
    await expect(details.queryByRole("group", { name: "Case pack 1" })).toBeNull()
    await expect(args.onSaved).not.toHaveBeenCalled()
  }
})

export const WholeNumbers = meta.story({
  play: async () => {
    const details = within(await panel())
    await userEvent.type(details.getByRole("spinbutton", { name: "Minimum order quantity" }), "2.5")
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await expect(await details.findByText("Enter a whole number")).toBeVisible()
    await expect(saved).toEqual([])
  }
})

// A failed save keeps the panel open with the server's message.
export const SaveFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      saves(() => HttpResponse.json({ error: "Someone else changed this product. Reload to see it." }, { status: 409 }))
    )
  },
  play: async ({ args }) => {
    const details = within(await panel())
    await userEvent.type(details.getByRole("textbox", { name: "Instructions" }), "Fold before bagging")
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await expect(await details.findByText("Someone else changed this product. Reload to see it.")).toBeVisible()
    await expect(args.onOpenChange).not.toHaveBeenCalled()
    await expect(args.onSaved).not.toHaveBeenCalled()
  }
})

// When the product saves but a variation doesn't, the message names the variation and the list still refreshes.
export const VariationFailed = meta.story({
  args: { product: editable(0) },
  beforeEach: ({ msw }) => {
    msw.use(
      saves((url) =>
        url.endsWith("variant-fields") ? HttpResponse.json({ error: "ASIN is taken" }, { status: 400 }) : undefined
      )
    )
  },
  play: async ({ args }) => {
    const details = within(await panel())
    await userEvent.type(details.getByRole("spinbutton", { name: "Minimum order quantity" }), "100")
    await userEvent.type(details.getByRole("textbox", { name: "ASIN for Natural" }), "B0DUPLICATE")
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await expect(await details.findByText("Natural: ASIN is taken")).toBeVisible()
    await expect(args.onSaved).toHaveBeenCalledOnce()
    await expect(args.onOpenChange).not.toHaveBeenCalled()
    // Saving again sends only what didn't save.
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveLength(3))
    await expect(saved.map((save) => save.url)).toEqual([
      "/api/inventory/product-defaults",
      "/api/inventory/variant-fields",
      "/api/inventory/variant-fields"
    ])
  }
})

// Someone who can only view products sees the details turned off, and can still preview labels.
export const ViewOnly = meta.story({
  args: { product: editable(0) },
  parameters: { permissions: member },
  play: async ({ args }) => {
    const details = within(await panel())
    await expect(details.getByRole("spinbutton", { name: "Minimum order quantity" })).toBeDisabled()
    await expect(details.getByRole("spinbutton", { name: "Warehouse minimum for Black" })).toBeDisabled()
    await expect(details.getByRole("button", { name: "Add case pack" })).toBeDisabled()
    await expect(details.queryByRole("button", { name: "Save" })).toBeNull()
    await expect(details.getByRole("button", { name: "Preview label for Natural" })).toBeEnabled()
    await expect(details.queryByRole("button", { name: "Upload label for Natural" })).toBeNull()
    // The footer's Close, beside the panel's own close icon.
    const close = details.getAllByRole("button", { name: "Close" }).find((button) => !button.querySelector("svg"))
    await userEvent.click(close!)
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})

export const Closed = meta.story({
  args: { open: false },
  play: async () => {
    await expect(screen.queryByRole("dialog")).toBeNull()
  }
})

const targetProduct = editable(1)
const warehouseRef = {
  provider: "shopify",
  accountId: "shop.myshopify.com",
  scope: "store",
  externalId: "gid://shopify/Location/1"
}
export const MappedTargets = meta.story({
  args: {
    product: {
      ...targetProduct,
      variants: targetProduct.variants.map((variant) => ({
        ...variant,
        stockTargets: {
          revision: 3,
          targets: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              quantity: 100,
              name: "Fencing Club",
              provider: "store" as const,
              destination: {
                kind: "pool" as const,
                locations: [warehouseRef, { ...warehouseRef, externalId: "gid://shopify/Location/2" }]
              }
            },
            {
              id: "00000000-0000-4000-8000-000000000002",
              quantity: 25,
              name: "Outlet",
              provider: "store" as const,
              destination: {
                kind: "location" as const,
                location: { ...warehouseRef, externalId: "gid://shopify/Location/3" }
              }
            }
          ]
        }
      }))
    }
  },
  play: async ({ args }) => {
    const details = within(await panel())
    const field = details.getByRole("spinbutton", { name: "Fencing Club" })
    await expect(field).toHaveValue(100)
    await expect(details.getByRole("spinbutton", { name: "Outlet" })).toHaveValue(25)
    await userEvent.clear(field)
    await userEvent.type(field, "140")
    await userEvent.click(details.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledOnce())
    await expect(saved[0]?.body.stockTargets).toEqual({
      revision: 3,
      targets: args.product!.variants[0]!.stockTargets!.targets.map(
        ({ name: _name, provider: _provider, ...target }, index) => ({ ...target, quantity: index ? 25 : 140 })
      )
    })
  }
})
