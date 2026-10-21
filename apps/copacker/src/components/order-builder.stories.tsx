import { HttpResponse, http } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { supplierId } from "@/stories/fixtures/orders"
import {
  actionHandler,
  builderSuppliers,
  catalogMatches,
  catalogProducts,
  deliveries,
  order,
  orderId,
  productHandlers,
  shownDialog,
  stops
} from "@/stories/fixtures/purchase-orders"
import { OrderBuilder } from "./order-builder"

const actions = fn()
const lookups = fn()
const [tote, apron, basket] = order.items
const sand = catalogProducts[0]!

const meta = preview.meta({
  title: "Components/Purchase orders/Order builder",
  component: OrderBuilder,
  args: {
    suppliers: builderSuppliers,
    deliveries,
    forwarderAddresses: stops,
    title: "New purchase order",
    parents: [{ label: "Purchase orders", href: "/orders" }]
  },
  beforeEach: ({ msw }) => {
    msw.use(...productHandlers(), catalogMatches({}, lookups), actionHandler(actions))
  }
})

type Canvas = ReturnType<typeof within>

// Picks a choice from one of the route's pills, such as the supplier.
async function choose(canvas: Canvas, pill: string, option: string) {
  await userEvent.click(canvas.getByRole("combobox", { name: pill }))
  await userEvent.click(await screen.findByRole("option", { name: option }))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

// Clears a number cell, which stays empty, then types a new number into it.
async function replace(input: HTMLElement, text: string) {
  await userEvent.clear(input)
  await expect(input).toHaveValue(null)
  await userEvent.type(input, text)
}

export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "New purchase order" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Discard" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByText("No products")).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Choose supplier")
    await expect(canvas.getByRole("combobox", { name: "Destination" })).toHaveTextContent("Amazon")
    await expect(canvas.getByText("0 variants (0 units)")).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Payment terms" })).toHaveTextContent("Payment in advance")
    await expect(lookups).not.toHaveBeenCalled()
  }
})

// Choosing the supplier and a product, setting its quantity and cost, then saving creates the purchase order.
export const CreateOrder = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions, () => HttpResponse.json({ ok: true, redirect: `/orders/${orderId}` })))
  },
  play: async ({ canvas }) => {
    await choose(canvas, "Supplier", "Lotus Manufacturing")
    await userEvent.click(canvas.getByRole("button", { name: "Search products to add" }))
    const dialog = await shownDialog("Add products")
    await userEvent.click(await dialog.findByRole("checkbox", { name: "Waffle towel Sand" }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to purchase order" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The new line takes focus, at its supplier SKU.
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Supplier SKU for Waffle towel" })).toHaveFocus())

    // The line starts at one unit, at its Shopify cost, with its supplier SKU.
    await expect(canvas.getByText("Sand")).toBeVisible()
    await expect(canvas.getByText("TOWEL-SAND")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Supplier SKU for Waffle towel" })).toHaveValue("LM-TOWEL-SAND")
    await expect(canvas.getByRole("spinbutton", { name: "Cost of Waffle towel" })).toHaveValue(6.5)
    // The supplier's catalog is asked for its quote.
    await waitFor(() =>
      expect(lookups).toHaveBeenCalledWith({ supplierId, currency: "USD", supplierSkus: ["LM-TOWEL-SAND"] })
    )

    await replace(canvas.getByRole("spinbutton", { name: "Quantity of Waffle towel" }), "100")
    await replace(canvas.getByRole("spinbutton", { name: "Cost of Waffle towel" }), "7")
    await expect(canvas.getByText("1 variant (100 units)")).toBeVisible()
    await expect(canvas.getAllByText("$700")).toHaveLength(4)
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-1050")
    await expect(canvas.getByRole("textbox", { name: "Note to supplier" })).toHaveAccessibleDescription(
      /Markdown supported/
    )
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Note to supplier" }),
      "- Seal each bag.\n- Keep **both units** together."
    )
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
    await expect(actions).toHaveBeenCalledWith({
      action: "order.create",
      data: expect.objectContaining({
        reference: "PO-1050",
        notes: "- Seal each bag.\n- Keep **both units** together.",
        supplierId,
        destination: "amazon",
        currency: "USD",
        paymentTerms: "Payment in advance",
        items: [
          expect.objectContaining({
            variantId: sand.id,
            name: "Waffle towel",
            buyerSku: "TOWEL-SAND",
            supplierSku: "LM-TOWEL-SAND",
            pieces: 100,
            unitPrice: 700
          })
        ]
      })
    })
  }
})

