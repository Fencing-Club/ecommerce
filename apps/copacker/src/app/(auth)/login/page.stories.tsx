import { expect, userEvent, waitFor, within } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
// The route renders the sign-in screen itself.
import { AuthScreen as PageView } from "@/components/auth/auth-screen"
import { AuthShell } from "@/components/auth/auth-shell"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { errors } from "@/stories/fixtures/auth"

const sent: ActionRequest[] = []

function Login({ next, email, error }: { next: string; email?: string; error?: string }) {
  return (
    <AuthShell>
      <PageView page={{ kind: "login", next, email, failed: Boolean(error) }} />
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Sign in",
  component: Login,
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/login" } } },
  args: { next: "/" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/")))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1, name: "Sign in to Copacker" })).toBeVisible()
    await expect(main.queryByRole("alert")).toBeNull()
    await expect(main.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/login/google?next=%2F"
    )
    await expect(main.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup")
    await expect(main.getByLabelText("Email")).toHaveValue("")
    await userEvent.type(main.getByLabelText("Email"), "alex@example.com")
    await userEvent.type(main.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(main.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/"))
    await expect(sent[0]?.data).toEqual({
      email: "alex@example.com",
      password: "correct horse battery",
      next: "/"
    })
  }
})

// ?error=… from a Google or Microsoft sign-in that didn't finish.
export const OAuthFailed = meta.story({
  args: { error: "oauth" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn’t sign in with that account. Try again.")
  }
})

// ?next=… comes back after signing in, and carries over to sign-up and the providers.
export const ReturnsToPage = meta.story({
  args: { next: "/orders/new" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/orders/new")))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?next=%2Forders%2Fnew"
    )
    await expect(canvas.getByRole("button", { name: "Continue with Microsoft" })).toHaveAttribute(
      "href",
      "/login/microsoft?next=%2Forders%2Fnew"
    )
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/orders/new"))
    await expect(sent[0]?.data).toMatchObject({ next: "/orders/new" })
  }
})

// ?email=… fills in the address, such as from the forgot-password page.
export const WithEmail = meta.story({
  args: { email: "alex@example.com" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.incorrectCredentials)))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Email")).toHaveValue("alex@example.com")
    await expect(canvas.getByLabelText("Email")).not.toHaveAttribute("readonly")
    await userEvent.type(canvas.getByLabelText("Password"), "wrong password")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.incorrectCredentials)
  }
})
