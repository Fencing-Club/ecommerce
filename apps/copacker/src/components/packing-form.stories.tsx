import type { OrderInput, PackingDraft } from "@repo/aisle"
import { HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { supplierId } from "@/stories/fixtures/orders"
import {
  actionHandler,
  order,
  orderId,
  pickupAddress,
  shipmentRecord,
  shownDialog
} from "@/stories/fixtures/purchase-orders"
import { member } from "@/stories/workspace"
import { PackingForm } from "./packing-form"

const actions = fn()
const shipment = shipmentRecord()
const [tote, apron, basket] = order.items
const invoice = { id: "8e1b2c3d-4e5f-4a6b-8c7d-000000000001", name: "Lotus invoice 118.pdf", bytes: 182_000 }
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
  component: PackingForm,
  args: {
    orderId,
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

// A new packing list: no cartons yet, so it can be saved but not submitted.
export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your invoice for these cartons")).toBeVisible()
    await expect(canvas.getByText("Changes go to the buyer for approval")).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: /Price per unit/ })).toBeVisible()
    await expect(canvas.getByText("No cartons yet")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Submit packing list" })).toBeDisabled()
    await expect(canvas.getByText("0 cartons, 0 units")).toBeVisible()
    // Without a saved address, the pickup address is typed in.
    await expect(canvas.queryByRole("combobox", { name: "Pickup address" })).toBeNull()

    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    await expect(canvas.getByText("1 carton, 0 units")).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: "Carton number" }), "C1")
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await canvas.findByText("Draft saved")).toBeVisible()
    await expect(actions).toHaveBeenCalledWith({
      action: "shipment.save",
      data: {
        id: shipment.id,
        revision: 1,
        orderRevision: 1,
        draft: expect.objectContaining({
          readyDate: "",
          cartons: [{ cartonId: "C1", items: [{ itemId: tote!.id }] }]
        })
      }
    })
  }
})

// Checking or submitting first checks the fields here.
export const FixFields = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    await userEvent.click(canvas.getByRole("button", { name: "Check packing" }))
    await expect(await canvas.findByText("Fix the highlighted fields")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Carton number" })).toHaveAttribute("aria-invalid", "true")
    await expect(actions).not.toHaveBeenCalled()
  }
})

// A complete draft from the only saved address: the check finds what Amazon won't take, by carton.
export const CheckFindsIssues = meta.story({
  args: { initial: draft, invoice, addresses: [savedAddress] },
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
    await expect(canvas.getByText("Lotus invoice 118.pdf")).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Pickup address" })).toHaveTextContent("Ningbo factory")
    await expect(canvas.getByText(/88 Harbour Road/)).toBeVisible()
    await expect(canvas.getByText("2 cartons, 80 units")).toBeVisible()
    await expect(canvas.getByText("80 of 240")).toBeVisible()
    await expect(canvas.getAllByRole("textbox", { name: "Supplier SKU" })[0]).toHaveValue("LM-TOTE-NAT")
    await expect(canvas.getAllByRole("textbox", { name: /Price per unit/ })[0]).toHaveValue("4.10")

    await userEvent.click(canvas.getByRole("button", { name: "Check packing" }))
    await expect(await canvas.findByText(/Carton C2: Weighs more than 22.68 kg/)).toBeVisible()
    await expect(canvas.getByText(/Pack Linen apron too/)).toBeVisible()
    await expect(actions).toHaveBeenCalledWith({ action: "shipment.check", data: { id: shipment.id } })
  }
})

export const Submit = meta.story({
  args: { initial: draft, invoice, addresses: [savedAddress] },
  beforeEach: ({ msw }) => {
    msw.use(packingActions({ canSubmit: true, requiresApproval: true, issues: [] }))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Check packing" }))
    await expect(await canvas.findByText("Ready to submit; changes go to the buyer for approval")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Submit packing list" }))
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
  args: { initial: draft, invoice, addresses: [savedAddress], availablePieces: { [tote!.id]: 100 } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Duplicate carton C2" }))
    await expect(canvas.getByText("3 cartons, 120 units")).toBeVisible()
    await expect(canvas.getByText("120 of 100")).toHaveClass("text-destructive")
    await expect(canvas.getAllByRole("textbox", { name: "Carton number" })[2]).toHaveValue("")
    await userEvent.click(canvas.getByRole("button", { name: "Remove carton C1" }))
    await expect(canvas.getByText("2 cartons, 80 units")).toBeVisible()
    await expect(canvas.getByText("80 of 100")).not.toHaveClass("text-destructive")
    // With several products, each carton says which it holds.
    await expect(canvas.getAllByRole("combobox", { name: "Product" })).toHaveLength(2)
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
  args: { order: fbaOrder, initial: mixedDraft, invoice, addresses: [savedAddress] },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("combobox", { name: "Product" })).toHaveLength(2)
    await expect(canvas.getByText("1 carton, 26 units")).toBeVisible()
    await expect(canvas.getByText("12 of 120")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add product to carton" }))
    const quantities = canvas.getAllByRole("spinbutton", { name: "Units" })
    await userEvent.type(quantities[2]!, "10")
    await expect(canvas.getByText("1 carton, 36 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Duplicate carton C1" }))
    await expect(canvas.getByText("2 cartons, 72 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Remove carton C1" }))
    await expect(canvas.getByText("1 carton, 36 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Remove product 3 from carton" }))
    await expect(canvas.getByText("1 carton, 26 units")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await canvas.findByText("Draft saved")).toBeVisible()
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
    invoice,
    addresses: [savedAddress]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("combobox", { name: "Product" })).toHaveLength(2)
    await expect(canvas.queryByRole("button", { name: "Add product to carton" })).toBeNull()
    await expect(canvas.getByText("2 cartons, 80 units")).toBeVisible()
  }
})

// A pickup address typed in stays while a saved one is chosen, and comes back with Other address.
export const PickupAddress = meta.story({
  args: { addresses: [savedAddress] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/88 Harbour Road/)).toBeVisible()
    await userEvent.click(canvas.getByRole("combobox", { name: "Pickup address" }))
    await userEvent.click(await screen.findByRole("option", { name: "Other address" }))
    await waitFor(() => expect(canvas.queryByText(/88 Harbour Road/)).toBeNull())
    const street = canvas.getByRole("textbox", { name: "Street address" })
    await expect(street).toHaveValue("")
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
    initial: draft,
    invoice,
    enteringFor: "Lotus Manufacturing",
    addAddressTo: { id: supplierId, name: "Lotus Manufacturing" }
  },
  beforeEach: ({ msw }) => {
    msw.use(packingActions({ canSubmit: true, requiresApproval: true, issues: [] }))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing’s invoice for these cartons")).toBeVisible()
    await expect(canvas.getByText("Changes update the purchase order")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Check packing" }))
    await expect(await canvas.findByText("Ready to submit; changes update the purchase order")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add address" }))
    const dialog = await shownDialog("Add a pickup address for Lotus Manufacturing")
    await expect(dialog.getAllByRole("textbox").length).toBeGreaterThan(3)
  }
})

// Someone who doesn't see prices packs without them.
export const WithoutPrices = meta.story({
  parameters: { permissions: { ...member, access: { ...member.access, shipments: "edit" } } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: /Price per unit/ })).toBeNull()
    await expect(within(canvas.getByRole("table")).getAllByRole("textbox", { name: "Supplier SKU" })).toHaveLength(3)
  }
})