// Saving checks the purchase order: a reference, a supplier, and an address for a purchase order to the buyer's own
// location.
export const Validation = meta.story({
  args: { initialItems: [tote!] },
  play: async ({ canvas }) => {
    await choose(canvas, "Destination", "Your location")
    const address = canvas.getByRole("combobox", { name: "Delivery address" })
    await expect(address).toHaveTextContent("Choose address")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))

    await expect(await canvas.findByText("Fill in this field")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Reference number" })).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveAttribute("aria-invalid", "true")
    await expect(address).toHaveAttribute("aria-invalid", "true")
    await expect(actions).not.toHaveBeenCalled()

    await choose(canvas, "Delivery address", "Oakland warehouse")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveAttribute("aria-invalid", "false")
    // Back to Amazon, the address goes.
    await choose(canvas, "Destination", "Amazon")
    await expect(canvas.queryByRole("combobox", { name: "Delivery address" })).toBeNull()

    // A cleared quantity stays empty once it loses focus, and saving asks for it.
    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" })
    await userEvent.clear(quantity)
    await userEvent.tab()
    await expect(quantity).toHaveValue(null)
    await expect(canvas.getByText("1 variant (0 units)")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(quantity).toHaveAttribute("aria-invalid", "true"))
    await expect(actions).not.toHaveBeenCalled()
    await userEvent.type(quantity, "40")
    await expect(quantity).toHaveAttribute("aria-invalid", "false")
    await expect(canvas.getByText("1 variant (40 units)")).toBeVisible()
  }
})

// Lines from Restock under their supplier: its catalog quotes their prices, with a volume break, what it can still
// sell, and its ordering rules.
export const SupplierQuotes = meta.story({
  args: { initialItems: [tote!, apron!, basket!], initialSupplierId: supplierId },
  beforeEach: ({ msw }) => {
    msw.use(
      catalogMatches({
        [tote!.supplierSku]: {
          status: "matched",
          unitPriceMinor: 390,
          available: 800,
          tiers: [
            { minimumPieces: 1, unitPriceMinor: 390 },
            { minimumPieces: 500, unitPriceMinor: 350 }
          ]
        },
        [apron!.supplierSku]: {
          status: "matched",
          unitPriceMinor: 900,
          available: null,
          rules: { increment: 50, minimum: 1, maximum: null }
        },
        [basket!.supplierSku]: { status: "not_in_supplier_catalog", unitPriceMinor: null, available: null }
      })
    )
  },
  play: async ({ canvas }) => {
    const totePrice = canvas.getByRole("spinbutton", { name: "Cost of Canvas tote bag" })
    await waitFor(() => expect(totePrice).toHaveValue(3.9))
    await expect(canvas.getByText("800 available")).toHaveClass("text-muted-foreground")
    await expect(canvas.getByRole("spinbutton", { name: "Cost of Linen apron" })).toHaveValue(9)
    await expect(canvas.getByText("Order in multiples of 50")).toBeVisible()
    await expect(canvas.getByText("Not in the supplier’s catalog")).toBeVisible()
    // The basket keeps its own price.
    await expect(canvas.getByRole("spinbutton", { name: "Cost of Market basket" })).toHaveValue(14.5)

    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" })
    await replace(quantity, "500")
    await waitFor(() => expect(totePrice).toHaveValue(3.5))
    await replace(quantity, "900")
    await expect(canvas.getByText("800 available")).toHaveClass("text-destructive")
  }
})

export const CatalogLookupFails = meta.story({
  args: { initialItems: [tote!], initialSupplierId: supplierId },
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/supplier-catalog/match", () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Couldn’t load the supplier catalog")).toBeVisible()
    // The line keeps its price.
    await expect(canvas.getByRole("spinbutton", { name: "Cost of Canvas tote bag" })).toHaveValue(4.25)
  }
})

