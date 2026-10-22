import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { actionRecorder, errors, failWith, invitationToken, ownedWorkspaces, redirectTo } from "@/stories/fixtures/auth"
import { AcceptInvitation } from "./accept-invitation"

const actions = actionRecorder()
const setUp = `/onboarding?invite=${invitationToken}&kind=invite`
const bayline = { id: "8c1d4e2f-6a3b-4d9c-9e7f-1b2a3c4d5e61", name: "Bayline Freight" }

// A colleague's invitation to Harbor Goods.
const team: React.ComponentProps<typeof AcceptInvitation> = {
  kind: "team",
  token: invitationToken,
  label: "Join Harbor Goods"
}

const meta = preview.meta({
  title: "Components/Auth/Accept invitation",
  component: AcceptInvitation,
  args: team,
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/overview")))
  }
})

// A colleague joins with one click.
export const Team = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("radiogroup")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Join Harbor Goods" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/overview" }))
    // The workspace's page loads fresh on the way there, so nothing is refreshed again.
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
    await expect(actions.sent).toEqual([{ action: "onboarding.join", data: { kind: "team", token: invitationToken } }])
  }
})

// A supplier that runs workspaces already picks the one that supplies the buyer.
export const ChooseWorkspace = meta.story({
  args: { kind: "supplier", label: "Accept invitation", workspaces: ownedWorkspaces, setUp },
  play: async ({ canvas }) => {
    const group = canvas.getByRole("radiogroup", { name: "Workspace" })
    await expect(group).toBeVisible()
    await expect(canvas.getByRole("radio", { name: /Lotus Manufacturing/ })).toBeChecked()
    await expect(canvas.getByText("LM")).toBeVisible()
    await expect(canvas.getByText("LP")).toBeVisible()
    await userEvent.click(canvas.getByText("Lotus Packaging Co"))
    await expect(canvas.getByRole("radio", { name: /Lotus Packaging Co/ })).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/overview" }))
    await expect(actions.sent).toEqual([
      { action: "onboarding.join", data: { kind: "supplier", token: invitationToken, orgId: ownedWorkspaces[1]?.id } }
    ])
  }
})

// Choosing a new workspace goes to getting started instead of accepting here.
export const NewWorkspace = meta.story({
  args: { kind: "supplier", label: "Accept invitation", workspaces: ownedWorkspaces, setUp },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("New workspace"))
    await expect(canvas.getByRole("radio", { name: /New workspace/ })).toBeChecked()
    const next = canvas.getByRole("button", { name: "Continue" })
    await userEvent.click(next)
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: setUp })
    await expect(next).toBeDisabled()
    await expect(actions.sent).toHaveLength(0)
  }
})

export const Forwarder = meta.story({
  args: { kind: "forwarder", label: "Accept invitation", workspaces: [bayline] },
  play: async ({ canvas }) => {
    // Without a way to set up a new one, only the owned workspaces are offered.
    await expect(canvas.getAllByRole("radio")).toHaveLength(1)
    await expect(canvas.queryByText("New workspace")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }))
    await waitFor(() => expect(actions.sent).toHaveLength(1))
    await expect(actions.sent[0]?.data).toEqual({ kind: "forwarder", token: invitationToken, orgId: bayline.id })
  }
})

// A supplier with nothing to choose can't accept.
export const NothingToChoose = meta.story({
  args: { kind: "supplier", label: "Accept invitation" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Accept invitation" })).toBeDisabled()
  }
})

export const Fails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.invitationInvalid)))
  },
  play: async ({ canvas }) => {
    const join = canvas.getByRole("button", { name: "Join Harbor Goods" })
    await userEvent.click(join)
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.invitationInvalid)
    await expect(join).toBeEnabled()
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})
