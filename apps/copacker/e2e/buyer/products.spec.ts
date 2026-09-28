import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"
import { pdfFile } from "../support/files"

test.use({ role: "buyer" })

const rowFor = (page: Page, product: string) =>
  page.getByRole("row").filter({ has: page.getByRole("button", { name: product, exact: true }) })

test.beforeEach(async ({ page }) => {
  await page.goto("/products")
  await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible()
})

test("lists the demo store's products with their stock", async ({ page }) => {
  for (const column of ["Product", "Available", "On hand", "Incoming", "On order"]) {
    await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible()
  }
  await expect(rowFor(page, "Body cord")).toContainText("body-cord")
  await expect(rowFor(page, "Gift card")).toContainText("Not tracked")
  await expect(rowFor(page, "Pro-grip glove 3-pack")).toContainText("DEMO-1")
  await expect(page.getByText("4 products, 5 variations")).toBeVisible()

  await page.getByRole("button", { name: "Show the 2 variations of Pro-grip glove" }).click()
  await expect(page.getByText("grip-left", { exact: true })).toBeVisible()
  await expect(page.getByText("grip-right", { exact: true })).toBeVisible()
})

test("searches products by name and SKU", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search products" })
  await search.fill("cord")
  await expect(rowFor(page, "Body cord")).toBeVisible()
  await expect(rowFor(page, "Gift card")).toBeHidden()
  await search.fill("gift-card")
  await expect(rowFor(page, "Gift card")).toBeVisible()
  await expect(rowFor(page, "Body cord")).toBeHidden()
  await search.fill("no product is called this")
  await expect(rowFor(page, "Body cord")).toBeHidden()
  await expect(rowFor(page, "Gift card")).toBeHidden()
})

test("lists the products without a supplier", async ({ page }) => {
  await page.getByRole("button", { name: /1 product has no supplier/ }).click()
  await expect(page.getByRole("checkbox", { name: "Select Body cord" })).toBeVisible()
  // Assigning Demo supplier would change Restock for the specs running beside this one, so the choice isn't saved.
  await page.getByRole("combobox", { name: "Supplier for the selected products" }).click()
  await expect(page.getByRole("option", { name: "Demo supplier" })).toBeVisible()
  await page.keyboard.press("Escape")
})

test("opens a product's settings", async ({ page }) => {
  await page.getByRole("button", { name: "More for Body cord" }).click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  const sheet = page.getByRole("dialog", { name: /Body cord/ })
  for (const heading of ["Purchasing", "Packing", "Labels"]) {
    await expect(sheet.getByText(heading, { exact: true }).first()).toBeVisible()
  }
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
})

test("uploads barcodes named after their SKUs", async ({ page }) => {
  await page.getByRole("button", { name: "Upload barcodes" }).click()
  const sheet = page.getByRole("dialog", { name: "Upload barcodes" })
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    sheet.getByRole("button", { name: "Choose barcode PDFs" }).click()
  ])
  await chooser.setFiles([
    await pdfFile("grip-left.pdf", ["grip-left"]),
    await pdfFile("body-cord.pdf", ["body-cord"]),
    await pdfFile("unknown-sku.pdf", ["unknown"])
  ])
  await expect(sheet.getByText("3 PDFs chosen")).toBeVisible()
  await sheet.getByRole("button", { name: "Upload 3 files" }).click()
  const results = sheet.getByRole("list", { name: "Upload results" })
  await expect(results.getByText(/(Saved|Replaced) for Pro-grip glove, Left/)).toBeVisible()
  await expect(results.getByText(/(Saved|Replaced) for Body cord/)).toBeVisible()
  // A file whose name matches no SKU asks for one.
  await expect(results.getByRole("textbox", { name: "SKU for unknown-sku.pdf" })).toBeVisible()
})
