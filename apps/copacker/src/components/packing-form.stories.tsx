import type { OrderInput, PackingDraft } from "@repo/aisle"
import { HttpResponse } from "msw/http"
import { expect, fn, screen, spyOn, userEvent, waitFor, within } from "storybook/test"
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
      cartonId: `${"ABC"[index]}${carton + 1}`,
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

// The units the Cartons header counts as packed. The shipment page's side panel has the other totals.
async function expectPacked(canvas: ReturnType<typeof within>, units: number) {
  await expect(canvas.getByText(new RegExp(String.raw`^${units} of \d+ units$`))).toBeVisible()
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
    const carton = canvas.getByRole("region", { name: "Carton A1" })
    await userEvent.type(canvas.getByRole("textbox", { name: "AWD shipment ID" }), "star-example")
    await userEvent.click(canvas.getByRole("button", { name: "Link shipment" }))
    await expect(await canvas.findByText(/Linked to STAR-EXAMPLE/)).toBeVisible()
    await expect(carton).toBeVisible()
    await expect(actions).toHaveBeenNthCalledWith(1, {
      action: "shipment.save",
      data: expect.objectContaining({
        revision: 1,
        draft: expect.objectContaining({
          cartons: [{ cartonId: "A1", items: [] }]
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
    await expect(canvas.getByRole("button", { name: "Export cartons" })).toBeDisabled()
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await expectPacked(canvas, 0)
    // A new address is entered in the address dialog.
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    await expectPacked(canvas, 0)
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
          palletized: false,
          cartons: [{ cartonId: "A1", items: [] }]
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
    await userEvent.click(canvas.getByRole("spinbutton", { name: "Carton A1: Length (cm)" }))
    await userEvent.tab()
    await expect(canvas.getByText("Enter the length, width and height of each carton.")).toBeVisible()
    await expect(canvas.getByRole("spinbutton", { name: "Carton A1: Length (cm)" })).toHaveAttribute(
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
        issues: [{ message: "Weighs more than 22.67 kg", cartonId: "C2" }, { message: "Pack Linen apron too" }]
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Commercial invoice")).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent(pickupAddress.addressLine1)
    await expect(canvas.getAllByText(/88 Harbour Road/)[0]).toBeVisible()
    await expectPacked(canvas, 80)
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(within(canvas.getByRole("table")).getByText("80 of 80")).toBeVisible()
    await expect(canvas.queryByRole("textbox", { name: "Supplier SKU" })).toBeNull()
    await expect(canvas.queryByRole("textbox", { name: /Price per unit/ })).toBeNull()

    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(await canvas.findByText(/Carton C2: Weighs more than 22.67 kg/)).toBeVisible()
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
    await expectPacked(canvas, 420)
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
    await expectPacked(canvas, 120)
    await expect(within(canvas.getByRole("table")).getByText("120 of 100")).toHaveClass("text-destructive")
    // The copy takes the next letter.
    await expect(canvas.getByRole("region", { name: "Carton D1" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expectPacked(canvas, 80)
    await expect(within(canvas.getByRole("table")).getByText("80 of 100")).not.toHaveClass("text-destructive")
    // Complete rows stay closed until opened; open, each says which carton its products go in.
    await expect(canvas.queryByRole("button", { name: /Add products to carton/ })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Products in D1" }))
    await expect(canvas.getByRole("button", { name: "Add products to carton D1" })).toBeVisible()
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
    await expectPacked(canvas, 26)
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(canvas.getByText("12 of 120")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add products to carton C1" }))
    const dialog = await shownDialog("Add products to carton")
    await userEvent.click(dialog.getByRole("checkbox", { name: `${basket!.name} ${basket!.variant}` }))
    await userEvent.click(dialog.getByRole("button", { name: "Add to carton" }))
    await userEvent.type(canvas.getByRole("spinbutton", { name: `${basket!.buyerSku}: quantity per carton C1` }), "10")
    await expectPacked(canvas, 36)
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate carton" }))
    await expectPacked(canvas, 72)
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expectPacked(canvas, 36)
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${basket!.buyerSku} from carton B1` }))
    await expectPacked(canvas, 26)
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
    await expectPacked(canvas, 80)
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
      carton.getByText(
        "Products: this carton holds more than one SKU, and AWD takes one SKU per carton. Pack each SKU in its own cartons."
      )
    ).toBeVisible()
    await expect(carton.getByText(/^Quantity: 160 units is over AWD’s limit of 150 per carton\./)).toBeVisible()
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
    await expectPacked(canvas, 420)
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
    await expectPacked(canvas, 420)
  }
})

export const MissingAmazonIdentity = meta.story({
  args: {
    initial: draft,
    addresses: [savedAddress],
    order: { ...awdOrder, items: awdOrder.items.map((item) => ({ ...item, fnsku: "" })) }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText(/has no FNSKU, which AWD needs to label it/)).toHaveLength(1)
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
        /other cartons hold 40 units each\. AWD needs every carton of a SKU to match in units, size and weight\./
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
      canvas.getByText(
        "Products: this carton holds more than one SKU, and AWD takes one SKU per carton. Pack each SKU in its own cartons."
      )
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

// Board 06.10 B: packed on pallets. Checking it adds a Pallets section; each carton goes on one pallet, chosen in a
// dialog, and the shipment's weight and volume become its pallets'.
export const PackedOnPallets = meta.story({
  args: {
    initial: { ...completeDraft, palletized: true },
    addresses: [savedAddress],
    renderSidebar: ({ weight, volume }) => (
      <output>
        {weight ?? "—"} kg, {volume ?? "—"} m³
      </output>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("checkbox", { name: "Packed on pallets" })).toBeChecked()
    const pallets = within(canvas.getByRole("region", { name: "Pallets" }))
    await expect(pallets.getByText("No pallets yet")).toBeVisible()
    await expect(
      pallets.getByText(
        "Pallets: these cartons ship on pallets, and there are none yet. Add a pallet, or uncheck Packed on pallets."
      )
    ).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeDisabled()

    await userEvent.click(pallets.getByRole("button", { name: "Add pallet" }))
    const pallet = within(canvas.getByRole("region", { name: "Pallet 1" }))
    for (const [side, value] of [
      ["Length", "120"],
      ["Width", "100"],
      ["Height", "120"]
    ]) {
      await userEvent.type(pallet.getByRole("spinbutton", { name: `Pallet 1: ${side} (cm)` }), value!)
    }
    await userEvent.type(pallet.getByRole("spinbutton", { name: "Pallet 1: Weight (kg)" }), "110")
    await userEvent.click(pallet.getByRole("button", { name: "Choose cartons for Pallet 1" }))
    const dialog = await shownDialog("Choose cartons for Pallet 1")
    await userEvent.click(dialog.getByRole("checkbox", { name: "A1–A4" }))
    await expect(dialog.getByText("4 cartons, 48 kg")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Save cartons" }))
    await expect(pallet.getByRole("listitem")).toHaveTextContent("A1–A4")
    await expect(pallets.getByText("4 of 7 cartons on pallets")).toBeVisible()
    await expect(pallets.getByText(/^Cartons: 3 cartons aren’t on a pallet: B1–B2, C1\./)).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeDisabled()

    // A second pallet takes the rest, and the totals are the pallets'.
    await userEvent.click(pallets.getByRole("button", { name: "Pallet 1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate pallet" }))
    const second = within(canvas.getByRole("region", { name: "Pallet 2" }))
    await userEvent.click(second.getByRole("button", { name: "Choose cartons for Pallet 2" }))
    const chooser = await shownDialog("Choose cartons for Pallet 2")
    await userEvent.click(chooser.getByRole("checkbox", { name: "B1–B2" }))
    await userEvent.click(chooser.getByRole("checkbox", { name: "C1" }))
    await userEvent.click(chooser.getByRole("button", { name: "Save cartons" }))
    await expect(pallets.getByText("7 of 7 cartons on pallets")).toBeVisible()
    await expect(canvas.getByText("220 kg, 2.88 m³")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()

    // A pallet without its height can't be finished, as a carton without one can't.
    const height = second.getByRole("spinbutton", { name: "Pallet 2: Height (cm)" })
    await userEvent.clear(height)
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeDisabled()
    await userEvent.type(height, "120")
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()

    await userEvent.click(canvas.getByRole("button", { name: "Actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(actions).toHaveBeenLastCalledWith({
      action: "shipment.save",
      data: expect.objectContaining({
        draft: expect.objectContaining({
          palletized: true,
          pallets: [
            expect.objectContaining({ palletId: "1", cartonIds: ["A1", "A2", "A3", "A4"], stackable: true }),
            expect.objectContaining({ palletId: "2", cartonIds: ["B1", "B2", "C1"], weight: 110 })
          ]
        })
      })
    })
  }
})

// Boards 07.13 and 07.14 from the Pallets section: a spreadsheet of pallets fills the table, and the shipment's weight
// and volume become theirs.
export const ImportPallets = meta.story({
  args: {
    initial: { ...completeDraft, palletized: true },
    addresses: [savedAddress],
    renderSidebar: ({ weight, volume }) => (
      <output>
        {weight ?? "—"} kg, {volume ?? "—"} m³
      </output>
    )
  },
  play: async ({ canvas }) => {
    const pallets = within(canvas.getByRole("region", { name: "Pallets" }))
    await userEvent.click(pallets.getByRole("button", { name: "Import pallets" }))
    const upload = await shownDialog("Import pallets")
    const input = screen.getByRole("dialog").querySelector("input[type=file]")
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing file input")
    }
    const file = [
      "Pallet ID,Length (cm),Width (cm),Height (cm),Weight (kg),Stacking,Carton IDs",
      "1,120,100,120,110,Stackable,A1–A4",
      '2,120,100,120,110,Not stackable,"B1–B2, C1"'
    ].join("\n")
    await userEvent.upload(input, new File([file], "pallets.csv", { type: "text/csv" }))
    await waitFor(() => expect(upload.getByRole("button", { name: "Review import" })).toBeEnabled())
    await userEvent.click(upload.getByRole("button", { name: "Review import" }))
    const review = await shownDialog("Review pallet import")
    await expect(review.getByText("7 cartons")).toBeVisible()
    await userEvent.click(review.getByRole("button", { name: "Import pallets" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await expect(pallets.getByText("7 of 7 cartons on pallets")).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Pallet 2" })).toBeVisible()
    await expect(canvas.getByText("220 kg, 2.88 m³")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
  }
})

// The cartons and pallets in their import templates, to edit in a spreadsheet and import again with Replace.
export const ExportCartonsAndPallets = meta.story({
  args: {
    initial: {
      ...completeDraft,
      palletized: true,
      pallets: [
        {
          palletId: "1",
          length: 120,
          width: 100,
          height: 120,
          weight: 110,
          stackable: true,
          cartonIds: ["A1", "A2", "A3", "A4"]
        }
      ]
    },
    shipmentName: "Shipment 1",
    addresses: [savedAddress]
  },
  play: async ({ canvas }) => {
    const downloads: { name: string; file: Promise<ArrayBuffer> }[] = []
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ name: this.download, file: fetch(this.href).then((response) => response.arrayBuffer()) })
    })
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Export cartons" }))
      const pallets = within(canvas.getByRole("region", { name: "Pallets" }))
      await userEvent.click(pallets.getByRole("button", { name: "Export pallets" }))
      await waitFor(() =>
        expect(downloads.map((download) => download.name)).toEqual([
          `Cartons - ${order.reference} - Shipment 1.xlsx`,
          `Pallets - ${order.reference} - Shipment 1.xlsx`
        ])
      )
      const { default: ExcelJS } = await import("exceljs")
      const [cartonBook, palletBook] = await Promise.all(
        downloads.map(async (download) => {
          const book = new ExcelJS.Workbook()
          await book.xlsx.load(await download.file)
          return book
        })
      )
      // A kind of carton to a row, its count from its IDs, then the order's products to copy for more.
      const cartons = cartonBook!.getWorksheet("Cartons")!
      await expect(cartons.getRow(2).values).toEqual([
        undefined,
        "A1",
        4,
        tote!.supplierSku,
        60 / tote!.piecesPerSet,
        60,
        40,
        40,
        12,
        tote!.name,
        tote!.variant,
        tote!.piecesPerSet
      ])
      await expect(cartons.getCell("A4").value).toBe("C1")
      await expect(cartons.getCell("C5").value).toBe(tote!.supplierSku)
      await expect(palletBook!.getWorksheet("Pallets")!.getRow(2).values).toEqual([
        undefined,
        "1",
        120,
        100,
        120,
        110,
        "Stackable",
        "A1–A4"
      ])
      await expect(palletBook!.worksheets.map((sheet) => sheet.name)).toEqual(["Pallets", "Example", "Instructions"])
    } finally {
      click.mockRestore()
    }
  }
})

// Unchecking Packed on pallets hides the pallets and leaves them out of the draft.
export const NotPackedOnPallets = meta.story({
  args: {
    initial: {
      ...completeDraft,
      palletized: true,
      pallets: [
        { palletId: "1", length: 120, width: 100, height: 120, weight: 110, stackable: false, cartonIds: ["A1"] }
      ]
    },
    addresses: [savedAddress]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Pallet 1" })).toBeVisible()
    await userEvent.click(canvas.getByRole("checkbox", { name: "Packed on pallets" }))
    await expect(canvas.queryByRole("region", { name: "Pallets" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "Actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(actions).toHaveBeenLastCalledWith({
      action: "shipment.save",
      data: expect.objectContaining({
        draft: expect.not.objectContaining({ pallets: expect.anything() })
      })
    })
    await expect(actions).toHaveBeenLastCalledWith({
      action: "shipment.save",
      data: expect.objectContaining({ draft: expect.objectContaining({ palletized: false }) })
    })
  }
})
