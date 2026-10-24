import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { routeChoices, throughForwarder } from "@/stories/fixtures/routes"
import { chooseOption, width } from "@/stories/play"
import { RouteSection } from "./route-section"

const meta = preview.meta({
  title: "Unused/Shipments/Route section",
  component: RouteSection,
  decorators: [width("max-w-3xl")],
  args: { route: throughForwarder, buyer: "Harbor Goods", readyDate: "2026-10-27", choices: routeChoices },
  argTypes: { route: { control: false }, choices: { control: false } }
})

// Closed, as the shipment page starts it: the route's stops on one line. Opening it shows the timeline instead.
export const Collapsed = meta.story({
  play: async ({ canvas }) => {
    const preview = canvas.getByRole("list", { name: "Route" })
    await expect([...preview.querySelectorAll("li")].map((stop) => stop.textContent)).toEqual([
      "Northwind Textiles / Main factory",
      "Bayline Freight",
      "Amazon AWD US"
    ])
    await expect(canvas.queryByText("Ship from")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await waitFor(() => expect(canvas.getByText("Ship from")).toBeVisible())
    await expect(canvas.getByText("Ready Oct 27")).toBeVisible()
    await expect(canvas.queryByText("Bayline Freight / Shenzhen")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Edit route" })).toBeNull()
  }
})

// Whoever may change the route gets Edit route. Save route sends the changed route and ends editing.
export const EditAndSave = meta.story({
  args: { defaultOpen: true, onSave: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit route" }))
    await chooseOption(
      canvas.getByRole("combobox", { name: "Shipping, Northwind Textiles to Bayline Freight" }),
      /^Bayline Freight picks up/
    )
    await userEvent.click(canvas.getByRole("button", { name: "Save route" }))
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ legs: ["receiverMoves", "senderArranges"] })
    )
    await expect(canvas.queryByRole("combobox")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Edit route" })).toBeVisible()
  }
})

// Cancel drops the changes.
export const Cancel = meta.story({
  args: { defaultOpen: true, onSave: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit route" }))
    await chooseOption(canvas.getByRole("combobox", { name: "Final destination" }), /^Amazon FBA US/)
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }))
    await expect(canvas.getByText("Amazon AWD US")).toBeVisible()
    await expect(canvas.queryByText("Amazon FBA US")).toBeNull()
    await expect(args.onSave).not.toHaveBeenCalled()
  }
})

// A route has to end at a final destination to save.
export const NeedsDestination = meta.story({
  args: { defaultOpen: true, onSave: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit route" }))
    await userEvent.click(canvas.getByRole("button", { name: "Remove Amazon AWD US" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save route" }))
    await expect(canvas.getByText("Add the final destination to save the route.")).toBeVisible()
    await expect(args.onSave).not.toHaveBeenCalled()
  }
})
