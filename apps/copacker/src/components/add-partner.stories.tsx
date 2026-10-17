import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions } from "@/stories/fixtures/logistics"
import { AddPartner } from "./add-partner"
const sent: ActionRequest[] = []
const meta = preview.meta({
  component: AddPartner,
  args: { onCreated: fn() },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})
export const AddMenu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add partner" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Supplier" }))
    const supplierDialog = await screen.findByRole("dialog", { name: "Add a supplier" })
    await userEvent.click(within(supplierDialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Add partner" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Freight forwarder" }))
    const forwarderDialog = await screen.findByRole("dialog", { name: "Add a forwarder" })
    await userEvent.type(within(forwarderDialog).getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.click(within(forwarderDialog).getByRole("button", { name: "Add forwarder" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "forwarder.create", data: { name: "Bayline Freight", email: "" } }])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// The top bar's Create > Supplier lands here with ?add=supplier, which opens its sheet.
export const OpenedFromCreate = meta.story({
  parameters: { router: { navigation: { pathname: "/partners", query: { add: "supplier" } } } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Add a supplier" })
    await waitFor(() => expect(dialog).toBeVisible())
  }
})
