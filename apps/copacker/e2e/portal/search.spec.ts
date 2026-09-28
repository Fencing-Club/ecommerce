import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"

test.use({ role: "buyer" })

// Opens the search panel with Ctrl+K and types into it.
async function search(page: Page, text: string) {
  await page.keyboard.press("ControlOrMeta+k")
  const panel = page.getByRole("dialog", { name: "Search" })
  await expect(panel).toBeVisible()
  await panel.getByRole("combobox").fill(text)
  return panel
}

test.beforeEach(async ({ page }) => {
  await page.goto("/overview")
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
})

test("Ctrl+K opens search and Enter opens a page", async ({ page }) => {
  const panel = await search(page, "")
  // Before anything is typed, the pages and the newest purchase orders show.
  await expect(panel.getByRole("group", { name: "Pages" }).getByRole("option")).toHaveCount(8)
  await expect(panel.getByRole("group", { name: "Recent purchase orders" })).toBeVisible()

  await panel.getByRole("combobox").fill("partn")
  const partners = panel.getByRole("group", { name: "Pages" }).getByRole("option", { name: "Partners" })
  await expect(partners).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/partners$/)
  await expect(panel).toBeHidden()
})

test("the Search button opens the panel and Escape closes it", async ({ page }) => {
  await page.getByRole("button", { name: "Search" }).click()
  const panel = page.getByRole("dialog", { name: "Search" })
  await expect(panel.getByRole("combobox")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
})

test("arrow keys move through the results", async ({ page }) => {
  const panel = await search(page, "")
  const options = panel.getByRole("group", { name: "Pages" }).getByRole("option")
  await expect(options.first()).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect(options.nth(2)).toHaveAttribute("aria-selected", "true")
  await expect(options.first()).toHaveAttribute("aria-selected", "false")
  const name = (await options.nth(2).textContent()) ?? ""
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible()
})

test("finds a purchase order by reference", async ({ page }) => {
  const panel = await search(page, "E2E-DRAFT")
  const orders = panel.getByRole("group", { name: "Purchase orders" })
  await expect(orders.getByRole("option", { name: /E2E-DRAFT/ })).toBeVisible()

  await panel.getByRole("combobox").fill("DEMO-1")
  const demo = orders.getByRole("option", { name: /DEMO-1/ })
  await expect(demo).toBeVisible()
  await demo.click()
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("DEMO-1")
})

test("finds a product", async ({ page }) => {
  const panel = await search(page, "Pro-grip glove")
  const product = panel.getByRole("group", { name: "Products" }).getByRole("option", { name: "Pro-grip glove" }).first()
  await expect(product).toBeVisible()
  await product.click()
  await expect(page).toHaveURL(/\/products\?q=Pro-grip(\+|%20)glove/)
})

test("finds a partner", async ({ page }) => {
  const panel = await search(page, "Demo supplier")
  const partner = panel.getByRole("group", { name: "Partners" }).getByRole("option", { name: /Demo supplier/ })
  await expect(partner).toContainText("Supplier")
  await partner.click()
  await expect(page).toHaveURL(/\/partners\?q=Demo(\+|%20)supplier$/)
})

test("says when nothing matches", async ({ page }) => {
  const panel = await search(page, "zqxjv nothing matches")
  await expect(panel.getByText("No results for “zqxjv nothing matches”")).toBeVisible()
  await expect(panel.getByRole("option")).toHaveCount(0)
})
