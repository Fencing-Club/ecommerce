import { expect, test } from "../fixtures"

// The form is checked but never sent: sending emails Copacker through Resend.
test.describe("contact page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact")
  })

  test("offers a topic for each kind of message", { tag: ["@smoke", "@mobile"] }, async ({ page }) => {
    await expect(page).toHaveTitle("Contact Copacker")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Talk to us.")
    const topics = page.getByRole("group", { name: "What’s it about?" })
    const names = ["Early access", "A walkthrough", "Support", "Partnerships", "Press", "Something else"]
    await expect(topics.getByRole("radio")).toHaveCount(names.length)
    for (const name of names) {
      await expect(topics.getByRole("radio", { name })).toBeAttached()
    }
    await expect(topics.getByRole("radio", { name: "Early access" })).toBeChecked()

    await topics.getByText("Press").click()
    await expect(topics.getByRole("radio", { name: "Press" })).toBeChecked()
    await expect(topics.getByRole("radio", { name: "Early access" })).not.toBeChecked()

    // Arrow keys move between the choices like any radio group.
    await page.keyboard.press("ArrowDown")
    await expect(topics.getByRole("radio", { name: "Something else" })).toBeChecked()
  })

  test("asks for a name, a valid email and a message", { tag: "@smoke" }, async ({ page }) => {
    const sent: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/api/contact")) {
        sent.push(request.url())
      }
    })
    const name = page.getByRole("textbox", { name: "Name" })
    const email = page.getByRole("textbox", { name: "Email" })
    const company = page.getByRole("textbox", { name: "Company" })
    const message = page.getByRole("textbox", { name: "Message" })
    await expect(name).toBeVisible()
    await expect(company).toBeVisible()

    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByText("Enter your name")).toBeVisible()
    await expect(page.getByText("Enter a valid email address")).toBeVisible()
    await expect(page.getByText("Write your message")).toBeVisible()
    await expect(name).toHaveAttribute("aria-invalid", "true")
    // Company is optional.
    await expect(company).not.toHaveAttribute("aria-invalid", "true")

    await name.fill("Casey Tester")
    await email.fill("casey@")
    await message.fill("Hello")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByText("Enter your name")).toBeHidden()
    await expect(page.getByText("Write your message")).toBeHidden()
    await expect(page.getByText("Enter a valid email address")).toBeVisible()
    await expect(email).toHaveAttribute("aria-invalid", "true")

    await message.fill("x".repeat(5001))
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByText("Keep it under 5,000 characters")).toBeVisible()

    await expect(page.getByRole("heading", { name: "Message sent." })).toBeHidden()
    expect(sent).toEqual([])
  })
})
