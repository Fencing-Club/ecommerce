import { expect, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { errors } from "@/stories/fixtures/auth"
import { VerifyEmailForm } from "./verify-email-form"

const sent: ActionRequest[] = []

// Runs the resend button's one-second countdown twenty times faster, so a story sees it end.
function fastCountdown() {
  const setInterval = window.setInterval
  const fast = (handler: TimerHandler, timeout?: number, ...rest: unknown[]) =>
    setInterval(handler, timeout === 1000 ? 50 : timeout, ...rest)
  Object.defineProperty(window, "setInterval", { value: fast, configurable: true, writable: true })
  return () => {
    Object.defineProperty(window, "setInterval", { value: setInterval, configurable: true, writable: true })
  }
}

const meta = preview.meta({
  title: "Components/Auth/Verify email form",
  component: VerifyEmailForm,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/onboarding")))
  }
})

// The sixth digit sends the code without a click.
export const SendsWhenComplete = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Verification code"), "123456")
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/onboarding"))
    await expect(sent).toEqual([{ action: "auth.verifyEmail", data: { code: "123456" } }])
    await expect(canvas.getByRole("button", { name: "Verify email" })).toBeDisabled()
  }
})

export const Incomplete = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Verification code"), "12")
    await userEvent.click(canvas.getByRole("button", { name: "Verify email" }))
    await expect(await canvas.findByText("Enter the 6-digit code")).toBeVisible()
    await expect(sent).toHaveLength(0)
  }
})

// A wrong code says so and clears for another try.
export const WrongCode = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.wrongCode)))
  },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Verification code")
    await userEvent.type(input, "000000")
    await expect(await canvas.findByText(errors.wrongCode)).toBeVisible()
    await waitFor(() => expect(input).toHaveValue(""))
    await expect(input).toHaveFocus()
    await expect(finishSignIn).not.toHaveBeenCalled()
    // The next code goes out as the last did.
    await userEvent.type(input, "111111")
    await waitFor(() => expect(sent).toHaveLength(2))
    await expect(sent[1]).toEqual({ action: "auth.verifyEmail", data: { code: "111111" } })
  }
})

export const ExpiredCode = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.codeExpired)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Verification code"), "123456")
    await expect(await canvas.findByText(errors.codeExpired)).toBeVisible()
  }
})

// Another code can't be sent until the countdown ends.
export const ResendWaits = meta.story({
  play: async ({ canvas }) => {
    const resend = canvas.getByRole("button", { name: /Send again in \d+s/ })
    await expect(resend).toBeDisabled()
    await expect(canvas.getByText("Didn’t get it?", { exact: false })).toBeVisible()
  }
})

export const Resend = meta.story({
  beforeEach: fastCountdown,
  play: async ({ canvas }) => {
    const resend = await canvas.findByRole("button", { name: "Send a new code" }, { timeout: 4000 })
    await expect(resend).toBeEnabled()
    await userEvent.click(resend)
    await expect(await canvas.findByText("New code sent")).toBeVisible()
    await expect(sent).toEqual([{ action: "auth.resendCode", data: {} }])
    // The countdown starts over.
    await expect(canvas.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled()
  }
})

export const ResendFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Too many requests. Try again later.", 429)))
    return fastCountdown()
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Send a new code" }, { timeout: 4000 }))
    await expect(await canvas.findByText("Too many requests. Try again later.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Send a new code" })).toBeEnabled()
  }
})
