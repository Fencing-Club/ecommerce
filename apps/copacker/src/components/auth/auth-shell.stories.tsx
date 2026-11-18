import { Button } from "@buildkitgg/shadcn"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthPage, AuthShell, AuthSwitch } from "./auth-shell"

const meta = preview.meta({
  title: "Components/Auth/Auth shell",
  component: AuthShell,
  parameters: { layout: "fullscreen" },
  args: {
    children: (
      <AuthPage title="Sign in to Copacker" description="Pick up where you left off.">
        <Button className="h-10 w-full">Continue</Button>
        <AuthSwitch prompt="New to Copacker?" href="/signup">
          Create an account
        </AuthSwitch>
      </AuthPage>
    )
  }
})

// The product beside the form on a wide screen.
export const Desktop = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const panel = canvasElement.querySelector("aside")
    await expect(panel).toBeVisible()
    await expect(within(panel ?? canvasElement).getByText("Copacker")).toBeVisible()
    await expect(within(panel ?? canvasElement).getByText("Restock")).toBeInTheDocument()
    // The form column's own logo is for phones.
    await expect(canvasElement.querySelector("header")).not.toBeVisible()
    const main = canvas.getByRole("main")
    await expect(within(main).getByRole("heading", { level: 1, name: "Sign in to Copacker" })).toBeVisible()
    await expect(within(main).getByText("Pick up where you left off.")).toBeVisible()
    await expect(within(main).getByText("New to Copacker?")).toBeVisible()
    await expect(within(main).getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup")
  }
})

// A page without its line of context.
export const TitleOnly = meta.story({
  args: {
    children: (
      <AuthPage title="Choose a new password">
        <Button className="h-10 w-full">Save and sign in</Button>
      </AuthPage>
    )
  },
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", { level: 1, name: "Choose a new password" })
    await expect(heading).toBeVisible()
    await expect(heading.parentElement?.querySelector("p")).toBeNull()
  }
})
