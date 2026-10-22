import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { held, type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { shownAlertDialog } from "@/stories/play"
import { person, workspaces } from "@/stories/workspace"
import { DangerZone } from "./danger-zone"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/Forms/Danger zone",
  component: DangerZone,
  args: {
    workspace: workspaces.buyer.name,
    kind: "buyer",
    owner: true,
    email: person.email,
    handOver: [],
    closing: []
  } satisfies React.ComponentProps<typeof DangerZone>
})

export const OwnerDeletesWorkspace = meta.story({
  play: async ({ canvas, msw }) => {
    // A deletion that succeeds loads another page, so the server holds its answer and the story stays on the dialog.
    msw.use(recordActions(sent, held))
    await expect(canvas.getByText("Harbor Goods and everything in it, for everyone")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog("Delete Harbor Goods?")
    await expect(
      dialog.getByText("Its purchase orders, products, connections, and team are deleted for everyone.")
    ).toBeInTheDocument()
    const confirm = dialog.getByRole("button", { name: "Delete workspace" })
    const field = dialog.getByLabelText("Workspace name")
    await expect(field).toHaveAttribute("placeholder", "Harbor Goods")
    await expect(confirm).toBeDisabled()
    await userEvent.type(field, "Harbor")
    await expect(confirm).toBeDisabled()
    // The name matches without regard to case or spaces around it.
    await userEvent.type(field, " goods ")
    await expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.delete", data: { name: "Harbor goods" } }]))
    await expect(confirm).toHaveAttribute("aria-busy", "true")
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled()
  }
})

export const OwnerCancels = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent))
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog()
    await userEvent.type(dialog.getByLabelText("Workspace name"), "Harbor Goods")
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    // Opening it again starts over.
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    await expect((await shownAlertDialog()).getByLabelText("Workspace name")).toHaveValue("")
    await expect(sent).toEqual([])
  }
})

export const DeleteFails = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, failWith("Transfer ownership of Harbor Goods EU first.", 409)))
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog()
    await userEvent.type(dialog.getByLabelText("Workspace name"), "Harbor Goods")
    await userEvent.click(dialog.getByRole("button", { name: "Delete workspace" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Transfer ownership of Harbor Goods EU first.")
    await expect(dialog.getByRole("button", { name: "Delete workspace" })).toBeEnabled()
    await expect(getStoryRouter().invalidate).toHaveBeenCalled()
  }
})

export const SupplierWorkspace = meta.story({
  args: { workspace: workspaces.supplier.name, kind: "supplier" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog("Delete Lotus Manufacturing?")
    await expect(
      dialog.getByText("Its products, catalogs, and team are deleted for everyone. Buyers keep their purchase orders.")
    ).toBeInTheDocument()
  }
})

export const ForwarderWorkspace = meta.story({
  args: { workspace: workspaces.forwarder.name, kind: "forwarder" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete workspace" }))
    const dialog = await shownAlertDialog("Delete Bayline Freight?")
    await expect(dialog.getByText(/Its addresses and team are deleted for everyone/)).toBeInTheDocument()
  }
})

// A member can't delete the workspace, only their own account.
export const MemberDeletesAccount = meta.story({
  args: { owner: false },
  play: async ({ canvas, msw }) => {
    msw.use(recordActions(sent, held))
    await expect(canvas.queryByRole("button", { name: "Delete workspace" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Delete account" }))
    const dialog = await shownAlertDialog("Delete your account?")
    await expect(dialog.getByText("You’re signed out and removed from every workspace.")).toBeInTheDocument()
    await userEvent.type(dialog.getByLabelText("Your email"), "ALEX@example.com")
    await userEvent.click(dialog.getByRole("button", { name: "Delete account" }))
    await waitFor(() => expect(sent).toEqual([{ action: "account.delete", data: { email: "ALEX@example.com" } }]))
  }
})

// Workspaces only the person uses close with the account.
export const AccountClosesWorkspaces = meta.story({
  args: { closing: ["Harbor Goods", "Harbor Goods EU"] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete account" }))
    const dialog = await shownAlertDialog("Delete your account?")
    await expect(dialog.getByText(/Harbor Goods and Harbor Goods EU close with your account\./)).toBeInTheDocument()
  }
})

// Workspaces others use need a new owner first, so the account can't be deleted yet.
export const AccountNeedsHandOver = meta.story({
  args: { handOver: ["Harbor Goods"], closing: ["Harbor Goods EU"] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete account" }))
    const dialog = await shownAlertDialog("Delete your account?")
    await expect(dialog.getByText("Transfer ownership of Harbor Goods first.")).toBeInTheDocument()
    await expect(dialog.queryByLabelText("Your email")).toBeNull()
    await expect(dialog.queryByRole("button", { name: "Delete account" })).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  }
})
