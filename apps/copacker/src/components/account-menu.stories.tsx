import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AccountMenu } from "./account-menu"

const meta = preview.meta({
  component: AccountMenu,
  args: { name: "Alex Rivera", email: "alex@example.com" }
})

// Who's signed in, their settings, the theme, and signing out.
export const Default = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Alex Rivera, account" })
    await expect(trigger).toHaveTextContent("AR")
    await userEvent.click(trigger)
    const menu = await screen.findByRole("menu")
    await expect(within(menu).getByText("alex@example.com")).toBeInTheDocument()
    await expect(within(menu).getByRole("menuitem", { name: "Account settings" })).toHaveAttribute("href", "/settings")
    const signOut = within(menu).getByRole("menuitem", { name: "Sign out" })
    await expect(signOut).toHaveAttribute("type", "submit")
    await expect(signOut).toHaveAttribute("form", "sign-out")
    const form = document.getElementById("sign-out")
    await expect(form).toHaveAttribute("action", "/logout")
    await expect(form).toHaveAttribute("method", "post")
  }
})

export const Theme = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Alex Rivera, account" }))
    const menu = await screen.findByRole("menu")
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Theme" }))
    const light = await screen.findByRole("menuitemradio", { name: "Light" })
    await expect(light).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
    await expect(localStorage.getItem("theme")).toBe("dark")
    // System follows the computer and forgets the choice.
    await userEvent.click(screen.getByRole("menuitemradio", { name: "System" }))
    await waitFor(() => expect(localStorage.getItem("theme")).toBeNull())
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Light" }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"))
  }
})

// Someone who hasn't given their name shows by their email.
export const WithoutName = meta.story({
  args: { name: "alex@example.com" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "alex@example.com, account" })).toHaveTextContent("A")
  }
})
