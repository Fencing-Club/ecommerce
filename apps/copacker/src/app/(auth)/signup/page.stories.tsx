import { expect, userEvent, waitFor, within } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { AuthShell } from "@/components/auth/auth-shell"
import { type ActionRequest, recordActions, redirectTo } from "@/stories/actions"
import PageView from "./page"

const sent: ActionRequest[] = []

function SignUp({
  next,
  email,
  invited,
  invitation
}: {
  next: string
  email?: string
  invited?: string
  invitation?: string
}) {
  return (
    <AuthShell>
      <PageView
        page={{ kind: "signup", next, email: invited ?? email, invitation: invited ? invitation : undefined }}
      />
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Sign up",
  component: SignUp,
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/signup" } } },
  args: { next: "/" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/verify-email")))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible()
    await expect(main.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    await expect(main.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/login/google?next=%2F"
    )
    await userEvent.click(main.getByRole("button", { name: "Create account" }))
    await expect(await main.findByText("Enter an email address")).toBeVisible()
    await userEvent.type(main.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(main.getByLabelText("Password"), "a long enough password")
    await userEvent.click(main.getByRole("button", { name: "Create account" }))
    // A code to the email confirms it next.
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/verify-email"))
    await expect(sent).toEqual([
      { action: "auth.signUp", data: { email: "alex@example.com", password: "a long enough password", next: "/" } }
    ])
  }
})

export const ReturnsToPage = meta.story({
  args: { next: "/restock" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Frestock")
    await expect(canvas.getByRole("button", { name: "Continue with Microsoft" })).toHaveAttribute(
      "href",
      "/login/microsoft?next=%2Frestock"
    )
    await userEvent.type(canvas.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "a long enough password")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toMatchObject({ next: "/restock" })
  }
})

export const WithEmail = meta.story({
  args: { email: "alex@example.com" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Work email")).toHaveValue("alex@example.com")
    await expect(canvas.getByLabelText("Work email")).not.toHaveAttribute("readonly")
    await userEvent.type(canvas.getByLabelText("Password"), "short")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await expect(await canvas.findByText("Use at least 10 characters")).toBeVisible()
    await expect(sent).toHaveLength(0)
  }
})

// Opened from a WorkOS invitation, such as approving a waitlist entry: the form keeps to the invited address, sends
// the invitation along to accept it, and leaves out Google and Microsoft, which can't carry it.
export const Invited = meta.story({
  args: { invited: "alex@example.com", invitation: "invitation_01K2WAITLIST" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Work email")).toHaveValue("alex@example.com")
    await expect(canvas.getByLabelText("Work email")).toHaveAttribute("readonly")
    await expect(canvas.queryByRole("button", { name: "Continue with Google" })).toBeNull()
    await userEvent.type(canvas.getByLabelText("Password"), "a long enough password")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toEqual({
      email: "alex@example.com",
      password: "a long enough password",
      next: "/",
      invitation: "invitation_01K2WAITLIST"
    })
  }
})
