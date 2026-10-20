import type { OrderInput, PackingDraft } from "@repo/aisle"
import { HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { supplierId } from "@/stories/fixtures/orders"
import { actionHandler, order, pickupAddress, shipmentRecord, shownDialog } from "@/stories/fixtures/purchase-orders"
import { member } from "@/stories/workspace"
import { PackingForm } from "./packing-form"

const actions = fn()
const shipment = shipmentRecord()
const [tote, apron, basket] = order.items
const savedAddress = { id: "5d6e7f80-1a2b-4c3d-8e9f-000000000001", name: "Ningbo factory", address: pickupAddress }

// A packing list ready to check: two cartons of totes, ready on a day, from the factory.
const draft: PackingDraft = {
  readyDate: "2026-10-05",
  origin: pickupAddress,
  cartons: [
    { cartonId: "C1", length: 60, width: 40, height: 40, weight: 12, items: [{ itemId: tote!.id, pieces: 40 }] },
    { cartonId: "C2", length: 60, width: 40, height: 40, weight: 12, items: [{ itemId: tote!.id, pieces: 40 }] }
  ],
  changes: [{ itemId: tote!.id, supplierSku: "LM-TOTE-NAT", unitPrice: 410 }]
}

const completeDraft: PackingDraft = {
  ...draft,
  changes: [],
  cartons: order.items.flatMap((item, index) =>
    Array.from({ length: item.pieces / 60 }, (_, carton) => ({
      cartonId: `${index + 1}-${carton + 1}`,
      length: 60,
      width: 40,
      height: 40,
      weight: 12,
      items: [{ itemId: item.id, pieces: 60 }]
    }))
  )
}

// Saving a draft answers with its new revision; a check answers with `check`.
function packingActions(check: { canSubmit: boolean; requiresApproval: boolean; issues: unknown[] }) {
  return actionHandler(actions, (body) => {
    if (body.action === "shipment.save") {
      return HttpResponse.json({ ok: true, revision: 2 })
    }
    return body.action === "shipment.check" ? HttpResponse.json({ ok: true, ...check }) : undefined
  })
}

const meta = preview.meta({
  title: "Components/Shipments/Packing form",
  component: PackingForm,
  args: {
    shipmentId: shipment.id,
    revision: 1,
    orderRevision: 1,
    availablePieces: { [tote!.id]: 240, [apron!.id]: 120, [basket!.id]: 60 },
    order,
    initial: null,
    addresses: []
  },
  beforeEach: ({ msw }) => {
    msw.use(packingActions({ canSubmit: true, requiresApproval: false, issues: [] }))
  }
})

export const LinkExistingAwd = meta.story({
  args: { linkedAmazonShipmentId: null },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions, (body) => HttpResponse.json({ revision: Number(body.data.revision) + 1 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    const carton = canvas.getByRole("region", { name: "Carton 1" })
    await userEvent.type(canvas.getByRole("textbox", { name: "AWD shipment ID" }), "star-example")
    await userEvent.click(canvas.getByRole("button", { name: "Link shipment" }))
    await expect(await canvas.findByText(/Linked to STAR-EXAMPLE/)).toBeVisible()
    await expect(carton).toBeVisible()
    await expect(actions).toHaveBeenNthCalledWith(1, {
      action: "shipment.save",
      data: expect.objectContaining({
        revision: 1,
        draft: expect.objectContaining({
          cartons: [{ cartonId: "1", items: [] }]
        })
      })
    })
    await expect(actions).toHaveBeenNthCalledWith(2, {
      action: "shipment.linkExisting",
      data: { id: shipment.id, revision: 2, amazonShipmentId: "STAR-EXAMPLE" }
    })
    await userEvent.click(canvas.getByRole("button", { name: "Remove link" }))
    await expect(await canvas.findByRole("textbox", { name: "AWD shipment ID" })).toBeVisible()
    await expect(carton).toBeVisible()
    await expect(actions).toHaveBeenNthCalledWith(4, {
      action: "shipment.linkExisting",
      data: { id: shipment.id, revision: 4, amazonShipmentId: null }
    })
  }
})

// A new packing list: no cartons yet, so it can be saved but not submitted.
export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Commercial invoice")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Check packing" })).toBeNull()
    await expect(canvas.queryByRole("textbox", { name: "Supplier SKU" })).toBeNull()
    const products = canvas.getByRole("button", { name: /^Products \(3\)/ })
    await userEvent.hover(products)
    await expect(products).toHaveStyle({ textDecorationLine: "none" })
    await userEvent.click(products)
    await expect(canvas.getByRole("columnheader", { name: /Price per unit/ })).toBeVisible()
    await expect(canvas.getByText("No cartons yet")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await expect(canvas.getByText("0 cartons, 0 units")).toBeVisible()
    // A new address is entered in the address dialog.
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    await expect(canvas.getByText("1 carton, 0 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(actions).toHaveBeenCalledWith({
      action: "shipment.save",
      data: {
        id: shipment.id,
        revision: 1,
        orderRevision: 1,
        draft: expect.objectContaining({
          changes: [],
          readyDate: "",
          cartons: [{ cartonId: "1", items: [] }]
        })
      }
    })
  }
})

