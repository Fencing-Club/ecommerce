import { HttpResponse } from "msw/http"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { actionHandler, order, orderId } from "@/stories/fixtures/purchase-orders"
import { member } from "@/stories/workspace"
import { LineMenu, OrderMenu } from "./order-actions"

const actions = fn()
const [tote, apron] = order.items

const meta = preview.meta({
  title: "Components/Purchase orders/Order actions",
  component: OrderMenu,
  args: { id: orderId, reference: "PO-1042", draft: true, closable: false, labels: true },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions))
  }
})

export const Draft = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    const items = await screen.findAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Download purchase order",
      "Download labels",
      "Delete draft"
    ])
    await expect(screen.getByRole("menuitem", { name: "Download purchase order" })).toHaveAttribute(
      "href",
      `/api/orders/${orderId}/po`
    )
    await expect(screen.getByRole("menuitem", { name: "Download labels" })).toHaveAttribute(
      "href",
      `/api/orders/${orderId}/labels`
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}/edit` })
  }
})

export const DeleteDraft = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions, () => HttpResponse.json({ redirect: "/orders" })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete draft" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Delete PO-1042?" })
    await expect(dialog).toHaveTextContent("Your supplier hasn’t seen it.")
    await userEvent.click(screen.getByRole("button", { name: "Delete draft" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/orders" }))
    await expect(actions).toHaveBeenCalledWith({ action: "order.delete", data: { id: orderId } })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    // The list loads fresh on the way there, so it isn't refreshed again.
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

// A sent purchase order the buyer can close, without labels to download.
export const Close = meta.story({
  args: { draft: false, closable: true, labels: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    const items = await screen.findAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual(["Download purchase order", "Close purchase order"])
    await userEvent.click(screen.getByRole("menuitem", { name: "Close purchase order" }))
    await screen.findByRole("alertdialog", { name: "Close PO-1042?" })
    await userEvent.click(screen.getByRole("button", { name: "Close purchase order" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await expect(actions).toHaveBeenCalledWith({ action: "order.close", data: { id: orderId } })
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const CloseFails = meta.story({
  args: { draft: false, closable: true, labels: false },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions, () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Close purchase order" }))
    await userEvent.click(await screen.findByRole("button", { name: "Close purchase order" }))
    await waitFor(() => expect(screen.getByText("Couldn’t close PO-1042")).toBeVisible())
    // The dialog stays open to try again.
    await expect(screen.getByRole("alertdialog")).toBeVisible()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

// A member who doesn't see prices can't download the priced purchase order.
export const MemberWithoutPrices = meta.story({
  args: { draft: false, closable: false, labels: true },
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    const items = await screen.findAllByRole("menuitem")
    await expect(items.map((item) => item.textContent)).toEqual(["Download labels"])
  }
})

// Each line's menu: its label and hazard label once they can be made, Edit on a draft, and why a label can't be made.
export const LineMenus = meta.story({
  render: () => (
    <ul className="flex flex-col gap-2">
      <li className="flex items-center gap-2">
        Canvas tote bag
        <LineMenu
          orderId={orderId}
          itemId={tote!.id}
          name="Canvas tote bag / Natural"
          label={{ state: "uploaded" }}
          warning
          editable
        />
      </li>
      <li className="flex items-center gap-2">
        Linen apron
        <LineMenu
          orderId={orderId}
          itemId={apron!.id}
          name="Linen apron / Charcoal"
          label={{ state: "missing", problem: "Add the product’s FNSKU in Amazon" }}
          warning={false}
          editable={false}
        />
      </li>
    </ul>
  ),
  play: async ({ canvas }) => {
    // A line with nothing to download or edit has no menu.
    await expect(canvas.queryByRole("button", { name: "More for Linen apron / Charcoal" })).toBeNull()
    await userEvent.hover(
      canvas.getByLabelText("No label for Linen apron / Charcoal: Add the product’s FNSKU in Amazon")
    )
    await waitFor(() => expect(screen.getByText("Add the product’s FNSKU in Amazon")).toBeVisible())

    await userEvent.click(canvas.getByRole("button", { name: "More for Canvas tote bag / Natural" }))
    await expect(await screen.findByRole("menuitem", { name: "Download label" })).toHaveAttribute(
      "href",
      `/api/orders/${orderId}/labels/${tote!.id}`
    )
    await expect(screen.getByRole("menuitem", { name: "Download hazard label" })).toHaveAttribute(
      "href",
      `/api/orders/${orderId}/labels/warning`
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/${orderId}/edit` })
  }
})
