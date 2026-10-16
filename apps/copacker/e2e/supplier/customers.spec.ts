import type { Page } from "@playwright/test"
import { e2eEmail, expect, test, unique } from "../fixtures"
import { createCatalog, deleteCatalog, withCustomer } from "./support"

test.use({ role: "supplier" })

const buyerRow = (page: Page) =>
  page.getByRole("row").filter({ has: page.getByRole("link", { name: "E2E Buyer", exact: true }) })

test("lists E2E Buyer, with search and the open orders tab", async ({ page }) => {
  await page.goto("/customers")
  await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible()
  for (const name of ["Customer", "Catalog", "Orders", "Last order", "Amount spent"]) {
    await expect(page.getByRole("columnheader", { name })).toBeVisible()
  }
  await expect(buyerRow(page).getByRole("combobox", { name: "Catalog for E2E Buyer" })).toBeVisible()

  const search = page.getByRole("searchbox", { name: "Search customers" })
  await search.fill("e2e buy")
  await expect(buyerRow(page)).toBeVisible()
  await search.fill("No such customer")
  await expect(page.getByText("No customers here")).toBeVisible()
  await search.fill("")

  // E2E Buyer's DEMO-1 purchase order is still open.
  await page.getByRole("tab", { name: /^With open orders/ }).click()
  await expect(buyerRow(page)).toContainText(/\d+ open/)
})

test("shows a customer's stats and contact", async ({ page }) => {
  await page.goto("/customers")
  await buyerRow(page).getByRole("link", { name: "E2E Buyer" }).click()
  await expect(page.getByRole("heading", { name: "E2E Buyer", level: 1 })).toBeVisible()
  for (const label of ["Amount spent", "Orders", "Customer since"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByRole("link", { name: e2eEmail })).toHaveAttribute("href", `mailto:${e2eEmail}`)
  await expect(page.getByRole("link", { name: /206/ })).toHaveAttribute("href", /^tel:/)
})

test("assigns a catalog to a customer and takes it away", async ({ page }) => {
  test.slow()
  const title = unique("E2E Customer catalog")
  const id = await createCatalog(page, { title })
  try {
    await withCustomer(async () => {
      await page.goto("/customers")
      await buyerRow(page).getByRole("link", { name: "E2E Buyer" }).click()
      const picker = page.getByRole("combobox", { name: "Catalog for E2E Buyer" })
      // The page can still be settling when the menu opens, which closes it, so choosing retries.
      const choose = (option: string | RegExp) =>
        expect(async () => {
          await picker.click({ timeout: 3000 })
          await page.getByRole("option", { name: option }).click({ timeout: 3000 })
        }).toPass({ timeout: 30_000 })
      await choose(`${title} (draft)`)
      const open = page.getByRole("link", { name: `Open ${title}` })
      await expect(open).toBeVisible()
      await page.reload()
      await expect(picker).toContainText(`${title} (draft)`)
      await open.click()
      await expect(page).toHaveURL(new RegExp(`/catalogs/${id}$`))
      await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible()
      await expect(page.getByText("E2E Buyer", { exact: true })).toBeVisible()

      await page.goBack()
      await expect(picker).toContainText(`${title} (draft)`)
      await choose(/^No catalog/)
      await expect(picker).toContainText("No catalog")
      // The hint shows under the select as well as in it.
      await expect(page.getByText("All products at list prices")).toHaveCount(2)
      await expect(open).toBeHidden()
      await page.reload()
      await expect(picker).toContainText("No catalog")
    })
  } finally {
    await deleteCatalog(page, id)
  }
})
