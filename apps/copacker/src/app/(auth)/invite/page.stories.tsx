import { Link } from "@tanstack/react-router"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { AcceptInvitation } from "@/components/auth/accept-invitation"
import { AuthPage, AuthShell, AuthSwitch } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { Button } from "@/components/ui/button"
import type { Invitation, InvitationKind } from "@/server/invitations"
import {
  actionRecorder,
  invitation,
  invitationPath,
  invitationToken,
  ownedWorkspaces,
  redirectTo,
  skipAnimations
} from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

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
  const home = user ? "/" : "/login"
  const t = await translateStory("auth.invite")
  const page = async () => {
    if (!invitation) {
      return (
        <AuthPage title={t("invalidTitle")} description={t("invalidDescription")}>
          <Button className="h-10 w-full" nativeButton={false} render={<Link to="." href={home} />}>
            {user ? t("openCopacker") : t("signIn")}
          </Button>
        </AuthPage>
      )
    }
    if (invitation.expired) {
      return (
        <AuthPage title={t("expiredTitle")} description={t("expiredDescription", { name: invitation.from })}>
          <Button className="h-10 w-full" nativeButton={false} render={<Link to="." href={home} />}>
            {user ? t("openCopacker") : t("signIn")}
          </Button>
        </AuthPage>
      )
    }
    const here = invitationPath(kind, token)
    const setUp = `/onboarding?${new URLSearchParams({ invite: token, kind: kind === "supplier" ? "invite" : kind })}`
    const joining = t(`joining.${kind}`)
    const title = (
      <span className="flex flex-col gap-5">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-xl border bg-muted text-base font-semibold tracking-normal"
        >
          {initials(invitation.from)}
        </span>
        {t("invitedYou", { name: invitation.from })}
      </span>
    )
    if (!user) {
      const signIn = mode ? mode === "signin" : existing
      const other = await translateStory("auth.switch")
      return (
        <AuthPage title={title} description={joining}>
          <div className="flex flex-col gap-6">
            <SocialSignIn next={here} email={invitation.email} />
            {signIn ? (
              <SignInForm next={here} email={invitation.email} locked />
            ) : (
              <SignUpForm next={here} email={invitation.email} locked />
            )}
          </div>
          {signIn ? (
            <AuthSwitch prompt={other("newToCopacker")} href={`${here}&mode=signup`}>
              {other("createAccount")}
            </AuthSwitch>
          ) : (
            <AuthSwitch prompt={other("haveAccount")} href={`${here}&mode=signin`}>
              {other("signIn")}
            </AuthSwitch>
          )}
        </AuthPage>
      )
    }
    if (user.email.toLowerCase() !== invitation.email) {
      return (
        <AuthPage
          title={t("otherEmailTitle")}
          description={t.rich("otherEmailDescription", {
            invited: invitation.email,
            current: user.email,
            strong
          })}
        >
          <form action="/logout" method="post">
            <input type="hidden" name="next" value={here} />
            <Button type="submit" className="h-10 w-full">
              {t("signOutAndContinue")}
            </Button>
          </form>
        </AuthPage>
      )
    }
    if (kind === "team") {
      return (
        <AuthPage title={title} description={joining}>
          <AcceptInvitation kind="team" token={token} label={t("join", { company: invitation.company })} />
        </AuthPage>
      )
    }
    return (
      <AuthPage title={title} description={t(`choosing.${kind}`)}>
        <AcceptInvitation kind={kind} token={token} label={t("accept")} workspaces={owned} setUp={setUp} />
      </AuthPage>
    )
  }
  return <AuthShell>{await page()}</AuthShell>
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
  title: "Pages/Shared/Auth/Invitation",
  ...serverStory(InvitationPage),
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/invite" } } },
  args: signedOut,
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/overview")))
    const release = catchSubmit()
    const animate = skipAnimations()
    return () => {
      release()
      animate()
    }
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
    await waitFor(() => expect(actions.sent).toHaveLength(1))
    await expect(actions.sent[0]).toEqual({
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
    await waitFor(() => expect(actions.sent[0]?.action).toBe("auth.signIn"))
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
    await expect(actions.sent).toEqual([{ action: "onboarding.join", data: { kind: "team", token: invitationToken } }])
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
    await waitFor(() => expect(actions.sent).toHaveLength(1))
    await expect(actions.sent[0]?.data).toEqual({
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
