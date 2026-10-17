import { zodResolver } from "@hookform/resolvers/zod"
import { Link } from "@tanstack/react-router"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { newPasswordSchema, signInSchema } from "@/lib/sign-in"
import { PasswordField } from "./password-field"

const currentSchema = signInSchema.pick({ password: true })
const newSchema = z.object({ password: newPasswordSchema })

// The field inside a form of its own, checked as the sign-in pages check it.
function PasswordForm({
  isNew = false,
  action,
  onSubmit
}: {
  isNew?: boolean
  action?: React.ReactNode
  onSubmit: (values: { password: string }) => void
}) {
  const form = useForm({ resolver: zodResolver(isNew ? newSchema : currentSchema), defaultValues: { password: "" } })
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex max-w-sm flex-col gap-4">
        <PasswordField
          name="password"
          label={isNew ? "New password" : "Password"}
          autoComplete={isNew ? "new-password" : "current-password"}
          action={action}
          isNew={isNew}
        />
        <Button type="submit">Save</Button>
      </form>
    </FormProvider>
  )
}

const meta = preview.meta({
  component: PasswordForm,
  args: { onSubmit: fn() }
})

export const Current = meta.story({
  play: async ({ canvas, args }) => {
    const password = canvas.getByLabelText("Password")
    await expect(password).toHaveAttribute("type", "password")
    await expect(password).toHaveAttribute("autocomplete", "current-password")
    await expect(canvas.queryByText("At least 10 characters")).toBeNull()
    await userEvent.type(password, "secret")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledWith({ password: "secret" }, expect.anything()))
  }
})

// The eye button shows the password as text and hides it again.
export const ShowAndHide = meta.story({
  play: async ({ canvas }) => {
    const password = canvas.getByLabelText("Password")
    const toggle = canvas.getByRole("button", { name: "Show password" })
    await userEvent.type(password, "secret")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(toggle)
    await expect(password).toHaveAttribute("type", "text")
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await expect(password).toHaveValue("secret")
    await userEvent.click(toggle)
    await expect(password).toHaveAttribute("type", "password")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
  }
})

export const Required = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Enter your password")).toBeVisible()
    await expect(canvas.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true")
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

// A new password states the rule and ticks it once met.
export const NewPassword = meta.story({
  args: { isNew: true },
  play: async ({ canvas }) => {
    const password = canvas.getByLabelText("New password")
    const rule = canvas.getByText("At least 10 characters")
    await expect(password).toHaveAttribute("autocomplete", "new-password")
    await expect(password).toHaveAccessibleDescription("At least 10 characters")
    await expect(rule).toHaveClass("text-muted-foreground")
    await userEvent.type(password, "abcdefghij")
    await expect(rule).toHaveClass("text-success")
    await userEvent.clear(password)
    await expect(rule).toHaveClass("text-muted-foreground")
  }
})

// Too short: the error takes the rule's place until the password is fixed.
export const TooShort = meta.story({
  args: { isNew: true },
  play: async ({ canvas, args }) => {
    const password = canvas.getByLabelText("New password")
    await userEvent.type(password, "short")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Use at least 10 characters")).toBeVisible()
    await expect(canvas.queryByText("At least 10 characters")).toBeNull()
    await expect(args.onSubmit).not.toHaveBeenCalled()
    await userEvent.type(password, " and longer")
    await expect(await canvas.findByText("At least 10 characters")).toBeVisible()
    await expect(canvas.queryByText("Use at least 10 characters")).toBeNull()
  }
})

export const WithAction = meta.story({
  args: {
    action: (
      <Link to="/forgot-password" className="text-sm">
        Forgot password?
      </Link>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password")
  }
})
