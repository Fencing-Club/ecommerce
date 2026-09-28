import { expect, test } from "../fixtures"

test.use({ role: "buyer" })

test.beforeEach(async ({ page }) => {
  await page.goto("/sales")
  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible()
})

test("lists the seeded Shopify orders newest first", { tag: "@mobile" }, async ({ page }) => {
  const orders = page.getByRole("table", { name: "Orders" })
  const newest = orders.getByRole("row").filter({ has: page.getByRole("link", { name: "#1999 (opens in Shopify)" }) })
  await expect(newest).toContainText("grip-left")
  await expect(newest.getByRole("link", { name: "#1999 (opens in Shopify)" })).toHaveAttribute(
    "href",
    /^https:\/\/admin\.shopify\.com\/store\/copacker-demo\/orders\//
  )
  await expect(page.getByRole("list", { name: "Sources" })).toContainText("Shopify")
  // One source, so there's no Source filter.
  await expect(page.getByRole("combobox", { name: "Source" })).toBeHidden()
})

test("pages through the orders", async ({ page }) => {
  const pages = page.getByRole("navigation", { name: "Order pages" })
  await expect(page.getByText("1–50 of 90")).toBeVisible()
  await expect(pages.getByRole("button", { name: "Previous" })).toBeDisabled()
  await pages.getByRole("button", { name: "Next" }).click()
  await expect(page.getByText("51–90 of 90")).toBeVisible()
  await expect(page.getByRole("link", { name: "#1910 (opens in Shopify)" })).toBeVisible()
  await expect(pages.getByRole("button", { name: "Next" })).toBeDisabled()
  await pages.getByRole("button", { name: "Previous" }).click()
  await expect(page.getByText("1–50 of 90")).toBeVisible()
  await expect(page.getByRole("link", { name: "#1999 (opens in Shopify)" })).toBeVisible()
})

test("searches by order name, product and SKU", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search orders" })
  const orders = page.getByRole("table", { name: "Orders" })

  await search.fill("#1998")
  await expect(orders.getByRole("link", { name: /opens in Shopify/ })).toHaveCount(1)
  await expect(orders.getByRole("link", { name: "#1998 (opens in Shopify)" })).toBeVisible()

  // Body cords sell every third day, or every sixth over the last month.
  await search.fill("body-cord")
  await expect(page.getByText(/^1–\d+ of \d+$/)).toBeVisible()
  await expect(orders.getByRole("link", { name: "#1999 (opens in Shopify)" })).toBeHidden()
  for (const row of await orders
    .getByRole("row")
    .filter({ has: page.getByRole("link") })
    .all()) {
    await expect(row).toContainText("Body cord")
  }

  await search.fill("Pro-grip glove")
  await expect(page.getByText("1–50 of 90")).toBeVisible()

  await search.fill("no order has this")
  await expect(page.getByText("No matching orders")).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Order pages" })).toBeHidden()
})

test("opens filtered from a link with a search", async ({ page }) => {
  await page.goto("/sales?q=%231990")
  await expect(page.getByRole("searchbox", { name: "Search orders" })).toHaveValue("#1990")
  await expect(page.getByRole("link", { name: "#1990 (opens in Shopify)" })).toBeVisible()
  await expect(page.getByText("1–1 of 1")).toBeVisible()
})