// A draft opened to edit: it saves as the next revision once something changed, then goes back to the purchase order.
export const EditDraft = meta.story({
  args: {
    title: "Edit",
    parents: [
      { label: "Purchase orders", href: "/orders" },
      { label: "PO-1042", href: `/orders/${orderId}` }
    ],
    draft: { id: orderId, revision: 2, data: order },
    needsBarcodeVariantIds: [basket!.variantId]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-1042" })).toHaveAttribute("href", `/orders/${orderId}`)
    await expect(canvas.getByRole("button", { name: "Discard" })).toHaveAttribute("href", `/orders/${orderId}`)
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Oakland warehouse")
    await expect(canvas.getByRole("textbox", { name: "Reference number" })).toHaveValue("PO-1042")
    await expect(canvas.getByText("Needs an uploaded label")).toBeVisible()
    // The warning color is too light for text: only its icon uses it.
    await expect(canvas.getByText("Needs an uploaded label").closest(".text-warning")).toBeNull()
    await expect(canvas.getByText("3 variants (420 units)")).toBeVisible()
    const save = canvas.getByRole("button", { name: "Save" })
    await expect(save).toBeDisabled()

    // A saved draft's lines download their labels.
    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag" }))
    await expect(await screen.findByRole("menuitem", { name: "Download label" })).toHaveAttribute(
      "href",
      `/api/orders/${orderId}/labels/${tote!.id}`
    )
    await userEvent.keyboard("{Escape}")

    await userEvent.click(canvas.getByRole("button", { name: "Remove Market basket" }))
    await expect(canvas.getByText("2 variants (360 units)")).toBeVisible()
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
    await expect(actions).toHaveBeenCalledWith({
      action: "order.update",
      data: {
        id: orderId,
        revision: 2,
        order: expect.objectContaining({
          items: [expect.objectContaining({ id: tote!.id }), expect.objectContaining({ id: apron!.id })]
        })
      }
    })
  }
})

// The cost summary's editor adds shipping and takes off a discount.
export const CostSummary = meta.story({
  args: { initialItems: [tote!] },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("$1,020")).toHaveLength(4)
    await userEvent.click(canvas.getByRole("button", { name: "Edit cost summary" }))
    const dialog = await shownDialog("Edit cost summary")
    await userEvent.click(dialog.getByRole("button", { name: "Add adjustment" }))
    const save = dialog.getByRole("button", { name: "Save" })
    await expect(save).toBeDisabled()
    await userEvent.click(dialog.getByRole("combobox", { name: "Adjustment" }))
    await userEvent.click(await screen.findByRole("option", { name: "Shipping amount" }))
    await userEvent.type(dialog.getByRole("spinbutton", { name: "Amount" }), "80")

    await userEvent.click(dialog.getByRole("button", { name: "Add adjustment" }))
    const types = dialog.getAllByRole("combobox", { name: "Adjustment" })
    await userEvent.click(types[1]!)
    await userEvent.click(await screen.findByRole("option", { name: "Discount" }))
    await userEvent.type(dialog.getAllByRole("spinbutton", { name: "Amount" })[1]!, "20")
    await userEvent.click(save)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await expect(canvas.getByText("Shipping amount")).toBeVisible()
    await expect(canvas.getByText("$80")).toBeVisible()
    await expect(canvas.getByText("Discount")).toBeVisible()
    await expect(canvas.getByText("-$20")).toBeVisible()
    await expect(canvas.getByText("$1,080")).toBeVisible()
  }
})

// A forwarder's stop on the way: one without a phone number can't take an Amazon pickup.
export const StopOnTheWay = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add stop" }))
    await expect(canvas.getByRole("combobox", { name: "Stop on the way" })).toHaveTextContent("Choose forwarder")
    await choose(canvas, "Stop on the way", "Bayline Freight, Shenzhen yard")
    await expect(canvas.getByText(/Amazon needs a phone number at this stop for pickup/)).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Add one" })).toHaveAttribute("href", "/partners?type=forwarder")
    await choose(canvas, "Stop on the way", "Bayline Freight, Ningbo warehouse")
    await expect(canvas.queryByText(/Amazon needs a phone number/)).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Remove the stop" }))
    await expect(canvas.queryByRole("combobox", { name: "Stop on the way" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Add stop" })).toBeEnabled()
  }
})

