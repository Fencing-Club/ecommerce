import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { AuthShell } from "@/components/auth/auth-shell"
import type { Invitation, InvitationKind } from "@/server/invitations"
import { type ActionRequest, recordActions, redirectTo } from "@/stories/actions"
import { invitation, invitationPath, invitationToken, ownedWorkspaces } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"
import PageView from "./page"

const sent: ActionRequest[] = []

type Args = {
  kind: InvitationKind
  // What findInvitation found for the link's token, or null.
  invitation: Invitation | null
  // Who's signed in, if anyone.
  user: { email: string } | null
  // Whether the invited email has an account already, for someone signed out.
  existing?: boolean
  // ?mode=signin or ?mode=signup, from the link that switches between them.
  mode?: string
  // The workspaces of the invitation's kind that a signed-in supplier or forwarder runs.
  owned?: Array<{ id: string; name: string }>
}

// The invitation page (page.tsx) in the auth layout. The page redirects to getting started instead when a signed-in
// colleague's profile isn't complete, or a supplier or forwarder has no workspace to bring. The layout's AppProviders
// is the story frame's own providers.
async function InvitationPage({ kind, invitation, user, existing = false, mode, owned = [] }: Args) {
  const token = invitationToken
  return (
    <AuthShell>
      <PageView
        page={{
          token,
          kind,
          invitation,
          user,
          owned,
          home: user ? "/" : "/login",
          here: invitationPath(kind, token),
          setUp: "/onboarding?" + new URLSearchParams({ invite: token, kind: kind === "supplier" ? "invite" : kind }),
          signIn: mode ? mode === "signin" : existing
        }}
      />
    </AuthShell>
  )
}

// Where the sign-out form would post, caught before the browser leaves the story.
const posted = fn()

function catchSubmit() {
  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (event.target instanceof HTMLFormElement) {
      posted(event.target.getAttribute("action"), Object.fromEntries(new FormData(event.target)))
    }
  }
  document.addEventListener("submit", submit, true)
  return () => document.removeEventListener("submit", submit, true)
}

// A colleague's invitation, opened signed out.
const signedOut: Args = { kind: "team", invitation: invitation("team"), user: null }

const meta = preview.meta({
  title: "Pages/Auth/Invitation",
  ...serverStory(InvitationPage),
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/invite" } } },
  args: signedOut,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/overview")))
    return catchSubmit()
  }
})

// Someone new to Copacker signs up with the invited email.
export const NewToCopacker = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Harbor Goods invited you" })).toBeVisible()
    await expect(canvas.getByText("Join their workspace on Copacker.")).toBeVisible()
    await expect(canvas.getByText("HG")).toBeVisible()
    await expect(canvas.getByLabelText("Work email")).toHaveValue("jordan@example.com")
    await expect(canvas.getByLabelText("Work email")).toHaveAttribute("readonly")
    const here = invitationPath("team", invitationToken)
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `${here}&mode=signin`)
    const google = new URL(
      canvas.getByRole("button", { name: "Continue with Google" }).getAttribute("href") ?? "",
      "http://app.invalid"
    )
    await expect(google.searchParams.get("email")).toBe("jordan@example.com")
    await expect(google.searchParams.get("next")).toBe(here)
    await userEvent.type(canvas.getByLabelText("Password"), "a long enough password")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toEqual({
      action: "auth.signUp",
      data: { email: "jordan@example.com", password: "a long enough password", next: here }
    })
  }
})

// The invited email has an account, so the page offers sign-in.
export const HasAccount = meta.story({
  args: { existing: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Email")).toHaveValue("jordan@example.com")
    await expect(canvas.getByRole("button", { name: "Sign in" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      `${invitationPath("team", invitationToken)}&mode=signup`
    )
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(sent[0]?.action).toBe("auth.signIn"))
  }
})

// ?mode=signup overrides the guess.
export const ChoseSignUp = meta.story({
  args: { existing: true, mode: "signup" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Work email")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Create account" })).toBeVisible()
  }
})

export const SupplierSignedOut = meta.story({
  args: { kind: "supplier", invitation: invitation("supplier") },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Join Copacker as their supplier.")).toBeVisible()
    await expect(canvas.getByLabelText("Work email")).toHaveValue("mei@lotus.example.com")
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/invite?token=${invitationToken}&kind=invite&mode=signin`
    )
  }
})

export const ForwarderSignedOut = meta.story({
  args: { kind: "forwarder", invitation: invitation("forwarder") },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Join Copacker as their freight forwarder.")).toBeVisible()
    await expect(canvas.getByLabelText("Work email")).toHaveValue("ops@bayline.example.com")
  }
})

// A used or replaced link.
export const Invalid = meta.story({
  args: { invitation: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This invitation isn’t valid" })).toBeVisible()
    await expect(canvas.getByText("It was used already, or a newer one replaced it.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sign in" })).toHaveAttribute("href", "/login")
  }
})

export const InvalidSignedIn = meta.story({
  args: { invitation: null, user: { email: "alex@example.com" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Open Copacker" })).toHaveAttribute("href", "/")
  }
})

export const Expired = meta.story({
  args: { invitation: invitation("team", { expired: true }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This invitation expired" })).toBeVisible()
    await expect(canvas.getByText("Ask Harbor Goods to send a new one.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sign in" })).toHaveAttribute("href", "/login")
  }
})

export const ExpiredSignedIn = meta.story({
  args: { invitation: invitation("team", { expired: true }), user: { email: "jordan@example.com" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Open Copacker" })).toHaveAttribute("href", "/")
  }
})

// Signed in as someone else: signing out comes back here.
export const OtherEmail = meta.story({
  args: { user: { email: "alex@example.com" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This invitation is for another email" })).toBeVisible()
    await expect(canvas.getByText("jordan@example.com")).toHaveClass("font-medium")
    await expect(canvas.getByText("alex@example.com")).toHaveClass("font-medium")
    await userEvent.click(canvas.getByRole("button", { name: "Sign out and continue" }))
    await expect(posted).toHaveBeenCalledWith("/logout", { next: invitationPath("team", invitationToken) })
  }
})

// The invited colleague, signed in with a full profile, joins with one click. The email matches whatever its case.
export const JoinTeam = meta.story({
  args: { user: { email: "Jordan@Example.com" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Harbor Goods invited you" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Join Harbor Goods" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/overview" }))
    await expect(sent).toEqual([{ action: "onboarding.join", data: { kind: "team", token: invitationToken } }])
  }
})

// A supplier that runs workspaces already brings one, or makes a new one in getting started.
export const ChooseWorkspace = meta.story({
  args: {
    kind: "supplier",
    invitation: invitation("supplier"),
    user: { email: "mei@lotus.example.com" },
    owned: ownedWorkspaces
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Choose the workspace that supplies them.")).toBeVisible()
    await expect(canvas.getAllByRole("radio")).toHaveLength(3)
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toEqual({
      kind: "supplier",
      token: invitationToken,
      orgId: ownedWorkspaces[0]?.id
    })
  }
})

export const ChooseNewWorkspace = meta.story({
  args: {
    kind: "forwarder",
    invitation: invitation("forwarder"),
    user: { email: "ops@bayline.example.com" },
    owned: [{ id: "8c1d4e2f-6a3b-4d9c-9e7f-1b2a3c4d5e61", name: "Bayline Freight" }]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Choose the workspace that ships for them.")).toBeVisible()
    await userEvent.click(canvas.getByText("New workspace"))
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({
      href: `/onboarding?invite=${invitationToken}&kind=forwarder`
    })
  }
})
