import { expect, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
// The route renders the sign-in screen itself.
import { AuthScreen as PageView } from "@/components/auth/auth-screen"
import { AuthShell } from "@/components/auth/auth-shell"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { errors } from "@/stories/fixtures/auth"

const sent: ActionRequest[] = []

function VerifyEmail({ email }: { email: string }) {
  return (
    <AuthShell>
      <PageView page={{ kind: "verify-email", email }} />
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Verify email",
  component: VerifyEmail,
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/verify-email" } } },
  args: { email: "alex@example.com" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/onboarding")))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible()
    await expect(canvas.getByText("alex@example.com")).toHaveClass("font-medium")
    await expect(canvas.getByText(/Enter the code we sent to/)).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Start again" })).toHaveAttribute("href", "/signup")
    await expect(canvas.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled()
    await userEvent.type(canvas.getByLabelText("Verification code"), "482913")
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/onboarding"))
    await expect(sent).toEqual([{ action: "auth.verifyEmail", data: { code: "482913" } }])
  }
})

export const WrongCode = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.wrongCode)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Verification code"), "000000")
    await expect(await canvas.findByText(errors.wrongCode)).toBeVisible()
    await waitFor(() => expect(canvas.getByLabelText("Verification code")).toHaveValue(""))
  }
})