export const NoForwarders = meta.story({
  args: { forwarderAddresses: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add stop" })).toBeDisabled()
  }
})

export const ShipmentGroups = meta.story({
  args: {
    initialItems: [
      { ...tote!, amazonNetwork: "awd_us" },
      { ...apron!, amazonNetwork: "fba" },
      { ...basket!, amazonNetwork: "fba" }
    ],
    initialSupplierId: supplierId
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "AWD US shipment" })).toBeVisible()
    await expect(canvas.getByRole("heading", { name: "FBA shipment" })).toBeVisible()
    const apronSelection = canvas.getByRole("checkbox", { name: /^Select Linen apron/ })
    await userEvent.click(apronSelection)
    await expect(canvas.getByRole("checkbox", { name: "Select all products for FBA" })).toHaveAttribute(
      "aria-checked",
      "mixed"
    )
    await userEvent.click(canvas.getByRole("button", { name: "Move to AWD US" }))
    // Moving a line changes its destination without reordering the form array or losing quantities/prices.
    await replace(canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" }), "60")
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" })).toHaveValue(tote!.pieces)
    await expect(canvas.getByRole("spinbutton", { name: "Cost of Linen apron" })).toHaveValue(apron!.unitPrice / 100)
    await expect(canvas.getByRole("button", { name: /AWD US shipment/ })).toHaveTextContent(
      money(tote!.pieces * tote!.unitPrice + 60 * apron!.unitPrice, "USD")
    )
    await replace(canvas.getByRole("spinbutton", { name: "Cost of Linen apron" }), "10")
    await expect(canvas.getByRole("button", { name: /AWD US shipment/ })).toHaveTextContent(
      money(tote!.pieces * tote!.unitPrice + 60000, "USD")
    )
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products for FBA" }))
    await userEvent.click(canvas.getByRole("button", { name: "Move to AWD US" }))
    await expect(canvas.queryByRole("heading", { name: "FBA shipment" })).toBeNull()
    // Move a single line back, then save the actual network allocation.
    await userEvent.click(canvas.getByRole("checkbox", { name: /^Select Linen apron/ }))
    await userEvent.click(canvas.getByRole("button", { name: "Move to FBA" }))
    await expect(canvas.getByRole("heading", { name: "FBA shipment" })).toBeVisible()
    const fbaToggle = canvas.getByRole("button", { name: /FBA shipment/ })
    await userEvent.click(fbaToggle)
    await expect(fbaToggle).toHaveAttribute("aria-expanded", "false")
    await expect(fbaToggle).toHaveTextContent("$600")
    await userEvent.click(fbaToggle)
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" })).toHaveValue(60)
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-1052")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({
        action: "order.create",
        data: expect.objectContaining({
          items: [
            expect.objectContaining({ id: tote!.id, amazonNetwork: "awd_us", pieces: tote!.pieces }),
            expect.objectContaining({ id: apron!.id, amazonNetwork: "fba", pieces: 60, unitPrice: 1000 }),
            expect.objectContaining({ id: basket!.id, amazonNetwork: "awd_us", pieces: basket!.pieces })
          ]
        })
      })
    )
  }
})

export const BundlePackDetails = meta.story({
  args: {
    initialSupplierId: supplierId,
    initialItems: [
      {
        ...tote!,
        name: "Canvas tote bag (2 Pack)",
        buyerSku: "TOTE-2PACK",
        supplierSku: "",
        piecesPerSet: 2,
        components: [
          { variantId: "gid://shopify/ProductVariant/901", buyerSku: "TOTE", supplierSku: "LM-TOTE", quantity: 2 }
        ]
      }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("TOTE-2PACK", { exact: true })).toBeVisible()
    await expect(canvas.getByText("2 per pack", { exact: true })).toBeVisible()
    await expect(canvas.getByText("2 × LM-TOTE", { exact: true })).toBeVisible()
    await expect(canvas.queryByText(/per unit/)).toBeNull()
  }
})

