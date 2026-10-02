import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { OnboardingWizard, type WizardValues } from "@/components/onboarding/onboarding-wizard"
import { SignedInAs } from "@/components/onboarding/signed-in-as"
import type { profiles } from "@/db/schema"
import { blankPlace } from "@/lib/onboarding"
import type { Invitation } from "@/server/invitations"
import {
  actionRecorder,
  invitation,
  invitationToken,
  ownedWorkspaces,
  redirectTo,
  savedProfile,
  skipAnimations
} from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()

type Args = {
  // The signed-in person, as WorkOS knows them.
  user: { email: string; firstName: string; lastName: string }
  profile: typeof profiles.$inferSelect | null
  complete: boolean
  // The workspaces they belong to.
  workspaces: Array<{ id: string; name: string }>
  // The workspace open in their cookie.
  open?: string
  next?: string
  // ?invite=… and the invitation it found, which matches their email.
  invite?: Invitation
}

// Getting started (page.tsx) for each way someone arrives. The page redirects instead when an invitation can't be
// used here, a colleague with a full profile only needs to accept, or someone with a workspace and a full profile has
// nothing to add. The layout is only AppProviders, the story frame's own providers.
async function Onboarding({ user, profile, complete, workspaces, open, next = "/", invite }: Args) {
  const person = {
    firstName: profile?.firstName || user.firstName || "",
    lastName: profile?.lastName || user.lastName || "",
    position: profile?.position ?? ""
  }
  const blank: WizardValues = { person, kind: "", company: { name: "", website: "", phone: "" }, address: blankPlace }
  const account = <SignedInAs email={user.email} />
  const about = complete ? [] : (["about"] as const)

  if (invite) {
    if (invite.kind === "team") {
      return (
        <OnboardingWizard
          steps={["about"]}
          finish={{ type: "join", token: invitationToken, workspace: invite.company }}
          kind={null}
          initial={blank}
          invitedBy={invite.from}
          account={account}
        />
      )
    }
    return (
      <OnboardingWizard
        steps={[...about, "company", "address"]}
        finish={{ type: "workspace", invitation: { kind: invite.kind, token: invitationToken } }}
        kind={invite.kind}
        initial={{
          ...blank,
          kind: invite.kind,
          company: { name: invite.company, website: invite.website, phone: invite.phone },
          address: invite.addresses[0] ?? blankPlace
        }}
        invitedBy={invite.from}
        account={account}
      />
    )
  }

  if (!workspaces.length) {
    return (
      <OnboardingWizard
        steps={[...about, "role", "company", "address"]}
        finish={{ type: "workspace", invitation: null }}
        kind={null}
        initial={blank}
        invitedBy={null}
        account={account}
      />
    )
  }

  const company = profile?.company || (workspaces.find((row) => row.id === open) ?? workspaces[0]!).name
  return (
    <OnboardingWizard
      steps={["about"]}
      finish={{ type: "profile", company, next }}
      kind={null}
      initial={blank}
      invitedBy={null}
      account={account}
    />
  )
}

const meta = preview.meta({
  title: "Pages/Shared/Onboarding",
  ...serverStory(Onboarding),
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/onboarding" } } },
  args: {
    user: { email: "alex@example.com", firstName: "Alex", lastName: "" },
    profile: null,
    complete: false,
    workspaces: []
  },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/overview")))
    return skipAnimations()
  }
})

// Someone new: who they are, what their company does, the company and its address. WorkOS's name starts them off.
export const NewAccount = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 4")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "About you" })).toBeVisible()
    await expect(canvas.getByLabelText(/First name/)).toHaveValue("Alex")
    await expect(canvas.getByLabelText(/Last name/)).toHaveValue("")
    await expect(canvas.getByText("alex@example.com")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sign out" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeVisible()
  }
})

// A full profile from an earlier workspace: only the company's steps.
export const NewAccountWithProfile = meta.story({
  args: { profile: savedProfile, complete: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 3")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "What does your company do?" })).toBeVisible()
  }
})

// A buyer's supplier: the company and address the buyer kept, then the workspace that accepts the invitation.
export const InvitedSupplier = meta.story({
  args: { invite: invitation("supplier"), user: { email: "mei@lotus.example.com", firstName: "", lastName: "" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 3")).toBeVisible()
    await expect(canvas.getByText("Invited by Harbor Goods")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "About you" })).toBeVisible()
  }
})

export const InvitedSupplierWithProfile = meta.story({
  args: {
    invite: invitation("supplier"),
    user: { email: "mei@lotus.example.com", firstName: "Mei", lastName: "Chen" },
    profile: { ...savedProfile, firstName: "Mei", lastName: "Chen", position: "Sales manager", company: "" },
    complete: true
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 2")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "Your company" })).toBeVisible()
    await expect(canvas.getByLabelText(/Company name/)).toHaveValue("Lotus Manufacturing")
    await expect(canvas.getByLabelText(/Website/)).toHaveValue("https://lotus.example.com")
    await expect(canvas.getByLabelText(/Phone number/)).toHaveValue("+86 188 6161 3263")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Pickup address" })).toBeVisible()
    await expect(canvas.getByLabelText(/Street address/)).toHaveValue("88 Industrial Road")
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/overview"))
    await expect(actions.sent[0]).toMatchObject({
      action: "onboarding.workspace",
      data: { kind: "supplier", invitation: { kind: "supplier", token: invitationToken } }
    })
  }
})

// A forwarder's invitation brings no address unless the buyer saved one.
export const InvitedForwarder = meta.story({
  args: {
    invite: invitation("forwarder"),
    user: { email: "ops@bayline.example.com", firstName: "Sam", lastName: "Okafor" },
    profile: { ...savedProfile, firstName: "Sam", lastName: "Okafor", position: "Owner", company: "" },
    complete: true
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/Company name/)).toHaveValue("Bayline Freight")
    await expect(canvas.queryByLabelText(/Phone number/)).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Warehouse address" })).toBeVisible()
    await expect(canvas.getByLabelText(/Street address/)).toHaveValue("")
    await expect(canvas.getByLabelText(/Address name/)).toHaveValue("Warehouse")
  }
})

// A colleague's invitation needs only who they are.
export const InvitedColleague = meta.story({
  args: { invite: invitation("team"), user: { email: "jordan@example.com", firstName: "Jordan", lastName: "Lee" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Step 1 of/)).toBeNull()
    await expect(canvas.getByLabelText(/Last name/)).toHaveValue("Lee")
    await expect(canvas.getByRole("button", { name: "Join Harbor Goods" })).toBeVisible()
  }
})

// In a workspace already without a full profile: just the profile, for the company that's open.
export const ProfileOnly = meta.story({
  args: {
    workspaces: ownedWorkspaces,
    open: ownedWorkspaces[1]?.id,
    next: "/orders",
    profile: { ...savedProfile, position: "", company: "" }
  },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler())
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Step 1 of/)).toBeNull()
    await expect(canvas.getByLabelText(/First name/)).toHaveValue("Alex")
    await expect(canvas.getByLabelText(/Last name/)).toHaveValue("Rivera")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Choose your position")).toBeVisible()
    await userEvent.click(canvas.getByRole("combobox", { name: /Position/ }))
    await userEvent.click(await screen.findByRole("option", { name: "Owner" }))
    await waitFor(() => expect(canvas.getByRole("combobox", { name: /Position/ })).toHaveTextContent("Owner"))
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/orders"))
    await expect(actions.sent[0]).toEqual({
      action: "profile.update",
      data: { firstName: "Alex", lastName: "Rivera", position: "Owner", company: "Lotus Packaging Co" }
    })
  }
})
