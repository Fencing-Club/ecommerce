import { HttpResponse } from "msw/http"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { shownDialog, chooseOption } from "@/stories/play"
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
  title: "Components/Sales and costs/Monthly costs",
  component: MonthlyCosts,
  args: { costs, currency: "USD", admin: true },
  beforeEach: ({ msw }) => {
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
    const dialog = await shownDialog("Add monthly cost")
    await userEvent.type(dialog.getByRole("textbox", { name: "Name" }), "Helium 10")
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount a month" }), "99")
    await chooseOption(dialog.getByRole("combobox", { name: "Channel" }), "Amazon")
    await userEvent.type(dialog.getByLabelText("Paid since"), "2026-01-05")
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
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
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const AddForEbay = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await shownDialog()
    await userEvent.type(dialog.getByRole("textbox", { name: "Name" }), "eBay Store subscription")
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount a month" }), "27.95")
    await userEvent.click(dialog.getByRole("combobox", { name: "Channel" }))
    const listbox = await screen.findByRole("listbox")
    await expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["All channels", "Amazon", "Shopify", "eBay"])
    await userEvent.click(within(listbox).getByRole("option", { name: "eBay" }))
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
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
    const dialog = await shownDialog()
    await expect(dialog.getByRole("combobox", { name: "Channel" })).toHaveTextContent("All channels")
    await expect(dialog.element).toHaveTextContent("EUR")
    await userEvent.type(dialog.getByRole("textbox", { name: "Name" }), "Bookkeeping")
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount a month" }), "250,50")
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
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
    const dialog = await shownDialog()
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
    await expect(await dialog.findByText("Enter a name")).toBeInTheDocument()
    await expect(dialog.getByText("Enter the amount")).toBeInTheDocument()
    await userEvent.type(dialog.getByRole("textbox", { name: "Name" }), "Rent")
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount a month" }), "0")
    await userEvent.type(dialog.getByLabelText("Paid since"), "2026-06-01")
    await userEvent.type(dialog.getByLabelText("Paid until"), "2026-01-31")
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
    await expect(await dialog.findByText("The end date can’t be before the start date")).toBeInTheDocument()
    await expect(dialog.getByText("Enter the amount")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

export const AddFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Monthly costs are in the Overview's currency, USD.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add cost" }))
    const dialog = await shownDialog()
    await userEvent.type(dialog.getByRole("textbox", { name: "Name" }), "Rent")
    await userEvent.type(dialog.getByRole("textbox", { name: "Amount a month" }), "1800")
    await userEvent.click(dialog.getByRole("button", { name: "Add cost" }))
    await expect(await dialog.findByText("Monthly costs are in the Overview's currency, USD.")).toBeInTheDocument()
  }
})

export const Remove = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Warehouse rent" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "monthlyCost.delete", data: { id: "c05t0000-0000-4000-8000-000000000002" } }])
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
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