export const PackingRequirements = meta.story({
  args: { initialItems: [tote!], initialSupplierId: supplierId },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit packing details" }))
    const dialog = await shownDialog("Packing details")
    await expect(dialog.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole("combobox", { name: "Preparation" }))
    await userEvent.click(await screen.findByRole("option", { name: "Sealed polybag" }))
    await userEvent.click(dialog.getByRole("checkbox", { name: "Country of origin label" }))
    await userEvent.click(dialog.getByRole("combobox", { name: "Country code" }))
    await userEvent.click(await screen.findByRole("option", { name: /^China$/ }))
    await userEvent.click(dialog.getByRole("checkbox", { name: "Choking hazard label" }))
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-PACKING")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({
        action: "order.create",
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              packingRequirements: expect.objectContaining({
                preparation: "sealedPolybag",
                countryCode: "CN",
                labels: expect.arrayContaining(["choking", "countryOfOrigin"])
              })
            })
          ]
        })
      })
    )
  }
})

// A line's packing details: preparation, labels and supplier instructions. Its destination is managed in the shipment groups.
export const PackingDetails = meta.story({
  args: { initialItems: [{ ...tote!, fnsku: "X001PACK01" }], initialSupplierId: supplierId },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag" }))
    // A new purchase order has no labels to download yet.
    await expect(screen.queryByRole("menuitem", { name: "Download label" })).toBeNull()
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit packing details" }))
    const dialog = await shownDialog("Packing details")
    await expect(dialog.getByText("Canvas tote bag")).toBeVisible()
    await expect(dialog.queryByRole("combobox", { name: "Amazon warehouse" })).toBeNull()
    // Pre-labelled Amazon products can omit FNSKU application. SKU and FNSKU are separate tasks.
    const skuLabel = dialog.getByRole("checkbox", { name: "FNSKU label" })
    await expect(skuLabel).toBeChecked()
    await expect(skuLabel).toBeEnabled()
    await userEvent.click(skuLabel)
    await expect(skuLabel).not.toBeChecked()
    await userEvent.click(dialog.getByRole("checkbox", { name: /^SKU label$/ }))
    await expect(dialog.getByText("X001PACK01", { exact: true })).toBeVisible()
    await expect(dialog.queryByText("Amazon requires it")).toBeNull()
    await userEvent.type(dialog.getByRole("textbox", { name: "Instructions" }), "Fold with the logo out")
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-1051")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({
        action: "order.create",
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              packingRequirements: expect.objectContaining({
                instructions: "Fold with the logo out",
                labels: ["suffocation", "sku"]
              }),
              amazonNetwork: "fba"
            })
          ]
        })
      })
    )
  }
})
import { money } from "@repo/aisle"

export const WarehouseSkuLabel = meta.story({
  args: {
    initialItems: [{ ...tote!, fnsku: "" }],
    initialSupplierId: supplierId,
    initialDestination: "warehouse",
    initialDeliveryId: deliveries[0]!.id
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit packing details" }))
    const dialog = await shownDialog("Packing details")
    const label = dialog.getByRole("checkbox", { name: "SKU label" })
    await expect(label).toBeChecked()
    await userEvent.click(label)
    await expect(label).not.toBeChecked()
    await expect(dialog.queryByText("Amazon requires it")).toBeNull()
  }
})

export const WarehouseFnskuLabel = meta.story({
  args: {
    initialItems: [{ ...tote!, fnsku: "X001PACK01" }],
    initialSupplierId: supplierId,
    initialDestination: "warehouse",
    initialDeliveryId: deliveries[0]!.id
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit packing details" }))
    const dialog = await shownDialog("Packing details")
    const label = dialog.getByRole("checkbox", { name: "FNSKU label" })
    await expect(dialog.getByText("X001PACK01", { exact: true })).toBeVisible()
    await userEvent.click(label)
    await expect(label).not.toBeChecked()
    await expect(dialog.queryByText("Amazon requires it")).toBeNull()
  }
})
