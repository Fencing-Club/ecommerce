import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { OrderBuilder } from "@/components/order-builder"
import type { orders, suppliers } from "@/db/schema"
import type { ForwarderAddress } from "@/server/forwarders"
import {
  actionHandler,
  catalogMatches,
  deliveries,
  forwarding,
  orderId,
  orderRecord,
  productHandlers,
  supplierRecord
} from "@/stories/fixtures/purchase-orders"
import { pageStory } from "@/stories/server"

type Args = {
  // The draft, and what the page reads for the editor: the buyer's suppliers, delivery addresses, the variations that
  // still need a label, and the forwarders' addresses.
  order: typeof orders.$inferSelect
  suppliers: Array<typeof suppliers.$inferSelect>
  deliveries: typeof deliveries
  needsBarcode: string[]
  forwarding: ForwarderAddress[]
}

// The draft's edit page (page.tsx) with what its queries would return. A purchase order that isn't a draft redirects
// to its page instead.
async function EditOrder({ order, suppliers: rows, deliveries: addresses, needsBarcode, forwarding: stops }: Args) {
  const t = await translateStory("orders")
  const id = order.id
  return (
    <OrderBuilder
      title={t("builder.edit")}
      parents={[
        { label: t("index.title"), href: "/orders" },
        { label: order.data.reference, href: `/orders/${id}` }
      ]}
      suppliers={rows.map((row) => ({ id: row.id, name: row.name }))}
      deliveries={addresses}
      forwarderAddresses={stops.map((row) => ({
        addressId: row.addressId,
        forwarderId: row.forwarderId,
        label: `${row.forwarderName}, ${row.addressName}`,
        hasPhone: Boolean(row.address.phoneNumber)
      }))}
      needsBarcodeVariantIds={needsBarcode}
      draft={{ id, revision: order.revision, data: order.data }}
    />
  )
}

const actions = fn()
const draft = orderRecord({ status: "draft", revision: 3 })

const meta = preview.meta({
  title: "Pages/Buyer/Purchase orders/Edit",
  ...pageStory(`/orders/${orderId}/edit`, EditOrder),
  args: {
    order: draft,
    suppliers: [
      supplierRecord(),
      supplierRecord({ id: "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e04", name: "Northwind Textiles" })
    ],
    deliveries,
    needsBarcode: [],
    forwarding
  },
  beforeEach: ({ msw }) => {
    msw.use(...productHandlers(), catalogMatches(), actionHandler(actions))
  }
})

// Changing a line and saving publishes the draft's next revision, then goes back to it.
export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Edit" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "PO-1042" })).toHaveAttribute("href", `/orders/${orderId}`)
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Lotus Manufacturing")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Oakland warehouse")
    const save = canvas.getByRole("button", { name: "Save" })
    await expect(save).toBeDisabled()

    const quantity = canvas.getByRole("spinbutton", { name: "Quantity of Linen apron" })
    await userEvent.type(quantity, "0", { initialSelectionStart: 3, initialSelectionEnd: 3 })
    await expect(quantity).toHaveValue(1200)
    await userEvent.click(save)
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
    await expect(actions).toHaveBeenCalledWith({
      action: "order.update",
      data: {
        id: orderId,
        revision: 3,
        order: expect.objectContaining({
          items: expect.arrayContaining([expect.objectContaining({ name: "Linen apron", pieces: 1200 })])
        })
      }
    })
  }
})

// The forwarders' addresses are offered as stops, named with their forwarder.
export const Stops = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add stop" }))
    await userEvent.click(canvas.getByRole("combobox", { name: "Stop on the way" }))
    const options = await screen.findAllByRole("option")
    await expect(options.map((option) => option.textContent)).toEqual([
      "Bayline Freight, Ningbo warehouse",
      "Bayline Freight, Shenzhen yard"
    ])
  }
})
