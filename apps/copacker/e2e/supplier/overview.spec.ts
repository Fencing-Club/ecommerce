import { expect, test, unique } from "../fixtures"
import { createCatalog, createProduct, deleteCatalog, uniqueSku } from "./support"

test.use({ role: "supplier" })

test("shows the supplier's figures and cards", { tag: "@mobile" }, async ({ page }) => {
  await page.goto("/overview")
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible()
  for (const label of ["Orders received", "Order value", "Units ordered", "Units shipped"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }
  for (const title of ["Open orders", "Top products", "Top customers", "Inventory health", "Recent orders"]) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
  }
})

// "View orders" needs an order to pack or ship, which only the purchase order journeys make.
test("links each task to the list that has it", async ({ page }) => {
  const title = unique("E2E Overview")
  const short = uniqueSku("OVW-S")
  await createProduct(page, { title: `${title} short`, variants: [{ sku: short, price: 5, track: true, onHand: -4 }] })
  await createProduct(page, { title: `${title} unpriced`, variants: [{ sku: uniqueSku("OVW-U") }] })
  // With a catalog to give it, a customer without an active one is a task. Drafts don't count.
  const catalog = await createCatalog(page, { title: `${title} catalog` })
  try {
    await page.goto("/overview")
    await expect(page.getByRole("link", { name: /variants? (is|are) short/ })).toContainText("View inventory")
    await page.getByRole("link", { name: /variants? (is|are) short/ }).click()
    await expect(page).toHaveURL(/\/inventory\?tab=short$/)
    await expect(page.getByRole("tab", { name: /^Short/ })).toHaveAttribute("aria-selected", "true")
    await page.getByRole("searchbox", { name: "Search by product or SKU" }).fill(short)
    await expect(page.getByRole("cell", { name: short, exact: true })).toBeVisible()

    await page.goto("/overview")
    await page.getByRole("link", { name: /without a price/ }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible()

    await page.goto("/overview")
    await expect(page.getByRole("link", { name: /without a catalog/ })).toContainText("View customers")
    await page.getByRole("link", { name: /without a catalog/ }).click()
    await expect(page).toHaveURL(/\/customers$/)
    await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible()
  } finally {
    await deleteCatalog(page, catalog)
  }
})
