import { expect, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { AuthScreen } from "@/components/auth/auth-screen"
import { AuthShell } from "@/components/auth/auth-shell"
import { actionRecorder, errors, failWith, redirectTo, skipAnimations } from "@/stories/fixtures/auth"

const actions = actionRecorder()
const token = "reset_9fK2mQ7xLp3Zt8Wn"

function ResetPassword({ token }: { token?: string }) {
  return (
    <AuthShell>
      <AuthScreen page={{ kind: "reset-password", token }} />
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Shared/Auth/Reset password",
  component: ResetPassword,
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/reset-password" } } },
  args: { token },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/")))
    return skipAnimations()
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible()
    await userEvent.type(canvas.getByLabelText("New password"), "a brand new password")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    // Saving signs straight in.
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/"))
    await expect(actions.sent).toEqual([
      { action: "auth.resetPassword", data: { password: "a brand new password", token } }
    ])
  }
})

export const LinkExpired = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.linkExpired)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("New password"), "a brand new password")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.linkExpired)
  }
})

// A link without its token.
export const Incomplete = meta.story({
  args: { token: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This link is incomplete" })).toBeVisible()
    await expect(canvas.getByText("Open the link from the email again, or ask for a new one.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Send a new link" })).toHaveAttribute("href", "/forgot-password")
    await expect(canvas.queryByLabelText("New password")).toBeNull()
  }
})
