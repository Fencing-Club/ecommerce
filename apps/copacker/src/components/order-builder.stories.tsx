import { money } from "@repo/copacker-orders"
import { HttpResponse, http } from "msw/http"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions } from "@/stories/actions"
import { supplierId } from "@/stories/fixtures/orders"
import {
  builderSuppliers,
  catalogMatches,
  catalogVariants,
  deliveries,
  order,
  orderId,
  productHandlers,
  stops
} from "@/stories/fixtures/purchase-orders"
import { shownDialog, chooseOption } from "@/stories/play"
import { OrderBuilder } from "./order-builder"

const sent: ActionRequest[] = []
const lookups = fn()
const [tote, apron, basket] = order.items
const sand = catalogVariants[0]!

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
    msw.use(...productHandlers(), catalogMatches({}, lookups), recordActions(sent))
  }
})

type Canvas = ReturnType<typeof within>

// Picks a choice from one of the route's pills, such as the supplier.
async function choose(canvas: Canvas, pill: string, option: string) {
  await chooseOption(canvas.getByRole("combobox", { name: pill }), option)
}

// Clears a quantity, which stays empty, then types a new one into it.
async function replace(input: HTMLElement, text: string) {
  await userEvent.clear(input)
  await expect(input).toHaveValue(null)
  await userEvent.type(input, text)
}

// Clears a price, then types a new one into it.
async function reprice(input: HTMLElement, text: string) {
  await userEvent.clear(input)
  await expect(input).toHaveValue("")
  await userEvent.type(input, text)
}

