import type { OrderInput } from "@repo/copacker-orders"
import type { PackingDraft } from "@repo/copacker-shipments"
import { useRouter } from "@tanstack/react-router"
import { HttpResponse } from "msw/http"
import { type ComponentProps, useSyncExternalStore } from "react"
import { expect, fireEvent, fn, screen, spyOn, userEvent, waitFor, within } from "storybook/test"
import { storyTimeZone } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { addDays, zonedDay } from "@/lib/time-zone"
import { type ActionRequest, recordActions } from "@/stories/actions"
import { supplierId } from "@/stories/fixtures/orders"
import { northwindFactory } from "@/stories/fixtures/parties"
import { order, shipmentRecord } from "@/stories/fixtures/purchase-orders"
import { chooseMenuItem, chooseOption, shownDialog } from "@/stories/play"
import { member } from "@/stories/workspace"
import { PackingForm } from "./packing-form"
import { ShipmentTransportSettings } from "./shipment-transport"

const sent: ActionRequest[] = []
const shipment = shipmentRecord()
const [tote, apron, basket] = order.items
// The PO's other shipments hold all but these pieces of each line, which this shipment packs.
const leaving = (left: Record<string, number>) =>
  Object.fromEntries(order.items.map((item) => [item.id, item.pieces - (left[item.id] ?? 0)]))
const savedAddress = { id: "5d6e7f80-1a2b-4c3d-8e9f-000000000001", name: "Ningbo factory", address: northwindFactory }
// Today where the stories are set, which packing can finish on at the earliest.
const today = zonedDay(Date.now(), storyTimeZone)

// A packing list ready to check: two cartons of totes, ready in two weeks, from the factory.
const draft: PackingDraft = {
  readyDate: addDays(today, 14),
  origin: northwindFactory,
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
  return recordActions(sent, (body) => {
    if (body.action === "shipment.save") {
      return HttpResponse.json({ ok: true, revision: 2 })
    }
    return body.action === "shipment.check" ? HttpResponse.json({ ok: true, ...check }) : undefined
  })
}

// The shipment as the stories' server keeps it, and as the page last read it. Saving the draft or linking moves it to
// its next revision, and an action sent with an older revision fails, as on the server. Saving the transport keeps the
// revision.
type StoredShipment = { revision: number; linkedAmazonShipmentId: string | null }
let stored: StoredShipment = { revision: 1, linkedAmazonShipmentId: null }
let read = stored
function shipmentServer(linkedAmazonShipmentId: string | null) {
  stored = { revision: 1, linkedAmazonShipmentId }
  read = stored
  return recordActions(sent, (body) => {
    if (body.data.revision !== stored.revision) {
      return HttpResponse.json(
        {
          error:
            body.action === "shipment.transport"
              ? "Transport changed or is already released. Reload the shipment."
              : "The purchase order or packing draft has changed. Refresh before saving."
        },
        { status: 409 }
      )
    }
    if (body.action === "shipment.linkExisting") {
      const { amazonShipmentId } = body.data
      stored = { ...stored, linkedAmazonShipmentId: typeof amazonShipmentId === "string" ? amazonShipmentId : null }
    }
    if (body.action !== "shipment.save" && body.action !== "shipment.linkExisting") {
      return undefined
    }
    stored = { ...stored, revision: stored.revision + 1 }
    return HttpResponse.json({ ok: true, revision: stored.revision })
  })
}

// The shipment page around the form, as a buyer edits it: the transport settings follow the header, and both send the
// shipment's revision as the page last read it. Like the page's loader data, it reads the shipment again each time the
// router loads, and shows it in the same render as the router's own state.
function PackingPage(args: ComponentProps<typeof PackingForm>) {
  const router = useRouter()
  const shipment = useSyncExternalStore(
    (changed) =>
      router.subscribe("onLoad", () => {
        read = stored
        changed()
      }),
    () => read
  )
  return (
    <PackingForm
      {...args}
      revision={shipment.revision}
      linkedAmazonShipmentId={args.linkedAmazonShipmentId === undefined ? undefined : shipment.linkedAmazonShipmentId}
      renderHeader={(formActions) => (
        <>
          <div className="flex justify-end">{formActions}</div>
          <ShipmentTransportSettings
            id={args.shipmentId}
            revision={shipment.revision}
            initial={null}
            hasForwarder={false}
          />
        </>
      )}
    />
  )
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
    reserved: {},
    order,
    initial: null,
    addresses: []
  },
  beforeEach: ({ msw }) => {
    msw.use(packingActions({ canSubmit: true, requiresApproval: false, issues: [] }))
  }
})

