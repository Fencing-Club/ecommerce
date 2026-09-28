import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"

test.use({ role: "buyer" })

// A day as "YYYY-MM-DD" in the store's time zone, which follows the browser's (Los Angeles in playwright.config.ts).
function dayAgo(days: number) {
  const date = new Date(Date.now() - days * 86400000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(date)
}

const salesByDay = (page: Page) => page.getByRole("table", { name: "Sales by day" })

test.beforeEach(async ({ page }) => {
  await page.goto("/overview")
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible()
})

test("shows sales figures from the seeded Shopify orders", { tag: "@mobile" }, async ({ page }) => {
  const kpis = page.getByRole("region", { name: "Sales, Last 30 days" })
  for (const label of ["Sales", "Orders", "Average order value", "Units sold", "Gross profit"]) {
    await expect(kpis.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(kpis.getByText("No orders synced")).toBeHidden()
  await expect(page.getByRole("region", { name: "Sales" }).getByText("Sales trend")).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Purchasing" }).getByRole("cell", { name: "Demo supplier" })
  ).toBeVisible()
  await expect(
    page
      .getByRole("region", { name: /^Products/ })
      .getByRole("link", { name: "Pro-grip glove" })
      .first()
  ).toBeVisible()
  // The demo store has one location of its own, so there's no channel filter.
  await expect(page.getByRole("combobox", { name: "Channel" })).toBeHidden()
})

test("switches the sales chart between sales, orders and units", async ({ page }) => {
  const measure = page.getByRole("group", { name: "Measure" })
  await expect(measure.getByRole("button", { name: "Sales" })).toHaveAttribute("aria-pressed", "true")
  await measure.getByRole("button", { name: "Orders" }).click()
  await expect(measure.getByRole("button", { name: "Orders" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("table", { name: "Orders by day" })).toBeAttached()
  await measure.getByRole("button", { name: "Units" }).click()
  await expect(page.getByRole("table", { name: "Units sold by day" })).toBeAttached()
})

test("picks a preset period", async ({ page }) => {
  await page.getByRole("button", { name: "Last 30 days" }).click()
  const picker = page.getByRole("dialog", { name: "Choose a period" })
  await picker.getByRole("button", { name: "Last", exact: true }).click()
  await picker.getByRole("button", { name: "Last 7 days" }).click()
  await picker.getByRole("button", { name: "Apply" }).click()
  await expect(page).toHaveURL(/period=last7/)
  await expect(page.getByRole("region", { name: "Sales, Last 7 days" })).toBeVisible()
  await expect(salesByDay(page).getByRole("rowheader")).toHaveCount(7)

  // Cancel keeps the period.
  await page.getByRole("button", { name: "Last 7 days" }).click()
  await picker.getByRole("button", { name: "Yesterday" }).click()
  await picker.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("button", { name: "Last 7 days" })).toBeVisible()
})

test("picks a custom range of days", async ({ page }) => {
  const from = dayAgo(20)
  const to = dayAgo(11)
  await page.getByRole("button", { name: "Last 30 days" }).click()
  const picker = page.getByRole("dialog", { name: "Choose a period" })
  await picker.getByRole("button", { name: "Custom range" }).click()
  await picker.getByLabel("Start date").fill(from)
  await picker.getByLabel("End date").fill(to)
  await picker.getByRole("button", { name: "Apply" }).click()
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}`))
  await expect(salesByDay(page).getByRole("rowheader")).toHaveCount(10)
})

test("setup checklist and attention items link where they say", async ({ page }) => {
  await expect(page.getByText("Finish setting up")).toBeVisible()
  await expect(page.getByRole("listitem").filter({ hasText: "Connect Shopify" })).toContainText("Done")
  const amazon = page.getByRole("link", { name: /^Connect Amazon/ })
  await expect(amazon).toHaveAttribute("href", "/settings#integrations")
  await amazon.click()
  await expect(page).toHaveURL(/\/settings#integrations$/)
  await expect(page.getByRole("heading", { name: "Integrations", level: 2 })).toBeVisible()

  await page.goto("/overview")
  await page.getByRole("link", { name: /purchase orders are still drafts/ }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole("heading", { name: "Purchase orders", level: 1 })).toBeVisible()
})
