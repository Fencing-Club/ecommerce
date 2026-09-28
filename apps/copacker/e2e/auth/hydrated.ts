import type { Page } from "@playwright/test"
import { expect } from "../fixtures"

// Waits until a sign-in page's form is live. A click before React takes over submits the form natively, as a GET that
// puts the password in the address, so the password field's show button is pressed (and left showing) to prove it.
export async function formReady(page: Page) {
  const toggle = page.getByRole("button", { name: "Show password" })
  await expect(async () => {
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click()
    }
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 500 })
  }).toPass()
}