// Linking saves the draft first, then links with the revision that save made. The link shows once the page has read it.
export const LinkExistingAwd = meta.story({
  args: { linkedAmazonShipmentId: null },
  beforeEach: ({ msw }) => {
    msw.use(shipmentServer(null))
  },
  render: (args) => <PackingPage {...args} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    const carton = canvas.getByRole("region", { name: "Carton A1" })
    await userEvent.type(canvas.getByRole("textbox", { name: "AWD shipment ID" }), "star-example")
    await userEvent.click(canvas.getByRole("button", { name: "Link shipment" }))
    await expect(await canvas.findByText(/Linked to STAR-EXAMPLE/)).toBeVisible()
    await expect(carton).toBeVisible()
    await expect(sent[0]).toEqual({
      action: "shipment.save",
      data: expect.objectContaining({
        revision: 1,
        draft: expect.objectContaining({
          cartons: [{ cartonId: "A1", items: [] }]
        })
      })
    })
    await expect(sent[1]).toEqual({
      action: "shipment.linkExisting",
      data: { id: shipment.id, revision: 2, amazonShipmentId: "STAR-EXAMPLE" }
    })
    await userEvent.click(canvas.getByRole("button", { name: "Remove link" }))
    await expect(await canvas.findByRole("textbox", { name: "AWD shipment ID" })).toBeVisible()
    await expect(carton).toBeVisible()
    await expect(sent[3]).toEqual({
      action: "shipment.linkExisting",
      data: { id: shipment.id, revision: 4, amazonShipmentId: null }
    })
  }
})

// Saving the draft moves the shipment to its next revision, and the page reads it again before the save is done, so
// the buyer's transport settings beside the form, and the next save, send the new one.
export const SaveDraftThenTransport = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(shipmentServer(null))
  },
  render: (args) => <PackingPage {...args} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add carton" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(sent.at(-1)).toEqual({
      action: "shipment.save",
      data: expect.objectContaining({ revision: 1 })
    })

    await userEvent.click(canvas.getByRole("button", { name: "Save transport" }))
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        action: "shipment.transport",
        data: expect.objectContaining({ id: shipment.id, revision: 2, expected: null })
      })
    )
    // The transport form reads the page again only once it has saved.
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledTimes(2))
    await expect(canvas.queryByText(/Transport changed/)).toBeNull()

    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledTimes(3))
    await expect(sent.at(-1)).toEqual({
      action: "shipment.save",
      data: expect.objectContaining({ revision: 2 })
    })
    await expect(canvas.queryByText(/packing draft has changed/)).toBeNull()
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
    await expect(sent).toContainEqual({
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
    await expect(sent).toEqual([])
  }
})

// A complete draft from the only saved address: the check finds what Amazon won't take, by carton.
export const CheckFindsIssues = meta.story({
  args: { initial: draft, addresses: [savedAddress], reserved: leaving({ [tote!.id]: 80 }) },
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
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent(northwindFactory.addressLine1)
    await expect(canvas.getAllByText(/88 Harbour Road/)[0]).toBeVisible()
    await expectPacked(canvas, 80)
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await expect(within(canvas.getByRole("table")).getByText("80 of 80")).toBeVisible()
    await expect(canvas.queryByRole("textbox", { name: "Supplier SKU" })).toBeNull()
    await expect(canvas.queryByRole("textbox", { name: /Price per unit/ })).toBeNull()

    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(await canvas.findByText(/Carton C2: Weighs more than 22.67 kg/)).toBeVisible()
    await expect(canvas.getByText(/Pack Linen apron too/)).toBeVisible()
    await expect(sent).toContainEqual({ action: "shipment.check", data: { id: shipment.id } })
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
    // It submits the revision the save just made, and the page reads the shipment again after each.
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        action: "shipment.submit",
        data: { id: shipment.id, revision: 2 }
      })
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledTimes(2))
  }
})

