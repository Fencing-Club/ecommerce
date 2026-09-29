import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"
import { openOrder, titleStatus } from "./orders"

test.use({ role: "buyer" })

async function openTab(page: Page, tab: string) {
  await page
    .getByRole("navigation", { name: "Shipment status" })
    .getByRole("link", { name: new RegExp(`^${tab}`) })
    .click()
}

// DEMO-1 is sent to Amazon; starting its shipment gives both workspaces' lists a shipment being packed. Starting it
// again opens the same one.
test("the buyer's and supplier's shipment lists show a shipment by status", async ({ page, pageFor }) => {
  test.setTimeout(120_000)
  await openOrder(page, "DEMO-1")
  await page.getByRole("button", { name: /^(Prepare next shipment|Continue packing)$/ }).click()
  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/)
  await expect(titleStatus(page)).toHaveText("Packing")
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("DEMO-1")

  await page.goto("/shipments")
  await expect(page.getByRole("heading", { level: 1, name: "Shipments" })).toBeVisible()
  for (const stat of ["Packing", "Action needed", "Ready for pickup"]) {
    await expect(page.getByText(stat, { exact: true }).first()).toBeVisible()
  }
  const row = page.getByRole("row", { name: /^DEMO-1 / })
  await expect(page.getByRole("link", { name: /^Active/ })).toHaveAttribute("aria-current", "page")
  await expect(row).toContainText("Demo supplier")
  await expect(row).toContainText("Amazon")
  await expect(row).toContainText("Packing")

  await openTab(page, "Received")
  await expect(page).toHaveURL(/\?view=received$/)
  await expect(row).toHaveCount(0)
  await openTab(page, "Canceled")
  await expect(page).toHaveURL(/\?view=cancelled$/)
  await expect(row).toHaveCount(0)
  await openTab(page, "All")
  await expect(page).toHaveURL(/\?view=all$/)
  await expect(row).toContainText("Packing")
  await row.getByRole("link", { name: "DEMO-1" }).click()
  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/)

  const supplier = await pageFor("supplier")
  await supplier.goto("/shipments")
  await expect(supplier.getByText("Waiting on buyer", { exact: true })).toBeVisible()
  const supplierRow = supplier.getByRole("row", { name: /^DEMO-1 / })
  await expect(supplierRow).toContainText("E2E Buyer")
  await expect(supplierRow).toContainText("Packing")
  await openTab(supplier, "Received")
  await expect(supplierRow).toHaveCount(0)
})

test("the supplier's orders filter by tab and search", async ({ pageFor }) => {
  const supplier = await pageFor("supplier")
  await supplier.goto("/orders")
  await expect(supplier.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible()
  const demo = supplier.getByRole("row", { name: /DEMO-1/ })
  await expect(demo).toContainText("E2E Buyer")
  // Drafts stay with the buyer until they're sent.
  await expect(supplier.getByRole("row", { name: /E2E-DRAFT/ })).toHaveCount(0)

  await supplier.getByRole("tab", { name: /^To pack/ }).click()
  await expect(demo).toBeVisible()
  await supplier.getByRole("tab", { name: /^Closed/ }).click()
  await expect(demo).toHaveCount(0)
  await supplier.getByRole("tab", { name: /^All/ }).click()

  const search = supplier.getByRole("searchbox", { name: "Search orders" })
  await search.fill("DEMO")
  await expect(demo).toBeVisible()
  await search.fill("no such order")
  await expect(supplier.getByText("No orders here")).toBeVisible()
  await search.fill("")
  await expect(demo).toBeVisible()
})
