import { expect, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { actionRecorder, errors, failWith, redirectTo, skipAnimations } from "@/stories/fixtures/auth"
import { ForgotPassword, ResetPasswordForm } from "./password-reset"

const actions = actionRecorder()

const meta = preview.meta({
  component: ForgotPassword,
  beforeEach: ({ msw }) => {
    msw.use(actions.handler())
    return skipAnimations()
  }
})

export const Forgot = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Reset your password" })).toBeVisible()
    await expect(canvas.getByText("We’ll email you a link to choose a new one.")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(await canvas.findByText("Enter an email address")).toBeVisible()
    await userEvent.type(canvas.getByLabelText("Email"), "not an email")
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(canvas.getByText("Enter an email address")).toBeVisible()
    await expect(actions.sent).toHaveLength(0)
  }
})

// Once sent, the page says where the link went, without saying whether the email has an account.
export const Sent = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(await canvas.findByRole("heading", { name: "Check your email" })).toBeVisible()
    await expect(actions.sent).toEqual([{ action: "auth.forgotPassword", data: { email: "alex@example.com" } }])
    await expect(canvas.getByText("alex@example.com")).toHaveClass("font-medium")
    await expect(canvas.getByText(/has an account, a reset link is on its way/)).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Back to sign in" })).toHaveAttribute("href", "/login")
    await expect(canvas.queryByLabelText("Email")).toBeNull()
  }
})

// The email typed on sign-in comes along.
export const Prefilled = meta.story({
  args: { email: "alex@example.com" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Email")).toHaveValue("alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(await canvas.findByRole("heading", { name: "Check your email" })).toBeVisible()
  }
})

export const ForgotFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.generic)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.generic)
    await expect(canvas.queryByRole("heading", { name: "Check your email" })).toBeNull()
    await expect(canvas.getByLabelText("Email")).toHaveValue("alex@example.com")
  }
})

const token = "reset_9fK2mQ7xLp3Zt8Wn"

export const Reset = meta.story({
  render: () => <ResetPasswordForm token={token} />,
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/orders")))
  },
  play: async ({ canvas }) => {
    const password = canvas.getByLabelText("New password")
    await expect(canvas.getByText("At least 10 characters")).toBeVisible()
    await userEvent.type(password, "too short")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    await expect(await canvas.findByText("Use at least 10 characters")).toBeVisible()
    await expect(actions.sent).toHaveLength(0)
    await userEvent.type(password, " no longer")
    await userEvent.click(canvas.getByRole("button", { name: "Show password" }))
    await expect(password).toHaveAttribute("type", "text")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/orders"))
    await expect(actions.sent).toEqual([
      { action: "auth.resetPassword", data: { password: "too short no longer", token } }
    ])
  }
})

export const ResetLinkExpired = meta.story({
  render: () => <ResetPasswordForm token={token} />,
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.linkExpired)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("New password"), "a brand new password")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.linkExpired)
    await expect(finishSignIn).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: "Save and sign in" })).toBeEnabled()
  }
})
