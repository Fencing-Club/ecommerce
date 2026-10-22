import { expect, test } from "../fixtures"

test.describe("landing page", () => {
  test("shows the hero and links to the waitlist", { tag: ["@smoke", "@mobile"] }, async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle("Copacker: Restocking, handled")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Restocking, handled.")
    await page.getByRole("button", { name: "Join the waitlist" }).first().click()
    await expect(page).toHaveURL(/\/#waitlist$/)
    await expect(page.getByRole("heading", { name: "Get early access." })).toBeInViewport()
  })

  test("nav and footer lead to Contact, Privacy and Terms", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Main" })
    for (const section of ["Forecast", "Handoffs", "Agents", "FAQ"]) {
      await expect(nav.getByRole("link", { name: section })).toBeVisible()
    }
    await nav.getByRole("link", { name: "FAQ" }).click()
    await expect(page).toHaveURL(/\/#faq$/)
    await expect(page.getByRole("heading", { name: "Questions" })).toBeInViewport()

    await nav.getByRole("link", { name: "Contact" }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Talk to us.")

    const company = page.getByRole("navigation", { name: "Company" })
    await company.getByRole("link", { name: "Privacy" }).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy")

    await company.getByRole("link", { name: "Terms" }).click()
    await expect(page).toHaveURL(/\/terms$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of service")
  })

  test("FAQ answers open and close independently", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/#faq")
    const cost = page.getByRole("button", { name: "What does Copacker cost?" })
    const stores = page.getByRole("button", { name: "Which stores does it work with?" })
    const costAnswer = page.getByText("Nothing during early access.")
    const storesAnswer = page.getByText("Amazon, Shopify and eBay. Copacker reads your sales and stock from each.")

    // All closed to start.
    await expect(cost).toHaveAttribute("aria-expanded", "false")
    await expect(costAnswer).toBeHidden()

    await cost.click()
    await expect(cost).toHaveAttribute("aria-expanded", "true")
    await expect(costAnswer).toBeVisible()

    // Several can be open at once.
    await stores.click()
    await expect(storesAnswer).toBeVisible()
    await expect(costAnswer).toBeVisible()

    await cost.click()
    await expect(cost).toHaveAttribute("aria-expanded", "false")
    await expect(costAnswer).toBeHidden()
    await expect(storesAnswer).toBeVisible()

    // The keyboard opens one too.
    await cost.focus()
    await page.keyboard.press("Enter")
    await expect(costAnswer).toBeVisible()
  })

  test("the waitlist turns down an email that isn't one", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/#waitlist")
    const signups: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/api/mailing-list")) {
        signups.push(request.url())
      }
    })
    const email = page.getByRole("textbox", { name: "Email" })
    const join = page.getByRole("button", { name: "Join", exact: true })

    // Empty, then malformed: the browser's own check stops the form before anything is sent.
    await join.click()
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
    await email.fill("not-an-email")
    await join.click()
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true)
    expect(await email.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe("")
    await expect(page.getByText("You’re on the waitlist.")).toBeHidden()
    expect(signups).toEqual([])
  })

  test("the waitlist endpoint turns down a malformed email", { tag: "@smoke" }, async ({ request, baseURL }) => {
    // The page's own form sends its origin; a request without one is refused before the email is read.
    const response = await request.post("/api/mailing-list", {
      data: { email: "not-an-email" },
      headers: { Origin: new URL(baseURL ?? "http://127.0.0.1").origin }
    })
    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ error: "Enter a valid email address." })
  })
})
