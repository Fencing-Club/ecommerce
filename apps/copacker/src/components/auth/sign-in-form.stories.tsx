import { expect, userEvent, waitFor } from "storybook/test"
import { finishSignIn } from "#.storybook/mocks/auth-navigation"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { errors } from "@/stories/fixtures/auth"
import { SignInForm } from "./sign-in-form"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/Auth/Sign in form",
  component: SignInForm,
  args: { next: "/orders" },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/orders")))
  }
})

export const Empty = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await expect(await canvas.findByText("Enter an email address")).toBeVisible()
    await expect(canvas.getByText("Enter your password")).toBeVisible()
    await expect(canvas.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
    await expect(sent).toHaveLength(0)
  }
})

export const InvalidEmail = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "alex@")
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await expect(await canvas.findByText("Enter an email address")).toBeVisible()
    await expect(canvas.queryByText("Enter your password")).toBeNull()
    await expect(sent).toHaveLength(0)
  }
})

// The forgot-password link carries the typed email over.
export const ForgotPasswordLink = meta.story({
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Forgot password?" })
    await expect(link).toHaveAttribute("href", "/forgot-password")
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await expect(link).toHaveAttribute("href", "/forgot-password?email=alex%40example.com")
  }
})

export const SignsIn = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(finishSignIn).toHaveBeenCalledWith("/orders"))
    await expect(sent).toEqual([
      {
        action: "auth.signIn",
        data: { email: "alex@example.com", password: "correct horse battery", next: "/orders" }
      }
    ])
    // The button keeps its spinner while the next page loads.
    await expect(canvas.getByRole("button", { name: "Sign in" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Sign in" })).toHaveAttribute("aria-busy", "true")
  }
})

export const WrongPassword = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.incorrectCredentials)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "wrong password")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.incorrectCredentials)
    await expect(finishSignIn).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: "Sign in" })).toBeEnabled()
    // What was typed stays for another try.
    await expect(canvas.getByLabelText("Email")).toHaveValue("alex@example.com")
  }
})

export const ShowPassword = meta.story({
  play: async ({ canvas }) => {
    const password = canvas.getByLabelText("Password")
    await userEvent.type(password, "correct horse")
    await expect(password).toHaveAttribute("type", "password")
    await userEvent.click(canvas.getByRole("button", { name: "Show password" }))
    await expect(password).toHaveAttribute("type", "text")
    await expect(canvas.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-pressed", "true")
  }
})

// An invitation's email, filled in and fixed.
export const LockedEmail = meta.story({
  args: { next: "/invite?token=inv_7Hq2kR9sLm4Xw8Zp3Tn6Vb&kind=team", email: "jordan@example.com", locked: true },
  play: async ({ canvas }) => {
    const email = canvas.getByLabelText("Email")
    await expect(email).toHaveValue("jordan@example.com")
    await expect(email).toHaveAttribute("readonly")
    await userEvent.type(email, "x")
    await expect(email).toHaveValue("jordan@example.com")
    await expect(canvas.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password?email=jordan%40example.com"
    )
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toMatchObject({
      email: "jordan@example.com",
      next: "/invite?token=inv_7Hq2kR9sLm4Xw8Zp3Tn6Vb&kind=team"
    })
  }
})
