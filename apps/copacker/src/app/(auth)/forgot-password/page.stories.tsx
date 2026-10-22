import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthShell } from "@/components/auth/auth-shell"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { errors } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"
import PageView from "./page"

const sent: ActionRequest[] = []

// The forgot-password page (page.tsx) in the auth layout, with the query's `email`. The layout's AppProviders is the
// story frame's own providers.
async function ForgotPasswordPage({ email }: { email?: string }) {
  return (
    <AuthShell>
      <PageView page={{ kind: "forgot-password", email }} />
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Forgot password",
  ...serverStory(ForgotPasswordPage),
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/forgot-password" } } },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible()
    await expect(main.getByLabelText("Email")).toHaveValue("")
    await expect(main.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    await userEvent.type(main.getByLabelText("Email"), "alex@example")
    await userEvent.click(main.getByRole("button", { name: "Send reset link" }))
    await expect(await main.findByText("Enter an email address")).toBeVisible()
    await expect(sent).toHaveLength(0)
  }
})

// ?email=… from the sign-in page's link: sending it says the link is on its way.
export const WithEmail = meta.story({
  args: { email: "alex@example.com" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Email")).toHaveValue("alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Check your email" })).toBeVisible()
    await expect(sent).toEqual([{ action: "auth.forgotPassword", data: { email: "alex@example.com" } }])
    await expect(canvas.getByRole("button", { name: "Back to sign in" })).toHaveAttribute("href", "/login")
  }
})

export const Fails = meta.story({
  args: { email: "alex@example.com" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.generic)))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.generic)
    await expect(canvas.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible()
  }
})
