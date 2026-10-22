import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions } from "@/stories/actions"
import { shownDialog } from "@/stories/play"
import { AddPartner } from "./add-partner"
const sent: ActionRequest[] = []
const meta = preview.meta({
  title: "Components/Partners/Add partner",
  component: AddPartner,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  }
})
export const AddMenu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add partner" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Supplier" }))
    const supplierDialog = await shownDialog("Add a supplier")
    await userEvent.click(supplierDialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Add partner" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Freight forwarder" }))
    const forwarderDialog = await shownDialog("Add a forwarder")
    await userEvent.type(forwarderDialog.getByRole("textbox", { name: "Company" }), "Bayline Freight")
    await userEvent.click(forwarderDialog.getByRole("button", { name: "Add forwarder" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "forwarder.create", data: { name: "Bayline Freight", email: "" } }])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The list shows the new forwarder before the dialog closes.
    await expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true })
  }
})

// The top bar's Create > Supplier lands here with ?add=supplier, which opens its sheet.
export const OpenedFromCreate = meta.story({
  parameters: { router: { navigation: { pathname: "/partners", query: { add: "supplier" } } } },
  play: async () => {
    await shownDialog("Add a supplier")
  }
})
