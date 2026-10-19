import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Unsubscribe } from "./unsubscribe"

const email = "jordan@example.com"
const token = "c2lnbmVkLWZvci1qb3JkYW4"

// What the button posts, caught before the browser leaves the page with it.
const posted = fn()
function catchPost(form: HTMLFormElement) {
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault()
      posted(form.method, form.getAttribute("action"), Object.fromEntries(new FormData(form)))
    },
    { once: true }
  )
}

const meta = preview.meta({
  title: "Components/Marketing/Unsubscribe",
  component: Unsubscribe,
  args: { email, token, state: "confirm" as const },
  parameters: { layout: "fullscreen" }
})

export const Confirm = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Unsubscribe from Copacker’s emails?")
    await expect(canvas.getByText(`${email} will stop getting waitlist updates and product news.`)).toBeVisible()
    // It asks first, since mail scanners open links on their own, and the button posts the link's address and signature.
    const button = canvas.getByRole("button", { name: "Unsubscribe" })
    const form = button.closest("form")
    if (!form) {
      throw new Error("The button is in its form")
    }
    catchPost(form)
    await userEvent.click(button)
    await expect(posted).toHaveBeenCalledWith("post", "/api/mailing-list/unsubscribe", { email, token, from: "page" })
  }
})

export const Done = meta.story({
  args: { state: "done" as const },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("You’re unsubscribed.")
    await expect(canvas.getByText(`We won’t email ${email} about the waitlist or product news again.`)).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Unsubscribe" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "Back to Copacker" })).toHaveAttribute("href", "/")
  }
})

// The post didn't go through, so it asks again.
export const Failed = meta.story({
  args: { state: "failed" as const },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Unsubscribe from Copacker’s emails?")
    await expect(canvas.getByText("Couldn’t unsubscribe you. Try again in a moment.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Unsubscribe" })).toBeEnabled()
  }
})

export const Invalid = meta.story({
  args: { email: "", token: "", state: "invalid" as const },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("This link doesn’t work.")
    await expect(canvas.getByText("Open the unsubscribe link in your email again.")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Unsubscribe" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "Back to Copacker" })).toBeVisible()
  }
})
