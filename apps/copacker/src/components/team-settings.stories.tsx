import { HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, serverError, team } from "@/stories/fixtures/logistics"
import { person } from "@/stories/workspace"
import { TeamSettings } from "./team-settings"

const sent: ActionRequest[] = []

const meta = preview.meta({
  component: TeamSettings,
  args: {
    ...team,
    admin: true,
    owner: true,
    you: person.id,
    workspace: "Harbor Goods",
    kind: "buyer"
  },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

// Picks a page's access in the open access dialog.
async function choose(dialog: HTMLElement, page: string, level: string) {
  await userEvent.click(within(dialog).getByRole("combobox", { name: page }))
  await userEvent.click(await screen.findByRole("option", { name: level }))
  // The menu closes before the next one opens.
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

// The owner's own row has no menu; everyone else's has what the owner can do to them.
export const Owner = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 people")).toBeVisible()
    await expect(canvas.getByText("You")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "More for Alex Rivera" })).toBeNull()
    // Without a menu, the owner's role badge still lines up with the others.
    await expect(canvas.getByText("Owner").getBoundingClientRect().right).toBeCloseTo(
      canvas.getAllByText("Admin")[0]!.getBoundingClientRect().right,
      0
    )
    await expect(canvas.getByText("Invited, expires Oct 4")).toBeVisible()
    await expect(canvas.getByText("Invitation expired")).toHaveClass("text-destructive")
    await userEvent.click(canvas.getByRole("button", { name: "More for Priya Shah" }))
    await expect(await screen.findByRole("menuitem", { name: "Change access" })).toBeInTheDocument()
    await expect(screen.getByRole("menuitem", { name: "Transfer ownership" })).toBeInTheDocument()
    await expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument()
  }
})

export const InviteMember = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, ({ data }) => HttpResponse.json({ ok: true, email: data.email })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    const dialog = await screen.findByRole("dialog", { name: "Invite to Harbor Goods" })
    // A member starts with no pages, so one has to be chosen.
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await expect(await within(dialog).findByText("Enter an email address")).toBeInTheDocument()
    await expect(within(dialog).getByText("Choose at least one page")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email" }), "jordan@harbor.example.com")
    await choose(dialog, "Shipments", "Edit")
    await expect(within(dialog).queryByText("Choose at least one page")).toBeNull()
    await choose(dialog, "Purchase orders", "View")
    // The Overview is about money, so it offers view at most.
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Overview" }))
    await expect(await screen.findByRole("option", { name: "View" })).toBeInTheDocument()
    await expect(screen.queryByRole("option", { name: "Edit" })).toBeNull()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "team.invite",
          data: {
            email: "jordan@harbor.example.com",
            role: "member",
            access: { shipments: "edit", orders: "view", prices: "view" }
          }
        }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // The invitation's row says it went.
    await expect(canvas.getByText("Invitation sent, expires Oct 4")).toBeVisible()
  }
})

// Without prices, pages about money close and pages whose changes set prices offer view at most.
export const InviteWithoutPrices = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email" }), "lee@harbor.example.com")
    await choose(dialog, "Overview", "View")
    await choose(dialog, "Partners", "Edit")
    await choose(dialog, "Purchase orders", "Edit")
    await userEvent.click(within(dialog).getByRole("switch", { name: "See prices and costs" }))
    await expect(within(dialog).getByRole("combobox", { name: "Overview" })).toBeDisabled()
    await expect(within(dialog).getByRole("combobox", { name: "Overview" })).toHaveTextContent("No access")
    await expect(within(dialog).getByRole("combobox", { name: "Partners" })).toHaveTextContent("Edit")
    // Editing purchase orders sets prices, so it drops to viewing them.
    await expect(within(dialog).getByRole("combobox", { name: "Purchase orders" })).toHaveTextContent("View")
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Purchase orders" }))
    await expect(await screen.findByRole("option", { name: "View" })).toBeInTheDocument()
    await expect(screen.queryByRole("option", { name: "Edit" })).toBeNull()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "team.invite",
          data: { email: "lee@harbor.example.com", role: "member", access: { partners: "edit", orders: "view" } }
        }
      ])
    )
  }
})

// An admin can do everything, so there are no pages to choose.
export const InviteAdmin = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email" }), "morgan@harbor.example.com")
    await userEvent.click(within(dialog).getByRole("radio", { name: "Admin" }))
    await expect(within(dialog).queryByText("Pages")).toBeNull()
    await expect(within(dialog).queryByRole("switch")).toBeNull()
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({
      action: "team.invite",
      data: { email: "morgan@harbor.example.com", role: "admin" }
    })
  }
})

export const InviteFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Priya Shah is already in Harbor Goods.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email" }), "priya@harbor.example.com")
    await userEvent.click(within(dialog).getByRole("radio", { name: "Admin" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
    await expect(await within(dialog).findByText("Priya Shah is already in Harbor Goods.")).toBeInTheDocument()
  }
})

