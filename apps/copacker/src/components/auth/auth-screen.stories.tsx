import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { skipAnimations } from "@/stories/fixtures/auth"
import { AuthScreen } from "./auth-screen"

const meta = preview.meta({ component: AuthScreen, beforeEach: () => skipAnimations() })
export const SignIn = meta.story({
  args: { page: { kind: "login", next: "/orders", failed: true } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Sign in to Copacker" })).toBeVisible()
    await expect(canvas.getByRole("alert")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?next=%2Forders"
    )
  }
})
export const IncompleteReset = meta.story({
  args: { page: { kind: "reset-password" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "This link is incomplete" })).toBeVisible()
    await expect(canvas.queryByLabelText("New password")).toBeNull()
  }
})