// Cartons are duplicated from one already measured, and the packed count turns red past what's left to ship.
export const Cartons = meta.story({
  args: {
    initial: { ...draft, cartons: draft.cartons!.map((carton, index) => ({ ...carton, weight: 12 + index })) },
    addresses: [savedAddress],
    reserved: leaving({ [tote!.id]: 100 })
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^Products \(3\)/ }))
    await chooseMenuItem(canvas.getByRole("button", { name: "Carton C2 actions" }), "Duplicate carton")
    await expectPacked(canvas, 120)
    await expect(within(canvas.getByRole("table")).getByText("120 of 100")).toHaveClass("text-destructive")
    // The copy takes the next letter.
    await expect(canvas.getByRole("region", { name: "Carton D1" })).toBeVisible()
    await chooseMenuItem(canvas.getByRole("button", { name: "Carton C1 actions" }), "Delete carton")
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
  items: order.items.map((item) => ({ ...item, receiver: "fba" }))
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
    await chooseMenuItem(canvas.getByRole("button", { name: "Carton C1 actions" }), "Duplicate carton")
    await expectPacked(canvas, 72)
    await chooseMenuItem(canvas.getByRole("button", { name: "Carton C1 actions" }), "Delete carton")
    await expectPacked(canvas, 36)
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${basket!.buyerSku} from carton B1` }))
    await expectPacked(canvas, 26)
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(sent.at(-1)).toEqual({
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

// Amazon has set the PO's packing groups (board 06.15): the carton holds two of them, so packing can't finish until
// each group has its own cartons.
const packingGroups = { [tote!.buyerSku]: "pg-totes", [apron!.buyerSku]: "pg-aprons", [basket!.buyerSku]: "pg-totes" }
const groupsError = `Products: FBA can’t take ${tote!.supplierSku} and ${apron!.supplierSku} in one carton. Amazon handles them differently, for example for dangerous goods, prep or labels, and may send them to different warehouses. Move one of them to another carton.`
export const FbaPackingGroups = meta.story({
  args: { order: fbaOrder, initial: mixedDraft, addresses: [savedAddress], packingGroups },
  play: async ({ canvas }) => {
    const carton = within(canvas.getByRole("region", { name: "Carton C1" }))
    await expect(carton.getByText(groupsError)).toBeVisible()
    await expect(canvas.queryByText("Products that can share a carton aren’t checked yet")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${apron!.buyerSku} from carton C1` }))
    await expect(carton.queryByText(groupsError)).toBeNull()
  }
})

// An FBA packing before Amazon has planned any of the PO's shipments: the cartons can't be checked against its packing
// groups yet, and the Cartons section says so.
export const FbaPackingGroupsUnchecked = meta.story({
  args: { order: fbaOrder, initial: mixedDraft, addresses: [savedAddress], packingGroups: null },
  play: async ({ canvas }) => {
    const cartons = within(canvas.getByRole("region", { name: "Cartons" }))
    const notice = cartons.getByRole("note")
    await expect(within(notice).getByText("Products that can share a carton aren’t checked yet")).toBeVisible()
    await expect(
      within(notice).getByText(/^Amazon says which products need separate cartons when it plans/)
    ).toBeVisible()
    await expect(canvas.queryByText(groupsError)).toBeNull()
    // It stays while there are no cartons, too.
    await userEvent.click(canvas.getByRole("button", { name: "Carton C1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete carton" }))
    await expect(canvas.getByText("No cartons yet")).toBeVisible()
    await expect(notice).toBeVisible()
  }
})

// On a phone the notice wraps within the Cartons section.
export const FbaPackingGroupsUncheckedMobile = meta.story({
  ...FbaPackingGroupsUnchecked.input,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const notice = within(canvas.getByRole("region", { name: "Cartons" })).getByRole("note")
    await expect(within(notice).getByText("Products that can share a carton aren’t checked yet")).toBeVisible()
    await expect(notice.scrollWidth).toBeLessThanOrEqual(notice.clientWidth)
  }
})

