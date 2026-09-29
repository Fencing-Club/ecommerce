import type { Page } from "@playwright/test"
import ExcelJS from "exceljs"
import { expect, test, unique } from "../fixtures"
import { csvFile, download, type UploadFile, xlsxRows } from "../support/files"
import { uniqueSku } from "./support"

test.use({ role: "supplier" })

const headers = [
  "Handle",
  "Title",
  "Status",
  "Category",
  "Product code",
  "Product URL",
  "Description",
  "Option 1 name",
  "Option 1 value",
  "Option 2 name",
  "Option 2 value",
  "Option 3 name",
  "Option 3 value",
  "Option 4 name",
  "Option 4 value",
  "SKU",
  "Currency",
  "Price",
  "Price per",
  "Units per pack",
  "Packs per case",
  "Track inventory",
  "On hand",
  "Continue selling",
  "Minimum quantity",
  "Maximum quantity",
  "Quantity increment",
  "Volume pricing",
  "Variant notes"
]

// A template row from the columns it fills; the rest stay blank.
function row(values: Record<string, string>) {
  return headers.map((header) => values[header] ?? "")
}

// Two products: a glove in Left and Right, and a single cord.
function catalog(tag: string) {
  const glove = unique(`E2E Import glove ${tag}`)
  const cord = unique(`E2E Import cord ${tag}`)
  const skus = [uniqueSku("IMP-L"), uniqueSku("IMP-R"), uniqueSku("IMP-C")]
  const gloveRow = (sku: string, hand: string) =>
    row({
      Handle: glove.toLowerCase().replaceAll(" ", "-"),
      Title: glove,
      "Option 1 name": "Hand",
      "Option 1 value": hand,
      SKU: sku,
      Price: "7.25",
      "Track inventory": "yes",
      "On hand": "30"
    })
  const rows = [
    gloveRow(skus[0]!, "Left"),
    gloveRow(skus[1]!, "Right"),
    row({ Handle: cord.toLowerCase().replaceAll(" ", "-"), Title: cord, SKU: skus[2]!, Price: "3.10" })
  ]
  return { glove, cord, skus, rows }
}

async function openImport(page: Page) {
  await page.goto("/products")
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: "Import products" }).click()
  const dialog = page.getByRole("dialog", { name: "Import products" })
  await expect(dialog).toBeVisible()
  return dialog
}

async function preview(page: Page, file: UploadFile) {
  const dialog = await openImport(page)
  await dialog.getByLabel("Product file").setInputFiles(file)
  await dialog.getByRole("button", { name: "Preview" }).click()
  return dialog
}

test("downloads the product template as Excel and CSV", async ({ page }) => {
  await page.goto("/products")
  await page.getByRole("button", { name: "More actions" }).click()
  const excel = await download(page, () => page.getByRole("menuitem", { name: "Download template" }).click())
  expect(excel.name).toBe("product-template.xlsx")
  const rows = await xlsxRows(excel.bytes)
  expect(rows[0]).toEqual(headers)
  expect(rows).toHaveLength(1)

  const dialog = await openImport(page)
  const csv = await download(page, () => dialog.getByRole("link", { name: "CSV template" }).click())
  expect(csv.name).toBe("product-template.csv")
  const lines = csv.bytes.toString("utf8").replace(/^﻿/, "").trim().split(/\r?\n/)
  expect(lines).toEqual([headers.join(",")])
})

