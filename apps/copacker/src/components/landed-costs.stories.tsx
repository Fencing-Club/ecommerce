import { HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { actionHandler, landedCosts, orderId, shownDialog } from "@/stories/fixtures/purchase-orders"
import { LandedCosts } from "./landed-costs"

const actions = fn()
const freight = [{ reference: "FBA17XK2", amount: 31_000 }]

const meta = preview.meta({
  title: "Components/Sales and costs/Landed costs",
  component: LandedCosts,
  args: {
    orderId,
    currency: "USD",
    supplierTotal: 295_800,
    landedTotal: 91_550,
    markup: 0.3,
    freight,
    costs: landedCosts
  },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions))
  }
})

export const WithCosts = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon inbound freight")).toBeVisible()
    await expect(canvas.getByText("Shipment FBA17XK2")).toBeVisible()
    // A cost's kind shows in the reader's language, whether it was kept by name or by key.
    await expect(canvas.getByText("Freight")).toBeVisible()
    await expect(canvas.getByText("Bayline invoice 2291")).toBeVisible()
    await expect(canvas.getByText("Duty")).toBeVisible()
    await expect(canvas.getByText("$2,958")).toBeVisible()
    await expect(canvas.getByText("$915.50")).toBeVisible()
    await expect(canvas.getByText("$3,873.50")).toBeVisible()
    await expect(canvas.getByText("30% on product cost")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "About landed costs" }))
  }
})

export const AddCost = meta.story({
  args: { landedTotal: 0, markup: null, freight: [], costs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No costs yet")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await shownDialog("Add landed cost")
    await expect(dialog.getByText("Convert a bill in another currency to USD at the rate you paid.")).toBeVisible()
    // The amount is required.
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
    await expect(await dialog.findByText("Enter the amount")).toBeVisible()
    await expect(actions).not.toHaveBeenCalled()

    await userEvent.type(dialog.getByRole("textbox", { name: "Amount" }), "125")
    await userEvent.type(dialog.getByRole("textbox", { name: "Description" }), "Customs broker")
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(actions).toHaveBeenCalledWith({
      action: "landedCost.create",
      data: { kind: "freight", description: "Customs broker", amount: 12_500, orderId }
    })
  }
})

export const RemoveCost = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Duty cost" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({ action: "landedCost.delete", data: { id: landedCosts[1]!.id } })
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const RemoveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      actionHandler(actions, () => HttpResponse.json({ error: "This cost was already removed" }, { status: 409 }))
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Freight cost" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await expect(await canvas.findByText("This cost was already removed")).toBeVisible()
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
  }
})

// Only Amazon's freight so far, and no markup to show.
export const FreightOnly = meta.story({
  args: { landedTotal: 31_000, markup: null, costs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon inbound freight")).toBeVisible()
    await expect(canvas.queryByText("Markup")).toBeNull()
    await expect(canvas.queryByRole("button", { name: /More actions/ })).toBeNull()
  }
})

// A member who views purchase orders sees the costs but can't add or remove them.
export const ViewOnly = meta.story({
  parameters: { permissions: { role: "member", access: { orders: "view", prices: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline invoice 2291")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Add cost" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /More actions/ })).toBeNull()
  }
})