export const AwdCartons = meta.story({
  args: {
    order: { ...fbaOrder, items: fbaOrder.items.map((item) => ({ ...item, receiver: "awd_us" })) },
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
    await chooseOption(canvas.getByRole("combobox", { name: "Ship from" }), "Add new address")
    const dialog = await shownDialog("Add new address")
    await expect(dialog.getByRole("textbox", { name: "Street address" })).toHaveValue("")
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("combobox", { name: "Ship from" })).toHaveTextContent("88 Harbour Road")
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => HttpResponse.json({ error: "The purchase order changed" }, { status: 409 })))
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
    await chooseOption(canvas.getByRole("combobox", { name: "Ship from" }), "Add new address")
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
    await expect(sent).toEqual([])
    await userEvent.clear(weight)
    await userEvent.tab()
    await expect(weight).toHaveAttribute("aria-invalid", "true")
    await userEvent.type(weight, "12")
    await expect(weight).not.toHaveAttribute("aria-invalid", "true")
  }
})

// A draft saved with a ready date that has since passed. It still saves, but packing finishes only with today or later.
export const PassedReadyDate = meta.story({
  args: { initial: { ...completeDraft, readyDate: "2026-10-05" }, addresses: [savedAddress] },
  play: async ({ canvas }) => {
    const readyDate = canvas.getByLabelText(/Ready date/)
    await expect(readyDate).toHaveAttribute("min", today)
    await expect(readyDate).not.toHaveAttribute("aria-invalid", "true")
    // Every unit is packed, so Finish packing leads and saving the draft is under Actions.
    await userEvent.click(canvas.getByRole("button", { name: "Actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(sent.at(-1)).toEqual({
      action: "shipment.save",
      data: expect.objectContaining({ draft: expect.objectContaining({ readyDate: "2026-10-05" }) })
    })
    const saved = sent.length

    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(await canvas.findByText("Choose today or a later date")).toBeVisible()
    await expect(readyDate).toHaveAttribute("aria-invalid", "true")
    // The field's own error is the only one, and the field takes focus.
    await expect(readyDate).toHaveFocus()
    await expect(canvas.queryByText("Fix the highlighted fields")).toBeNull()
    await expect(sent).toHaveLength(saved)
    // The field checks each date as it's chosen.
    fireEvent.change(readyDate, { target: { value: today } })
    await waitFor(() => expect(readyDate).not.toHaveAttribute("aria-invalid", "true"))
    await expect(canvas.queryByText("Choose today or a later date")).toBeNull()
    fireEvent.change(readyDate, { target: { value: addDays(today, -1) } })
    await expect(await canvas.findByText("Choose today or a later date")).toBeVisible()
    fireEvent.change(readyDate, { target: { value: today } })
    await waitFor(() => expect(readyDate).not.toHaveAttribute("aria-invalid", "true"))

    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({ action: "shipment.submit", data: { id: shipment.id, revision: 2 } })
    )
    await expect(sent).toContainEqual({
      action: "shipment.save",
      data: expect.objectContaining({ draft: expect.objectContaining({ readyDate: today }) })
    })
  }
})

const awdOrder: OrderInput = {
  ...fbaOrder,
  items: fbaOrder.items.map((item) => ({
    ...item,
    receiver: "awd_us",
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
      recordActions(sent, (body) =>
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
    await expect(sent).not.toContainEqual(expect.objectContaining({ action: "shipment.submit" }))
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

// A title beside the form's actions, as the shipment page has.
function TitledHeader({ title, actions }: { title: string; actions: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {actions}
    </div>
  )
}
export const GermanPackingErrors = meta.story({
  args: {
    order: awdOrder,
    initial: awdErrors,
    addresses: [savedAddress],
    renderHeader: (actions) => <TitledHeader title="Sendung 1" actions={actions} />
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
    renderHeader: (actions) => <TitledHeader title="Shipment 1" actions={actions} />
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
    await expect(sent).not.toContainEqual(expect.objectContaining({ action: "shipment.submit" }))
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
    await expect(sent.at(-1)).toEqual({
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
      // One at a time, so the files come in a known order.
      await userEvent.click(canvas.getByRole("button", { name: "Export cartons" }))
      await waitFor(() => expect(downloads).toHaveLength(1))
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
    await expect(sent.at(-1)).toEqual({
      action: "shipment.save",
      data: expect.objectContaining({
        draft: expect.not.objectContaining({ pallets: expect.anything() })
      })
    })
    await expect(sent.at(-1)).toEqual({
      action: "shipment.save",
      data: expect.objectContaining({ draft: expect.objectContaining({ palletized: false }) })
    })
  }
})
