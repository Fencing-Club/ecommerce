import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { SocialSignIn } from "./social-sign-in"

// Keeps a click on a provider in the story instead of leaving for it.
function stayOnPage() {
  const stay = (event: MouseEvent) => event.preventDefault()
  document.addEventListener("click", stay, true)
  return () => document.removeEventListener("click", stay, true)
}

const meta = preview.meta({
  title: "Components/Auth/Social sign in",
  component: SocialSignIn,
  args: { next: "/" },
  beforeEach: stayOnPage
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/login/google?next=%2F"
    )
    await expect(canvas.getByRole("button", { name: "Continue with Microsoft" })).toHaveAttribute(
      "href",
      "/login/microsoft?next=%2F"
    )
    await expect(canvas.getByText("or")).toBeVisible()
  }
})

// The page to return to, and an invitation's email to suggest, ride along to the provider.
export const WithEmail = meta.story({
  args: { next: "/invite?token=inv_7Hq2kR9sLm4Xw8Zp3Tn6Vb&kind=team", email: "jordan@example.com" },
  play: async ({ canvas }) => {
    const google = canvas.getByRole("button", { name: "Continue with Google" })
    const url = new URL(google.getAttribute("href") ?? "", "http://app.invalid")
    await expect(url.pathname).toBe("/login/google")
    await expect(url.searchParams.get("next")).toBe("/invite?token=inv_7Hq2kR9sLm4Xw8Zp3Tn6Vb&kind=team")
    await expect(url.searchParams.get("email")).toBe("jordan@example.com")
  }
})

// The chosen provider shows a spinner in place of its logo until the browser leaves.
export const Opening = meta.story({
  play: async ({ canvas }) => {
    const microsoft = canvas.getByRole("button", { name: "Continue with Microsoft" })
    const google = canvas.getByRole("button", { name: "Continue with Google" })
    await expect(microsoft.querySelector("[data-slot=spinner]")).toBeNull()
    await userEvent.click(microsoft)
    await expect(microsoft.querySelector("[data-slot=spinner]")).not.toBeNull()
    await expect(google.querySelector("[data-slot=spinner]")).toBeNull()
    await expect(microsoft).toHaveTextContent("Microsoft")
  }
})