test("imports a CSV, won't import the same file twice, and exports the products", async ({ page }) => {
  const { glove, cord, skus, rows } = catalog("csv")
  const file = csvFile("products.csv", [headers, ...rows])
  const dialog = await preview(page, file)
  await expect(dialog.getByText("New variants")).toBeVisible()
  const counts = dialog.locator("dl")
  await expect(counts).toContainText("New variants3")
  await expect(counts).toContainText("Updated variants0")
  await expect(dialog.getByRole("listitem").filter({ hasText: glove })).toContainText("2 variantsNew")
  await expect(dialog.getByRole("listitem").filter({ hasText: cord })).toContainText("1 variantNew")
  await dialog.getByRole("button", { name: "Import 3 variants" }).click()
  await expect(dialog).toBeHidden()

  const search = page.getByRole("searchbox", { name: "Search products" })
  await search.fill(glove)
  const gloveRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: glove, exact: true }) })
  await expect(gloveRow).toContainText("2 variants")
  await expect(gloveRow).toContainText("$7.25")
  await expect(gloveRow).toContainText("60 in stock")
  await search.fill(cord)
  await expect(page.getByRole("link", { name: cord, exact: true })).toBeVisible()

  // Once the cord's price changes here, the same file would change it back, but a file imports only once.
  await page.getByRole("link", { name: cord, exact: true }).click()
  const price = page.getByRole("textbox", { name: `Price for ${skus[2]}` })
  await price.fill("3.50")
  await price.blur()
  await page.getByRole("region", { name: "Unsaved changes" }).getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("region", { name: "Unsaved changes" })).toBeHidden()
  const again = await preview(page, file)
  await expect(again.locator("dl")).toContainText("Updated variants1")
  await again.getByRole("button", { name: "Import 1 variant" }).click()
  await expect(again.getByRole("alert")).toHaveText("You already imported this file.")
  await again.getByRole("button", { name: "Cancel" }).click()

  await page.getByRole("button", { name: "More actions" }).click()
  const excel = await download(page, () => page.getByRole("menuitem", { name: "Export to Excel" }).click())
  expect(excel.name).toMatch(/^products-\d{4}-\d{2}-\d{2}\.xlsx$/)
  const exported = await xlsxRows(excel.bytes)
  expect(exported[0]).toEqual(headers)
  const sku = headers.indexOf("SKU")
  const skuColumn = exported.map((cells) => cells[sku])
  for (const value of skus) {
    expect(skuColumn).toContain(value)
  }

  await page.getByRole("button", { name: "More actions" }).click()
  const csv = await download(page, () => page.getByRole("menuitem", { name: "Export to CSV" }).click())
  expect(csv.name).toMatch(/^products-\d{4}-\d{2}-\d{2}\.csv$/)
  const text = csv.bytes.toString("utf8")
  for (const value of skus) {
    expect(text).toContain(value)
  }
  expect(text).toContain(`${cord},active`)
})

test("says which row of a file is wrong", async ({ page }) => {
  const { rows } = catalog("bad")
  const badPrice = [rows[0]!, rows[1]!.map((cell, index) => (headers[index] === "Price" ? "7.255" : cell))]
  let dialog = await preview(page, csvFile("bad-price.csv", [headers, ...badPrice]))
  await expect(dialog.getByRole("alert")).toHaveText(
    "Row 3: Price must be an amount with up to 2 decimals, such as 12.50"
  )
  await expect(dialog.getByRole("button", { name: "Preview" })).toBeVisible()

  const twice = [rows[2]!, rows[2]!]
  await dialog.getByLabel("Product file").setInputFiles(csvFile("twice.csv", [headers, ...twice]))
  await dialog.getByRole("button", { name: "Preview" }).click()
  await expect(dialog.getByRole("alert")).toHaveText(
    `Row 3: SKU ${rows[2]![headers.indexOf("SKU")]} is in the file twice`
  )

  await dialog.getByLabel("Product file").setInputFiles({
    name: "products.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a template")
  })
  await dialog.getByRole("button", { name: "Preview" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Upload the product template as a CSV or Excel file of up to 5 MB")
  await dialog.getByRole("button", { name: "Cancel" }).click()
  dialog = page.getByRole("dialog", { name: "Import products" })
  await expect(dialog).toBeHidden()
})

test("imports an Excel file", async ({ page }) => {
  const { glove, cord, rows } = catalog("xlsx")
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("Products")
  sheet.addRow(headers)
  for (const cells of rows) {
    sheet.addRow(cells)
  }
  const file = {
    name: "products.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer())
  }
  const dialog = await preview(page, file)
  await expect(dialog.locator("dl")).toContainText("New variants3")
  await dialog.getByRole("button", { name: "Import 3 variants" }).click()
  await expect(dialog).toBeHidden()
  const search = page.getByRole("searchbox", { name: "Search products" })
  await search.fill(glove)
  await expect(page.getByRole("link", { name: glove, exact: true })).toBeVisible()
  await search.fill(cord)
  await expect(page.getByRole("link", { name: cord, exact: true })).toBeVisible()
})
