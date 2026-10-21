import { expect, test } from "../fixtures"

test.use({ role: "buyer" })

test.beforeEach(async ({ page }) => {
  // The session file carries localStorage from test to test, so a supplier or sort an earlier test (or a failed
  // attempt of this one) chose would otherwise still be selected.
  await page.addInitScript(() => {
    for (const key of ["restock-channel", "restock-supplier", "restock-sort"]) {
      localStorage.removeItem(key)
    }
  })
  await page.goto("/restock")
  await expect(page.getByRole("heading", { name: "Restock", level: 1 })).toBeVisible()
})

test("groups the gloves under Demo supplier", async ({ page }) => {
  const demo = page.getByRole("region", { name: "Demo supplier" })
  await expect(demo.getByRole("heading", { name: "Demo supplier" })).toBeVisible()
  await expect(demo.getByText("2 products")).toBeVisible()
  await expect(demo.getByRole("button", { name: "Reorder" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Restock location" })).toHaveText(/Warehouse/)
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveText(/Most urgent/)
})

test("filters by supplier and searches products", async ({ page }) => {
  const supplier = page.getByRole("combobox", { name: "Supplier" })
  await expect(supplier).toHaveText(/All suppliers/)
  await supplier.click()
  // The report reloads for the supplier after a pause, replacing the search box; typing before then is lost.
  const reloaded = page.waitForResponse(
    (response) => response.url().endsWith("/restock/plan") && response.request().postDataJSON()?.supplier !== "all"
  )
  await page.getByRole("option", { name: "Demo supplier" }).click()
  await reloaded
  await expect(supplier).toHaveText(/Demo supplier/)
  await expect(page.getByRole("region", { name: "Demo supplier" })).toBeVisible()

  const search = page.getByRole("searchbox", { name: "Search products" })
  await search.fill("no product is called this")
  await expect(page.getByText("No products match")).toBeVisible()
  await search.fill("grip-right")
  await expect(page.getByRole("region", { name: "Demo supplier" })).toBeVisible()
})

test("opens a supplier's products, sorts them and shows those with enough stock", async ({ page }) => {
  const demo = page.getByRole("region", { name: "Demo supplier" })
  // One supplier group, so there's no Collapse all; its heading opens and closes it.
  await expect(page.getByRole("button", { name: /^(Collapse|Expand) all$/ })).toBeHidden()
  await demo.getByRole("button", { name: "Demo supplier" }).click()
  await expect(demo.getByText("Pro-grip glove").first()).toBeVisible()

  const sort = page.getByRole("combobox", { name: "Sort by" })
  for (const option of ["Largest order", "Product name", "Most urgent"]) {
    await sort.click()
    await page.getByRole("option", { name: option }).click()
    await expect(sort).toHaveText(new RegExp(option))
    await expect(demo.getByText("Pro-grip glove").first()).toBeVisible()
  }

  const enough = page.getByRole("checkbox", { name: "Show products with enough stock" })
  await enough.check()
  await expect(enough).toBeChecked()
  await expect(page.getByText(/\d+ to reorder, \d+ (has|have) enough stock/)).toBeVisible()

  await demo.getByRole("button", { name: "Demo supplier" }).click()
  await expect(demo.getByText("Pro-grip glove")).toBeHidden()
})

test("recalculates for another sales period and lead time", async ({ page }) => {
  const demo = page.getByRole("region", { name: "Demo supplier" })
  const lead = page.getByRole("spinbutton", { name: "Lead time" })
  await lead.fill("120")
  await lead.press("Tab")
  await expect(demo.getByText(/Lead time 120 days/)).toBeVisible()

  const sales = page.getByRole("spinbutton", { name: "Sales period" })
  await sales.fill("7")
  await sales.press("Tab")
  await expect(sales).toHaveValue("7")
  await expect(demo.getByText(/Lead time 120 days/)).toBeVisible()
})

test("Reorder starts a purchase order with the supplier's products", async ({ page }) => {
  await page.getByRole("region", { name: "Demo supplier" }).getByRole("button", { name: "Reorder" }).click()
  // The builder looks the products up in Shopify, which the demo store can't answer, so only the prefilled link is
  // checked and nothing is saved.
  await expect(page).toHaveURL(/\/orders\/new\?/)
  const url = new URL(page.url())
  expect(url.searchParams.getAll("variant")).toEqual(
    expect.arrayContaining([expect.stringMatching(/^gid:\/\/shopify\/ProductVariant\/1@\d+$/)])
  )
  expect(url.searchParams.get("destination")).toBe("warehouse")
  expect(url.searchParams.get("supplierId")).toBeTruthy()
})