// Checking or submitting first checks the fields here.
export const FixFields = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await userEvent.click(canvas.getByRole("spinbutton", { name: "Carton 1: Length (cm)" }))
    await userEvent.tab()
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(actions).not.toHaveBeenCalled()
  }
})

// A complete draft from the only saved address: the check finds what Amazon won't take, by carton.
export const CheckFindsIssues = meta.story({
  args: { initial: draft, addresses: [savedAddress], availablePieces: { [tote!.id]: 80 } },
  beforeEach: ({ msw }) => {
    msw.use(
      packingActions({
        canSubmit: false,
        requiresApproval: false,
        issues: [{ message: "Weighs more than 22.68 kg", cartonId: "C2" }, { message: "Pack Linen apron too" }]
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Commercial invoice")).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent(pickupAddress.addressLine1)
    await expect(canvas.getAllByText(/88 Harbour Road/)[0]).toBeVisible()
    await expect(canvas.getByText("2 cartons, 80 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(within(canvas.getByRole("table")).getByText("80 of 80")).toBeVisible()
    await expect(canvas.queryByRole("textbox", { name: "Supplier SKU" })).toBeNull()
    await expect(canvas.queryByRole("textbox", { name: /Price per unit/ })).toBeNull()

    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(await canvas.findByText(/Carton C2: Weighs more than 22.68 kg/)).toBeVisible()
    await expect(canvas.getByText(/Pack Linen apron too/)).toBeVisible()
    await expect(actions).toHaveBeenCalledWith({ action: "shipment.check", data: { id: shipment.id } })
  }
})

export const Submit = meta.story({
  args: { initial: completeDraft, addresses: [savedAddress] },
  beforeEach: ({ msw }) => {
    msw.use(packingActions({ canSubmit: true, requiresApproval: true, issues: [] }))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("7 cartons, 420 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    // It submits the revision the save just made.
    await expect(actions).toHaveBeenLastCalledWith({
      action: "shipment.submit",
      data: { id: shipment.id, revision: 2 }
    })
  }
})

// Cartons are duplicated from one already measured, and the packed count turns red past what's left to ship.
export const Cartons = meta.story({
  args: {
    initial: { ...draft, cartons: draft.cartons!.map((carton, index) => ({ ...carton, weight: 12 + index })) },
    addresses: [savedAddress],
    availablePieces: { [tote!.id]: 100 }
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await userEvent.click(canvas.getByRole("button", { name: "Carton C2 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate carton" }))
    await expect(canvas.getByText("3 cartons, 120 units")).toBeVisible()
    await expect(within(canvas.getByRole("table")).getByText("120 of 100")).toHaveClass("text-destructive")
    await expect(canvas.getByRole("region", { name: "Carton 3" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expect(canvas.getByText("2 cartons, 80 units")).toBeVisible()
    await expect(within(canvas.getByRole("table")).getByText("80 of 100")).not.toHaveClass("text-destructive")
    // With several products, each carton says which it holds.
    await expect(canvas.getAllByRole("button", { name: /Add products to carton/ })).toHaveLength(2)
  }
})

const mixedDraft: PackingDraft = {
  ...draft,
  cartons: [
    {
      ...draft.cartons![0]!,
      items: [
        { itemId: tote!.id, pieces: 14 },
        { itemId: apron!.id, pieces: 12 }
      ]
    }
  ]
}
const fbaOrder: OrderInput = {
  ...order,
  destination: "amazon",
  items: order.items.map((item) => ({ ...item, amazonNetwork: "fba" }))
}

// Reopening and saving a mixed carton must preserve every size, including when its carton is copied or removed.
export const MixedCarton = meta.story({
  args: { order: fbaOrder, initial: mixedDraft, addresses: [savedAddress] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Carton C1" })).toBeVisible()
    await expect(canvas.getByText("1 carton, 26 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(canvas.getByText("12 of 120")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add products to carton C1" }))
    const dialog = await shownDialog("Add products to carton")
    await userEvent.click(dialog.getByRole("checkbox", { name: `${basket!.name} ${basket!.variant}` }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to carton" }))
    await userEvent.type(canvas.getByRole("spinbutton", { name: `${basket!.buyerSku}: quantity per carton C1` }), "10")
    await expect(canvas.getByText("1 carton, 36 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate carton" }))
    await expect(canvas.getByText("2 cartons, 72 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expect(canvas.getByText("1 carton, 36 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${basket!.buyerSku} from carton 2` }))
    await expect(canvas.getByText("1 carton, 26 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(actions).toHaveBeenLastCalledWith({
      action: "shipment.save",
      data: expect.objectContaining({
        draft: expect.objectContaining({
          cartons: [
            expect.objectContaining({
              items: [
                { itemId: tote!.id, pieces: 14 },
                { itemId: apron!.id, pieces: 12 }
              ]
            })
          ]
        })
      })
    })
  }
})

export const AwdCartons = meta.story({
  args: {
    order: { ...fbaOrder, items: fbaOrder.items.map((item) => ({ ...item, amazonNetwork: "awd_us" })) },
    initial: draft,
    addresses: [savedAddress]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("button", { name: /Add products to carton/ })).toHaveLength(1)
    await expect(canvas.queryByRole("button", { name: "Add product to carton" })).toBeNull()
    await expect(canvas.getByText("2 cartons, 80 units")).toBeVisible()
  }
})

// Opening and dismissing a new address preserves the selected location.
export const PickupAddress = meta.story({
  args: { addresses: [savedAddress] },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText(/88 Harbour Road/)[0]).toBeVisible()
    await userEvent.click(canvas.getByRole("combobox", { name: "Ship from" }))
    await userEvent.click(await screen.findByRole("option", { name: "Add new address" }))
    const dialog = await shownDialog("Add new address")
    await expect(dialog.getByRole("textbox", { name: "Street address" })).toHaveValue("")
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent("88 Harbour Road")
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions, () => HttpResponse.json({ error: "The purchase order changed" }, { status: 409 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await canvas.findByText("The purchase order changed")).toBeVisible()
    await expect(canvas.queryByText("Draft saved")).toBeNull()
  }
})

// The buyer packs for a supplier that isn't on Copacker: the copy speaks of the supplier, its changes update the
// purchase order at once, and the buyer can save pickup addresses to it.
export const ForSupplier = meta.story({
  args: {
    initial: completeDraft,
    addAddressTo: { id: supplierId, name: "Lotus Manufacturing" }
  },
  beforeEach: ({ msw }) => {
    msw.use(packingActions({ canSubmit: true, requiresApproval: true, issues: [] }))
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Commercial invoice")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(canvas.queryByRole("textbox", { name: "Supplier SKU" })).toBeNull()
    await userEvent.click(canvas.getByRole("combobox", { name: "Ship from" }))
    await userEvent.click(await screen.findByRole("option", { name: "Add new address" }))
    const dialog = await shownDialog("Add a pickup address for Lotus Manufacturing")
    await expect(dialog.getAllByRole("textbox").length).toBeGreaterThan(3)
  }
})

// Someone who doesn't see prices packs without them.
export const WithoutPrices = meta.story({
  parameters: { permissions: { ...member, access: { ...member.access, shipments: "edit" } } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: /Price per unit/ })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(within(canvas.getByRole("table")).queryByRole("textbox")).toBeNull()
  }
})

export const LiveValidation = meta.story({
  args: { initial: draft, addresses: [savedAddress], order: fbaOrder },
  play: async ({ canvas }) => {
    const weight = canvas.getAllByRole("spinbutton", { name: /Weight \(kg\)/ })[0]!
    await userEvent.clear(weight)
    await userEvent.type(weight, "30")
    await expect(await canvas.findByText(/22[.,]/)).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await userEvent.clear(weight)
    await userEvent.type(weight, "12")
    await expect(canvas.queryByText(/22[.,]/)).toBeNull()
    await expect(actions).not.toHaveBeenCalled()
    await userEvent.clear(weight)
    await userEvent.tab()
    await expect(weight).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(weight, "12")
    await expect(weight).not.toHaveAttribute("aria-invalid", "true")
  }
})

const awdOrder: OrderInput = {
  ...fbaOrder,
  items: fbaOrder.items.map((item) => ({
    ...item,
    amazonNetwork: "awd_us",
    piecesPerSet: 1,
    fnsku: "X001EXAMPLE",
    asin: "B000000001"
  }))
}
const awdErrors: PackingDraft = {
  ...draft,
  cartons: [
    {
      cartonId: "C1",
      length: 70,
      width: 40,
      height: 40,
      weight: 25,
      items: [
        { itemId: tote!.id, pieces: 160 },
        { itemId: apron!.id, pieces: 10 }
      ]
    }
  ]
}
export const AwdPackingErrors = meta.story({
  args: { order: awdOrder, initial: awdErrors, addresses: [savedAddress] },
  play: async ({ canvas }) => {
    const carton = within(canvas.getByRole("region", { name: "Carton C1" }))
    await expect(
      carton.getByText("Products: AWD requires one SKU per carton. Move these SKUs into separate cartons.")
    ).toBeVisible()
    await expect(
      carton.getByText(/^Quantity: 160 sellable units per carton exceeds AWD’s limit of 150\./)
    ).toBeVisible()
    await expect(carton.getByRole("spinbutton", { name: "Carton C1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(carton.getByRole("spinbutton", { name: "Carton C1: Length (cm)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await expect(carton.getByRole("spinbutton", { name: "Carton C1: Width (cm)" })).not.toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(carton.getByRole("spinbutton", { name: "Carton C1: Height (cm)" })).not.toHaveAttribute(
      "aria-invalid",
      "true"
    )
  }
})

export const ReadyToSubmit = meta.story({
  args: { initial: completeDraft, addresses: [savedAddress] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("7 cartons, 420 units")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
  }
})

export const AmazonCheckFailure = meta.story({
  args: { initial: completeDraft, addresses: [savedAddress] },
  beforeEach: ({ msw }) => {
    msw.use(
      actionHandler(actions, (body) =>
        body.action === "shipment.save"
          ? HttpResponse.json({ ok: true, revision: 2 })
          : HttpResponse.json(
              { error: "Amazon could not validate this shipment. Your packing draft is saved." },
              { status: 503 }
            )
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(await canvas.findByText(/Amazon could not validate/)).toBeVisible()
    await expect(actions).not.toHaveBeenCalledWith(expect.objectContaining({ action: "shipment.submit" }))
    await expect(canvas.getByText("7 cartons, 420 units")).toBeVisible()
  }
})

export const MissingAmazonIdentity = meta.story({
  args: {
    initial: draft,
    addresses: [savedAddress],
    order: { ...awdOrder, items: awdOrder.items.map((item) => ({ ...item, fnsku: "" })) }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText(/add the Amazon ASIN and FNSKU/)).toHaveLength(1)
    await expect(canvas.getAllByRole("spinbutton", { name: /quantity per carton/ })[0]!).not.toHaveAttribute(
      "aria-invalid",
      "true"
    )
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
  }
})

export const AwdConfigurationMismatch = meta.story({
  args: {
    order: awdOrder,
    addresses: [savedAddress],
    initial: {
      ...draft,
      cartons: [draft.cartons![0]!, { ...draft.cartons![1]!, items: [{ itemId: tote!.id, pieces: 30 }] }]
    }
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Packing template: This SKU uses 40 units per carton elsewhere in this shipment. Use the same packing template for every carton of this SKU."
      )
    ).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
  }
})

export const GermanPackingErrors = meta.story({
  args: {
    order: awdOrder,
    initial: awdErrors,
    addresses: [savedAddress],
    heading: <h1 className="text-2xl font-semibold">Sendung 1</h1>
  },
  globals: { locale: "de", viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton", { name: /Länge/ })).toHaveAttribute("aria-invalid", "true")
  }
})
export const AwdPackingErrorsMobile = meta.story({
  args: {
    order: awdOrder,
    initial: awdErrors,
    addresses: [savedAddress],
    heading: <h1 className="text-2xl font-semibold">Shipment 1</h1>
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Products: AWD requires one SKU per carton. Move these SKUs into separate cartons.")
    ).toBeVisible()
  }
})

export const SaveIncompletePacking = meta.story({
  args: { initial: draft, addresses: [savedAddress], onSubmitted: fn() },
  play: async ({ canvas, args }) => {
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(actions).not.toHaveBeenCalledWith(expect.objectContaining({ action: "shipment.submit" }))
    await expect(args.onSubmitted).not.toHaveBeenCalled()
  }
})