export const ChangeMemberAccess = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Sam Okafor" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Change access" }))
    const dialog = await screen.findByRole("dialog", { name: "Change access for Sam Okafor" })
    // It starts from what they have now.
    await expect(within(dialog).getByRole("radio", { name: "Member" })).toBeChecked()
    await expect(within(dialog).getByRole("switch", { name: "See prices and costs" })).toBeChecked()
    await expect(within(dialog).getByRole("combobox", { name: "Purchase orders" })).toHaveTextContent("Edit")
    await expect(within(dialog).getByRole("combobox", { name: "Shipments" })).toHaveTextContent("View")
    await userEvent.click(within(dialog).getByRole("switch", { name: "See prices and costs" }))
    await expect(within(dialog).getByRole("combobox", { name: "Purchase orders" })).toHaveTextContent("View")
    await expect(within(dialog).getByRole("combobox", { name: "Overview" })).toBeDisabled()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "team.access",
          data: { userId: "user_sam", role: "member", access: { orders: "view", shipments: "view" } }
        }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

// Making a member an admin needs no pages.
export const PromoteToAdmin = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Sam Okafor" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Change access" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("radio", { name: "Admin" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({ action: "team.access", data: { userId: "user_sam", role: "admin" } })
  }
})

export const RemoveMember = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Sam Okafor" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Sam Okafor?" })
    await expect(dialog).toHaveTextContent("They lose access to Harbor Goods right away.")
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(sent).toEqual([{ action: "team.remove", data: { userId: "user_sam" } }]))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  }
})

export const RemoveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Sam Okafor already left Harbor Goods.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Sam Okafor" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }))
    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
    await expect(await within(dialog).findByText("Sam Okafor already left Harbor Goods.")).toBeInTheDocument()
    // Cancel closes it with nothing removed.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  }
})

export const TransferOwnership = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for Priya Shah" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Transfer ownership" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Transfer ownership to Priya Shah?" })
    await expect(dialog).toHaveTextContent("They become the owner of Harbor Goods, and you stay an admin.")
    await userEvent.click(within(dialog).getByRole("button", { name: "Transfer ownership" }))
    await waitFor(() => expect(sent).toEqual([{ action: "team.transfer", data: { userId: "user_priya" } }]))
  }
})

// An admin manages members but can't hand over the workspace, or change the owner or themselves.
export const Admin = meta.story({
  args: { owner: false, you: "user_priya" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "More for Alex Rivera" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "More for Priya Shah" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "More for Sam Okafor" }))
    await expect(await screen.findByRole("menuitem", { name: "Change access" })).toBeInTheDocument()
    await expect(screen.queryByRole("menuitem", { name: "Transfer ownership" })).toBeNull()
  }
})

// Members see the team and its invitations without changing them.
export const Member = meta.story({
  args: { admin: false, owner: false, you: "user_sam" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Invite" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: /^More for/ })).toBeNull()
    await expect(canvas.getByText("jordan@harbor.example.com")).toBeVisible()
  }
})

export const ResendInvitation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for casey@harbor.example.com" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Send again" }))
    await waitFor(() => expect(sent).toEqual([{ action: "team.resend", data: { email: "casey@harbor.example.com" } }]))
    await expect(await canvas.findByText("Invitation sent, expires Sep 20")).toBeVisible()
  }
})

export const CancelInvitation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for jordan@harbor.example.com" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel invitation" }))
    await waitFor(() => expect(sent).toEqual([{ action: "team.cancel", data: { email: "jordan@harbor.example.com" } }]))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

export const InvitationFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("That invitation was already accepted.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for jordan@harbor.example.com" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel invitation" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("That invitation was already accepted.")
  }
})

// Changing an invitation changes what they get when they join.
export const ChangeInvitationAccess = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More for jordan@harbor.example.com" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Change access" }))
    const dialog = await screen.findByRole("dialog", { name: "Change access for jordan@harbor.example.com" })
    await expect(within(dialog).getByRole("combobox", { name: "Shipments" })).toHaveTextContent("Edit")
    // An invitation made without prices keeps them off.
    await expect(within(dialog).getByRole("switch", { name: "See prices and costs" })).not.toBeChecked()
    await choose(dialog, "Shipments", "No access")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await expect(await within(dialog).findByText("Choose at least one page")).toBeInTheDocument()
    await choose(dialog, "Partners", "View")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "team.access",
          data: { email: "jordan@harbor.example.com", role: "member", access: { partners: "view" } }
        }
      ])
    )
  }
})

// A forwarder's pages have no prices, so there's no switch for them.
export const Forwarder = meta.story({
  args: { workspace: "Bayline Freight", kind: "forwarder", invitations: [] },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Invite" }))
    const dialog = await screen.findByRole("dialog", { name: "Invite to Bayline Freight" })
    await expect(within(dialog).queryByRole("switch")).toBeNull()
    await expect(within(dialog).getByRole("combobox", { name: "Purchase orders" })).toBeInTheDocument()
    await expect(within(dialog).queryByRole("combobox", { name: "Shipments" })).toBeNull()
  }
})
