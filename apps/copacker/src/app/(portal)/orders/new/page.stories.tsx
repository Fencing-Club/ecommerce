import type { OrderItem } from "@repo/copacker-orders"
import { expect, userEvent, waitFor } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import type { suppliers } from "@/db/schema"
import type { ForwarderAddress } from "@/server/forwarders"
import { type ActionRequest, recordActions, redirectTo } from "@/stories/actions"
import { deliveryId, supplierId } from "@/stories/fixtures/orders"
import {
  catalogMatches,
  deliveries,
  forwarding,
  order,
  orderId,
  productHandlers,
  supplierRecord
} from "@/stories/fixtures/purchase-orders"
import { chooseOption } from "@/stories/play"
import { pageStory } from "@/stories/server"
import PageView from "./page"

type Args = {
  // The URL's search parameters, which Restock and Reorder links set.
  params: { destination?: string; supplierId?: string; locationId?: string }
  // What the page reads: the buyer's suppliers, the lines made from ?variant=…, the variations that still need a label,
  // the forwarders' addresses and the delivery addresses.
  suppliers: Array<typeof suppliers.$inferSelect>
  initialItems: OrderItem[]
  needsBarcode: string[]
  forwarding: ForwarderAddress[]
  deliveries: typeof deliveries
}

// The new purchase order page (page.tsx) with what its queries would return.
async function NewOrder({
  params,
  suppliers: rows,
  initialItems,
  needsBarcode,
  forwarding: stops,
  deliveries: addresses
}: Args) {
  const t = await translateStory("orders")
  const initialDestination = params.destination === "warehouse" ? "warehouse" : "amazon"
  const linked = addresses.filter((delivery) => delivery.shopifyLocationId === params.locationId)
  return (
    <PageView
      page={{
        title: t("builder.newTitle"),
        parents: [{ label: t("index.title"), href: "/orders" }],
        suppliers: rows.map((r) => ({ id: r.id, name: r.name })),
        deliveries: addresses,
        forwarderAddresses: stops.map((row) => ({
          addressId: row.addressId,
          forwarderId: row.forwarderId,
          label: `${row.forwarderName}, ${row.addressName}`,
          hasPhone: Boolean(row.address.phoneNumber)
        })),
        initialItems: initialItems,
        needsBarcodeVariantIds: needsBarcode,
        initialDestination: initialDestination,
        initialSupplierId: rows.find((row) => row.id === params.supplierId)?.id,
        initialDeliveryId: initialDestination === "warehouse" && linked.length === 1 ? linked[0]!.id : undefined
      }}
    />
  )
}

const sent: ActionRequest[] = []
const [tote, apron] = order.items

const meta = preview.meta({
  title: "Pages/Purchase orders/New",
  ...pageStory("/orders/new", NewOrder),
  args: {
    params: {},
    suppliers: [
      supplierRecord(),
      supplierRecord({ id: "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e04", name: "Northwind Textiles" })
    ],
    initialItems: [],
    needsBarcode: [],
    forwarding,
    deliveries
  },
  beforeEach: ({ msw }) => {
    msw.use(...productHandlers(), catalogMatches(), recordActions(sent, redirectTo(`/orders/${orderId}`)))
  }
})

export const Blank = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "New purchase order" })).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Choose supplier")
    await expect(canvas.getByRole("combobox", { name: "Destination" })).toHaveTextContent("Amazon")
    await expect(canvas.getByText("No products")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
  }
})

// Reordering from Restock: its lines, for the supplier it grouped them under, to the one address at its location.
export const FromRestock = meta.story({
  args: {
    params: { destination: "warehouse", supplierId, locationId: "gid://shopify/Location/1" },
    initialItems: [tote!, apron!],
    needsBarcode: [apron!.variantId]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Lotus Manufacturing")
    await expect(canvas.getByRole("combobox", { name: "Destination" })).toHaveTextContent("Your location")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Oakland warehouse")
    await expect(canvas.getByText("2 variants (360 units)")).toBeVisible()
    await expect(canvas.getByText("Needs an uploaded label")).toBeVisible()

    await userEvent.type(canvas.getByRole("textbox", { name: "Reference number" }), "PO-1047")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}` }))
    await expect(sent).toContainEqual({
      action: "order.create",
      data: expect.objectContaining({
        reference: "PO-1047",
        supplierId,
        deliveryId,
        items: expect.arrayContaining([expect.objectContaining({ receiver: "warehouse" })])
      })
    })
  }
})

// A supplier that isn't the buyer's is ignored, and a location with no address leaves the address to choose.
export const UnknownLinks = meta.story({
  args: {
    params: {
      destination: "warehouse",
      supplierId: "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9eff",
      locationId: "gid://shopify/Location/9"
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Choose supplier")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Choose address")
    await chooseOption(canvas.getByRole("combobox", { name: "Delivery address" }), "Portland studio")
    await expect(canvas.getByRole("combobox", { name: "Delivery address" })).toHaveTextContent("Portland studio")
  }
})