// The shipment cards' names, in the order they're shown.
const shipmentNames = (canvas: Canvas) =>
  canvas.getAllByRole("heading", { level: 3 }).map((heading: HTMLElement) => heading.textContent)

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
    msw.use(recordActions(sent, () => HttpResponse.json({ ok: true, redirect: `/orders/${orderId}` })))
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

    // The line starts at one unit, at its Shopify cost, with its supplier SKU. A supplier without a catalog leaves it.
    await expect(canvas.getByText("Sand")).toBeVisible()
    await expect(canvas.getByText("TOWEL-SAND")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Supplier SKU for Waffle towel" })).toHaveValue("LM-TOWEL-SAND")
    await expect(canvas.getByRole("textbox", { name: "Cost of Waffle towel" })).toHaveValue("6.50")
    // The supplier's catalog is asked for its quote.
    await waitFor(() =>
      expect(lookups).toHaveBeenCalledWith({ supplierId, currency: "USD", supplierSkus: ["LM-TOWEL-SAND"] })
    )
    await expect(canvas.getByRole("textbox", { name: "Cost of Waffle towel" })).toHaveValue("6.50")

    await replace(canvas.getByRole("spinbutton", { name: "Quantity of Waffle towel" }), "100")
    // The totals follow the cost as it's typed.
    await reprice(canvas.getByRole("textbox", { name: "Cost of Waffle towel" }), "7")
    await expect(canvas.getByText("1 variant (100 units)")).toBeVisible()
    await expect(canvas.getAllByText("$700")).toHaveLength(4)
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-1050")
    await expect(canvas.getByRole("textbox", { name: "Cost of Waffle towel" })).toHaveValue("7.00")
    await expect(canvas.getByRole("textbox", { name: "Note to supplier" })).toHaveAccessibleDescription(
      /Markdown supported/
    )
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Note to supplier" }),
      "- Seal each bag.\n- Keep **both units** together."
    )
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
    await expect(sent).toContainEqual({
      action: "order.create",
      data: expect.objectContaining({
        reference: "PO-1050",
        notes: "- Seal each bag.\n- Keep **both units** together.",
        supplierId,
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

// A product added from a supplier's catalog takes its quote in place of the Shopify cost it starts at.
export const QuoteReplacesShopifyCost = meta.story({
  args: { initialSupplierId: supplierId },
  beforeEach: ({ msw }) => {
    msw.use(catalogMatches({ "LM-TOWEL-SAND": { status: "matched", unitPriceMinor: 600, available: null } }, lookups))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Search products to add" }))
    const dialog = await shownDialog("Add products")
    await userEvent.click(await dialog.findByRole("checkbox", { name: "Waffle towel Sand" }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to purchase order" }))
    const cost = await canvas.findByRole("textbox", { name: "Cost of Waffle towel" })
    await waitFor(() => expect(cost).toHaveValue("6.00"))
    await expect(canvas.queryByText("Not in the supplier’s catalog")).toBeNull()
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
    await expect(sent).toEqual([])

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
    await expect(sent).toEqual([])
    await userEvent.type(quantity, "40")
    await expect(quantity).toHaveAttribute("aria-invalid", "false")
    await expect(canvas.getByText("1 variant (40 units)")).toBeVisible()

    // So does a cleared cost.
    const cost = canvas.getByRole("textbox", { name: "Cost of Canvas tote bag" })
    await userEvent.clear(cost)
    await userEvent.tab()
    await expect(cost).toHaveValue("")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(cost).toHaveAttribute("aria-invalid", "true"))
    await expect(sent).toEqual([])
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
    const totePrice = canvas.getByRole("textbox", { name: "Cost of Canvas tote bag" })
    await waitFor(() => expect(totePrice).toHaveValue("3.90"))
    await expect(canvas.getByText("800 available")).toHaveClass("text-muted-foreground")
    await expect(canvas.getByRole("textbox", { name: "Cost of Linen apron" })).toHaveValue("9.00")
    await expect(canvas.getByText("Order in multiples of 50")).toBeVisible()
    await expect(canvas.getByText("Not in the supplier’s catalog")).toBeVisible()
    // The basket keeps its own price.
    await expect(canvas.getByRole("textbox", { name: "Cost of Market basket" })).toHaveValue("14.50")

    // A quantity reaching the volume break moves to its price, and back below it returns to the first.
    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" })
    await replace(quantity, "500")
    await waitFor(() => expect(totePrice).toHaveValue("3.50"))
    await replace(quantity, "900")
    await expect(canvas.getByText("800 available")).toHaveClass("text-destructive")
    await replace(quantity, "100")
    await waitFor(() => expect(totePrice).toHaveValue("3.90"))
  }
})

// A price the buyer types stays theirs: a quantity crossing a volume break doesn't move it.
export const BuyerPriceStays = meta.story({
  args: { initialItems: [tote!], initialSupplierId: supplierId },
  beforeEach: ({ msw }) => {
    msw.use(
      catalogMatches({
        [tote!.supplierSku]: {
          status: "matched",
          unitPriceMinor: 390,
          available: null,
          tiers: [
            { minimumPieces: 1, unitPriceMinor: 390 },
            { minimumPieces: 500, unitPriceMinor: 350 }
          ]
        }
      })
    )
  },
  play: async ({ canvas }) => {
    const price = canvas.getByRole("textbox", { name: "Cost of Canvas tote bag" })
    await waitFor(() => expect(price).toHaveValue("3.90"))
    await reprice(price, "4")
    await replace(canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" }), "500")
    await userEvent.tab()
    await expect(price).toHaveValue("4.00")
  }
})

// A draft's prices are its own: the catalog only fills in a line without one.
export const DraftKeepsPrices = meta.story({
  args: {
    title: "Edit",
    draft: { id: orderId, revision: 2, data: { ...order, items: [tote!, { ...apron!, unitPrice: 0 }] } }
  },
  beforeEach: ({ msw }) => {
    msw.use(
      catalogMatches({
        [tote!.supplierSku]: { status: "matched", unitPriceMinor: 390, available: null },
        [apron!.supplierSku]: { status: "matched", unitPriceMinor: 900, available: null }
      })
    )
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Cost of Linen apron" })).toHaveValue("9.00"))
    await expect(canvas.getByRole("textbox", { name: "Cost of Canvas tote bag" })).toHaveValue("4.25")
  }
})

// A bundle is priced from its components' quotes, and can be made as many times as its scarcest component allows.
export const BundleQuote = meta.story({
  args: {
    initialSupplierId: supplierId,
    initialItems: [
      {
        ...tote!,
        name: "Canvas tote bag (2 Pack)",
        buyerSku: "TOTE-2PACK",
        supplierSku: "",
        piecesPerSet: 2,
        pieces: 2,
        unitPrice: 0,
        components: [
          { variantId: "gid://shopify/ProductVariant/901", buyerSku: "TOTE", supplierSku: "LM-TOTE", quantity: 2 }
        ]
      }
    ]
  },
  beforeEach: ({ msw }) => {
    msw.use(catalogMatches({ "LM-TOTE": { status: "matched", unitPriceMinor: 390, available: 801 } }, lookups))
  },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Cost of Canvas tote bag (2 Pack)" })).toHaveValue("3.90")
    )
    await expect(lookups).toHaveBeenCalledWith({ supplierId, currency: "USD", supplierSkus: ["LM-TOTE"] })
    await expect(canvas.getByText("800 available")).toBeVisible()
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
    await expect(canvas.getByRole("textbox", { name: "Cost of Canvas tote bag" })).toHaveValue("4.25")
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
    await expect(canvas.getByText("Needs an uploaded label").closest(".text-amber-400")).toBeNull()
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
    await expect(sent).toContainEqual({
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
    await chooseOption(dialog.getByRole("combobox", { name: "Adjustment" }), "Shipping amount")
    await expect(save).toBeDisabled()
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount" }), "80")
    await expect(save).toBeEnabled()

    await userEvent.click(dialog.getByRole("button", { name: "Add adjustment" }))
    const types = dialog.getAllByRole("combobox", { name: "Adjustment" })
    await chooseOption(types[1]!, "Discount")
    await userEvent.type(dialog.getAllByRole("textbox", { name: "Amount" })[1]!, "20")
    await userEvent.click(save)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await expect(canvas.getByText("Shipping amount")).toBeVisible()
    await expect(canvas.getByText("$80")).toBeVisible()
    await expect(canvas.getByText("Discount")).toBeVisible()
    await expect(canvas.getByText("-$20")).toBeVisible()
    await expect(canvas.getByText("$1,080")).toBeVisible()

    // Opening it again shows them, the discount without its sign.
    await userEvent.click(canvas.getByRole("button", { name: "Edit cost summary" }))
    const again = await shownDialog("Edit cost summary")
    const [shipping, discount] = again.getAllByRole("textbox", { name: "Amount" })
    await expect(shipping).toHaveValue("80.00")
    await expect(discount).toHaveValue("20.00")
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
      { ...tote!, receiver: "awd_us" },
      { ...apron!, receiver: "fba" },
      { ...basket!, receiver: "fba" }
    ],
    initialSupplierId: supplierId
  },
  play: async ({ canvas }) => {
    // FBA first, then AWD US, as the packing rules list Amazon's networks.
    await expect(shipmentNames(canvas)).toEqual(["FBA shipment", "AWD US shipment"])
    const apronSelection = canvas.getByRole("checkbox", { name: /^Select Linen apron/ })
    await userEvent.click(apronSelection)
    await expect(canvas.getByRole("checkbox", { name: "Select all products for FBA" })).toHaveAttribute(
      "aria-checked",
      "mixed"
    )
    await expect(canvas.getByRole("toolbar", { name: "Move products" })).toHaveTextContent("1 product selected")
    await userEvent.click(canvas.getByRole("button", { name: "Move to AWD US" }))
    await expect(canvas.queryByRole("toolbar", { name: "Move products" })).toBeNull()
    // Moving a line changes its destination without reordering the form array or losing quantities/prices.
    await replace(canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" }), "60")
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Canvas tote bag" })).toHaveValue(tote!.pieces)
    await expect(canvas.getByRole("textbox", { name: "Cost of Linen apron" })).toHaveValue("8.90")
    await expect(canvas.getByRole("button", { name: /AWD US shipment/ })).toHaveTextContent(
      money(tote!.pieces * tote!.unitPrice + 60 * apron!.unitPrice, "USD")
    )
    await reprice(canvas.getByRole("textbox", { name: "Cost of Linen apron" }), "10")
    await expect(canvas.getByRole("button", { name: /AWD US shipment/ })).toHaveTextContent(
      money(tote!.pieces * tote!.unitPrice + 60000, "USD")
    )
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products for FBA" }))
    await userEvent.click(canvas.getByRole("button", { name: "Move to AWD US" }))
    await expect(canvas.queryByRole("heading", { name: "FBA shipment" })).toBeNull()
    // Move a single line back, then save the actual network allocation.
    await userEvent.click(canvas.getByRole("checkbox", { name: /^Select Linen apron/ }))
    await userEvent.click(canvas.getByRole("button", { name: "Move to FBA" }))
    await expect(shipmentNames(canvas)).toEqual(["FBA shipment", "AWD US shipment"])
    const fbaToggle = canvas.getByRole("button", { name: /FBA shipment/ })
    await userEvent.click(fbaToggle)
    await expect(fbaToggle).toHaveAttribute("aria-expanded", "false")
    await expect(fbaToggle).toHaveTextContent("$600")
    await userEvent.click(fbaToggle)
    await expect(canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" })).toHaveValue(60)
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-1052")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toContainEqual({
        action: "order.create",
        data: expect.objectContaining({
          items: [
            expect.objectContaining({ id: tote!.id, receiver: "awd_us", pieces: tote!.pieces }),
            expect.objectContaining({ id: apron!.id, receiver: "fba", pieces: 60, unitPrice: 1000 }),
            expect.objectContaining({ id: basket!.id, receiver: "awd_us", pieces: basket!.pieces })
          ]
        })
      })
    )
  }
})

// A new destination takes the lines with it, and back at Amazon each returns to the network it was on.
export const ChangeDestination = meta.story({
  args: {
    initialItems: [
      { ...tote!, receiver: "awd_us" },
      { ...apron!, receiver: "fba" }
    ]
  },
  play: async ({ canvas }) => {
    await choose(canvas, "Destination", "Your location")
    await expect(shipmentNames(canvas)).toEqual(["Your location shipment"])
    await expect(canvas.queryByRole("checkbox", { name: /^Select/ })).toBeNull()
    await choose(canvas, "Delivery address", "Oakland warehouse")
    await choose(canvas, "Destination", "Amazon")
    await expect(shipmentNames(canvas)).toEqual(["FBA shipment", "AWD US shipment"])
    const awd = within(canvas.getByRole("button", { name: /AWD US shipment/ }).closest("[data-slot=collapsible]")!)
    await expect(awd.getByText("Canvas tote bag")).toBeVisible()
    // The address went with the old destination.
    await choose(canvas, "Destination", "Your location")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Choose address")
  }
})

// Restock's lines for the buyer's own location start there, and keep their product's network for a PO to Amazon.
export const ToYourLocation = meta.story({
  args: {
    initialItems: [{ ...tote!, receiver: "awd_us" }],
    initialDestination: "warehouse",
    initialDeliveryId: deliveries[0]!.id,
    initialSupplierId: supplierId
  },
  play: async ({ canvas }) => {
    await expect(shipmentNames(canvas)).toEqual(["Your location shipment"])
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Oakland warehouse")
    await choose(canvas, "Destination", "Amazon")
    await expect(shipmentNames(canvas)).toEqual(["AWD US shipment"])
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
    await chooseOption(dialog.getByRole("combobox", { name: "Preparation" }), "Sealed polybag")
    await userEvent.click(dialog.getByRole("checkbox", { name: "Country of origin label" }))
    await chooseOption(dialog.getByRole("combobox", { name: "Country code" }), /^China$/)
    await userEvent.click(dialog.getByRole("checkbox", { name: "Choking hazard label" }))
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-PACKING")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toContainEqual({
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
      expect(sent).toContainEqual({
        action: "order.create",
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              packingRequirements: expect.objectContaining({
                instructions: "Fold with the logo out",
                labels: ["suffocation", "sku"]
              }),
              receiver: "fba"
            })
          ]
        })
      })
    )
  }
})

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
