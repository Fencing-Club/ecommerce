import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, serverError } from "@/stories/fixtures/logistics"
import { MonthlyCosts } from "./monthly-costs"

const sent: ActionRequest[] = []

const costs = [
  {
    id: "c05t0000-0000-4000-8000-000000000001",
    name: "Marketplace Connect",
    amount: "$49.00",
    details: "All channels"
  },
  {
    id: "c05t0000-0000-4000-8000-000000000002",
    name: "Warehouse rent",
    amount: "$1,800.00",
    details: "Amazon, since Jan 5, 2026"
  }
]

const meta = preview.meta({
  component: MonthlyCosts,
  args: { costs, currency: "USD", admin: true },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const Costs = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 costs")).toBeVisible()
    await expect(canvas.getByText("$1,800.00")).toBeVisible()
    await expect(canvas.getByText("Amazon, since Jan 5, 2026")).toBeVisible()
  }
})

export const Empty = meta.story({
  args: { costs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No monthly costs")).toBeVisible()
    await expect(canvas.queryByRole("list")).toBeNull()
  }
})

export const Add = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await screen.findByRole("dialog", { name: "Add monthly cost" })
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Helium 10")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Amount a month" }), "99")
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Channel" }))
    await userEvent.click(await screen.findByRole("option", { name: "Amazon" }))
    await userEvent.type(within(dialog).getByLabelText("Paid since"), "2026-01-05")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add cost" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "monthlyCost.create",
          data: {
            name: "Helium 10",
            amount: 9900,
            currency: "USD",
            channel: "amazon",
            startsOn: "2026-01-05",
            endsOn: null
          }
        }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

export const AddForEbay = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "eBay Store subscription")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Amount a month" }), "27.95")
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Channel" }))
    const listbox = await screen.findByRole("listbox")
    await expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["All channels", "Amazon", "Shopify", "eBay"])
    await userEvent.click(within(listbox).getByRole("option", { name: "eBay" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Add cost" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "monthlyCost.create",
          data: {
            name: "eBay Store subscription",
            amount: 2795,
            currency: "USD",
            channel: "ebay",
            startsOn: null,
            endsOn: null
          }
        }
      ])
    )
  }
})

// Left empty, the channel is every channel and the dates cover all the sales history.
export const AddForEveryChannel = meta.story({
  args: { currency: "EUR" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await screen.findByRole("dialog")
    await expect(within(dialog).getByRole("combobox", { name: "Channel" })).toHaveTextContent("All channels")
    await expect(dialog).toHaveTextContent("EUR")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Bookkeeping")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Amount a month" }), "250,50")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add cost" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "monthlyCost.create",
          data: { name: "Bookkeeping", amount: 25050, currency: "EUR", channel: null, startsOn: null, endsOn: null }
        }
      ])
    )
  }
})

export const AddValidation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add cost" }))
    await expect(await within(dialog).findByText("Enter a name")).toBeInTheDocument()
    await expect(within(dialog).getByText("Enter the amount")).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Rent")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Amount a month" }), "0")
    await userEvent.type(within(dialog).getByLabelText("Paid since"), "2026-06-01")
    await userEvent.type(within(dialog).getByLabelText("Paid until"), "2026-01-31")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add cost" }))
    await expect(await within(dialog).findByText("The end date can’t be before the start date")).toBeInTheDocument()
    await expect(within(dialog).getByText("Enter the amount")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Monthly costs are in the Overview's currency, USD.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Rent")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Amount a month" }), "1800")
    await userEvent.click(within(dialog).getByRole("button", { name: "Add cost" }))
    await expect(
      await within(dialog).findByText("Monthly costs are in the Overview's currency, USD.")
    ).toBeInTheDocument()
  }
})

export const Remove = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Warehouse rent" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "monthlyCost.delete", data: { id: "c05t0000-0000-4000-8000-000000000002" } }])
    )
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

export const RemoveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Warehouse rent" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn’t remove this cost")
    await expect(canvas.getByRole("button", { name: "More for Warehouse rent" })).toBeEnabled()
  }
})

// Only owners and admins add and remove costs.
export const Member = meta.story({
  args: { admin: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Marketplace Connect")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Add cost" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /^More for/ })).toBeNull()
  }
})
