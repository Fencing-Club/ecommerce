import { expect, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { SignUpForm } from "./sign-up-form"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/Auth/Sign up form",
  component: SignUpForm,
  args: { next: "/" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/verify-email")))
  }
})

export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("At least 10 characters")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await expect(await canvas.findByText("Enter an email address")).toBeVisible()
    await expect(canvas.getByText("Use at least 10 characters")).toBeVisible()
    // The error restates the rule, so the rule steps aside.
    await expect(canvas.queryByText("At least 10 characters")).toBeNull()
    await expect(sent).toHaveLength(0)
  }
})

export const ShortPassword = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "short")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await expect(await canvas.findByText("Use at least 10 characters")).toBeVisible()
    await expect(canvas.queryByText("Enter an email address")).toBeNull()
    await expect(sent).toHaveLength(0)
  }
})

// The rule ticks once the password is long enough.
export const PasswordRule = meta.story({
  play: async ({ canvas }) => {
    const rule = canvas.getByText("At least 10 characters")
    await expect(rule).toHaveClass("text-muted-foreground")
    await userEvent.type(canvas.getByLabelText("Password"), "123456789")
    await expect(rule).toHaveClass("text-muted-foreground")
    await userEvent.type(canvas.getByLabelText("Password"), "0")
    await expect(rule).toHaveClass("text-success")
    await expect(canvas.getByLabelText("Password")).toHaveAccessibleDescription("At least 10 characters")
  }
})

export const CreatesAccount = meta.story({
  args: { next: "/orders/new" },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "a long enough password")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/verify-email"))
    await expect(sent).toEqual([
      {
        action: "auth.signUp",
        data: { email: "alex@example.com", password: "a long enough password", next: "/orders/new" }
      }
    ])
    await expect(canvas.getByRole("button", { name: "Create account" })).toBeDisabled()
  }
})

// WorkOS turns down a common password.
export const ServerError = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("This password is too common. Choose another.")))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "password1234")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("This password is too common. Choose another.")
    await expect(finishSignIn).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: "Create account" })).toBeEnabled()
  }
})

export const ShowPassword = meta.story({
  play: async ({ canvas }) => {
    const password = canvas.getByLabelText("Password")
    const toggle = canvas.getByRole("button", { name: "Show password" })
    await userEvent.click(toggle)
    await expect(password).toHaveAttribute("type", "text")
    await userEvent.click(toggle)
    await expect(password).toHaveAttribute("type", "password")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
  }
})

// An invitation's email, filled in and fixed.
export const LockedEmail = meta.story({
  args: { next: "/invite?token=inv_7Hq2kR9sLm4Xw8Zp3Tn6Vb&kind=team", email: "jordan@example.com", locked: true },
  play: async ({ canvas }) => {
    const email = canvas.getByLabelText("Work email")
    await expect(email).toHaveValue("jordan@example.com")
    await expect(email).toHaveAttribute("readonly")
    await userEvent.type(canvas.getByLabelText("Password"), "a long enough password")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toMatchObject({ email: "jordan@example.com" })
  }
})
